export const CONNECT_JSON = "application/connect+json";
export const CONNECT_PROTO_VERSION = "1";

export function encodeConnectJsonFrame(payload: unknown, flags = 0): Buffer {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  const header = Buffer.alloc(5);
  header.writeUInt8(flags, 0);
  header.writeUInt32BE(body.length, 1);
  return Buffer.concat([header, body]);
}

export function encodeConnectEndStream(error?: { code: string; message: string }): Buffer {
  if (!error) {
    return encodeConnectJsonFrame({}, 0b10);
  }
  return encodeConnectJsonFrame({ error }, 0b10);
}

export function decodeConnectJsonBody(raw: Buffer | string | undefined): unknown {
  if (!raw || (Buffer.isBuffer(raw) && raw.length === 0)) {
    return {};
  }

  const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw, "utf8");
  if (buffer.length >= 5) {
    const flags = buffer.readUInt8(0);
    const length = buffer.readUInt32BE(1);
    if (length > 0 && 5 + length <= buffer.length) {
      const body = buffer.subarray(5, 5 + length).toString("utf8");
      return JSON.parse(body) as unknown;
    }
    if (flags === 0 && length === 0 && buffer.length === 5) {
      return {};
    }
  }

  return JSON.parse(buffer.toString("utf8")) as unknown;
}
