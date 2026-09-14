import { createHash } from "crypto";
import { protectMarkdownForTranslation } from "./markdownProtection";
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
const CAPTION_PREFIX = /(?:^|\s)(?:Table|Figure|Exhibit)\s+\d+(?:[A-Za-z]|\.\d+)*\.$/i;
const FOOTNOTE_REFERENCE = /\[\^[^\]\r\n]+\]/g;
const TERMINAL_BEFORE_FOOTNOTE = /([.!?。！？])([ \t]*(?:\[\^[^\]\r\n]+\])+)/g;

export function scanSentences(markdown: string, sourcePath: string): Candidate[] {
  const rows: Candidate[] = [];
  for (const [blockIndex, block] of scanTextBlocks(markdown, sourcePath).entries()) {
    if (block.lineType === "LaTeX块") continue;
    const slices = block.lineType === "标题"
      ? [{ start: 0, end: block.raw.length }]
      : block.lineType === "内嵌"
        ? embeddedTranslatableSentenceSlices(block.raw)
        : segmentTranslatableSentenceSlices(block.raw);
    slices.forEach((slice, index) => {
      const raw = block.raw.slice(slice.start, slice.end);
      if (!raw.trim()) return;
      const protectedSentence = protectMarkdownForTranslation(raw);
      if (!hasTranslatableText(protectedSentence.text)) return;
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
        translationText: protectedSentence.text,
        translationProtection: protectedSentence.replacements,
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


function embeddedTranslatableSentenceSlices(text: string): SentenceSlice[] {
  const lines = text.split("\n");
  const lineStarts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    lineStarts.push(offset);
    offset += line.length + 1;
  }

  const slices: SentenceSlice[] = [];
  let plainStartLine: number | undefined;
  let plainEndLine: number | undefined;

  const flushPlain = () => {
    if (plainStartLine === undefined || plainEndLine === undefined) return;
    const start = lineStarts[plainStartLine];
    const end = lineStarts[plainEndLine] + lines[plainEndLine].length;
    const raw = text.slice(start, end);
    for (const slice of segmentTranslatableSentenceSlices(raw)) {
      slices.push({ start: start + slice.start, end: start + slice.end });
    }
    plainStartLine = undefined;
    plainEndLine = undefined;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const quote = /^(>+[ \t]*)/.exec(line);
    const contentOffset = quote?.[0].length ?? 0;
    const content = line.slice(contentOffset);
    const trimmed = content.trim();

    if (embeddedStructuralContent(trimmed)) {
      flushPlain();
      continue;
    }

    if (/!\[\[[^\]]+\]\]|!\[[^\]]*\]\([^)]+\)/.test(content)) {
      flushPlain();
      const leading = content.length - content.trimStart().length;
      const trailing = content.trimEnd().length;
      const raw = content.slice(leading, trailing);
      if (!raw) continue;
      for (const slice of segmentTranslatableSentenceSlices(raw)) {
        slices.push({
          start: lineStarts[index] + contentOffset + leading + slice.start,
          end: lineStarts[index] + contentOffset + leading + slice.end,
        });
      }
      continue;
    }

    if (/<[^>]+>/.test(content)) {
      flushPlain();
      for (const visible of htmlVisibleTextSlices(content)) {
        const raw = content.slice(visible.start, visible.end);
        for (const slice of segmentTranslatableSentenceSlices(raw)) {
          const start = lineStarts[index] + contentOffset + visible.start + slice.start;
          const end = lineStarts[index] + contentOffset + visible.start + slice.end;
          slices.push({ start, end });
        }
      }
      continue;
    }

    if (quote) {
      flushPlain();
      const leading = content.length - content.trimStart().length;
      const trailing = content.trimEnd().length;
      const raw = content.slice(leading, trailing);
      if (!raw) continue;
      for (const slice of segmentTranslatableSentenceSlices(raw)) {
        slices.push({
          start: lineStarts[index] + contentOffset + leading + slice.start,
          end: lineStarts[index] + contentOffset + leading + slice.end,
        });
      }
      continue;
    }

    if (plainStartLine === undefined) plainStartLine = index;
    plainEndLine = index;
  }
  flushPlain();
  return slices.filter((slice) => {
    const protectedText = protectMarkdownForTranslation(text.slice(slice.start, slice.end));
    return hasTranslatableText(protectedText.text);
  });
}

function embeddedStructuralContent(trimmed: string): boolean {
  if (!trimmed || /^<br>$/i.test(trimmed)) return true;
  if (/^<embed\b[^>]*>\s*<\/embed>$/i.test(trimmed)) return true;
  if (/^\[![^\]]*\]/.test(trimmed)) return true;
  if (/^!\[\[[^\]]+\]\]$/.test(trimmed)) return true;
  if (/^!\[[^\]]*\]\([^)]+\)$/.test(trimmed)) return true;
  return false;
}

function htmlVisibleTextSlices(input: string): SentenceSlice[] {
  const result: SentenceSlice[] = [];
  const skipStack: string[] = [];
  const tagRe = /<[^>]+>/g;
  let cursor = 0;

  const appendText = (start: number, end: number) => {
    if (end <= start || skipStack.length) return;
    const value = input.slice(start, end);
    if (!/[\p{L}]/u.test(value)) return;
    let left = start;
    let right = end;
    while (left < right && /\s/.test(input[left])) left += 1;
    while (right > left && /\s/.test(input[right - 1])) right -= 1;
    if (left < right) result.push({ start: left, end: right });
  };

  for (const match of input.matchAll(tagRe)) {
    const start = match.index ?? 0;
    appendText(cursor, start);
    const tag = match[0];
    const close = /^<\s*\//.test(tag);
    const name = /^<\s*\/?\s*([a-zA-Z0-9:-]+)/.exec(tag)?.[1]?.toLowerCase();
    const skip = name === "eq" || name === "math" || name === "script" || name === "style";
    if (skip && name) {
      if (close) {
        const last = skipStack.lastIndexOf(name);
        if (last >= 0) skipStack.splice(last, 1);
      } else if (!/\/\s*>$/.test(tag)) {
        skipStack.push(name);
      }
    }
    cursor = start + tag.length;
  }
  appendText(cursor, input.length);
  return result;
}

function hasTranslatableText(value: string): boolean {
  const withoutPlaceholders = value
    .replace(/<ocr2md-protected\b[^>]*\/>/gi, " ")
    .replace(/<ocr2md-protected\b[^>]*>\s*<\/ocr2md-protected\s*>/gi, " ")
    .trim();
  return /[\p{L}\p{N}]/u.test(withoutPlaceholders);
}

export function segmentSentences(text: string): string[] {
  return segmentTranslatableSentenceSlices(text).map((slice) => text.slice(slice.start, slice.end));
}

export interface MultilineLatexRange {
  start: number;
  end: number;
}

/** Exact multi-line $$ blocks are structural content, never translation units. */
export function findMultilineLatexRanges(text: string): MultilineLatexRange[] {
  const lines = text.split("\n");
  const starts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    starts.push(offset);
    offset += line.length + 1;
  }
  const ranges: MultilineLatexRange[] = [];
  let open: number | undefined;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() !== "$$") continue;
    if (open === undefined) {
      open = index;
      continue;
    }
    const start = starts[open];
    const end = starts[index] + lines[index].length;
    ranges.push({ start, end });
    open = undefined;
  }
  return ranges;
}

export function isStandaloneMultilineLatexBlock(text: string): boolean {
  const trimmed = text.trim();
  const ranges = findMultilineLatexRanges(trimmed);
  return ranges.length === 1 && ranges[0].start === 0 && ranges[0].end === trimmed.length;
}

function segmentTranslatableSentenceSlices(text: string): SentenceSlice[] {
  const formulas = findMultilineLatexRanges(text);
  if (!formulas.length) return segmentSentenceSlices(text);
  const slices: SentenceSlice[] = [];
  let cursor = 0;
  for (const formula of formulas) {
    if (cursor < formula.start) {
      const prefix = text.slice(cursor, formula.start);
      for (const slice of segmentSentenceSlices(prefix)) {
        slices.push({ start: cursor + slice.start, end: cursor + slice.end });
      }
    }
    cursor = formula.end;
  }
  if (cursor < text.length) {
    const suffix = text.slice(cursor);
    for (const slice of segmentSentenceSlices(suffix)) {
      slices.push({ start: cursor + slice.start, end: cursor + slice.end });
    }
  }
  return slices;
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
    || NUMBERED_LIST_MARKER.test(trimmed)
    || CAPTION_PREFIX.test(trimmed);
}

function prepareSegmentationText(text: string): string {
  const original = text.replace(/\n/g, " ");
  const chars = [...original];

  // Mask punctuation inside structures that must survive sentence segmentation
  // intact. Replacement is character-for-character so source offsets remain
  // exact for editor navigation and stable sentence ids.
  const protectedPatterns = [
    /`+[^`\n]*`+/g,
    /\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|(?<!\\)\$(?!\$)(?:\\.|[^$\n])*?(?<!\\)\$/g,
    /!?\[\[[^\]\r\n]+\]\]/g,
    /!\[[^\]\r\n]*\]\([^)\r\n]+\)/g,
    /(?<!!)\[[^\]\r\n]+\]\([^)\r\n]+\)/g,
    /<[^>\r\n]+>/g,
  ];
  for (const pattern of protectedPatterns) {
    for (const match of original.matchAll(pattern)) {
      if (match.index === undefined) continue;
      maskSegmentationRange(chars, match.index, match.index + match[0].length);
    }
  }
  for (const match of original.matchAll(/\bhttps?:\/\/[^\s<>{}\[\]"']+/g)) {
    if (match.index === undefined) continue;
    let end = match.index + match[0].length;
    while (end > match.index && /[.,;:!?]/.test(original[end - 1])) end -= 1;
    maskSegmentationRange(chars, match.index, end);
  }

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

function maskSegmentationRange(chars: string[], start: number, end: number) {
  for (let index = start; index < end; index += 1) {
    if (!/\s/.test(chars[index])) chars[index] = "x";
  }
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
