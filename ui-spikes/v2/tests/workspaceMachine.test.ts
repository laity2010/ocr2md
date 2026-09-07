import assert from "node:assert/strict";
import { createActor, waitFor } from "xstate";
import { ChapterReviewApplication } from "../../../src/chapterReviewApplication";
import type {
  ChapterCatalog,
  ChapterRepository,
  ChapterSaveInput,
  ChapterWorkspaceData,
} from "../src/chapterRepository";
import { deriveWorkspaceView, workspaceMachine } from "../src/workspaceMachine";

const catalog: ChapterCatalog = {
  projectName: "Demo Project",
  chapters: [
    { id: "incomplete", name: "00 Incomplete", ready: false, reason: "缺少 sidecar" },
    { id: "demo-a", name: "01 Demo", ready: true },
    { id: "demo-b", name: "02 Demo", ready: true },
  ],
};

const chapterA: ChapterWorkspaceData = {
  id: "demo-a",
  path: "project://Demo Project/chapters/01 Demo/01 Demo.working.md",
  name: "01 Demo.md",
  originalText: "# Demo A\n",
  workingText: "# Demo A\nEdited\n",
  rows: [{
    id: "row-break-1",
    kind: "regex",
    label: "break",
    raw: "Edited",
    preview: "Edited",
    range: { line: 1, start: 0, end: 6 },
    typeLabel: "非法断行",
    lineType: "合并",
  }],
  annotationPairs: [],
  sidecarSourceFile: "01 Demo.md",
  revision: "a-r1",
};

const chapterB: ChapterWorkspaceData = {
  id: "demo-b",
  path: "project://Demo Project/chapters/02 Demo/02 Demo.working.md",
  name: "02 Demo.md",
  originalText: "# Demo B\n",
  workingText: "# Demo B\nSecond chapter\n",
  rows: [],
  annotationPairs: [],
  revision: "b-r1",
};

const persisted = new Map([
  [chapterA.id, { text: chapterA.workingText, rows: chapterA.rows, revision: 1 }],
  [chapterB.id, { text: chapterB.workingText, rows: chapterB.rows, revision: 1 }],
]);

const chapterRepository: ChapterRepository = {
  async listChapters() {
    return catalog;
  },
  async loadChapter(chapterId) {
    const base = chapterId === chapterA.id ? chapterA : chapterId === chapterB.id ? chapterB : undefined;
    if (!base) throw new Error("unknown chapter");
    const saved = persisted.get(chapterId)!;
    const application = new ChapterReviewApplication({
      rows: saved.rows,
      annotationPairs: base.annotationPairs,
    });
    const refreshed = application.refreshChapterTitle({
      baselineText: base.originalText,
      workingText: saved.text,
      sourcePath: base.path,
      workingPath: base.path,
      sourceLabel: base.name,
      embedPatterns: [],
    });
    return {
      ...base,
      workingText: saved.text,
      rows: refreshed.rows,
      annotationPairs: refreshed.annotationPairs,
      revision: `${chapterId}-r${saved.revision}`,
    };
  },
  async saveChapter(input: ChapterSaveInput) {
    const saved = persisted.get(input.chapter.id);
    if (!saved) throw new Error("unknown chapter");
    saved.text = input.workingText;
    saved.rows = input.chapter.rows;
    saved.revision += 1;
    return {
      revision: `${input.chapter.id}-r${saved.revision}`,
      savedAt: "2026-09-05T15:30:00.000Z",
      workingText: saved.text,
    };
  },
};

const actor = createActor(workspaceMachine, {
  input: { chapterRepository },
});
actor.start();

function view() {
  return deriveWorkspaceView(actor.getSnapshot());
}

assert.equal(view().session, "catalog-loading");
await waitFor(actor, (snapshot) => snapshot.matches("idle"));

assert.equal(view().projectName, "Demo Project");
assert.equal(view().chapters.length, 3);
assert.equal(view().selectedChapterId, undefined);
assert.equal(view().canOpenChapter, false);
assert.equal(view().canSave, false);

actor.send({ type: "SELECT_CHAPTER", chapterId: "incomplete" });
assert.equal(view().selectedChapterId, undefined, "unready chapter must not become selected");
assert.equal(view().canOpenChapter, false);

actor.send({ type: "SELECT_CHAPTER", chapterId: "demo-a" });
assert.equal(view().selectedChapterId, "demo-a");
assert.equal(view().canOpenChapter, true);

actor.send({ type: "ENTER_DEBUG" });
assert.equal(view().session, "debug");
assert.equal(view().canEdit, false);
actor.send({ type: "SAVE" });
assert.equal(view().session, "debug", "debug session must ignore SAVE");
actor.send({ type: "EXIT_DEBUG" });
assert.equal(view().session, "idle");
assert.equal(view().selectedChapterId, "demo-a");

actor.send({ type: "OPEN_CHAPTER", chapterId: "demo-a" });
assert.equal(view().session, "opening");
assert.equal(view().canEdit, false);
await waitFor(actor, (snapshot) => snapshot.matches({ chapter: "clean" }));

assert.equal(view().chapterName, "01 Demo.md");
assert.equal(view().revision, "demo-a-r1");
assert.equal(view().activeReviewModule, "章节标题");
assert.equal(view().activeModuleRows, 1);
assert.equal(view().canSelectReviewModule, true);

actor.send({ type: "SELECT_REVIEW_MODULE", module: "非法断行" });
assert.equal(view().session, "chapter-clean", "module switch must not dirty the chapter");
assert.equal(view().activeReviewModule, "非法断行");
assert.equal(view().activeModuleRows, 1);
assert.equal(view().canFocusReviewRow, true);

actor.send({
  type: "CALIBRATION_ROW_FOCUSED",
  rowId: "row-break-1",
  sourceLine: 2,
});
assert.equal(view().focusedReviewRowId, "row-break-1");
assert.equal(view().focusedSourceLine, 2);

const baselineCalibrationRows = view().calibrationRows!;
const baselineVisibleCalibrationRows = view().visibleCalibrationRows!;
const baselineIgnoredCalibrationRows = view().ignoredCalibrationRows!;
assert.ok(baselineCalibrationRows > 1, "title refresh must populate review rows");
assert.equal(baselineIgnoredCalibrationRows, 0);
assert.equal(view().canClose, true);

const baselineWorkingLength = view().workingLength!;
assert.equal(view().canUndo, false);
assert.equal(view().canRedo, false);
assert.equal(view().undoDepth, 0);
assert.equal(view().redoDepth, 0);

const editedA = chapterA.workingText + "x";
actor.send({ type: "WORKING_CHANGED", text: editedA });
assert.equal(view().session, "chapter-dirty");
assert.equal(view().workingLength, editedA.length);
assert.equal(view().canUndo, true);
assert.equal(view().canRedo, false);
assert.equal(view().undoDepth, 1);
assert.equal(view().redoDepth, 0);

actor.send({
  type: "CALIBRATION_LINE_TYPE_CHANGED",
  rowId: "row-break-1",
  lineType: "已忽略",
});
assert.equal(view().session, "chapter-dirty");
assert.equal(view().workingLength, editedA.length, "calibration edit must not change working");
assert.equal(view().calibrationRows, baselineCalibrationRows);
assert.equal(view().visibleCalibrationRows, baselineVisibleCalibrationRows - 1);
assert.equal(view().ignoredCalibrationRows, baselineIgnoredCalibrationRows + 1);
assert.equal(view().undoDepth, 2);
assert.equal(view().redoDepth, 0);

actor.send({ type: "UNDO" });
assert.equal(view().session, "chapter-dirty");
assert.equal(view().workingLength, editedA.length);
assert.equal(view().calibrationRows, baselineCalibrationRows);
assert.equal(view().visibleCalibrationRows, baselineVisibleCalibrationRows);
assert.equal(view().ignoredCalibrationRows, baselineIgnoredCalibrationRows);
assert.equal(view().undoDepth, 1);
assert.equal(view().redoDepth, 1);
assert.equal(view().canSave, true);

actor.send({ type: "UNDO" });
assert.equal(view().session, "chapter-clean", "undo to saved baseline must become clean");
assert.equal(view().workingLength, baselineWorkingLength);
assert.equal(view().calibrationRows, baselineCalibrationRows);
assert.equal(view().visibleCalibrationRows, baselineVisibleCalibrationRows);
assert.equal(view().ignoredCalibrationRows, baselineIgnoredCalibrationRows);
assert.equal(view().canSave, false);
assert.equal(view().canClose, true);
assert.equal(view().canUndo, false);
assert.equal(view().canRedo, true);
assert.equal(view().undoDepth, 0);
assert.equal(view().redoDepth, 2);

actor.send({ type: "REDO" });
assert.equal(view().session, "chapter-dirty");
assert.equal(view().workingLength, editedA.length);
assert.equal(view().calibrationRows, baselineCalibrationRows);
assert.equal(view().visibleCalibrationRows, baselineVisibleCalibrationRows);
assert.equal(view().ignoredCalibrationRows, baselineIgnoredCalibrationRows);
assert.equal(view().undoDepth, 1);
assert.equal(view().redoDepth, 1);

actor.send({ type: "REDO" });
assert.equal(view().session, "chapter-dirty");
assert.equal(view().workingLength, editedA.length);
assert.equal(view().calibrationRows, baselineCalibrationRows);
assert.equal(view().visibleCalibrationRows, baselineVisibleCalibrationRows - 1);
assert.equal(view().ignoredCalibrationRows, baselineIgnoredCalibrationRows + 1);
assert.equal(view().undoDepth, 2);
assert.equal(view().redoDepth, 0);

actor.send({ type: "CLOSE" });
assert.equal(view().session, "chapter-leave-confirm");
assert.equal(view().leaveIntentKind, "close");
assert.equal(view().canLeaveCancel, true);
assert.equal(view().canLeaveDiscard, true);
assert.equal(view().canLeaveSave, true);
assert.equal(view().canEdit, false);
assert.equal(view().canSave, false);

actor.send({ type: "LEAVE_CANCEL" });
assert.equal(view().session, "chapter-dirty", "cancel must keep the dirty chapter open");
assert.equal(view().workingLength, editedA.length);
assert.equal(view().ignoredCalibrationRows, baselineIgnoredCalibrationRows + 1);
assert.equal(view().canSave, true);
assert.equal(view().leaveIntentKind, undefined);

actor.send({ type: "SAVE" });
assert.equal(view().session, "chapter-saving");
await waitFor(actor, (snapshot) => snapshot.matches({ chapter: "clean" }));
assert.equal(view().revision, "demo-a-r2");
assert.equal(view().lastSavedAt, "2026-09-05T15:30:00.000Z");
assert.equal(view().canUndo, false, "save establishes a new baseline and clears undo");
assert.equal(view().canRedo, false, "save clears redo");
assert.equal(view().undoDepth, 0);
assert.equal(view().redoDepth, 0);

actor.send({ type: "CLOSE" });
assert.equal(view().session, "idle");
assert.equal(view().selectedChapterId, "demo-a");

actor.send({ type: "OPEN_CHAPTER", chapterId: "demo-a" });
await waitFor(actor, (snapshot) => snapshot.matches({ chapter: "clean" }));
assert.equal(view().workingLength, editedA.length, "working edit must survive save/reentry");
assert.equal(
  view().ignoredCalibrationRows,
  baselineIgnoredCalibrationRows + 1,
  "calibration edit must survive save/reentry",
);
assert.equal(view().visibleCalibrationRows, baselineVisibleCalibrationRows - 1);

const branchText = editedA + "branch";
actor.send({ type: "WORKING_CHANGED", text: branchText });
assert.equal(view().session, "chapter-dirty");
assert.equal(view().undoDepth, 1);
actor.send({ type: "UNDO" });
assert.equal(view().session, "chapter-clean");
assert.equal(view().redoDepth, 1);

const replacementBranch = editedA + "replacement";
actor.send({ type: "WORKING_CHANGED", text: replacementBranch });
assert.equal(view().session, "chapter-dirty");
assert.equal(view().redoDepth, 0, "new operation after undo must clear old redo branch");
assert.equal(view().canRedo, false);
actor.send({ type: "UNDO" });
assert.equal(view().session, "chapter-clean");
assert.equal(view().workingLength, editedA.length);

actor.send({ type: "CLOSE" });

actor.send({ type: "SELECT_CHAPTER", chapterId: "demo-b" });
assert.equal(view().selectedChapterId, "demo-b");
actor.send({ type: "OPEN_CHAPTER", chapterId: "demo-b" });
await waitFor(actor, (snapshot) => snapshot.matches({ chapter: "clean" }));
assert.equal(view().chapterName, "02 Demo.md");
assert.equal(view().workingLength, chapterB.workingText.length);
assert.equal(view().revision, "demo-b-r1");
actor.send({ type: "CLOSE" });
assert.equal(view().session, "idle");

// M6: discard dirty changes and close without writing them.
const discardActor = createActor(workspaceMachine, {
  input: { chapterRepository },
});
discardActor.start();
await waitFor(discardActor, (snapshot) => snapshot.matches("idle"));
discardActor.send({ type: "OPEN_CHAPTER", chapterId: "demo-a" });
await waitFor(discardActor, (snapshot) => snapshot.matches({ chapter: "clean" }));
const discardBaseline = deriveWorkspaceView(discardActor.getSnapshot()).workingLength!;
const discardText = discardActor.getSnapshot().context.chapter!.workingText + "discard-only";
discardActor.send({ type: "WORKING_CHANGED", text: discardText });
discardActor.send({ type: "CLOSE" });
assert.equal(
  deriveWorkspaceView(discardActor.getSnapshot()).session,
  "chapter-leave-confirm",
);
discardActor.send({ type: "LEAVE_DISCARD" });
assert.equal(deriveWorkspaceView(discardActor.getSnapshot()).session, "idle");
discardActor.send({ type: "OPEN_CHAPTER", chapterId: "demo-a" });
await waitFor(discardActor, (snapshot) => snapshot.matches({ chapter: "clean" }));
assert.equal(
  deriveWorkspaceView(discardActor.getSnapshot()).workingLength,
  discardBaseline,
  "discard close must not persist the dirty working text",
);
discardActor.send({ type: "CLOSE" });

// M6: save dirty changes before close, then reentry must see the save.
const saveCloseActor = createActor(workspaceMachine, {
  input: { chapterRepository },
});
saveCloseActor.start();
await waitFor(saveCloseActor, (snapshot) => snapshot.matches("idle"));
saveCloseActor.send({ type: "OPEN_CHAPTER", chapterId: "demo-a" });
await waitFor(saveCloseActor, (snapshot) => snapshot.matches({ chapter: "clean" }));
const saveCloseText =
  saveCloseActor.getSnapshot().context.chapter!.workingText + "save-before-close";
saveCloseActor.send({ type: "WORKING_CHANGED", text: saveCloseText });
saveCloseActor.send({ type: "CLOSE" });
assert.equal(
  deriveWorkspaceView(saveCloseActor.getSnapshot()).session,
  "chapter-leave-confirm",
);
saveCloseActor.send({ type: "LEAVE_SAVE" });
assert.equal(
  deriveWorkspaceView(saveCloseActor.getSnapshot()).session,
  "chapter-leave-saving",
);
await waitFor(saveCloseActor, (snapshot) => snapshot.matches("idle"));
saveCloseActor.send({ type: "OPEN_CHAPTER", chapterId: "demo-a" });
await waitFor(saveCloseActor, (snapshot) => snapshot.matches({ chapter: "clean" }));
assert.equal(
  saveCloseActor.getSnapshot().context.chapter!.workingText,
  saveCloseText,
  "save close must persist before leaving",
);
saveCloseActor.send({ type: "CLOSE" });

// M6: dirty chapter switch uses the same leave-confirm state.
const switchActor = createActor(workspaceMachine, {
  input: { chapterRepository },
});
switchActor.start();
await waitFor(switchActor, (snapshot) => snapshot.matches("idle"));
switchActor.send({ type: "OPEN_CHAPTER", chapterId: "demo-a" });
await waitFor(switchActor, (snapshot) => snapshot.matches({ chapter: "clean" }));
const switchText =
  switchActor.getSnapshot().context.chapter!.workingText + "switch-draft";
switchActor.send({ type: "WORKING_CHANGED", text: switchText });
switchActor.send({ type: "SELECT_CHAPTER", chapterId: "demo-b" });
assert.equal(deriveWorkspaceView(switchActor.getSnapshot()).canOpenChapter, true);
switchActor.send({ type: "OPEN_CHAPTER", chapterId: "demo-b" });
let switchView = deriveWorkspaceView(switchActor.getSnapshot());
assert.equal(switchView.session, "chapter-leave-confirm");
assert.equal(switchView.leaveIntentKind, "open");
assert.equal(switchView.leaveTargetChapterName, "02 Demo");
assert.equal(switchView.selectedChapterId, "demo-b");

switchActor.send({ type: "LEAVE_CANCEL" });
switchView = deriveWorkspaceView(switchActor.getSnapshot());
assert.equal(switchView.session, "chapter-dirty");
assert.equal(switchView.selectedChapterId, "demo-a");
assert.equal(switchView.workingLength, switchText.length);

switchActor.send({ type: "SELECT_CHAPTER", chapterId: "demo-b" });
switchActor.send({ type: "OPEN_CHAPTER", chapterId: "demo-b" });
assert.equal(
  deriveWorkspaceView(switchActor.getSnapshot()).session,
  "chapter-leave-confirm",
);
switchActor.send({ type: "LEAVE_DISCARD" });
await waitFor(switchActor, (snapshot) => snapshot.matches({ chapter: "clean" }));
switchView = deriveWorkspaceView(switchActor.getSnapshot());
assert.equal(switchView.chapterName, "02 Demo.md");
assert.equal(switchView.selectedChapterId, "demo-b");

const catalogFailRepository: ChapterRepository = {
  async listChapters() {
    throw new Error("catalog unavailable");
  },
  async loadChapter() {
    throw new Error("unreachable");
  },
  async saveChapter() {
    throw new Error("unreachable");
  },
};
const catalogFailActor = createActor(workspaceMachine, {
  input: { chapterRepository: catalogFailRepository },
});
catalogFailActor.start();
await waitFor(catalogFailActor, (snapshot) => snapshot.matches("catalogError"));
assert.equal(deriveWorkspaceView(catalogFailActor.getSnapshot()).catalogError, "catalog unavailable");

const loadFailRepository: ChapterRepository = {
  async listChapters() {
    return catalog;
  },
  async loadChapter() {
    throw new Error("chapter unavailable");
  },
  async saveChapter() {
    throw new Error("unreachable");
  },
};
const loadFailActor = createActor(workspaceMachine, {
  input: { chapterRepository: loadFailRepository },
});
loadFailActor.start();
await waitFor(loadFailActor, (snapshot) => snapshot.matches("idle"));
loadFailActor.send({ type: "OPEN_CHAPTER", chapterId: "demo-a" });
await waitFor(loadFailActor, (snapshot) => snapshot.matches("loadError"));
assert.equal(deriveWorkspaceView(loadFailActor.getSnapshot()).loadError, "chapter unavailable");

const saveFailRepository: ChapterRepository = {
  async listChapters() {
    return catalog;
  },
  async loadChapter() {
    return chapterA;
  },
  async saveChapter() {
    throw new Error("revision conflict");
  },
};
const saveFailActor = createActor(workspaceMachine, {
  input: { chapterRepository: saveFailRepository },
});
saveFailActor.start();
await waitFor(saveFailActor, (snapshot) => snapshot.matches("idle"));
saveFailActor.send({ type: "OPEN_CHAPTER", chapterId: "demo-a" });
await waitFor(saveFailActor, (snapshot) => snapshot.matches({ chapter: "clean" }));
saveFailActor.send({
  type: "WORKING_CHANGED",
  text: chapterA.workingText + "conflict",
});
saveFailActor.send({ type: "SAVE" });
await waitFor(saveFailActor, (snapshot) => snapshot.matches({ chapter: "dirty" }));
const failedSaveView = deriveWorkspaceView(saveFailActor.getSnapshot());
assert.equal(failedSaveView.canSave, true);
assert.equal(failedSaveView.saveError, "revision conflict");

console.log("workspaceMachine v2 M8 tests passed");
