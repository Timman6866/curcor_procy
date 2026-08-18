import { randomBytes } from "node:crypto";

export interface TokenCounts {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export function newId(prefix: string): string {
  return `${prefix}-${randomBytes(12).toString("hex")}`;
}

export function emptyUsage(): TokenCounts {
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
}

export function chatCompletion(params: {
  id: string;
  created: number;
  model: string;
  content: string;
  usage: TokenCounts;
}) {
  return {
    id: params.id,
    object: "chat.completion",
    created: params.created,
    model: params.model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: params.content },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: params.usage.promptTokens,
      completion_tokens: params.usage.completionTokens,
      total_tokens: params.usage.totalTokens,
    },
  };
}

export function chatChunk(params: {
  id: string;
  created: number;
  model: string;
  delta: Record<string, unknown>;
  finishReason: string | null;
  usage?: TokenCounts;
}) {
  return {
    id: params.id,
    object: "chat.completion.chunk",
    created: params.created,
    model: params.model,
    choices: [
      {
        index: 0,
        delta: params.delta,
        finish_reason: params.finishReason,
      },
    ],
    ...(params.usage
      ? {
          usage: {
            prompt_tokens: params.usage.promptTokens,
            completion_tokens: params.usage.completionTokens,
            total_tokens: params.usage.totalTokens,
          },
        }
      : {}),
  };
}

export function responseObject(params: {
  id: string;
  created: number;
  model: string;
  content: string;
  usage: TokenCounts;
}) {
  return {
    id: params.id,
    object: "response",
    created_at: params.created,
    status: "completed",
    model: params.model,
    output: [
      {
        type: "message",
        id: newId("msg"),
        status: "completed",
        role: "assistant",
        content: [{ type: "output_text", text: params.content }],
      },
    ],
    usage: {
      input_tokens: params.usage.promptTokens,
      output_tokens: params.usage.completionTokens,
      total_tokens: params.usage.totalTokens,
    },
  };
}

export function openaiError(statusCode: number, message: string, type = "invalid_request_error") {
  return {
    statusCode,
    error: {
      message,
      type,
      code: statusCode === 401 ? "invalid_api_key" : null,
    },
  };
}

export function modelsList(ids: string[]) {
  return {
    object: "list",
    data: ids.map((id) => ({
      id,
      object: "model",
      created: 0,
      owned_by: "cursor",
    })),
  };
}
