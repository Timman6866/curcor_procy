import { Agent, Cursor, CursorAgentError } from "@cursor/sdk";
import { buildAgentOptions } from "../agent-options.ts";
import type { Config } from "../config.ts";
import { resolveModel } from "../normalize.ts";
import { connectError, connectErrorFromUnknown } from "./errors.ts";
import {
  CONNECT_JSON,
  CONNECT_PROTO_VERSION,
  decodeConnectJsonBody,
  encodeConnectEndStream,
  encodeConnectJsonFrame,
} from "./framing.ts";
import { AgentSessionStore } from "./session-store.ts";

const PROTOCOL_VERSION = "sdk.v1";
const BRIDGE_VERSION = "0.1.0-cursor-openai-proxy";

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readApiKey(config: Config, body: unknown, fallback?: string): string {
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

export class ConnectTransformer {
  readonly authToken: string;
  private readonly sessions = new AgentSessionStore();

  constructor(
    private readonly config: Config,
    authToken: string,
  ) {
    this.authToken = authToken;
  }

  assertBridgeAuth(authorization: string | undefined) {
    const match = authorization?.match(/^Bearer\s+(.+)$/i);
    const token = match?.[1]?.trim();
    if (!token || token !== this.authToken) {
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
      capabilities: ["openai-rest", "sdk.v1", "connect-json"],
    };
  }

  async handleMe(body: unknown) {
    const apiKey = readApiKey(this.config, body);
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
    const apiKey = readApiKey(this.config, body);
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

    const apiKey = readApiKey(this.config, body);
    const modelId = resolveModel(
      typeof asRecord(options.model)?.id === "string" ? (asRecord(options.model)?.id as string) : undefined,
      this.config.defaultModel,
    );

    const agent = await Agent.create(buildAgentOptions(this.config, apiKey, modelId));
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

  async handleSend(rawBody: Buffer, write: (chunk: Buffer) => void) {
    const body = asRecord(decodeConnectJsonBody(rawBody));
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

    const run = await session.agent.send(text, {
      onDelta: async ({ update }) => {
        if (update.type === "text-delta" && typeof update.text === "string" && update.text.length > 0) {
          write(
            encodeConnectJsonFrame({
              interactionUpdate: {
                type: update.type,
                update,
              },
            }),
          );
        }
      },
    });

    for await (const event of run.stream()) {
      if (event.type === "assistant" || event.type === "thinking" || event.type === "tool_call") {
        write(encodeConnectJsonFrame(sdkMessageEnvelope(event)));
      }
    }

    const result = await run.wait();
    if (result.status === "error") {
      write(
        encodeConnectJsonFrame({
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
      encodeConnectJsonFrame({
        result: {
          agentId: run.agentId,
          runId: run.id,
          status: mapRunStatus(result.status),
          result: {
            runId: run.id,
            agentId: run.agentId,
            status: mapRunStatus(result.status),
            result: result.result ?? "",
            model: result.model ?? { id: session.model },
            durationMs: result.durationMs ?? 0,
            usage: mapUsage(result.usage),
          },
        },
      }),
    );
    write(
      encodeConnectJsonFrame({
        done: {
          agentId: run.agentId,
          runId: run.id,
        },
      }),
    );
    write(encodeConnectEndStream());
  }
}

export function connectUnaryResponse(body: unknown) {
  return {
    headers: {
      "content-type": "application/json",
      "connect-protocol-version": CONNECT_PROTO_VERSION,
    },
    body,
  };
}

export function connectStreamHeaders() {
  return {
    "content-type": CONNECT_JSON,
    "connect-protocol-version": CONNECT_PROTO_VERSION,
    "cache-control": "no-cache",
    connection: "keep-alive",
  };
}

export async function invokeConnectRpc(
  transformer: ConnectTransformer,
  path: string,
  authorization: string | undefined,
  rawBody: Buffer | undefined,
  write: (chunk: Buffer) => void,
) {
  transformer.assertBridgeAuth(authorization);

  try {
    const body = decodeConnectJsonBody(rawBody);

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
        await transformer.handleSend(rawBody ?? Buffer.alloc(0), write);
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
