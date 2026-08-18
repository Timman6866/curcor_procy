import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeJsonBody, encodeJsonLine } from "./framing.ts";

test("encodes NDJSON stream lines", () => {
  const line = encodeJsonLine({ agentId: "agent-123", message: { text: "hi" } });
  assert.equal(line.toString("utf8"), '{"agentId":"agent-123","message":{"text":"hi"}}\n');
});

test("decodes plain JSON bodies for unary RPCs", () => {
  assert.deepEqual(decodeJsonBody(Buffer.from('{"options":{"apiKey":"abc"}}', "utf8")), {
    options: { apiKey: "abc" },
  });
});

test("decodes already-parsed JSON objects", () => {
  assert.deepEqual(decodeJsonBody({ agentId: "agent-123" }), { agentId: "agent-123" });
});

test("still accepts legacy Connect binary frames on input", () => {
  const payload = '{"hello":"world"}';
  const framed = Buffer.alloc(5 + payload.length);
  framed.writeUInt8(0, 0);
  framed.writeUInt32BE(payload.length, 1);
  framed.write(payload, 5);
  assert.deepEqual(decodeJsonBody(framed), { hello: "world" });
});
