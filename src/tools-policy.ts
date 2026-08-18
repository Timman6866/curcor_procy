import type { ToolName } from "@cursor/sdk";

export type ToolsPolicy = "full" | "none" | ToolName[];

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
