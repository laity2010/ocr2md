import { createHash } from "crypto";
import { scanSentences } from "./sentences";
import { scanTextBlocks } from "./textBlocks";
import type { Candidate } from "./types";

const IMAGE_RE = /!\[[^\]]*\]\([^)]+\)|!\[\[[^\]]+\]\]/;
const EMBED_RE = /<embed\s+id\s*=/i;
const HTML_BLOCK_RE = /^>+\s*<\/?[a-zA-Z][^>]*>/;
const CALLOUT_RE = /^>+\s*\[![^\]]*\]/;

export function scanTranslationUnits(markdown: string, sourcePath: string): Candidate[] {
  const ordinary = scanSentences(markdown, sourcePath).map((sentence) => ({
    ...sentence,
    translationUnitKind: "sentence" as const,
  }));
  const composite: Candidate[] = [];
  for (const [blockIndex, block] of scanTextBlocks(markdown, sourcePath).entries()) {
    if (block.lineType !== "内嵌") continue;
    composite.push(...compositeUnits(block, blockIndex + 1));
  }
  return [...ordinary, ...composite].sort((left, right) =>
    left.range.line - right.range.line
      || left.range.start - right.range.start
      || (left.translationUnitKind === "sentence" ? -1 : 1));
}

function compositeUnits(block: Candidate, blockIndex: number): Candidate[] {
  const lines = block.raw.replace(/\r\n?/g, "\n").split("\n");
  const formulaLines = multilineFormulaLines(lines);
  const units: Candidate[] = [];
  let start: number | undefined;
  let collected: string[] = [];

  const flush = () => {
    if (start === undefined || !collected.length) {
      start = undefined;
      collected = [];
      return;
    }
    const raw = collected.join("\n");
    if (!hasTranslatableText(raw)) {
      start = undefined;
      collected = [];
      return;
    }
    const unitIndex = units.length + 1;
    const hash = createHash("sha256")
      .update(`${block.id}\0composite\0${unitIndex}\0${raw}`)
      .digest("hex")
      .slice(0, 16);
    const absoluteStart = block.range.line + start;
    const absoluteEnd = absoluteStart + collected.length - 1;
    const id = `composite-${block.id}-${unitIndex}-${hash}`;
    units.push({
      id,
      rowId: id,
      kind: "regex",
      label: normalizePreview(raw),
      raw,
      preview: normalizePreview(raw),
      range: {
        line: absoluteStart,
        start: 0,
        endLine: absoluteEnd === absoluteStart ? undefined : absoluteEnd,
        end: collected[collected.length - 1].length,
      },
      typeLabel: "翻译",
      lineType: "合成块",
      parentBlockId: block.id,
      parentBlockIndex: blockIndex,
      sentenceIndex: unitIndex,
      translationUnitKind: "composite",
      sourcePath: block.sourcePath,
      sourceLabel: block.sourceLabel,
      status: "候选",
    });
    start = undefined;
    collected = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (formulaLines.has(index) || isCompositeStructuralLine(line)) {
      flush();
      continue;
    }
    if (start === undefined) start = index;
    collected.push(line);
  }
  flush();
  return units;
}

function isCompositeStructuralLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed === ">" || /^\s*<br>\s*$/i.test(trimmed)) return true;
  if (IMAGE_RE.test(line)) return true;
  if (EMBED_RE.test(line)) return true;
  if (CALLOUT_RE.test(trimmed)) return true;
  if (HTML_BLOCK_RE.test(trimmed)) return true;
  if (/^>+/.test(trimmed)) return true;
  return false;
}

function hasTranslatableText(raw: string): boolean {
  const text = raw
    .replace(/<[^>]+>/g, "")
    .replace(/!?\[\[[^\]]+\]\]/g, "")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .trim();
  return /[\p{L}\p{N}]/u.test(text);
}

function multilineFormulaLines(lines: readonly string[]): Set<number> {
  const protectedLines = new Set<number>();
  let open: number | undefined;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() !== "$$") continue;
    if (open === undefined) {
      open = index;
      continue;
    }
    for (let line = open; line <= index; line += 1) protectedLines.add(line);
    open = undefined;
  }
  return protectedLines;
}

function normalizePreview(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
