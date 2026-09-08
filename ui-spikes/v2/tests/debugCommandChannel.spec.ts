import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";

const projectDir = path.resolve(
  process.env.OCR2MD_V2_TEST_PROJECT_DIR ?? ".tmp/persistent-project",
);

const fixtureWorkingText = readFileSync(
  new URL("../fixtures/buffett-alpha/working.md", import.meta.url),
  "utf8",
);
const fixtureSidecar = JSON.parse(readFileSync(
  new URL("../fixtures/buffett-alpha/sidecar.json", import.meta.url),
  "utf8",
)) as Record<string, unknown>;

type ChapterItem = {
  id: string;
  name: string;
  ready: boolean;
};

type DebugClient = {
  clientId: string;
  sequence?: number;
  lastAction?: string;
  lastCommandId?: string;
  state?: {
    session?: string;
    selectedChapterId?: string;
    chapterName?: string;
    workingLength?: number;
    calibrationRows?: number;
    visibleCalibrationRows?: number;
    ignoredCalibrationRows?: number;
    activeReviewModule?: string;
    activeModuleRows?: number;
    annotationPairs?: number;
    annotationCalibratedRows?: number;
    annotationPairedCount?: number;
    annotationMissingRefCount?: number;
    annotationMissingBodyCount?: number;
    annotationMissingNumberCount?: number;
    embedTotalRows?: number;
    embedVisibleRows?: number;
    embedGroupCount?: number;
    embedUnassignedRows?: number;
    workspaceKind?: "chapter" | "boundary";
    boundaryReady?: boolean;
    boundarySourceFileCount?: number;
    boundaryHeadingCount?: number;
    boundaryAssignedHeadingCount?: number;
    boundarySegmentCount?: number;
    canOpenBoundary?: boolean;
    canExportBoundary?: boolean;
    lastExportedCount?: number;
    focusedReviewRowId?: string;
    focusedSourceLine?: number;
    revision?: string;
    lastSavedAt?: string;
    canUndo?: boolean;
    canRedo?: boolean;
    undoDepth?: number;
    redoDepth?: number;
    canSave?: boolean;
  };
};

type DebugAck = {
  commandId?: string;
  commandSequence?: number;
};

const issuedStateSequences = new Map<string, number>();

async function catalog(request: APIRequestContext): Promise<ChapterItem[]> {
  const response = await request.get("/__workspace/chapters");
  expect(response.ok()).toBe(true);
  const payload = await response.json() as { chapters: ChapterItem[] };
  return payload.chapters;
}

async function currentClient(request: APIRequestContext, clientId: string): Promise<DebugClient | undefined> {
  const response = await request.get("/__debug/state");
  const payload = await response.json() as { clients: DebugClient[] };
  return payload.clients.find((client) => client.clientId === clientId);
}

async function currentAck(
  request: APIRequestContext,
  clientId: string,
): Promise<DebugAck | undefined> {
  const response = await request.get(
    `/__debug/ack?clientId=${encodeURIComponent(clientId)}`,
  );
  expect(response.ok()).toBe(true);
  const payload = await response.json() as { ack?: DebugAck | null };
  return payload.ack ?? undefined;
}

async function stateHistoryAfter(
  request: APIRequestContext,
  clientId: string,
  afterSequence: number,
): Promise<DebugClient[]> {
  const response = await request.get(
    `/__debug/state/history?clientId=${encodeURIComponent(clientId)}&afterSequence=${afterSequence}`,
  );
  expect(response.ok()).toBe(true);
  const payload = await response.json() as { states: DebugClient[] };
  return payload.states;
}

async function issueCommand(
  request: APIRequestContext,
  clientId: string,
  action: string,
  chapterId?: string,
  reviewModule?: string,
): Promise<string> {
  const before = await currentClient(request, clientId);
  const beforeSequence = before?.sequence ?? 0;
  const response = await request.post("/__debug/command", {
    data: { clientId, action, chapterId, reviewModule },
  });
  expect(response.ok()).toBe(true);
  const payload = await response.json() as {
    command: { commandId: string };
  };
  issuedStateSequences.set(payload.command.commandId, beforeSequence);
  return payload.command.commandId;
}

async function waitForCommand(
  request: APIRequestContext,
  clientId: string,
  commandId: string,
  session: string,
  predicate: (client: DebugClient) => boolean = () => true,
): Promise<DebugClient> {
  const beforeSequence = issuedStateSequences.get(commandId);
  expect(beforeSequence).toBeDefined();
  await expect.poll(async () => {
    const ack = await currentAck(request, clientId);
    return ack?.commandId === commandId;
  }, { timeout: 10_000 }).toBe(true);

  let matched: DebugClient | undefined;
  await expect.poll(async () => {
    const history = await stateHistoryAfter(
      request,
      clientId,
      beforeSequence!,
    );
    const client = history.find((candidate) =>
      candidate.state?.session === session
      && predicate(candidate));
    if (client) {
      matched = client;
      return true;
    }
    return false;
  }, { timeout: 15_000 }).toBe(true);
  return matched!;
}

async function pageClientId(page: Page): Promise<string> {
  const clientId = await page.evaluate(() =>
    window.localStorage.getItem("ocr2md-v2-debug-client-id"));
  expect(clientId).toBeTruthy();
  return clientId!;
}

test.afterEach(async ({ request }) => {
  await Promise.all([
    rm(path.join(projectDir, ".ocr2md-merged.working.md"), { force: true }),
    rm(path.join(projectDir, ".ocr2md", "chapter-boundary"), {
      recursive: true,
      force: true,
    }),
    ...["91 One", "92 Two", "93 Three"].map((name) =>
      rm(path.join(projectDir, "chapters", name), {
        recursive: true,
        force: true,
      })),
  ]);
  const chapters = await catalog(request);
  const chapterA = chapters.find((chapter) => chapter.name === "01 Buffett’s Alpha");
  if (!chapterA?.ready) return;
  const currentResponse = await request.get(
    `/__workspace/chapter?chapterId=${encodeURIComponent(chapterA.id)}`,
  );
  if (!currentResponse.ok()) return;
  const current = await currentResponse.json() as { revision: string };
  const restoreResponse = await request.post("/__workspace/chapter", {
    data: {
      chapterId: chapterA.id,
      expectedRevision: current.revision,
      workingText: fixtureWorkingText,
      sidecar: fixtureSidecar,
    },
  });
  expect(restoreResponse.ok()).toBe(true);
});

test("remote command can persist one chapter and switch to another catalog chapter", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.locator("#state-value")).toHaveText("idle");
  const clientId = await pageClientId(page);
  await expect.poll(async () => Boolean(await currentClient(request, clientId))).toBe(true);

  const chapters = await catalog(request);
  const chapterA = chapters.find((chapter) => chapter.name === "01 Buffett’s Alpha")!;
  const chapterB = chapters.find((chapter) => chapter.name === "02 Appendix A")!;
  expect(chapterA.ready).toBe(true);
  expect(chapterB.ready).toBe(true);

  const openAId = await issueCommand(request, clientId, "open-chapter", chapterA.id);
  const openedA = await waitForCommand(
    request,
    clientId,
    openAId,
    "chapter-clean",
    (client) => client.state?.selectedChapterId === chapterA.id,
  );
  const baselineLength = openedA.state?.workingLength;
  const baselineRevision = openedA.state?.revision;
  expect(openedA.state?.selectedChapterId).toBe(chapterA.id);
  expect(openedA.state?.chapterName).toBe("01 Buffett’s Alpha.md");
  expect(baselineLength).toBeGreaterThan(60_000);
  const baselineVisible = openedA.state?.visibleCalibrationRows;
  const baselineIgnored = openedA.state?.ignoredCalibrationRows;
  expect(openedA.state?.calibrationRows).toBe(205);
  expect(baselineVisible).toBeGreaterThan(0);
  expect(openedA.state?.activeReviewModule).toBe("章节标题");
  expect(openedA.state?.activeModuleRows).toBe(10);

  const moduleId = await issueCommand(
    request,
    clientId,
    "select-review-module",
    undefined,
    "非法断行",
  );
  const moduleSelected = await waitForCommand(
    request,
    clientId,
    moduleId,
    "chapter-clean",
    (client) =>
      client.state?.activeReviewModule === "非法断行"
      && client.state?.activeModuleRows === 6,
  );
  expect(moduleSelected.state?.activeReviewModule).toBe("非法断行");
  expect(moduleSelected.state?.activeModuleRows).toBe(6);

  const focusId = await issueCommand(request, clientId, "focus-first-calibration");
  const focused = await waitForCommand(
    request,
    clientId,
    focusId,
    "chapter-clean",
    (client) =>
      Boolean(client.state?.focusedReviewRowId)
      && (client.state?.focusedSourceLine ?? 0) > 1,
  );
  expect(focused.state?.activeReviewModule).toBe("非法断行");
  expect(focused.state?.focusedReviewRowId).toBeTruthy();
  expect(focused.state?.focusedSourceLine).toBeGreaterThan(1);

  const editId = await issueCommand(request, clientId, "edit");
  const edited = await waitForCommand(
    request,
    clientId,
    editId,
    "chapter-dirty",
    (client) =>
      client.state?.workingLength === baselineLength! + 1
      && client.state?.undoDepth === 1
      && client.state?.redoDepth === 0,
  );
  expect(edited.state?.workingLength).toBe(baselineLength! + 1);
  expect(edited.state?.visibleCalibrationRows).toBe(baselineVisible);
  expect(edited.state?.canUndo).toBe(true);
  expect(edited.state?.canRedo).toBe(false);
  expect(edited.state?.undoDepth).toBe(1);
  expect(edited.state?.redoDepth).toBe(0);

  const ignoreId = await issueCommand(request, clientId, "ignore-first-calibration");
  const ignored = await waitForCommand(
    request,
    clientId,
    ignoreId,
    "chapter-dirty",
    (client) =>
      client.state?.activeModuleRows === 5
      && client.state?.ignoredCalibrationRows === baselineIgnored! + 1
      && client.state?.undoDepth === 2
      && client.state?.redoDepth === 0,
  );
  expect(ignored.state?.workingLength).toBe(baselineLength! + 1);
  expect(ignored.state?.visibleCalibrationRows).toBe(baselineVisible! - 1);
  expect(ignored.state?.ignoredCalibrationRows).toBe(baselineIgnored! + 1);
  expect(ignored.state?.activeReviewModule).toBe("非法断行");
  expect(ignored.state?.activeModuleRows).toBe(5);
  expect(ignored.state?.undoDepth).toBe(2);
  expect(ignored.state?.redoDepth).toBe(0);

  const undoCalibrationId = await issueCommand(request, clientId, "undo");
  const undoCalibration = await waitForCommand(
    request,
    clientId,
    undoCalibrationId,
    "chapter-dirty",
    (client) =>
      client.state?.ignoredCalibrationRows === baselineIgnored
      && client.state?.undoDepth === 1
      && client.state?.redoDepth === 1,
  );
  expect(undoCalibration.state?.workingLength).toBe(baselineLength! + 1);
  expect(undoCalibration.state?.visibleCalibrationRows).toBe(baselineVisible);
  expect(undoCalibration.state?.ignoredCalibrationRows).toBe(baselineIgnored);
  expect(undoCalibration.state?.undoDepth).toBe(1);
  expect(undoCalibration.state?.redoDepth).toBe(1);

  const undoWorkingId = await issueCommand(request, clientId, "undo");
  const undoWorking = await waitForCommand(
    request,
    clientId,
    undoWorkingId,
    "chapter-clean",
    (client) =>
      client.state?.workingLength === baselineLength
      && client.state?.undoDepth === 0
      && client.state?.redoDepth === 2,
  );
  expect(undoWorking.state?.workingLength).toBe(baselineLength);
  expect(undoWorking.state?.visibleCalibrationRows).toBe(baselineVisible);
  expect(undoWorking.state?.ignoredCalibrationRows).toBe(baselineIgnored);
  expect(undoWorking.state?.canSave).toBe(false);
  expect(undoWorking.state?.canUndo).toBe(false);
  expect(undoWorking.state?.canRedo).toBe(true);
  expect(undoWorking.state?.undoDepth).toBe(0);
  expect(undoWorking.state?.redoDepth).toBe(2);

  const redoWorkingId = await issueCommand(request, clientId, "redo");
  const redoWorking = await waitForCommand(
    request,
    clientId,
    redoWorkingId,
    "chapter-dirty",
    (client) =>
      client.state?.workingLength === baselineLength! + 1
      && client.state?.undoDepth === 1
      && client.state?.redoDepth === 1,
  );
  expect(redoWorking.state?.workingLength).toBe(baselineLength! + 1);
  expect(redoWorking.state?.visibleCalibrationRows).toBe(baselineVisible);
  expect(redoWorking.state?.undoDepth).toBe(1);
  expect(redoWorking.state?.redoDepth).toBe(1);

  const redoCalibrationId = await issueCommand(request, clientId, "redo");
  const redoCalibration = await waitForCommand(
    request,
    clientId,
    redoCalibrationId,
    "chapter-dirty",
    (client) =>
      client.state?.ignoredCalibrationRows === baselineIgnored! + 1
      && client.state?.undoDepth === 2
      && client.state?.redoDepth === 0,
  );
  expect(redoCalibration.state?.workingLength).toBe(baselineLength! + 1);
  expect(redoCalibration.state?.visibleCalibrationRows).toBe(baselineVisible! - 1);
  expect(redoCalibration.state?.ignoredCalibrationRows).toBe(baselineIgnored! + 1);
  expect(redoCalibration.state?.undoDepth).toBe(2);
  expect(redoCalibration.state?.redoDepth).toBe(0);

  const saveId = await issueCommand(request, clientId, "save");
  const saved = await waitForCommand(
    request,
    clientId,
    saveId,
    "chapter-clean",
    (client) =>
      client.state?.revision !== baselineRevision
      && Boolean(client.state?.lastSavedAt),
  );
  expect(saved.state?.revision).not.toBe(baselineRevision);
  expect(saved.state?.lastSavedAt).toBeTruthy();
  expect(saved.state?.canUndo).toBe(false);
  expect(saved.state?.canRedo).toBe(false);
  expect(saved.state?.undoDepth).toBe(0);
  expect(saved.state?.redoDepth).toBe(0);

  const closeAId = await issueCommand(request, clientId, "close");
  await waitForCommand(request, clientId, closeAId, "idle");

  const openBId = await issueCommand(request, clientId, "open-chapter", chapterB.id);
  const openedB = await waitForCommand(
    request,
    clientId,
    openBId,
    "chapter-clean",
    (client) => client.state?.selectedChapterId === chapterB.id,
  );
  expect(openedB.state?.selectedChapterId).toBe(chapterB.id);
  expect(openedB.state?.chapterName).toBe("02 Appendix A.md");
  expect(openedB.state?.workingLength).not.toBe(baselineLength! + 1);

  const closeBId = await issueCommand(request, clientId, "close");
  await waitForCommand(request, clientId, closeBId, "idle");

  const reopenAId = await issueCommand(request, clientId, "open-chapter", chapterA.id);
  const reopenedA = await waitForCommand(
    request,
    clientId,
    reopenAId,
    "chapter-clean",
    (client) =>
      client.state?.selectedChapterId === chapterA.id
      && client.state?.workingLength === baselineLength! + 1
      && client.state?.ignoredCalibrationRows === baselineIgnored! + 1
      && client.state?.revision === saved.state?.revision,
  );
  expect(reopenedA.state?.workingLength).toBe(baselineLength! + 1);
  expect(reopenedA.state?.visibleCalibrationRows).toBe(baselineVisible! - 1);
  expect(reopenedA.state?.ignoredCalibrationRows).toBe(baselineIgnored! + 1);
  expect(reopenedA.state?.revision).toBe(saved.state?.revision);

  const finalCloseId = await issueCommand(request, clientId, "close");
  await waitForCommand(request, clientId, finalCloseId, "idle");
});

test("remote working rescan preserves source-derived annotation pair state", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.locator("#state-value")).toHaveText("idle");
  const clientId = await pageClientId(page);
  await expect.poll(async () => Boolean(await currentClient(request, clientId))).toBe(true);

  const chapters = await catalog(request);
  const chapter = chapters.find((item) => item.name === "01 Buffett’s Alpha")!;

  const openId = await issueCommand(
    request,
    clientId,
    "open-chapter",
    chapter.id,
  );
  const opened = await waitForCommand(
    request,
    clientId,
    openId,
    "chapter-clean",
    (client) =>
      client.state?.selectedChapterId === chapter.id
      && client.state?.annotationCalibratedRows === 20
      && client.state?.annotationPairedCount === 10,
  );
  const baselineLength = opened.state?.workingLength!;
  expect(opened.state?.annotationPairs).toBe(10);
  expect(opened.state?.annotationMissingRefCount).toBe(0);
  expect(opened.state?.annotationMissingBodyCount).toBe(0);
  expect(opened.state?.annotationMissingNumberCount).toBe(0);

  const moduleId = await issueCommand(
    request,
    clientId,
    "select-review-module",
    undefined,
    "注释",
  );
  await waitForCommand(
    request,
    clientId,
    moduleId,
    "chapter-clean",
    (client) =>
      client.state?.activeReviewModule === "注释"
      && client.state?.activeModuleRows === 20,
  );

  const editId = await issueCommand(request, clientId, "edit");
  const edited = await waitForCommand(
    request,
    clientId,
    editId,
    "chapter-dirty",
    (client) =>
      client.state?.workingLength === baselineLength + 1
      && client.state?.annotationPairs === 10
      && client.state?.annotationPairedCount === 10
      && client.state?.annotationMissingRefCount === 0
      && client.state?.annotationMissingBodyCount === 0
      && client.state?.undoDepth === 1,
  );
  expect(edited.state?.annotationCalibratedRows).toBe(20);
  expect(edited.state?.annotationMissingNumberCount).toBe(0);

  const undoId = await issueCommand(request, clientId, "undo");
  const restored = await waitForCommand(
    request,
    clientId,
    undoId,
    "chapter-clean",
    (client) =>
      client.state?.workingLength === baselineLength
      && client.state?.annotationPairs === 10
      && client.state?.annotationPairedCount === 10
      && client.state?.annotationMissingRefCount === 0
      && client.state?.annotationMissingBodyCount === 0
      && client.state?.undoDepth === 0
      && client.state?.redoDepth === 1,
  );
  expect(restored.state?.annotationCalibratedRows).toBe(20);
  expect(restored.state?.annotationMissingNumberCount).toBe(0);

  const closeId = await issueCommand(request, clientId, "close");
  await waitForCommand(request, clientId, closeId, "idle");
});

test("remote embed ignore survives working rescan and unified undo restores exact grouping", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.locator("#state-value")).toHaveText("idle");
  const clientId = await pageClientId(page);
  await expect.poll(async () => Boolean(await currentClient(request, clientId))).toBe(true);

  const chapters = await catalog(request);
  const chapter = chapters.find((item) => item.name === "01 Buffett’s Alpha")!;

  const openId = await issueCommand(
    request,
    clientId,
    "open-chapter",
    chapter.id,
  );
  const opened = await waitForCommand(
    request,
    clientId,
    openId,
    "chapter-clean",
    (client) =>
      client.state?.selectedChapterId === chapter.id
      && client.state?.embedTotalRows === 65
      && client.state?.embedVisibleRows === 51
      && client.state?.embedGroupCount === 11
      && client.state?.embedUnassignedRows === 0,
  );
  const baselineLength = opened.state?.workingLength!;
  const baselineIgnored = opened.state?.ignoredCalibrationRows!;

  const moduleId = await issueCommand(
    request,
    clientId,
    "select-review-module",
    undefined,
    "嵌入块",
  );
  await waitForCommand(
    request,
    clientId,
    moduleId,
    "chapter-clean",
    (client) =>
      client.state?.activeReviewModule === "嵌入块"
      && client.state?.activeModuleRows === 51,
  );

  const ignoreId = await issueCommand(
    request,
    clientId,
    "ignore-first-calibration",
  );
  const ignored = await waitForCommand(
    request,
    clientId,
    ignoreId,
    "chapter-dirty",
    (client) =>
      client.state?.activeModuleRows === 50
      && client.state?.embedTotalRows === 65
      && client.state?.embedVisibleRows === 50
      && client.state?.embedGroupCount === 11
      && client.state?.embedUnassignedRows === 0
      && client.state?.ignoredCalibrationRows === baselineIgnored + 1
      && client.state?.undoDepth === 1,
  );
  expect(ignored.state?.workingLength).toBe(baselineLength);

  const editId = await issueCommand(request, clientId, "edit");
  const edited = await waitForCommand(
    request,
    clientId,
    editId,
    "chapter-dirty",
    (client) =>
      client.state?.workingLength === baselineLength + 1
      && client.state?.activeModuleRows === 50
      && client.state?.embedTotalRows === 65
      && client.state?.embedVisibleRows === 50
      && client.state?.embedGroupCount === 11
      && client.state?.embedUnassignedRows === 0
      && client.state?.ignoredCalibrationRows === baselineIgnored + 1
      && client.state?.undoDepth === 2,
  );
  expect(edited.state?.redoDepth).toBe(0);

  const undoEditId = await issueCommand(request, clientId, "undo");
  const undoEdit = await waitForCommand(
    request,
    clientId,
    undoEditId,
    "chapter-dirty",
    (client) =>
      client.state?.workingLength === baselineLength
      && client.state?.activeModuleRows === 50
      && client.state?.embedVisibleRows === 50
      && client.state?.embedGroupCount === 11
      && client.state?.ignoredCalibrationRows === baselineIgnored + 1
      && client.state?.undoDepth === 1
      && client.state?.redoDepth === 1,
  );
  expect(undoEdit.state?.embedUnassignedRows).toBe(0);

  const undoIgnoreId = await issueCommand(request, clientId, "undo");
  const restored = await waitForCommand(
    request,
    clientId,
    undoIgnoreId,
    "chapter-clean",
    (client) =>
      client.state?.workingLength === baselineLength
      && client.state?.activeModuleRows === 51
      && client.state?.embedTotalRows === 65
      && client.state?.embedVisibleRows === 51
      && client.state?.embedGroupCount === 11
      && client.state?.embedUnassignedRows === 0
      && client.state?.ignoredCalibrationRows === baselineIgnored
      && client.state?.undoDepth === 0
      && client.state?.redoDepth === 2,
  );
  expect(restored.state?.embedGroupCount).toBe(11);

  const closeId = await issueCommand(request, clientId, "close");
  await waitForCommand(request, clientId, closeId, "idle");
});

test("remote chapter boundary assigns, persists, reopens, and exports exact segments", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.locator("#state-value")).toHaveText("idle");
  const clientId = await pageClientId(page);
  await expect.poll(async () => Boolean(await currentClient(request, clientId))).toBe(true);

  const openId = await issueCommand(request, clientId, "open-boundary");
  const opened = await waitForCommand(
    request,
    clientId,
    openId,
    "chapter-clean",
    (client) =>
      client.state?.workspaceKind === "boundary"
      && client.state?.boundaryReady === true
      && client.state?.boundarySourceFileCount === 3
      && client.state?.boundaryHeadingCount === 3
      && client.state?.boundaryAssignedHeadingCount === 0
      && client.state?.boundarySegmentCount === 0,
  );
  expect(opened.state?.canExportBoundary).toBe(false);

  const assignId = await issueCommand(
    request,
    clientId,
    "assign-boundary-sequence",
  );
  const assigned = await waitForCommand(
    request,
    clientId,
    assignId,
    "chapter-dirty",
    (client) =>
      client.state?.boundaryAssignedHeadingCount === 3
      && client.state?.boundarySegmentCount === 3
      && client.state?.canExportBoundary === true
      && client.state?.undoDepth === 1,
  );
  expect(assigned.state?.redoDepth).toBe(0);

  const undoId = await issueCommand(request, clientId, "undo");
  const undone = await waitForCommand(
    request,
    clientId,
    undoId,
    "chapter-clean",
    (client) =>
      client.state?.boundaryAssignedHeadingCount === 0
      && client.state?.boundarySegmentCount === 0
      && client.state?.undoDepth === 0
      && client.state?.redoDepth === 1,
  );
  expect(undone.state?.canExportBoundary).toBe(false);

  const redoId = await issueCommand(request, clientId, "redo");
  await waitForCommand(
    request,
    clientId,
    redoId,
    "chapter-dirty",
    (client) =>
      client.state?.boundaryAssignedHeadingCount === 3
      && client.state?.boundarySegmentCount === 3
      && client.state?.canExportBoundary === true,
  );

  const saveId = await issueCommand(request, clientId, "save");
  const saved = await waitForCommand(
    request,
    clientId,
    saveId,
    "chapter-clean",
    (client) =>
      client.state?.boundaryAssignedHeadingCount === 3
      && client.state?.boundarySegmentCount === 3
      && Boolean(client.state?.lastSavedAt)
      && client.state?.undoDepth === 0
      && client.state?.redoDepth === 0,
  );
  const savedRevision = saved.state?.revision;
  expect(savedRevision).toBeTruthy();

  const closeId = await issueCommand(request, clientId, "close");
  await waitForCommand(request, clientId, closeId, "idle");

  const reopenId = await issueCommand(request, clientId, "open-boundary");
  const reopened = await waitForCommand(
    request,
    clientId,
    reopenId,
    "chapter-clean",
    (client) =>
      client.state?.workspaceKind === "boundary"
      && client.state?.boundaryAssignedHeadingCount === 3
      && client.state?.boundarySegmentCount === 3
      && client.state?.revision === savedRevision,
  );
  expect(reopened.state?.canExportBoundary).toBe(true);

  const exportId = await issueCommand(request, clientId, "export-boundary");
  const exported = await waitForCommand(
    request,
    clientId,
    exportId,
    "chapter-clean",
    (client) =>
      client.state?.boundaryAssignedHeadingCount === 3
      && client.state?.boundarySegmentCount === 3
      && client.state?.lastExportedCount === 3,
  );
  expect(exported.state?.canExportBoundary).toBe(true);

  const finalCloseId = await issueCommand(request, clientId, "close");
  await waitForCommand(request, clientId, finalCloseId, "idle");
});

test("server rejects invalid remote chapter opens", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.locator("#state-value")).toHaveText("idle");
  const clientId = await pageClientId(page);
  await expect.poll(async () => Boolean(await currentClient(request, clientId))).toBe(true);

  const chapters = await catalog(request);
  const incomplete = chapters.find((chapter) => chapter.name === "00 Incomplete")!;

  const arbitrary = await request.post("/__debug/command", {
    data: { clientId, action: "arbitrary-script" },
  });
  expect(arbitrary.status()).toBe(400);

  const missingId = await request.post("/__debug/command", {
    data: { clientId, action: "open-chapter" },
  });
  expect(missingId.status()).toBe(400);

  const forgedId = await request.post("/__debug/command", {
    data: { clientId, action: "open-chapter", chapterId: "forged-chapter-id" },
  });
  expect(forgedId.status()).toBe(404);

  const incompleteOpen = await request.post("/__debug/command", {
    data: { clientId, action: "open-chapter", chapterId: incomplete.id },
  });
  expect(incompleteOpen.status()).toBe(409);

  const invalidModule = await request.post("/__debug/command", {
    data: {
      clientId,
      action: "select-review-module",
      reviewModule: "不存在模块",
    },
  });
  expect(invalidModule.status()).toBe(400);
});
