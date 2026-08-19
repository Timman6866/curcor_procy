import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseLogPolicy,
  resetLogPolicyForTests,
  validateNoLogBootRequirements,
} from "./logging.ts";
import { clearRequestLogForTests, listRequestLog, recordRequest } from "./request-log.ts";

test("parseLogPolicy accepts standard aliases", () => {
  assert.equal(parseLogPolicy(undefined), "standard");
  assert.equal(parseLogPolicy("standard"), "standard");
  assert.equal(parseLogPolicy("no-log"), "no-log");
  assert.equal(parseLogPolicy("nolog"), "no-log");
  assert.equal(parseLogPolicy("none"), "no-log");
});

test("no-log does not retain request log entries", () => {
  resetLogPolicyForTests("no-log");
  clearRequestLogForTests();
  recordRequest({
    method: "GET",
    url: "/health",
    statusCode: 200,
    responseTimeMs: 1,
  });
  assert.deepEqual(listRequestLog(), []);
  resetLogPolicyForTests();
});

test("standard mode retains request log entries", () => {
  resetLogPolicyForTests("standard");
  clearRequestLogForTests();
  recordRequest({
    method: "POST",
    url: "/v1/chat/completions",
    statusCode: 200,
    responseTimeMs: 42,
  });
  assert.equal(listRequestLog().length, 1);
  assert.equal(listRequestLog()[0]?.url, "/v1/chat/completions");
  resetLogPolicyForTests();
  clearRequestLogForTests();
});

test("no-log boot validation requires CONNECT_AUTH_TOKEN", () => {
  assert.throws(
    () => validateNoLogBootRequirements("no-log", undefined),
    /CONNECT_AUTH_TOKEN/,
  );
  assert.throws(
    () => validateNoLogBootRequirements("no-log", "   "),
    /CONNECT_AUTH_TOKEN/,
  );
  assert.doesNotThrow(() => validateNoLogBootRequirements("no-log", "pinned-token"));
  assert.doesNotThrow(() => validateNoLogBootRequirements("standard", undefined));
});
