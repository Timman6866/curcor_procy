import type { TokenCounts } from "./openai-format.ts";
import { keyPrefix, type KeyQuota } from "./proxy-api-keys.ts";
import {
  assertQuotaAllows,
  buildUsageReport,
  listUsageReports,
  markKeyDeleted,
  recordPersistedKeyUsage,
  resetUsageStoreForTests,
  syncActiveKeyMeta,
  type UsageReport,
} from "./usage-store.ts";

export type { KeyQuota, UsageReport };
export { QuotaExceededError } from "./usage-store.ts";

export interface UsageSnapshot {
  apiKeyId: string;
  label: string;
  prefix: string;
  requestCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  lastUsedAt?: string;
  today: {
    requestCount: number;
    totalTokens: number;
  };
  monthToDate: {
    requestCount: number;
    totalTokens: number;
  };
}

export function recordKeyUsage(
  keyId: string,
  meta: { label: string; prefix: string },
  tokenUsage: TokenCounts,
  requestDelta = 1,
): void {
  recordPersistedKeyUsage(keyId, meta, tokenUsage, requestDelta);
}

export function syncUsageKeyCatalog(
  keys: Array<{ id: string; label: string; secret: string }>,
): void {
  syncActiveKeyMeta(keys, keyPrefix);
}

export function retireKeyUsage(
  keyId: string,
  meta: { label: string; prefix: string },
): void {
  markKeyDeleted(keyId, meta);
}

export function checkKeyQuota(keyId: string, quota: KeyQuota | undefined): void {
  assertQuotaAllows(keyId, quota);
}

export function getKeyUsageSnapshot(keyId: string): UsageSnapshot | undefined {
  const report = buildUsageReport(keyId);
  if (!report) return undefined;
  return toSnapshot(report);
}

export function listKeyUsageSnapshots(
  keys: Array<{ id: string; label: string; secret: string }>,
): { active: UsageSnapshot[]; retired: UsageSnapshot[] } {
  const activeIds = new Set(keys.map((key) => key.id));
  syncActiveKeyMeta(keys, keyPrefix);
  const reports = listUsageReports(activeIds);
  return {
    active: reports.active.map(toSnapshot),
    retired: reports.retired.map(toSnapshot),
  };
}

function toSnapshot(report: UsageReport): UsageSnapshot {
  return {
    apiKeyId: report.apiKeyId,
    label: report.label,
    prefix: report.prefix,
    requestCount: report.requestCount,
    promptTokens: report.promptTokens,
    completionTokens: report.completionTokens,
    totalTokens: report.totalTokens,
    lastUsedAt: report.lastUsedAt,
    today: {
      requestCount: report.today.requestCount,
      totalTokens: report.today.totalTokens,
    },
    monthToDate: {
      requestCount: report.monthToDate.requestCount,
      totalTokens: report.monthToDate.totalTokens,
    },
  };
}

export function clearUsageForTests(): void {
  resetUsageStoreForTests();
}
