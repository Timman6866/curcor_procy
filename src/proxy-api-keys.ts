import { randomBytes } from "node:crypto";
import type { KeyQuota } from "./usage-store.ts";

export type { KeyQuota };

export interface ProxyApiKey {
  id: string;
  label: string;
  secret: string;
  createdAt: string;
  enabled: boolean;
  quota?: KeyQuota;
}

export interface ProxyApiKeyView {
  id: string;
  label: string;
  prefix: string;
  createdAt: string;
  enabled: boolean;
  source: "env" | "runtime";
  quota?: KeyQuota;
}

const ENV_KEY_ID = "env";

export function generateProxyApiKeySecret(): string {
  return `sk-proxy-${randomBytes(24).toString("base64url")}`;
}

export function keyPrefix(secret: string): string {
  if (secret.length <= 8) return secret;
  return `${secret.slice(0, 7)}…`;
}

export function newProxyApiKey(secret: string, label: string, id?: string): ProxyApiKey {
  return {
    id: id ?? randomBytes(8).toString("hex"),
    label: label.trim() || "API key",
    secret,
    createdAt: new Date().toISOString(),
    enabled: true,
  };
}

export function envProxyApiKeys(proxyApiKey: string | undefined): ProxyApiKey[] {
  if (!proxyApiKey?.trim()) return [];
  return [newProxyApiKey(proxyApiKey.trim(), "Environment", ENV_KEY_ID)];
}

export function proxyAuthEnabled(keys: ProxyApiKey[]): boolean {
  return keys.some((key) => key.enabled);
}

export function findProxyKeyBySecret(keys: ProxyApiKey[], secret: string): ProxyApiKey | undefined {
  return keys.find((key) => key.enabled && key.secret === secret);
}

export function toProxyApiKeyView(key: ProxyApiKey, envKeyIds: Set<string>): ProxyApiKeyView {
  return {
    id: key.id,
    label: key.label,
    prefix: keyPrefix(key.secret),
    createdAt: key.createdAt,
    enabled: key.enabled,
    source: envKeyIds.has(key.id) ? "env" : "runtime",
    quota: key.quota,
  };
}

function parseKeyQuota(value: unknown): KeyQuota | undefined {
  const record = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
  if (!record) return undefined;
  const quota: KeyQuota = {};
  if (typeof record.maxTotalTokens === "number" && record.maxTotalTokens >= 0) {
    quota.maxTotalTokens = record.maxTotalTokens;
  }
  if (typeof record.maxDailyTokens === "number" && record.maxDailyTokens >= 0) {
    quota.maxDailyTokens = record.maxDailyTokens;
  }
  if (typeof record.maxMonthlyTokens === "number" && record.maxMonthlyTokens >= 0) {
    quota.maxMonthlyTokens = record.maxMonthlyTokens;
  }
  return Object.keys(quota).length > 0 ? quota : undefined;
}

function asProxyApiKey(value: unknown): ProxyApiKey | undefined {
  const record = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
  if (!record) return undefined;
  if (typeof record.id !== "string" || typeof record.secret !== "string") return undefined;
  return {
    id: record.id,
    label: typeof record.label === "string" ? record.label : "API key",
    secret: record.secret,
    createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString(),
    enabled: record.enabled !== false,
    quota: parseKeyQuota(record.quota),
  };
}

export function parsePersistedProxyApiKeys(value: unknown): ProxyApiKey[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const keys = value.map(asProxyApiKey).filter((key): key is ProxyApiKey => Boolean(key));
  return keys;
}

export function proxyApiKeysEqual(left: ProxyApiKey[], right: ProxyApiKey[]): boolean {
  return JSON.stringify(normalizeProxyApiKeys(left)) === JSON.stringify(normalizeProxyApiKeys(right));
}

function normalizeProxyApiKeys(keys: ProxyApiKey[]): Array<Omit<ProxyApiKey, "createdAt">> {
  return [...keys]
    .map(({ createdAt: _createdAt, ...key }) => key)
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function resolveProxyApiKeys(
  envKeys: ProxyApiKey[],
  persisted: {
    proxyApiKeys?: ProxyApiKey[];
    proxyApiKey?: string | null;
  },
): ProxyApiKey[] {
  if (persisted.proxyApiKeys !== undefined) {
    return persisted.proxyApiKeys;
  }
  if (persisted.proxyApiKey === null) {
    return [];
  }
  if (typeof persisted.proxyApiKey === "string" && persisted.proxyApiKey.trim()) {
    return [newProxyApiKey(persisted.proxyApiKey.trim(), "Saved key")];
  }
  return envKeys;
}

export function envKeyIdSet(envKeys: ProxyApiKey[]): Set<string> {
  return new Set(envKeys.map((key) => key.id));
}
