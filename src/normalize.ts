export type ChatRole = "system" | "user" | "assistant" | "tool" | "developer";

export interface NormalizedMessage {
  role: ChatRole;
  content: string;
  images: NormalizedImage[];
}

export interface NormalizedImage {
  data: string;
  mimeType: string;
}

export interface NormalizedRequest {
  model: string | undefined;
  stream: boolean;
  includeUsage: boolean;
  messages: NormalizedMessage[];
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
    return [{ role: "user", content: input, images: [] }];
  }
  if (!Array.isArray(input)) return [];

  const messages: NormalizedMessage[] = [];
  for (const item of input) {
    if (typeof item === "string") {
      messages.push({ role: "user", content: item, images: [] });
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
      messages.push({ role: "user", content: item.text, images: [] });
    }
  }
  return messages;
}

function normalizeMessage(value: unknown): NormalizedMessage[] {
  if (!isRecord(value)) return [];
  const role = asRole(value.role);
  const { text, images } = flattenContent(value.content ?? value.text);
  if (!text && images.length === 0) return [];
  return [{ role, content: text, images }];
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
