import * as assert from "assert";
import { WorkbenchHistory, type WorkbenchHistorySnapshot } from "./workbenchHistory";
import type { Candidate } from "./types";

function row(lineType: string, raw = "row"): Candidate {
  return {
    id: "r1",
    kind: "regex",
    label: raw,
    raw,
    preview: raw,
    range: { line: 0, start: 0, end: raw.length },
    typeLabel: "注释",
    lineType,
  };
}

function snapshot(text: string, lineType: string): WorkbenchHistorySnapshot {
  return {
    workingText: text,
    rows: [row(lineType)],
    annotationPairs: [],
  };
}

const history = new WorkbenchHistory();
const s0 = snapshot("original", "注释引用");
const s1 = snapshot("original", "已忽略");
const s2 = snapshot("corrected", "注释引用");

assert.strictEqual(history.canUndo, false);
assert.strictEqual(history.canRedo, false);

history.record(s0);
assert.strictEqual(history.canUndo, true);
assert.strictEqual(history.canRedo, false);

const undoTarget = history.undo(s1);
assert.deepStrictEqual(undoTarget, s0, "undo must restore the previous full workbench snapshot");
assert.strictEqual(history.canUndo, false);
assert.strictEqual(history.canRedo, true);

const redoTarget = history.redo(s0);
assert.deepStrictEqual(redoTarget, s1, "redo must restore the state that was undone");
assert.strictEqual(history.canUndo, true);
assert.strictEqual(history.canRedo, false);

const undoAgain = history.undo(s1);
assert.deepStrictEqual(undoAgain, s0);
assert.strictEqual(history.canRedo, true);

history.record(s0);
assert.strictEqual(history.canRedo, false, "a new operation after undo must invalidate the old redo branch");
const undoNewBranch = history.undo(s2);
assert.deepStrictEqual(undoNewBranch, s0);
assert.strictEqual(history.canRedo, true);

const mutable = snapshot("x", "注释引用");
history.clear();
history.record(mutable);
mutable.rows[0].lineType = "已忽略";
const cloned = history.undo(snapshot("y", "已忽略"));
assert.strictEqual(cloned?.rows[0].lineType, "注释引用", "history snapshots must not alias mutable review rows");

console.log("workbenchHistory tests passed");
