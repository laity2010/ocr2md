import type { Candidate } from "./types";

export type EmbedLineType = "内嵌标题" | "嵌入链接" | "嵌入HTML" | "嵌入文本";

const HTML_TAG_RE = /<\s*\/?\s*[a-zA-Z][a-zA-Z0-9-]*(?:\s|\/|>)/;
const IMAGE_LINK_RE = /!\[[^\]]*\]\([^)]+\)|!\[\[[^\]]+\]\]/;
const EMBED_TITLE_RE = /^\s*(?:#{1,6}\s*)?(?:figure|fig\.?|图)\s*(?:\d|[IVXLCDM])/i;

export function detectEmbedLineType(raw: string): Exclude<EmbedLineType, "嵌入文本"> | undefined {
  if (HTML_TAG_RE.test(raw)) return "嵌入HTML";
  if (IMAGE_LINK_RE.test(raw)) return "嵌入链接";
  if (EMBED_TITLE_RE.test(raw)) return "内嵌标题";
  return undefined;
}

/** Split a consecutive-text block into one embed row per matching line. */
export function embedRowsFromBlock(block: Candidate): Candidate[] {
  const lines = block.raw.replace(/\r\n?/g, "\n").split("\n");
  const start = block.range.line;
  const rows: Candidate[] = [];
  lines.forEach((line, offset) => {
    const lineType = detectEmbedLineType(line);
    if (!lineType) return;
    rows.push({
      ...block,
      raw: line,
      preview: line.slice(0, 255),
      label: line.trim(),
      typeLabel: "嵌入块",
      lineType,
      chapterBoundaryState: undefined,
      baselinePreview: undefined,
      range: { line: start + offset, start: 0, end: line.length },
    });
  });
  return rows;
}

/** Identify every image link and HTML line in a chapter file. */
export function scanEmbedLines(text: string): Candidate[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const rows: Candidate[] = [];
  lines.forEach((line, lineNumber) => {
    const lineType = detectEmbedLineType(line);
    if (!lineType) return;
    rows.push({
      id: `embed-${lineNumber}`,
      kind: "regex",
      label: line.trim(),
      raw: line,
      preview: line.slice(0, 255),
      range: { line: lineNumber, start: 0, end: line.length },
      typeLabel: "嵌入块",
      lineType,
      status: "候选",
    });
  });
  return rows;
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
