/** Remove harness tool-call markup that models may echo into assistant text. */

const TOOL_CALL_OPEN = "[tool_call";
const XML_TOOL_CALL_OPEN = "<tool_call";
const XML_TOOL_CALL_CLOSE = "</tool_call>";

const DYNAMIC_TOOL_NAMES =
  "CallDynamicTool|GetDynamicTools|CallMcpTool|GetMcpTools";

const ORPHAN_LINE_RE = new RegExp(
  String.raw`^(?:[A-Za-z0-9_-]+\s+)?name=(?:${DYNAMIC_TOOL_NAMES})\s+args=`,
);

export interface ToolMarkupStreamFilter {
  push(chunk: string): string;
  flush(): string;
}

export function stripToolMarkup(text: string): string {
  if (!text) return text;
  let result = stripBracketToolCalls(text);
  result = stripXmlToolCalls(result);
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
  ].filter((n) => n >= 0);
  return candidates.length === 0 ? -1 : Math.min(...candidates);
}

function findIncompleteOpenSuffix(text: string): number {
  const prefixes = [TOOL_CALL_OPEN, XML_TOOL_CALL_OPEN];
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

function stripIncompleteOnFlush(text: string): string {
  let result = text;
  const bracket = findUnclosedToolCallStart(result);
  if (bracket >= 0) result = result.slice(0, bracket);
  const xml = findUnclosedXmlToolCallStart(result);
  if (xml >= 0) result = result.slice(0, xml);

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
  return (
    /^(?:[A-Za-z0-9_-]+\s+)?name=(?:Call|Get)/.test(trimmed) ||
    (/^[A-Za-z0-9_-]*_[A-Za-z0-9_-]+$/.test(trimmed) && /\d/.test(trimmed))
  );
}

function collapseExtraBlankLines(text: string): string {
  return text.replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n");
}
