import { stripToolMarkup } from "./src/tool-markup.ts";

const cases: Array<{ name: string; input: string }> = [
  {
    name: "bracketed-with-mcpDetails",
    input: [
      "Updating fixtures.",
      '[tool_call id=call_call-fix-daily-brief-1 fc_8c0ddd75-9a78-94fa-8da4-7793a717830f_0 name=CallDynamicTool args={"namespace": "custom-user-tools", "toolName": "Read", "arguments": {"file_path": "/tmp/a.ts"}, "mcpDetails": {"description": "Read fixtures"}}]',
      "Done.",
    ].join("\n"),
  },
  {
    name: "orphan-partial",
    input: [
      "Worked.",
      'a91f5e27f6a3_1 name=CallDynamicTool args={"namespace":"custom-user-tools","toolName":"Bash","mcpDetails":{"description":"x"}}]',
      "Next.",
    ].join("\n"),
  },
  {
    name: "namespace-dump-no-Tool-header",
    input: [
      "Inspecting the widget rail markup and styles so we can tighten scale and polish the icons.",
      "namespace: custom-user-tools",
      "toolName: Read",
      "arguments: file_path: /home/docker-user/Docker/hermes_agents/apps/ego-portal-next/src/features/shell/launcherIcons.tsx",
      "namespace: custom-user-tools",
      "toolName: Bash",
      'arguments: command: | sed -n "1166,1400p" /tmp/a.css',
      "description: Read widget rail CSS and icon markup",
    ].join("\n"),
  },
  {
    name: "inline-after-prose",
    input: [
      "polish the icons.namespace: custom-user-tools",
      "toolName: Read",
      'arguments: {"x":1}',
    ].join("\n"),
  },
  {
    name: "tool-colon-inline",
    input: [
      "Build succeeded. Verifying the skin is live, then updating the design docs. Tool: CallDynamicTool namespace: custom-user-tools toolName: Bash arguments: command: |",
      "import re",
    ].join("\n"),
  },
  {
    name: "flat-inline-single-line",
    input:
      "Inspecting the widget rail markup and styles so we can tighten scale and polish the icons.namespace: custom-user-tools toolName: Read arguments: file_path: /home/docker-user/Docker/hermes_agents/apps/ego-portal-next/src/features/shell/launcherIcons.tsx",
  },
];

for (const c of cases) {
  const out = stripToolMarkup(c.input);
  const leaked = /CallDynamicTool|\[tool_call|namespace:|toolName:|mcpDetails/.test(out);
  console.log(c.name, leaked ? "LEAK" : "OK");
  console.log(JSON.stringify(out));
  console.log("---");
}
