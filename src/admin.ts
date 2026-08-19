import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  createSessionToken,
  readSessionCookie,
  sessionCookieName,
  sessionCookieOptions,
  verifySessionToken,
} from "./admin-auth.ts";
import { ADMIN_PAGE_HTML } from "./admin-page.ts";
import { complete, listModels } from "./cursor-backend.ts";
import { normalizeBody } from "./normalize.ts";
import { authorize, type Config } from "./config.ts";
import type { ConfigStore, SettingsUpdate } from "./config-store.ts";
import { isNoLogPolicy } from "./logging.ts";
import { proxyAuthEnabled } from "./proxy-api-keys.ts";
import { listRequestLog, recordRequest } from "./request-log.ts";
import { AVAILABLE_TOOLS, toolsPolicyToView } from "./tools-policy.ts";
import { listKeyUsageSnapshots } from "./usage-meter.ts";
import { usageStorePath } from "./usage-store.ts";

interface LoginBody {
  username?: string;
  password?: string;
}

interface ChatTestBody {
  model?: string;
  message?: string;
  stream?: boolean;
  fast?: boolean;
  model_speed?: string;
  reasoning_effort?: string;
}

function adminEnabled(config: Config): boolean {
  return Boolean(config.adminPassword);
}

function sessionSecret(config: Config): string {
  return config.adminPassword ?? "";
}

function getSession(request: FastifyRequest, config: Config) {
  const token = readSessionCookie(request.headers.cookie);
  return verifySessionToken(token, sessionSecret(config));
}

function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
  configStore: ConfigStore,
): boolean {
  const config = configStore.get();
  if (!adminEnabled(config)) {
    void reply.code(404).send({ error: "Admin UI is disabled" });
    return false;
  }
  if (!getSession(request, config)) {
    void reply.code(401).send({ error: "Unauthorized" });
    return false;
  }
  return true;
}

function setSessionCookie(reply: FastifyReply, token: string, secure: boolean) {
  const parts = [
    `${sessionCookieName()}=${encodeURIComponent(token)}`,
    "Path=/admin",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${sessionCookieOptions(secure).maxAge}`,
  ];
  if (secure) parts.push("Secure");
  reply.header("Set-Cookie", parts.join("; "));
}

function clearSessionCookie(reply: FastifyReply) {
  reply.header(
    "Set-Cookie",
    `${sessionCookieName()}=; Path=/admin; HttpOnly; SameSite=Lax; Max-Age=0`,
  );
}

function publicBaseUrl(request: FastifyRequest): string {
  const forwardedProto = request.headers["x-forwarded-proto"];
  const proto =
    typeof forwardedProto === "string"
      ? forwardedProto.split(",")[0]?.trim()
      : request.protocol;
  const host = request.headers.host ?? "localhost";
  return `${proto}://${host}`;
}

function toolsPolicyLabel(config: Config): string | string[] {
  const view = toolsPolicyToView(config.toolsPolicy);
  if (view.mode === "custom") return view.tools;
  return view.mode;
}

export function registerAdminRoutes(
  app: FastifyInstance,
  configStore: ConfigStore,
) {
  app.get("/admin", async (_request, reply) => {
    const config = configStore.get();
    if (!adminEnabled(config)) {
      return reply.code(404).type("text/plain").send("Admin UI is disabled. Set ADMIN_PASSWORD.");
    }
    return reply.type("text/html; charset=utf-8").send(ADMIN_PAGE_HTML);
  });

  app.get("/admin/api/session", async (request, reply) => {
    const config = configStore.get();
    if (!adminEnabled(config)) {
      return reply.code(404).send({ authenticated: false });
    }
    const session = getSession(request, config);
    return { authenticated: Boolean(session), username: session?.username ?? null };
  });

  app.post("/admin/api/login", async (request, reply) => {
    const config = configStore.get();
    if (!adminEnabled(config)) {
      return reply.code(404).send({ error: "Admin UI is disabled" });
    }

    const body = (request.body ?? {}) as LoginBody;
    const username = body.username?.trim() ?? "";
    const password = body.password ?? "";

    if (username !== config.adminUsername || password !== config.adminPassword) {
      return reply.code(401).send({ error: "Invalid credentials" });
    }

    const token = createSessionToken(username, sessionSecret(config));
    const secure = publicBaseUrl(request).startsWith("https://");
    setSessionCookie(reply, token, secure);
    return { ok: true, username };
  });

  app.post("/admin/api/logout", async (_request, reply) => {
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.get("/admin/api/status", async (request, reply) => {
    if (!requireAdmin(request, reply, configStore)) return;

    const config = configStore.get();
    const base = publicBaseUrl(request);
    const noLog = isNoLogPolicy(config.logPolicy);
    return {
      healthy: true,
      loggingPolicy: config.logPolicy,
      host: config.host,
      port: config.port,
      runtime: config.runtime,
      cwd: config.cwd,
      defaultModel: config.defaultModel,
      toolsPolicy: toolsPolicyLabel(config),
      adminUsername: config.adminUsername,
      restAuthMode: proxyAuthEnabled(config.proxyApiKeys) ? "proxy-key" : "cursor-key-or-open",
      proxyApiKeyCount: config.proxyApiKeys.filter((key) => key.enabled).length,
      secrets: {
        cursorApiKey: Boolean(config.cursorApiKey),
        proxyApiKey: config.proxyApiKeys.some((key) => key.enabled),
        connectAuthToken: config.connectAuthToken ? "configured" : noLog ? "required" : "auto-generated",
      },
      connectAuthToken: noLog ? undefined : configStore.getConnectAuthToken(),
      endpoints: {
        health: `${base}/health`,
        openai: `${base}/v1/chat/completions`,
        models: `${base}/v1/models`,
        connectSend: `${base}/sdk.v1.SdkAgentService/Send`,
        admin: `${base}/admin`,
      },
    };
  });

  app.get("/admin/api/settings", async (request, reply) => {
    if (!requireAdmin(request, reply, configStore)) return;
    const noLog = isNoLogPolicy(configStore.get().logPolicy);
    return {
      ...configStore.getSettingsView(),
      settingsPath: configStore.getSettingsPath(),
      connectAuthToken: noLog ? undefined : configStore.getConnectAuthToken(),
      availableTools: AVAILABLE_TOOLS,
    };
  });

  app.get("/admin/api/proxy-keys", async (request, reply) => {
    if (!requireAdmin(request, reply, configStore)) return;

    const keys = configStore.listProxyApiKeys();
    const usage = listKeyUsageSnapshots(configStore.get().proxyApiKeys);

    return {
      persisted: true,
      usagePath: usageStorePath(),
      keys: keys.map((key) => ({
        ...key,
        usage: usage.active.find((entry) => entry.apiKeyId === key.id) ?? {
          requestCount: 0,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          today: { requestCount: 0, totalTokens: 0 },
          monthToDate: { requestCount: 0, totalTokens: 0 },
        },
      })),
      retired: usage.retired,
    };
  });

  app.patch("/admin/api/proxy-keys/:id", async (request, reply) => {
    if (!requireAdmin(request, reply, configStore)) return;

    const id = (request.params as { id?: string }).id?.trim();
    if (!id) {
      return reply.code(400).send({ error: "id is required" });
    }

    const body = (request.body ?? {}) as {
      quota?: {
        maxTotalTokens?: number | null;
        maxDailyTokens?: number | null;
        maxMonthlyTokens?: number | null;
      } | null;
    };

    if (body.quota === undefined) {
      return reply.code(400).send({ error: "quota is required" });
    }

    const quota = body.quota === null
      ? null
      : {
          ...(typeof body.quota.maxTotalTokens === "number" ? { maxTotalTokens: body.quota.maxTotalTokens } : {}),
          ...(typeof body.quota.maxDailyTokens === "number" ? { maxDailyTokens: body.quota.maxDailyTokens } : {}),
          ...(typeof body.quota.maxMonthlyTokens === "number" ? { maxMonthlyTokens: body.quota.maxMonthlyTokens } : {}),
        };

    const updated = configStore.updateProxyApiKeyQuota(id, quota);
    if (!updated) {
      return reply.code(404).send({ error: "API key not found" });
    }

    return { ok: true, key: configStore.listProxyApiKeys().find((key) => key.id === id) ?? null };
  });

  app.post("/admin/api/proxy-keys", async (request, reply) => {
    if (!requireAdmin(request, reply, configStore)) return;

    const body = (request.body ?? {}) as { label?: string };
    const created = configStore.addProxyApiKey(body.label);
    return { ok: true, key: created };
  });

  app.delete("/admin/api/proxy-keys/:id", async (request, reply) => {
    if (!requireAdmin(request, reply, configStore)) return;

    const id = (request.params as { id?: string }).id?.trim();
    if (!id) {
      return reply.code(400).send({ error: "id is required" });
    }

    const removed = configStore.removeProxyApiKey(id);
    if (!removed) {
      return reply.code(404).send({ error: "API key not found" });
    }
    return { ok: true };
  });

  app.post("/admin/api/verify-rest-key", async (request, reply) => {
    if (!requireAdmin(request, reply, configStore)) return;

    const config = configStore.get();
    const body = (request.body ?? {}) as { key?: string };
    const key = body.key?.trim();
    if (!key) {
      return reply.code(400).send({ error: "key is required" });
    }

    try {
      const auth = authorize(config, { authorization: `Bearer ${key}` });
      return {
        ok: true,
        method: auth.method,
        proxyKeyId: auth.proxyKeyId ?? null,
      };
    } catch {
      return { ok: false };
    }
  });

  app.patch("/admin/api/settings", async (request, reply) => {
    if (!requireAdmin(request, reply, configStore)) return;

    try {
      const body = (request.body ?? {}) as SettingsUpdate;
      configStore.applySettings(body);
      return {
        ok: true,
        settingsPath: configStore.getSettingsPath(),
        settings: {
          ...configStore.getSettingsView(),
          connectAuthToken: isNoLogPolicy(configStore.get().logPolicy)
            ? undefined
            : configStore.getConnectAuthToken(),
          availableTools: AVAILABLE_TOOLS,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save settings";
      return reply.code(500).send({ error: message });
    }
  });

  app.get("/admin/api/models", async (request, reply) => {
    if (!requireAdmin(request, reply, configStore)) return;

    const config = configStore.get();
    const ids = await listModels(config, config.cursorApiKey);
    const disabled = new Set(configStore.getDisabledModels());
    const data = ids.map((id) => ({
      id,
      object: "model",
      created: 0,
      owned_by: "cursor",
      enabled: !disabled.has(id),
    }));

    return {
      object: "list",
      totalCount: data.length,
      visibleCount: data.filter((model) => model.enabled).length,
      data,
    };
  });

  app.patch("/admin/api/models", async (request, reply) => {
    if (!requireAdmin(request, reply, configStore)) return;

    const body = (request.body ?? {}) as { disabledModels?: unknown };
    if (!Array.isArray(body.disabledModels)) {
      return reply.code(400).send({ error: "disabledModels array is required" });
    }

    const disabledModels = configStore.setDisabledModels(body.disabledModels);
    const config = configStore.get();
    const ids = await listModels(config, config.cursorApiKey);
    const disabled = new Set(disabledModels);
    const data = ids.map((id) => ({
      id,
      object: "model",
      created: 0,
      owned_by: "cursor",
      enabled: !disabled.has(id),
    }));

    return {
      ok: true,
      disabledModels,
      totalCount: data.length,
      visibleCount: data.filter((model) => model.enabled).length,
      data,
    };
  });

  app.get("/admin/api/logs", async (request, reply) => {
    if (!requireAdmin(request, reply, configStore)) return;
    const logPolicy = configStore.get().logPolicy;
    return {
      loggingPolicy: logPolicy,
      entries: listRequestLog(),
    };
  });

  app.post("/admin/api/chat", async (request, reply) => {
    if (!requireAdmin(request, reply, configStore)) return;

    const config = configStore.get();
    const body = (request.body ?? {}) as ChatTestBody;
    const message = body.message?.trim();
    if (!message) {
      return reply.code(400).send({ error: "message is required" });
    }

    const model = body.model?.trim() || config.defaultModel;
    const normalized = normalizeBody({
      model,
      messages: [{ role: "user", content: message }],
      fast: body.fast,
      model_speed: body.model_speed,
      reasoning_effort: body.reasoning_effort,
    });
    const result = await complete(config, config.cursorApiKey, normalized);

    return {
      model: normalized.displayModel ?? result.model,
      resolvedModel: result.model,
      finishReason: result.finishReason,
      content: result.content,
      reasoningContent: result.reasoningContent,
      toolCalls: result.toolCalls,
      usage: result.usage,
      fast: normalized.fast,
      reasoning: normalized.reasoning,
    };
  });
}

export function registerRequestLogging(app: FastifyInstance) {
  app.addHook("onResponse", (request, reply, done) => {
    if (!request.url.startsWith("/admin")) {
      recordRequest({
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        responseTimeMs: reply.elapsedTime,
      });
    }
    done();
  });
}
