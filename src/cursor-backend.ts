import { Agent, Cursor, CursorAgentError } from "@cursor/sdk";
import { buildAgentOptions } from "./agent-options.ts";
import type { Config } from "./config.ts";
import type { NormalizedImage, NormalizedRequest } from "./normalize.ts";
import { collectImages, resolveModel, toPrompt } from "./normalize.ts";
import { emptyUsage, type TokenCounts } from "./openai-format.ts";

export interface CompletionResult {
  model: string;
  content: string;
  usage: TokenCounts;
}

export interface StreamHandlers {
  onText: (text: string) => void | Promise<void>;
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

export async function complete(
  config: Config,
  apiKey: string,
  request: NormalizedRequest,
): Promise<CompletionResult> {
  const model = resolveModel(request.model, config.defaultModel);
  const prompt = toPrompt(request.messages);
  const images = collectImages(request.messages);

  try {
    if (images.length === 0) {
      const result = await Agent.prompt(prompt, buildAgentOptions(config, apiKey, model));
      if (result.status === "error") {
        throw Object.assign(new Error(result.error?.message ?? "Cursor run failed"), {
          statusCode: 502,
        });
      }
      if (result.status === "cancelled") {
        throw Object.assign(new Error("Cursor run cancelled"), { statusCode: 499 });
      }
      return {
        model: result.model?.id ?? model,
        content: result.result ?? "",
        usage: usageFrom(result.usage),
      };
    }

    await using agent = await Agent.create(buildAgentOptions(config, apiKey, model));
    const run = await agent.send(sendPayload(prompt, images));
    const result = await run.wait();
    if (result.status === "error") {
      throw Object.assign(new Error(result.error?.message ?? "Cursor run failed"), {
        statusCode: 502,
      });
    }
    return {
      model: result.model?.id ?? model,
      content: result.result ?? "",
      usage: usageFrom(result.usage),
    };
  } catch (error) {
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
  const prompt = toPrompt(request.messages);
  const images = collectImages(request.messages);

  try {
    await using agent = await Agent.create(buildAgentOptions(config, apiKey, model));
    const run = await agent.send(sendPayload(prompt, images), {
      onDelta: async ({ update }) => {
        if (update.type === "text-delta" && typeof update.text === "string" && update.text) {
          await handlers.onText(update.text);
        }
      },
    });

    const cancel = () => {
      if (run.supports("cancel")) void run.cancel();
    };
    handlers.onAbort?.addEventListener("abort", cancel, { once: true });

    const result = await run.wait();
    handlers.onAbort?.removeEventListener("abort", cancel);

    if (result.status === "error") {
      throw Object.assign(new Error(result.error?.message ?? "Cursor run failed"), {
        statusCode: 502,
      });
    }
    return {
      model: result.model?.id ?? model,
      content: result.result ?? "",
      usage: usageFrom(result.usage),
    };
  } catch (error) {
    rethrowCursorError(error);
  }
}

export async function listModels(config: Config, apiKey: string): Promise<string[]> {
  try {
    const models = await Cursor.models.list({ apiKey });
    const ids = models
      .map((model) => model.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    if (ids.length > 0) return ids;
  } catch {
    // Fall through to the configured default so /v1/models still works offline.
  }
  return [config.defaultModel];
}

function rethrowCursorError(error: unknown): never {
  if (error instanceof CursorAgentError) {
    throw Object.assign(new Error(error.message), {
      statusCode: /auth|api key|unauthorized/i.test(error.message) ? 401 : 502,
    });
  }
  throw error;
}
