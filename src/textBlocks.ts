import { createHash } from "crypto";
import type { Candidate } from "./types";

export type TextBlockType = "标题" | "内嵌" | "文本" | "注释正文";

export function scanTextBlocks(markdown: string, sourcePath: string): Candidate[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const rows: Candidate[] = [];
  let blockStart = leadingFrontmatterEnd(lines);

  const pushBlock = (start: number, endExclusive: number) => {
    let first = start;
    let last = endExclusive - 1;
    while (first <= last && !lines[first]?.trim()) first += 1;
    while (last >= first && !lines[last]?.trim()) last -= 1;
    if (first > last) return;
    const raw = lines.slice(first, last + 1).join("\n");
    const lineType = classifyTextBlock(raw);
    const hash = createHash("sha256").update(`${first}\0${raw}`).digest("hex").slice(0, 16);
    rows.push({
      id: `text-block-${first}-${hash}`,
      rowId: `text-block-${first}-${hash}`,
      kind: "regex",
      label: raw.trim(),
      raw,
      preview: raw,
      range: {
        line: first,
        start: 0,
        endLine: last === first ? undefined : last,
        end: (lines[last] ?? "").length,
      },
      typeLabel: "文本块",
      lineType,
      sourcePath,
      sourceLabel: sourcePath.split(/[\\/]/).pop() ?? sourcePath,
      status: "候选",
    });
  };

  for (let index = blockStart; index < lines.length; index += 1) {
    if (/^\s*<br>\s*$/.test(lines[index] ?? "")) {
      pushBlock(blockStart, index);
      blockStart = index + 1;
    }
  }
  pushBlock(blockStart, lines.length);
  return rows;
}

export function classifyTextBlock(raw: string): TextBlockType {
  const firstLine = raw.split("\n").find((line) => line.trim())?.trim() ?? "";
  if (/^#{1,6}(?:\s+|$)/.test(firstLine)) return "标题";
  if (/^\[\^[^\]]+\]:/.test(firstLine)) return "注释正文";
  if (/^>/.test(firstLine) || /<embed\s+id\s*=/.test(raw)) return "内嵌";
  return "文本";
}

function leadingFrontmatterEnd(lines: string[]): number {
  if (lines[0]?.replace(/^\uFEFF/, "").trim() !== "---") return 0;
  for (let index = 1; index < lines.length; index += 1) {
    if (/^---[ \t]*$/.test(lines[index] ?? "")) return index + 1;
  }
  return 0;
}
