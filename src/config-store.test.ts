import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { Config } from "./config.ts";
import { ConfigStore } from "./config-store.ts";

const baseEnv: Config = {
  port: 8787,
  host: "127.0.0.1",
  cursorApiKey: "cursor-env",
  proxyApiKey: undefined,
  connectAuthToken: undefined,
  defaultModel: "composer-2.5",
  runtime: "local",
  cwd: "/tmp/proxy-test",
  toolsPolicy: "full",
  adminUsername: "admin",
  adminPassword: "secret",
};

test("applies and persists runtime settings", () => {
  const dir = mkdtempSync(join(tmpdir(), "proxy-settings-"));
  const settingsPath = join(dir, "proxy-settings.json");

  try {
    const store = new ConfigStore(baseEnv, settingsPath, "generated-token");
    store.applySettings({
      defaultModel: "composer-2.5-thinking",
      runtime: "cloud",
      toolsMode: "custom",
      tools: ["read", "mcp"],
      cwd: dir,
      proxyApiKey: "proxy-runtime",
    });

    const current = store.get();
    assert.equal(current.defaultModel, "composer-2.5-thinking");
    assert.equal(current.runtime, "cloud");
    assert.deepEqual(current.toolsPolicy, ["read", "mcp"]);
    assert.equal(current.proxyApiKey, "proxy-runtime");

    const reloaded = new ConfigStore(baseEnv, settingsPath, "generated-token");
    assert.equal(reloaded.get().defaultModel, "composer-2.5-thinking");
    assert.equal(reloaded.get().runtime, "cloud");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("reset restores environment defaults", () => {
  const dir = mkdtempSync(join(tmpdir(), "proxy-settings-"));
  const settingsPath = join(dir, "proxy-settings.json");

  try {
    const store = new ConfigStore(baseEnv, settingsPath, "generated-token");
    store.applySettings({ toolsMode: "none" });
    store.applySettings({ resetToEnv: true });

    assert.equal(store.get().toolsPolicy, "full");
    assert.equal(readFileSync(settingsPath, "utf8").trim(), "{}");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("regenerates connect token when requested", () => {
  const dir = mkdtempSync(join(tmpdir(), "proxy-settings-"));
  const settingsPath = join(dir, "proxy-settings.json");

  try {
    const store = new ConfigStore(baseEnv, settingsPath, "token-one");
    assert.equal(store.getConnectAuthToken(), "token-one");
    store.applySettings({ connectAuthToken: null, regenerateConnectToken: true });
    assert.notEqual(store.getConnectAuthToken(), "token-one");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("persists disabled model visibility", () => {
  const dir = mkdtempSync(join(tmpdir(), "proxy-settings-"));
  const settingsPath = join(dir, "proxy-settings.json");

  try {
    const store = new ConfigStore(baseEnv, settingsPath, "generated-token");
    store.setDisabledModels(["grok-4.6", "gpt-5.5"]);
    assert.deepEqual(store.filterModelIds(["composer-2.5", "grok-4.6", "gpt-5.5"]), ["composer-2.5"]);

    const reloaded = new ConfigStore(baseEnv, settingsPath, "generated-token");
    assert.deepEqual(reloaded.getDisabledModels(), ["gpt-5.5", "grok-4.6"]);
    assert.deepEqual(reloaded.filterModelIds(["composer-2.5", "grok-4.6"]), ["composer-2.5"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
