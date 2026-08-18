import type { ToolName } from "@cursor/sdk";

export type ToolsPolicy = "full" | "none" | ToolName[];

export const AVAILABLE_TOOLS: ToolName[] = [
  "shell",
  "read",
  "edit",
  "grep",
  "glob",
  "ls",
  "task",
  "mcp",
  "webSearch",
  "delete",
  "readLints",
  "webFetch",
  "semSearch",
  "updateTodos",
  "readTodos",
  "askQuestion",
  "await",
  "generateImage",
  "applyAgentDiff",
];

export function parseToolsPolicy(raw: string | undefined, fallback: ToolsPolicy = "full"): ToolsPolicy {
  const value = raw?.trim().toLowerCase();
  if (!value || value === "full" || value === "all" || value === "*") return "full";
  if (value === "none" || value === "off" || value === "false" || value === "0") return "none";
  const names = raw!
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return names.length > 0 ? (names as ToolName[]) : fallback;
}

export function parseToolsPolicyValue(value: unknown, fallback: ToolsPolicy): ToolsPolicy {
  if (value === "full" || value === "none") return value;
  if (Array.isArray(value)) {
    const names = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    return names.length > 0 ? (names as ToolName[]) : fallback;
  }
  return fallback;
}

export function toolsPolicyToView(policy: ToolsPolicy): {
  mode: "full" | "none" | "custom";
  tools: string[];
} {
  if (policy === "full") return { mode: "full", tools: [] };
  if (policy === "none") return { mode: "none", tools: [] };
  return { mode: "custom", tools: [...policy] };
}

export function viewToToolsPolicy(
  mode: "full" | "none" | "custom",
  tools: string[],
): ToolsPolicy {
  if (mode === "full") return "full";
  if (mode === "none") return "none";
  const names = tools
    .map((tool) => tool.trim())
    .filter(Boolean) as ToolName[];
  return names.length > 0 ? names : "none";
}
