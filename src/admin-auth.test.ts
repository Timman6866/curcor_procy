import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createSessionToken,
  readSessionCookie,
  verifySessionToken,
} from "./admin-auth.ts";

test("creates and verifies admin session tokens", () => {
  const token = createSessionToken("admin", "secret-password", 1_000);
  const session = verifySessionToken(token, "secret-password", 2_000);
  assert.equal(session?.username, "admin");
});

test("rejects expired admin session tokens", () => {
  const token = createSessionToken("admin", "secret-password", 1_000);
  assert.equal(verifySessionToken(token, "secret-password", 86_402_000), null);
});

test("reads admin session cookie from cookie header", () => {
  const value = readSessionCookie("foo=bar; admin_session=abc.def; other=1");
  assert.equal(value, "abc.def");
});
