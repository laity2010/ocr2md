import { applyChangeState, scanChapterBoundaryLines } from "./chapterBoundary";
import { extractAnnotationNumber } from "./annotation";
import { activeCandidates } from "./candidateLifecycle";
import { splitBlankLineBlocks } from "./atoms";
import {
  applyAnnotationNumber,
  rebuildAnnotationReviewState,
  rowBelongsToScope,
} from "./chapterReviewActions";
import {
  attachLineIdentity,
  attachScanIdentities,
  hashText,
  locateCandidate,
  reconcileRows,
  relocateRows,
} from "./rowIdentity";
import {
  applyEmbedNumbers,
  detectEmbedLineType,
  excludeRowsOverlappingEmbeds,
  mergeEmbedScan,
  scanRegexMatches,
} from "./scanner";
import { chapterContentsDiffer, chapterDiffBaseline } from "./workspaceFiles";
import type { AnnotationPair, Candidate } from "./types";

export interface ChapterReviewApplicationState {
  rows: Candidate[];
  annotationPairs: AnnotationPair[];
}

export interface RefreshChapterTitleInput {
  baselineText: string;
  workingText: string;
  sourcePath: string;
  workingPath: string;
  sourceLabel: string;
  embedPatterns: readonly string[];
}

export interface RefreshChapterTitleResult extends ChapterReviewApplicationState {
  changed: boolean;
}

export interface RefreshAnnotationInput {
  baselineText?: string;
  workingText: string;
  sourcePath: string;
  workingPath: string;
  sourceLabel: string;
  patterns: readonly string[];
}

export interface RefreshEmbedInput {
  baselineText?: string;
  workingText: string;
  sourcePath: string;
  workingPath: string;
  sourceLabel: string;
  patterns: readonly string[];
}


/**
 * Platform-independent application service for the chapter review workflow.
 * It owns review state transitions; VS Code/Web hosts own file I/O and editor UX.
 */
export class ChapterReviewApplication {
  private state: ChapterReviewApplicationState;

  constructor(state: ChapterReviewApplicationState) {
    this.state = { rows: state.rows, annotationPairs: state.annotationPairs };
  }

  snapshot(): ChapterReviewApplicationState {
    return { rows: this.state.rows, annotationPairs: this.state.annotationPairs };
  }

  refreshChapterTitle(input: RefreshChapterTitleInput): RefreshChapterTitleResult {
    const result = refreshChapterTitleReviewState(this.state, input);
    this.state = { rows: result.rows, annotationPairs: result.annotationPairs };
    return result;
  }

  refreshAnnotation(input: RefreshAnnotationInput): ChapterReviewApplicationState {
    this.state = refreshAnnotationReviewState(this.state, input);
    return this.snapshot();
  }

  refreshEmbed(input: RefreshEmbedInput): ChapterReviewApplicationState {
    this.state = refreshEmbedReviewState(this.state, input);
    return this.snapshot();
  }

  matchAnnotationPairs(): ChapterReviewApplicationState {
    this.state = rebuildAnnotationReviewState(this.state.rows, this.state.annotationPairs);
    return this.snapshot();
  }

  setAnnotationNumber(id: string, value: string): ChapterReviewApplicationState {
    this.state = applyAnnotationNumber(this.state, id, value);
    return this.snapshot();
  }

  annotationWorkingText(text: string): string {
    return buildAnnotationWorkingText(text, this.state.rows);
  }
}

export function refreshChapterTitleReviewState(
  state: ChapterReviewApplicationState,
  input: RefreshChapterTitleInput,
): RefreshChapterTitleResult {
  const { baselineText, workingText, sourcePath, workingPath, sourceLabel } = input;
  const scope = { sourcePath, workingPath };
  const previousTitles = state.rows.filter((row) => row.typeLabel === "章节标题" && rowBelongsToScope(row, scope));
  const previousImages = state.rows.filter((row) => row.typeLabel === "嵌入块" && rowBelongsToScope(row, scope));
  const changes = scanChapterBoundaryLines(chapterDiffBaseline(baselineText, workingText), workingText);
  const currentChanges = changes.filter((entry) => entry.state !== "deleted");

  const blocks: Candidate[] = splitBlankLineBlocks(workingText).map((block) => {
    const endLine = block.range.endLine ?? block.range.line;
    const change = currentChanges.find((entry) => entry.line >= block.range.line && entry.line <= endLine);
    const heading = /^ {0,3}(#{1,6})(?:\s+|$)/.exec(block.raw.split("\n")[0] ?? "");
    return {
      id: `chapter-block-${hashText(`${sourcePath}\0${block.range.line}\0${block.raw}`)}`,
      kind: "regex",
      label: block.raw.split("\n")[0]?.trim() || `L${block.range.line + 1}`,
      raw: block.raw,
      preview: block.raw.slice(0, 255),
      range: block.range,
      typeLabel: "章节标题",
      lineType: heading ? `${heading[1].length} 级标题` : "非标题",
      workingCopyPath: workingPath,
      sourcePath,
      sourceLabel,
      status: "候选",
      chapterBoundaryState: change?.state ?? "heading",
      baselinePreview: change?.baselineText,
    };
  });

  const titleBlocks = attachScanIdentities(
    blocks.filter((row) => !detectEmbedLineType(row.raw)),
    workingText,
    { moduleName: "章节标题", sourcePath },
  );
  const imageBlocks = attachScanIdentities(
    mergeEmbedScan(workingText, [...input.embedPatterns]).map((row) => ({
      ...row,
      typeLabel: "嵌入块" as const,
      workingCopyPath: workingPath,
      sourcePath,
      sourceLabel,
    })),
    workingText,
    { moduleName: "嵌入块", sourcePath },
  );

  const titleRows = reconcileRows(
    previousTitles.filter((row) => row.chapterBoundaryState !== "deleted"),
    titleBlocks,
    workingText,
  );
  let imageRows = applyEmbedNumbers(
    dedupeImageRows(
      reconcileRows(
        previousImages.filter((row) => row.chapterBoundaryState !== "deleted"),
        imageBlocks,
        workingText,
      ).map((row) => applyChangeState(row, changes)),
      workingText,
    ),
    workingText,
  );

  const lines = workingText.replace(/\r\n?/g, "\n").split("\n");
  for (const entry of changes.filter((candidate) => candidate.state === "deleted")) {
    const raw = entry.baselineText ?? "";
    const imageLineType = detectEmbedLineType(raw);
    const deleted = attachLineIdentity({
      id: `chapter-deleted-${hashText(`${workingPath}\0${raw}`)}`,
      kind: "regex",
      label: raw.trim() || `L${entry.line + 1}`,
      raw,
      preview: raw,
      range: { line: Math.min(entry.line, Math.max(0, lines.length - 1)), start: 0, end: 0 },
      typeLabel: imageLineType ? "嵌入块" : "章节标题",
      lineType: imageLineType ?? "非标题",
      chapterBoundaryState: "deleted",
      baselinePreview: raw,
      workingCopyPath: workingPath,
      sourcePath,
      sourceLabel,
      status: "候选",
    }, workingText, { moduleName: imageLineType ? "嵌入块" : "章节标题", sourcePath });
    (imageLineType ? imageRows : titleRows).push(deleted);
  }

  imageRows = applyEmbedNumbers(imageRows, workingText);
  const cleanedTitleRows = excludeRowsOverlappingEmbeds(titleRows, imageRows);
  const rows = [
    ...state.rows.filter((row) => row.typeLabel !== "章节标题"
      && !(row.typeLabel === "嵌入块" && rowBelongsToScope(row, scope))),
    ...cleanedTitleRows,
    ...imageRows,
  ].sort(compareRows);

  return {
    rows,
    annotationPairs: state.annotationPairs,
    changed: chapterContentsDiffer(baselineText, workingText),
  };
}


export function refreshAnnotationReviewState(
  state: ChapterReviewApplicationState,
  input: RefreshAnnotationInput,
): ChapterReviewApplicationState {
  const { workingText, sourcePath, workingPath, sourceLabel } = input;
  const scope = { sourcePath, workingPath };
  const unique = new Map<string, Candidate>();
  for (const pattern of input.patterns) {
    for (const match of scanRegexMatches(workingText, pattern)) {
      const extractedNumber = extractAnnotationNumber(match.raw);
      const row: Candidate = {
        ...match,
        typeLabel: "注释",
        lineType: defaultAnnotationLineType(match.raw),
        regexSource: pattern,
        annotationNumber: extractedNumber,
        annotationNumberSource: extractedNumber ? "extracted" : undefined,
        sourcePath,
        sourceLabel,
        workingCopyPath: workingPath,
      };
      unique.set(candidatePositionKey(row), row);
    }
  }

  const scanned = attachScanIdentities([...unique.values()], workingText, { moduleName: "注释", sourcePath });
  const previous = state.rows.filter((row) => row.typeLabel === "注释" && rowBelongsToScope(row, scope));
  let reconciled = reconcileRows(previous, scanned, workingText);
  if (input.baselineText !== undefined) {
    const changes = scanChapterBoundaryLines(chapterDiffBaseline(input.baselineText, workingText), workingText);
    reconciled = reconciled.map((row) => applyChangeState(row, changes));
  }
  const rows = [
    ...state.rows.filter((row) => !(row.typeLabel === "注释" && rowBelongsToScope(row, scope))),
    ...reconciled,
  ].sort(compareRows);
  return rebuildAnnotationReviewState(rows, state.annotationPairs);
}


export function refreshEmbedReviewState(
  state: ChapterReviewApplicationState,
  input: RefreshEmbedInput,
): ChapterReviewApplicationState {
  const { workingText, sourcePath, workingPath, sourceLabel } = input;
  const scope = { sourcePath, workingPath };
  const scanned = attachScanIdentities(
    mergeEmbedScan(workingText, [...input.patterns]).map((row) => ({
      ...row,
      typeLabel: "嵌入块" as const,
      lineType: row.lineType ?? detectEmbedLineType(row.raw) ?? "嵌入文本",
      sourcePath,
      sourceLabel,
      workingCopyPath: workingPath,
    })),
    workingText,
    { moduleName: "嵌入块", sourcePath },
  );
  const previous = state.rows.filter((row) => row.typeLabel === "嵌入块" && rowBelongsToScope(row, scope));
  let reconciled = reconcileRows(previous, scanned, workingText);
  const present = new Set(reconciled.map((row) => row.id));
  const extras = previous.filter((row) =>
    !present.has(row.id) && (row.chapterBoundaryState === "deleted" || row.isWorkingCorrection));
  reconciled = applyEmbedNumbers(
    dedupeImageRows([...reconciled, ...relocateRows(extras, workingText)], workingText),
    workingText,
  );
  if (input.baselineText !== undefined) {
    const changes = scanChapterBoundaryLines(chapterDiffBaseline(input.baselineText, workingText), workingText);
    reconciled = applyEmbedNumbers(
      reconciled.map((row) => applyChangeState(row, changes)),
      workingText,
    );
  }
  const rows = [
    ...state.rows.filter((row) => !(row.typeLabel === "嵌入块" && rowBelongsToScope(row, scope))),
    ...reconciled,
  ].sort(compareRows);
  return { rows, annotationPairs: state.annotationPairs };
}


export function buildAnnotationWorkingText(text: string, rows: readonly Candidate[]): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  for (const row of activeCandidates([...rows]).filter((candidate) => candidate.typeLabel === "注释")) {
    const located = locateCandidate(text, row);
    const lineNumber = located?.line;
    if (lineNumber === undefined || lines[lineNumber] === undefined) continue;
    const line = lines[lineNumber];
    const number = row.annotationNumber ?? extractAnnotationNumber(row.raw);
    if (!number) continue;
    if (row.lineType === "注释引用") {
      const pattern = new RegExp(`<sup>\\s*\\(?\\s*${escapeRegex(number)}\\s*\\)?\\s*</sup>|\\[\\*${escapeRegex(number)}\\]`, "i");
      lines[lineNumber] = line.replace(pattern, `[^${number}]`);
    } else if (row.lineType === "注释正文") {
      lines[lineNumber] = line.replace(/^\s*(?:\d+\.|\*\d+|\[\^\d+\]:)\s+/, `[^${number}]: `);
    }
  }
  return lines.join("\n");
}

function defaultAnnotationLineType(raw: string): "注释正文" | "注释引用" {
  return /^\s*(?:\d+\.|\*\d+|\[\^\d+\]:)\s+/.test(raw) ? "注释正文" : "注释引用";
}

function candidatePositionKey(row: Candidate): string {
  return `${row.sourcePath}\0${row.range.line}\0${row.range.start}\0${row.raw}`;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}


function dedupeImageRows(rows: Candidate[], text?: string): Candidate[] {
  const deleted = rows.filter((row) => row.chapterBoundaryState === "deleted");
  const live = rows.filter((row) => row.chapterBoundaryState !== "deleted");
  const lines = text ? text.replace(/\r\n?/g, "\n").split("\n") : undefined;
  const score = (row: Candidate): number => {
    const lineText = lines?.[row.range.line];
    if (lineText === undefined) return 0;
    const raw = (row.raw ?? "").split("\n")[0]?.trim() ?? "";
    if (lineText === row.raw) return 5;
    if (lineText.trim() === raw) return 4;
    if (detectEmbedLineType(lineText) === row.lineType) return 3;
    if (raw && lineText.includes(raw)) return 2;
    return 0;
  };
  const byLine = new Map<number, Candidate>();
  for (const row of live) {
    const existing = byLine.get(row.range.line);
    if (!existing || score(row) > score(existing)) byLine.set(row.range.line, row);
  }
  return [...deleted, ...byLine.values()].sort(compareRows);
}

function compareRows(left: Candidate, right: Candidate): number {
  return (left.sourceLabel ?? "").localeCompare(right.sourceLabel ?? "", "zh-CN", { numeric: true })
    || left.range.line - right.range.line
    || left.range.start - right.range.start
    || left.raw.localeCompare(right.raw);
}
