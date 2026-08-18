export const JSON_CONTENT_TYPE = "application/json";
export const CONNECT_PROTO_VERSION = "1";

/** One NDJSON stream line for server-streaming RPCs. */
export function encodeJsonLine(payload: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(payload)}\n`, "utf8");
}

/** Parse unary JSON bodies and still accept legacy Connect binary frames. */
export function decodeJsonBody(raw: Buffer | string | Record<string, unknown> | undefined): unknown {
  if (raw && typeof raw === "object" && !Buffer.isBuffer(raw)) {
    return raw;
  }

  if (!raw || (Buffer.isBuffer(raw) && raw.length === 0)) {
    return {};
  }

  const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw, "utf8");

  if (looksLikeConnectFrame(buffer)) {
    const length = buffer.readUInt32BE(1);
    const body = buffer.subarray(5, 5 + length).toString("utf8");
    return JSON.parse(body) as unknown;
  }

  return JSON.parse(buffer.toString("utf8")) as unknown;
}

function looksLikeConnectFrame(buffer: Buffer): boolean {
  if (buffer.length < 5) return false;
  const flags = buffer.readUInt8(0);
  const length = buffer.readUInt32BE(1);
  if (length === 0 && buffer.length === 5) return true;
  return flags <= 0b10 && length > 0 && 5 + length <= buffer.length;
}

/** @deprecated Use encodeJsonLine */
export const encodeConnectJsonFrame = encodeJsonLine;

/** @deprecated Use decodeJsonBody */
export const decodeConnectJsonBody = decodeJsonBody;

/** @deprecated Streaming ends after the terminal `done` line. */
export function encodeConnectEndStream(): Buffer {
  return Buffer.alloc(0);
}
