import type { Candidate } from "./types";

export type ImageLineType = "图片标题" | "图片链接" | "图片HTML";

export function detectImageLineType(raw: string): ImageLineType | undefined {
  if (/<\s*(?:img|picture|figure|source)\b/i.test(raw)) return "图片HTML";
  if (/!\[[^\]]*\]\([^)]+\)|!\[\[[^\]]+\]\]/.test(raw)) return "图片链接";
  if (/^\s*(?:#{1,6}\s*)?(?:figure|fig\.?|图)\s*(?:\d|[IVXLCDM])/i.test(raw)) return "图片标题";
  return undefined;
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
