/** WP1 · Lossless, read-only MinerU source element extraction.
 * This module never reads or writes workspace files. Caller supplies exact JSON bytes.
 * Mapping to Markdown, page overlays, and sidecars are later work packages.
 */
import { createHash } from "crypto";

export type MineruElementCollection = "para_blocks" | "discarded_blocks";
export type MineruBBox = readonly [number, number, number, number];
export type MineruPageSize = readonly [number, number];

export interface MineruRawBlock {
  readonly type: string;
  readonly bbox: number[];
  readonly index?: number;
  readonly lines?: readonly MineruRawLine[];
  readonly blocks?: readonly MineruRawBlock[];
  readonly [key: string]: unknown;
}
export interface MineruRawLine {
  readonly bbox?: number[];
  readonly spans?: readonly MineruRawSpan[];
  readonly [key: string]: unknown;
}
export interface MineruRawSpan {
  readonly type: string;
  readonly bbox?: number[];
  readonly content?: string;
  readonly html?: string;
  readonly image_path?: string;
  readonly [key: string]: unknown;
}
export interface MineruElementSegment {
  readonly type: string;
  readonly jsonPointer: string;
  readonly bbox?: MineruBBox;
  readonly content?: string;
  readonly html?: string;
  readonly imagePath?: string;
}
export interface MineruSourceElement {
  /** Stable only while the original JSON's byte hash is unchanged. */
  readonly id: string;
  readonly sourceSha256: string;
  readonly collection: MineruElementCollection;
  readonly collectionPosition: number;
  readonly jsonPointer: string;
  /** MinerU zero-based page number. */
  readonly pageIndex: number;
  /** PDF.js one-based page number; not a printed footer number. */
  readonly pdfPageNumber: number;
  readonly pageSize: MineruPageSize;
  readonly bbox: MineruBBox;
  /** Raw visual-page proportions; NOT PDF user-space coordinates. */
  readonly normalizedBBox: MineruBBox;
  readonly type: string;
  /** MinerU's own index is not unique and is never used as identity. */
  readonly mineruIndex?: number;
  readonly segments: readonly MineruElementSegment[];
  readonly normalizedContentSha256: string;
  /** Entire original block, including nested captions, spans, table HTML, images and formulas. */
  readonly rawBlock: MineruRawBlock;
}
export interface MineruElementIndex {
  readonly schemaVersion: 1;
  readonly sourceSha256: string;
  readonly backend?: string;
  readonly mineruVersion?: string;
  readonly pageCount: number;
  readonly bodyElements: readonly MineruSourceElement[];
  /** Preserved for audit, never assumed to be part of Markdown. */
  readonly discardedElements: readonly MineruSourceElement[];
}
export class MineruElementExtractionError extends Error {
  constructor(readonly jsonPointer: string, detail: string) {
    super(`MinerU JSON ${jsonPointer}: ${detail}`);
    this.name = "MineruElementExtractionError";
  }
}

function fail(pointer: string, detail: string): never {
  throw new MineruElementExtractionError(pointer, detail);
}
function object(value: unknown, pointer: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(pointer, "expected object");
  }
  return value as Record<string, unknown>;
}
function array(value: unknown, pointer: string): unknown[] {
  if (!Array.isArray(value)) fail(pointer, "expected array");
  return value as unknown[];
}
function positiveSize(value: unknown, pointer: string): MineruPageSize {
  const values = array(value, pointer);
  if (values.length !== 2 || !values.every(x => typeof x === "number" && Number.isFinite(x) && x > 0)) {
    fail(pointer, "page_size must have two finite positive numbers");
  }
  return [values[0] as number, values[1] as number];
}
function rect(value: unknown, size: MineruPageSize, pointer: string): MineruBBox {
  const b = array(value, pointer);
  if (b.length !== 4 || !b.every(x => typeof x === "number" && Number.isFinite(x))) {
    fail(pointer, "bbox must have four finite numbers");
  }
  const [x0, y0, x1, y1] = b as number[];
  if (!(0 <= x0 && x0 <= x1 && x1 <= size[0] &&
        0 <= y0 && y0 <= y1 && y1 <= size[1])) {
    fail(pointer, `bbox ${JSON.stringify(b)} outside visual page ${size.join("x")}`);
  }
  return [x0, y0, x1, y1];
}
function hash(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}
function normalizedText(value: string): string {
  return value.normalize("NFC").replace(/\s+/gu, " ").trim();
}

/** Walk both nested blocks and lines; keeping the raw block means this is lossless. */
function extractSegments(raw: Record<string, unknown>, pointer: string, size: MineruPageSize):
  MineruElementSegment[] {
  const collected: MineruElementSegment[] = [];
  const visit = (item: Record<string, unknown>, at: string): void => {
    const kind = item.type;
    if (kind !== undefined && typeof kind !== "string") fail(`${at}/type`, "expected string");
    const segment: {
      type: string; jsonPointer: string; bbox?: MineruBBox;
      content?: string; html?: string; imagePath?: string;
    } = { type: typeof kind === "string" ? kind : "unknown", jsonPointer: at };
    if (item.bbox !== undefined) segment.bbox = rect(item.bbox, size, `${at}/bbox`);
    for (const [rawKey, destKey] of [
      ["content", "content"], ["html", "html"], ["image_path", "imagePath"],
    ] as const) {
      const data = item[rawKey];
      if (data !== undefined) {
        if (typeof data !== "string") fail(`${at}/${rawKey}`, "expected string");
        segment[destKey] = data;
      }
    }
    if (segment.content !== undefined || segment.html !== undefined || segment.imagePath !== undefined) {
      collected.push(segment);
    }
    for (const branch of ["blocks", "lines", "spans"] as const) {
      if (item[branch] === undefined) continue;
      const nested = array(item[branch], `${at}/${branch}`);
      nested.forEach((part, i) => visit(object(part, `${at}/${branch}/${i}`),
        `${at}/${branch}/${i}`));
    }
  };
  visit(raw, pointer);
  return collected;
}
function makeElement(raw: unknown, sourceSha256: string, pageIndex: number,
  pageSize: MineruPageSize, collection: MineruElementCollection, position: number):
  MineruSourceElement {
  const jsonPointer = `/pdf_info/${pageIndex}/${collection}/${position}`;
  const block = object(raw, jsonPointer);
  if (typeof block.type !== "string" || !block.type) fail(`${jsonPointer}/type`, "expected non-empty type");
  const bbox = rect(block.bbox, pageSize, `${jsonPointer}/bbox`);
  if (block.index !== undefined && !Number.isSafeInteger(block.index)) {
    fail(`${jsonPointer}/index`, "expected integer");
  }
  const segments = extractSegments(block, jsonPointer, pageSize);
  const fingerprintData = [block.type, ...segments.map(s =>
    [s.type, normalizedText(s.content ?? ""), normalizedText(s.html ?? ""), s.imagePath ?? ""].join("\u0000"),
  )].join("\u0001");
  return {
    id: `mineru:${sourceSha256}:p${pageIndex}:${collection}:${position}`,
    sourceSha256, collection, collectionPosition: position, jsonPointer, pageIndex,
    pdfPageNumber: pageIndex + 1, pageSize, bbox,
    normalizedBBox: [bbox[0] / pageSize[0], bbox[1] / pageSize[1],
      bbox[2] / pageSize[0], bbox[3] / pageSize[1]],
    type: block.type,
    mineruIndex: block.index as number | undefined,
    segments,
    normalizedContentSha256: hash(fingerprintData),
    rawBlock: block as unknown as MineruRawBlock,
  };
}
/**
 * Input must be ORIGINAL JSON bytes, not JSON.stringify(parsedData): a changed
 * whitespace/encoding is a new source revision and must never reuse existing IDs.
 */
export function extractMineruElements(source: Uint8Array): MineruElementIndex {
  if (!(source instanceof Uint8Array)) fail("/", "expected original UTF-8 JSON bytes");
  const sourceSha256 = hash(source);
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(source)); }
  catch (e) { fail("/", `invalid UTF-8 JSON (${e instanceof Error ? e.message : String(e)})`); }
  const root = object(parsed, "/");
  const pages = array(root.pdf_info, "/pdf_info");
  if (!pages.length) fail("/pdf_info", "document contains no pages");
  const bodyElements: MineruSourceElement[] = [];
  const discardedElements: MineruSourceElement[] = [];
  pages.forEach((rawPage, index) => {
    const pointer = `/pdf_info/${index}`;
    const page = object(rawPage, pointer);
    if (page.page_idx !== index) fail(`${pointer}/page_idx`, `expected continuous index ${index}`);
    const size = positiveSize(page.page_size, `${pointer}/page_size`);
    for (const collection of ["para_blocks", "discarded_blocks"] as const) {
      const blocks = array(page[collection], `${pointer}/${collection}`);
      const target = collection === "para_blocks" ? bodyElements : discardedElements;
      blocks.forEach((block, position) => target.push(makeElement(block, sourceSha256,
        index, size, collection, position)));
    }
    // preproc_blocks deliberately NOT imported to avoid double counting.
  });
  return {
    schemaVersion: 1, sourceSha256,
    backend: typeof root._backend === "string" ? root._backend : undefined,
    mineruVersion: typeof root._version_name === "string" ? root._version_name : undefined,
    pageCount: pages.length, bodyElements, discardedElements,
  };
}
