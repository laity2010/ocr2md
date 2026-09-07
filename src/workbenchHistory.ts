import type { AnnotationPair, Candidate } from "./types";

export interface WorkbenchHistorySnapshot {
  workingText: string;
  rows: Candidate[];
  annotationPairs: AnnotationPair[];
}

function cloneCandidate(row: Candidate): Candidate {
  const cloned: Candidate = {
    ...row,
    range: { ...row.range },
  };
  if (row.translationResults) {
    cloned.translationResults = Object.fromEntries(
      Object.entries(row.translationResults).map(([key, value]) => [key, { ...value }]),
    );
  }
  return cloned;
}

export function cloneWorkbenchHistorySnapshot(snapshot: WorkbenchHistorySnapshot): WorkbenchHistorySnapshot {
  return {
    workingText: snapshot.workingText,
    rows: snapshot.rows.map(cloneCandidate),
    annotationPairs: snapshot.annotationPairs.map((pair) => ({ ...pair })),
  };
}

export class WorkbenchHistory {
  private readonly undoStack: WorkbenchHistorySnapshot[] = [];
  private readonly redoStack: WorkbenchHistorySnapshot[] = [];

  constructor(private readonly limit = 100) {}

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get undoDepth(): number {
    return this.undoStack.length;
  }

  get redoDepth(): number {
    return this.redoStack.length;
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  record(before: WorkbenchHistorySnapshot): void {
    this.undoStack.push(cloneWorkbenchHistorySnapshot(before));
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  undo(current: WorkbenchHistorySnapshot): WorkbenchHistorySnapshot | undefined {
    const target = this.undoStack.pop();
    if (!target) return undefined;
    this.redoStack.push(cloneWorkbenchHistorySnapshot(current));
    return cloneWorkbenchHistorySnapshot(target);
  }

  redo(current: WorkbenchHistorySnapshot): WorkbenchHistorySnapshot | undefined {
    const target = this.redoStack.pop();
    if (!target) return undefined;
    this.undoStack.push(cloneWorkbenchHistorySnapshot(current));
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    return cloneWorkbenchHistorySnapshot(target);
  }
}
