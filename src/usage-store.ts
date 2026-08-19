import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { TokenCounts } from "./openai-format.ts";

export interface UsageBucket {
  requestCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface UsageTotals extends UsageBucket {
  lastUsedAt?: string;
}

export interface KeyQuota {
  maxTotalTokens?: number;
  maxDailyTokens?: number;
  maxMonthlyTokens?: number;
}

export interface StoredKeyUsage {
  label: string;
  prefix: string;
  deletedAt?: string;
  lifetime: UsageTotals;
  daily: Record<string, UsageBucket>;
}

export interface UsageReport extends UsageTotals {
  apiKeyId: string;
  label: string;
  prefix: string;
  deletedAt?: string;
  today: UsageBucket;
  monthToDate: UsageBucket;
}

interface UsageFile {
  version: 1;
  keys: Record<string, StoredKeyUsage>;
}

const emptyBucket = (): UsageBucket => ({
  requestCount: 0,
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
});

let storePath: string | undefined;
let data: UsageFile = { version: 1, keys: {} };
let persistTimer: ReturnType<typeof setTimeout> | undefined;
let persistPending = false;

function todayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function monthPrefix(date = new Date()): string {
  return date.toISOString().slice(0, 7);
}

function sumMonthDaily(daily: Record<string, UsageBucket>, month: string): UsageBucket {
  const totals = emptyBucket();
  for (const [day, bucket] of Object.entries(daily)) {
    if (!day.startsWith(month)) continue;
    totals.requestCount += bucket.requestCount;
    totals.promptTokens += bucket.promptTokens;
    totals.completionTokens += bucket.completionTokens;
    totals.totalTokens += bucket.totalTokens;
  }
  return totals;
}

function normalizeBucket(value: unknown): UsageBucket {
  const record = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  return {
    requestCount: typeof record.requestCount === "number" ? record.requestCount : 0,
    promptTokens: typeof record.promptTokens === "number" ? record.promptTokens : 0,
    completionTokens: typeof record.completionTokens === "number" ? record.completionTokens : 0,
    totalTokens: typeof record.totalTokens === "number" ? record.totalTokens : 0,
  };
}

function normalizeStoredKeyUsage(value: unknown): StoredKeyUsage | undefined {
  const record = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
  if (!record || typeof record.label !== "string" || typeof record.prefix !== "string") return undefined;

  const lifetimeRecord =
    typeof record.lifetime === "object" && record.lifetime !== null
      ? (record.lifetime as Record<string, unknown>)
      : {};
  const lifetime = normalizeBucket(lifetimeRecord);
  const lastUsedAt =
    typeof lifetimeRecord.lastUsedAt === "string" ? lifetimeRecord.lastUsedAt : undefined;

  const daily: Record<string, UsageBucket> = {};
  if (typeof record.daily === "object" && record.daily !== null) {
    for (const [day, bucket] of Object.entries(record.daily as Record<string, unknown>)) {
      daily[day] = normalizeBucket(bucket);
    }
  }

  return {
    label: record.label,
    prefix: record.prefix,
    deletedAt: typeof record.deletedAt === "string" ? record.deletedAt : undefined,
    lifetime: { ...lifetime, lastUsedAt },
    daily,
  };
}

function loadFromDisk(path: string): UsageFile {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    const record = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
    const keys: Record<string, StoredKeyUsage> = {};
    if (typeof record.keys === "object" && record.keys !== null) {
      for (const [id, value] of Object.entries(record.keys as Record<string, unknown>)) {
        const normalized = normalizeStoredKeyUsage(value);
        if (normalized) keys[id] = normalized;
      }
    }
    return { version: 1, keys };
  } catch {
    return { version: 1, keys: {} };
  }
}

function schedulePersist(): void {
  if (!storePath) return;
  persistPending = true;
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = undefined;
    if (!persistPending || !storePath) return;
    persistPending = false;
    mkdirSync(dirname(storePath), { recursive: true });
    writeFileSync(storePath, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  }, 2000);
}

export function initUsageStore(settingsPath: string): void {
  const dir = dirname(resolve(settingsPath));
  storePath = resolve(dir, "proxy-usage.json");
  data = loadFromDisk(storePath);
}

export function flushUsageStore(): void {
  if (!storePath) return;
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = undefined;
  }
  persistPending = false;
  mkdirSync(dirname(storePath), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
}

export function resetUsageStoreForTests(): void {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = undefined;
  }
  storePath = undefined;
  data = { version: 1, keys: {} };
  persistPending = false;
}

function ensureKey(keyId: string, meta: { label: string; prefix: string }): StoredKeyUsage {
  const existing = data.keys[keyId];
  if (existing) {
    existing.label = meta.label;
    existing.prefix = meta.prefix;
    return existing;
  }
  const created: StoredKeyUsage = {
    label: meta.label,
    prefix: meta.prefix,
    lifetime: emptyBucket(),
    daily: {},
  };
  data.keys[keyId] = created;
  return created;
}

export function syncActiveKeyMeta(
  keys: Array<{ id: string; label: string; secret: string }>,
  prefixFn: (secret: string) => string,
): void {
  for (const key of keys) {
    ensureKey(key.id, { label: key.label, prefix: prefixFn(key.secret) });
  }
  schedulePersist();
}

export function markKeyDeleted(
  keyId: string,
  meta: { label: string; prefix: string },
): void {
  const entry = ensureKey(keyId, meta);
  entry.deletedAt = new Date().toISOString();
  schedulePersist();
}

export function recordPersistedKeyUsage(
  keyId: string,
  meta: { label: string; prefix: string },
  tokenUsage: TokenCounts,
  requestDelta = 1,
  at = new Date(),
): void {
  const entry = ensureKey(keyId, meta);
  const day = todayKey(at);

  entry.lifetime.requestCount += requestDelta;
  entry.lifetime.promptTokens += tokenUsage.promptTokens;
  entry.lifetime.completionTokens += tokenUsage.completionTokens;
  entry.lifetime.totalTokens += tokenUsage.totalTokens;
  entry.lifetime.lastUsedAt = at.toISOString();

  const daily = entry.daily[day] ?? emptyBucket();
  daily.requestCount += requestDelta;
  daily.promptTokens += tokenUsage.promptTokens;
  daily.completionTokens += tokenUsage.completionTokens;
  daily.totalTokens += tokenUsage.totalTokens;
  entry.daily[day] = daily;

  schedulePersist();
}

export function getStoredKeyUsage(keyId: string): StoredKeyUsage | undefined {
  const entry = data.keys[keyId];
  return entry ? structuredClone(entry) : undefined;
}

export function buildUsageReport(keyId: string, at = new Date()): UsageReport | undefined {
  const entry = data.keys[keyId];
  if (!entry) return undefined;

  const today = entry.daily[todayKey(at)] ?? emptyBucket();
  const monthToDate = sumMonthDaily(entry.daily, monthPrefix(at));

  return {
    apiKeyId: keyId,
    label: entry.label,
    prefix: entry.prefix,
    deletedAt: entry.deletedAt,
    ...entry.lifetime,
    today,
    monthToDate,
  };
}

export function listUsageReports(
  activeKeyIds: Set<string>,
  at = new Date(),
): { active: UsageReport[]; retired: UsageReport[] } {
  const active: UsageReport[] = [];
  const retired: UsageReport[] = [];

  for (const keyId of Object.keys(data.keys)) {
    const report = buildUsageReport(keyId, at);
    if (!report) continue;
    if (activeKeyIds.has(keyId)) active.push(report);
    else if (report.deletedAt || report.requestCount > 0) retired.push(report);
  }

  active.sort((a, b) => a.label.localeCompare(b.label));
  retired.sort((a, b) => (b.deletedAt ?? "").localeCompare(a.deletedAt ?? ""));

  return { active, retired };
}

export class QuotaExceededError extends Error {
  constructor(
    message: string,
    readonly scope: "total" | "daily" | "monthly",
  ) {
    super(message);
    this.name = "QuotaExceededError";
  }
}

export function assertQuotaAllows(
  keyId: string,
  quota: KeyQuota | undefined,
  at = new Date(),
): void {
  if (!quota) return;

  const entry = data.keys[keyId];
  const lifetimeTotal = entry?.lifetime.totalTokens ?? 0;
  const todayTotal = entry?.daily[todayKey(at)]?.totalTokens ?? 0;
  const monthTotal = entry ? sumMonthDaily(entry.daily, monthPrefix(at)).totalTokens : 0;

  if (quota.maxTotalTokens !== undefined && lifetimeTotal >= quota.maxTotalTokens) {
    throw new QuotaExceededError(
      `API key quota exceeded: lifetime token limit (${quota.maxTotalTokens}).`,
      "total",
    );
  }
  if (quota.maxDailyTokens !== undefined && todayTotal >= quota.maxDailyTokens) {
    throw new QuotaExceededError(
      `API key quota exceeded: daily token limit (${quota.maxDailyTokens}).`,
      "daily",
    );
  }
  if (quota.maxMonthlyTokens !== undefined && monthTotal >= quota.maxMonthlyTokens) {
    throw new QuotaExceededError(
      `API key quota exceeded: monthly token limit (${quota.maxMonthlyTokens}).`,
      "monthly",
    );
  }
}

export function usageStorePath(): string | undefined {
  return storePath;
}
