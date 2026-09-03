import { randomUuid } from "./platformHash";
import {
  applyChangeState,
  buildChapterBoundarySegments,
  scanChapterBoundaryLines,
  type ChapterBoundarySegment,
} from "./chapterBoundary";
import { extractAnnotationNumber } from "./annotation";
import { assignChapterFiles, type ChapterAssignMode } from "./chapterFileAssign";
import { activeCandidates, findReusableManualRow, IGNORED_LINE_TYPE } from "./candidateLifecycle";
import { manualIllegalLineBreakAtLine, scanIllegalLineBreaks } from "./illegalLineBreaks";
import { splitBlankLineBlocks } from "./atoms";
import {
  applyAnnotationNumber,
  applyChapterFile,
  applyRowsLineType,
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
import { chapterContentsDiffer, chapterDiffBaseline, chapterOriginalFileName } from "./chapterReviewText";
import type { AnnotationPair, Candidate, ModuleName } from "./types";

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

export interface RefreshIllegalLineBreakInput {
  workingText: string;
  sourcePath: string;
  workingPath: string;
}

export interface MarkIllegalLineBreakInput extends RefreshIllegalLineBreakInput {
  cursorLine: number;
}

export interface MarkIllegalLineBreakResult extends ChapterReviewApplicationState {
  row: Candidate;
}


export interface AddManualReviewLineInput {
  moduleName: ModuleName;
  documentText: string;
  lineText: string;
  hintLine: number;
  sourcePath: string;
  workingPath: string;
}

export interface AddManualReviewLineResult extends ChapterReviewApplicationState {
  row: Candidate;
}

export interface ApplyWorkingCopyDiffInput {
  baselineText: string;
  currentText: string;
  sourcePath?: string;
  workingPath: string;
}

export interface SetReviewRowsLineTypeInput {
  ids: readonly string[];
  lineType: string;
  text: string;
  sourcePath?: string;
  workingPath?: string;
}

export interface RefreshChapterBoundaryInput {
  baselineText: string;
  workingText: string;
  workingPath: string;
  sourceLabel: string;
}

export type AssignChapterFilesResult =
  | (ChapterReviewApplicationState & { ok: true })
  | { ok: false; error: string };


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

  refreshIllegalLineBreak(input: RefreshIllegalLineBreakInput): ChapterReviewApplicationState {
    this.state = refreshIllegalLineBreakReviewState(this.state, input);
    return this.snapshot();
  }

  markIllegalLineBreak(input: MarkIllegalLineBreakInput): MarkIllegalLineBreakResult | undefined {
    const result = markIllegalLineBreakReviewState(this.state, input);
    if (!result) return undefined;
    this.state = { rows: result.rows, annotationPairs: result.annotationPairs };
    return result;
  }

  addManualReviewLine(input: AddManualReviewLineInput): AddManualReviewLineResult {
    const result = addManualReviewLineState(this.state, input);
    this.state = { rows: result.rows, annotationPairs: result.annotationPairs };
    return result;
  }

  applyWorkingCopyDiff(input: ApplyWorkingCopyDiffInput): ChapterReviewApplicationState {
    this.state = applyWorkingCopyDiffState(this.state, input);
    return this.snapshot();
  }

  setRowsLineType(input: SetReviewRowsLineTypeInput): ChapterReviewApplicationState {
    const rows = applyRowsLineType(
      this.state.rows,
      input.ids,
      input.lineType,
      input.text,
      { sourcePath: input.sourcePath, workingPath: input.workingPath },
    );
    this.state = rebuildAnnotationReviewState(rows, this.state.annotationPairs);
    return this.snapshot();
  }

  refreshChapterBoundary(input: RefreshChapterBoundaryInput): ChapterReviewApplicationState {
    this.state = refreshChapterBoundaryReviewState(this.state, input);
    return this.snapshot();
  }

  setChapterFile(ids: readonly string[], value: string): ChapterReviewApplicationState {
    this.state = { ...this.state, rows: applyChapterFile(this.state.rows, ids, value) };
    return this.snapshot();
  }

  assignChapterFiles(ids: readonly string[], mode: ChapterAssignMode, value: string): AssignChapterFilesResult {
    const selected = new Set(ids);
    const rows = this.state.rows.filter((row) =>
      selected.has(row.id) && row.typeLabel === "章节定界" && row.lineType === "1 级标题");
    const assigned = assignChapterFiles({
      mode,
      value,
      rows: rows.map((row) => ({ id: row.id, raw: row.raw, chapterFile: row.chapterFile })),
    });
    if (!assigned.ok) return assigned;
    this.state = {
      ...this.state,
      rows: this.state.rows.map((row) =>
        assigned.files[row.id] !== undefined ? { ...row, chapterFile: assigned.files[row.id] } : row),
    };
    return { ok: true, ...this.snapshot() };
  }

  chapterBoundarySegments(text: string): ChapterBoundarySegment[] {
    return chapterBoundarySegments(this.state.rows, text);
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


export function applyWorkingCopyDiffState(
  state: ChapterReviewApplicationState,
  input: ApplyWorkingCopyDiffInput,
): ChapterReviewApplicationState {
  const changes = scanChapterBoundaryLines(chapterDiffBaseline(input.baselineText, input.currentText), input.currentText);
  return {
    rows: state.rows.map((row) =>
      rowBelongsToScope(row, { sourcePath: input.sourcePath, workingPath: input.workingPath })
        ? applyChangeState(row, changes)
        : row),
    annotationPairs: state.annotationPairs,
  };
}

export function addManualReviewLineState(
  state: ChapterReviewApplicationState,
  input: AddManualReviewLineInput,
): AddManualReviewLineResult {
  const lineNumber = nearestMatchingLine(input.documentText, input.lineText, input.hintLine);
  const scope = { sourcePath: input.sourcePath, workingPath: input.workingPath };
  const existing = findReusableManualRow(state.rows, {
    typeLabel: input.moduleName,
    raw: input.lineText,
    line: lineNumber,
    belongs: (row) => rowBelongsToScope(row, scope),
  });
  let rows: Candidate[];
  let row: Candidate;
  if (existing) {
    const restoredLineType = existing.lineType === IGNORED_LINE_TYPE
      ? (input.moduleName === "章节定界" ? "新增" : defaultLineType(input.moduleName, input.lineText))
      : existing.lineType;
    rows = state.rows.map((candidate) => candidate.id === existing.id
      ? {
          ...candidate,
          lineType: restoredLineType,
          isWorkingCorrection: true,
          chapterBoundaryState: "added" as const,
          range: { ...candidate.range, line: lineNumber },
        }
      : candidate);
    row = rows.find((candidate) => candidate.id === existing.id)!;
  } else {
    const manualId = `manual-${randomUuid()}`;
    const extractedNumber = input.moduleName === "注释" ? extractAnnotationNumber(input.lineText) : undefined;
    const attached = attachLineIdentity({
      id: manualId,
      kind: "regex",
      label: input.lineText.trim(),
      raw: input.lineText,
      preview: input.lineText,
      range: { line: lineNumber, start: 0, end: input.lineText.length },
      typeLabel: input.moduleName,
      lineType: input.moduleName === "章节定界" ? "新增" : defaultLineType(input.moduleName, input.lineText),
      annotationNumber: extractedNumber,
      annotationNumberSource: extractedNumber ? "extracted" : undefined,
      isWorkingCorrection: true,
      chapterBoundaryState: "added",
      workingCopyPath: input.workingPath,
      sourcePath: input.sourcePath,
      sourceLabel: input.sourcePath.split(/[\\/]/).pop() ?? input.sourcePath,
      status: "候选",
    }, input.documentText, { moduleName: input.moduleName, sourcePath: input.sourcePath });
    row = { ...attached, id: manualId, isWorkingCorrection: true, chapterBoundaryState: "added" as const };
    rows = [...state.rows, row].sort(compareRows);
  }

  if (input.moduleName === "嵌入块") {
    const targetRows = rows.filter((candidate) => candidate.typeLabel === "嵌入块" && rowBelongsToScope(candidate, scope));
    const numbered = applyEmbedNumbers(targetRows, input.documentText);
    const byId = new Map(numbered.map((candidate) => [candidate.id, candidate]));
    rows = rows.map((candidate) => byId.get(candidate.id) ?? candidate).sort(compareRows);
    row = rows.find((candidate) => candidate.id === row.id) ?? row;
  }

  const next = rebuildAnnotationReviewState(rows, state.annotationPairs);
  return { rows: next.rows, annotationPairs: next.annotationPairs, row };
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




export function refreshChapterBoundaryReviewState(
  state: ChapterReviewApplicationState,
  input: RefreshChapterBoundaryInput,
): ChapterReviewApplicationState {
  const previous = state.rows.filter((row) => row.typeLabel === "章节定界");
  const lines = input.workingText.replace(/\r\n?/g, "\n").split("\n");
  const scanned = attachScanIdentities(
    scanChapterBoundaryLines(input.baselineText, input.workingText).map((entry) => {
      const raw = entry.text || entry.baselineText || "";
      const heading = /^ {0,3}#(?!#)(?:\s+|$)/.test(entry.text);
      return {
        id: entry.id,
        kind: "regex" as const,
        label: raw.trim() || `L${entry.line + 1}`,
        raw,
        preview: raw,
        range: {
          line: Math.min(entry.line, Math.max(0, lines.length - 1)),
          start: 0,
          end: entry.state === "deleted" ? 0 : raw.length,
        },
        typeLabel: "章节定界" as const,
        lineType: heading ? "1 级标题" : boundaryStateLabel(entry.state),
        chapterBoundaryState: entry.state,
        baselinePreview: entry.baselineText,
        workingCopyPath: input.workingPath,
        sourcePath: input.workingPath,
        sourceLabel: input.sourceLabel,
        status: "候选" as const,
      };
    }),
    input.workingText,
    { moduleName: "章节定界", sourcePath: input.workingPath },
  );
  const rows = [
    ...state.rows.filter((row) => row.typeLabel !== "章节定界"),
    ...reconcileRows(previous, scanned),
  ].sort(compareRows);
  return { rows, annotationPairs: state.annotationPairs };
}

export function chapterBoundarySegments(rows: readonly Candidate[], text: string): ChapterBoundarySegment[] {
  const starts = activeCandidates([...rows])
    .filter((row) => row.typeLabel === "章节定界" && row.lineType === "1 级标题" && row.chapterFile?.trim())
    .map((row) => ({ line: row.range.line, chapterFile: chapterOriginalFileName(row.chapterFile!) }));
  if (!starts.length) return [];
  const lineCount = text.replace(/\r\n?/g, "\n").split("\n").length;
  return buildChapterBoundarySegments(starts, lineCount);
}


export function refreshIllegalLineBreakReviewState(
  state: ChapterReviewApplicationState,
  input: RefreshIllegalLineBreakInput,
): ChapterReviewApplicationState {
  const scanned = attachScanIdentities(
    scanIllegalLineBreaks(input.workingText, input.sourcePath).map((row) => ({
      ...row,
      workingCopyPath: input.workingPath,
    })),
    input.workingText,
    { moduleName: "非法断行", sourcePath: input.sourcePath },
  );
  const previous = state.rows.filter((row) =>
    row.typeLabel === "非法断行" && rowBelongsToScope(row, { sourcePath: input.sourcePath, workingPath: input.workingPath }));
  const reconciled = reconcileRows(previous, scanned, input.workingText);
  const rows = [
    ...state.rows.filter((row) => !(row.typeLabel === "非法断行"
      && rowBelongsToScope(row, { sourcePath: input.sourcePath, workingPath: input.workingPath }))),
    ...reconciled,
  ].sort(compareRows);
  return { rows, annotationPairs: state.annotationPairs };
}

export function markIllegalLineBreakReviewState(
  state: ChapterReviewApplicationState,
  input: MarkIllegalLineBreakInput,
): MarkIllegalLineBreakResult | undefined {
  const manual = manualIllegalLineBreakAtLine(input.workingText, input.sourcePath, input.cursorLine);
  if (!manual) return undefined;
  const attached = attachScanIdentities([{
    ...manual,
    workingCopyPath: input.workingPath,
    isWorkingCorrection: true,
  }], input.workingText, { moduleName: "非法断行", sourcePath: input.sourcePath })[0];
  if (!attached) return undefined;

  const sameBoundary = (row: Candidate) => row.typeLabel === "非法断行"
    && row.sourcePath === input.sourcePath
    && row.raw === manual.raw
    && row.range.line === manual.range.line
    && (row.range.endLine ?? row.range.line) === (manual.range.endLine ?? manual.range.line);
  const existing = state.rows.find(sameBoundary);
  const row: Candidate = existing ? {
    ...existing,
    ...attached,
    id: existing.id,
    rowId: existing.rowId ?? existing.id,
    atomId: existing.atomId ?? attached.atomId,
    lineType: "合并",
    isWorkingCorrection: true,
    breakReason: "人工加入",
    breakConfidence: "高",
  } : {
    ...attached,
    lineType: "合并",
    isWorkingCorrection: true,
    breakReason: "人工加入",
    breakConfidence: "高",
  };
  const rows = existing
    ? state.rows.map((candidate) => candidate.id === existing.id ? row : candidate)
    : [...state.rows, row].sort(compareRows);
  return { rows, annotationPairs: state.annotationPairs, row };
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


function nearestMatchingLine(text: string, lineText: string, hint: number): number {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  if (lines[hint] === lineText) return hint;
  let best = hint;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index] !== lineText) continue;
    const distance = Math.abs(index - hint);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  }
  return best;
}

function defaultLineType(moduleName: ModuleName, raw: string): string {
  if (moduleName === "章节定界") return /^ {0,3}#(?!#)(?:\s+|$)/.test(raw) ? "1 级标题" : "修改";
  if (moduleName === "章节标题") {
    const match = /^ {0,3}(#{1,6})(?:\s+|$)/.exec(raw);
    return match ? `${match[1].length} 级标题` : "非标题";
  }
  if (moduleName === "注释") {
    return /^\s*(?:\d+\.|\*\d+|\[\^\d+\]:)\s+/.test(raw) ? "注释正文" : "注释引用";
  }
  return detectEmbedLineType(raw) ?? "嵌入文本";
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


function boundaryStateLabel(state: "heading" | "added" | "modified" | "deleted"): string {
  return state === "added" ? "新增" : state === "modified" ? "修改" : state === "deleted" ? "删除" : "1 级标题";
}


function compareRows(left: Candidate, right: Candidate): number {
  return (left.sourceLabel ?? "").localeCompare(right.sourceLabel ?? "", "zh-CN", { numeric: true })
    || left.range.line - right.range.line
    || left.range.start - right.range.start
    || left.raw.localeCompare(right.raw);
}
