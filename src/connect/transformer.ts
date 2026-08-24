import { Agent, Cursor, CursorAgentError } from "@cursor/sdk";
import { buildAgentOptions, parseAgentRequestOptions } from "../agent-options.ts";
import type { ConfigProvider } from "../config-store.ts";
import { resolveModel } from "../normalize.ts";
import { connectError, connectErrorFromUnknown } from "./errors.ts";
import {
  CONNECT_PROTO_VERSION,
  decodeJsonBody,
  encodeJsonLine,
  JSON_CONTENT_TYPE,
} from "./framing.ts";
import { AgentSessionStore } from "./session-store.ts";
import { createToolMarkupStreamFilter, stripToolMarkup } from "../tool-markup.ts";

const PROTOCOL_VERSION = "sdk.v1";
const BRIDGE_VERSION = "0.1.0-cursor-openai-proxy";

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readApiKey(configStore: ConfigProvider, body: unknown, fallback?: string): string {
  const config = configStore.get();
  const root = asRecord(body);
  const options = asRecord(root?.options);
  const apiKey = typeof options?.apiKey === "string" ? options.apiKey.trim() : "";
  if (apiKey) return apiKey;
  if (fallback) return fallback;
  return config.cursorApiKey;
}

function mapRunStatus(status: string): string {
  switch (status) {
    case "finished":
      return "RUN_LIFECYCLE_STATUS_FINISHED";
    case "error":
      return "RUN_LIFECYCLE_STATUS_ERROR";
    case "cancelled":
      return "RUN_LIFECYCLE_STATUS_CANCELLED";
    default:
      return "RUN_LIFECYCLE_STATUS_RUNNING";
  }
}

function mapUsage(usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number } | undefined) {
  if (!usage) return undefined;
  return {
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    totalTokens: usage.totalTokens ?? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
  };
}

function sdkMessageEnvelope(event: { type: string }) {
  return {
    sdkMessage: {
      type: event.type,
      message: event,
    },
  };
}

function sanitizeTextDeltaUpdate(update: Record<string, unknown>, filter: ReturnType<typeof createToolMarkupStreamFilter>) {
  if (update.type !== "text-delta" && update.type !== "thinking-delta") {
    return { update, skip: false as const };
  }
  const text = typeof update.text === "string" ? update.text : "";
  if (!text) return { update, skip: true as const };
  const safe = filter.push(text);
  if (!safe) return { update, skip: true as const };
  return { update: { ...update, text: safe }, skip: false as const };
}

function sanitizeAssistantEvent(event: Record<string, unknown>): Record<string, unknown> {
  const message = asRecord(event.message) ?? event;
  const content = message.content;
  if (typeof content === "string") {
    return { ...event, ...(event.message ? { message: { ...message, content: stripToolMarkup(content) } } : { content: stripToolMarkup(content) }) };
  }
  if (!Array.isArray(content)) return event;

  const nextContent = content.map((block) => {
    const item = asRecord(block);
    if (!item) return block;
    if (item.type === "text" && typeof item.text === "string") {
      return { ...item, text: stripToolMarkup(item.text) };
    }
    if (typeof item.text === "string" && item.type !== "tool_use") {
      return { ...item, text: stripToolMarkup(item.text) };
    }
    return block;
  });

  if (event.message) {
    return { ...event, message: { ...message, content: nextContent } };
  }
  return { ...event, content: nextContent };
}

function sanitizeThinkingEvent(event: Record<string, unknown>): Record<string, unknown> {
  const message = asRecord(event.message) ?? event;
  if (typeof message.text === "string") {
    const safe = stripToolMarkup(message.text);
    if (event.message) {
      return { ...event, message: { ...message, text: safe } };
    }
    return { ...event, text: safe };
  }
  if (typeof message.content === "string") {
    const safe = stripToolMarkup(message.content);
    if (event.message) {
      return { ...event, message: { ...message, content: safe } };
    }
    return { ...event, content: safe };
  }
  return event;
}

export class ConnectTransformer {
  private readonly sessions = new AgentSessionStore();

  constructor(private readonly configStore: ConfigProvider) {}

  private get config() {
    return this.configStore.get();
  }

  assertBridgeAuth(authorization: string | undefined) {
    const expected = this.configStore.getConnectAuthToken();
    const match = authorization?.match(/^Bearer\s+(.+)$/i);
    const token = match?.[1]?.trim();
    if (!token || token !== expected) {
      throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    }
  }

  handlePing() {
    return { message: "pong" };
  }

  handleGetVersion() {
    return {
      bridgeVersion: BRIDGE_VERSION,
      protocolVersion: PROTOCOL_VERSION,
      capabilities: ["openai-rest", "sdk.v1", "json", "ndjson-stream"],
    };
  }

  async handleMe(body: unknown) {
    const apiKey = readApiKey(this.configStore, body);
    if (!apiKey) {
      throw Object.assign(new Error("API key is required for cloud catalog calls."), { statusCode: 401 });
    }
    const user = await Cursor.me({ apiKey });
    return {
      user: {
        apiKeyName: user.apiKeyName,
        userId: user.userId,
        userEmail: user.userEmail,
        userFirstName: user.userFirstName,
        userLastName: user.userLastName,
        createdAt: user.createdAt,
      },
    };
  }

  async handleListModels(body: unknown) {
    const apiKey = readApiKey(this.configStore, body);
    if (!apiKey) {
      throw Object.assign(new Error("API key is required for cloud catalog calls."), { statusCode: 401 });
    }
    const models = await Cursor.models.list({ apiKey });
    return {
      items: models.map((model) => ({
        id: model.id,
        displayName: model.displayName,
        description: model.description,
        parameters: model.parameters,
        variants: model.variants,
      })),
    };
  }

  async handleCreateAgent(body: unknown) {
    const root = asRecord(body);
    const options = asRecord(root?.options);
    if (!options) {
      throw Object.assign(new Error("options is required"), { statusCode: 400 });
    }

    const apiKey = readApiKey(this.configStore, body);
    const modelId = resolveModel(
      typeof asRecord(options.model)?.id === "string" ? (asRecord(options.model)?.id as string) : undefined,
      this.config.defaultModel,
    );

    const agent = await Agent.create(
      buildAgentOptions(
        this.config,
        apiKey,
        modelId,
        parseAgentRequestOptions(this.config, options),
      ),
    );
    this.sessions.set(agent.agentId, {
      agent,
      apiKey,
      model: modelId,
    });

    return {
      agentId: agent.agentId,
      model: { id: agent.model?.id ?? modelId },
    };
  }

  async handleCloseAgent(body: unknown) {
    const root = asRecord(body);
    const agentId = typeof root?.agentId === "string" ? root.agentId : "";
    if (!agentId) {
      throw Object.assign(new Error("agentId is required"), { statusCode: 400 });
    }
    const closed = await this.sessions.close(agentId);
    if (!closed) {
      throw Object.assign(new Error(`Unknown agent ${agentId}`), { statusCode: 404 });
    }
    return {};
  }

  async handleSend(bodyInput: Buffer | Record<string, unknown>, write: (chunk: Buffer) => void) {
    const body = asRecord(decodeJsonBody(bodyInput));
    const agentId = typeof body?.agentId === "string" ? body.agentId : "";
    const message = asRecord(body?.message);
    const text = typeof message?.text === "string" ? message.text : "";

    if (!agentId || !text) {
      throw Object.assign(new Error("agentId and message.text are required"), { statusCode: 400 });
    }

    const session = this.sessions.get(agentId);
    if (!session) {
      throw Object.assign(new Error(`Unknown agent ${agentId}`), { statusCode: 404 });
    }

    const sendOptions = asRecord(body?.options);
    const streamDeltas = sendOptions?.enableDeltas !== false;
    const streamSteps = sendOptions?.enableSteps === true;
    const textFilter = createToolMarkupStreamFilter();
    const thinkingFilter = createToolMarkupStreamFilter();

    const run = await session.agent.send(text, {
      onDelta: streamDeltas
        ? async ({ update }) => {
            const record = asRecord(update) ?? { type: (update as { type?: string }).type };
            if (record.type === "text-delta" || record.type === "thinking-delta") {
              const filter = record.type === "thinking-delta" ? thinkingFilter : textFilter;
              const sanitized = sanitizeTextDeltaUpdate(record, filter);
              if (sanitized.skip) return;
              write(
                encodeJsonLine({
                  interactionUpdate: {
                    type: sanitized.update.type,
                    update: sanitized.update,
                  },
                }),
              );
              return;
            }
            write(
              encodeJsonLine({
                interactionUpdate: {
                  type: update.type,
                  update,
                },
              }),
            );
          }
        : undefined,
      onStep: streamSteps
        ? async ({ step }) => {
            write(
              encodeJsonLine({
                step: {
                  type: step.type,
                  step,
                },
              }),
            );
          }
        : undefined,
    });

    for await (const event of run.stream()) {
      if (
        event.type === "assistant" ||
        event.type === "thinking" ||
        event.type === "tool_call" ||
        event.type === "system" ||
        event.type === "status" ||
        event.type === "usage"
      ) {
        let payload: Record<string, unknown> | { type: string } = event;
        if (event.type === "assistant") {
          payload = sanitizeAssistantEvent(event as unknown as Record<string, unknown>);
        } else if (event.type === "thinking") {
          payload = sanitizeThinkingEvent(event as unknown as Record<string, unknown>);
        }
        write(encodeJsonLine(sdkMessageEnvelope(payload as { type: string })));
      }
    }

    const flushed = textFilter.flush();
    if (flushed && streamDeltas) {
      write(
        encodeJsonLine({
          interactionUpdate: {
            type: "text-delta",
            update: { type: "text-delta", text: flushed },
          },
        }),
      );
    }

    const flushedThinking = thinkingFilter.flush();
    if (flushedThinking && streamDeltas) {
      write(
        encodeJsonLine({
          interactionUpdate: {
            type: "thinking-delta",
            update: { type: "thinking-delta", text: flushedThinking },
          },
        }),
      );
    }

    const result = await run.wait();
    if (result.status === "error") {
      write(
        encodeJsonLine({
          sdkMessage: {
            type: "status",
            message: {
              type: "status",
              agent_id: run.agentId,
              run_id: run.id,
              status: "ERROR",
              message: result.error?.message ?? "Cursor run failed",
            },
          },
        }),
      );
    }

    write(
      encodeJsonLine({
        result: {
          agentId: run.agentId,
          runId: run.id,
          status: mapRunStatus(result.status),
          result: {
            runId: run.id,
            agentId: run.agentId,
            status: mapRunStatus(result.status),
            result: stripToolMarkup(result.result ?? ""),
            model: result.model ?? { id: session.model },
            durationMs: result.durationMs ?? 0,
            usage: mapUsage(result.usage),
          },
        },
      }),
    );
    write(
      encodeJsonLine({
        done: {
          agentId: run.agentId,
          runId: run.id,
        },
      }),
    );
  }
}

export function connectUnaryResponse(body: unknown) {
  return {
    headers: {
      "content-type": JSON_CONTENT_TYPE,
      "connect-protocol-version": CONNECT_PROTO_VERSION,
    },
    body,
  };
}

export function connectStreamHeaders() {
  return {
    "content-type": JSON_CONTENT_TYPE,
    "connect-protocol-version": CONNECT_PROTO_VERSION,
    "cache-control": "no-cache",
    connection: "keep-alive",
    "transfer-encoding": "chunked",
  };
}

export async function invokeConnectRpc(
  transformer: ConnectTransformer,
  path: string,
  authorization: string | undefined,
  rawBody: Buffer | Record<string, unknown> | undefined,
  write: (chunk: Buffer) => void,
) {
  transformer.assertBridgeAuth(authorization);

  try {
    const body = decodeJsonBody(rawBody);

    switch (path) {
      case "/sdk.v1.SdkBridgeControlService/Ping":
        return connectUnaryResponse(transformer.handlePing());
      case "/sdk.v1.SdkBridgeControlService/GetVersion":
        return connectUnaryResponse(transformer.handleGetVersion());
      case "/sdk.v1.SdkCursorService/Me":
        return connectUnaryResponse(await transformer.handleMe(body));
      case "/sdk.v1.SdkCursorService/ListModels":
        return connectUnaryResponse(await transformer.handleListModels(body));
      case "/sdk.v1.SdkAgentService/CreateAgent":
        return connectUnaryResponse(await transformer.handleCreateAgent(body));
      case "/sdk.v1.SdkAgentService/CloseAgent":
        return connectUnaryResponse(await transformer.handleCloseAgent(body));
      case "/sdk.v1.SdkAgentService/Send": {
        await transformer.handleSend(rawBody ?? {}, write);
        return { stream: true as const };
      }
      default:
        return connectUnaryResponse(connectError("unimplemented", `Unknown RPC ${path}`).body);
    }
  } catch (error) {
    if (error instanceof CursorAgentError) {
      return connectUnaryResponse(connectErrorFromUnknown(error).body);
    }
    return connectUnaryResponse(connectErrorFromUnknown(error).body);
  }
}
