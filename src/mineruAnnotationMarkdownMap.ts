import * as fs from "fs";
import * as path from "path";
import {
  FILE_END_ANCHOR,
  FILE_START_ANCHOR,
  hashText,
  splitDocumentLines,
} from "./rowIdentity";
import {
  chapterDisplayName,
  isCanonicalChapterOriginal,
} from "./workspaceFiles";
import type {
  MineruAnnotationMatchStatus,
  MineruAnnotationReference,
  MineruJsonAnnotationGroup,
  MineruJsonFootnoteFacts,
  MineruMarkdownLocator,
  MineruPageAnnotation,
} from "./mineruAnnotationContract";

export type MineruReferenceMarkdownStatus = "matched" | "missing" | "ambiguous";

export interface MineruReferenceMarkdownCandidate {
  chapterId: string;
  chapterPath: string;
  lineIndex: number;
  start: number;
  end: number;
  anchorText: string;
}

export interface MineruReferenceMarkdownMatch {
  annotationKey: string;
  pageIndex: number;
  annotationNumber: number;
  occurrence: number;
  status: MineruReferenceMarkdownStatus;
  locator?: MineruMarkdownLocator;
  candidates: MineruReferenceMarkdownCandidate[];
}

export interface MineruAnnotationMarkdownMapResult {
  annotations: MineruPageAnnotation[];
  references: MineruReferenceMarkdownMatch[];
  summary: {
    total: number;
    matched: number;
    missing: number;
    ambiguous: number;
  };
}

export interface MineruJsonFootnoteMarkdownMapResult
  extends MineruAnnotationMarkdownMapResult {
  /** Original WP2 facts are retained so duplicate/unidentified evidence is never lost. */
  facts: MineruJsonFootnoteFacts;
}

interface ChapterDocument {
  chapterId: string;
  relativePath: string;
  text: string;
  lines: string[];
  lineStarts: number[];
  normalized: string;
  sourceOffsets: number[];
}

interface ReferencePattern {
  normalized: string;
  normalizedMarkerOffset: number;
}

const SEARCH_RADII = [96, 64, 40, 24] as const;
const MIN_PATTERN_LENGTH = 8;

export function discoverCanonicalChapterMarkdown(projectRoot: string): string[] {
  const resolvedRoot = path.resolve(projectRoot);
  const chaptersRoot = path.join(resolvedRoot, "chapters");
  const files: string[] = [];
  walk(chaptersRoot, files);
  return files
    .filter((filePath) => isCanonicalChapterOriginal(resolvedRoot, filePath))
    .sort((left, right) => left.localeCompare(right, "zh-CN", { numeric: true }));
}

export function mapMineruJsonFootnoteFactsToChapters(
  projectRoot: string,
  facts: MineruJsonFootnoteFacts,
): MineruJsonFootnoteMarkdownMapResult {
  const annotations = facts.annotations.map((group) =>
    pageAnnotationFromJsonGroup(facts, group));
  return {
    ...mapMineruAnnotationsToChapters(projectRoot, annotations),
    facts,
  };
}

export function mapMineruAnnotationsToChapters(
  projectRoot: string,
  annotations: readonly MineruPageAnnotation[],
): MineruAnnotationMarkdownMapResult {
  const resolvedRoot = path.resolve(projectRoot);
  const chapterPaths = discoverCanonicalChapterMarkdown(resolvedRoot);
  const chapters = chapterPaths.map((chapterPath) => loadChapter(resolvedRoot, chapterPath));

  const referenceMatches: MineruReferenceMarkdownMatch[] = [];
  const mappedAnnotations = annotations.map((annotation) => {
    const statuses: MineruReferenceMarkdownStatus[] = [];
    const mappedReferences = annotation.references.map((reference) => {
      const match = matchReference(chapters, annotation, reference);
      referenceMatches.push(match);
      statuses.push(match.status);
      return match.locator
        ? { ...reference, markdown: match.locator }
        : { ...reference, markdown: undefined };
    });

    return {
      ...annotation,
      references: mappedReferences,
      status: mappedAnnotationStatus(annotation, statuses),
    };
  });

  return {
    annotations: mappedAnnotations,
    references: referenceMatches,
    summary: {
      total: referenceMatches.length,
      matched: referenceMatches.filter((item) => item.status === "matched").length,
      missing: referenceMatches.filter((item) => item.status === "missing").length,
      ambiguous: referenceMatches.filter((item) => item.status === "ambiguous").length,
    },
  };
}

function matchReference(
  chapters: readonly ChapterDocument[],
  annotation: MineruPageAnnotation,
  reference: MineruAnnotationReference,
): MineruReferenceMarkdownMatch {
  const annotationKey = pageAnnotationKey(
    annotation.documentKey,
    annotation.pageIndex,
    annotation.annotationNumber,
  );

  for (const radius of SEARCH_RADII) {
    const pattern = buildReferencePattern(reference, radius);
    if (!pattern || pattern.normalized.length < MIN_PATTERN_LENGTH) continue;

    const hits = chapters.flatMap((chapter) =>
      findPatternHits(chapter, pattern).map((locator) => ({ locator })));

    if (hits.length === 1) {
      return {
        annotationKey,
        pageIndex: annotation.pageIndex,
        annotationNumber: annotation.annotationNumber,
        occurrence: reference.occurrence,
        status: "matched",
        locator: hits[0].locator,
        candidates: [candidateFromLocator(hits[0].locator)],
      };
    }

    if (hits.length > 1) {
      return {
        annotationKey,
        pageIndex: annotation.pageIndex,
        annotationNumber: annotation.annotationNumber,
        occurrence: reference.occurrence,
        status: "ambiguous",
        candidates: hits.map((hit) => candidateFromLocator(hit.locator)),
      };
    }
  }

  return {
    annotationKey,
    pageIndex: annotation.pageIndex,
    annotationNumber: annotation.annotationNumber,
    occurrence: reference.occurrence,
    status: "missing",
    candidates: [],
  };
}

function buildReferencePattern(
  reference: MineruAnnotationReference,
  radius: number,
): ReferencePattern | undefined {
  const markerIndex = referenceMarkerIndex(reference);
  if (markerIndex < 0) return undefined;

  const start = Math.max(0, markerIndex - radius);
  const end = Math.min(
    reference.context.length,
    markerIndex + reference.marker.length + radius,
  );
  const prefix = reference.context.slice(start, markerIndex);
  const marker = reference.context.slice(
    markerIndex,
    markerIndex + reference.marker.length,
  );
  const suffix = reference.context.slice(
    markerIndex + reference.marker.length,
    end,
  );

  const normalizedPrefix = normalizeMatchText(prefix);
  const normalizedMarker = normalizeMatchText(marker);
  const normalizedSuffix = normalizeMatchText(suffix);
  if (!normalizedMarker) return undefined;

  return {
    normalized: normalizedPrefix + normalizedMarker + normalizedSuffix,
    normalizedMarkerOffset: normalizedPrefix.length,
  };
}

function findPatternHits(
  chapter: ChapterDocument,
  pattern: ReferencePattern,
): MineruMarkdownLocator[] {
  const result: MineruMarkdownLocator[] = [];
  let from = 0;
  while (from <= chapter.normalized.length - pattern.normalized.length) {
    const found = chapter.normalized.indexOf(pattern.normalized, from);
    if (found < 0) break;
    const markerNormalizedOffset = found + pattern.normalizedMarkerOffset;
    const sourceOffset = chapter.sourceOffsets[markerNormalizedOffset];
    if (sourceOffset !== undefined) {
      result.push(locatorAtSourceOffset(chapter, sourceOffset));
    }
    from = found + Math.max(1, pattern.normalized.length);
  }
  return result;
}

function locatorAtSourceOffset(
  chapter: ChapterDocument,
  sourceOffset: number,
): MineruMarkdownLocator {
  const lineIndex = lineIndexAtOffset(chapter.lineStarts, sourceOffset);
  const lineStart = chapter.lineStarts[lineIndex] ?? 0;
  const lineText = chapter.lines[lineIndex] ?? "";
  const start = Math.max(0, sourceOffset - lineStart);
  const sourceCodePoint = chapter.text.codePointAt(sourceOffset);
  const markerLength = sourceCodePoint === undefined
    ? 1
    : String.fromCodePoint(sourceCodePoint).length;

  const previousText = neighborText(chapter.lines, lineIndex - 1, -1);
  const nextText = neighborText(chapter.lines, lineIndex + 1, 1);

  return {
    chapterId: chapter.chapterId,
    chapterPath: chapter.relativePath,
    lineIndex,
    start,
    end: start + markerLength,
    anchorText: lineText,
    anchorTextHash: hashText(lineText),
    anchorPreviousHash: hashText(previousText),
    anchorNextHash: hashText(nextText),
  };
}

function loadChapter(projectRoot: string, chapterPath: string): ChapterDocument {
  const text = fs.readFileSync(chapterPath, "utf8").replace(/\r\n?/g, "\n");
  const lines = splitDocumentLines(text);
  const normalizedDocument = normalizeWithOffsets(text);
  return {
    chapterId: chapterDisplayName(projectRoot, chapterPath),
    relativePath: path.relative(projectRoot, chapterPath),
    text,
    lines,
    lineStarts: computeLineStarts(text),
    normalized: normalizedDocument.normalized,
    sourceOffsets: normalizedDocument.sourceOffsets,
  };
}

function normalizeWithOffsets(text: string): {
  normalized: string;
  sourceOffsets: number[];
} {
  let normalized = "";
  const sourceOffsets: number[] = [];
  let sourceOffset = 0;

  for (const character of text) {
    const transformed = normalizeMatchText(character);
    for (const normalizedCharacter of transformed) {
      normalized += normalizedCharacter;
      sourceOffsets.push(sourceOffset);
    }
    sourceOffset += character.length;
  }

  return { normalized, sourceOffsets };
}

export function normalizeAnnotationMatchText(text: string): string {
  return normalizeMatchText(text);
}

function normalizeMatchText(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/<\/?sup>/g, "")
    .replace(/\s+/g, "")
    .replace(/[*_\x60$^{}#]/g, "");
}

function computeLineStarts(text: string): number[] {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\n") starts.push(index + 1);
  }
  return starts;
}

function lineIndexAtOffset(starts: readonly number[], offset: number): number {
  let low = 0;
  let high = starts.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (starts[middle] <= offset) low = middle + 1;
    else high = middle - 1;
  }
  return Math.max(0, high);
}

function neighborText(
  lines: readonly string[],
  from: number,
  direction: -1 | 1,
): string {
  for (
    let index = from;
    index >= 0 && index < lines.length;
    index += direction
  ) {
    if (lines[index].trim()) return lines[index];
  }
  return direction < 0 ? FILE_START_ANCHOR : FILE_END_ANCHOR;
}

function referenceMarkerIndex(reference: MineruAnnotationReference): number {
  const positions = allIndicesOf(reference.context, reference.marker);
  if (positions.length === 1) return positions[0];
  return positions[reference.occurrence - 1] ?? -1;
}

function allIndicesOf(text: string, needle: string): number[] {
  if (!needle) return [];
  const positions: number[] = [];
  let from = 0;
  while (from <= text.length - needle.length) {
    const found = text.indexOf(needle, from);
    if (found < 0) break;
    positions.push(found);
    from = found + needle.length;
  }
  return positions;
}

function mappedAnnotationStatus(
  annotation: MineruPageAnnotation,
  referenceStatuses: readonly MineruReferenceMarkdownStatus[],
): MineruAnnotationMatchStatus {
  if (annotation.status === "匹配歧义") return "匹配歧义";
  if (annotation.references.length === 0) return "MD引用缺失";
  if (annotation.status === "已确认"
    && referenceStatuses.every((status) => status === "matched")) {
    return "已确认";
  }
  if (referenceStatuses.some((status) => status === "ambiguous")) {
    return "匹配歧义";
  }
  if (referenceStatuses.some((status) => status === "missing")) {
    return "MD引用缺失";
  }
  if (!annotation.body) return "注释正文缺失";
  if (annotation.references.length > 1) return "共享注释";
  return "自动匹配";
}

function pageAnnotationFromJsonGroup(
  facts: MineruJsonFootnoteFacts,
  group: MineruJsonAnnotationGroup,
): MineruPageAnnotation {
  const status: MineruAnnotationMatchStatus =
    group.status === "shared" ? "共享注释"
      : group.status === "missing-body" ? "注释正文缺失"
        : group.status === "missing-reference" ? "MD引用缺失"
          : group.status === "duplicate-body" ? "匹配歧义"
            : "自动匹配";
  return {
    documentKey: facts.documentKey,
    sourceJsonPath: facts.sourceJsonPath,
    sourceMarkdownPath: facts.sourceMarkdownPath,
    pageIndex: group.pageIndex,
    annotationNumber: group.annotationNumber,
    references: group.references,
    body: group.bodies[0],
    status,
  };
}

function candidateFromLocator(
  locator: MineruMarkdownLocator,
): MineruReferenceMarkdownCandidate {
  return {
    chapterId: locator.chapterId,
    chapterPath: locator.chapterPath,
    lineIndex: locator.lineIndex,
    start: locator.start,
    end: locator.end,
    anchorText: locator.anchorText,
  };
}

function pageAnnotationKey(
  documentKey: string,
  pageIndex: number,
  annotationNumber: number,
): string {
  return "mineru-note:"
    + encodeURIComponent(documentKey)
    + ":p"
    + pageIndex
    + ":n"
    + annotationNumber;
}

function walk(directory: string, output: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(fullPath, output);
    else if (entry.isFile() && /\.md$/i.test(entry.name)) output.push(fullPath);
  }
}
