import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { clearUsageForTests, listKeyUsageSnapshots, recordKeyUsage } from "./usage-meter.ts";
import { flushUsageStore, initUsageStore } from "./usage-store.ts";

test("records persisted usage per proxy key id", () => {
  const dir = mkdtempSync(join(tmpdir(), "proxy-usage-"));
  const settingsPath = join(dir, "proxy-settings.json");

  try {
    initUsageStore(settingsPath);
    recordKeyUsage("key-a", { label: "A", prefix: "sk-a…" }, {
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
    });
    recordKeyUsage("key-a", { label: "A", prefix: "sk-a…" }, {
      promptTokens: 2,
      completionTokens: 1,
      totalTokens: 3,
    });
    flushUsageStore();

    initUsageStore(settingsPath);
    const snapshots = listKeyUsageSnapshots([
      { id: "key-a", label: "A", secret: "sk-proxy-aaaa" },
    ]);

    assert.equal(snapshots.active[0]?.requestCount, 2);
    assert.equal(snapshots.active[0]?.totalTokens, 18);
    assert.equal(snapshots.active[0]?.monthToDate.totalTokens, 18);
  } finally {
    clearUsageForTests();
    rmSync(dir, { recursive: true, force: true });
  }
});
