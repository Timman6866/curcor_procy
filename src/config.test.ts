import assert from "node:assert/strict";
import { test } from "node:test";
import {
  authorize,
  extractPresentedApiKey,
  type Config,
} from "./config.ts";

const base: Config = {
  port: 8787,
  host: "127.0.0.1",
  cursorApiKey: "cursor-secret",
  proxyApiKey: "proxy-secret",
  connectAuthToken: undefined,
  defaultModel: "composer-2.5",
  runtime: "local",
  cwd: "/tmp",
  toolsPolicy: "full",
  adminUsername: "admin",
  adminPassword: undefined,
};

test("extractPresentedApiKey reads Bearer, x-api-key, and raw Authorization", () => {
  assert.equal(extractPresentedApiKey({ authorization: "Bearer proxy-secret" }), "proxy-secret");
  assert.equal(extractPresentedApiKey({ authorization: "proxy-secret" }), "proxy-secret");
  assert.equal(extractPresentedApiKey({ "x-api-key": "proxy-secret" }), "proxy-secret");
  assert.equal(extractPresentedApiKey({ "api-key": "proxy-secret" }), "proxy-secret");
});

test("authorize accepts proxy key when configured", () => {
  assert.equal(authorize(base, { authorization: "Bearer proxy-secret" }), "cursor-secret");
  assert.equal(authorize(base, { "x-api-key": "proxy-secret" }), "cursor-secret");
});

test("authorize accepts cursor key when proxy key is configured", () => {
  assert.equal(authorize(base, { authorization: "Bearer cursor-secret" }), "cursor-secret");
});

test("authorize rejects unknown keys when proxy key is configured", () => {
  assert.throws(() => authorize(base, { authorization: "Bearer wrong" }), /Invalid API key/);
});

test("authorize falls back to cursor key when proxy key is unset", () => {
  assert.equal(
    authorize({ ...base, proxyApiKey: undefined }, {}),
    "cursor-secret",
  );
});
