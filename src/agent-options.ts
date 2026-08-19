import type { AgentModeOption, AgentOptions, McpServerConfig, ToolName } from "@cursor/sdk";
import type { Config, Runtime } from "./config.ts";
import { buildModelParams, type FastOptions, type ReasoningOptions } from "./model-variants.ts";
import type { ToolsPolicy } from "./tools-policy.ts";

export type { ToolsPolicy } from "./tools-policy.ts";
export { parseToolsPolicy } from "./tools-policy.ts";

export interface ParsedAgentRequestOptions {
  runtime?: Runtime;
  tools?: ToolsPolicy;
  disallowedTools?: ToolName[];
  mcpServers?: Record<string, McpServerConfig>;
  mode?: AgentModeOption;
  cwd?: string;
  cloudRepos?: Array<{ url: string; startingRef?: string; prUrl?: string }>;
  reasoning?: ReasoningOptions;
  fast?: FastOptions;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function parseMode(value: unknown): AgentModeOption | undefined {
  if (value === "agent" || value === "AGENT_MODE_OPTION_AGENT") return "agent";
  if (value === "plan" || value === "AGENT_MODE_OPTION_PLAN") return "plan";
  return undefined;
}

function parseToolsFromConnect(options: Record<string, unknown>, fallback: ToolsPolicy): ToolsPolicy {
  const tools = asRecord(options.tools);
  if (!tools || !("names" in tools)) return fallback;
  if (!Array.isArray(tools.names)) return fallback;
  if (tools.names.length === 0) return "none";
  return tools.names.filter((name): name is string => typeof name === "string") as ToolName[];
}

function parseMcpServers(value: unknown): Record<string, McpServerConfig> | undefined {
  const record = asRecord(value);
  if (!record || Object.keys(record).length === 0) return undefined;
  return record as Record<string, McpServerConfig>;
}

function parseCwd(options: Record<string, unknown>, fallback: string): string {
  const local = asRecord(options.local);
  if (Array.isArray(local?.cwd) && typeof local.cwd[0] === "string") {
    return local.cwd[0];
  }
  if (typeof local?.cwd === "string") {
    return local.cwd;
  }
  if (Array.isArray(local?.dirs) && typeof local.dirs[0] === "string") {
    return local.dirs[0];
  }
  return fallback;
}

function parseCloudRepos(options: Record<string, unknown>): ParsedAgentRequestOptions["cloudRepos"] {
  const cloud = asRecord(options.cloud);
  if (!Array.isArray(cloud?.repos)) return undefined;
  return cloud.repos
    .map((repo) => asRecord(repo))
    .filter((repo): repo is Record<string, unknown> => !!repo)
    .map((repo) => ({
      url: typeof repo.url === "string" ? repo.url : "",
      startingRef: typeof repo.startingRef === "string" ? repo.startingRef : undefined,
      prUrl: typeof repo.prUrl === "string" ? repo.prUrl : undefined,
    }))
    .filter((repo) => repo.url.length > 0);
}

export function parseAgentRequestOptions(
  config: Config,
  connectOptions?: Record<string, unknown>,
): ParsedAgentRequestOptions {
  if (!connectOptions) {
    return { tools: config.toolsPolicy, cwd: config.cwd };
  }

  const runtime = asRecord(connectOptions.cloud)
    ? "cloud"
    : asRecord(connectOptions.local)
      ? "local"
      : config.runtime;

  const disallowedTools = Array.isArray(connectOptions.disallowedTools)
    ? (connectOptions.disallowedTools.filter((name): name is string => typeof name === "string") as ToolName[])
    : undefined;

  return {
    runtime,
    tools: parseToolsFromConnect(connectOptions, config.toolsPolicy),
    disallowedTools,
    mcpServers: parseMcpServers(connectOptions.mcpServers),
    mode: parseMode(connectOptions.mode),
    cwd: parseCwd(connectOptions, config.cwd),
    cloudRepos: parseCloudRepos(connectOptions),
  };
}

function applyToolsPolicy(
  options: AgentOptions,
  runtime: Runtime,
  tools: ToolsPolicy,
  disallowedTools?: ToolName[],
): AgentOptions {
  if (runtime === "cloud") {
    // SDK rejects explicit tools/disallowedTools on cloud agents.
    return options;
  }

  if (tools === "none") {
    options.tools = [];
  } else if (tools !== "full") {
    options.tools = tools;
  }

  if (disallowedTools && disallowedTools.length > 0) {
    options.disallowedTools = disallowedTools;
  }

  return options;
}

export function buildAgentOptions(
  config: Config,
  apiKey: string,
  model: string,
  request: ParsedAgentRequestOptions = {},
): AgentOptions {
  const runtime = request.runtime ?? config.runtime;
  const cwd = request.cwd ?? config.cwd;
  const tools = request.tools ?? config.toolsPolicy;
  const params = buildModelParams(request.reasoning ?? { enabled: false }, request.fast ?? {});

  const options: AgentOptions = {
    apiKey,
    model: params ? { id: model, params } : { id: model },
  };

  if (request.mode) {
    options.mode = request.mode;
  }
  if (request.mcpServers) {
    options.mcpServers = request.mcpServers;
  }

  if (runtime === "cloud") {
    options.cloud = {
      repos: request.cloudRepos ?? [],
    };
  } else {
    options.local = {
      cwd,
      settingSources: [],
    };
  }

  return applyToolsPolicy(options, runtime, tools, request.disallowedTools);
}
