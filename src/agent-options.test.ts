import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAgentOptions, parseAgentRequestOptions, parseToolsPolicy } from "./agent-options.ts";
import type { Config } from "./config.ts";

const baseConfig: Config = {
  port: 8787,
  host: "127.0.0.1",
  cursorApiKey: "test-key",
  proxyApiKey: undefined,
  connectAuthToken: undefined,
  defaultModel: "composer-2.5",
  runtime: "local",
  cwd: "/tmp/scratch",
  toolsPolicy: "full",
};

test("defaults to the full Cursor tool suite", () => {
  const options = buildAgentOptions(baseConfig, "key", "composer-2.5");
  assert.equal("tools" in options, false);
  assert.equal("disallowedTools" in options, false);
});

test("supports text-only mode on local agents", () => {
  const options = buildAgentOptions(
    { ...baseConfig, toolsPolicy: "none" },
    "key",
    "composer-2.5",
  );
  assert.deepEqual(options.tools, []);
});

test("supports allowlisted tools on local agents", () => {
  const options = buildAgentOptions(baseConfig, "key", "composer-2.5", {
    tools: ["read", "grep", "shell"],
  });
  assert.deepEqual(options.tools, ["read", "grep", "shell"]);
});

test("does not pass tools arrays to cloud agents", () => {
  const options = buildAgentOptions(
    { ...baseConfig, runtime: "cloud", toolsPolicy: "none" },
    "key",
    "composer-2.5",
  );
  assert.equal("tools" in options, false);
  assert.deepEqual(options.cloud?.repos, []);
});

test("parses connect CreateAgent tool options", () => {
  const parsed = parseAgentRequestOptions(baseConfig, {
    local: { cwd: ["/repo"] },
    tools: { names: ["read", "edit", "shell", "mcp"] },
    mode: "agent",
  });
  assert.equal(parsed.runtime, "local");
  assert.equal(parsed.cwd, "/repo");
  assert.deepEqual(parsed.tools, ["read", "edit", "shell", "mcp"]);
  assert.equal(parsed.mode, "agent");
});

test("parseToolsPolicy handles env-style values", () => {
  assert.equal(parseToolsPolicy(undefined), "full");
  assert.equal(parseToolsPolicy("none"), "none");
  assert.deepEqual(parseToolsPolicy("read,grep,shell"), ["read", "grep", "shell"]);
});
