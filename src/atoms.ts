import type { Candidate, ModuleName, SourceRange } from "./types";
import { splitDocumentLines } from "./rowIdentity";

/** User calibration stored by atomId. Range is never identity. */
export interface Calibration {
  atomId: string;
  rowId?: string;
  typeLabel: ModuleName;
  lineType?: string;
  kind?: Candidate["kind"];
  chapterFile?: string;
  annotationNumber?: string;
  annotationNumberSource?: Candidate["annotationNumberSource"];
  isWorkingCorrection?: boolean;
  localPath?: string;
  status?: Candidate["status"];
  raw?: string;
  preview?: string;
  regexSource?: string;
  chapterBoundaryState?: Candidate["chapterBoundaryState"];
  baselinePreview?: string;
  anchorTextHash?: string;
  anchorPreviousHash?: string;
  anchorNextHash?: string;
  sourcePath?: string;
  sourceLabel?: string;
  workingCopyPath?: string;
}

export interface TextBlock {
  raw: string;
  range: SourceRange;
}

/** Consecutive non-blank runs. A blank line starts a new block. */
export function splitBlankLineBlocks(text: string): TextBlock[] {
  const lines = splitDocumentLines(text);
  const blocks: TextBlock[] = [];
  let start = 0;
  while (start < lines.length) {
    while (start < lines.length && !lines[start].trim()) start += 1;
    if (start >= lines.length) break;
    let end = start;
    while (end + 1 < lines.length && lines[end + 1].trim()) end += 1;
    blocks.push({
      raw: lines.slice(start, end + 1).join("\n"),
      range: {
        line: start,
        start: 0,
        endLine: end === start ? undefined : end,
        end: lines[end].length,
      },
    });
    start = end + 1;
  }
  return blocks;
}

export function calibrationOf(row: Candidate): Calibration {
  return {
    atomId: row.atomId ?? row.rowId ?? row.id,
    rowId: row.rowId ?? row.id,
    typeLabel: (row.typeLabel ?? "章节标题") as ModuleName,
    lineType: row.lineType,
    kind: row.kind,
    chapterFile: row.chapterFile,
    annotationNumber: row.annotationNumber,
    annotationNumberSource: row.annotationNumberSource,
    isWorkingCorrection: row.isWorkingCorrection,
    localPath: row.localPath,
    status: row.status,
    raw: row.raw,
    preview: row.preview,
    regexSource: row.regexSource,
    chapterBoundaryState: row.chapterBoundaryState,
    baselinePreview: row.baselinePreview,
    anchorTextHash: row.anchorTextHash,
    anchorPreviousHash: row.anchorPreviousHash,
    anchorNextHash: row.anchorNextHash,
    sourcePath: row.sourcePath,
    sourceLabel: row.sourceLabel,
    workingCopyPath: row.workingCopyPath,
  };
}

export function calibrationsOf(rows: Candidate[]): Calibration[] {
  return rows.map(calibrationOf);
}

/** Rebuild a join stub. Line numbers are untrusted until the working copy is scanned. */
export function candidateFromCalibration(calibration: Calibration): Candidate {
  const raw = calibration.raw ?? "";
  return {
    id: calibration.rowId ?? calibration.atomId,
    rowId: calibration.rowId ?? calibration.atomId,
    atomId: calibration.atomId,
    kind: calibration.kind ?? "regex",
    label: raw.trim() || calibration.atomId,
    raw,
    preview: calibration.preview ?? raw,
    range: { line: 0, start: 0, end: 0 },
    rangeUntrusted: true,
    typeLabel: calibration.typeLabel,
    lineType: calibration.lineType,
    chapterFile: calibration.chapterFile,
    annotationNumber: calibration.annotationNumber,
    annotationNumberSource: calibration.annotationNumberSource,
    isWorkingCorrection: calibration.isWorkingCorrection,
    localPath: calibration.localPath,
    status: calibration.status,
    regexSource: calibration.regexSource,
    chapterBoundaryState: calibration.chapterBoundaryState,
    baselinePreview: calibration.baselinePreview,
    anchorTextHash: calibration.anchorTextHash,
    anchorPreviousHash: calibration.anchorPreviousHash,
    anchorNextHash: calibration.anchorNextHash,
    sourcePath: calibration.sourcePath,
    sourceLabel: calibration.sourceLabel,
    workingCopyPath: calibration.workingCopyPath,
  };
}