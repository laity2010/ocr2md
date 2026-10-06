import * as fs from "fs";
import * as path from "path";
import type {
  MineruAnnotationBody,
  MineruAnnotationReference,
  MineruBBox,
  MineruJsonAnnotationGroup,
  MineruJsonFootnoteFacts,
  MineruJsonLocator,
  MineruUnidentifiedFootnote,
  MineruUnverifiedReferenceGroup,
} from "./mineruAnnotationContract";

/**
 * MinerU does not provide a citation-to-footnote edge. Extract its physical
 * page facts without guessing any Markdown position or source-document page
 * offset. The page_idx is local to this JSON/PDF, not the exported chapter.
 */
const CIRCLED = /[\u2460-\u2473\u3251-\u325f\u32b1-\u32bf]/u;
const MARKER_TOKEN = "(?:<sup>\\s*\\d+\\s*</sup>|\\[\\^\\d+\\]|[①-⑳㉑-㉟㊱-㊿]|[⁰¹²³⁴⁵⁶⁷⁸⁹]+)";
const REFERENCE_RE = new RegExp(MARKER_TOKEN, "gu");
const FOOTNOTE_PREFIX_RE = new RegExp("^\\s*(" + MARKER_TOKEN + ")\\s*", "u");
const NUMERIC_FOOTNOTE_PREFIX_RE = /^\s*(\d{1,3})[.．、)]\s*/u;

const SUPERSCRIPT_DIGITS: Record<string, string> = {
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
  "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
};

interface MineruBlock {
  type?: unknown;
  index?: unknown;
  bbox?: unknown;
  lines?: unknown;
}

interface FootnoteBodyCandidate {
  marker: string;
  annotationNumber: number;
  body: MineruAnnotationBody;
}

export interface MineruPageFootnoteInput {
  documentKey: string;
  sourceJsonPath: string;
  sourceMarkdownPath: string;
}

/** Return positive integral note numbers; never use raw ① as an identity. */
export function normalizeMineruAnnotationNumber(marker: string): number | undefined {
  const trimmed = marker.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.length === 1 && CIRCLED.test(trimmed)) {
    const cp = trimmed.codePointAt(0)!;
    if (cp >= 0x2460 && cp <= 0x2473) return cp - 0x2460 + 1;
    if (cp >= 0x3251 && cp <= 0x325f) return cp - 0x3251 + 21;
    if (cp >= 0x32b1 && cp <= 0x32bf) return cp - 0x32b1 + 36;
  }

  const html = /^<sup>\s*(\d+)\s*<\/sup>$/iu.exec(trimmed);
  const markdown = /^\[\^(\d+)\]$/u.exec(trimmed);
  const numeric = /^(?:\()?(\d+)(?:[.．、)])?$/u.exec(trimmed);
  const digitText = html?.[1] ?? markdown?.[1] ?? numeric?.[1]
    ?? (Array.from(trimmed).every((ch) => ch in SUPERSCRIPT_DIGITS)
      ? Array.from(trimmed).map((ch) => SUPERSCRIPT_DIGITS[ch]).join("")
      : undefined);
  if (!digitText) return undefined;
  const number = Number(digitText);
  return Number.isSafeInteger(number) && number > 0 ? number : undefined;
}

export function parseMineruPageFootnotes(
  inputJson: unknown,
  input: MineruPageFootnoteInput,
): MineruJsonFootnoteFacts {
  if (!input.documentKey.trim() || !input.sourceJsonPath.trim()
    || !input.sourceMarkdownPath.trim()) {
    throw new Error("MinerU 页注释解析需要明确 documentKey、JSON 和 Markdown 来源。");
  }
  if (!isRecord(inputJson) || !Array.isArray(inputJson.pdf_info)) {
    throw new Error("MinerU JSON 缺少 pdf_info[]。");
  }
  const pages = inputJson.pdf_info as unknown[];
  const annotations: MineruJsonAnnotationGroup[] = [];
  const unidentifiedFootnotes: MineruUnidentifiedFootnote[] = [];
  const unverifiedReferences: MineruUnverifiedReferenceGroup[] = [];

  pages.forEach((pageValue, arrayIndex) => {
    if (!isRecord(pageValue)
      || !Number.isSafeInteger(pageValue.page_idx)
      || pageValue.page_idx !== arrayIndex
      || !Array.isArray(pageValue.preproc_blocks)
      || !Array.isArray(pageValue.discarded_blocks)) {
      throw new Error("无效 MinerU PDF 页面结构或 page_idx 非连续：" + arrayIndex);
    }
    const pageIndex = arrayIndex;
    const refs = extractPageReferences(pageValue.preproc_blocks, pageIndex);
    const bodies = new Map<number, MineruAnnotationBody[]>();

    for (const [blockPosition, rawBlock] of pageValue.discarded_blocks.entries()) {
      if (!isRecord(rawBlock) || rawBlock.type !== "page_footnote") continue;
      const block = rawBlock as MineruBlock;
      const raw = blockText(block).trim();
      const json = blockLocator(block, "discarded_blocks", pageIndex, blockPosition);
      const parsed = parseFootnoteBody(raw, json, refs);
      if ("reason" in parsed) {
        unidentifiedFootnotes.push({ pageIndex, raw, reason: parsed.reason, json });
        continue;
      }
      const collection = bodies.get(parsed.annotationNumber) ?? [];
      collection.push(parsed.body);
      bodies.set(parsed.annotationNumber, collection);
    }

    const allNumbers = new Set([...refs.keys(), ...bodies.keys()]);
    // Without a confirmed note body on a page, standalone circles may be
    // catalog metadata/CIP rather than citations; keep separately for audit.
    if (bodies.size === 0) {
      for (const [annotationNumber, references] of refs) {
        unverifiedReferences.push({ pageIndex, annotationNumber, references });
      }
      return;
    }

    for (const annotationNumber of [...allNumbers].sort((a, b) => a - b)) {
      const references = refs.get(annotationNumber) ?? [];
      const foundBodies = bodies.get(annotationNumber) ?? [];
      const status: MineruJsonAnnotationGroup["status"] =
        foundBodies.length > 1 ? "duplicate-body"
          : foundBodies.length === 0 ? "missing-body"
            : references.length === 0 ? "missing-reference"
              : references.length > 1 ? "shared" : "matched";
      annotations.push({
        documentKey: input.documentKey,
        pageIndex,
        annotationNumber,
        references,
        bodies: foundBodies,
        status,
      });
    }
  });

  return {
    documentKey: input.documentKey,
    sourceJsonPath: input.sourceJsonPath,
    sourceMarkdownPath: input.sourceMarkdownPath,
    pageCount: pages.length,
    annotations,
    unidentifiedFootnotes,
    unverifiedReferences,
  };
}

export function loadMineruPageFootnotes(
  input: MineruPageFootnoteInput,
): MineruJsonFootnoteFacts {
  const jsonPath = path.resolve(input.sourceJsonPath);
  const data: unknown = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  return parseMineruPageFootnotes(data, { ...input, sourceJsonPath: jsonPath });
}

function extractPageReferences(
  blocks: unknown[],
  pageIndex: number,
): Map<number, MineruAnnotationReference[]> {
  const groups = new Map<number, MineruAnnotationReference[]>();
  for (const [blockPosition, rawBlock] of blocks.entries()) {
    if (!isRecord(rawBlock) || !Array.isArray(rawBlock.lines)) continue;
    const block = rawBlock as MineruBlock;
    for (const [lineIndex, rawLine] of rawBlock.lines.entries()) {
      if (!isRecord(rawLine) || !Array.isArray(rawLine.spans)) continue;
      for (const [spanIndex, rawSpan] of rawLine.spans.entries()) {
        // MinerU often encodes a superscript citation as inline_equation:
        // { type: "inline_equation", content: "^{①}" }.
        if (!isRecord(rawSpan)
          || (rawSpan.type !== "text" && rawSpan.type !== "inline_equation")
          || typeof rawSpan.content !== "string") continue;
        const text = rawSpan.content as string;
        for (const match of text.matchAll(REFERENCE_RE)) {
          const number = normalizeMineruAnnotationNumber(match[0]);
          if (number === undefined) continue;
          const current = groups.get(number) ?? [];
          const spanStart = match.index;
          const spanEnd = spanStart + match[0].length;
          current.push({
            occurrence: current.length + 1,
            marker: match[0],
            spanStart,
            spanEnd,
            context: text.slice(Math.max(0, spanStart - 50), Math.min(text.length, spanEnd + 50)),
            json: {
              ...blockLocator(block, "preproc_blocks", pageIndex, blockPosition),
              bbox: validBBox(rawSpan.bbox) ?? validBBox(rawLine.bbox)
                ?? requiredBBox(rawBlock.bbox, pageIndex, blockPosition),
              lineIndex,
              spanIndex,
            },
          });
          groups.set(number, current);
        }
      }
    }
  }
  return groups;
}

function parseFootnoteBody(
  raw: string,
  json: MineruJsonLocator & { collection: "discarded_blocks" },
  refs: Map<number, MineruAnnotationReference[]>,
): FootnoteBodyCandidate | { reason: MineruUnidentifiedFootnote["reason"] } {
  const explicit = FOOTNOTE_PREFIX_RE.exec(raw);
  let marker = explicit?.[1];
  let remainder = explicit ? raw.slice(explicit[0].length).trim() : "";
  if (!marker) {
    // An ordinary "1. 2017年..." often comes from OCR pollution. Permit
    // weak ASCII numbering only with an actual reference on this page.
    const weak = NUMERIC_FOOTNOTE_PREFIX_RE.exec(raw);
    if (!weak) return { reason: "unrecognized-marker" };
    const number = normalizeMineruAnnotationNumber(weak[1]);
    const hasNumericReference = number !== undefined && (refs.get(number) ?? [])
      .some((ref) => !CIRCLED.test(ref.marker));
    if (!number || !hasNumericReference) {
      return { reason: "unsupported-numeric-marker" };
    }
    marker = weak[0].trim();
    remainder = raw.slice(weak[0].length).trim();
  }

  const annotationNumber = normalizeMineruAnnotationNumber(marker);
  if (annotationNumber === undefined) return { reason: "unrecognized-marker" };
  if (!remainder) return { reason: "empty-body" };
  return {
    marker,
    annotationNumber,
    body: {
      marker,
      content: remainder,
      raw,
      blockType: "page_footnote",
      json,
    },
  };
}

function blockText(block: MineruBlock): string {
  if (!Array.isArray(block.lines)) return "";
  return block.lines
    .filter(isRecord)
    .map((line) => Array.isArray(line.spans)
      ? line.spans.filter(isRecord)
        .map((span) => (span.type === "text" || span.type === "inline_equation")
          && typeof span.content === "string" ? span.content : "")
        .join("")
      : "")
    .join("\n");
}

function blockLocator<T extends MineruJsonLocator["collection"]>(
  block: MineruBlock,
  collection: T,
  pageIndex: number,
  blockPosition: number,
): MineruJsonLocator & { collection: T } {
  if (!Number.isSafeInteger(block.index)) {
    throw new Error("MinerU block.index 无效：page=" + pageIndex
      + " collection=" + collection + " position=" + blockPosition);
  }
  return {
    pageIndex,
    collection,
    blockIndex: block.index as number,
    bbox: requiredBBox(block.bbox, pageIndex, blockPosition),
  };
}

function validBBox(value: unknown): MineruBBox | undefined {
  return Array.isArray(value) && value.length === 4
    && value.every((item) => typeof item === "number" && Number.isFinite(item))
    ? [value[0], value[1], value[2], value[3]]
    : undefined;
}

function requiredBBox(value: unknown, pageIndex: number, blockPosition: number): MineruBBox {
  const bbox = validBBox(value);
  if (!bbox) {
    throw new Error("MinerU block.bbox 无效：page=" + pageIndex
      + " position=" + blockPosition);
  }
  return bbox;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
