import assert from "node:assert/strict";
import { test } from "node:test";
import { toFunctionCallingPrompt } from "./openai-messages.ts";
import type { NormalizedMessage } from "./normalize.ts";

function msg(partial: Partial<NormalizedMessage> & Pick<NormalizedMessage, "role" | "content">): NormalizedMessage {
  return {
    images: [],
    toolCalls: [],
    ...partial,
  };
}

test("encodes assistant tool calls without bracket [tool_call] markup", () => {
  const prompt = toFunctionCallingPrompt([
    msg({ role: "user", content: "Weather in Boston?" }),
    msg({
      role: "assistant",
      content: "Checking now.",
      toolCalls: [
        {
          id: "call_1",
          type: "function",
          function: { name: "get_weather", arguments: '{"city":"Boston"}' },
        },
      ],
    }),
    msg({ role: "tool", content: "72F and sunny", toolCallId: "call_1" }),
  ]);

  assert.match(prompt, /USER:\nWeather in Boston\?/);
  assert.match(prompt, /ASSISTANT:\nChecking now\./);
  assert.match(prompt, /TOOL_CALL id=call_1 name=get_weather/);
  assert.match(prompt, /ARGS:\n\{"city":"Boston"\}/);
  assert.match(prompt, /TOOL \(call_1\):\n72F and sunny/);
  assert.doesNotMatch(prompt, /\[tool_call/);
});

test("keeps TOOL (id) result lines for tool-role messages", () => {
  const prompt = toFunctionCallingPrompt([
    msg({ role: "tool", content: "ok", toolCallId: "abc" }),
  ]);
  assert.equal(prompt, "TOOL (abc):\nok");
});

test("encodes mixed history without bracket tool markup", () => {
  const prompt = toFunctionCallingPrompt([
    msg({ role: "system", content: "Be helpful." }),
    msg({ role: "user", content: "Run it." }),
    msg({
      role: "assistant",
      content: "",
      toolCalls: [
        {
          id: "call_a",
          type: "function",
          function: { name: "bash", arguments: '{"command":"ls"}' },
        },
        {
          id: "call_b",
          type: "function",
          function: { name: "read", arguments: "{}" },
        },
      ],
    }),
    msg({ role: "tool", content: "a.ts", toolCallId: "call_a" }),
  ]);

  assert.match(prompt, /SYSTEM:\nBe helpful\./);
  assert.match(prompt, /TOOL_CALL id=call_a name=bash/);
  assert.match(prompt, /TOOL_CALL id=call_b name=read/);
  assert.doesNotMatch(prompt, /\[tool_call/);
});
