import type { ToolName } from "@cursor/sdk";

/** Local = full Cursor tool suite; cloud = text-only (empty tools) on local runtime. */
export type ToolsPolicy = "local" | "cloud" | ToolName[];

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

export function parseToolsPolicy(raw: string | undefined, fallback: ToolsPolicy = "local"): ToolsPolicy {
  const value = raw?.trim().toLowerCase();
  if (
    !value ||
    value === "local" ||
    value === "full" ||
    value === "all" ||
    value === "*"
  ) {
    return "local";
  }
  if (
    value === "cloud" ||
    value === "none" ||
    value === "off" ||
    value === "false" ||
    value === "0"
  ) {
    return "cloud";
  }
  const names = raw!
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return names.length > 0 ? (names as ToolName[]) : fallback;
}

export function parseToolsPolicyValue(value: unknown, fallback: ToolsPolicy): ToolsPolicy {
  if (value === "local" || value === "full") return "local";
  if (value === "cloud" || value === "none") return "cloud";
  if (Array.isArray(value)) {
    const names = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    return names.length > 0 ? (names as ToolName[]) : fallback;
  }
  return fallback;
}

export function toolsPolicyToView(policy: ToolsPolicy): {
  mode: "local" | "cloud" | "custom";
  tools: string[];
} {
  if (policy === "local") return { mode: "local", tools: [] };
  if (policy === "cloud") return { mode: "cloud", tools: [] };
  return { mode: "custom", tools: [...policy] };
}

export function viewToToolsPolicy(
  mode: "local" | "cloud" | "custom",
  tools: string[],
): ToolsPolicy {
  if (mode === "local") return "local";
  if (mode === "cloud") return "cloud";
  const names = tools
    .map((tool) => tool.trim())
    .filter(Boolean) as ToolName[];
  return names.length > 0 ? names : "cloud";
}

export function formatToolsPolicyLabel(policy: ToolsPolicy): string {
  if (policy === "local") return "local";
  if (policy === "cloud") return "cloud";
  return policy.join(", ");
}
