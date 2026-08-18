import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { createConnectAuthToken, registerConnectGateway } from "./connect/gateway.ts";
import { authorize, type Config } from "./config.ts";
import { complete, listModels, streamComplete } from "./cursor-backend.ts";
import { normalizeBody } from "./normalize.ts";
import {
  chatChunk,
  chatCompletion,
  modelsList,
  newId,
  openaiError,
  responseObject,
} from "./openai-format.ts";

export function buildServer(config: Config) {
  const app = Fastify({ logger: true });
  const connectAuthToken = createConnectAuthToken(config);
  registerConnectGateway(app, config, connectAuthToken);

  app.get("/health", async () => ({ ok: true }));

  app.get("/v1/models", async (request, reply) => {
    try {
      const apiKey = authorize(config, request.headers.authorization);
      const ids = await listModels(config, apiKey);
      return modelsList(ids);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/v1/chat/completions", async (request, reply) => {
    return handleCompletion(config, request, reply, "chat");
  });

  app.post("/v1/responses", async (request, reply) => {
    return handleCompletion(config, request, reply, "responses");
  });

  return { app, connectAuthToken };
}

async function handleCompletion(
  config: Config,
  request: FastifyRequest,
  reply: FastifyReply,
  flavor: "chat" | "responses",
) {
  try {
    const apiKey = authorize(config, request.headers.authorization);
    const normalized = normalizeBody(request.body);

    if (!normalized.stream) {
      const result = await complete(config, apiKey, normalized);
      const created = Math.floor(Date.now() / 1000);
      if (flavor === "responses") {
        return responseObject({
          id: newId("resp"),
          created,
          model: result.model,
          content: result.content,
          usage: result.usage,
        });
      }
      return chatCompletion({
        id: newId("chatcmpl"),
        created,
        model: result.model,
        content: result.content,
        usage: result.usage,
      });
    }

    return await streamReply(config, apiKey, normalized, reply, flavor);
  } catch (error) {
    return sendError(reply, error);
  }
}

async function streamReply(
  config: Config,
  apiKey: string,
  normalized: ReturnType<typeof normalizeBody>,
  reply: FastifyReply,
  flavor: "chat" | "responses",
) {
  const id = flavor === "responses" ? newId("resp") : newId("chatcmpl");
  const created = Math.floor(Date.now() / 1000);
  const abort = new AbortController();

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
      writeEvent(
        chatChunk({
          id,
          created,
          model: normalized.model ?? config.defaultModel,
          delta: { role: "assistant", content: "" },
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
            model: normalized.model ?? config.defaultModel,
            delta: { content: text },
            finishReason: null,
          }),
        );
      },
    });

    if (flavor === "responses") {
      writeEvent(responseObject({
        id,
        created,
        model: result.model,
        content: result.content,
        usage: result.usage,
      }));
    } else {
      writeEvent(
        chatChunk({
          id,
          created,
          model: result.model,
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
