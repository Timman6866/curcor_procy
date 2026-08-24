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
  /^(namespace|toolName|tool_name|arguments|args)\s*:\s*/;

export interface ToolMarkupStreamFilter {
  push(chunk: string): string;
  flush(): string;
}

export function stripToolMarkup(text: string): string {
  if (!text) return text;
  let result = stripBracketToolCalls(text);
  result = stripXmlToolCalls(result);
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
 * Strip YAML-ish tool dumps like:
 *
 *   Tool: CallDynamicTool
 *   namespace: custom-user-tools
 *   toolName: Bash
 *   arguments: command: |
 *     python3 <<'PY'
 *     ...
 */
function stripToolDumps(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    if (!TOOL_DUMP_HEADER_RE.test(line.trim())) {
      out.push(line);
      i++;
      continue;
    }

    // Consume the Tool: header and following dump fields / indented body.
    i++;
    let sawField = false;
    while (i < lines.length) {
      const cur = lines[i]!;
      const trimmed = cur.trim();

      if (!trimmed) {
        // Blank line inside dump: keep consuming if next looks like dump body.
        const next = peekNonEmpty(lines, i + 1);
        if (next !== null && isDumpContinuation(next)) {
          i++;
          continue;
        }
        break;
      }

      if (TOOL_DUMP_FIELD_RE.test(trimmed) || TOOL_DUMP_HEADER_RE.test(trimmed)) {
        sawField = true;
        i++;
        continue;
      }

      // Indented argument body (heredoc / YAML block).
      if (/^[ \t]/.test(cur) && (sawField || looksLikeDumpBody(trimmed))) {
        i++;
        continue;
      }

      // Inline `command: |` / `arguments: {` without prior field lines.
      if (/^(command|file_path|query|path)\s*:/.test(trimmed) && sawField) {
        i++;
        continue;
      }

      break;
    }

    // Drop a trailing blank left by the dump so prose doesn't gain gaps.
    while (out.length > 0 && out[out.length - 1]!.trim() === "") out.pop();
  }

  return out.join("\n");
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
    /^[ \t]/.test(line) ||
    /^(command|file_path|query|path)\s*:/.test(trimmed)
  );
}

function looksLikeDumpBody(trimmed: string): boolean {
  return (
    /^(python3|bash|node|curl|rg|ls|cd)\b/.test(trimmed) ||
    trimmed.startsWith("import ") ||
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

/**
 * Find the closing `]` of a `[tool_call …]` block, respecting nested `{}` / `[]`
 * and quoted strings inside args.
 */
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
  const prefixes = [TOOL_CALL_OPEN, XML_TOOL_CALL_OPEN, "Tool:"];
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

/** Hold a trailing incomplete `Tool:` dump so the next chunk can complete it. */
function findPossibleToolDumpSuffix(text: string): number {
  const lines = text.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i]!.trim();
    if (!trimmed) continue;

    if (TOOL_DUMP_HEADER_RE.test(trimmed)) {
      return lineStartOffset(lines, i);
    }

    // Mid-dump field or indented body: walk back to Tool: header.
    if (TOOL_DUMP_FIELD_RE.test(trimmed) || /^[ \t]/.test(lines[i]!)) {
      for (let j = i; j >= 0; j--) {
        if (TOOL_DUMP_HEADER_RE.test(lines[j]!.trim())) {
          return lineStartOffset(lines, j);
        }
      }
    }

    // Partial "Tool:" / "Tool: Call" on last line.
    if (/^Tool:\s*(?:Call|Get)?[A-Za-z0-9_]*$/.test(trimmed)) {
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
  return (
    /^(?:[A-Za-z0-9_-]+\s+)?name=(?:Call|Get)/.test(trimmed) ||
    (/^[A-Za-z0-9_-]*_[A-Za-z0-9_-]+$/.test(trimmed) && /\d/.test(trimmed))
  );
}

function collapseExtraBlankLines(text: string): string {
  return text.replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n");
}
