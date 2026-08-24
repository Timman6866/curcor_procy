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

test("strips Tool: CallDynamicTool namespace/toolName/arguments dumps", () => {
  const input = [
    "Build succeeded.",
    "Tool: CallDynamicTool",
    "namespace: custom-user-tools",
    "toolName: Bash",
    "arguments: command: |",
    "  python3 <<'PY'",
    "  import urllib.request",
    "  print('health check')",
    "  PY",
    "Verifying the skin is live.",
  ].join("\n");

  const result = stripToolMarkup(input);
  assert.match(result, /Build succeeded/);
  assert.match(result, /Verifying the skin is live/);
  assert.doesNotMatch(result, /CallDynamicTool/);
  assert.doesNotMatch(result, /namespace:/);
  assert.doesNotMatch(result, /toolName:/);
  assert.doesNotMatch(result, /python3/);
});

test("strips multiple Tool: dumps with GetDynamicTools", () => {
  const input = [
    "Checking tools.",
    "Tool: GetDynamicTools",
    "namespace: custom-user-tools",
    "toolName: Edit",
    "arguments:",
    "  file_path: /tmp/a.ts",
    "Next step.",
  ].join("\n");

  const result = stripToolMarkup(input);
  assert.equal(result.trim(), "Checking tools.\nNext step.");
});

test("stream filter hides Tool: dumps split across chunks", () => {
  const filter = createToolMarkupStreamFilter();
  const parts = [
    filter.push("Status update.\n"),
    filter.push("Tool: Call"),
    filter.push("DynamicTool\n"),
    filter.push("namespace: custom-user-tools\n"),
    filter.push("toolName: Bash\n"),
    filter.push("arguments: command: ls\n"),
    filter.push("All clear."),
    filter.flush(),
  ];

  const result = parts.join("");
  assert.match(result, /Status update/);
  assert.match(result, /All clear/);
  assert.doesNotMatch(result, /CallDynamicTool/);
  assert.doesNotMatch(result, /namespace:/);
});

test("leaves prose that mentions Tool: without dump fields alone", () => {
  const input = "The Tool: section in the docs covers setup.\nSee namespace docs next.";
  // "Tool: section" does not match TOOL_DUMP_HEADER_RE (requires tool-like name after Tool:)
  assert.equal(stripToolMarkup(input), input);
});

test("strips namespace: dumps without a Tool: header", () => {
  const input = [
    "Checking icons.",
    "namespace: custom-user-tools",
    "toolName: Read",
    "arguments:",
    "  file_path: /tmp/skin.css",
    "Icons look good.",
  ].join("\n");

  const result = stripToolMarkup(input);
  assert.match(result, /Checking icons/);
  assert.match(result, /Icons look good/);
  assert.doesNotMatch(result, /namespace:/);
  assert.doesNotMatch(result, /toolName:/);
  assert.doesNotMatch(result, /file_path/);
});

test("strips inline namespace dump glued to prose", () => {
  const input =
    "Updated the icons.namespace: custom-user-tools toolName: Read arguments: file_path: /tmp/a.css";

  const result = stripToolMarkup(input);
  assert.match(result, /Updated the icons/);
  assert.doesNotMatch(result, /namespace:/);
  assert.doesNotMatch(result, /toolName:/);
  assert.doesNotMatch(result, /file_path/);
});

test("strips inline Tool: CallDynamicTool dump glued after a period", () => {
  const input = [
    "See the docs. Tool: CallDynamicTool",
    "namespace: custom-user-tools",
    "toolName: Bash",
    "arguments: command: ls",
    "Ready to ship.",
  ].join("\n");

  const result = stripToolMarkup(input);
  assert.match(result, /See the docs/);
  assert.match(result, /Ready to ship/);
  assert.doesNotMatch(result, /CallDynamicTool/);
  assert.doesNotMatch(result, /namespace:/);
});

test("stream filter hides inline namespace dumps split across chunks", () => {
  const filter = createToolMarkupStreamFilter();
  const parts = [
    filter.push("Updated the icons."),
    filter.push("namespace: custom-user-tools\n"),
    filter.push("toolName: Read\n"),
    filter.push("arguments: file_path: /tmp/a.css\n"),
    filter.push("All clear."),
    filter.flush(),
  ];

  const result = parts.join("");
  assert.match(result, /Updated the icons/);
  assert.match(result, /All clear/);
  assert.doesNotMatch(result, /namespace:/);
  assert.doesNotMatch(result, /toolName:/);
});

test("strips bare toolName/arguments dumps without Tool or namespace header", () => {
  const input = [
    "Prod is healthy and the branch is synced.",
    "toolName: Bash",
    "arguments: command: |",
    "  python3 <<'PY'",
    "  print('probe')",
    "  PY",
    "Next I'll confirm the running image.",
  ].join("\n");

  const result = stripToolMarkup(input);
  assert.match(result, /Prod is healthy/);
  assert.match(result, /Next I'll confirm/);
  assert.doesNotMatch(result, /toolName:/);
  assert.doesNotMatch(result, /arguments:/);
  assert.doesNotMatch(result, /python3/);
});

test("strips inline toolName dump glued to prose", () => {
  const input =
    'paths.toolName: Bash arguments: {"command":"REPO=/tmp find . -name tool-markup"}';

  const result = stripToolMarkup(input);
  assert.match(result, /paths/);
  assert.doesNotMatch(result, /toolName:/);
  assert.doesNotMatch(result, /arguments:/);
  assert.doesNotMatch(result, /REPO=/);
});

test("leaves ordinary arguments: prose alone", () => {
  const input = "The function takes three arguments: name, age, and city.";
  assert.equal(stripToolMarkup(input), input);
});

test("stream filter hides bare toolName dumps split across chunks", () => {
  const filter = createToolMarkupStreamFilter();
  const parts = [
    filter.push("Checking prod.\n"),
    filter.push("toolName: Bash\n"),
    filter.push("arguments: command: ls\n"),
    filter.push("All clear."),
    filter.flush(),
  ];

  const result = parts.join("");
  assert.match(result, /Checking prod/);
  assert.match(result, /All clear/);
  assert.doesNotMatch(result, /toolName:/);
  assert.doesNotMatch(result, /arguments:/);
});
