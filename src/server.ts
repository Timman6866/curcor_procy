import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { registerAdminRoutes, registerRequestLogging } from "./admin.ts";
import { registerConnectGateway } from "./connect/gateway.ts";
import { authorize } from "./config.ts";
import type { ConfigProvider } from "./config-store.ts";
import { complete, listModels, streamComplete } from "./cursor-backend.ts";
import { normalizeBody } from "./normalize.ts";
import {
  chatChunk,
  chatCompletion,
  modelsList,
  newId,
  openaiError,
  responseObject,
  streamToolCallChunks,
} from "./openai-format.ts";

export function buildServer(configStore: ConfigProvider) {
  const app = Fastify({ logger: true });
  registerConnectGateway(app, configStore);
  registerRequestLogging(app);
  registerAdminRoutes(app, configStore);

  app.get("/health", async () => ({ ok: true }));

  // SvelteKit apps poll this for deploy detection; return a stable stub to avoid 404 noise.
  app.get("/_app/version.json", async (_request, reply) => {
    return reply
      .header("Cache-Control", "no-cache")
      .send({ version: "cursor-openai-proxy" });
  });

  app.get("/v1/models", async (request, reply) => {
    try {
      const config = configStore.get();
      const apiKey = authorize(config, request.headers);
      const ids = configStore.filterModelIds(await listModels(config, apiKey));
      return modelsList(ids);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/v1/chat/completions", async (request, reply) => {
    return handleCompletion(configStore, request, reply, "chat");
  });

  app.post("/v1/responses", async (request, reply) => {
    return handleCompletion(configStore, request, reply, "responses");
  });

  return { app };
}

async function handleCompletion(
  configStore: ConfigProvider,
  request: FastifyRequest,
  reply: FastifyReply,
  flavor: "chat" | "responses",
) {
  try {
    const config = configStore.get();
    const apiKey = authorize(config, request.headers);
    const normalized = normalizeBody(request.body);

    if (!normalized.stream) {
      const result = await complete(config, apiKey, normalized);
      const created = Math.floor(Date.now() / 1000);
      const responseModel = normalized.displayModel ?? result.model;
      if (flavor === "responses") {
        return responseObject({
          id: newId("resp"),
          created,
          model: responseModel,
          content: result.content ?? "",
          usage: result.usage,
        });
      }
      return chatCompletion({
        id: newId("chatcmpl"),
        created,
        model: responseModel,
        content: result.content,
        reasoningContent: result.reasoningContent,
        toolCalls: result.toolCalls,
        finishReason: result.finishReason,
        usage: result.usage,
      });
    }

    return await streamReply(configStore, apiKey, normalized, reply, flavor);
  } catch (error) {
    return sendError(reply, error);
  }
}

async function streamReply(
  configStore: ConfigProvider,
  apiKey: string,
  normalized: ReturnType<typeof normalizeBody>,
  reply: FastifyReply,
  flavor: "chat" | "responses",
) {
  const config = configStore.get();
  const id = flavor === "responses" ? newId("resp") : newId("chatcmpl");
  const created = Math.floor(Date.now() / 1000);
  const abort = new AbortController();
  const responseModel = normalized.displayModel ?? normalized.model ?? config.defaultModel;

  reply.hijack();
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const writeEvent = (payload: unknown) => {
    reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  reply.raw.on("close", () => abort.abort());

  try {
    if (flavor === "chat") {
      const initialDelta: Record<string, unknown> = { role: "assistant", content: "" };
      if (normalized.reasoning.enabled) {
        initialDelta.reasoning_content = "";
      }
      writeEvent(
        chatChunk({
          id,
          created,
          model: responseModel,
          delta: initialDelta,
          finishReason: null,
        }),
      );
    }

    const result = await streamComplete(config, apiKey, normalized, {
      onAbort: abort.signal,
      onText: (text) => {
        if (flavor === "responses") {
          writeEvent({
            type: "response.output_text.delta",
            delta: text,
          });
          return;
        }
        writeEvent(
          chatChunk({
            id,
            created,
            model: responseModel,
            delta: { content: text },
            finishReason: null,
          }),
        );
      },
      onReasoning: (text) => {
        if (flavor !== "chat" || !normalized.reasoning.enabled) return;
        writeEvent(
          chatChunk({
            id,
            created,
            model: responseModel,
            delta: { reasoning_content: text },
            finishReason: null,
          }),
        );
      },
      onToolCalls: (toolCalls) => {
        if (flavor !== "chat") return;
        for (const chunk of streamToolCallChunks({
          id,
          created,
          model: responseModel,
          toolCalls,
        })) {
          writeEvent(chunk);
        }
      },
    });

    if (flavor === "responses") {
      writeEvent(responseObject({
        id,
        created,
        model: responseModel,
        content: result.content ?? "",
        usage: result.usage,
      }));
    } else if (result.finishReason !== "tool_calls") {
      writeEvent(
        chatChunk({
          id,
          created,
          model: responseModel,
          delta: {},
          finishReason: "stop",
          usage: normalized.includeUsage ? result.usage : undefined,
        }),
      );
    }
    reply.raw.write("data: [DONE]\n\n");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Proxy error";
    writeEvent({ error: { message, type: "server_error" } });
  } finally {
    reply.raw.end();
  }
}

function sendError(reply: FastifyReply, error: unknown) {
  const statusCode =
    typeof error === "object" && error && "statusCode" in error && typeof error.statusCode === "number"
      ? error.statusCode
      : 500;
  const message = error instanceof Error ? error.message : "Internal server error";
  const payload = openaiError(statusCode, message, statusCode === 401 ? "invalid_request_error" : "server_error");
  return reply.code(statusCode).send({ error: payload.error });
}
