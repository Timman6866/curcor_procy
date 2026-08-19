export interface ReasoningOptions {
  enabled: boolean;
  effort?: string;
}

/** `true` = fast, `false` = standard, `undefined` = backend default */
export interface FastOptions {
  enabled?: boolean;
}

export interface ParsedModelVariants {
  baseId: string;
  reasoning: ReasoningOptions;
  fast: FastOptions;
}

const THINKING_MODEL_SUFFIX = /-(thinking|reasoning)$/i;
const FAST_MODEL_SUFFIX = /-fast$/i;
const STANDARD_MODEL_SUFFIX = /-(standard|slow)$/i;

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
    return "medium";
  }

  return undefined;
}

function readFastOverride(body: Record<string, unknown>): boolean | undefined {
  if (typeof body.fast === "boolean") return body.fast;

  const speed = body.model_speed;
  if (typeof speed === "string") {
    const normalized = speed.trim().toLowerCase();
    if (normalized === "fast") return true;
    if (normalized === "standard" || normalized === "slow") return false;
  }

  return undefined;
}

function parseBracketParams(model: string): { baseId: string; params: Record<string, string> } {
  const match = /^(.+?)\[([^\]]+)\]$/i.exec(model.trim());
  if (!match) return { baseId: model.trim(), params: {} };

  const params: Record<string, string> = {};
  for (const part of match[2].split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const [key, rawValue] = trimmed.split("=").map((piece) => piece.trim());
    if (!key) continue;
    params[key.toLowerCase()] = rawValue === undefined || rawValue === "" ? "true" : rawValue.toLowerCase();
  }

  return { baseId: match[1].trim(), params: params };
}

function parseFastParam(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === "true" || value === "1" || value === "yes" || value === "on") return true;
  if (value === "false" || value === "0" || value === "no" || value === "off") return false;
  return undefined;
}

export function stripThinkingModelSuffix(model: string): string {
  return model.replace(THINKING_MODEL_SUFFIX, "");
}

export function hasThinkingModelSuffix(model: string | undefined): boolean {
  if (!model) return false;
  return THINKING_MODEL_SUFFIX.test(model.trim());
}

export function hasFastModelSuffix(model: string | undefined): boolean {
  if (!model) return false;
  return FAST_MODEL_SUFFIX.test(model.trim());
}

export function hasStandardModelSuffix(model: string | undefined): boolean {
  if (!model) return false;
  return STANDARD_MODEL_SUFFIX.test(model.trim());
}

export function parseReasoningOptions(
  model: string | undefined,
  body: unknown,
): ReasoningOptions {
  return parseModelVariants(model, body).reasoning;
}

export function parseFastOptions(model: string | undefined, body: unknown): FastOptions {
  return parseModelVariants(model, body).fast;
}

export function parseModelVariants(model: string | undefined, body: unknown): ParsedModelVariants {
  const raw = asRecord(body) ? body : {};
  let working = typeof model === "string" ? model.trim() : "";
  const bracket = parseBracketParams(working);
  working = bracket.baseId;

  let suffixThinking = false;
  if (THINKING_MODEL_SUFFIX.test(working)) {
    suffixThinking = true;
    working = working.replace(THINKING_MODEL_SUFFIX, "");
  }

  let suffixFast: boolean | undefined;
  if (FAST_MODEL_SUFFIX.test(working)) {
    suffixFast = true;
    working = working.replace(FAST_MODEL_SUFFIX, "");
  } else if (STANDARD_MODEL_SUFFIX.test(working)) {
    suffixFast = false;
    working = working.replace(STANDARD_MODEL_SUFFIX, "");
  }

  const effort = readReasoningEffort(raw);
  let reasoning: ReasoningOptions;
  if (effort && DISABLED_EFFORTS.has(effort)) {
    reasoning = { enabled: false };
  } else if (suffixThinking) {
    reasoning = { enabled: true, effort: effort ?? "medium" };
  } else if (effort) {
    reasoning = { enabled: true, effort };
  } else if (raw.include_reasoning === true || raw.stream_reasoning === true) {
    reasoning = { enabled: true, effort: "medium" };
  } else {
    reasoning = { enabled: false };
  }

  const bodyFast = readFastOverride(raw);
  const bracketFast = parseFastParam(bracket.params.fast);
  let fastEnabled = bodyFast ?? bracketFast ?? suffixFast;

  return {
    baseId: working,
    reasoning,
    fast: fastEnabled === undefined ? {} : { enabled: fastEnabled },
  };
}

export function resolveModelBaseId(requested: string | undefined, fallback: string): string {
  const model = requested?.trim();
  if (!model) return fallback;
  const { baseId } = parseModelVariants(model, {});
  return baseId || fallback;
}

export function buildModelParams(
  reasoning: ReasoningOptions,
  fast: FastOptions,
): Array<{ id: string; value: string }> | undefined {
  const params: Array<{ id: string; value: string }> = [];

  if (fast.enabled === true) {
    params.push({ id: "fast", value: "true" });
  } else if (fast.enabled === false) {
    params.push({ id: "fast", value: "false" });
  }

  if (reasoning.enabled) {
    params.push({ id: "reasoning_effort", value: reasoning.effort?.trim() || "medium" });
  }

  return params.length > 0 ? params : undefined;
}

function isVariantId(id: string): boolean {
  return (
    THINKING_MODEL_SUFFIX.test(id) ||
    FAST_MODEL_SUFFIX.test(id) ||
    STANDARD_MODEL_SUFFIX.test(id)
  );
}

/** Cursor treats plain composer-2.x as the fast tier; standard is the opt-in variant. */
function isFastDefaultModel(id: string): boolean {
  return /^composer-2\.\d+$/i.test(id);
}

export function expandModelCatalog(ids: string[]): string[] {
  const expanded: string[] = [];
  const seen = new Set<string>();

  const add = (id: string) => {
    if (!id || seen.has(id)) return;
    expanded.push(id);
    seen.add(id);
  };

  for (const id of ids) add(id);

  for (const id of [...ids]) {
    if (isVariantId(id)) continue;

    if (isFastDefaultModel(id)) {
      // Base composer id is already fast in Cursor; only expose standard + thinking aliases.
      add(`${id}-standard`);
      add(`${id}-thinking`);
      add(`${id}-standard-thinking`);
      continue;
    }

    add(`${id}-fast`);
    add(`${id}-standard`);
    add(`${id}-thinking`);
    add(`${id}-fast-thinking`);
  }

  for (const id of [...ids]) {
    if (!FAST_MODEL_SUFFIX.test(id) || THINKING_MODEL_SUFFIX.test(id)) continue;
    add(`${id}-thinking`);
  }

  return expanded;
}
