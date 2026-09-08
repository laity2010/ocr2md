import { buildAnnotationPairs, extractAnnotationNumber } from "./annotation";
import {
  DELETED_LINE_TYPE,
  markCandidatesDeleted,
} from "./candidateLifecycle";
import { locateCandidate } from "./rowIdentity";
import { applyEmbedNumbers } from "./scanner";
import type { AnnotationPair, Candidate } from "./types";

export interface ChapterReviewState {
  rows: Candidate[];
  annotationPairs: AnnotationPair[];
}

export interface RowScope {
  sourcePath?: string;
  workingPath?: string;
}

export function rowBelongsToScope(row: Candidate, scope: RowScope = {}): boolean {
  if (!scope.sourcePath && !scope.workingPath) return true;
  if (scope.workingPath && (row.sourcePath === scope.workingPath || row.workingCopyPath === scope.workingPath)) return true;
  return Boolean(scope.sourcePath) && (row.sourcePath === scope.sourcePath || row.workingCopyPath === scope.sourcePath);
}

export function applyRowsLineType(
  rows: Candidate[],
  ids: readonly string[],
  lineType: string,
  text: string,
  scope: RowScope = {},
): Candidate[] {
  const selected = new Set(ids);
  const selectedRows = rows.filter((row) => selected.has(row.id));

  let next = lineType === DELETED_LINE_TYPE
    ? markCandidatesDeleted(rows, selected)
    : rows.map((row) => selected.has(row.id) ? { ...row, lineType } : row);

  if (selectedRows.some((row) => row.typeLabel === "嵌入块")) {
    const targetRows = next.filter((row) => row.typeLabel === "嵌入块" && rowBelongsToScope(row, scope));
    const renumbered = applyEmbedNumbers(targetRows, text);
    const byId = new Map(renumbered.map((row) => [row.id, row]));
    next = next.map((row) => byId.get(row.id) ?? row);
  }
  return next;
}

export function rebuildAnnotationReviewState(
  rows: Candidate[],
  annotationPairs: AnnotationPair[],
): ChapterReviewState {
  const refreshed = rows.map((row) => {
    if (row.typeLabel !== "注释") return row;
    const extracted = extractAnnotationNumber(row.raw);
    return {
      ...row,
      annotationNumber: extracted,
      annotationNumberSource: extracted ? "extracted" as const : undefined,
    };
  });
  return {
    rows: refreshed,
    annotationPairs: buildAnnotationPairs(refreshed, annotationPairs),
  };
}

export function applyChapterFile(rows: Candidate[], ids: readonly string[], value: string): Candidate[] {
  const selected = new Set(ids);
  const chapterFile = value.trim();
  return rows.map((row) => selected.has(row.id) ? { ...row, chapterFile } : row);
}

export interface HeadingLineEdit {
  line: number;
  replacement: string;
}

export function planHeadingLineTypeEdits(
  text: string,
  rows: readonly Candidate[],
  lineType: string,
): HeadingLineEdit[] {
  const match = /^([1-6]) 级标题$/.exec(lineType);
  if (!match && lineType !== "非标题") return [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const edits = new Map<number, string>();
  for (const row of rows) {
    const located = locateCandidate(text, row);
    if (!located || located.line < 0 || located.line >= lines.length) continue;
    const sourceLine = lines[located.line];
    const content = sourceLine.replace(/^ {0,3}#{1,6}(?:\s+|$)/, "");
    const replacement = match ? `${"#".repeat(Number(match[1]))} ${content}` : content;
    if (replacement !== sourceLine) edits.set(located.line, replacement);
  }
  return [...edits.entries()]
    .map(([line, replacement]) => ({ line, replacement }))
    .sort((left, right) => left.line - right.line);
}

export function applyHeadingLineTypeToText(
  text: string,
  rows: readonly Candidate[],
  lineType: string,
): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  for (const edit of planHeadingLineTypeEdits(text, rows, lineType)) lines[edit.line] = edit.replacement;
  return lines.join(eol);
}
