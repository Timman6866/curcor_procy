export interface ReasoningOptions {
  enabled: boolean;
  effort?: string;
}

const THINKING_MODEL_SUFFIX = /-(thinking|reasoning)$/i;

const DISABLED_EFFORTS = new Set(["none", "off", "false", "disabled", "0"]);

function asRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readReasoningEffort(body: Record<string, unknown>): string | undefined {
  const direct = body.reasoning_effort;
  if (typeof direct === "string" && direct.trim()) return direct.trim().toLowerCase();

  const reasoning = asRecord(body.reasoning) ? body.reasoning : undefined;
  if (typeof reasoning?.effort === "string" && reasoning.effort.trim()) {
    return reasoning.effort.trim().toLowerCase();
  }

  const thinking = asRecord(body.thinking) ? body.thinking : undefined;
  if (thinking?.type === "enabled" || thinking?.type === "enable") {
    if (typeof thinking.budget_tokens === "number" || typeof thinking.budgetTokens === "number") {
      return "medium";
    }
    return "medium";
  }

  return undefined;
}

export function stripThinkingModelSuffix(model: string): string {
  return model.replace(THINKING_MODEL_SUFFIX, "");
}

export function hasThinkingModelSuffix(model: string | undefined): boolean {
  if (!model) return false;
  return THINKING_MODEL_SUFFIX.test(model.trim());
}

export function parseReasoningOptions(
  model: string | undefined,
  body: unknown,
): ReasoningOptions {
  const raw = asRecord(body) ? body : {};
  const effort = readReasoningEffort(raw);
  const suffixThinking = hasThinkingModelSuffix(model);

  if (effort && DISABLED_EFFORTS.has(effort)) {
    return { enabled: false };
  }

  if (suffixThinking) {
    return { enabled: true, effort: effort ?? "medium" };
  }

  if (effort) {
    return { enabled: true, effort };
  }

  if (raw.include_reasoning === true || raw.stream_reasoning === true) {
    return { enabled: true, effort: "medium" };
  }

  return { enabled: false };
}

export function expandModelCatalog(ids: string[]): string[] {
  const expanded: string[] = [];
  const seen = new Set<string>();

  for (const id of ids) {
    if (!seen.has(id)) {
      expanded.push(id);
      seen.add(id);
    }

    if (THINKING_MODEL_SUFFIX.test(id)) continue;
    const thinkingId = `${id}-thinking`;
    if (!seen.has(thinkingId)) {
      expanded.push(thinkingId);
      seen.add(thinkingId);
    }
  }

  return expanded;
}
