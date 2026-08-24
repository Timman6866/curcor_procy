/** Remove harness tool-call markup that models may echo into assistant text. */

const TOOL_CALL_OPEN = "[tool_call";
const XML_TOOL_CALL_OPEN = "<tool_call";
const XML_TOOL_CALL_CLOSE = "</tool_call>";

const DYNAMIC_TOOL_NAMES =
  "CallDynamicTool|GetDynamicTools|CallMcpTool|GetMcpTools";

const ORPHAN_LINE_RE = new RegExp(
  String.raw`^(?:[A-Za-z0-9_-]+\s+)?name=(?:${DYNAMIC_TOOL_NAMES})\s+args=`,
);

/** YAML-ish dump: `Tool: CallDynamicTool` / `namespace:` / `toolName:` / `arguments:`. */
const TOOL_DUMP_HEADER_RE = new RegExp(
  String.raw`^Tool:\s*(?:${DYNAMIC_TOOL_NAMES}|[A-Za-z][A-Za-z0-9_]*)\s*$`,
);

const TOOL_DUMP_FIELD_RE =
  /^(namespace|toolName|tool_name|arguments|args|description|mcpDetails)\s*:\s*/;

/** Bare field line that can start a dump without Tool:/namespace: header. */
const BARE_TOOLNAME_LINE_RE =
  /^toolName:\s*[A-Za-z][A-Za-z0-9_-]*\s*$/i;

const BARE_ARGUMENTS_LINE_RE = /^arguments:\s*/i;

/**
 * Inline dump glued to prose, e.g.
 * `...icons.namespace: custom-user-tools toolName: Read ...`
 * or `...docs. Tool: CallDynamicTool namespace: ...`
 * or `...paths.toolName: Bash arguments: {...}`
 */
const INLINE_NAMESPACE_DUMP_RE =
  /(?:^|[.\s])namespace:\s*(?:custom-user-tools|cursor|mcp)\b/i;

const INLINE_TOOL_HEADER_RE = new RegExp(
  String.raw`(?:^|[.\s])Tool:\s*(?:${DYNAMIC_TOOL_NAMES})\b`,
);

const INLINE_TOOLNAME_DUMP_RE =
  /(?:^|[.\s])toolName:\s*[A-Za-z][A-Za-z0-9_-]*\b/i;

export interface ToolMarkupStreamFilter {
  push(chunk: string): string;
  flush(): string;
}

export function stripToolMarkup(text: string): string {
  if (!text) return text;
  let result = stripBracketToolCalls(text);
  result = stripXmlToolCalls(result);
  result = stripInlineToolDumps(result);
  result = stripToolDumps(result);
  result = stripOrphanFragments(result);
  return collapseExtraBlankLines(result);
}

export function createToolMarkupStreamFilter(): ToolMarkupStreamFilter {
  let buffer = "";

  return {
    push(chunk: string): string {
      if (!chunk) return "";
      buffer += chunk;
      const { safe, hold } = splitSafePrefix(buffer);
      buffer = hold;
      return safe ? stripToolMarkup(safe) : "";
    },
    flush(): string {
      if (!buffer) return "";
      const remaining = stripIncompleteOnFlush(buffer);
      buffer = "";
      return remaining ? stripToolMarkup(remaining) : "";
    },
  };
}

function stripBracketToolCalls(text: string): string {
  let i = 0;
  let out = "";

  while (i < text.length) {
    const start = text.indexOf(TOOL_CALL_OPEN, i);
    if (start < 0) {
      out += text.slice(i);
      break;
    }
    out += text.slice(i, start);
    const end = findBalancedBracketEnd(text, start);
    if (end < 0) {
      out += text.slice(start);
      break;
    }
    i = skipTrailingNewline(text, end + 1);
  }

  return out;
}

function stripXmlToolCalls(text: string): string {
  let i = 0;
  let out = "";

  while (i < text.length) {
    const start = text.indexOf(XML_TOOL_CALL_OPEN, i);
    if (start < 0) {
      out += text.slice(i);
      break;
    }
    out += text.slice(i, start);
    const close = text.indexOf(XML_TOOL_CALL_CLOSE, start);
    if (close < 0) {
      out += text.slice(start);
      break;
    }
    i = skipTrailingNewline(text, close + XML_TOOL_CALL_CLOSE.length);
  }

  return out;
}

/**
 * Cut dumps glued mid-prose (same line), e.g.
 * `...icons.namespace: custom-user-tools ...` or `...docs. Tool: CallDynamicTool ...`
 * or `...paths.toolName: Bash arguments: {...}`
 * Line-start dumps are left for stripToolDumps so we do not eat trailing
 * punctuation from the previous sentence.
 */
function stripInlineToolDumps(text: string): string {
  let result = text;
  let guard = 0;

  while (guard++ < 32) {
    const cutAt = earliestInlineDumpIndex(result);
    if (cutAt < 0) break;

    const lead = result[cutAt]!;
    const dumpStart = lead === "." || lead === " " || lead === "\t" ? cutAt + 1 : cutAt;
    const cleanBefore = result.slice(0, cutAt);

    result = cleanBefore + stripTrailingDumpFrom(result.slice(dumpStart));
  }

  return result;
}

function earliestInlineDumpIndex(text: string): number {
  let best = -1;
  for (const re of [
    INLINE_NAMESPACE_DUMP_RE,
    INLINE_TOOL_HEADER_RE,
    INLINE_TOOLNAME_DUMP_RE,
  ]) {
    re.lastIndex = 0;
    const match = re.exec(text);
    if (!match) continue;
    const lead = text[match.index]!;
    if (match.index === 0) continue;
    if (lead === "\n" || lead === "\r") continue;
    if (best < 0 || match.index < best) best = match.index;
  }
  return best;
}

/** Given text starting at a dump marker, return only non-dump trailing prose if any. */
function stripTrailingDumpFrom(dumpAndMaybeProse: string): string {
  const lines = dumpAndMaybeProse.split("\n");
  let i = 0;

  while (i < lines.length) {
    const cur = lines[i]!;
    const trimmed = cur.trim();

    if (i === 0) {
      i++;
      continue;
    }

    if (!trimmed) {
      const next = peekNonEmpty(lines, i + 1);
      if (
        next !== null &&
        (isDumpContinuation(next) || looksLikeDumpBody(next.trim()))
      ) {
        i++;
        continue;
      }
      return "\n" + lines.slice(i + 1).join("\n");
    }

    if (
      TOOL_DUMP_FIELD_RE.test(trimmed) ||
      TOOL_DUMP_HEADER_RE.test(trimmed) ||
      /^[ \t]/.test(cur) ||
      /^(command|file_path|query|path)\s*:/.test(trimmed) ||
      looksLikeDumpBody(trimmed) ||
      /^namespace:\s*/i.test(trimmed) ||
      /^toolName:\s*/i.test(trimmed) ||
      /^arguments:\s*/i.test(trimmed)
    ) {
      i++;
      continue;
    }

    return "\n" + lines.slice(i).join("\n");
  }

  return "";
}

/**
 * Strip YAML-ish tool dumps like:
 *
 *   Tool: CallDynamicTool
 *   namespace: custom-user-tools
 *   toolName: Bash
 *   arguments: command: |
 *     python3 <<'PY'
 *     ...
 *
 * Also dumps that start with `namespace:` or bare `toolName:` / `arguments:`
 * (no Tool: header).
 */
function stripToolDumps(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.trim();
    const isHeader = TOOL_DUMP_HEADER_RE.test(trimmed);
    const isNamespaceStart =
      /^namespace:\s*\S+/i.test(trimmed) &&
      looksLikeHarnessNamespace(trimmed);
    const isBareToolNameStart = BARE_TOOLNAME_LINE_RE.test(trimmed);
    const isBareArgumentsStart =
      BARE_ARGUMENTS_LINE_RE.test(trimmed) &&
      looksLikeBareArgumentsDump(lines, i);

    if (
      !isHeader &&
      !isNamespaceStart &&
      !isBareToolNameStart &&
      !isBareArgumentsStart
    ) {
      out.push(line);
      i++;
      continue;
    }

    i++;
    let sawField = isNamespaceStart || isBareToolNameStart || isBareArgumentsStart;
    while (i < lines.length) {
      const cur = lines[i]!;
      const t = cur.trim();

      if (!t) {
        const next = peekNonEmpty(lines, i + 1);
        if (next !== null && isDumpContinuation(next)) {
          i++;
          continue;
        }
        break;
      }

      if (
        TOOL_DUMP_FIELD_RE.test(t) ||
        TOOL_DUMP_HEADER_RE.test(t) ||
        /^namespace:\s*/i.test(t) ||
        /^toolName:\s*/i.test(t) ||
        /^arguments:\s*/i.test(t)
      ) {
        sawField = true;
        i++;
        continue;
      }

      if (/^[ \t]/.test(cur) && (sawField || looksLikeDumpBody(t))) {
        i++;
        continue;
      }

      if (/^(command|file_path|query|path)\s*:/.test(t) && sawField) {
        i++;
        continue;
      }

      // Same-line dump body after `arguments: {"command":...}` already consumed
      // via TOOL_DUMP_FIELD_RE; multi-line JSON / heredoc bodies look like dump.
      if (sawField && looksLikeDumpBody(t)) {
        i++;
        continue;
      }

      break;
    }

    while (out.length > 0 && out[out.length - 1]!.trim() === "") out.pop();
  }

  return out.join("\n");
}

function looksLikeHarnessNamespace(line: string): boolean {
  return /namespace:\s*(custom-user-tools|cursor|mcp)\b/i.test(line);
}

/** Require nearby dump fields so bare `arguments:` prose is not stripped. */
function looksLikeBareArgumentsDump(lines: string[], index: number): boolean {
  const trimmed = lines[index]!.trim();
  if (/^arguments:\s*[{\[]/.test(trimmed)) return true;
  if (/^arguments:\s*(command|file_path|query|path)\s*:/.test(trimmed)) return true;

  for (let j = index + 1; j < Math.min(lines.length, index + 6); j++) {
    const t = lines[j]!.trim();
    if (!t) continue;
    if (
      TOOL_DUMP_FIELD_RE.test(t) ||
      BARE_TOOLNAME_LINE_RE.test(t) ||
      /^namespace:\s*/i.test(t) ||
      /^(command|file_path|query|path)\s*:/.test(t) ||
      /^[ \t]/.test(lines[j]!) ||
      looksLikeDumpBody(t)
    ) {
      return true;
    }
    break;
  }
  return false;
}

function peekNonEmpty(lines: string[], from: number): string | null {
  for (let i = from; i < lines.length; i++) {
    const t = lines[i]!.trim();
    if (t) return lines[i]!;
  }
  return null;
}

function isDumpContinuation(line: string): boolean {
  const trimmed = line.trim();
  return (
    TOOL_DUMP_FIELD_RE.test(trimmed) ||
    TOOL_DUMP_HEADER_RE.test(trimmed) ||
    /^namespace:\s*/i.test(trimmed) ||
    /^toolName:\s*/i.test(trimmed) ||
    /^arguments:\s*/i.test(trimmed) ||
    /^[ \t]/.test(line) ||
    /^(command|file_path|query|path)\s*:/.test(trimmed)
  );
}

function looksLikeDumpBody(trimmed: string): boolean {
  return (
    /^(python3|bash|node|curl|rg|ls|cd)\b/.test(trimmed) ||
    trimmed.startsWith("import ") ||
    trimmed.startsWith("{") ||
    trimmed.includes("<<'") ||
    trimmed.includes('<<"')
  );
}

function stripOrphanFragments(text: string): string {
  return text
    .split("\n")
    .filter((line) => !isOrphanFragmentLine(line))
    .join("\n");
}

function isOrphanFragmentLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  return ORPHAN_LINE_RE.test(trimmed);
}

function findBalancedBracketEnd(text: string, start: number): number {
  let depth = 0;
  let braceDepth = 0;
  let inSingle = false;
  let inDouble = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;

    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\" && (inSingle || inDouble)) {
      escape = true;
      continue;
    }
    if (!inSingle && ch === '"') {
      inDouble = !inDouble;
      continue;
    }
    if (!inDouble && ch === "'") {
      inSingle = !inSingle;
      continue;
    }
    if (inSingle || inDouble) continue;

    if (ch === "{") {
      braceDepth++;
      continue;
    }
    if (ch === "}") {
      if (braceDepth > 0) braceDepth--;
      continue;
    }
    if (ch === "[" && braceDepth === 0) {
      depth++;
      continue;
    }
    if (ch === "]" && braceDepth === 0) {
      depth--;
      if (depth === 0) return i;
    }
  }

  return -1;
}

function skipTrailingNewline(text: string, index: number): number {
  if (text[index] === "\r" && text[index + 1] === "\n") return index + 2;
  if (text[index] === "\n") return index + 1;
  return index;
}

function splitSafePrefix(text: string): { safe: string; hold: string } {
  const holdAt = earliestHoldIndex(text);
  if (holdAt < 0) return { safe: text, hold: "" };
  return { safe: text.slice(0, holdAt), hold: text.slice(holdAt) };
}

function earliestHoldIndex(text: string): number {
  const candidates = [
    findIncompleteOpenSuffix(text),
    findUnclosedToolCallStart(text),
    findUnclosedXmlToolCallStart(text),
    findPossibleOrphanSuffix(text),
    findPossibleToolDumpSuffix(text),
  ].filter((n) => n >= 0);
  return candidates.length === 0 ? -1 : Math.min(...candidates);
}

function findIncompleteOpenSuffix(text: string): number {
  const prefixes = [
    TOOL_CALL_OPEN,
    XML_TOOL_CALL_OPEN,
    "Tool:",
    "namespace:",
    "toolName:",
    "arguments:",
  ];
  for (const full of prefixes) {
    for (let len = 1; len < full.length; len++) {
      const partial = full.slice(0, len);
      if (text.endsWith(partial)) return text.length - len;
    }
  }
  return -1;
}

function findUnclosedToolCallStart(text: string): number {
  let searchFrom = 0;
  while (true) {
    const start = text.indexOf(TOOL_CALL_OPEN, searchFrom);
    if (start < 0) return -1;
    const end = findBalancedBracketEnd(text, start);
    if (end < 0) return start;
    searchFrom = end + 1;
  }
}

function findUnclosedXmlToolCallStart(text: string): number {
  let searchFrom = 0;
  while (true) {
    const start = text.indexOf(XML_TOOL_CALL_OPEN, searchFrom);
    if (start < 0) return -1;
    const close = text.indexOf(XML_TOOL_CALL_CLOSE, start);
    if (close < 0) return start;
    searchFrom = close + XML_TOOL_CALL_CLOSE.length;
  }
}

function findPossibleOrphanSuffix(text: string): number {
  const lastNl = text.lastIndexOf("\n");
  const tail = lastNl < 0 ? text : text.slice(lastNl + 1);
  const trimmed = tail.trimStart();
  if (!trimmed) return -1;

  if (
    /^(?:[A-Za-z0-9_-]+\s+)?name=(?:Call|Get)[A-Za-z0-9_]*$/.test(trimmed) ||
    /^(?:[A-Za-z0-9_-]+\s+)?name=(?:CallDynamicTool|GetDynamicTools|CallMcpTool|GetMcpTools)\s+args=$/.test(
      trimmed,
    ) ||
    /^(?:[A-Za-z0-9_-]+\s+)?name=(?:CallDynamicTool|GetDynamicTools|CallMcpTool|GetMcpTools)\s+args=\{[^}]*$/.test(
      trimmed,
    )
  ) {
    return lastNl < 0 ? 0 : lastNl + 1;
  }

  if (/^[A-Za-z0-9_-]*_[A-Za-z0-9_-]+$/.test(trimmed) && /\d/.test(trimmed)) {
    return lastNl < 0 ? 0 : lastNl + 1;
  }

  return -1;
}

function findPossibleToolDumpSuffix(text: string): number {
  const lines = text.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i]!.trim();
    if (!trimmed) continue;

    if (
      TOOL_DUMP_HEADER_RE.test(trimmed) ||
      looksLikeHarnessNamespace(trimmed) ||
      BARE_TOOLNAME_LINE_RE.test(trimmed) ||
      (BARE_ARGUMENTS_LINE_RE.test(trimmed) && looksLikeBareArgumentsDump(lines, i))
    ) {
      return lineStartOffset(lines, i);
    }

    if (TOOL_DUMP_FIELD_RE.test(trimmed) || /^[ \t]/.test(lines[i]!)) {
      for (let j = i; j >= 0; j--) {
        const t = lines[j]!.trim();
        if (
          TOOL_DUMP_HEADER_RE.test(t) ||
          looksLikeHarnessNamespace(t) ||
          BARE_TOOLNAME_LINE_RE.test(t)
        ) {
          return lineStartOffset(lines, j);
        }
      }
      for (let j = 0; j <= i; j++) {
        if (
          TOOL_DUMP_FIELD_RE.test(lines[j]!.trim()) ||
          looksLikeHarnessNamespace(lines[j]!.trim()) ||
          BARE_TOOLNAME_LINE_RE.test(lines[j]!.trim())
        ) {
          return lineStartOffset(lines, j);
        }
      }
    }

    if (/^Tool:\s*(?:Call|Get)?[A-Za-z0-9_]*$/.test(trimmed)) {
      return lineStartOffset(lines, i);
    }

    if (
      INLINE_NAMESPACE_DUMP_RE.test(trimmed) ||
      INLINE_TOOL_HEADER_RE.test(trimmed) ||
      INLINE_TOOLNAME_DUMP_RE.test(trimmed)
    ) {
      return lineStartOffset(lines, i);
    }

    break;
  }
  return -1;
}

function lineStartOffset(lines: string[], index: number): number {
  let offset = 0;
  for (let i = 0; i < index; i++) {
    offset += lines[i]!.length + 1;
  }
  return offset;
}

function stripIncompleteOnFlush(text: string): string {
  let result = text;
  const bracket = findUnclosedToolCallStart(result);
  if (bracket >= 0) result = result.slice(0, bracket);
  const xml = findUnclosedXmlToolCallStart(result);
  if (xml >= 0) result = result.slice(0, xml);

  const dumpHold = findPossibleToolDumpSuffix(result);
  if (dumpHold >= 0) result = result.slice(0, dumpHold);

  const lastNl = result.lastIndexOf("\n");
  const head = lastNl < 0 ? "" : result.slice(0, lastNl + 1);
  const tail = lastNl < 0 ? result : result.slice(lastNl + 1);
  if (tail && looksLikeIncompleteOrphan(tail)) return head;
  return result;
}

function looksLikeIncompleteOrphan(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (isOrphanFragmentLine(trimmed)) return true;
  if (/^Tool:\s*/.test(trimmed)) return true;
  if (/^namespace:\s*/i.test(trimmed)) return true;
  if (/^toolName:\s*/i.test(trimmed)) return true;
  if (/^arguments:\s*/i.test(trimmed)) return true;
  if (
    INLINE_NAMESPACE_DUMP_RE.test(trimmed) ||
    INLINE_TOOL_HEADER_RE.test(trimmed) ||
    INLINE_TOOLNAME_DUMP_RE.test(trimmed)
  ) {
    return true;
  }
  return (
    /^(?:[A-Za-z0-9_-]+\s+)?name=(?:Call|Get)/.test(trimmed) ||
    (/^[A-Za-z0-9_-]*_[A-Za-z0-9_-]+$/.test(trimmed) && /\d/.test(trimmed))
  );
}

function collapseExtraBlankLines(text: string): string {
  return text.replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n");
}
