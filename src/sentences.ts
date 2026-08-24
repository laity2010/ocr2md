import { createHash } from "crypto";
import { scanTextBlocks } from "./textBlocks";
import type { Candidate, SourceRange } from "./types";

interface SentenceSlice {
  start: number;
  end: number;
}

interface IntlSentencePart {
  segment: string;
  index: number;
}

type IntlSegmenterCtor = new (
  locales?: string | string[],
  options?: { granularity: "sentence" },
) => { segment(input: string): Iterable<IntlSentencePart> };

const NON_TERMINAL_ABBREVIATION = /(?:^|[\s([{"'])(?:Mr|Mrs|Ms|Dr|Prof|Fig|Figs|Eq|Eqs)\.$/i;
const NAME_INITIAL = /(?:^|\s)[A-Z]\.$/;
const NUMBERED_LIST_MARKER = /^\d+\.$/;
const FOOTNOTE_REFERENCE = /\[\^[^\]\r\n]+\]/g;
const TERMINAL_BEFORE_FOOTNOTE = /([.!?。！？])([ \t]*(?:\[\^[^\]\r\n]+\])+)/g;

export function scanSentences(markdown: string, sourcePath: string): Candidate[] {
  const rows: Candidate[] = [];
  for (const [blockIndex, block] of scanTextBlocks(markdown, sourcePath).entries()) {
    if (block.lineType === "内嵌") continue;
    const slices = block.lineType === "标题"
      ? [{ start: 0, end: block.raw.length }]
      : segmentSentenceSlices(block.raw);
    slices.forEach((slice, index) => {
      const raw = block.raw.slice(slice.start, slice.end);
      if (!raw.trim()) return;
      const hash = createHash("sha256")
        .update(`${block.id}\0${index + 1}\0${raw}`)
        .digest("hex")
        .slice(0, 16);
      const id = `sentence-${block.id}-${index + 1}-${hash}`;
      rows.push({
        id,
        rowId: id,
        kind: "regex",
        label: normalizePreview(raw),
        raw,
        preview: normalizePreview(raw),
        range: blockSliceRange(block, slice.start, slice.end),
        typeLabel: "分句",
        lineType: block.lineType,
        parentBlockId: block.id,
        parentBlockIndex: blockIndex + 1,
        sentenceIndex: index + 1,
        sourcePath,
        sourceLabel: block.sourceLabel,
        status: "候选",
      });
    });
  }
  return rows;
}

export function segmentSentences(text: string): string[] {
  return segmentSentenceSlices(text).map((slice) => text.slice(slice.start, slice.end));
}

function segmentSentenceSlices(text: string): SentenceSlice[] {
  const provisional = intlSentenceSlices(text);
  const merged: SentenceSlice[] = [];
  for (const current of provisional) {
    const trimmed = trimSlice(text, current);
    if (!trimmed) continue;
    const previous = merged[merged.length - 1];
    if (previous && shouldMergeWithNext(text.slice(previous.start, previous.end))) {
      previous.end = trimmed.end;
    } else {
      merged.push({ ...trimmed });
    }
  }
  return merged;
}

function intlSentenceSlices(text: string): SentenceSlice[] {
  // OCR paragraphs often wrap a grammatical sentence across physical Markdown lines.
  // Replacing newlines with one space preserves every offset while preventing the
  // segmenter from treating layout line breaks as sentence boundaries.
  const segmentationText = prepareSegmentationText(text);
  const Segmenter = (Intl as unknown as { Segmenter?: IntlSegmenterCtor }).Segmenter;
  if (Segmenter) {
    const segmenter = new Segmenter("en", { granularity: "sentence" });
    return [...segmenter.segment(segmentationText)].map((part) => ({
      start: part.index,
      end: part.index + part.segment.length,
    }));
  }
  return fallbackSentenceSlices(segmentationText);
}

function fallbackSentenceSlices(text: string): SentenceSlice[] {
  const slices: SentenceSlice[] = [];
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (!/[.!?。！？]/.test(text[index])) continue;
    const next = text[index + 1];
    if (next !== undefined && !/\s/.test(next)) continue;
    slices.push({ start, end: index + 1 });
    start = index + 1;
  }
  if (start < text.length) slices.push({ start, end: text.length });
  return slices;
}

function trimSlice(text: string, slice: SentenceSlice): SentenceSlice | undefined {
  let start = slice.start;
  let end = slice.end;
  while (start < end && /\s/.test(text[start])) start += 1;
  while (end > start && /\s/.test(text[end - 1])) end -= 1;
  return start < end ? { start, end } : undefined;
}

function shouldMergeWithNext(previous: string): boolean {
  const trimmed = previous.trimEnd();
  return NON_TERMINAL_ABBREVIATION.test(trimmed)
    || NAME_INITIAL.test(trimmed)
    || NUMBERED_LIST_MARKER.test(trimmed);
}

function prepareSegmentationText(text: string): string {
  const original = text.replace(/\n/g, " ");
  const chars = [...original];

  for (const match of original.matchAll(FOOTNOTE_REFERENCE)) {
    const start = match.index;
    if (start === undefined) continue;
    const end = start + match[0].length;
    for (let index = start; index < end; index += 1) chars[index] = "x";
  }

  for (const match of original.matchAll(TERMINAL_BEFORE_FOOTNOTE)) {
    const start = match.index;
    if (start === undefined) continue;
    const terminal = match[1];
    chars[start] = "x";
    chars[start + match[0].length - 1] = terminal;
  }

  return chars.join("");
}

function blockSliceRange(block: Candidate, startOffset: number, endOffset: number): SourceRange {
  const start = relativeOffsetPosition(block.raw, startOffset);
  const end = relativeOffsetPosition(block.raw, endOffset);
  return {
    line: block.range.line + start.line,
    start: start.character,
    endLine: end.line === start.line ? undefined : block.range.line + end.line,
    end: end.character,
  };
}

function relativeOffsetPosition(text: string, offset: number): { line: number; character: number } {
  const bounded = Math.max(0, Math.min(offset, text.length));
  let line = 0;
  let lineStart = 0;
  for (let index = 0; index < bounded; index += 1) {
    if (text[index] === "\n") {
      line += 1;
      lineStart = index + 1;
    }
  }
  return { line, character: bounded - lineStart };
}

function normalizePreview(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
