import assert from "node:assert/strict";
import { test } from "node:test";
import { buildFunctionCallingAgentOptions, parseOpenAiTools } from "./openai-tools.ts";
import type { Config } from "./config.ts";
import { normalizeBody } from "./normalize.ts";
import { chatCompletion, streamToolCallChunks } from "./openai-format.ts";

const baseConfig: Config = {
  port: 8787,
  host: "127.0.0.1",
  cursorApiKey: "test-key",
  proxyApiKey: undefined,
  connectAuthToken: undefined,
  defaultModel: "composer-2.5",
  runtime: "local",
  cwd: "/tmp/scratch",
  toolsPolicy: "none",
};

test("function calling keeps MCP enabled for custom OpenAI tools", () => {
  const pending = { calls: null };
  const options = buildFunctionCallingAgentOptions(
    baseConfig,
    "key",
    "composer-2.5",
    [
      {
        type: "function",
        function: { name: "bash", parameters: { type: "object", properties: {} } },
      },
    ],
    pending,
  );

  assert.deepEqual(options.tools, ["mcp"]);
  assert.equal(Object.keys(options.local?.customTools ?? {}).length, 1);
  assert.equal(options.local?.customTools?.bash?.description, undefined);
});

test("parses OpenAI function tools from chat completion body", () => {
  const tools = parseOpenAiTools([
    {
      type: "function",
      function: {
        name: "get_weather",
        description: "Get weather",
        parameters: {
          type: "object",
          properties: { city: { type: "string" } },
        },
      },
    },
  ]);
  assert.equal(tools.length, 1);
  assert.equal(tools[0]?.function.name, "get_weather");
});

test("normalizes assistant tool_calls and tool result messages", () => {
  const req = normalizeBody({
    model: "composer-2.5",
    tools: [{ type: "function", function: { name: "get_weather", parameters: { type: "object" } } }],
    messages: [
      { role: "user", content: "Weather in Boston?" },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "get_weather", arguments: "{\"city\":\"Boston\"}" },
          },
        ],
      },
      { role: "tool", tool_call_id: "call_1", content: "72F and sunny" },
    ],
  });

  assert.equal(req.tools.length, 1);
  assert.equal(req.messages[1]?.toolCalls[0]?.function.name, "get_weather");
  assert.equal(req.messages[2]?.role, "tool");
  assert.equal(req.messages[2]?.toolCallId, "call_1");
});

test("formats non-streaming tool call responses", () => {
  const response = chatCompletion({
    id: "chatcmpl_test",
    created: 1,
    model: "composer-2.5",
    content: null,
    finishReason: "tool_calls",
    toolCalls: [
      {
        id: "call_1",
        type: "function",
        function: { name: "get_weather", arguments: "{\"city\":\"Boston\"}" },
      },
    ],
    usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
  });

  assert.equal(response.choices[0]?.finish_reason, "tool_calls");
  assert.equal(
    (response.choices[0]?.message as { tool_calls?: unknown[] }).tool_calls?.length,
    1,
  );
});

test("formats streaming tool call chunks", () => {
  const chunks = streamToolCallChunks({
    id: "chatcmpl_test",
    created: 1,
    model: "composer-2.5",
    toolCalls: [
      {
        id: "call_1",
        type: "function",
        function: { name: "get_weather", arguments: "{\"city\":\"Boston\"}" },
      },
    ],
  });
  assert.equal(chunks.length, 3);
  assert.equal(chunks.at(-1)?.choices[0]?.finish_reason, "tool_calls");
});
