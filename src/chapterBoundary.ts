import { createHash } from "crypto";
import { diffLines } from "diff";

export type ChapterBoundaryState = "heading" | "added" | "modified" | "deleted";

export interface ChapterBoundaryLine {
  id: string;
  line: number;
  text: string;
  baselineText?: string;
  state: ChapterBoundaryState;
}

export interface MergeInputText {
  path: string;
  text: string;
}

export interface ChapterBoundaryChapterStart {
  line: number;
  chapterFile: string;
}

export interface ChapterBoundarySegment {
  chapterFile: string;
  startLine: number;
  endLine: number;
}

export function naturalMergeInputCompare(left: MergeInputText, right: MergeInputText): number {
  return left.path.localeCompare(right.path, "zh-CN", { numeric: true, sensitivity: "base" });
}

export function mergeSequenceMarkdown(inputs: MergeInputText[]): string {
  return [...inputs].sort(naturalMergeInputCompare).map((input) => input.text).join("");
}

export function scanChapterBoundaryLines(baseline: string, current: string): ChapterBoundaryLine[] {
  const changed = changedLines(baseline, current);
  const changedByCurrentLine = new Map(
    changed.filter((entry) => entry.state !== "deleted").map((entry) => [entry.line, entry]),
  );
  const rows: ChapterBoundaryLine[] = [];
  const headingOccurrences = new Map<string, number>();
  splitTextLines(current).forEach((text, line) => {
    if (!isLevelOneHeading(text)) return;
    const occurrence = (headingOccurrences.get(text) ?? 0) + 1;
    headingOccurrences.set(text, occurrence);
    const change = changedByCurrentLine.get(line);
    rows.push({
      id: `chapter-heading-${shortHash(text)}-${occurrence}`,
      line,
      text,
      baselineText: change?.baselineText,
      state: change?.state ?? "heading",
    });
    changedByCurrentLine.delete(line);
  });
  rows.push(...changed.filter((entry) =>
    entry.state === "deleted" || changedByCurrentLine.has(entry.line)
  ));
  return rows.sort((left, right) => left.line - right.line || stateOrder(left.state) - stateOrder(right.state));
}

export function applyChangeState<T extends {
  range: { line: number; endLine?: number };
  chapterBoundaryState?: ChapterBoundaryState;
  baselinePreview?: string;
  isWorkingCorrection?: boolean;
}>(row: T, changes: ChapterBoundaryLine[]): T {
  if (row.chapterBoundaryState === "deleted") return row;
  const endLine = row.range.endLine ?? row.range.line;
  const change = changes.find((entry) =>
    entry.state !== "deleted" && entry.line >= row.range.line && entry.line <= endLine);
  if (!change) {
    if (row.isWorkingCorrection && row.chapterBoundaryState === "added") {
      return { ...row, baselinePreview: undefined };
    }
    return { ...row, chapterBoundaryState: "heading" as const, baselinePreview: undefined };
  }
  return { ...row, chapterBoundaryState: change.state, baselinePreview: change.baselineText };
}

/** Map previous working-copy line numbers onto the current document after an edit. */
export function mapLinesAfterEdit(previousText: string, currentText: string): Map<number, number> {
  const mapping = new Map<number, number>();
  const changes = diffLines(previousText, currentText);
  let oldLine = 0;
  let newLine = 0;
  for (let index = 0; index < changes.length; index += 1) {
    const part = changes[index];
    if (!part.added && !part.removed) {
      const lines = splitPartLines(part.value);
      lines.forEach((_, offset) => mapping.set(oldLine + offset, newLine + offset));
      oldLine += lines.length;
      newLine += lines.length;
      continue;
    }
    if (part.removed && changes[index + 1]?.added) {
      const removed = splitPartLines(part.value);
      const added = splitPartLines(changes[index + 1].value);
      const paired = Math.min(removed.length, added.length);
      for (let offset = 0; offset < paired; offset += 1) mapping.set(oldLine + offset, newLine + offset);
      oldLine += removed.length;
      newLine += added.length;
      index += 1;
      continue;
    }
    const lines = splitPartLines(part.value);
    if (part.added) newLine += lines.length;
    else oldLine += lines.length;
  }
  return mapping;
}

export function remapRangeLines<T extends { range: { line: number; endLine?: number }; chapterBoundaryState?: ChapterBoundaryState }>(
  row: T,
  lineMap: Map<number, number>,
): T {
  if (row.chapterBoundaryState === "deleted") return row;
  const line = lineMap.get(row.range.line);
  if (line === undefined) return row;
  const endLine = row.range.endLine === undefined ? undefined : lineMap.get(row.range.endLine) ?? line;
  return { ...row, range: { ...row.range, line, endLine } };
}

/**
 * Convert the ordered level-one heading assignments into contiguous chapter
 * ranges. Reusing a chapter filename after another chapter would create a
 * non-contiguous file, so it is rejected instead of silently losing content.
 */
export function buildChapterBoundarySegments(
  starts: ChapterBoundaryChapterStart[],
  lineCount: number,
): ChapterBoundarySegment[] {
  const ordered = [...starts]
    .filter((start) => start.chapterFile.trim())
    .sort((left, right) => left.line - right.line || left.chapterFile.localeCompare(right.chapterFile, "zh-CN", { numeric: true }));
  const boundaries: ChapterBoundaryChapterStart[] = [];
  const seenFiles = new Set<string>();
  for (const start of ordered) {
    const chapterFile = start.chapterFile.trim();
    const previous = boundaries.at(-1);
    if (previous?.chapterFile === chapterFile) {
      continue;
    }
    if (seenFiles.has(chapterFile)) {
      throw new Error(`章节文件“${chapterFile}”对应不连续的标题边界，请使用不同的章节文件名。`);
    }
    seenFiles.add(chapterFile);
    boundaries.push({ line: start.line, chapterFile });
  }
  return boundaries.map((boundary, index) => ({
    chapterFile: boundary.chapterFile,
    startLine: index === 0 ? 0 : boundary.line,
    endLine: boundaries[index + 1]?.line ?? lineCount,
  }));
}

function changedLines(baseline: string, current: string): ChapterBoundaryLine[] {
  const changes = diffLines(baseline, current);
  const rows: ChapterBoundaryLine[] = [];
  let currentLine = 0;
  for (let index = 0; index < changes.length; index += 1) {
    const part = changes[index];
    if (!part.added && !part.removed) {
      currentLine += splitPartLines(part.value).length;
      continue;
    }
    if (part.removed && changes[index + 1]?.added) {
      const removed = splitPartLines(part.value);
      const added = splitPartLines(changes[index + 1].value);
      const paired = Math.min(removed.length, added.length);
      for (let offset = 0; offset < paired; offset += 1) {
        if (removed[offset] === added[offset]) continue;
        rows.push(changeRow("modified", currentLine + offset, added[offset], removed[offset]));
      }
      for (let offset = paired; offset < removed.length; offset += 1) {
        rows.push(changeRow("deleted", currentLine + paired, removed[offset]));
      }
      for (let offset = paired; offset < added.length; offset += 1) {
        rows.push(changeRow("added", currentLine + offset, added[offset]));
      }
      currentLine += added.length;
      index += 1;
      continue;
    }
    const lines = splitPartLines(part.value);
    if (part.added) {
      lines.forEach((text, offset) => rows.push(changeRow("added", currentLine + offset, text)));
      currentLine += lines.length;
    } else {
      lines.forEach((text) => rows.push(changeRow("deleted", currentLine, text)));
    }
  }
  return rows.filter((row) => row.text.trim() || row.baselineText?.trim());
}

function changeRow(
  state: Exclude<ChapterBoundaryState, "heading">,
  line: number,
  text: string,
  baselineText?: string,
): ChapterBoundaryLine {
  const identityText = `${state}\0${text}\0${baselineText ?? ""}`;
  return {
    id: `chapter-change-${shortHash(identityText)}-${line}`,
    line,
    text,
    baselineText,
    state,
  };
}

function splitTextLines(text: string): string[] {
  return text.replace(/\r\n?/g, "\n").split("\n");
}

function splitPartLines(text: string): string[] {
  const lines = splitTextLines(text);
  if (text.endsWith("\n") || text.endsWith("\r")) lines.pop();
  return lines;
}

function isLevelOneHeading(text: string): boolean {
  return /^ {0,3}#(?!#)(?:\s+|$)/.test(text);
}

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function stateOrder(state: ChapterBoundaryState): number {
  return state === "heading" ? 0 : state === "modified" ? 1 : state === "added" ? 2 : 3;
}
