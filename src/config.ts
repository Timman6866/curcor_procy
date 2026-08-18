import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "..");

export type Runtime = "local" | "cloud";

export interface Config {
  port: number;
  host: string;
  cursorApiKey: string;
  proxyApiKey: string | undefined;
  connectAuthToken: string | undefined;
  defaultModel: string;
  runtime: Runtime;
  cwd: string;
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
    proxyApiKey: process.env.PROXY_API_KEY?.trim() || undefined,
    connectAuthToken: process.env.CONNECT_AUTH_TOKEN?.trim() || undefined,
    defaultModel: process.env.DEFAULT_MODEL?.trim() || "composer-2.5",
    runtime,
    cwd,
  };
}

export function parseBearer(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || undefined;
}

export function authorize(config: Config, authorization: string | undefined): string {
  const presented = parseBearer(authorization);

  if (config.proxyApiKey) {
    if (!presented || presented !== config.proxyApiKey) {
      throw Object.assign(new Error("Invalid API key"), { statusCode: 401 });
    }
    return config.cursorApiKey;
  }

  return presented || config.cursorApiKey;
}
