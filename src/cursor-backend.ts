import { Agent, Cursor, CursorAgentError } from "@cursor/sdk";
import { buildAgentOptions } from "./agent-options.ts";
import type { Config } from "./config.ts";
import { toFunctionCallingPrompt } from "./openai-messages.ts";
import {
  buildFunctionCallingAgentOptions,
  isOpenAiToolCallPending,
  type OpenAiToolCall,
} from "./openai-tools.ts";
import type { NormalizedImage, NormalizedRequest } from "./normalize.ts";
import { collectImages, resolveModel, toPrompt } from "./normalize.ts";
import { emptyUsage, type TokenCounts } from "./openai-format.ts";
import { expandModelCatalog } from "./reasoning.ts";

export type FinishReason = "stop" | "tool_calls";

export interface CompletionResult {
  model: string;
  content: string | null;
  reasoningContent?: string | null;
  toolCalls?: OpenAiToolCall[];
  finishReason: FinishReason;
  usage: TokenCounts;
}

export interface StreamHandlers {
  onText: (text: string) => void | Promise<void>;
  onReasoning?: (text: string) => void | Promise<void>;
  onToolCalls?: (calls: OpenAiToolCall[]) => void | Promise<void>;
  onAbort?: AbortSignal;
}

function usageFrom(value: { inputTokens?: number; outputTokens?: number } | undefined): TokenCounts {
  if (!value) return emptyUsage();
  const promptTokens = value.inputTokens ?? 0;
  const completionTokens = value.outputTokens ?? 0;
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  };
}

function sendPayload(prompt: string, images: NormalizedImage[]) {
  if (images.length === 0) return prompt;
  return {
    text: prompt,
    images: images.map((image) => ({ data: image.data, mimeType: image.mimeType })),
  };
}

function buildPrompt(request: NormalizedRequest): string {
  if (request.tools.length > 0) {
    return toFunctionCallingPrompt(request.messages);
  }
  return toPrompt(request.messages);
}

function agentRequestOptions(request: NormalizedRequest) {
  return { reasoning: request.reasoning };
}

async function runAgentTurn(
  config: Config,
  apiKey: string,
  model: string,
  request: NormalizedRequest,
  handlers?: StreamHandlers,
): Promise<CompletionResult> {
  const prompt = buildPrompt(request);
  const images = collectImages(request.messages);
  const pending = { calls: null as OpenAiToolCall[] | null };
  const reasoningParts: string[] = [];

  const requestOptions = agentRequestOptions(request);
  const options =
    request.tools.length > 0
      ? buildFunctionCallingAgentOptions(config, apiKey, model, request.tools, pending, requestOptions)
      : buildAgentOptions(config, apiKey, model, requestOptions);

  await using agent = await Agent.create(options);
  const run = await agent.send(sendPayload(prompt, images), {
    onDelta: handlers || request.reasoning.enabled
      ? async ({ update }) => {
          if (update.type === "text-delta" && typeof update.text === "string" && update.text) {
            await handlers?.onText?.(update.text);
          }
          if (
            request.reasoning.enabled &&
            update.type === "thinking-delta" &&
            typeof update.text === "string" &&
            update.text
          ) {
            reasoningParts.push(update.text);
            await handlers?.onReasoning?.(update.text);
          }
        }
      : undefined,
  });

  const cancel = () => {
    if (run.supports("cancel")) void run.cancel();
  };
  handlers?.onAbort?.addEventListener("abort", cancel, { once: true });

  try {
    for await (const event of run.stream()) {
      if (
        request.reasoning.enabled &&
        event.type === "thinking" &&
        typeof event.text === "string" &&
        event.text
      ) {
        reasoningParts.push(event.text);
        await handlers?.onReasoning?.(event.text);
      }

      if (pending.calls) {
        await handlers?.onToolCalls?.(pending.calls);
        cancel();
        break;
      }
    }

    const result = await run.wait();
    const reasoningContent = reasoningParts.length > 0 ? reasoningParts.join("") : null;

    if (pending.calls) {
      return {
        model: result.model?.id ?? model,
        content: null,
        reasoningContent,
        toolCalls: pending.calls,
        finishReason: "tool_calls",
        usage: usageFrom(result.usage),
      };
    }

    if (result.status === "error") {
      throw Object.assign(new Error(result.error?.message ?? "Cursor run failed"), {
        statusCode: 502,
      });
    }

    if (result.status === "cancelled" && pending.calls) {
      return {
        model: result.model?.id ?? model,
        content: null,
        reasoningContent,
        toolCalls: pending.calls,
        finishReason: "tool_calls",
        usage: usageFrom(result.usage),
      };
    }

    if (result.status === "cancelled") {
      throw Object.assign(new Error("Cursor run cancelled"), { statusCode: 499 });
    }

    return {
      model: result.model?.id ?? model,
      content: result.result ?? "",
      reasoningContent,
      finishReason: "stop",
      usage: usageFrom(result.usage),
    };
  } finally {
    handlers?.onAbort?.removeEventListener("abort", cancel);
  }
}

export async function complete(
  config: Config,
  apiKey: string,
  request: NormalizedRequest,
): Promise<CompletionResult> {
  const model = resolveModel(request.model, config.defaultModel);
  const responseModel = request.displayModel ?? model;

  try {
    if (
      request.tools.length === 0 &&
      collectImages(request.messages).length === 0 &&
      !request.reasoning.enabled
    ) {
      const result = await Agent.prompt(
        buildPrompt(request),
        buildAgentOptions(config, apiKey, model, agentRequestOptions(request)),
      );
      if (result.status === "error") {
        throw Object.assign(new Error(result.error?.message ?? "Cursor run failed"), {
          statusCode: 502,
        });
      }
      if (result.status === "cancelled") {
        throw Object.assign(new Error("Cursor run cancelled"), { statusCode: 499 });
      }
      return {
        model: result.model?.id ?? responseModel,
        content: result.result ?? "",
        finishReason: "stop",
        usage: usageFrom(result.usage),
      };
    }

    const result = await runAgentTurn(config, apiKey, model, request);
    return { ...result, model: responseModel };
  } catch (error) {
    if (isOpenAiToolCallPending(error)) {
      return {
        model: responseModel,
        content: null,
        toolCalls: error.toolCalls,
        finishReason: "tool_calls",
        usage: emptyUsage(),
      };
    }
    rethrowCursorError(error);
  }
}

export async function streamComplete(
  config: Config,
  apiKey: string,
  request: NormalizedRequest,
  handlers: StreamHandlers,
): Promise<CompletionResult> {
  const model = resolveModel(request.model, config.defaultModel);
  const responseModel = request.displayModel ?? model;

  try {
    const result = await runAgentTurn(config, apiKey, model, request, handlers);
    return { ...result, model: responseModel };
  } catch (error) {
    if (isOpenAiToolCallPending(error)) {
      await handlers.onToolCalls?.(error.toolCalls);
      return {
        model: responseModel,
        content: null,
        toolCalls: error.toolCalls,
        finishReason: "tool_calls",
        usage: emptyUsage(),
      };
    }
    rethrowCursorError(error);
  }
}

export async function listModels(config: Config, apiKey: string): Promise<string[]> {
  try {
    const models = await Cursor.models.list({ apiKey });
    const ids = models
      .map((model) => model.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    if (ids.length > 0) return expandModelCatalog(ids);
  } catch {
    // Fall through to the configured default so /v1/models still works offline.
  }
  return expandModelCatalog([config.defaultModel]);
}

function rethrowCursorError(error: unknown): never {
  if (error instanceof CursorAgentError) {
    throw Object.assign(new Error(error.message), {
      statusCode: /auth|api key|unauthorized/i.test(error.message) ? 401 : 502,
    });
  }
  throw error;
}
