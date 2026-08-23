import type { Candidate, SourceRange } from "./types";

export type EmbedLineType = "嵌入块首" | "内嵌标题" | "嵌入链接" | "嵌入HTML" | "HTML表" | "嵌入文本";

const HTML_TAG_RE = /<\s*\/?\s*[a-zA-Z][a-zA-Z0-9-]*(?:\s|\/|>)/;
const IMAGE_LINK_RE = /!\[[^\]]*\]\([^)]+\)|!\[\[[^\]]+\]\]/;
const EMBED_TITLE_RE = /^\s*(?:#{1,6}\s*)?(?:figure|fig\.?|图)\s*(?:\d|[IVXLCDM])/i;
const HEADING_RE = /^ {0,3}#{1,6}(?:\s|$)/;
const VOID_HTML_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr",
]);
const TABLE_INNER_TAGS = new Set(["thead", "tbody", "tfoot", "tr", "td", "th", "caption", "colgroup", "col"]);

export function detectEmbedLineType(raw: string): Exclude<EmbedLineType, "嵌入文本"> | undefined {
  if (isEmbedBlockStart(raw)) return "嵌入块首";
  if (isHtmlTableMarkup(raw)) return "HTML表";
  if (HTML_TAG_RE.test(raw)) return "嵌入HTML";
  if (IMAGE_LINK_RE.test(raw)) return "嵌入链接";
  if (EMBED_TITLE_RE.test(raw)) return "内嵌标题";
  return undefined;
}

function isHtmlTableMarkup(raw: string): boolean {
  if (/<\s*table\b/i.test(raw)) return true;
  const tag = firstHtmlTag(raw.split("\n")[0] ?? "");
  return Boolean(tag && TABLE_INNER_TAGS.has(tag.name));
}

export function embedRangeContains(outer: SourceRange, inner: SourceRange): boolean {
  const outerEnd = outer.endLine ?? outer.line;
  const innerEnd = inner.endLine ?? inner.line;
  return inner.line >= outer.line && innerEnd <= outerEnd;
}

export interface EmbedRegion {
  number: number;
  markerLine: number;
  contentStart: number;
  contentEnd: number;
}

/** A line whose only character is `>` starts an embed block. */
export function isEmbedBlockStart(line: string): boolean {
  return line.trim() === ">";
}

/** Embed blocks run from a `>` line through every following line until the next `>`. */
export function findEmbedRegions(lines: string[]): EmbedRegion[] {
  const markers: number[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (isEmbedBlockStart(lines[index])) markers.push(index);
  }
  return markers.map((markerLine, index) => {
    const stop = markers[index + 1] ?? lines.length;
    const contentStart = markerLine + 1;
    const last = stop - 1;
    return {
      number: index + 1,
      markerLine,
      contentStart,
      contentEnd: last >= contentStart ? last : contentStart - 1,
    };
  });
}

/** Split a consecutive-text block into embed rows inside `>` regions. */
export function embedRowsFromBlock(block: Candidate): Candidate[] {
  const lines = block.raw.replace(/\r\n?/g, "\n").split("\n");
  return scanEmbedFromLines(lines, block.range.line).map((row) => ({
    ...block,
    ...row,
    typeLabel: "嵌入块",
    chapterBoundaryState: undefined,
    baselinePreview: undefined,
  }));
}

/** Identify HTML and image links inside `>` embed blocks. */
export function scanEmbedLines(text: string): Candidate[] {
  return scanEmbedFromLines(text.replace(/\r\n?/g, "\n").split("\n"), 0);
}

/** Tag openers like `<td>` / `<tr ` from the html-embed regex — not whole elements. */
export function isHtmlTagFragment(raw: string): boolean {
  const trimmed = raw.trim();
  return /^<\s*\/?\s*[a-zA-Z][a-zA-Z0-9-]*(?:\s|\/|>)\s*$/.test(trimmed);
}

/**
 * Combine `>`-block / HTML / image detection with extra regex hits.
 * Matches already covered by a grouped HTML block, and per-tag fragments
 * like `<td>`, are dropped so a large table cannot explode the row list.
 */
export function mergeEmbedScan(text: string, patterns: string[]): Candidate[] {
  const scanned = scanEmbedLines(text);
  const unique = new Map<string, Candidate>();
  const keyOf = (row: Candidate) => `${row.range.line}\0${row.range.start}\0${row.raw}`;
  for (const row of scanned) unique.set(keyOf(row), row);

  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const regions = findEmbedRegions(lines);
  const numberAt = (line: number) => regions.find((region) =>
    line === region.markerLine || (line >= region.contentStart && line <= region.contentEnd)
  )?.number;

  for (const pattern of patterns) {
    for (const match of scanRegexMatches(text, pattern)) {
      if (isHtmlTagFragment(match.raw)) continue;
      if (scanned.some((embed) => embedRangeContains(embed.range, match.range))) continue;
      const row: Candidate = {
        ...match,
        typeLabel: "嵌入块",
        lineType: detectEmbedLineType(match.raw) ?? "嵌入文本",
        regexSource: pattern,
        embedNumber: numberAt(match.range.line),
      };
      unique.set(keyOf(row), row);
    }
  }
  return applyEmbedNumbers(
    [...unique.values()].sort((left, right) =>
      left.range.line - right.range.line || left.range.start - right.range.start),
    text,
  );
}

/** Derive 序号 from the current working copy: each `>` and the lines after it share one number until the next `>`. */
export function applyEmbedNumbers<T extends { range: { line: number }; typeLabel?: string; embedNumber?: number }>(
  rows: T[],
  text: string,
): T[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const regions = findEmbedRegions(lines);
  return rows.map((row) => {
    if (row.typeLabel && row.typeLabel !== "嵌入块") return row;
    const line = row.range.line;
    const embedNumber = regions.find((region) =>
      line === region.markerLine || (line >= region.contentStart && line <= region.contentEnd)
    )?.number;
    return { ...row, embedNumber };
  });
}

export function embedNumberAtLine(text: string, line: number): number | undefined {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  return findEmbedRegions(lines).find((region) =>
    line === region.markerLine || (line >= region.contentStart && line <= region.contentEnd)
  )?.number;
}

function numberAt(regions: EmbedRegion[], line: number, lineOffset: number): number | undefined {
  const absolute = line;
  return regions.find((region) => {
    const marker = lineOffset + region.markerLine;
    const start = lineOffset + region.contentStart;
    const end = lineOffset + region.contentEnd;
    return absolute === marker || (absolute >= start && absolute <= end);
  })?.number;
}

function scanEmbedFromLines(lines: string[], lineOffset: number): Candidate[] {
  const regions = findEmbedRegions(lines);
  const collected = collectEmbedRows(lines, lineOffset);
  const covered = new Set<number>();
  const rows: Candidate[] = [];
  for (const row of collected) {
    const start = row.range.line;
    const end = row.range.endLine ?? row.range.line;
    for (let line = start; line <= end; line += 1) covered.add(line);
    rows.push({ ...row, embedNumber: numberAt(regions, start, lineOffset) });
  }
  for (const region of regions) {
    if (region.contentEnd < region.contentStart) continue;
    for (let index = region.contentStart; index <= region.contentEnd; index += 1) {
      const absolute = lineOffset + index;
      const line = lines[index];
      if (covered.has(absolute) || !line.trim()) continue;
      if (!isEmbedCaptionLine(lines, index, region, covered, lineOffset)) continue;
      rows.push({
        id: `embed-${absolute}`,
        kind: "regex",
        label: line.trim(),
        raw: line,
        preview: line.slice(0, 255),
        range: { line: absolute, start: 0, end: line.length },
        typeLabel: "嵌入块",
        lineType: "嵌入文本",
        embedNumber: region.number,
        status: "候选",
      });
    }
  }
  return rows.sort((left, right) => left.range.line - right.range.line || left.range.start - right.range.start);
}

/** Caption-like leftover next to a `>` pack or after an already-detected embed line — not chapter prose. */
function isEmbedCaptionLine(
  lines: string[],
  index: number,
  region: EmbedRegion,
  covered: Set<number>,
  lineOffset: number,
): boolean {
  if (HEADING_RE.test(lines[index])) return false;
  const first = region.markerLine + 1;
  if (first < lines.length && lines[first].trim()) {
    let runEnd = first;
    while (runEnd + 1 < lines.length && lines[runEnd + 1].trim()) runEnd += 1;
    if (index >= first && index <= runEnd) return true;
  }
  let runStart = index;
  while (runStart > 0 && lines[runStart - 1].trim()) runStart -= 1;
  for (let cursor = runStart; cursor < index; cursor += 1) {
    if (covered.has(lineOffset + cursor)) return true;
  }
  return false;
}

function collectEmbedRows(lines: string[], lineOffset: number): Candidate[] {
  const rows: Candidate[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    let lineType = detectEmbedLineType(line);
    if (!lineType) {
      index += 1;
      continue;
    }
    const end = lineType === "嵌入HTML" || lineType === "HTML表" ? findHtmlBlockEnd(lines, index) : index;
    const raw = lines.slice(index, end + 1).join("\n");
    if (isHtmlTableMarkup(raw)) lineType = "HTML表";
    const startLine = lineOffset + index;
    const endLine = lineOffset + end;
    rows.push({
      id: `embed-${startLine}`,
      kind: "regex",
      label: line.trim() || `L${startLine + 1}`,
      raw,
      preview: raw.replace(/\r?\n/g, " ⏎ ").trim().slice(0, 255),
      range: {
        line: startLine,
        start: 0,
        endLine: endLine === startLine ? undefined : endLine,
        end: lines[end].length,
      },
      typeLabel: "嵌入块",
      lineType,
      status: "候选",
    });
    index = end + 1;
  }
  return rows;
}

function findHtmlBlockEnd(lines: string[], start: number): number {
  const tag = firstHtmlTag(lines[start]);
  if (!tag) return start;
  if (tag.selfClosing || VOID_HTML_TAGS.has(tag.name)) return start;
  if (TABLE_INNER_TAGS.has(tag.name)) return htmlRunEnd(lines, start, TABLE_INNER_TAGS);
  const depthOnLine = htmlTagDepthDelta(lines[start], tag.name);
  if (tag.closing || depthOnLine <= 0) return start;
  let depth = depthOnLine;
  let end = start;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (isHtmlBlockHardStop(lines[index]) && !HTML_TAG_RE.test(lines[index])) return end;
    depth += htmlTagDepthDelta(lines[index], tag.name);
    end = index;
    if (depth <= 0) return index;
  }
  return end;
}

function htmlRunEnd(lines: string[], start: number, innerTags?: Set<string>): number {
  let end = start;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (isHtmlBlockHardStop(line) && !HTML_TAG_RE.test(line)) break;
    const tag = firstHtmlTag(line);
    if (innerTags && tag && !innerTags.has(tag.name) && tag.name !== "table") break;
    if (!HTML_TAG_RE.test(line) && line.trim() && !innerTags) break;
    end = index;
  }
  return end;
}

function isHtmlBlockHardStop(line: string): boolean {
  return HEADING_RE.test(line) || Boolean(EMBED_TITLE_RE.test(line) && !HTML_TAG_RE.test(line));
}

function firstHtmlTag(line: string): { name: string; closing: boolean; selfClosing: boolean } | undefined {
  const match = /<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>/.exec(line);
  if (!match) return undefined;
  return {
    name: match[2].toLowerCase(),
    closing: Boolean(match[1]),
    selfClosing: /\/\s*$/.test(match[3]) || VOID_HTML_TAGS.has(match[2].toLowerCase()),
  };
}

function htmlTagDepthDelta(line: string, tagName: string): number {
  const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const openRe = new RegExp(`<\\s*${escaped}\\b[^>]*>`, "gi");
  const closeRe = new RegExp(`<\\s*/\\s*${escaped}\\s*>`, "gi");
  const selfRe = new RegExp(`<\\s*${escaped}\\b[^>]*/>`, "gi");
  const opens = line.match(openRe)?.length ?? 0;
  const closes = line.match(closeRe)?.length ?? 0;
  const selfs = line.match(selfRe)?.length ?? 0;
  return opens - selfs - closes;
}

export function scanRegexMatches(text: string, pattern: string): Candidate[] {
  if (!pattern.trim()) return [];
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, "gm");
  } catch {
    return [];
  }

  const starts = lineStartOffsets(text);
  const rows: Candidate[] = [];
  for (const match of text.matchAll(regex)) {
    let raw = match[0];
    if (!raw) continue;
    const leadingNewlines = /^(?:\r\n|\r|\n)+/.exec(raw)?.[0] ?? "";
    raw = raw.slice(leadingNewlines.length);
    if (!raw) continue;
    const offset = (match.index ?? 0) + leadingNewlines.length;
    const start = positionAtOffset(starts, offset);
    const end = positionAtOffset(starts, offset + raw.length);
    rows.push({
      id: `regex-${start.line}-${start.character}-${rows.length}`,
      kind: "regex",
      label: match[1]?.trim() || raw.replace(/\r?\n/g, " ").trim(),
      raw,
      preview: raw.replace(/\r?\n/g, " ⏎ ").trim(),
      range: {
        line: start.line,
        start: start.character,
        endLine: end.line === start.line ? undefined : end.line,
        end: end.character,
      },
      status: "候选",
    });
  }
  return rows;
}

export function isMarkdownStructuralLine(line: string): boolean {
  return /^(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>|\||```|~~~)/.test(line.trim());
}

function lineStartOffsets(text: string): number[] {
  const starts = [0];
  for (const match of text.matchAll(/\r\n|\r|\n/g)) {
    starts.push((match.index ?? 0) + match[0].length);
  }
  return starts;
}

function positionAtOffset(starts: number[], offset: number): { line: number; character: number } {
  let low = 0;
  let high = starts.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (starts[middle] <= offset) low = middle + 1;
    else high = middle - 1;
  }
  const line = Math.max(high, 0);
  return { line, character: offset - starts[line] };
}
