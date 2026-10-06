/**
 * Stable contract for MinerU page-footnote integration.
 *
 * WP0 deliberately defines identity and hand-off data only. JSON discovery,
 * MinerU parsing, Markdown matching, source-map persistence, and UI projection
 * are implemented by later waypoints.
 */

export type MineruBBox = readonly [number, number, number, number];

export type MineruAnnotationMatchStatus =
  | "自动匹配"
  | "MD引用缺失"
  | "注释正文缺失"
  | "共享注释"
  | "匹配歧义"
  | "已确认";

export type MineruAnnotationLineType = "注释引用" | "注释正文";

export interface MineruJsonLocator {
  /** MinerU pdf_info[].page_idx; zero-based and authoritative for page identity. */
  pageIndex: number;
  /** Source block collection on that physical PDF page. */
  collection: "preproc_blocks" | "discarded_blocks";
  /** MinerU block.index on that physical page. */
  blockIndex: number;
  bbox: MineruBBox;
  lineIndex?: number;
  spanIndex?: number;
}

export interface MineruMarkdownLocator {
  /** Stable OCR2MD chapter id/name after chapter export. */
  chapterId: string;
  chapterPath: string;
  /** Zero-based Markdown line index; UI may display lineIndex + 1. */
  lineIndex: number;
  start: number;
  end: number;
  /**
   * Text anchor retained so Markdown position can be recovered after line
   * numbers drift during cleanup.
   */
  anchorText: string;
  anchorTextHash?: string;
  anchorPreviousHash?: string;
  anchorNextHash?: string;
}

export interface MineruAnnotationReference {
  /**
   * 1-based occurrence among references with the same annotation number on
   * the same physical page. Multiple occurrences may share one footnote body.
   */
  occurrence: number;
  marker: string;
  context: string;
  json: MineruJsonLocator & { collection: "preproc_blocks" };
  markdown?: MineruMarkdownLocator;
}

export interface MineruAnnotationBody {
  marker: string;
  content: string;
  raw: string;
  blockType: "page_footnote";
  json: MineruJsonLocator & { collection: "discarded_blocks" };
}

/**
 * One physical-page footnote identity.
 *
 * IMPORTANT: annotationNumber alone is never an identity because page
 * footnotes routinely restart numbering on every physical page.
 */
export interface MineruPageAnnotation {
  documentKey: string;
  sourceJsonPath: string;
  sourceMarkdownPath: string;
  pageIndex: number;
  /** Normalized numeric value: ①/¹/<sup>1</sup>/[^1] all become 1. */
  annotationNumber: number;
  references: MineruAnnotationReference[];
  body?: MineruAnnotationBody;
  status: MineruAnnotationMatchStatus;
}

export interface MineruAnnotationSourceMap {
  schemaVersion: 1;
  documentKey: string;
  sourceJsonPath: string;
  sourceMarkdownPath: string;
  annotations: MineruPageAnnotation[];
}

/**
 * Data contract consumed by the annotation table after a source map exists.
 * Missing matches remain rows instead of disappearing from review.
 */
export interface MineruAnnotationTableRow {
  annotationKey: string;
  pageIndex: number;
  /** Human display page number; normally pageIndex + 1. */
  pageNumber: number;
  annotationNumber: number;
  lineType: MineruAnnotationLineType;
  markdownLineIndex?: number;
  preview: string;
  status: MineruAnnotationMatchStatus;
  /** Both reference and body rows navigate to the matched Markdown reference. */
  navigationTarget?: MineruMarkdownLocator;
}

export function mineruPageAnnotationKey(
  documentKey: string,
  pageIndex: number,
  annotationNumber: number,
): string {
  return "mineru-note:" + encodeURIComponent(documentKey) + ":p" + pageIndex + ":n" + annotationNumber;
}

export function mineruAnnotationReferenceKey(
  documentKey: string,
  pageIndex: number,
  annotationNumber: number,
  occurrence: number,
): string {
  return mineruPageAnnotationKey(documentKey, pageIndex, annotationNumber) + ":r" + occurrence;
}
