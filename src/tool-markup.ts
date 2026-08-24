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
 *
 * Mid-sentence mentions like `Set the toolName: weather for …` are not dumps;
 * confirmation happens in isConfirmedInlineDump.
 */
const INLINE_NAMESPACE_DUMP_RE =
  /(?:^|[.\s])namespace:\s*(?:custom-user-tools|cursor|mcp)\b/i;

const INLINE_TOOL_HEADER_RE = new RegExp(
  String.raw`(?:^|[.\s])Tool:\s*(?:${DYNAMIC_TOOL_NAMES})\b`,
);

const INLINE_TOOLNAME_DUMP_RE =
  /(?:^|[.\s])toolName:\s*[A-Za-z][A-Za-z0-9_-]*\b/i;

const INLINE_DUMP_FIELD_AHEAD_RE =
  /^\s+(?:toolName|tool_name|arguments|args|namespace)\s*:/i;

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
    let dumpStart = cutAt;
    let cleanEnd = cutAt;
    if (lead === " " || lead === "\t") {
      // Drop the separator space before the dump.
      dumpStart = cutAt + 1;
      cleanEnd = cutAt;
    } else if (lead === ".") {
      // Keep sentence/word-ending period; dump starts after it.
      dumpStart = cutAt + 1;
      cleanEnd = cutAt + 1;
    }
    const cleanBefore = result.slice(0, cleanEnd);

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
    let from = 0;
    while (from < text.length) {
      const slice = text.slice(from);
      const match = re.exec(slice);
      if (!match) break;
      const index = from + match.index;
      const lead = text[index]!;
      // Advance past this candidate even when rejected (regexes are non-global).
      from = index + Math.max(match[0].length, 1);
      if (index === 0) continue;
      if (lead === "\n" || lead === "\r") continue;
      // Rebuild a match-shaped object with absolute index for confirmation.
      const absMatch = Object.assign([], match, {
        index,
        input: text,
        0: match[0],
      }) as RegExpExecArray;
      if (!isConfirmedInlineDump(text, absMatch)) continue;
      if (best < 0 || index < best) best = index;
      break;
    }
  }
  return best;
}

/**
 * True dumps have another dump field ahead, a newline-prefixed dump, or a
 * glued lead (no space before the marker). Mid-sentence prose like
 * `Set the toolName: weather for …` keeps the remainder.
 */
function isConfirmedInlineDump(
  text: string,
  match: RegExpExecArray,
): boolean {
  const lead = text[match.index]!;
  const glued = lead === "." || (lead !== " " && lead !== "\t");
  const after = text.slice(match.index + match[0].length);
  const firstLine = after.split("\n", 1)[0] ?? "";
  const restLines = after.slice(firstLine.length);

  if (INLINE_DUMP_FIELD_AHEAD_RE.test(firstLine)) return true;
  if (/^\s+[{\[]/.test(firstLine)) return true;

  // Tool: CallDynamicTool alone is already a dump header when mid-line.
  if (/^(?:\.|[ \t])?Tool:\s*/.test(match[0])) return true;

  // Namespace harness value is dump-like when glued or followed by fields/newline dump.
  if (/namespace:\s*(?:custom-user-tools|cursor|mcp)\b/i.test(match[0])) {
    if (glued) return true;
    if (INLINE_DUMP_FIELD_AHEAD_RE.test(firstLine)) return true;
    if (/^\n(?:namespace|toolName|tool_name|arguments|args)\s*:/i.test(restLines)) {
      return true;
    }
    // Spaced mid-sentence: `Configure the namespace: custom-user-tools for …`
    return false;
  }

  // toolName: … — require dump fields / JSON / glued lead.
  if (/toolName:\s*/i.test(match[0])) {
    if (INLINE_DUMP_FIELD_AHEAD_RE.test(firstLine)) return true;
    if (/^\s+[{\[]/.test(firstLine)) return true;
    if (/^\n(?:namespace|toolName|tool_name|arguments|args)\s*:/i.test(restLines)) {
      return true;
    }
    if (glued) return true;
    return false;
  }

  return glued;
}

/** Given text starting at a dump marker, return only non-dump trailing prose if any. */
function stripTrailingDumpFrom(dumpAndMaybeProse: string): string {
  const lines = dumpAndMaybeProse.split("\n");
  let i = 0;

  while (i < lines.length) {
    const cur = lines[i]!;
    const trimmed = cur.trim();

    if (i === 0) {
      const sameLineTail = trailingProseAfterInlineDump(cur);
      if (sameLineTail !== null) {
        const later = lines.slice(1);
        // Still consume dump continuation lines after the first line.
        let j = 0;
        while (j < later.length) {
          const t = later[j]!.trim();
          if (
            !t ||
            TOOL_DUMP_FIELD_RE.test(t) ||
            TOOL_DUMP_HEADER_RE.test(t) ||
            /^[ \t]/.test(later[j]!) ||
            /^(command|file_path|query|path)\s*:/.test(t) ||
            looksLikeDumpBody(t) ||
            /^namespace:\s*/i.test(t) ||
            /^toolName:\s*/i.test(t) ||
            /^arguments:\s*/i.test(t)
          ) {
            if (!t) {
              const next = peekNonEmpty(later, j + 1);
              if (
                next !== null &&
                (isDumpContinuation(next) || looksLikeDumpBody(next.trim()))
              ) {
                j++;
                continue;
              }
              return sameLineTail + "\n" + later.slice(j + 1).join("\n");
            }
            j++;
            continue;
          }
          return sameLineTail + "\n" + later.slice(j).join("\n");
        }
        return sameLineTail;
      }
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
 * If the first dump line embeds JSON/braced args then more prose on the same
 * line, return that prose (with a leading space when needed). Otherwise null
 * so the whole first line is treated as dump.
 */
function trailingProseAfterInlineDump(firstLine: string): string | null {
  // Prefer balanced JSON after `arguments:` / `args:`.
  const argsIdx = firstLine.search(/\b(?:arguments|args)\s*:\s*[{\[]/i);
  if (argsIdx >= 0) {
    const braceAt = firstLine.indexOf("{", argsIdx);
    const bracketAt = firstLine.indexOf("[", argsIdx);
    let openAt = -1;
    let openCh = "{";
    let closeCh = "}";
    if (braceAt >= 0 && (bracketAt < 0 || braceAt < bracketAt)) {
      openAt = braceAt;
    } else if (bracketAt >= 0) {
      openAt = bracketAt;
      openCh = "[";
      closeCh = "]";
    }
    if (openAt >= 0) {
      const end = findBalancedJsonEnd(firstLine, openAt, openCh, closeCh);
      if (end >= 0) {
        const tail = firstLine.slice(end + 1);
        if (/\S/.test(tail)) {
          return /^\s/.test(tail) ? tail : " " + tail;
        }
        return "";
      }
    }
  }

  return null;
}

function findBalancedJsonEnd(
  text: string,
  start: number,
  openCh: string,
  closeCh: string,
): number {
  let depth = 0;
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
    if (ch === openCh) depth++;
    else if (ch === closeCh) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
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
  // Bracket/XML opens can appear mid-stream with short partials.
  for (const full of [TOOL_CALL_OPEN, XML_TOOL_CALL_OPEN]) {
    for (let len = 1; len < full.length; len++) {
      const partial = full.slice(0, len);
      if (text.endsWith(partial)) return text.length - len;
    }
  }

  // Dump-field markers only count at a token boundary (start / whitespace),
  // never after backticks or mid-word, and only once the partial is
  // distinctive enough that ordinary prose ("the", "to", "a") is not held.
  // "Tool:" incomplete holds rely on findPossibleToolDumpSuffix once the
  // colon arrives; minLen 5 disables holding bare "Tool" ("the Tool").
  const dumpPrefixes: { full: string; minLen: number }[] = [
    { full: "Tool:", minLen: 5 },
    { full: "namespace:", minLen: 5 },
    { full: "toolName:", minLen: 5 },
    { full: "arguments:", minLen: 5 },
  ];
  for (const { full, minLen } of dumpPrefixes) {
    for (let len = minLen; len < full.length; len++) {
      const partial = full.slice(0, len);
      if (!text.endsWith(partial)) continue;
      const at = text.length - len;
      if (!isDumpMarkerTokenBoundary(text, at)) continue;
      return at;
    }
  }
  return -1;
}

/** True when index is start-of-text or preceded by whitespace/newline. */
function isDumpMarkerTokenBoundary(text: string, index: number): boolean {
  if (index <= 0) return true;
  const prev = text[index - 1]!;
  return prev === " " || prev === "\t" || prev === "\n" || prev === "\r";
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

    // Continuation / indented dump body — walk up to a real dump start.
    // Do not treat field-prefix prose (e.g. chunk starting with toolName: + backtick prose)
    // as a dump just because TOOL_DUMP_FIELD_RE matches the prefix.
    if (
      (TOOL_DUMP_FIELD_RE.test(trimmed) && isDumpShapedFieldLine(trimmed)) ||
      /^[ \t]/.test(lines[i]!)
    ) {
      for (let j = i; j >= 0; j--) {
        const t = lines[j]!.trim();
        if (
          TOOL_DUMP_HEADER_RE.test(t) ||
          looksLikeHarnessNamespace(t) ||
          BARE_TOOLNAME_LINE_RE.test(t) ||
          isDumpShapedFieldLine(t)
        ) {
          return lineStartOffset(lines, j);
        }
      }
    }

    if (/^Tool:\s*(?:Call|Get)?[A-Za-z0-9_]*$/.test(trimmed)) {
      return lineStartOffset(lines, i);
    }

    // Only hold the line when an inline match is a confirmed dump, not mid-sentence prose.
    const lineOffset = lineStartOffset(lines, i);
    const confirmedInline = earliestInlineDumpIndex(
      // Probe the line in isolation with a leading space so mid-line regexes can fire.
      " " + trimmed,
    );
    if (confirmedInline >= 0) {
      return lineOffset;
    }

    break;
  }
  return -1;
}

/**
 * True when a TOOL_DUMP_FIELD_RE line looks like a real dump value, not prose
 * that happens to start with toolName: / arguments: (e.g. inline code).
 */
function isDumpShapedFieldLine(trimmed: string): boolean {
  const field = trimmed.match(
    /^(namespace|toolName|tool_name|arguments|args|description|mcpDetails)\s*:\s*(.*)$/i,
  );
  if (!field) return false;
  const name = field[1]!.toLowerCase();
  const rest = field[2] ?? "";
  if (!rest.trim()) return true; // incomplete field — hold
  if (name === "namespace") {
    return /^(custom-user-tools|cursor|mcp)\b/i.test(rest);
  }
  if (name === "toolname" || name === "tool_name") {
    if (/^[A-Za-z][A-Za-z0-9_-]*\s*$/.test(rest)) return true;
    if (
      /^[A-Za-z][A-Za-z0-9_-]*\s+(?:arguments|args|namespace)\s*:/i.test(rest)
    ) {
      return true;
    }
    if (/^[{\[]/.test(rest.trim())) return true;
    return false;
  }
  if (name === "arguments" || name === "args") {
    const t = rest.trim();
    if (!t || /^[{\[]/.test(t)) return true;
    if (/^(command|file_path|query|path)\s*:/.test(t)) return true;
    if (looksLikeDumpBody(t)) return true;
    return false;
  }
  // description / mcpDetails — dump-ish when under a dump context.
  return true;
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
  // Field-prefix lines must look dump-shaped — not inline code like `toolName:`.
  if (
    /^(?:namespace|toolName|arguments)\s*:/i.test(trimmed) &&
    isDumpShapedFieldLine(trimmed)
  ) {
    return true;
  }
  // Mid-sentence confirmed inline dumps must not be dropped on flush as orphans
  // unless they are dump-shaped; earliestInlineDumpIndex already gates that.
  if (earliestInlineDumpIndex(" " + trimmed) >= 0) return true;
  return (
    /^(?:[A-Za-z0-9_-]+\s+)?name=(?:Call|Get)/.test(trimmed) ||
    (/^[A-Za-z0-9_-]*_[A-Za-z0-9_-]+$/.test(trimmed) && /\d/.test(trimmed))
  );
}

function collapseExtraBlankLines(text: string): string {
  return text.replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n");
}
