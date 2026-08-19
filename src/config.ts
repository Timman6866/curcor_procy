import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseLogPolicy, type LogPolicy } from "./logging.ts";
import {
  envProxyApiKeys,
  findProxyKeyBySecret,
  proxyAuthEnabled,
  type ProxyApiKey,
} from "./proxy-api-keys.ts";
import { parseToolsPolicy, type ToolsPolicy } from "./tools-policy.ts";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "..");

export type Runtime = "local" | "cloud";
export type AuthMethod = "proxy-key" | "cursor-key" | "open";

export interface Config {
  port: number;
  host: string;
  cursorApiKey: string;
  proxyApiKeys: ProxyApiKey[];
  connectAuthToken: string | undefined;
  defaultModel: string;
  runtime: Runtime;
  cwd: string;
  toolsPolicy: ToolsPolicy;
  adminUsername: string;
  adminPassword: string | undefined;
  logPolicy: LogPolicy;
}

export interface AuthResult {
  cursorApiKey: string;
  method: AuthMethod;
  proxyKeyId?: string;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

export function loadConfig(): Config {
  const runtime = (process.env.CURSOR_RUNTIME ?? "local").trim().toLowerCase();
  if (runtime !== "local" && runtime !== "cloud") {
    throw new Error("CURSOR_RUNTIME must be 'local' or 'cloud'");
  }

  const cwd = resolve(process.env.CURSOR_CWD?.trim() || resolve(projectRoot, ".scratch"));
  mkdirSync(cwd, { recursive: true });

  return {
    port: Number(process.env.PORT ?? 8787),
    host: process.env.HOST?.trim() || "127.0.0.1",
    cursorApiKey: requiredEnv("CURSOR_API_KEY"),
    proxyApiKeys: envProxyApiKeys(process.env.PROXY_API_KEY),
    connectAuthToken: process.env.CONNECT_AUTH_TOKEN?.trim() || undefined,
    defaultModel: process.env.DEFAULT_MODEL?.trim() || "composer-2.5",
    runtime,
    cwd,
    toolsPolicy: parseToolsPolicy(process.env.CURSOR_TOOLS),
    adminUsername: process.env.ADMIN_USERNAME?.trim() || "admin",
    adminPassword: process.env.ADMIN_PASSWORD?.trim() || undefined,
    logPolicy: parseLogPolicy(process.env.LOG_POLICY),
  };
}

export function parseBearer(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const trimmed = header.trim();
  const match = /^Bearer\s+(.+)$/i.exec(trimmed);
  if (match) return match[1]?.trim() || undefined;
  return trimmed;
}

export interface RequestAuthHeaders {
  authorization?: string;
  "x-api-key"?: string;
  "api-key"?: string;
}

export function extractPresentedApiKey(headers: RequestAuthHeaders): string | undefined {
  const bearer = parseBearer(headers.authorization);
  if (bearer) return bearer;

  const xApiKey = headers["x-api-key"];
  if (typeof xApiKey === "string" && xApiKey.trim()) return xApiKey.trim();

  const apiKey = headers["api-key"];
  if (typeof apiKey === "string" && apiKey.trim()) return apiKey.trim();

  return undefined;
}

export function authorize(config: Config, headers: RequestAuthHeaders): AuthResult {
  const presented = extractPresentedApiKey(headers);

  if (proxyAuthEnabled(config.proxyApiKeys)) {
    if (!presented) {
      throw Object.assign(
        new Error("API key required. Send your proxy API key as Authorization Bearer or x-api-key."),
        { statusCode: 401 },
      );
    }

    const matchedProxyKey = findProxyKeyBySecret(config.proxyApiKeys, presented);
    if (matchedProxyKey) {
      return {
        cursorApiKey: config.cursorApiKey,
        method: "proxy-key",
        proxyKeyId: matchedProxyKey.id,
      };
    }

    if (presented === config.cursorApiKey) {
      return {
        cursorApiKey: config.cursorApiKey,
        method: "cursor-key",
      };
    }

    throw Object.assign(
      new Error("Invalid API key. Use a proxy API key from admin Settings, not your Cursor dashboard key."),
      { statusCode: 401 },
    );
  }

  return {
    cursorApiKey: presented || config.cursorApiKey,
    method: presented ? "cursor-key" : "open",
  };
}
