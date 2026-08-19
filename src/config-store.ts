import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import type { Config, Runtime } from "./config.ts";
import {
  envKeyIdSet,
  generateProxyApiKeySecret,
  keyPrefix,
  newProxyApiKey,
  parsePersistedProxyApiKeys,
  proxyApiKeysEqual,
  resolveProxyApiKeys,
  toProxyApiKeyView,
  type ProxyApiKey,
  type ProxyApiKeyView,
} from "./proxy-api-keys.ts";
import {
  parseToolsPolicy,
  parseToolsPolicyValue,
  type ToolsPolicy,
  toolsPolicyToView,
  viewToToolsPolicy,
} from "./tools-policy.ts";
import { filterModelIds, parseDisabledModels } from "./model-catalog.ts";
import { retireKeyUsage, syncUsageKeyCatalog } from "./usage-meter.ts";
import type { KeyQuota } from "./usage-store.ts";

export interface ConfigProvider {
  get(): Config;
  getConnectAuthToken(): string;
  filterModelIds(ids: string[]): string[];
  getDisabledModels(): string[];
  setDisabledModels(disabledModels: string[]): string[];
}

export interface SettingsView {
  defaultModel: string;
  runtime: Runtime;
  toolsMode: "full" | "none" | "custom";
  tools: string[];
  cwd: string;
  host: string;
  port: number;
  adminUsername: string;
  secrets: {
    cursorApiKey: boolean;
    proxyApiKey: boolean;
    connectAuthToken: boolean;
    connectAuthTokenAuto: boolean;
    adminPassword: boolean;
  };
  sources: {
    defaultModel: "env" | "runtime";
    runtime: "env" | "runtime";
    toolsPolicy: "env" | "runtime";
    cwd: "env" | "runtime";
    proxyApiKey: "env" | "runtime" | "unset";
    connectAuthToken: "env" | "runtime" | "generated";
    cursorApiKey: "env" | "runtime";
    adminUsername: "env" | "runtime";
    adminPassword: "env" | "runtime";
  };
  restartRequired: {
    host: boolean;
    port: boolean;
  };
}

export interface SettingsUpdate {
  defaultModel?: string;
  runtime?: Runtime;
  toolsMode?: "full" | "none" | "custom";
  tools?: string[];
  cwd?: string;
  proxyApiKey?: string | null;
  connectAuthToken?: string | null;
  regenerateConnectToken?: boolean;
  cursorApiKey?: string;
  adminUsername?: string;
  adminPassword?: string;
  resetToEnv?: boolean;
}

export interface CreatedProxyApiKey {
  id: string;
  label: string;
  secret: string;
  prefix: string;
  createdAt: string;
}

interface PersistedSettings {
  defaultModel?: string;
  runtime?: Runtime;
  toolsPolicy?: ToolsPolicy;
  cwd?: string;
  proxyApiKeys?: ProxyApiKey[];
  proxyApiKey?: string | null;
  connectAuthToken?: string | null;
  cursorApiKey?: string;
  adminUsername?: string;
  adminPassword?: string;
  disabledModels?: string[];
}

function defaultSettingsPath(): string {
  const configured = process.env.PROXY_SETTINGS_PATH?.trim();
  if (configured) return resolve(configured);

  const scratchDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".scratch");
  return resolve(scratchDir, "proxy-settings.json");
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readPersistedSettings(path: string): PersistedSettings {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    const record = asRecord(parsed);
    if (!record) return {};

    const toolsPolicy = record.toolsPolicy !== undefined
      ? parseToolsPolicyValue(record.toolsPolicy, "full")
      : undefined;

    return {
      defaultModel: typeof record.defaultModel === "string" ? record.defaultModel : undefined,
      runtime: record.runtime === "local" || record.runtime === "cloud" ? record.runtime : undefined,
      toolsPolicy,
      cwd: typeof record.cwd === "string" ? record.cwd : undefined,
      proxyApiKeys: parsePersistedProxyApiKeys(record.proxyApiKeys),
      proxyApiKey:
        record.proxyApiKey === null
          ? null
          : typeof record.proxyApiKey === "string"
            ? record.proxyApiKey
            : undefined,
      connectAuthToken:
        record.connectAuthToken === null
          ? null
          : typeof record.connectAuthToken === "string"
            ? record.connectAuthToken
            : undefined,
      cursorApiKey: typeof record.cursorApiKey === "string" ? record.cursorApiKey : undefined,
      adminUsername: typeof record.adminUsername === "string" ? record.adminUsername : undefined,
      adminPassword: typeof record.adminPassword === "string" ? record.adminPassword : undefined,
      disabledModels: parseDisabledModels(record.disabledModels),
    };
  } catch {
    return {};
  }
}

function writePersistedSettings(path: string, settings: PersistedSettings): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
}

function mergeConfig(env: Config, persisted: PersistedSettings): Config {
  return {
    ...env,
    defaultModel: persisted.defaultModel ?? env.defaultModel,
    runtime: persisted.runtime ?? env.runtime,
    toolsPolicy: persisted.toolsPolicy ?? env.toolsPolicy,
    cwd: persisted.cwd ? resolve(persisted.cwd) : env.cwd,
    proxyApiKeys: resolveProxyApiKeys(env.proxyApiKeys, persisted),
    connectAuthToken:
      persisted.connectAuthToken === null
        ? undefined
        : persisted.connectAuthToken ?? env.connectAuthToken,
    cursorApiKey: persisted.cursorApiKey ?? env.cursorApiKey,
    adminUsername: persisted.adminUsername ?? env.adminUsername,
    adminPassword: persisted.adminPassword ?? env.adminPassword,
  };
}

function persistedFromState(
  env: Config,
  current: Config,
  generatedConnectToken: string,
  disabledModels: string[],
): PersistedSettings {
  const persisted: PersistedSettings = {};

  if (current.defaultModel !== env.defaultModel) persisted.defaultModel = current.defaultModel;
  if (current.runtime !== env.runtime) persisted.runtime = current.runtime;
  if (JSON.stringify(current.toolsPolicy) !== JSON.stringify(env.toolsPolicy)) {
    persisted.toolsPolicy = current.toolsPolicy;
  }
  if (current.cwd !== env.cwd) persisted.cwd = current.cwd;

  if (!proxyApiKeysEqual(current.proxyApiKeys, env.proxyApiKeys)) {
    persisted.proxyApiKeys = current.proxyApiKeys;
  }

  if (current.connectAuthToken !== env.connectAuthToken) {
    persisted.connectAuthToken = current.connectAuthToken ?? null;
  }

  if (current.cursorApiKey !== env.cursorApiKey) persisted.cursorApiKey = current.cursorApiKey;
  if (current.adminUsername !== env.adminUsername) persisted.adminUsername = current.adminUsername;
  if (current.adminPassword !== env.adminPassword) persisted.adminPassword = current.adminPassword;
  if (disabledModels.length > 0) persisted.disabledModels = disabledModels;

  if (
    !env.connectAuthToken &&
    !current.connectAuthToken &&
    generatedConnectToken
  ) {
    // generated token is runtime-only unless user pins one in settings
  }

  return persisted;
}

export class ConfigStore implements ConfigProvider {
  private current: Config;
  private persisted: PersistedSettings;
  private generatedConnectToken: string;
  private disabledModels: Set<string>;
  private readonly envKeyIds: Set<string>;

  constructor(
    private readonly env: Config,
    private readonly settingsPath: string,
    generatedConnectToken?: string,
  ) {
    this.generatedConnectToken = generatedConnectToken ?? randomBytes(32).toString("base64url");
    this.envKeyIds = envKeyIdSet(env.proxyApiKeys);
    mkdirSync(dirname(settingsPath), { recursive: true });
    this.persisted = readPersistedSettings(settingsPath);
    this.current = mergeConfig(env, this.persisted);
    this.disabledModels = new Set(this.persisted.disabledModels ?? []);
    mkdirSync(this.current.cwd, { recursive: true });
    syncUsageKeyCatalog(this.current.proxyApiKeys);
  }

  static fromEnv(env: Config, settingsPath?: string): ConfigStore {
    const path = settingsPath ?? defaultSettingsPath();
    return new ConfigStore(env, path);
  }

  get(): Config {
    return this.current;
  }

  getConnectAuthToken(): string {
    return this.current.connectAuthToken ?? this.generatedConnectToken;
  }

  getSettingsPath(): string {
    return this.settingsPath;
  }

  filterModelIds(ids: string[]): string[] {
    return filterModelIds(ids, this.disabledModels);
  }

  getDisabledModels(): string[] {
    return [...this.disabledModels].sort();
  }

  setDisabledModels(disabledModels: string[]): string[] {
    this.disabledModels = new Set(parseDisabledModels(disabledModels));
    this.persisted = persistedFromState(
      this.env,
      this.current,
      this.generatedConnectToken,
      this.getDisabledModels(),
    );
    writePersistedSettings(this.settingsPath, this.persisted);
    return this.getDisabledModels();
  }

  listProxyApiKeys(): ProxyApiKeyView[] {
    return this.current.proxyApiKeys.map((key) => toProxyApiKeyView(key, this.envKeyIds));
  }

  addProxyApiKey(label?: string): CreatedProxyApiKey {
    const secret = generateProxyApiKeySecret();
    const key = newProxyApiKey(secret, label?.trim() || "API key");
    this.current = {
      ...this.current,
      proxyApiKeys: [...this.current.proxyApiKeys, key],
    };
    this.persistSettings();
    syncUsageKeyCatalog(this.current.proxyApiKeys);
    return {
      id: key.id,
      label: key.label,
      secret: key.secret,
      prefix: keyPrefix(key.secret),
      createdAt: key.createdAt,
    };
  }

  removeProxyApiKey(id: string): boolean {
    const removedKey = this.current.proxyApiKeys.find((key) => key.id === id);
    if (!removedKey) return false;

    retireKeyUsage(removedKey.id, {
      label: removedKey.label,
      prefix: keyPrefix(removedKey.secret),
    });

    this.current = {
      ...this.current,
      proxyApiKeys: this.current.proxyApiKeys.filter((key) => key.id !== id),
    };
    this.persistSettings();
    return true;
  }

  updateProxyApiKeyQuota(id: string, quota: KeyQuota | null): boolean {
    const index = this.current.proxyApiKeys.findIndex((key) => key.id === id);
    if (index < 0) return false;

    const nextKeys = [...this.current.proxyApiKeys];
    const current = nextKeys[index];
    if (!current) return false;

    nextKeys[index] = {
      ...current,
      quota: quota && Object.keys(quota).length > 0 ? quota : undefined,
    };
    this.current = { ...this.current, proxyApiKeys: nextKeys };
    this.persistSettings();
    return true;
  }

  private persistSettings(): void {
    this.persisted = persistedFromState(
      this.env,
      this.current,
      this.generatedConnectToken,
      this.getDisabledModels(),
    );
    writePersistedSettings(this.settingsPath, this.persisted);
  }

  private proxyApiKeySource(): SettingsView["sources"]["proxyApiKey"] {
    if (!proxyApiKeysEqual(this.current.proxyApiKeys, this.env.proxyApiKeys)) {
      return this.current.proxyApiKeys.length > 0 ? "runtime" : "unset";
    }
    return this.env.proxyApiKeys.length > 0 ? "env" : "unset";
  }

  getSettingsView(): SettingsView {
    const tools = toolsPolicyToView(this.current.toolsPolicy);
    return {
      defaultModel: this.current.defaultModel,
      runtime: this.current.runtime,
      toolsMode: tools.mode,
      tools: tools.tools,
      cwd: this.current.cwd,
      host: this.current.host,
      port: this.current.port,
      adminUsername: this.current.adminUsername,
      secrets: {
        cursorApiKey: Boolean(this.current.cursorApiKey),
        proxyApiKey: this.current.proxyApiKeys.some((key) => key.enabled),
        connectAuthToken: Boolean(this.current.connectAuthToken),
        connectAuthTokenAuto: !this.current.connectAuthToken,
        adminPassword: Boolean(this.current.adminPassword),
      },
      sources: {
        defaultModel: this.persisted.defaultModel ? "runtime" : "env",
        runtime: this.persisted.runtime ? "runtime" : "env",
        toolsPolicy: this.persisted.toolsPolicy ? "runtime" : "env",
        cwd: this.persisted.cwd ? "runtime" : "env",
        proxyApiKey: this.proxyApiKeySource(),
        connectAuthToken: this.current.connectAuthToken
          ? this.persisted.connectAuthToken
            ? "runtime"
            : "env"
          : "generated",
        cursorApiKey: this.persisted.cursorApiKey ? "runtime" : "env",
        adminUsername: this.persisted.adminUsername ? "runtime" : "env",
        adminPassword: this.persisted.adminPassword ? "runtime" : "env",
      },
      restartRequired: {
        host: false,
        port: false,
      },
    };
  }

  applySettings(update: SettingsUpdate): Config {
    if (update.resetToEnv) {
      this.persisted = {};
      this.current = { ...this.env };
      this.disabledModels = new Set();
      mkdirSync(this.current.cwd, { recursive: true });
      writePersistedSettings(this.settingsPath, {});
      return this.current;
    }

    const next = { ...this.current };

    if (typeof update.defaultModel === "string" && update.defaultModel.trim()) {
      next.defaultModel = update.defaultModel.trim();
    }
    if (update.runtime === "local" || update.runtime === "cloud") {
      next.runtime = update.runtime;
    }
    if (update.toolsMode) {
      next.toolsPolicy = viewToToolsPolicy(update.toolsMode, update.tools ?? []);
    }
    if (typeof update.cwd === "string" && update.cwd.trim()) {
      next.cwd = resolve(update.cwd.trim());
      mkdirSync(next.cwd, { recursive: true });
    }

    if (update.proxyApiKey === null) {
      next.proxyApiKeys = [];
    } else if (typeof update.proxyApiKey === "string" && update.proxyApiKey.trim()) {
      next.proxyApiKeys = [newProxyApiKey(update.proxyApiKey.trim(), "Saved key")];
    }

    if (update.connectAuthToken === null) {
      next.connectAuthToken = undefined;
      if (update.regenerateConnectToken) {
        this.generatedConnectToken = randomBytes(32).toString("base64url");
      }
    } else if (typeof update.connectAuthToken === "string" && update.connectAuthToken.trim()) {
      next.connectAuthToken = update.connectAuthToken.trim();
    } else if (update.regenerateConnectToken && !next.connectAuthToken) {
      this.generatedConnectToken = randomBytes(32).toString("base64url");
    }

    if (typeof update.cursorApiKey === "string" && update.cursorApiKey.trim()) {
      next.cursorApiKey = update.cursorApiKey.trim();
    }
    if (typeof update.adminUsername === "string" && update.adminUsername.trim()) {
      next.adminUsername = update.adminUsername.trim();
    }
    if (typeof update.adminPassword === "string" && update.adminPassword.trim()) {
      next.adminPassword = update.adminPassword.trim();
    }

    this.current = next;
    this.persistSettings();
    return this.current;
  }
}

export function settingsPathFor(_env: Config): string {
  return defaultSettingsPath();
}

// Re-export for tests
export type { ToolsPolicy } from "./tools-policy.ts";
