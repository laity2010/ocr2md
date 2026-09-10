import { scanChapterBoundaryLines, type ChapterBoundaryLine } from "../../../src/chapterBoundary";
import type { Candidate } from "../../../src/types";

export type ChangedLineState = "新增" | "修改" | "删除";
export type ChangedLineOwner = "章节标题" | "注释" | "嵌入块" | "非法断行" | "未归类";

export interface ChangedLineAuditRow {
  id: string;
  /** 0-based working-copy line. Deleted rows point at the deletion position. */
  line: number;
  state: ChangedLineState;
  owner: ChangedLineOwner;
  workingText: string;
  baselineText?: string;
  sourceState: "added" | "modified" | "deleted";
  /** Deleted content no longer exists in working.md and therefore cannot be located there. */
  canLocateWorking: boolean;
  /** Human-readable explanation when the line changed by calibration rather than text. */
  detail?: string;
}

export interface ChangedLineAuditInput {
  originalText: string;
  workingText: string;
  calibrationRows: Candidate[];
}

export type ChangedLineGridCandidate = Candidate & {
  changeOwner: ChangedLineOwner;
  changedLineCanLocateWorking: boolean;
};

export function changedLineAuditCandidates(
  rows: ChangedLineAuditRow[],
): ChangedLineGridCandidate[] {
  return rows.map((row) => {
    const text = row.workingText || row.baselineText || "";
    return {
      id: row.id,
      kind: "regex",
      label: `${row.state} · L${row.line + 1}`,
      raw: text,
      preview: text,
      range: {
        line: row.line,
        start: 0,
        end: text.length,
      },
      typeLabel: "变动行",
      lineType: row.state,
      chapterBoundaryState: row.sourceState,
      baselinePreview: row.baselineText,
      status: "候选",
      changeOwner: row.owner,
      changedLineCanLocateWorking: row.canLocateWorking,
    };
  });
}

/**
 * Derive the complete working-vs-original audit table.
 *
 * This is deliberately not persisted into the sidecar. It is a read-only view
 * of current working text plus the existing calibration rows.
 */
export function deriveChangedLineAuditRows(
  input: ChangedLineAuditInput,
): ChangedLineAuditRow[] {
  const textChanges = scanChapterBoundaryLines(input.originalText, input.workingText)
    .filter(
      (change): change is ChapterBoundaryLine & {
        state: "added" | "modified" | "deleted";
      } => change.state !== "heading",
    )
    .map((change) => ({
      id: `change-audit-${change.id}`,
      line: Math.max(0, change.line),
      state: changeStateLabel(change.state),
      owner: changeOwnerFor(change, input.calibrationRows),
      workingText: change.text,
      baselineText:
        change.baselineText ?? (change.state === "deleted" ? change.text : undefined),
      sourceState: change.state,
      canLocateWorking: change.state !== "deleted",
    }));

  const changedWorkingLines = new Set(
    textChanges
      .filter((change) => change.canLocateWorking)
      .map((change) => change.line),
  );
  const workingLines = input.workingText.replace(/\r\n?/g, "\n").split("\n");
  const calibrationChanges = manualCalibrationChangedLines(
    input.calibrationRows,
  )
    .filter(({ line }) => !changedWorkingLines.has(line))
    .map(({ line, owner, lineType, rowId }) => {
      const workingText = workingLines[line] ?? "";
      return {
        id: `change-audit-calibration-${rowId}`,
        line,
        state: "修改" as const,
        owner,
        workingText,
        baselineText: workingText,
        sourceState: "modified" as const,
        canLocateWorking: true,
        detail: lineType
          ? `标定性质 → ${lineType}`
          : `标定性质 → ${owner}`,
      };
    });

  return [...textChanges, ...calibrationChanges]
    .sort((left, right) => left.line - right.line || left.id.localeCompare(right.id));
}

function manualCalibrationChangedLines(
  rows: Candidate[],
): Array<{
  line: number;
  owner: Exclude<ChangedLineOwner, "未归类">;
  lineType?: string;
  rowId: string;
}> {
  const owners: Exclude<ChangedLineOwner, "未归类">[] = [
    "章节标题",
    "注释",
    "嵌入块",
    "非法断行",
  ];
  const ownerPriority = new Map(owners.map((owner, index) => [owner, index]));
  const byLine = new Map<number, {
    line: number;
    owner: Exclude<ChangedLineOwner, "未归类">;
    lineType?: string;
    rowId: string;
  }>();

  for (const row of rows) {
    if (!row.isWorkingCorrection) continue;
    if (!owners.includes(row.typeLabel as Exclude<ChangedLineOwner, "未归类">)) {
      continue;
    }
    const line = row.range.line;
    if (!Number.isInteger(line) || line < 0) continue;
    const owner = row.typeLabel as Exclude<ChangedLineOwner, "未归类">;
    const existing = byLine.get(line);
    if (
      existing
      && (ownerPriority.get(existing.owner) ?? Number.MAX_SAFE_INTEGER)
        <= (ownerPriority.get(owner) ?? Number.MAX_SAFE_INTEGER)
    ) {
      continue;
    }
    byLine.set(line, {
      line,
      owner,
      lineType: row.lineType,
      rowId: row.id,
    });
  }

  return [...byLine.values()];
}

function changeStateLabel(
  state: "added" | "modified" | "deleted",
): ChangedLineState {
  if (state === "added") return "新增";
  if (state === "modified") return "修改";
  return "删除";
}

function changeOwnerFor(
  change: ChapterBoundaryLine,
  rows: Candidate[],
): ChangedLineOwner {
  const owners: Exclude<ChangedLineOwner, "未归类">[] = [
    "章节标题",
    "注释",
    "嵌入块",
    "非法断行",
  ];
  for (const owner of owners) {
    if (
      rows.some(
        (row) => row.typeLabel === owner && rowCoversChangedLine(row, change),
      )
    ) {
      return owner;
    }
  }
  return "未归类";
}

function rowCoversChangedLine(
  row: Candidate,
  change: ChapterBoundaryLine,
): boolean {
  if (row.lineType === "已忽略") return false;

  if (row.typeLabel === "章节标题") {
    if (!/^[1-6]\s*级标题$/.test(row.lineType ?? "")) return false;
    if (change.state === "deleted") {
      const baseline = row.baselinePreview ?? row.raw;
      return row.chapterBoundaryState === "deleted" && baseline === change.text;
    }
    if (row.range.line !== change.line) return false;
    return change.state !== "added" || rowMatchesAddedText(row, change.text);
  }

  if (
    row.typeLabel !== "注释"
    && row.typeLabel !== "嵌入块"
    && row.typeLabel !== "非法断行"
  ) {
    return false;
  }

  // Automatic illegal-break candidates are only suggestions and often span
  // unrelated prose. Only an explicit working correction owns a real diff.
  if (row.typeLabel === "非法断行" && !row.isWorkingCorrection) return false;

  if (change.state === "deleted") {
    const baseline = row.baselinePreview ?? row.raw;
    return row.chapterBoundaryState === "deleted" && baseline === change.text;
  }

  const startLine = row.range.line;
  const endLine = row.range.endLine ?? startLine;
  if (change.line < startLine || change.line > endLine) return false;
  if (change.state === "modified") {
    return rowOverlapsModifiedCharacters(row, change);
  }
  if (change.state === "added") {
    return rowMatchesAddedText(row, change.text);
  }
  return false;
}

function rowMatchesAddedText(row: Candidate, addedText: string): boolean {
  const text = addedText.trim();
  if (!text) return false;

  const candidates = [row.raw, row.preview]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);

  return candidates.some(
    (candidate) => text.includes(candidate) || candidate.includes(text),
  );
}

function rowOverlapsModifiedCharacters(
  row: Candidate,
  change: ChapterBoundaryLine,
): boolean {
  const span = modifiedCharacterSpan(change);
  if (!span) return true;

  const rowStartLine = row.range.line;
  const rowEndLine = row.range.endLine ?? row.range.line;
  if (change.line < rowStartLine || change.line > rowEndLine) return false;

  const start = change.line === rowStartLine ? row.range.start : 0;
  const end =
    change.line === rowEndLine ? row.range.end : Number.POSITIVE_INFINITY;
  if (span.start === span.end) return span.start >= start && span.start <= end;
  return span.start < end && span.end > start;
}

function modifiedCharacterSpan(
  change: ChapterBoundaryLine,
): { start: number; end: number } | undefined {
  if (change.state !== "modified" || change.baselineText === undefined) {
    return undefined;
  }

  const before = change.baselineText;
  const after = change.text;
  let start = 0;
  while (
    start < before.length
    && start < after.length
    && before[start] === after[start]
  ) {
    start += 1;
  }

  let beforeEnd = before.length;
  let afterEnd = after.length;
  while (
    beforeEnd > start
    && afterEnd > start
    && before[beforeEnd - 1] === after[afterEnd - 1]
  ) {
    beforeEnd -= 1;
    afterEnd -= 1;
  }

  return { start, end: afterEnd };
}
