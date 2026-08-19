import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { emptyUsage } from "./openai-format.ts";
import {
  assertQuotaAllows,
  buildUsageReport,
  flushUsageStore,
  initUsageStore,
  listUsageReports,
  markKeyDeleted,
  QuotaExceededError,
  recordPersistedKeyUsage,
  resetUsageStoreForTests,
} from "./usage-store.ts";

test("persists lifetime and daily usage with debounced flush", async () => {
  const dir = mkdtempSync(join(tmpdir(), "proxy-usage-"));
  const settingsPath = join(dir, "proxy-settings.json");

  try {
    initUsageStore(settingsPath);
    recordPersistedKeyUsage("key-1", { label: "Client", prefix: "sk-prox…" }, {
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
    });
    flushUsageStore();

    initUsageStore(settingsPath);
    const report = buildUsageReport("key-1");
    assert.equal(report?.totalTokens, 15);
    assert.equal(report?.today.totalTokens, 15);
    assert.equal(report?.monthToDate.totalTokens, 15);

    const raw = JSON.parse(readFileSync(join(dir, "proxy-usage.json"), "utf8")) as {
      keys: Record<string, unknown>;
    };
    assert.ok(raw.keys["key-1"]);
  } finally {
    resetUsageStoreForTests();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("keeps retired key usage history", () => {
  const dir = mkdtempSync(join(tmpdir(), "proxy-usage-"));
  const settingsPath = join(dir, "proxy-settings.json");

  try {
    initUsageStore(settingsPath);
    recordPersistedKeyUsage("retired", { label: "Old", prefix: "sk-old…" }, emptyUsage(), 1);
    markKeyDeleted("retired", { label: "Old", prefix: "sk-old…" });
    flushUsageStore();

    const reports = listUsageReports(new Set());
    assert.equal(reports.retired.length, 1);
    assert.equal(reports.retired[0]?.apiKeyId, "retired");
    assert.ok(reports.retired[0]?.deletedAt);
  } finally {
    resetUsageStoreForTests();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("enforces token quotas", () => {
  const dir = mkdtempSync(join(tmpdir(), "proxy-usage-"));
  const settingsPath = join(dir, "proxy-settings.json");

  try {
    initUsageStore(settingsPath);
    recordPersistedKeyUsage("limited", { label: "Limited", prefix: "sk-lim…" }, {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 100,
    });

    assert.throws(
      () => assertQuotaAllows("limited", { maxTotalTokens: 100 }),
      QuotaExceededError,
    );
    assert.throws(
      () => assertQuotaAllows("limited", { maxDailyTokens: 100 }),
      QuotaExceededError,
    );
    assert.doesNotThrow(() => assertQuotaAllows("limited", { maxTotalTokens: 101 }));
  } finally {
    resetUsageStoreForTests();
    rmSync(dir, { recursive: true, force: true });
  }
});
