import assert from "node:assert/strict";
import { test } from "node:test";
import {
  decodeConnectJsonBody,
  encodeConnectEndStream,
  encodeConnectJsonFrame,
} from "./framing.ts";

test("encodes and decodes Connect JSON frames", () => {
  const frame = encodeConnectJsonFrame({ agentId: "agent-123", message: { text: "hi" } });
  assert.equal(frame.readUInt8(0), 0);
  assert.equal(frame.readUInt32BE(1), frame.length - 5);
  assert.deepEqual(decodeConnectJsonBody(frame), {
    agentId: "agent-123",
    message: { text: "hi" },
  });
});

test("decodes plain JSON bodies for unary RPCs", () => {
  assert.deepEqual(decodeConnectJsonBody(Buffer.from('{"options":{"apiKey":"abc"}}', "utf8")), {
    options: { apiKey: "abc" },
  });
});

test("writes end-of-stream frames", () => {
  const end = encodeConnectEndStream();
  assert.equal(end.readUInt8(0), 0b10);
});
