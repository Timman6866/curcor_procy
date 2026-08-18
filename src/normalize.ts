export type ChatRole = "system" | "user" | "assistant" | "tool" | "developer";

export interface NormalizedToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface NormalizedMessage {
  role: ChatRole;
  content: string;
  images: NormalizedImage[];
  toolCallId?: string;
  toolCalls: NormalizedToolCall[];
}

export interface NormalizedImage {
  data: string;
  mimeType: string;
}

import { parseOpenAiTools, type OpenAiFunctionTool } from "./openai-tools.ts";

export interface NormalizedRequest {
  model: string | undefined;
  stream: boolean;
  includeUsage: boolean;
  messages: NormalizedMessage[];
  tools: OpenAiFunctionTool[];
}

const PLACEHOLDER_MODELS = new Set([
  "gpt-4",
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-5",
  "gpt-5.5",
  "gpt-3.5-turbo",
  "o3",
  "o4-mini",
]);

export function resolveModel(requested: string | undefined, fallback: string): string {
  const model = requested?.trim();
  if (!model || PLACEHOLDER_MODELS.has(model)) return fallback;
  return model;
}

export function normalizeBody(body: unknown): NormalizedRequest {
  const raw = isRecord(body) ? body : {};
  const messages = extractMessages(raw);

  if (messages.length === 0) {
    throw Object.assign(new Error("Request must include messages or input"), {
      statusCode: 400,
    });
  }

  return {
    model: typeof raw.model === "string" ? raw.model : undefined,
    stream: raw.stream === true,
    includeUsage: isRecord(raw.stream_options) && raw.stream_options.include_usage === true,
    messages,
    tools: parseOpenAiTools(raw.tools),
  };
}

export function toPrompt(messages: NormalizedMessage[]): string {
  return messages
    .map((message) => {
      const label = message.role === "developer" ? "system" : message.role;
      return `${label.toUpperCase()}:\n${message.content}`.trim();
    })
    .join("\n\n");
}

export function collectImages(messages: NormalizedMessage[]): NormalizedImage[] {
  return messages.flatMap((message) => message.images);
}

function extractMessages(raw: Record<string, unknown>): NormalizedMessage[] {
  if (Array.isArray(raw.messages)) {
    return raw.messages.flatMap(normalizeMessage);
  }
  if (raw.input !== undefined) {
    return flattenInput(raw.input);
  }
  return [];
}

function flattenInput(input: unknown): NormalizedMessage[] {
  if (typeof input === "string") {
    return [{ role: "user", content: input, images: [], toolCalls: [] }];
  }
  if (!Array.isArray(input)) return [];

  const messages: NormalizedMessage[] = [];
  for (const item of input) {
    if (typeof item === "string") {
      messages.push({ role: "user", content: item, images: [], toolCalls: [] });
      continue;
    }
    if (!isRecord(item)) continue;

    if (typeof item.content === "string" || Array.isArray(item.content) || item.role) {
      messages.push(...normalizeMessage(item));
      continue;
    }

    if (item.type === "message") {
      messages.push(...normalizeMessage({ ...item, role: item.role ?? "user" }));
      continue;
    }

    if (item.type === "input_text" && typeof item.text === "string") {
      messages.push({ role: "user", content: item.text, images: [], toolCalls: [] });
    }
  }
  return messages;
}

function normalizeMessage(value: unknown): NormalizedMessage[] {
  if (!isRecord(value)) return [];
  const role = asRole(value.role);
  const { text, images } = flattenContent(value.content ?? value.text);
  const toolCalls = normalizeToolCalls(value.tool_calls);
  const toolCallId = typeof value.tool_call_id === "string" ? value.tool_call_id : undefined;

  if (role === "tool") {
    if (!text && !toolCallId) return [];
    return [{ role, content: text, images, toolCallId, toolCalls: [] }];
  }

  if (!text && images.length === 0 && toolCalls.length === 0) return [];
  return [{ role, content: text, images, toolCalls }];
}

function normalizeToolCalls(value: unknown): NormalizedToolCall[] {
  if (!Array.isArray(value)) return [];
  const calls: NormalizedToolCall[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    if (item.type !== "function") continue;
    const fn = isRecord(item.function) ? item.function : undefined;
    if (!fn || typeof fn.name !== "string") continue;
    calls.push({
      id: typeof item.id === "string" ? item.id : "",
      type: "function",
      function: {
        name: fn.name,
        arguments: typeof fn.arguments === "string" ? fn.arguments : JSON.stringify(fn.arguments ?? {}),
      },
    });
  }
  return calls;
}

function flattenContent(content: unknown): { text: string; images: NormalizedImage[] } {
  if (typeof content === "string") {
    return { text: content, images: [] };
  }
  if (!Array.isArray(content)) {
    return { text: content == null ? "" : String(content), images: [] };
  }

  const parts: string[] = [];
  const images: NormalizedImage[] = [];
  for (const part of content) {
    if (typeof part === "string") {
      parts.push(part);
      continue;
    }
    if (!isRecord(part)) continue;

    if (typeof part.text === "string") {
      parts.push(part.text);
      continue;
    }
    if (part.type === "output_text" && typeof part.text === "string") {
      parts.push(part.text);
      continue;
    }

    const image = extractImage(part);
    if (image) images.push(image);
  }
  return { text: parts.join("\n"), images };
}

function extractImage(part: Record<string, unknown>): NormalizedImage | undefined {
  const imageUrl = isRecord(part.image_url) ? part.image_url.url : part.image_url;
  const source = typeof imageUrl === "string" ? imageUrl : typeof part.image === "string" ? part.image : undefined;
  if (!source) return undefined;

  const dataUrl = /^data:([^;]+);base64,(.+)$/i.exec(source);
  if (!dataUrl) return undefined;
  return { data: dataUrl[2], mimeType: dataUrl[1] };
}

function asRole(value: unknown): ChatRole {
  if (
    value === "system" ||
    value === "user" ||
    value === "assistant" ||
    value === "tool" ||
    value === "developer"
  ) {
    return value;
  }
  return "user";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
