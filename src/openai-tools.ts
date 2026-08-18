import type { SDKCustomTool, SDKJsonValue } from "@cursor/sdk";
import { buildAgentOptions, type ParsedAgentRequestOptions } from "./agent-options.ts";
import type { Config } from "./config.ts";
import { newId } from "./openai-format.ts";

export interface OpenAiFunctionTool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
    strict?: boolean;
  };
}

export interface OpenAiToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export class OpenAiToolCallPending extends Error {
  readonly toolCalls: OpenAiToolCall[];

  constructor(toolCalls: OpenAiToolCall[]) {
    super("openai_tool_calls_pending");
    this.toolCalls = toolCalls;
  }
}

export function parseOpenAiTools(raw: unknown): OpenAiFunctionTool[] {
  if (!Array.isArray(raw)) return [];

  const tools: OpenAiFunctionTool[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (record.type !== "function") continue;
    const fn = record.function;
    if (!fn || typeof fn !== "object") continue;
    const func = fn as Record<string, unknown>;
    if (typeof func.name !== "string" || !func.name.trim()) continue;
    tools.push({
      type: "function",
      function: {
        name: func.name.trim(),
        description: typeof func.description === "string" ? func.description : undefined,
        parameters:
          func.parameters && typeof func.parameters === "object"
            ? (func.parameters as Record<string, unknown>)
            : { type: "object", properties: {} },
        strict: func.strict === true,
      },
    });
  }
  return tools;
}

export function buildOpenAiCustomTools(
  tools: OpenAiFunctionTool[],
  pending: { calls: OpenAiToolCall[] | null },
): Record<string, SDKCustomTool> {
  const customTools: Record<string, SDKCustomTool> = {};

  for (const tool of tools) {
    const { name, description, parameters } = tool.function;
    customTools[name] = {
      description,
      inputSchema: (parameters ?? { type: "object", properties: {} }) as Record<string, SDKJsonValue>,
      execute: (args, context) => {
        const call: OpenAiToolCall = {
          id: context.toolCallId ? `call_${context.toolCallId}` : newId("call"),
          type: "function",
          function: {
            name,
            arguments: JSON.stringify(args ?? {}),
          },
        };
        pending.calls = [call];
        throw new OpenAiToolCallPending([call]);
      },
    };
  }

  return customTools;
}

export function buildFunctionCallingAgentOptions(
  config: Config,
  apiKey: string,
  model: string,
  tools: OpenAiFunctionTool[],
  pending: { calls: OpenAiToolCall[] | null },
  request: ParsedAgentRequestOptions = {},
) {
  if (config.runtime !== "local") {
    throw Object.assign(
      new Error("OpenAI function calling requires CURSOR_RUNTIME=local"),
      { statusCode: 400 },
    );
  }

  // OpenAI client tools are SDK customTools (custom-user-tools MCP). The model
  // invokes them via GetMcpTools/CallMcpTool, so we must keep the "mcp"
  // capability enabled even when Cursor built-ins are disabled.
  const options = buildAgentOptions(config, apiKey, model, { ...request, tools: ["mcp"] });
  options.local = {
    ...options.local,
    cwd: options.local?.cwd ?? config.cwd,
    settingSources: [],
    customTools: buildOpenAiCustomTools(tools, pending),
  };
  return options;
}

export function isOpenAiToolCallPending(error: unknown): error is OpenAiToolCallPending {
  return error instanceof OpenAiToolCallPending;
}
