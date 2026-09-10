import type { WorkspaceViewModel } from "./workspaceMachine";

type DebugUiState = {
  session: WorkspaceViewModel["session"];
  projectName?: string;
  chapterCount: number;
  readyChapterCount: number;
  workspaceKind?: "chapter" | "boundary" | "translation";
  boundaryReady: boolean;
  boundarySourceFileCount: number;
  boundaryHeadingCount: number;
  boundaryAssignedHeadingCount: number;
  boundarySegmentCount: number;
  canOpenBoundary: boolean;
  canExportBoundary: boolean;
  canOpenTranslation: boolean;
  canExportTrans: boolean;
  translationTotal: number;
  translationCompleted: number;
  translationFailed: number;
  translationServiceId?: "deepl" | "openai";
  lastExportedCount?: number;
  selectedChapterId?: string;
  activeReviewModule: WorkspaceViewModel["activeReviewModule"];
  activeModuleRows: number;
  headingNumberingEnabled: boolean;
  titleHeadingCount: number;
  titleExportHeadingCount: number;
  titleExportNumberedCount: number;
  canSetHeadingNumbering: boolean;
  focusedReviewRowId?: string;
  focusedSourceLine?: number;
  chapterPath?: string;
  chapterName?: string;
  workingLines?: number;
  workingLength?: number;
  calibrationRows?: number;
  visibleCalibrationRows?: number;
  ignoredCalibrationRows?: number;
  illegalMergeDecisionCount: number;
  illegalMergeSpanCount: number;
  ignoredIllegalLineBreakRows: number;
  annotationPairs?: number;
  annotationCalibratedRows: number;
  annotationPairedCount: number;
  annotationMissingRefCount: number;
  annotationMissingBodyCount: number;
  annotationMissingNumberCount: number;
  embedTotalRows: number;
  embedVisibleRows: number;
  embedGroupCount: number;
  embedUnassignedRows: number;
  canSelectChapter: boolean;
  canOpenChapter: boolean;
  canSelectReviewModule: boolean;
  canFocusReviewRow: boolean;
  canEdit: boolean;
  canUndo: boolean;
  canRedo: boolean;
  undoDepth: number;
  redoDepth: number;
  canSave: boolean;
  canResetCalibration: boolean;
  canClose: boolean;
  canLeaveCancel: boolean;
  canLeaveDiscard: boolean;
  canLeaveSave: boolean;
  leaveIntentKind?: WorkspaceViewModel["leaveIntentKind"];
  leaveTargetChapterName?: string;
  canEnterDebug: boolean;
  canExitDebug: boolean;
  revision?: string;
  lastSavedAt?: string;
  catalogError?: string;
  loadError?: string;
  saveError?: string;
};

export type DebugStateReport = {
  clientId: string;
  sequence: number;
  lastAction: string;
  lastCommandId?: string;
  device: "ipad" | "iphone" | "mac" | "other";
  pageLoadedAt: string;
  pageTime: string;
  visibilityState: DocumentVisibilityState;
  viewport: {
    width: number;
    height: number;
    devicePixelRatio: number;
  };
  platform: string;
  userAgent: string;
  state: DebugUiState;
};

function createFallbackClientId(): string {
  return [
    "client",
    Date.now().toString(36),
    Math.random().toString(36).slice(2, 10),
  ].join("-");
}

function getClientId(): string {
  const key = "ocr2md-v2-debug-client-id";
  try {
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;

    const created = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : createFallbackClientId();
    window.localStorage.setItem(key, created);
    return created;
  } catch {
    return createFallbackClientId();
  }
}

function detectDevice(): "ipad" | "iphone" | "mac" | "other" {
  const userAgent = navigator.userAgent;
  if (/iPad/i.test(userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) {
    return "ipad";
  }
  if (/iPhone/i.test(userAgent)) return "iphone";
  if (/Macintosh|MacIntel/i.test(userAgent)) return "mac";
  return "other";
}

const clientId = getClientId();
const pageLoadedAt = new Date();
let sequence = 0;

export function getDebugClientId(): string {
  return clientId;
}

export function getPageLoadedAtIso(): string {
  return pageLoadedAt.toISOString();
}

export function getPageLoadedAtDisplay(): string {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(pageLoadedAt);
}

export function createDebugStateReport(
  view: WorkspaceViewModel,
  lastAction: string,
  lastCommandId?: string,
): DebugStateReport {
  sequence += 1;
  const state: DebugUiState = {
    session: view.session,
    projectName: view.projectName,
    chapterCount: view.chapters.length,
    readyChapterCount: view.chapters.filter((chapter) => chapter.ready).length,
    workspaceKind: view.workspaceKind,
    boundaryReady: view.boundaryReady,
    boundarySourceFileCount: view.boundarySourceFileCount,
    boundaryHeadingCount: view.boundaryHeadingCount,
    boundaryAssignedHeadingCount: view.boundaryAssignedHeadingCount,
    boundarySegmentCount: view.boundarySegmentCount,
    canOpenBoundary: view.canOpenBoundary,
    canExportBoundary: view.canExportBoundary,
    canOpenTranslation: view.canOpenTranslation,
    canExportTrans: view.canExportTrans,
    translationTotal: view.translationTotal,
    translationCompleted: view.translationCompleted,
    translationFailed: view.translationFailed,
    translationServiceId: view.translationServiceId,
    lastExportedCount: view.lastExportedCount,
    selectedChapterId: view.selectedChapterId,
    activeReviewModule: view.activeReviewModule,
    activeModuleRows: view.activeModuleRows,
    headingNumberingEnabled: view.headingNumberingEnabled,
    titleHeadingCount: view.titleHeadingCount,
    titleExportHeadingCount: view.titleExportHeadingCount,
    titleExportNumberedCount: view.titleExportNumberedCount,
    canSetHeadingNumbering: view.canSetHeadingNumbering,
    focusedReviewRowId: view.focusedReviewRowId,
    focusedSourceLine: view.focusedSourceLine,
    chapterPath: view.chapterPath,
    chapterName: view.chapterName,
    workingLines: view.workingLines,
    workingLength: view.workingLength,
    calibrationRows: view.calibrationRows,
    visibleCalibrationRows: view.visibleCalibrationRows,
    ignoredCalibrationRows: view.ignoredCalibrationRows,
    illegalMergeDecisionCount: view.illegalMergeDecisionCount,
    illegalMergeSpanCount: view.illegalMergeSpanCount,
    ignoredIllegalLineBreakRows: view.ignoredIllegalLineBreakRows,
    annotationPairs: view.annotationPairs,
    annotationCalibratedRows: view.annotationCalibratedRows,
    annotationPairedCount: view.annotationPairedCount,
    annotationMissingRefCount: view.annotationMissingRefCount,
    annotationMissingBodyCount: view.annotationMissingBodyCount,
    annotationMissingNumberCount: view.annotationMissingNumberCount,
    embedTotalRows: view.embedTotalRows,
    embedVisibleRows: view.embedVisibleRows,
    embedGroupCount: view.embedGroupCount,
    embedUnassignedRows: view.embedUnassignedRows,
    canSelectChapter: view.canSelectChapter,
    canOpenChapter: view.canOpenChapter,
    canSelectReviewModule: view.canSelectReviewModule,
    canFocusReviewRow: view.canFocusReviewRow,
    canEdit: view.canEdit,
    canUndo: view.canUndo,
    canRedo: view.canRedo,
    undoDepth: view.undoDepth,
    redoDepth: view.redoDepth,
    canSave: view.canSave,
    canResetCalibration: view.canResetCalibration,
    canClose: view.canClose,
    canLeaveCancel: view.canLeaveCancel,
    canLeaveDiscard: view.canLeaveDiscard,
    canLeaveSave: view.canLeaveSave,
    leaveIntentKind: view.leaveIntentKind,
    leaveTargetChapterName: view.leaveTargetChapterName,
    canEnterDebug: view.canEnterDebug,
    canExitDebug: view.canExitDebug,
    revision: view.revision,
    lastSavedAt: view.lastSavedAt,
    catalogError: view.catalogError,
    loadError: view.loadError,
    saveError: view.saveError,
  };

  return {
    clientId,
    sequence,
    lastAction,
    lastCommandId,
    device: detectDevice(),
    pageLoadedAt: getPageLoadedAtIso(),
    pageTime: new Date().toISOString(),
    visibilityState: document.visibilityState,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
    },
    platform: navigator.platform,
    userAgent: navigator.userAgent,
    state,
  };
}

export function reportDebugState(
  view: WorkspaceViewModel,
  lastAction: string,
  lastCommandId?: string,
): Promise<void> {
  const body = JSON.stringify(
    createDebugStateReport(view, lastAction, lastCommandId),
  );

  return fetch("/__debug/state", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body,
  }).then(() => undefined).catch(() => {
    // Development telemetry is a best-effort observer only.
  });
}
