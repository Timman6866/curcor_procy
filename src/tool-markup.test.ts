import assert from "node:assert/strict";
import { test } from "node:test";
import { createToolMarkupStreamFilter, stripToolMarkup } from "./tool-markup.ts";

test("strips a full [tool_call ...] block and keeps surrounding prose", () => {
  const input = [
    "Updating fixtures next.",
    '[tool_call id=call_abc name=CallDynamicTool args={"namespace":"custom-user-tools","toolName":"Bash","arguments":{"command":"ls"}}]',
    "Then re-run the tests.",
  ].join("\n");

  const result = stripToolMarkup(input);
  assert.match(result, /Updating fixtures next/);
  assert.match(result, /Then re-run the tests/);
  assert.doesNotMatch(result, /\[tool_call/);
  assert.doesNotMatch(result, /CallDynamicTool/);
});

test("strips multiple consecutive tool_call lines", () => {
  const input = [
    "Working on it.",
    '[tool_call id=call_1 name=Read args={"file_path":"/tmp/a.ts"}]',
    '[tool_call id=call_2 name=GetDynamicTools args={"namespace":"custom-user-tools"}]',
    "Done.",
  ].join("\n");

  const result = stripToolMarkup(input);
  assert.equal(result.trim(), "Working on it.\nDone.");
});

test("strips truncated orphan fragments like screenshot leaks", () => {
  const input = [
    "Worked for 11m 13s.",
    "a91f5e27f6a3_1 name=CallDynamicTool args={\"namespace\":\"custom-user-tools\",\"toolName\":\"Read\"}",
    "Still going.",
  ].join("\n");

  const result = stripToolMarkup(input);
  assert.match(result, /Worked for 11m/);
  assert.match(result, /Still going/);
  assert.doesNotMatch(result, /CallDynamicTool/);
  assert.doesNotMatch(result, /a91f5e27f6a3_1/);
});

test("strips XML tool_call blocks", () => {
  const input = 'Hello\n<tool_call>{"name":"Bash"}</tool_call>\nWorld';
  const result = stripToolMarkup(input);
  assert.equal(result.trim(), "Hello\nWorld");
});

test("preserves nested braces inside args without truncating early", () => {
  const input =
    'Before\n[tool_call id=call_x name=Bash args={"command":"echo {a:1}","nested":{"b":[2,3]}}]\nAfter';
  const result = stripToolMarkup(input);
  assert.equal(result.trim(), "Before\nAfter");
});

test("leaves ordinary prose and code fences that mention tools alone", () => {
  const input = [
    "Use a tool call when needed.",
    "```json",
    '{"tool":"weather","args":{"city":"Boston"}}',
    "```",
    "name=something_else is fine.",
  ].join("\n");

  assert.equal(stripToolMarkup(input), input);
});

test("stream filter hides tags split across chunks", () => {
  const filter = createToolMarkupStreamFilter();
  const parts = [
    filter.push("Status: "),
    filter.push("[tool_cal"),
    filter.push('l id=call_1 name=CallDynamicTool args={"x":1}]'),
    filter.push("\nAll clear."),
    filter.flush(),
  ];

  const result = parts.join("");
  assert.match(result, /Status:/);
  assert.match(result, /All clear/);
  assert.doesNotMatch(result, /tool_call/);
  assert.doesNotMatch(result, /CallDynamicTool/);
});

test("stream flush drops incomplete tool markup without leaking it", () => {
  const filter = createToolMarkupStreamFilter();
  const emitted = filter.push("Prose\n[tool_call id=call_1 name=Bash args={");
  const flushed = filter.flush();
  const result = emitted + flushed;
  assert.match(result, /Prose/);
  assert.doesNotMatch(result, /\[tool_call/);
  assert.doesNotMatch(result, /args=/);
});

test("stream filter holds and drops incomplete orphan fragments", () => {
  const filter = createToolMarkupStreamFilter();
  const parts = [
    filter.push("Intro\n"),
    filter.push("fc_ba2e0e52_1"),
    filter.push(" name=CallDynamicTool args={\"toolName\":\"Edit\"}"),
    filter.push("\nOutro"),
    filter.flush(),
  ];
  const result = parts.join("");
  assert.match(result, /Intro/);
  assert.match(result, /Outro/);
  assert.doesNotMatch(result, /CallDynamicTool/);
});
