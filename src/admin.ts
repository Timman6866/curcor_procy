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
import type { Config } from "./config.ts";
import type { ConfigStore, SettingsUpdate } from "./config-store.ts";
import { listRequestLog, recordRequest } from "./request-log.ts";
import { AVAILABLE_TOOLS, toolsPolicyToView } from "./tools-policy.ts";

interface LoginBody {
  username?: string;
  password?: string;
}

interface ChatTestBody {
  model?: string;
  message?: string;
  stream?: boolean;
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
    return {
      healthy: true,
      host: config.host,
      port: config.port,
      runtime: config.runtime,
      cwd: config.cwd,
      defaultModel: config.defaultModel,
      toolsPolicy: toolsPolicyLabel(config),
      adminUsername: config.adminUsername,
      restAuthMode: config.proxyApiKey ? "proxy-key" : "cursor-key-or-open",
      secrets: {
        cursorApiKey: Boolean(config.cursorApiKey),
        proxyApiKey: Boolean(config.proxyApiKey),
        connectAuthToken: config.connectAuthToken ? "configured" : "auto-generated",
      },
      connectAuthToken: configStore.getConnectAuthToken(),
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
    return {
      ...configStore.getSettingsView(),
      settingsPath: configStore.getSettingsPath(),
      connectAuthToken: configStore.getConnectAuthToken(),
      availableTools: AVAILABLE_TOOLS,
    };
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
          connectAuthToken: configStore.getConnectAuthToken(),
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
    return {
      object: "list",
      data: ids.map((id) => ({
        id,
        object: "model",
        created: 0,
        owned_by: "cursor",
      })),
    };
  });

  app.get("/admin/api/logs", async (request, reply) => {
    if (!requireAdmin(request, reply, configStore)) return;
    return { entries: listRequestLog() };
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
    const result = await complete(config, config.cursorApiKey, {
      model,
      displayModel: model,
      stream: false,
      messages: [{ role: "user", content: message, images: [], toolCalls: [] }],
      tools: [],
      reasoning: { enabled: false },
      includeUsage: true,
    });

    return {
      model: result.model,
      finishReason: result.finishReason,
      content: result.content,
      reasoningContent: result.reasoningContent,
      toolCalls: result.toolCalls,
      usage: result.usage,
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
