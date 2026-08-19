import assert from "node:assert/strict";
import { test } from "node:test";
import {
  authorize,
  extractPresentedApiKey,
  type Config,
} from "./config.ts";
import { envProxyApiKeys, newProxyApiKey } from "./proxy-api-keys.ts";

const base: Config = {
  port: 8787,
  host: "127.0.0.1",
  cursorApiKey: "cursor-secret",
  proxyApiKeys: envProxyApiKeys("proxy-secret"),
  connectAuthToken: undefined,
  defaultModel: "composer-2.5",
  runtime: "local",
  cwd: "/tmp",
  toolsPolicy: "full",
  adminUsername: "admin",
  adminPassword: undefined,
  logPolicy: "standard",
};

test("extractPresentedApiKey reads Bearer, x-api-key, and raw Authorization", () => {
  assert.equal(extractPresentedApiKey({ authorization: "Bearer proxy-secret" }), "proxy-secret");
  assert.equal(extractPresentedApiKey({ authorization: "proxy-secret" }), "proxy-secret");
  assert.equal(extractPresentedApiKey({ "x-api-key": "proxy-secret" }), "proxy-secret");
  assert.equal(extractPresentedApiKey({ "api-key": "proxy-secret" }), "proxy-secret");
});

test("authorize accepts proxy key when configured", () => {
  const auth = authorize(base, { authorization: "Bearer proxy-secret" });
  assert.equal(auth.cursorApiKey, "cursor-secret");
  assert.equal(auth.method, "proxy-key");
  assert.equal(auth.proxyKeyId, "env");
});

test("authorize accepts any configured proxy key", () => {
  const auth = authorize(
    {
      ...base,
      proxyApiKeys: [
        newProxyApiKey("first-key", "First"),
        newProxyApiKey("second-key", "Second"),
      ],
    },
    { "x-api-key": "second-key" },
  );
  assert.equal(auth.method, "proxy-key");
  assert.ok(auth.proxyKeyId);
});

test("authorize accepts cursor key when proxy keys are configured", () => {
  const auth = authorize(base, { authorization: "Bearer cursor-secret" });
  assert.equal(auth.cursorApiKey, "cursor-secret");
  assert.equal(auth.method, "cursor-key");
  assert.equal(auth.proxyKeyId, undefined);
});

test("authorize rejects unknown keys when proxy keys are configured", () => {
  assert.throws(() => authorize(base, { authorization: "Bearer wrong" }), /Invalid API key/);
});

test("authorize falls back to cursor key when proxy keys are unset", () => {
  const auth = authorize({ ...base, proxyApiKeys: [] }, {});
  assert.equal(auth.cursorApiKey, "cursor-secret");
  assert.equal(auth.method, "open");
});
