import { createActor } from "xstate";
import { createDeviceDebugBridge } from "./deviceDebugBridge";
import { reportDebugRuntime } from "./runtimeDebugReporter";
import {
  startDebugCommandPolling,
  type DebugCommandAction,
} from "./debugCommandChannel";
import {
  createDebugStateReport,
  getPageLoadedAtDisplay,
  reportDebugState,
} from "./debugStateReporter";
import { CalibrationGrid } from "./calibrationGrid";
import { MineruAuditPanel } from "./mineruAuditPanel";
import type { MineruAuditPayload, MineruAuditRow } from "../../../src/mineruAuditReviewStore";
import type { MineruMarkdownLocator } from "../../../src/mineruAnnotationContract";
import { locateMineruMarkdownReference } from "../../../src/mineruAnnotationLocate";
import type { MineruWebChapterAnnotations } from "../../../src/mineruAnnotationWebCli";
import type { MineruProjectedAnnotationRow } from "../../../src/mineruAnnotationProjection";
import { changedLineAuditCandidates } from "./changedLineAudit";
import { CustomCssEditor } from "./customCssEditor";
import { TablePresentationEditor } from "./tablePresentationEditor";
import { TableConfigurationGrid } from "./tableConfigurationGrid";
import { TABLE_PRESENTATION_DEFAULT_SOURCE } from "./tablePresentationConfig";
import { PersistentChapterRepository } from "./persistentChapterRepository";
import type {
  CalibrationExportDestination,
  ChapterWorkspaceData,
} from "./chapterRepository";
import { FeatureDebugMenu } from "./featureDebugMenu";
import {
  FeatureDebugRunner,
  requireFeatureDebug,
  type FeatureDebugStep,
} from "./featureDebugRunner";
import { WorkingEditor } from "./workingEditor";
import { WorkspaceSplitter } from "./workspaceSplitter";
import { BasicMarkdownPreview } from "./basicMarkdownPreview";
import { EditorPreviewSplitter } from "./editorPreviewSplitter";
import { SourceRegexSearch } from "./sourceRegexSearch";
import { SourcePreviewScrollSync } from "./sourcePreviewScrollSync";
import { deriveAdoptedMediaRoutes, deriveMediaCatalog } from "./mediaCatalog";
import {
  TranslationServicePanel,
  type TranslationServiceSelection,
} from "./translationServicePanel";
import {
  buildSentenceSourceFile,
  parseSentenceTranslationFile,
  sentenceCandidatesFromFiles,
  sentenceProviderLabel,
  type SentenceTranslationFile,
} from "../../../src/sentenceFiles";
import type { Candidate } from "../../../src/types";
import { restoreProtectedMarkdown } from "../../../src/markdownProtection";
import {
  ACTIVE_REVIEW_MODULES,
  deriveWorkspaceView,
  workspaceMachine,
  type ActiveReviewModule,
} from "./workspaceMachine";

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`missing #${id}`);
  return element as T;
}

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function chapterImageUrl(chapterId: string, relativePath: string): string {
  return "/__workspace/chapter/image?chapterId="
    + encodeURIComponent(chapterId)
    + "&path="
    + encodeURIComponent(relativePath);
}

const sentenceTranslationCache = new Map<string, SentenceTranslationFile[]>();

let mineruActiveKey = "";
let mineruLoadToken = 0;
let mineruAnnotationPayload: MineruWebChapterAnnotations | undefined;
let mineruAnnotationLoading = false;
let mineruAnnotationError = "";
const mineruBodyFocusIndex = new Map<string, number>();
let pendingAuditNavigation: { target: MineruMarkdownLocator; evidence: MineruAuditRow } | undefined;
let mineruAuditVisible = false;

function mineruChapterEntryKey(
  chapter: ChapterWorkspaceData | undefined,
  view: ReturnType<typeof deriveWorkspaceView>,
): string {
  return chapter?.kind === "chapter"
    && view.activeReviewModule === "注释"
    && !configGridMode
    ? (view.projectName ?? "") + ":" + chapter.path + ":" + chapter.id
    : "";
}

function currentMineruAnnotationRows(): MineruProjectedAnnotationRow[] | undefined {
  // A broken JSON match must fail visibly, not quietly offer legacy pairs
  // that ignore physical page identity.
  if (mineruAnnotationLoading || mineruAnnotationError) return [];
  if (!mineruAnnotationPayload?.available) return undefined;
  return [
    ...mineruAnnotationPayload.rows,
    ...(mineruAnnotationPayload.unassignedRows ?? []).map((row) => ({
      ...row,
      preview: "【全书待定位｜" + row.sourceJsonPath + "】" + row.preview,
    })),
  ];
}

function mineruAnnotationStatusText(): string {
  if (mineruAnnotationLoading) return "MinerU JSON · 正在读取页注释…";
  if (mineruAnnotationError) return "MinerU JSON 读取失败 · " + mineruAnnotationError;
  const payload = mineruAnnotationPayload;
  if (!payload?.available) return "";
  const pending = payload.unassignedRows?.length ?? payload.unassignedCount;
  const issues = Object.entries(payload.issues).reduce((sum, [, count]) => sum + count, 0);
  const references = payload.rows.filter((row) => row.lineType === "注释引用").length;
  const bodies = payload.rows.length - references;
  return "JSON 页注释 · 引用 " + references + " · 正文 " + bodies
    + " · 全书定位 " + payload.references.matched + "/" + payload.references.total
    + (pending ? " · 全书待定位 " + pending + " 行" : "")
    + (issues ? " · 待审计证据 " + issues + " 项" : "");
}

function syncMineruGridProjection(): void {
  const snapshot = actor.getSnapshot();
  const chapter = snapshot.context.chapter;
  const view = deriveWorkspaceView(snapshot);
  if (chapter?.kind !== "chapter"
    || view.activeReviewModule !== "注释"
    || !mineruActiveKey
    || mineruChapterEntryKey(chapter, view) !== mineruActiveKey) return;
  calibrationGrid.setContext(
    chapter.rows,
    chapter.workingText,
    "注释",
    view.headingNumberingEnabled,
    chapter.annotationPairs,
    currentMineruAnnotationRows(),
  );
  calibrationGrid.setEditable(view.canEdit && !mineruAnnotationLoading
    && !mineruAnnotationError && !mineruAnnotationPayload?.available);
  if (mineruAuditPanel.isOpen) {
    reviewGridStatus.textContent = "注释审计 · 全书异常列表（点击行查看原文附件）";
  }
  mineruAuditOpenButton.hidden =
    !mineruAnnotationPayload?.available && !mineruAnnotationError;
  const status = mineruAnnotationStatusText();
  if (status) {
    reviewGridStatus.textContent = status;
    annotationMatchStatus.textContent = status;
  } else {
    // No MinerU JSON: restore the original review counters rather than
    // leaving the table status stuck at "正在读取页注释".
    reviewGridStatus.textContent = "注释 · " + view.activeModuleRows + " 行";
    annotationMatchStatus.textContent =
      "标定 " + view.annotationCalibratedRows
      + " · 配对 " + view.annotationPairedCount
      + " · 缺引用 " + view.annotationMissingRefCount
      + " · 缺正文 " + view.annotationMissingBodyCount
      + " · 缺号 " + view.annotationMissingNumberCount;
  }
}

function displayMineruAuditCount(payload: MineruAuditPayload): void {
  mineruAuditOpenButton.textContent =
    "注释审计 (" + (payload.counts["待审核"] + payload.counts["需复核"]) + ")";
}

async function loadMineruAuditCount(
  chapterId: string, requestKey: string, token: number,
): Promise<void> {
  try {
    const response = await fetch(
      "/__workspace/chapter/annotation-audit?chapterId=" + encodeURIComponent(chapterId),
      { cache: "no-store" },
    );
    if (!response.ok) return;
    const payload = await response.json() as MineruAuditPayload;
    if (token !== mineruLoadToken || requestKey !== mineruActiveKey) return;
    displayMineruAuditCount(payload);
  } catch { /* Optional count: the full audit dialog surfaces errors. */ }
}

async function loadMineruAnnotations(chapterId: string, requestKey: string, token: number): Promise<void> {
  try {
    const response = await fetch(
      "/__workspace/chapter/annotations?chapterId=" + encodeURIComponent(chapterId),
      { cache: "no-store" },
    );
    if (!response.ok) throw new Error(await workspaceDirectoryError(response, "无法加载 MinerU JSON"));
    const payload = await response.json() as MineruWebChapterAnnotations;
    if (token !== mineruLoadToken || mineruActiveKey !== requestKey) return;
    mineruAnnotationPayload = payload;
    mineruAnnotationError = "";
    if (payload.available) void loadMineruAuditCount(chapterId, requestKey, token);
  } catch (error) {
    if (token !== mineruLoadToken || mineruActiveKey !== requestKey) return;
    mineruAnnotationError = error instanceof Error ? error.message : String(error);
    mineruAnnotationPayload = undefined;
  } finally {
    if (token === mineruLoadToken && mineruActiveKey === requestKey) {
      mineruAnnotationLoading = false;
      syncMineruGridProjection();
    }
  }
}
let sentenceCacheWorkspaceKind: ChapterWorkspaceData["kind"] | undefined;
let sentenceTranslationDiskRefreshInFlight = false;
let sentenceTranslationDiskRefreshSignature = "";
let sentenceTranslationDiskRefreshChapterId = "";
let sentenceTranslationModuleEntryKey = "";

function sentenceTranslationCacheKey(chapter: ChapterWorkspaceData): string {
  return `${chapter.id}:${chapter.sentenceSource?.sourceHash ?? "working"}`;
}

function effectiveSentenceTranslations(
  chapter: ChapterWorkspaceData,
): SentenceTranslationFile[] {
  const key = sentenceTranslationCacheKey(chapter);
  const cached = sentenceTranslationCache.get(key);
  if (cached) return cached;
  const initial = [...(chapter.sentenceTranslations ?? [])];
  sentenceTranslationCache.set(key, initial);
  return initial;
}

type SentenceTranslationFilesPayload = {
  sourceHash?: string;
  sentenceTranslations?: Array<{
    fileName?: string;
    provider?: string;
    data?: unknown;
  }>;
};

function isSentenceBackedTranslationModule(module: ActiveReviewModule): boolean {
  return module === "句子" || module === "原文to译文" || module === "译文to原文";
}

async function refreshSentenceTranslationsFromDisk(): Promise<void> {
  if (sentenceTranslationDiskRefreshInFlight || sentenceTranslationRunning) return;
  const snapshot = actor.getSnapshot();
  const view = deriveWorkspaceView(snapshot);
  const chapter = snapshot.context.chapter;
  if (
    document.hidden
    || configGridMode
    || chapter?.kind !== "translation"
    || !isSentenceBackedTranslationModule(view.activeReviewModule)
    || !chapter.translationSourceChapterId
  ) return;

  sentenceTranslationDiskRefreshInFlight = true;
  try {
    const response = await fetch(
      "/__workspace/translation/sentence-files?chapterId="
        + encodeURIComponent(chapter.translationSourceChapterId),
      { cache: "no-store" },
    );
    if (!response.ok) return;
    const payload = await response.json() as SentenceTranslationFilesPayload;
    if (
      payload.sourceHash
      && chapter.sentenceSource?.sourceHash
      && payload.sourceHash !== chapter.sentenceSource.sourceHash
    ) return;
    const rawFiles = payload.sentenceTranslations ?? [];
    const signature = JSON.stringify(rawFiles);
    if (
      sentenceTranslationDiskRefreshChapterId === chapter.id
      && sentenceTranslationDiskRefreshSignature === signature
    ) return;

    const parsed = rawFiles
      .map((item) => parseSentenceTranslationFile(
        item.data,
        item.provider ?? item.fileName?.replace(/\.json$/i, ""),
      ))
      .filter((item): item is SentenceTranslationFile => Boolean(item));
    sentenceTranslationCache.set(sentenceTranslationCacheKey(chapter), parsed);
    sentenceTranslationDiskRefreshChapterId = chapter.id;
    sentenceTranslationDiskRefreshSignature = signature;
    refreshSentenceTranslationGrid(chapter);
    syncSentenceTranslationUi(chapter);
    syncSourceToTranslationPreview(chapter);
    syncTranslationToSourcePreview(chapter);
  } catch {
    // Keep the last known sentence table if a background refresh fails.
  } finally {
    sentenceTranslationDiskRefreshInFlight = false;
  }
}

function updateSentenceTranslationCache(
  chapter: ChapterWorkspaceData,
  provider: string,
  value: unknown,
): SentenceTranslationFile | undefined {
  const parsed = parseSentenceTranslationFile(value, provider);
  if (!parsed) return undefined;
  const key = sentenceTranslationCacheKey(chapter);
  const current = [...effectiveSentenceTranslations(chapter)];
  const index = current.findIndex((item) => item.provider === parsed.provider);
  if (index >= 0) current[index] = parsed;
  else current.push(parsed);
  sentenceTranslationCache.set(key, current);
  return parsed;
}

function sentenceCandidates(
  chapter: ChapterWorkspaceData | undefined,
): Candidate[] {
  if (!chapter || chapter.kind !== "translation") return [];
  const source = chapter.sentenceSource
    ?? buildSentenceSourceFile(chapter.workingText, chapter.path);
  return sentenceCandidatesFromFiles(
    source,
    effectiveSentenceTranslations(chapter),
  );
}

function mediaCandidates(
  chapter: ChapterWorkspaceData | undefined,
): Candidate[] {
  if (!chapter || chapter.kind !== "chapter") return [];
  return deriveMediaCatalog(chapter).map((item, index) => ({
    id: "media:" + item.id,
    kind: "regex",
    label: item.displayName,
    raw: item.displayName,
    preview: item.displayName,
    range: {
      line: index,
      start: 0,
      end: 0,
    },
    typeLabel: "媒体",
    lineType: "媒体",
    localPath: item.localPath
      ? chapterImageUrl(chapter.id, item.localPath)
      : item.sourceUrl,
    mediaPath: item.localPath,
    mediaGroup: item.group,
    mediaSourceUrl: item.sourceUrl,
    mediaSizeBytes: item.sizeBytes,
    mediaMimeType: item.mimeType,
  }));
}

const isIPadLike =
  /iPad|iPhone/i.test(navigator.userAgent)
  || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
document.documentElement.dataset.deviceProfile = isIPadLike ? "ipad" : "mac";

const pageLoadedAt = requireElement<HTMLElement>("page-loaded-at");
const stateValue = requireElement<HTMLElement>("state-value");
const projectName = requireElement<HTMLElement>("project-name");
const workspaceDirectoryButton =
  requireElement<HTMLButtonElement>("workspace-directory-button");
const workspaceDirectoryOverlay =
  requireElement<HTMLElement>("workspace-directory-overlay");
const workspaceDirectoryCurrent =
  requireElement<HTMLElement>("workspace-directory-current");
const workspaceDirectoryBreadcrumb =
  requireElement<HTMLElement>("workspace-directory-breadcrumb");
const workspaceDirectoryParent =
  requireElement<HTMLButtonElement>("workspace-directory-parent");
const workspaceDirectoryPath =
  requireElement<HTMLElement>("workspace-directory-path");
const workspaceDirectoryList =
  requireElement<HTMLElement>("workspace-directory-list");
const workspaceDirectoryStatus =
  requireElement<HTMLElement>("workspace-directory-status");
const workspaceDirectoryCancel =
  requireElement<HTMLButtonElement>("workspace-directory-cancel");
const workspaceDirectorySelect =
  requireElement<HTMLButtonElement>("workspace-directory-select");
const chapterSelect = requireElement<HTMLSelectElement>("chapter-select");
const chapterSelectionStatus = requireElement<HTMLElement>("chapter-selection-status");
const boundarySelectionStatus = requireElement<HTMLElement>("boundary-selection-status");
const chapterPath = requireElement<HTMLElement>("chapter-path");
const chapterName = requireElement<HTMLElement>("chapter-name");
const workingLines = requireElement<HTMLElement>("working-lines");
const workingLength = requireElement<HTMLElement>("working-length");
const calibrationRows = requireElement<HTMLElement>("calibration-rows");
const visibleCalibrationRows = requireElement<HTMLElement>("visible-calibration-rows");
const ignoredCalibrationRows = requireElement<HTMLElement>("ignored-calibration-rows");
const activeReviewModule = requireElement<HTMLElement>("active-review-module");
const activeModuleRows = requireElement<HTMLElement>("active-module-rows");
const focusedSourceLine = requireElement<HTMLElement>("focused-source-line");
const annotationPairs = requireElement<HTMLElement>("annotation-pairs");
const annotationMatchStatus = requireElement<HTMLElement>("annotation-match-status");
const embedGroupStatus = requireElement<HTMLElement>("embed-group-status");
const boundaryStatus = requireElement<HTMLElement>("boundary-status");
const translationStatus = requireElement<HTMLElement>("translation-status");
const calibrationGridHost = requireElement<HTMLElement>("calibration-grid");
const tableConfigGridHost = requireElement<HTMLElement>("table-config-grid");
const translationServicePanelHost = requireElement<HTMLElement>("translation-service-panel");
const configModuleTab =
  requireElement<HTMLButtonElement>("config-module-tab");
const chapterElementPicker =
  requireElement<HTMLElement>("chapter-element-picker");
const chapterElementTab =
  requireElement<HTMLButtonElement>("chapter-element-tab");
const chapterElementMenu =
  requireElement<HTMLElement>("chapter-element-menu");
const translationElementPicker =
  requireElement<HTMLElement>("translation-element-picker");
const translationElementTab =
  requireElement<HTMLButtonElement>("translation-element-tab");
const translationElementMenu =
  requireElement<HTMLElement>("translation-element-menu");
const reviewGridStatus = requireElement<HTMLElement>("review-grid-status");
const mineruAuditOpenButton = requireElement<HTMLButtonElement>("mineru-audit-open");
const sentenceTranslateToolbar = requireElement<HTMLElement>("sentence-translate-toolbar");
const sentenceTranslateButton = requireElement<HTMLButtonElement>("sentence-translate-button");
const sourceLocationStatus = requireElement<HTMLElement>("source-location-status");
const regexSearchToggle =
  requireElement<HTMLButtonElement>("regex-search-toggle");
const regexSearchClose =
  requireElement<HTMLButtonElement>("regex-search-close");
const regexSearchTarget =
  requireElement<HTMLElement>("regex-search-target");
const regexSearchInput = requireElement<HTMLInputElement>("regex-search");
const searchCaseToggle = requireElement<HTMLInputElement>("search-case");
const searchPreviousButton = requireElement<HTMLButtonElement>("search-prev");
const searchNextButton = requireElement<HTMLButtonElement>("search-next");
const searchStatus = requireElement<HTMLElement>("search-status");
const headingToolbar = requireElement<HTMLElement>("heading-toolbar");
const headingNumbering = requireElement<HTMLInputElement>("heading-numbering");
const mediaToolbar = requireElement<HTMLElement>("media-toolbar");
const mediaDownloadButton = requireElement<HTMLButtonElement>("media-download");
const mediaDownloadStatus = requireElement<HTMLElement>("media-download-status");
const titleExportStatus = requireElement<HTMLElement>("title-export-status");
const illegalExportStatus = requireElement<HTMLElement>("illegal-export-status");
const boundaryToolbar = requireElement<HTMLElement>("boundary-toolbar");
const boundarySequenceStart =
  requireElement<HTMLInputElement>("boundary-sequence-start");
const assignBoundarySequenceButton =
  requireElement<HTMLButtonElement>("assign-boundary-sequence");
const exportBoundaryButton =
  requireElement<HTMLButtonElement>("export-boundary");
const boundaryExportStatus =
  requireElement<HTMLElement>("boundary-export-status");
const reviewModuleButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>("[data-review-module]"),
);
const revision = requireElement<HTMLElement>("revision");
const lastSavedAt = requireElement<HTMLElement>("last-saved-at");
const canEdit = requireElement<HTMLElement>("can-edit");
const canUndo = requireElement<HTMLElement>("can-undo");
const canRedo = requireElement<HTMLElement>("can-redo");
const undoDepth = requireElement<HTMLElement>("undo-depth");
const redoDepth = requireElement<HTMLElement>("redo-depth");
const canSave = requireElement<HTMLElement>("can-save");
const catalogError = requireElement<HTMLElement>("catalog-error");
const loadError = requireElement<HTMLElement>("load-error");
const saveError = requireElement<HTMLElement>("save-error");
const workingEditorHost = requireElement<HTMLElement>("working-editor");
const sourceLineMenu = requireElement<HTMLElement>("source-line-menu");
const sourceLineMenuTitle =
  requireElement<HTMLElement>("source-line-menu-title");
const sourceLineAddActive =
  requireElement<HTMLButtonElement>("source-line-add-active");
const sourceLineInsertBr =
  requireElement<HTMLButtonElement>("source-line-insert-br");
const sourceLineDelete =
  requireElement<HTMLButtonElement>("source-line-delete");
const sourceEditorTab = requireElement<HTMLButtonElement>("editor-tab-source");
const cssEditorTab = requireElement<HTMLButtonElement>("editor-tab-css");
const tableConfigEditorTab =
  requireElement<HTMLButtonElement>("editor-tab-table-config");
const customCssWrap = requireElement<HTMLElement>("custom-css-wrap");
const customCssEditorHost = requireElement<HTMLElement>("custom-css-editor");
const cssSaveButton = requireElement<HTMLButtonElement>("css-save");
const cssResetButton = requireElement<HTMLButtonElement>("css-reset");
const tableConfigWrap = requireElement<HTMLElement>("table-config-wrap");
const tableConfigEditorHost =
  requireElement<HTMLElement>("table-config-editor");
const tableConfigSaveButton =
  requireElement<HTMLButtonElement>("table-config-save");
const tableConfigResetButton =
  requireElement<HTMLButtonElement>("table-config-reset");
const regexSearchPanel = requireElement<HTMLElement>("regex-search-panel");
const editorModeStatus = requireElement<HTMLElement>("editor-mode-status");
const markdownPreviewHost = requireElement<HTMLElement>("markdown-preview");
const translationPopoverTrigger =
  requireElement<HTMLSelectElement>("translation-popover-trigger");
const editorPane = requireElement<HTMLElement>("editor-pane");
const editorPreviewSplitter =
  requireElement<HTMLElement>("editor-preview-splitter");
const cleaningWorkspace = requireElement<HTMLElement>("cleaning-workspace");
const workspaceSplitter = requireElement<HTMLElement>("workspace-splitter");

const refreshCatalogButton = requireElement<HTMLButtonElement>("refresh-catalog");
const openChapterButton = requireElement<HTMLButtonElement>("open-chapter");
const openTranslationButton =
  requireElement<HTMLButtonElement>("open-translation");
const openBoundaryButton = requireElement<HTMLButtonElement>("open-boundary");
const undoButton = requireElement<HTMLButtonElement>("undo");
const redoButton = requireElement<HTMLButtonElement>("redo");
const saveButton = requireElement<HTMLButtonElement>("save");
const exportCalibrationButton =
  requireElement<HTMLButtonElement>("export-calibration");
const resetCalibrationButton =
  requireElement<HTMLButtonElement>("reset-calibration");
const exportTransButton = requireElement<HTMLButtonElement>("export-trans");
const enterDebugButton = requireElement<HTMLButtonElement>("enter-debug");
const exitDebugButton = requireElement<HTMLButtonElement>("exit-debug");
const leaveConfirmOverlay = requireElement<HTMLElement>("leave-confirm-overlay");
const leaveConfirmTitle = requireElement<HTMLElement>("leave-confirm-title");
const leaveConfirmMessage = requireElement<HTMLElement>("leave-confirm-message");
const leaveCancelButton = requireElement<HTMLButtonElement>("leave-cancel");
const leaveDiscardButton = requireElement<HTMLButtonElement>("leave-discard");
const leaveSaveButton = requireElement<HTMLButtonElement>("leave-save");
const resetConfirmOverlay = requireElement<HTMLElement>("reset-confirm-overlay");
const resetConfirmMessage = requireElement<HTMLElement>("reset-confirm-message");
const resetCancelButton = requireElement<HTMLButtonElement>("reset-cancel");
const resetConfirmButton = requireElement<HTMLButtonElement>("reset-confirm");
const exportCalibrationOverlay =
  requireElement<HTMLElement>("export-calibration-overlay");
const exportCalibrationStatus =
  requireElement<HTMLElement>("export-calibration-status");
const exportDestinationTrans =
  requireElement<HTMLInputElement>("export-destination-trans");
const exportDestinationOutput =
  requireElement<HTMLInputElement>("export-destination-output");
const exportCalibrationCancelButton =
  requireElement<HTMLButtonElement>("export-calibration-cancel");
const exportCalibrationConfirmButton =
  requireElement<HTMLButtonElement>("export-calibration-confirm");
const featureDebugToggle =
  requireElement<HTMLButtonElement>("ui-debug-toggle");
const featureDebugMenuElement =
  requireElement<HTMLElement>("ui-debug-menu");
const featureDebugProgress =
  requireElement<HTMLElement>("feature-debug-progress");
const featureDebugProgressTitle =
  requireElement<HTMLElement>("feature-debug-progress-title");
const featureDebugProgressList =
  requireElement<HTMLElement>("feature-debug-progress-list");
const featureDebugInitializeButton =
  requireElement<HTMLButtonElement>("ui-debug-initialize");
const featureDebugChapterOpenButton =
  requireElement<HTMLButtonElement>("ui-debug-chapter-open");
const featureDebugWorkspaceSplitterButton =
  requireElement<HTMLButtonElement>("ui-debug-workspace-splitter");
const featureDebugEditorPreviewSplitterButton =
  requireElement<HTMLButtonElement>("ui-debug-editor-preview-splitter");
const featureDebugWorkingTextButton =
  requireElement<HTMLButtonElement>("ui-debug-working-text");
const featureDebugIgnoreLineTypeButton =
  requireElement<HTMLButtonElement>("ui-debug-ignore-line-type");
const featureDebugSaveReloadButton =
  requireElement<HTMLButtonElement>("ui-debug-save-reload");
const featureDebugReviewModuleSwitchButton =
  requireElement<HTMLButtonElement>("ui-debug-review-module-switch");
const featureDebugReviewRowLocateButton =
  requireElement<HTMLButtonElement>("ui-debug-review-row-locate");
const featureDebugDirtyLeaveProtectionButton =
  requireElement<HTMLButtonElement>("ui-debug-dirty-leave-protection");
const featureDebugIllegalLineBreakButton =
  requireElement<HTMLButtonElement>("ui-debug-illegal-line-break");
const featureDebugChangedLineButton =
  requireElement<HTMLButtonElement>("ui-debug-changed-line");
const featureDebugChapterTitleButton =
  requireElement<HTMLButtonElement>("ui-debug-chapter-title");
const featureDebugAnnotationButton =
  requireElement<HTMLButtonElement>("ui-debug-annotation");
const featureDebugEmbedButton =
  requireElement<HTMLButtonElement>("ui-debug-embed");
const featureDebugChapterBoundaryButton =
  requireElement<HTMLButtonElement>("ui-debug-chapter-boundary");
const featureDebugMarkdownPreviewButton =
  requireElement<HTMLButtonElement>("ui-debug-markdown-preview");
const featureDebugSourcePreviewSyncButton =
  requireElement<HTMLButtonElement>("ui-debug-source-preview-sync");
const featureDebugTableConfigButton =
  requireElement<HTMLButtonElement>("ui-debug-table-config");
const featureDebugSourceRegexSearchButton =
  requireElement<HTMLButtonElement>("ui-debug-source-regex-search");
const featureDebugUndoRedoButton =
  requireElement<HTMLButtonElement>("ui-debug-undo-redo");

const workspaceSplitterControl =
  new WorkspaceSplitter(cleaningWorkspace, workspaceSplitter);
const editorPreviewSplitterControl =
  new EditorPreviewSplitter(editorPane, editorPreviewSplitter);
const markdownPreview = new BasicMarkdownPreview(markdownPreviewHost);
const TRANSLATION_POPOVER_TRIGGER_STORAGE_KEY =
  "ocr2md-v2-translation-popover-trigger-taps-v1";
const DEFAULT_TRANSLATION_POPOVER_TRIGGER_TAPS = 4;

function loadTranslationPopoverTriggerTaps(): number {
  const raw = window.localStorage.getItem(TRANSLATION_POPOVER_TRIGGER_STORAGE_KEY);
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 && value <= 6
    ? value
    : DEFAULT_TRANSLATION_POPOVER_TRIGGER_TAPS;
}

function setTranslationPopoverTriggerTaps(value: number, persist: boolean): void {
  const normalized = Number.isInteger(value) && value >= 1 && value <= 6
    ? value
    : DEFAULT_TRANSLATION_POPOVER_TRIGGER_TAPS;
  translationPopoverTrigger.value = String(normalized);
  markdownPreview.setTranslationPopoverTapCount(normalized);
  if (persist) {
    window.localStorage.setItem(TRANSLATION_POPOVER_TRIGGER_STORAGE_KEY, String(normalized));
  }
}

setTranslationPopoverTriggerTaps(loadTranslationPopoverTriggerTaps(), false);
translationPopoverTrigger.addEventListener("change", () => {
  setTranslationPopoverTriggerTaps(Number(translationPopoverTrigger.value), true);
});

const featureDebugMenu = new FeatureDebugMenu(
  featureDebugToggle,
  featureDebugMenuElement,
);
const featureDebugRunner = new FeatureDebugRunner({
  progress: featureDebugProgress,
  progressTitle: featureDebugProgressTitle,
  progressList: featureDebugProgressList,
  delayMs: () => 500,
  completionHideDelayMs: () => 1800,
});

const chapterRepository = new PersistentChapterRepository();
const actor = createActor(workspaceMachine, {
  input: {
    chapterRepository,
  },
});

let lastUiAction = "page-start";
let lastCommandId: string | undefined;
let pendingEditorCommandId: string | undefined;
let pendingCalibrationCommandId: string | undefined;
let pendingCalibrationFocusCommandId: string | undefined;
let catalogSignature = "";
let resetConfirmVisible = false;
let exportCalibrationVisible = false;
let exportCalibrationPendingDestination: CalibrationExportDestination | undefined;
let featureDebugEnvironmentReady = false;
let featureDebugChapterId: string | undefined;
let featureDebugBaselineRevision: string | undefined;
let workingTextDebugBaselineWorking: string | undefined;
let workingTextDebugBaselineRevision: string | undefined;
let markdownPreviewDebugBaselineWorking: string | undefined;
let markdownPreviewDebugBaselineText: string | undefined;
let sourcePreviewSyncDebugBaselineSourceLine = 1;
let changedLineNoticeChapterId: string | undefined;
let changedLineKnownIds = new Set<string>();
let changedLineUnreadIds = new Set<string>();
let mediaDownloadRunning = false;
let mediaDownloadStatusText = "";
let mediaDownloadStatusChapterId: string | undefined;
let selectedTranslationService: TranslationServiceSelection = {
  id: "deepl",
  label: "DeepL",
  apiKeyConfigured: false,
};
let sentenceTranslationRunning = false;
let sentenceTranslationRunToken = 0;
const sentenceTranslationServiceStatus = new Map<string, string>();

type WorkspaceDirectoryPayload = {
  root: string;
  path: string;
  displayPath: string;
  parentPath: string | null;
  directories: Array<{
    name: string;
    path: string;
    hasChapters?: boolean;
  }>;
  currentProjectPath: string;
  currentProjectDisplayPath: string;
  currentProjectName: string;
};

let workspaceDirectoryPayload: WorkspaceDirectoryPayload | undefined;
let workspaceDirectoryLoading = false;

const deviceDebugBridge = createDeviceDebugBridge();

function selectedCalibrationExportDestination(): CalibrationExportDestination | undefined {
  if (exportDestinationTrans.checked) return "trans";
  if (exportDestinationOutput.checked) return "output";
  return undefined;
}

function changedLineModuleButton(): HTMLButtonElement | undefined {
  return reviewModuleButtons.find(
    (button) => button.dataset.reviewModule === "变动行",
  );
}

function renderChangedLineNotice(): void {
  const button = changedLineModuleButton();
  if (!button) return;
  if (changedLineUnreadIds.size <= 0) {
    button.removeAttribute("data-change-notice");
    button.classList.remove("has-change-notice");
    return;
  }
  button.setAttribute("data-change-notice", `+${changedLineUnreadIds.size}`);
  button.classList.remove("has-change-notice");
  void button.offsetWidth;
  button.classList.add("has-change-notice");
}

type ChangedLineNoticeRow = {
  id: string;
  sourceState: string;
  workingText: string;
  baselineText?: string;
};

function changedLineNoticeKeys(
  changedRows: readonly ChangedLineNoticeRow[],
): Set<string> {
  const occurrences = new Map<string, number>();
  const keys = new Set<string>();

  for (const row of changedRows) {
    const signature = [
      row.sourceState,
      row.workingText,
      row.baselineText ?? "",
    ].join("\u001f");
    const occurrence = (occurrences.get(signature) ?? 0) + 1;
    occurrences.set(signature, occurrence);
    keys.add(signature + "\u001e" + occurrence);
  }

  return keys;
}

function syncChangedLineNotice(
  chapterId: string | undefined,
  activeModule: ActiveReviewModule,
  changedRows: readonly ChangedLineNoticeRow[],
): void {
  if (!chapterId) {
    changedLineNoticeChapterId = undefined;
    changedLineKnownIds = new Set();
    changedLineUnreadIds = new Set();
    renderChangedLineNotice();
    return;
  }

  const currentIds = changedLineNoticeKeys(changedRows);
  if (chapterId !== changedLineNoticeChapterId) {
    changedLineNoticeChapterId = chapterId;
    changedLineKnownIds = currentIds;
    changedLineUnreadIds = new Set();
    renderChangedLineNotice();
    return;
  }

  for (const id of [...changedLineUnreadIds]) {
    if (!currentIds.has(id)) changedLineUnreadIds.delete(id);
  }
  if (activeModule === "变动行") {
    changedLineUnreadIds.clear();
  } else {
    for (const id of currentIds) {
      if (!changedLineKnownIds.has(id)) changedLineUnreadIds.add(id);
    }
  }
  changedLineKnownIds = currentIds;
  renderChangedLineNotice();
}

function applyWorkingTextChange(text: string): void {
  const beforeSnapshot = actor.getSnapshot();
  const beforeView = deriveWorkspaceView(beforeSnapshot);
  const followNewEmbedRow = beforeView.activeReviewModule === "嵌入块";
  const sourceLine = followNewEmbedRow ? workingEditor.selectionLine() : undefined;
  const beforeEmbedRowKeys = followNewEmbedRow
    ? new Set(
        (beforeSnapshot.context.chapter?.rows ?? [])
          .filter(
            (row) => row.typeLabel === "嵌入块"
              && row.lineType !== "已忽略"
              && row.lineType !== "已删除",
          )
          .map((row) => row.rowId ?? row.id),
      )
    : undefined;

  if (!pendingEditorCommandId) {
    lastUiAction = "working-change";
    lastCommandId = undefined;
  }
  actor.send({ type: "WORKING_CHANGED", text });

  if (!followNewEmbedRow) return;
  const afterSnapshot = actor.getSnapshot();
  const addedEmbedRowKey = (afterSnapshot.context.chapter?.rows ?? [])
    .filter(
      (row) => row.typeLabel === "嵌入块"
        && row.lineType !== "已忽略"
        && row.lineType !== "已删除"
        && !beforeEmbedRowKeys?.has(row.rowId ?? row.id),
    )
    .sort((left, right) =>
      Math.abs(left.range.line + 1 - (sourceLine ?? 1))
      - Math.abs(right.range.line + 1 - (sourceLine ?? 1)),
    )
    .map((row) => row.rowId ?? row.id)[0];
  if (!addedEmbedRowKey) return;

  window.requestAnimationFrame(() => {
    calibrationGrid.revealRow(addedEmbedRowKey, false);
  });
}

function applyCalibrationLineTypeChange(
  rowId: string,
  lineType: string,
): void {
  if (!pendingCalibrationCommandId) {
    lastUiAction = "calibration-line-type";
    lastCommandId = undefined;
  }
  actor.send({ type: "CALIBRATION_LINE_TYPE_CHANGED", rowId, lineType });
}

const workingEditor = new WorkingEditor(
  workingEditorHost,
  applyWorkingTextChange,
  () => executeProductAction("undo"),
  () => executeProductAction("redo"),
  async (file) => {
    const view = deriveWorkspaceView(actor.getSnapshot());
    if (
      !view.canEdit
      || view.workspaceKind !== "chapter"
      || !view.selectedChapterId
    ) {
      throw new Error("当前不是可编辑章节，无法粘贴图片");
    }
    editorModeStatus.textContent = `源码 · 正在粘贴图片 · ${Math.ceil(file.size / 1024)} KB`;
    const saved = await chapterRepository.savePastedImage({
      chapterId: view.selectedChapterId,
      mimeType: file.type,
      dataBase64: await fileToBase64(file),
    });
    actor.send({
      type: "MEDIA_CATALOG_REFRESHED",
      chapterId: view.selectedChapterId,
      media: saved.media,
    });
    return `![[${saved.relativePath}]]`;
  },
  (markdown) => {
    const path = /!\[\[([^\]]+)\]\]/.exec(markdown)?.[1] ?? markdown;
    editorModeStatus.textContent = `源码 · 图片已粘贴 · ${path}`;
  },
  (message) => {
    editorModeStatus.textContent = `源码 · 粘贴图片失败 · ${message}`;
  },
  (lineNumber, anchor) => openSourceLineMenu(lineNumber, anchor),
);
const sourcePreviewScrollSync = new SourcePreviewScrollSync(
  workingEditor,
  markdownPreviewHost,
);

const sourceRegexSearch = new SourceRegexSearch({
  input: regexSearchInput,
  caseToggle: searchCaseToggle,
  previousButton: searchPreviousButton,
  nextButton: searchNextButton,
  status: searchStatus,
  reveal: ({ from, to }) => workingEditor.revealOffsets(from, to),
  highlight: (matches, currentIndex) =>
    workingEditor.setRegexMatches(matches, currentIndex),
});

const customCssEditor = new CustomCssEditor(
  customCssEditorHost,
  (text) => {
    editorModeStatus.textContent = text;
  },
);

type SourcePaneMode = "source" | "css" | "table-config";
let sourcePaneMode: SourcePaneMode = "source";
let regexSearchOpen = false;

const manualSourceLineModules = new Set<ActiveReviewModule>([
  "章节定界",
  "章节标题",
  "注释",
  "嵌入块",
  "非法断行",
]);

function closeSourceLineMenu(): void {
  sourceLineMenu.hidden = true;
  sourceLineMenu.removeAttribute("data-line");
  sourceLineMenu.removeAttribute("data-module");
}

function deleteSourceLine(text: string, lineNumber: number): string {
  if (!Number.isInteger(lineNumber) || lineNumber < 1) return text;

  const starts = [0];
  const breakPattern = /\r\n|\r|\n/g;
  for (const match of text.matchAll(breakPattern)) {
    starts.push((match.index ?? 0) + match[0].length);
  }

  const start = starts[lineNumber - 1];
  if (start === undefined) return text;

  breakPattern.lastIndex = start;
  const followingBreak = breakPattern.exec(text);
  if (followingBreak) {
    return text.slice(0, start)
      + text.slice(followingBreak.index + followingBreak[0].length);
  }

  if (start === 0) return "";
  const previousText = text.slice(0, start);
  const previousBreak = /(?:\r\n|\r|\n)$/.exec(previousText);
  const deleteStart = previousBreak
    ? start - previousBreak[0].length
    : start;
  return text.slice(0, deleteStart);
}

function insertBrAtSourceLineEnd(text: string, lineNumber: number): string {
  if (!Number.isInteger(lineNumber) || lineNumber < 1) return text;

  const starts = [0];
  const breakPattern = /\r\n|\r|\n/g;
  for (const match of text.matchAll(breakPattern)) {
    starts.push((match.index ?? 0) + match[0].length);
  }

  const start = starts[lineNumber - 1];
  if (start === undefined) return text;
  breakPattern.lastIndex = start;
  const followingBreak = breakPattern.exec(text);
  const end = followingBreak?.index ?? text.length;
  const content = text.slice(start, end);
  if (/<br\s*\/?>\s*$/i.test(content)) return text;

  return text.slice(0, end) + "<br>" + text.slice(end);
}

function openSourceLineMenu(
  lineNumber: number,
  anchor: { x: number; y: number },
): void {
  if (sourcePaneMode !== "source") return;
  const view = deriveWorkspaceView(actor.getSnapshot());
  if (!view.canEdit) return;

  const module = view.activeReviewModule;
  sourceLineMenu.dataset.line = String(lineNumber);
  sourceLineMenu.dataset.module = module;
  sourceLineMenuTitle.textContent = `第 ${lineNumber} 行 · 当前数据表：${module}`;
  sourceLineAddActive.textContent = manualSourceLineModules.has(module)
    ? `加入「${module}」数据表`
    : module === "变动行"
      ? "变动行由系统自动生成"
      : "当前数据表不支持人工加入";
  sourceLineAddActive.disabled = !manualSourceLineModules.has(module);

  sourceLineMenu.hidden = false;
  sourceLineMenu.style.left = `${Math.max(8, anchor.x + 6)}px`;
  sourceLineMenu.style.top = `${Math.max(8, anchor.y + 6)}px`;

  const rect = sourceLineMenu.getBoundingClientRect();
  const left = Math.max(
    8,
    Math.min(rect.left, window.innerWidth - rect.width - 8),
  );
  const top = Math.max(
    8,
    Math.min(rect.top, window.innerHeight - rect.height - 8),
  );
  sourceLineMenu.style.left = `${left}px`;
  sourceLineMenu.style.top = `${top}px`;
}

sourceLineAddActive.addEventListener("click", () => {
  const sourceLine = Number(sourceLineMenu.dataset.line);
  const module = sourceLineMenu.dataset.module as ActiveReviewModule | undefined;
  if (
    !Number.isInteger(sourceLine)
    || sourceLine < 1
    || !module
    || !manualSourceLineModules.has(module)
  ) {
    closeSourceLineMenu();
    return;
  }

  const beforeSnapshot = actor.getSnapshot();
  const before = deriveWorkspaceView(beforeSnapshot);
  const beforeRowKeys = module === "嵌入块"
    ? new Set(
        (beforeSnapshot.context.chapter?.rows ?? [])
          .filter((row) => row.typeLabel === module)
          .map((row) => row.rowId ?? row.id),
      )
    : undefined;
  lastUiAction = "add-current-source-line";
  lastCommandId = undefined;
  actor.send({ type: "ADD_SOURCE_LINE_TO_ACTIVE_MODULE", sourceLine });
  const afterSnapshot = actor.getSnapshot();
  const after = deriveWorkspaceView(afterSnapshot);
  const added = after.undoDepth > before.undoDepth;

  editorModeStatus.textContent = added
    ? `源码 · 第 ${sourceLine} 行已加入「${module}」`
    : `源码 · 第 ${sourceLine} 行已在「${module}」中`;
  closeSourceLineMenu();
  if (added && module === "嵌入块") {
    const addedRowKey = (afterSnapshot.context.chapter?.rows ?? [])
      .filter((row) => row.typeLabel === module)
      .map((row) => row.rowId ?? row.id)
      .find((rowKey) => !beforeRowKeys?.has(rowKey));
    window.requestAnimationFrame(() => {
      if (addedRowKey) calibrationGrid.revealRow(addedRowKey);
    });
  }
});

sourceLineInsertBr.addEventListener("click", () => {
  const sourceLine = Number(sourceLineMenu.dataset.line);
  const chapter = actor.getSnapshot().context.chapter;
  if (
    !Number.isInteger(sourceLine)
    || sourceLine < 1
    || !chapter
    || chapter.kind === "translation"
  ) {
    closeSourceLineMenu();
    return;
  }

  const nextText = insertBrAtSourceLineEnd(chapter.workingText, sourceLine);
  if (nextText === chapter.workingText) {
    editorModeStatus.textContent = `源码 · 第 ${sourceLine} 行末已有 <br>`;
    closeSourceLineMenu();
    window.requestAnimationFrame(() => workingEditor.focusLine(sourceLine));
    return;
  }

  lastUiAction = "insert-br-at-source-line-end";
  const beforeSnapshot = actor.getSnapshot();
  const revealEmbedLine =
    deriveWorkspaceView(beforeSnapshot).activeReviewModule === "嵌入块";
  const beforeEmbedRowKeys = revealEmbedLine
    ? new Set(
        (beforeSnapshot.context.chapter?.rows ?? [])
          .filter((row) => row.typeLabel === "嵌入块")
          .map((row) => row.rowId ?? row.id),
      )
    : undefined;
  lastCommandId = undefined;
  actor.send({ type: "WORKING_CHANGED", text: nextText });
  const afterSnapshot = actor.getSnapshot();
  const addedEmbedRowKey = revealEmbedLine
    ? (afterSnapshot.context.chapter?.rows ?? [])
        .filter(
          (row) => row.typeLabel === "嵌入块"
            && row.lineType !== "已忽略"
            && row.lineType !== "已删除"
            && !beforeEmbedRowKeys?.has(row.rowId ?? row.id),
        )
        .sort((left, right) =>
          Math.abs(left.range.line + 1 - sourceLine)
          - Math.abs(right.range.line + 1 - sourceLine),
        )
        .map((row) => row.rowId ?? row.id)[0]
    : undefined;
  editorModeStatus.textContent = `源码 · 已在第 ${sourceLine} 行末插入 <br>`;
  closeSourceLineMenu();
  window.requestAnimationFrame(() => {
    if (revealEmbedLine) {
      if (addedEmbedRowKey) calibrationGrid.revealRow(addedEmbedRowKey);
      else calibrationGrid.revealSourceLine(sourceLine);
    }
    workingEditor.focusLine(sourceLine);
  });
});

sourceLineDelete.addEventListener("click", () => {
  const sourceLine = Number(sourceLineMenu.dataset.line);
  const chapter = actor.getSnapshot().context.chapter;
  if (
    !Number.isInteger(sourceLine)
    || sourceLine < 1
    || !chapter
    || chapter.kind === "translation"
  ) {
    closeSourceLineMenu();
    return;
  }

  const nextText = deleteSourceLine(chapter.workingText, sourceLine);
  if (nextText === chapter.workingText) {
    closeSourceLineMenu();
    return;
  }

  lastUiAction = "delete-current-source-line";
  lastCommandId = undefined;
  actor.send({ type: "WORKING_CHANGED", text: nextText });
  editorModeStatus.textContent = `源码 · 已删除第 ${sourceLine} 行`;
  closeSourceLineMenu();
  window.requestAnimationFrame(() => {
    workingEditor.focusLine(sourceLine);
  });
});

document.addEventListener("pointerdown", (event) => {
  if (sourceLineMenu.hidden) return;
  if (event.target instanceof Node && sourceLineMenu.contains(event.target)) return;
  closeSourceLineMenu();
}, true);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !sourceLineMenu.hidden) {
    closeSourceLineMenu();
  }
});
let tablePresentationEditor: TablePresentationEditor | undefined;
let tableConfigurationGrid: TableConfigurationGrid | undefined;
let configGridMode = false;
const chapterElementModules = new Set<ActiveReviewModule>([
  "章节标题",
  "注释",
  "嵌入块",
  "非法断行",
  "媒体",
]);
const translationElementModules = new Set<ActiveReviewModule>([
  "文本块",
  "句子",
  "原文to译文",
  "译文to原文",
  "翻译服务",
]);

function setChapterElementMenuOpen(open: boolean): void {
  chapterElementMenu.hidden = !open;
  chapterElementTab.setAttribute("aria-expanded", open ? "true" : "false");
}

function setTranslationElementMenuOpen(open: boolean): void {
  translationElementMenu.hidden = !open;
  translationElementTab.setAttribute("aria-expanded", open ? "true" : "false");
}

function syncChapterElementTabState(): void {
  const view = deriveWorkspaceView(actor.getSnapshot());
  const active = !configGridMode
    && chapterElementModules.has(view.activeReviewModule);
  chapterElementTab.textContent = active
    ? `${view.activeReviewModule} ▾`
    : "章节元素 ▾";
  chapterElementTab.setAttribute("aria-pressed", active ? "true" : "false");
}

function syncTranslationElementTabState(): void {
  const view = deriveWorkspaceView(actor.getSnapshot());
  const active = !configGridMode
    && translationElementModules.has(view.activeReviewModule);
  translationElementTab.textContent = active
    ? `trans 翻译/${view.activeReviewModule} ▾`
    : "trans 翻译 ▾";
  translationElementTab.setAttribute("aria-pressed", active ? "true" : "false");
}

function syncTranslationServiceWorkspaceLayout(): void {
  const snapshot = actor.getSnapshot();
  const view = deriveWorkspaceView(snapshot);
  const serviceActive = !configGridMode
    && view.activeReviewModule === "翻译服务"
    && snapshot.context.chapter?.kind === "translation";
  const readingActive = !configGridMode
    && (view.activeReviewModule === "原文to译文" || view.activeReviewModule === "译文to原文")
    && snapshot.context.chapter?.kind === "translation";
  cleaningWorkspace.classList.toggle("translation-service-layout", serviceActive);
  editorPane.classList.toggle("translation-reading-layout", readingActive);
  workspaceSplitter.hidden = serviceActive;
  editorPane.hidden = serviceActive;
}

function setConfigGridMode(enabled: boolean): void {
  configGridMode = enabled;
  const currentView = deriveWorkspaceView(actor.getSnapshot());
  const serviceActive = currentView.activeReviewModule === "翻译服务"
    && actor.getSnapshot().context.chapter?.kind === "translation";
  calibrationGridHost.hidden = enabled || serviceActive || mineruAuditVisible;
  translationServicePanelHost.hidden = enabled || !serviceActive;
  tableConfigGridHost.hidden = !enabled;
  configModuleTab.setAttribute("aria-pressed", enabled ? "true" : "false");
  syncChapterElementTabState();
  syncTranslationElementTabState();
  syncTranslationServiceWorkspaceLayout();
  syncSentenceTranslationUi();
  if (enabled) {
    setChapterElementMenuOpen(false);
    setTranslationElementMenuOpen(false);
    for (const button of reviewModuleButtons) {
      button.setAttribute("aria-pressed", "false");
    }
    reviewGridStatus.textContent =
      "配置 · " + (tableConfigurationGrid?.rowCount() ?? 0)
      + " 项 · 点击行定位 JSON";
    return;
  }

  const activeModule = deriveWorkspaceView(actor.getSnapshot()).activeReviewModule;
  for (const button of reviewModuleButtons) {
    button.setAttribute(
      "aria-pressed",
      button.dataset.reviewModule === activeModule ? "true" : "false",
    );
  }
  syncChapterElementTabState();
  syncTranslationElementTabState();
}

function syncRegexSearchTarget(mode = sourcePaneMode): void {
  if (mode === "css") {
    regexSearchTarget.textContent = "当前：自定义 CSS";
    sourceRegexSearch.updateTarget(
      customCssEditor.source(),
      ({ from, to }) => customCssEditor.revealOffsets(from, to, false),
      () => customCssEditor.source(),
      (matches, currentIndex) =>
        customCssEditor.setRegexMatches(matches, currentIndex),
    );
    return;
  }

  if (mode === "table-config") {
    regexSearchTarget.textContent = "当前：配置";
    sourceRegexSearch.updateTarget(
      tablePresentationEditor?.source() ?? "",
      ({ from, to }) => tablePresentationEditor?.revealOffsets(from, to, false),
      () => tablePresentationEditor?.source() ?? "",
      (matches, currentIndex) =>
        tablePresentationEditor?.setRegexMatches(matches, currentIndex),
    );
    return;
  }

  regexSearchTarget.textContent = "当前：源码";
  sourceRegexSearch.updateTarget(
    workingEditor.getText(),
    ({ from, to }) => workingEditor.revealOffsets(from, to, false),
    () => workingEditor.getText(),
    (matches, currentIndex) =>
      workingEditor.setRegexMatches(matches, currentIndex),
  );
}

function setRegexSearchOpen(open: boolean, focusInput = false): void {
  regexSearchOpen = open;
  regexSearchPanel.hidden = !open;
  regexSearchToggle.setAttribute("aria-expanded", open ? "true" : "false");
  if (!open) sourceRegexSearch.clearHighlight();
  if (open) {
    syncRegexSearchTarget();
    if (focusInput) requestAnimationFrame(() => regexSearchInput.focus());
  }
}

function setSourcePaneMode(mode: SourcePaneMode): void {
  if (mode !== "source") closeSourceLineMenu();
  sourcePaneMode = mode;
  setConfigGridMode(mode === "table-config");

  const tabs: Array<[HTMLButtonElement, SourcePaneMode]> = [
    [sourceEditorTab, "source"],
    [cssEditorTab, "css"],
    [tableConfigEditorTab, "table-config"],
  ];
  for (const [tab, tabMode] of tabs) {
    tab.setAttribute("aria-selected", tabMode === mode ? "true" : "false");
  }

  workingEditorHost.hidden = mode !== "source";
  customCssWrap.hidden = mode !== "css";
  tableConfigWrap.hidden = mode !== "table-config";

  editorPreviewSplitter.setAttribute(
    "aria-label",
    mode === "css"
      ? "调整自定义 CSS 与预览高度"
      : mode === "table-config"
        ? "调整配置与预览高度"
        : "调整源码与预览高度",
  );

  if (regexSearchOpen) syncRegexSearchTarget(mode);

  if (mode === "source") {
    editorModeStatus.textContent = "源码";
    requestAnimationFrame(() => workingEditor.focus());
  } else if (mode === "css") {
    editorModeStatus.textContent = "自定义 CSS · 修改后实时预览";
    requestAnimationFrame(() => customCssEditor.focus());
  } else {
    editorModeStatus.textContent = "配置 · 修改后实时预览";
    requestAnimationFrame(() => tablePresentationEditor?.focus());
  }
}

sourceEditorTab.addEventListener("click", () => setSourcePaneMode("source"));
cssEditorTab.addEventListener("click", () => setSourcePaneMode("css"));
tableConfigEditorTab.addEventListener(
  "click",
  () => setSourcePaneMode("table-config"),
);
chapterElementTab.addEventListener("click", () => {
  if (chapterElementTab.disabled) return;
  setChapterElementMenuOpen(chapterElementMenu.hidden);
});
translationElementTab.addEventListener("click", () => {
  if (translationElementTab.disabled) return;
  setTranslationElementMenuOpen(translationElementMenu.hidden);
});
regexSearchToggle.addEventListener(
  "click",
  () => setRegexSearchOpen(!regexSearchOpen, !regexSearchOpen),
);
regexSearchClose.addEventListener(
  "click",
  () => setRegexSearchOpen(false),
);
configModuleTab.addEventListener(
  "click",
  () => setSourcePaneMode("table-config"),
);
document.addEventListener("pointerdown", (event) => {
  if (chapterElementMenu.hidden) return;
  if (
    event.target instanceof Node
    && chapterElementPicker.contains(event.target)
  ) {
    return;
  }
  setChapterElementMenuOpen(false);
}, true);
document.addEventListener("pointerdown", (event) => {
  if (translationElementMenu.hidden) return;
  if (
    event.target instanceof Node
    && translationElementPicker.contains(event.target)
  ) {
    return;
  }
  setTranslationElementMenuOpen(false);
}, true);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !chapterElementMenu.hidden) {
    setChapterElementMenuOpen(false);
    chapterElementTab.focus();
  }
  if (event.key === "Escape" && !translationElementMenu.hidden) {
    setTranslationElementMenuOpen(false);
    translationElementTab.focus();
  }
});
cssSaveButton.addEventListener("click", () => customCssEditor.save());
cssResetButton.addEventListener("click", () => customCssEditor.reset());
tableConfigSaveButton.addEventListener(
  "click",
  () => void tablePresentationEditor?.save(),
);
tableConfigResetButton.addEventListener(
  "click",
  () => void tablePresentationEditor?.reset(),
);
setSourcePaneMode("source");

type SentenceTranslateEndpointPayload = {
  error?: string;
  provider?: string;
  sentenceId?: string;
  skipped?: boolean;
  sentenceIds?: string[];
  translatedCount?: number;
  failedCount?: number;
  contextCharacters?: number;
  translationFile?: {
    fileName?: string;
    provider?: string;
    data?: unknown;
  };
};

function sentenceTranslationProgress(
  chapter: ChapterWorkspaceData,
  provider: string,
): { translated: number; total: number } {
  const rows = sentenceCandidates(chapter);
  return {
    translated: rows.filter(
      (row) => row.translationResults?.[provider]?.status === "已翻译",
    ).length,
    total: rows.length,
  };
}

function syncSentenceTranslationUi(
  chapter = actor.getSnapshot().context.chapter,
): void {
  const view = deriveWorkspaceView(actor.getSnapshot());
  const active = !configGridMode
    && chapter?.kind === "translation"
    && view.activeReviewModule === "句子";
  sentenceTranslateToolbar.hidden = !active;
  if (!active || chapter.kind !== "translation") return;

  const service = selectedTranslationService;
  const progress = sentenceTranslationProgress(chapter, service.id);
  const defaultStatus = !service.apiKeyConfigured
    ? "未配置 API Key"
    : progress.total > 0 && progress.translated === progress.total
      ? "已完成"
      : "已配置 · 待翻译";
  const serviceStatus = sentenceTranslationServiceStatus.get(service.id)
    ?? defaultStatus;
  sentenceTranslateButton.textContent = `${service.label} 翻译`;
  sentenceTranslateButton.disabled = sentenceTranslationRunning
    || !service.apiKeyConfigured
    || progress.total === 0
    || progress.translated === progress.total;
  reviewGridStatus.textContent =
    `已翻 ${progress.translated}/${progress.total} · ${service.label} · ${serviceStatus}`;
}

function refreshSentenceTranslationGrid(chapter: ChapterWorkspaceData): void {
  const view = deriveWorkspaceView(actor.getSnapshot());
  if (chapter.kind !== "translation" || !isSentenceBackedTranslationModule(view.activeReviewModule)) return;
  calibrationGrid.setContext(
    sentenceCandidates(chapter),
    chapter.workingText,
    "句子",
    view.headingNumberingEnabled,
    chapter.annotationPairs ?? [],
  );
}

function sourceToTranslationProvider(
  chapter: ChapterWorkspaceData,
): { id: string; label: string; translated: number; total: number } {
  const rows = sentenceCandidates(chapter);
  const total = rows.length;
  const providers = effectiveSentenceTranslations(chapter).map((file) => ({
    id: file.provider,
    label: sentenceProviderLabel(file.provider, file.label),
    translated: rows.filter(
      (row) => row.translationResults?.[file.provider]?.status === "已翻译",
    ).length,
    total,
  }));
  providers.sort((left, right) =>
    right.translated - left.translated
    || Number(right.id === selectedTranslationService.id)
      - Number(left.id === selectedTranslationService.id)
    || left.label.localeCompare(right.label));
  return providers[0] ?? {
    id: selectedTranslationService.id,
    label: selectedTranslationService.label,
    translated: 0,
    total,
  };
}

function syncSourceToTranslationPreview(
  chapter = actor.getSnapshot().context.chapter,
): void {
  const view = deriveWorkspaceView(actor.getSnapshot());
  if (
    chapter?.kind !== "translation"
    || view.activeReviewModule !== "原文to译文"
  ) return;
  const provider = sourceToTranslationProvider(chapter);
  reviewGridStatus.textContent =
    `原文to译文 · ${provider.label} ${provider.translated}/${provider.total}`;
  markdownPreview.renderTranslationDocument(
    chapter.workingText,
    chapter.translationSourceChapterId,
    sentenceCandidates(chapter).map((row) => {
      const result = row.translationResults?.[provider.id];
      const translatedText = result?.status === "已翻译" && result.translatedText
        ? restoreProtectedMarkdown(
            result.translatedText,
            row.translationProtection ?? [],
          )
        : undefined;
      const sourceLine = chapter.workingText.replace(/\r\n?/g, "\n").split("\n")[row.range.line] ?? "";
      return {
        id: row.id,
        sourceText: row.raw,
        translatedText,
        providerLabel: provider.label,
        range: { ...row.range },
        domOnly: row.lineType === "内嵌" && /<[^>]+>/.test(sourceLine),
      };
    }),
  );
}

function syncTranslationToSourcePreview(
  chapter = actor.getSnapshot().context.chapter,
): void {
  const view = deriveWorkspaceView(actor.getSnapshot());
  if (
    chapter?.kind !== "translation"
    || view.activeReviewModule !== "译文to原文"
  ) return;
  const provider = sourceToTranslationProvider(chapter);
  reviewGridStatus.textContent =
    `译文to原文 · ${provider.label} ${provider.translated}/${provider.total}`;
  markdownPreview.renderTranslatedDocument(
    chapter.workingText,
    chapter.translationSourceChapterId,
    sentenceCandidates(chapter).map((row) => {
      const result = row.translationResults?.[provider.id];
      const translatedText = result?.status === "已翻译" && result.translatedText
        ? restoreProtectedMarkdown(
            result.translatedText,
            row.translationProtection ?? [],
          )
        : undefined;
      const sourceLine = chapter.workingText.replace(/\r\n?/g, "\n").split("\n")[row.range.line] ?? "";
      return {
        id: row.id,
        sourceText: row.raw,
        translatedText,
        range: { ...row.range },
        domOnly: row.lineType === "内嵌" && /<[^>]+>/.test(sourceLine),
      };
    }),
  );
}

async function sentenceTranslateResponse(
  response: Response,
): Promise<SentenceTranslateEndpointPayload> {
  try {
    return await response.json() as SentenceTranslateEndpointPayload;
  } catch {
    return {};
  }
}

async function translatePendingSentences(): Promise<void> {
  if (sentenceTranslationRunning) return;
  const snapshot = actor.getSnapshot();
  const view = deriveWorkspaceView(snapshot);
  const chapter = snapshot.context.chapter;
  if (
    chapter?.kind !== "translation"
    || view.activeReviewModule !== "句子"
    || !chapter.translationSourceChapterId
  ) return;

  const service = { ...selectedTranslationService };
  if (!service.apiKeyConfigured) {
    sentenceTranslationServiceStatus.set(service.id, "未配置 API Key");
    syncSentenceTranslationUi(chapter);
    return;
  }
  const source = chapter.sentenceSource
    ?? buildSentenceSourceFile(chapter.workingText, chapter.path);
  if (!source.entries.length) {
    sentenceTranslationServiceStatus.set(service.id, "没有可翻译句子");
    syncSentenceTranslationUi(chapter);
    return;
  }

  sentenceTranslationRunning = true;
  const runToken = ++sentenceTranslationRunToken;
  sentenceTranslationServiceStatus.set(service.id, "准备翻译…");
  syncSentenceTranslationUi(chapter);

  try {
    if (service.id === "deepl") {
      const batchSize = 16;
      while (true) {
        const currentSnapshot = actor.getSnapshot();
        const currentChapter = currentSnapshot.context.chapter;
        if (
          runToken !== sentenceTranslationRunToken
          || currentChapter?.id !== chapter.id
          || currentSnapshot.context.activeReviewModule !== "句子"
          || selectedTranslationService.id !== service.id
        ) {
          sentenceTranslationServiceStatus.set(service.id, "已暂停 · 离开句子模块或切换服务");
          break;
        }

        const currentRows = new Map(
          sentenceCandidates(chapter).map((row) => [row.id, row]),
        );
        const pending = source.entries.filter(
          (sentence) =>
            currentRows.get(sentence.id)?.translationResults?.[service.id]?.status !== "已翻译",
        );
        if (!pending.length) break;
        const batch = pending.slice(0, batchSize);
        const before = sentenceTranslationProgress(chapter, service.id);
        sentenceTranslationServiceStatus.set(
          service.id,
          `批量翻译中 · ${batch.length} 句/批 · 已完成 ${before.translated}/${before.total}`,
        );
        syncSentenceTranslationUi(chapter);

        const response = await fetch("/__workspace/translation-services/translate-batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            provider: service.id,
            chapterId: chapter.translationSourceChapterId,
            sentenceIds: batch.map((sentence) => sentence.id),
          }),
        });
        const payload = await sentenceTranslateResponse(response);
        const translationFile = payload.translationFile;
        if (translationFile?.data) {
          updateSentenceTranslationCache(
            chapter,
            translationFile.provider ?? service.id,
            translationFile.data,
          );
          refreshSentenceTranslationGrid(chapter);
        }
        if (!response.ok) {
          throw new Error(payload.error || `翻译失败 · HTTP ${response.status}`);
        }
        const after = sentenceTranslationProgress(chapter, service.id);
        sentenceTranslationServiceStatus.set(
          service.id,
          after.translated === after.total
            ? "已完成"
            : `批量翻译中 · 已完成 ${after.translated}/${after.total}`,
        );
        syncSentenceTranslationUi(chapter);
      }
    } else {
          for (const sentence of source.entries) {
            const currentSnapshot = actor.getSnapshot();
            const currentChapter = currentSnapshot.context.chapter;
            if (
              runToken !== sentenceTranslationRunToken
              || currentChapter?.id !== chapter.id
              || currentSnapshot.context.activeReviewModule !== "句子"
              || selectedTranslationService.id !== service.id
            ) {
              sentenceTranslationServiceStatus.set(service.id, "已暂停 · 离开句子模块或切换服务");
              break;
            }

            const currentRow = sentenceCandidates(chapter).find((row) => row.id === sentence.id);
            if (currentRow?.translationResults?.[service.id]?.status === "已翻译") continue;

            const before = sentenceTranslationProgress(chapter, service.id);
            sentenceTranslationServiceStatus.set(
              service.id,
              `翻译中 · 第 ${Math.min(before.translated + 1, before.total)}/${before.total} 句`,
            );
            syncSentenceTranslationUi(chapter);

            const response = await fetch("/__workspace/translation-services/translate-sentence", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              cache: "no-store",
              body: JSON.stringify({
                provider: service.id,
                chapterId: chapter.translationSourceChapterId,
                sentenceId: sentence.id,
              }),
            });
            const payload = await sentenceTranslateResponse(response);
            const translationFile = payload.translationFile;
            if (translationFile?.data) {
              updateSentenceTranslationCache(
                chapter,
                translationFile.provider ?? service.id,
                translationFile.data,
              );
              refreshSentenceTranslationGrid(chapter);
            }
            if (!response.ok) {
              throw new Error(payload.error || `翻译失败 · HTTP ${response.status}`);
            }
            const after = sentenceTranslationProgress(chapter, service.id);
            sentenceTranslationServiceStatus.set(
              service.id,
              after.translated === after.total
                ? "已完成"
                : `翻译中 · 已完成 ${after.translated}/${after.total}`,
            );
            syncSentenceTranslationUi(chapter);
          }
    }
    const progress = sentenceTranslationProgress(chapter, service.id);
    if (runToken === sentenceTranslationRunToken && progress.translated === progress.total) {
      sentenceTranslationServiceStatus.set(service.id, "已完成");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sentenceTranslationServiceStatus.set(service.id, `失败 · ${message}`);
  } finally {
    if (runToken === sentenceTranslationRunToken) {
      sentenceTranslationRunning = false;
    }
    refreshSentenceTranslationGrid(chapter);
    syncSentenceTranslationUi(chapter);
  }
}

sentenceTranslateButton.addEventListener("click", () => {
  void translatePendingSentences();
});

function mediaReferenceMarkdown(row: Candidate): string | undefined {
  if (row.mediaPath) return `![[${row.mediaPath}]]`;
  if (row.mediaSourceUrl) return `![](${row.mediaSourceUrl})`;
  return undefined;
}

function beginMediaSourceDrag(row: Candidate, startEvent: PointerEvent): void {
  const snapshot = actor.getSnapshot();
  const view = deriveWorkspaceView(snapshot);
  const chapter = snapshot.context.chapter;
  const markdown = mediaReferenceMarkdown(row);
  if (!view.canEdit || chapter?.kind !== "chapter" || !markdown) {
    sourceLocationStatus.textContent = "媒体拖放失败 · 当前媒体不可插入";
    return;
  }

  const targetLine = workingEditor.selectionLine();
  setSourcePaneMode("source");

  const ghost = document.createElement("div");
  ghost.className = "media-drag-ghost";
  ghost.textContent = row.raw;
  document.body.append(ghost);
  workingEditorHost.classList.add("is-media-drop-target");
  editorModeStatus.textContent = `源码 · 拖动媒体到高亮第 ${targetLine} 行`;

  const pointerId = startEvent.pointerId;
  let dropReady = false;
  const updatePosition = (clientX: number, clientY: number) => {
    ghost.style.left = `${clientX + 14}px`;
    ghost.style.top = `${clientY + 14}px`;
    const rect = workingEditorHost.getBoundingClientRect();
    dropReady = !workingEditorHost.hidden
      && clientX >= rect.left
      && clientX <= rect.right
      && clientY >= rect.top
      && clientY <= rect.bottom;
    workingEditorHost.classList.toggle("is-media-drop-ready", dropReady);
  };
  updatePosition(startEvent.clientX, startEvent.clientY);

  const cleanup = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
    workingEditorHost.classList.remove("is-media-drop-target", "is-media-drop-ready");
    ghost.remove();
  };
  const onMove = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) return;
    event.preventDefault();
    updatePosition(event.clientX, event.clientY);
  };
  const finish = (event: PointerEvent, cancelled: boolean) => {
    if (event.pointerId !== pointerId) return;
    updatePosition(event.clientX, event.clientY);
    const shouldInsert = !cancelled && dropReady;
    cleanup();
    if (!shouldInsert) {
      editorModeStatus.textContent = `源码 · 已取消媒体拖放 · 第 ${targetLine} 行未修改`;
      window.requestAnimationFrame(() => workingEditor.focusLine(targetLine));
      return;
    }

    const insertedLine = workingEditor.insertMediaReferenceAtLine(targetLine, markdown);
    lastUiAction = "insert-media-reference";
    lastCommandId = undefined;
    editorModeStatus.textContent = `源码 · 已在第 ${insertedLine} 行插入媒体 · ${row.raw}`;
    sourceLocationStatus.textContent = `媒体已插入：${markdown}`;
  };
  const onUp = (event: PointerEvent) => finish(event, false);
  const onCancel = (event: PointerEvent) => finish(event, true);

  window.addEventListener("pointermove", onMove, { passive: false });
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onCancel);
}

const translationServicePanel = new TranslationServicePanel(
  translationServicePanelHost,
  (selection) => {
    if (
      sentenceTranslationRunning
      && selection.id !== selectedTranslationService.id
    ) {
      sentenceTranslationRunToken += 1;
      sentenceTranslationRunning = false;
      sentenceTranslationServiceStatus.set(
        selectedTranslationService.id,
        "已暂停 · 已切换翻译服务",
      );
    }
    selectedTranslationService = selection;
    syncSentenceTranslationUi();
    syncSourceToTranslationPreview();
  },
);

const calibrationGrid = new CalibrationGrid(
  calibrationGridHost,
  applyCalibrationLineTypeChange,
  (rowId, value) => {
    lastUiAction = "chapter-file";
    lastCommandId = undefined;
    actor.send({ type: "CHAPTER_FILE_CHANGED", rowId, value });
  },
  (rowId, standalone) => {
    lastUiAction = "chapter-standalone";
    lastCommandId = undefined;
    actor.send({ type: "CHAPTER_STANDALONE_CHANGED", rowId, standalone });
  },
  (row, located, activation = "row") => {
    if (activation === "media") {
      const chapter = actor.getSnapshot().context.chapter;
      if (
        chapter?.kind !== "chapter"
        || (!row.mediaPath && !row.mediaSourceUrl)
      ) {
        sourceLocationStatus.textContent = "媒体预览失败 · 文件不可用";
        return;
      }
      lastUiAction = "preview-media";
      lastCommandId = undefined;
      if (row.mediaPath) {
        markdownPreview.renderMedia(chapter.id, row.mediaPath, row.raw);
      } else if (row.mediaSourceUrl) {
        markdownPreview.renderMediaSource(row.mediaSourceUrl, row.raw);
      }
      sourceLocationStatus.textContent = `媒体预览：${row.raw}`;
      return;
    }
    if (!pendingCalibrationFocusCommandId) {
      lastUiAction = "focus-calibration-row";
      lastCommandId = undefined;
    }
    if (activation === "changed-deleted") {
      sourceLocationStatus.textContent = "该行已删除，无法定位到工作稿";
      return;
    }
    if (!located) {
      sourceLocationStatus.textContent =
        `源码定位失败 · ${row.typeLabel ?? "未知模块"} / ${row.lineType ?? "未知类型"}`;
      return;
    }
    setSourcePaneMode("source");
    const line = activation === "illegal-context"
      ? workingEditor.revealIllegalBreakContext(located)
      : workingEditor.revealRange(located);
    if (!line) {
      sourceLocationStatus.textContent = "源码定位失败 · 超出当前 working";
      return;
    }
    sourceLocationStatus.textContent = activation === "illegal-context"
      ? `已定位断行 · 第 ${line} 行 · 前后各 10 字`
      : `源码定位：第 ${line} 行`;
    actor.send({
      type: "CALIBRATION_ROW_FOCUSED",
      rowId: row.id,
      sourceLine: line,
    });
  },
  (row, event) => beginMediaSourceDrag(row, event),
  (mineru) => {
    const chapter = actor.getSnapshot().context.chapter;
    if (chapter?.kind !== "chapter") return;
    const targets = mineru.navigationTargets;
    if (!targets.length) {
      sourceLocationStatus.textContent =
        "PDF 第 " + mineru.pageNumber + " 页 · " + mineru.status
        + " · Markdown 引用位置尚未确认";
      return;
    }
    const offset = mineruBodyFocusIndex.get(mineru.rowId) ?? 0;
    const target = targets[offset % targets.length];
    if (target.chapterId + ".md" !== chapter.name) {
      sourceLocationStatus.textContent = "引用属于另一章节 · 拒绝跳转";
      return;
    }
    const located = locateMineruMarkdownReference(chapter.workingText, target);
    if (!located) {
      sourceLocationStatus.textContent =
        "Markdown 锚点已变化或存在多解 · 请重新匹配后再定位";
      return;
    }
    lastUiAction = "focus-mineru-annotation";
    lastCommandId = undefined;
    setSourcePaneMode("source");
    const line = workingEditor.revealRange(located);
    if (!line) {
      sourceLocationStatus.textContent = "Markdown 注释位置已失效";
      return;
    }
    mineruBodyFocusIndex.set(mineru.rowId, offset + 1);
    sourceLocationStatus.textContent =
      "PDF 第 " + mineru.pageNumber + " 页 · 注释 "
      + mineru.annotationNumber + " → MD 第 " + line + " 行"
      + (targets.length > 1 ? " · 共享引用 "
        + ((offset % targets.length) + 1) + "/" + targets.length
        + "（再次点击切换）" : "");
  },
);

function focusMineruAuditEvidence(
  target: MineruMarkdownLocator,
  item: MineruAuditRow,
): boolean {
  const chapter = actor.getSnapshot().context.chapter;
  if (chapter?.kind !== "chapter" || chapter.name !== target.chapterId + ".md") {
    sourceLocationStatus.textContent = "尚未打开该审计证据所属章节：" + target.chapterId;
    return false;
  }
  const located = locateMineruMarkdownReference(chapter.workingText, target);
  if (!located) {
    sourceLocationStatus.textContent = "原稿锚点已变化或重复，拒绝猜测 Markdown 位置";
    return false;
  }
  setSourcePaneMode("source");
  const line = workingEditor.revealRange(located);
  if (!line) {
    sourceLocationStatus.textContent = "无法定位 Markdown 引用";
    return false;
  }
  lastUiAction = "focus-mineru-audit";
  sourceLocationStatus.textContent =
    "审计 · " + item.kind + " · PDF 第 " + (item.pageNumber ?? "—")
    + " 页 → MD 第 " + line + " 行";
  return true;
}

const originalPdfPreview = requireElement<HTMLElement>("original-pdf-preview");
const originalPdfFrame = requireElement<HTMLIFrameElement>("original-pdf-frame");
const originalPdfLabel = requireElement<HTMLElement>("original-pdf-page-label");
const originalPdfNewTab = requireElement<HTMLAnchorElement>("original-pdf-new-tab");

function closeOriginalPdf(): void {
  originalPdfPreview.hidden = true;
  markdownPreviewHost.hidden = false;
  originalPdfFrame.removeAttribute("src");
  originalPdfNewTab.removeAttribute("href");
}

function openAuditOriginalPdf(item: MineruAuditRow, payload: MineruAuditPayload): void {
  const chapter = actor.getSnapshot().context.chapter;
  if (chapter?.kind !== "chapter") return;
  if (!payload.pdfAttachment?.available || !item.pdfPageNumber) {
    sourceLocationStatus.textContent =
      "不能确定原 PDF 页码：" + (payload.pdfAttachment?.reason ?? "缺少原 PDF");
    return;
  }
  const url = "/__workspace/original-pdf?chapterId="
    + encodeURIComponent(chapter.id) + "#page=" + item.pdfPageNumber;
  setSourcePaneMode("source");
  originalPdfPreview.hidden = false;
  markdownPreviewHost.hidden = true;
  originalPdfFrame.src = url;
  originalPdfNewTab.href = url;
  originalPdfLabel.textContent =
    "原文附件 · 全书 PDF 第 " + item.pdfPageNumber
    + " / " + payload.pdfAttachment.pageCount
    + " 页 · 请在上方 MD 工作稿中修正";
  sourceLocationStatus.textContent =
    "原 PDF 第 " + item.pdfPageNumber + " 页 · "
    + item.kind + " · " + item.summary;
}

requireElement<HTMLButtonElement>("original-pdf-close")
  .addEventListener("click", closeOriginalPdf);

const mineruAuditPanel = new MineruAuditPanel({
  onInspectPdf: openAuditOriginalPdf,
  onVisibleChange: (visible) => {
    mineruAuditVisible = visible;
    calibrationGridHost.hidden = visible || configGridMode;
    reviewGridStatus.textContent = visible
      ? "注释审计 · 全书异常列表（点击行查看原文附件）"
      : mineruAnnotationStatusText();
  },
  onLocate: (target, item) => {
    closeOriginalPdf();
    const current = actor.getSnapshot().context.chapter;
    if (current?.kind === "chapter" && current.name === target.chapterId + ".md") {
      if (focusMineruAuditEvidence(target, item)) mineruAuditPanel.close();
      return;
    }
    const view = deriveWorkspaceView(actor.getSnapshot());
    if (view.session === "chapter-dirty") {
      sourceLocationStatus.textContent = "当前工作稿未保存，先保存再切换章节";
      return;
    }
    const other = view.chapters.find((chapter) =>
      chapter.ready && chapter.name === target.chapterId);
    if (!other) {
      sourceLocationStatus.textContent = "引用章节不可打开：" + target.chapterId;
      return;
    }
    pendingAuditNavigation = { target, evidence: item };
    mineruAuditPanel.close();
    executeProductAction("open-chapter", undefined, other.id);
  },
  onCountChange: (payload) => {
    if (mineruActiveKey) displayMineruAuditCount(payload);
  },
});
mineruAuditOpenButton.addEventListener("click", () => {
  if (mineruAuditPanel.isOpen) {
    mineruAuditPanel.close();
    return;
  }
  const chapter = actor.getSnapshot().context.chapter;
  if (chapter?.kind !== "chapter") return;
  void mineruAuditPanel.open(chapter.id);
});

tableConfigurationGrid = new TableConfigurationGrid(
  tableConfigGridHost,
  (descriptor) => {
    setSourcePaneMode("table-config");
    tablePresentationEditor?.revealSetting(descriptor);
  },
  (descriptor, checked) => {
    tablePresentationEditor?.updateBooleanSetting(descriptor, checked);
  },
);

tablePresentationEditor = new TablePresentationEditor(
  tableConfigEditorHost,
  (resolved, sourceEditor, config) => {
    calibrationGrid.setPresentationConfig(resolved);
    workingEditor.setShowHardReturns(sourceEditor.showHardReturns);
    workingEditor.setHardReturnColor(sourceEditor.hardReturnColor);
    tableConfigurationGrid?.setConfig(config);
  },
  (text) => {
    if (sourcePaneMode === "table-config") {
      editorModeStatus.textContent = text;
    }
  },
);
void tablePresentationEditor.load();

pageLoadedAt.textContent = getPageLoadedAtDisplay();

function closeWorkspaceDirectoryBrowser(): void {
  workspaceDirectoryOverlay.hidden = true;
  workspaceDirectoryButton.setAttribute("aria-expanded", "false");
}

function renderWorkspaceDirectoryBreadcrumb(payload: WorkspaceDirectoryPayload): void {
  workspaceDirectoryBreadcrumb.replaceChildren();
  const parts = payload.path ? payload.path.split("/").filter(Boolean) : [];
  const crumbs: Array<{ label: string; path: string }> = [{ label: "/data", path: "" }];
  let accumulated = "";
  for (const part of parts) {
    accumulated = accumulated ? `${accumulated}/${part}` : part;
    crumbs.push({ label: part, path: accumulated });
  }
  crumbs.forEach((crumb, index) => {
    if (index > 0) {
      const separator = document.createElement("span");
      separator.textContent = "/";
      separator.setAttribute("aria-hidden", "true");
      workspaceDirectoryBreadcrumb.append(separator);
    }
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = crumb.label;
    button.disabled = crumb.path === payload.path;
    button.addEventListener("click", () => {
      void loadWorkspaceDirectory(crumb.path, true);
    });
    workspaceDirectoryBreadcrumb.append(button);
  });
}

function renderWorkspaceDirectory(payload: WorkspaceDirectoryPayload): void {
  workspaceDirectoryPayload = payload;
  workspaceDirectoryButton.textContent = `${payload.currentProjectDisplayPath} ▾`;
  workspaceDirectoryButton.title = `当前工作目录：${payload.currentProjectDisplayPath}`;
  workspaceDirectoryCurrent.textContent = `当前工作目录：${payload.currentProjectDisplayPath}`;
  workspaceDirectoryPath.textContent = payload.displayPath;
  workspaceDirectoryParent.disabled = payload.parentPath == null;
  workspaceDirectorySelect.disabled = payload.path === payload.currentProjectPath;
  renderWorkspaceDirectoryBreadcrumb(payload);
  workspaceDirectoryList.replaceChildren();
  if (!payload.directories.length) {
    const empty = document.createElement("div");
    empty.className = "status-secondary";
    empty.textContent = "此目录没有子目录";
    workspaceDirectoryList.append(empty);
    return;
  }
  for (const directory of payload.directories) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "workspace-directory-entry";
    button.setAttribute("role", "listitem");
    const label = document.createElement("span");
    label.textContent = `📁 ${directory.name}`;
    button.append(label);
    if (directory.hasChapters) {
      const marker = document.createElement("small");
      marker.textContent = "ocr2md";
      button.append(marker);
    }
    button.addEventListener("click", () => {
      void loadWorkspaceDirectory(directory.path, true);
    });
    workspaceDirectoryList.append(button);
  }
}

async function workspaceDirectoryError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = await response.json() as { error?: string };
    return payload.error || fallback;
  } catch {
    return fallback;
  }
}

async function loadWorkspaceDirectory(path = "", reveal = false): Promise<void> {
  if (workspaceDirectoryLoading) return;
  workspaceDirectoryLoading = true;
  workspaceDirectoryStatus.textContent = "正在读取目录…";
  workspaceDirectoryParent.disabled = true;
  workspaceDirectorySelect.disabled = true;
  try {
    const response = await fetch(
      `/__workspace/directories?path=${encodeURIComponent(path)}`,
      { cache: "no-store" },
    );
    if (!response.ok) {
      throw new Error(await workspaceDirectoryError(response, "读取工作目录失败"));
    }
    const payload = await response.json() as WorkspaceDirectoryPayload;
    renderWorkspaceDirectory(payload);
    workspaceDirectoryStatus.textContent = payload.path === payload.currentProjectPath
      ? "当前浏览目录就是工作目录"
      : "可进入子目录，或将当前目录设为工作目录";
    if (reveal) {
      workspaceDirectoryOverlay.hidden = false;
      workspaceDirectoryButton.setAttribute("aria-expanded", "true");
    }
  } catch (error) {
    workspaceDirectoryStatus.textContent = error instanceof Error
      ? error.message
      : "读取工作目录失败";
    if (reveal) {
      workspaceDirectoryOverlay.hidden = false;
      workspaceDirectoryButton.setAttribute("aria-expanded", "true");
    }
  } finally {
    workspaceDirectoryLoading = false;
    if (workspaceDirectoryPayload) {
      workspaceDirectoryParent.disabled = workspaceDirectoryPayload.parentPath == null;
      workspaceDirectorySelect.disabled =
        workspaceDirectoryPayload.path === workspaceDirectoryPayload.currentProjectPath;
    }
  }
}

async function switchWorkspaceDirectory(): Promise<void> {
  const payload = workspaceDirectoryPayload;
  if (!payload || workspaceDirectoryLoading) return;
  const view = deriveWorkspaceView(actor.getSnapshot());
  if (
    view.canSave
    || view.session === "chapter-dirty"
    || sentenceTranslationRunning
    || mediaDownloadRunning
  ) {
    workspaceDirectoryStatus.textContent =
      "当前工作稿有未保存修改或任务正在运行 · 请先保存/撤销并结束任务后再切换工作目录";
    return;
  }
  workspaceDirectoryLoading = true;
  workspaceDirectorySelect.disabled = true;
  workspaceDirectoryStatus.textContent = `正在切换到 ${payload.displayPath}…`;
  try {
    const response = await fetch("/__workspace/project-directory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ path: payload.path }),
    });
    if (!response.ok) {
      throw new Error(await workspaceDirectoryError(response, "切换工作目录失败"));
    }
    const switched = await response.json() as WorkspaceDirectoryPayload;
    workspaceDirectoryButton.textContent = `${switched.currentProjectDisplayPath} ▾`;
    workspaceDirectoryStatus.textContent = "工作目录已切换 · 正在重新载入工作台";
    window.location.reload();
  } catch (error) {
    workspaceDirectoryStatus.textContent = error instanceof Error
      ? error.message
      : "切换工作目录失败";
    workspaceDirectoryLoading = false;
    workspaceDirectorySelect.disabled = false;
  }
}

function reportCurrentState(): void {
  reportDebugState(
    deriveWorkspaceView(actor.getSnapshot()),
    lastUiAction,
    lastCommandId,
  );
}

function renderChapterSelect(view: ReturnType<typeof deriveWorkspaceView>): void {
  const nextSignature = JSON.stringify({
    projectName: view.projectName ?? "",
    chapters: view.chapters.map((chapter) => [
      chapter.id,
      chapter.name,
      chapter.ready,
      chapter.reason ?? "",
      chapter.transReady === true,
    ]),
  });

  if (nextSignature !== catalogSignature) {
    catalogSignature = nextSignature;
    const root = document.createElement("option");
    root.value = "";
    root.textContent = view.projectName
      ? "工作目录 · " + view.projectName
      : "正在接入工作目录…";
    root.disabled = true;
    chapterSelect.replaceChildren(root);

    const ocrNode = document.createElement("option");
    ocrNode.value = "__node_ocr__";
    ocrNode.textContent = "ocr";
    ocrNode.disabled = !view.boundaryReady;
    chapterSelect.append(ocrNode);

    const chaptersNode = document.createElement("option");
    chaptersNode.value = "__node_chapters__";
    chaptersNode.textContent = "chapters";
    chaptersNode.disabled = !view.chapters.some((chapter) => chapter.ready);
    chapterSelect.append(chaptersNode);

    for (const chapter of view.chapters) {
      const option = document.createElement("option");
      option.value = chapter.id;
      option.disabled = !chapter.ready;
      option.textContent = chapter.ready
        ? "chapters/" + chapter.name
        : "chapters/" + chapter.name + " · " + (chapter.reason ?? "不可用");
      chapterSelect.append(option);

      if (chapter.transReady) {
        const transOption = document.createElement("option");
        transOption.value = `__node_trans_${chapter.id}__`;
        transOption.textContent = "\u3000\u3000└─ trans";
        transOption.disabled = false;
        chapterSelect.append(transOption);
      }
    }
  }

  chapterSelect.disabled = !view.canSelectChapter || mediaDownloadRunning;
  chapterSelect.value =
    view.workspaceKind === "boundary"
      ? "__node_ocr__"
      : view.workspaceKind === "translation" && view.selectedChapterId
        ? `__node_trans_${view.selectedChapterId}__`
      : view.workspaceKind === "chapter" && view.selectedChapterId
        ? view.selectedChapterId
        : "";

  const selected = view.chapters.find(
    (chapter) => chapter.id === view.selectedChapterId,
  );
  const inChapter = view.workspaceKind === "chapter" && selected;
  const inBoundary = view.workspaceKind === "boundary";
  const inTranslation = view.workspaceKind === "translation" && selected;
  chapterSelectionStatus.hidden = Boolean(inChapter || inBoundary || inTranslation);
  chapterSelectionStatus.textContent = inChapter || inBoundary || inTranslation
    ? ""
    : "工作目录 · "
      + (view.projectName ?? "—")
      + " · chapters "
      + String(view.chapters.filter((chapter) => chapter.ready).length)
      + "/"
      + String(view.chapters.length);
}

actor.subscribe((snapshot) => {
  const view = deriveWorkspaceView(snapshot);
  const chapter = snapshot.context.chapter;
  const nextMineruKey = mineruChapterEntryKey(chapter, view);
  if (nextMineruKey !== mineruActiveKey) {
    mineruActiveKey = nextMineruKey;
    const token = ++mineruLoadToken;
    mineruAnnotationPayload = undefined;
    mineruAnnotationError = "";
    mineruAnnotationLoading = Boolean(nextMineruKey);
    mineruBodyFocusIndex.clear();
    mineruAuditOpenButton.textContent = "注释审计";
    mineruAuditPanel?.close();
    closeOriginalPdf();
    if (nextMineruKey && chapter) {
      void loadMineruAnnotations(chapter.id, nextMineruKey, token);
    }
  }
  if (sentenceCacheWorkspaceKind === "translation" && chapter?.kind !== "translation") {
    sentenceTranslationCache.clear();
    sentenceTranslationDiskRefreshSignature = "";
    sentenceTranslationDiskRefreshChapterId = "";
  }
  sentenceCacheWorkspaceKind = chapter?.kind;

  // XState is the business truth. Report it before CodeMirror/AG Grid/DOM
  // projection work so remote control ACKs do not depend on mobile render cost.
  void reportDebugState(view, lastUiAction, lastCommandId);

  workingEditor.setDocument(chapter?.workingText ?? "");
  if (pendingAuditNavigation && chapter?.kind === "chapter"
    && chapter.name === pendingAuditNavigation.target.chapterId + ".md") {
    const requested = pendingAuditNavigation;
    pendingAuditNavigation = undefined;
    window.requestAnimationFrame(() => focusMineruAuditEvidence(
      requested.target, requested.evidence,
    ));
  }
  workingEditor.setEditable(Boolean(chapter) && view.canEdit && !mediaDownloadRunning);
  if (chapter?.kind === "translation" && view.activeReviewModule === "原文to译文") {
    syncSourceToTranslationPreview(chapter);
  } else if (chapter?.kind === "translation" && view.activeReviewModule === "译文to原文") {
    syncTranslationToSourcePreview(chapter);
  } else {
    markdownPreview.render(
      chapter?.workingText ?? "",
      chapter?.kind === "translation"
        ? chapter.translationSourceChapterId
        : chapter && chapter.kind !== "boundary"
          ? chapter.id
          : undefined,
      chapter?.workingText ?? "",
      chapter?.kind === "chapter"
        ? deriveAdoptedMediaRoutes(chapter)
        : undefined,
    );
  }
  if (!(chapter?.kind === "translation" && (view.activeReviewModule === "原文to译文" || view.activeReviewModule === "译文to原文"))) {
    sourcePreviewScrollSync.syncFromEditor();
  }
  if (sourcePaneMode === "source") {
    sourceRegexSearch.updateText(chapter?.workingText ?? "");
  }
  const translationServiceActive =
    view.activeReviewModule === "翻译服务" && chapter?.kind === "translation";
  translationServicePanel.setContext(chapter, translationServiceActive && !configGridMode);
  syncTranslationServiceWorkspaceLayout();
  calibrationGridHost.hidden =
    configGridMode || translationServiceActive || mineruAuditVisible;
  tableConfigGridHost.hidden = !configGridMode;
  const gridModule = view.activeReviewModule === "翻译服务"
    ? undefined
    : (view.activeReviewModule === "原文to译文" || view.activeReviewModule === "译文to原文")
      ? "句子"
      : view.activeReviewModule;
  if (gridModule) {
    calibrationGrid.setContext(
      gridModule === "媒体"
        ? mediaCandidates(chapter)
        : gridModule === "变动行"
          ? changedLineAuditCandidates(view.changedLineRows)
          : gridModule === "句子"
            ? sentenceCandidates(chapter)
            : chapter?.rows ?? [],
      chapter?.workingText ?? "",
      gridModule,
      view.headingNumberingEnabled,
      chapter?.annotationPairs ?? [],
      gridModule === "注释" && nextMineruKey
        ? currentMineruAnnotationRows()
        : undefined,
    );
    calibrationGrid.setEditable(
      Boolean(chapter) && view.canEdit && view.activeReviewModule !== "媒体"
      && !(gridModule === "注释" && nextMineruKey && currentMineruAnnotationRows() !== undefined),
    );
  }
  window.requestAnimationFrame(() => {
    reportDebugRuntime(
      "grid_projection_after_render",
      deviceDebugBridge.snapshot(),
    );
    window.setTimeout(() => {
      reportDebugRuntime(
        "grid_projection_after_render_settled",
        deviceDebugBridge.snapshot(),
      );
    }, 120);
  });

  stateValue.textContent = view.session;
  projectName.textContent = view.projectName ?? "—";
  renderChapterSelect(view);
  chapterPath.textContent = view.chapterPath ?? "—";
  chapterName.textContent = view.chapterName ?? "—";
  workingLines.textContent = view.workingLines?.toString() ?? "—";
  workingLength.textContent = view.workingLength?.toString() ?? "—";
  calibrationRows.textContent = view.calibrationRows?.toString() ?? "—";
  visibleCalibrationRows.textContent = view.visibleCalibrationRows?.toString() ?? "—";
  ignoredCalibrationRows.textContent = view.ignoredCalibrationRows?.toString() ?? "—";
  activeReviewModule.textContent = view.activeReviewModule;
  activeModuleRows.textContent = view.activeModuleRows.toString();
  syncChangedLineNotice(
    chapter?.kind === "chapter" ? chapter.id : undefined,
    view.activeReviewModule,
    view.changedLineRows,
  );
  focusedSourceLine.textContent = view.focusedSourceLine?.toString() ?? "—";
  annotationPairs.textContent = view.annotationPairs?.toString() ?? "—";
  annotationMatchStatus.textContent = chapter
    ? "标定 " + view.annotationCalibratedRows
      + " · 配对 " + view.annotationPairedCount
      + " · 缺引用 " + view.annotationMissingRefCount
      + " · 缺正文 " + view.annotationMissingBodyCount
      + " · 缺号 " + view.annotationMissingNumberCount
    : "—";
  embedGroupStatus.textContent = chapter
    ? "总计 " + view.embedTotalRows
      + " · 可见 " + view.embedVisibleRows
      + " · 组 " + view.embedGroupCount
      + " · 未分组 " + view.embedUnassignedRows
    : "—";
  boundarySelectionStatus.hidden =
    view.activeReviewModule !== "章节定界";
  boundarySelectionStatus.textContent = view.boundaryReady
    ? "OCR 输入 " + view.boundarySourceFileCount + " 个 · 可打开章节定界"
    : "章节定界不可用";
  boundaryStatus.textContent = chapter?.kind === "boundary"
    ? "OCR " + view.boundarySourceFileCount
      + " · 一级标题 " + view.boundaryHeadingCount
      + " · 独立章节 " + view.boundaryStandaloneHeadingCount
      + " · 归并标题 " + view.boundaryMergedHeadingCount
      + " · segments " + view.boundarySegmentCount
    : "OCR 输入 " + view.boundarySourceFileCount + " 个";
  translationStatus.textContent = chapter?.kind === "translation"
    ? `trans 工作稿 · ${view.activeReviewModule} ${view.activeModuleRows}`
    : "—";
  reviewGridStatus.textContent = chapter
    ? `${view.activeReviewModule} · ${view.activeModuleRows} 行`
    : "尚未打开章节";
  mineruAuditOpenButton.hidden = !nextMineruKey
    || (!mineruAnnotationPayload?.available && !mineruAnnotationError);
  if (nextMineruKey) {
    const status = mineruAnnotationStatusText();
    if (status) {
      reviewGridStatus.textContent = mineruAuditPanel.isOpen
        ? "注释审计 · 全书异常列表（点击行查看原文附件）"
        : status;
      annotationMatchStatus.textContent = status;
    }
  }
  const sentenceEntryKey =
    chapter?.kind === "translation"
    && isSentenceBackedTranslationModule(view.activeReviewModule)
    && !configGridMode
      ? `${sentenceTranslationCacheKey(chapter)}:${view.activeReviewModule}`
      : "";
  if (sentenceEntryKey) {
    syncSentenceTranslationUi(chapter);
    syncSourceToTranslationPreview(chapter);
    syncTranslationToSourcePreview(chapter);
    if (sentenceTranslationModuleEntryKey !== sentenceEntryKey) {
      sentenceTranslationModuleEntryKey = sentenceEntryKey;
      void refreshSentenceTranslationsFromDisk();
    }
  } else {
    sentenceTranslationModuleEntryKey = "";
    sentenceTranslateToolbar.hidden = true;
  }
  sourceLocationStatus.textContent = view.focusedSourceLine
    ? view.activeReviewModule === "非法断行"
      ? `已定位断行 · 第 ${view.focusedSourceLine} 行 · 前后各 10 字`
      : `源码定位：第 ${view.focusedSourceLine} 行`
    : "源码定位：—";
  headingToolbar.hidden =
    view.activeReviewModule !== "章节标题"
    || !chapter
    || chapter.kind === "boundary";
  headingNumbering.checked = view.headingNumberingEnabled;
  headingNumbering.disabled = !view.canSetHeadingNumbering;
  const mediaCatalog = deriveMediaCatalog(chapter);
  const mediaCounts = {
    adopted: mediaCatalog.filter((item) => item.group === "已采用").length,
    unused: mediaCatalog.filter((item) => item.group === "未采用").length,
    pending: mediaCatalog.filter((item) => item.group === "未下载").length,
  };
  mediaToolbar.hidden =
    view.activeReviewModule !== "媒体"
    || chapter?.kind !== "chapter";
  mediaDownloadButton.disabled =
    mediaDownloadRunning
    || chapter?.kind !== "chapter"
    || view.canSave
    || mediaCounts.pending === 0;
  mediaDownloadButton.textContent = mediaDownloadRunning
    ? "下载中…"
    : mediaCounts.pending > 0
      ? `下载未下载媒体（${mediaCounts.pending}）`
      : "已全部下载";
  const currentMediaDownloadStatus =
    mediaDownloadStatusChapterId === chapter?.id ? mediaDownloadStatusText : "";
  mediaDownloadStatus.textContent = currentMediaDownloadStatus
    || `已采用 ${mediaCounts.adopted} · 未采用 ${mediaCounts.unused} · 未下载 ${mediaCounts.pending}`;
  titleExportStatus.hidden =
    view.activeReviewModule !== "章节标题"
    || !chapter
    || chapter.kind === "boundary";
  titleExportStatus.textContent = chapter
    ? `导出效果：${view.titleHeadingCount} 个标题 · 导出标题 ${view.titleExportHeadingCount} 个 · 已编号 ${view.titleExportNumberedCount} 个`
    : "导出效果：—";
  illegalExportStatus.hidden = view.activeReviewModule !== "非法断行" || !chapter;
  illegalExportStatus.textContent = chapter
    ? `导出效果：${view.illegalMergeDecisionCount} 条“合并”标定 → ${view.illegalMergeSpanCount} 组断行合并 · 已忽略 ${view.ignoredIllegalLineBreakRows} 条`
    : "导出效果：—";
  boundaryToolbar.hidden =
    view.activeReviewModule !== "章节定界"
    || chapter?.kind !== "boundary";
  assignBoundarySequenceButton.disabled =
    chapter?.kind !== "boundary" || !view.canEdit;
  exportBoundaryButton.disabled = !view.canExportBoundary;
  boundaryExportStatus.hidden =
    view.activeReviewModule !== "章节定界"
    || chapter?.kind !== "boundary";
  boundaryExportStatus.textContent = chapter?.kind === "boundary"
    ? "一级标题 " + view.boundaryHeadingCount
      + " · 独立章节 " + view.boundaryStandaloneHeadingCount
      + " · 归并标题 " + view.boundaryMergedHeadingCount
      + " · segments " + view.boundarySegmentCount
      + (view.lastExportedCount != null
        ? " · 上次导出 " + view.lastExportedCount + " 章"
        : "")
    : "导出：—";

  for (const button of reviewModuleButtons) {
    const module = button.dataset.reviewModule as ActiveReviewModule | undefined;
    const active = !configGridMode && module === view.activeReviewModule;
    const moduleAllowed = chapter?.kind === "boundary"
      ? module === "章节定界"
      : chapter?.kind === "translation"
        ? module !== undefined && translationElementModules.has(module)
        : module !== "章节定界"
          && module !== "翻译"
          && module !== "文本块"
          && module !== "句子"
          && module !== "原文to译文"
          && module !== "译文to原文"
          && module !== "翻译服务";
    button.hidden = Boolean(chapter) && !moduleAllowed;
    button.disabled = !view.canSelectReviewModule || !moduleAllowed;
    button.setAttribute("aria-pressed", active ? "true" : "false");
  }
  const ordinaryChapter = !chapter || chapter.kind === "chapter";
  chapterElementPicker.hidden = Boolean(chapter) && !ordinaryChapter;
  chapterElementTab.disabled =
    !view.canSelectReviewModule || !ordinaryChapter;
  const translationChapter = chapter?.kind === "translation";
  translationElementPicker.hidden = !translationChapter;
  translationElementTab.disabled =
    !view.canSelectReviewModule || !translationChapter;
  syncChapterElementTabState();
  syncTranslationElementTabState();
  configModuleTab.disabled = false;
  configModuleTab.hidden = false;
  configModuleTab.setAttribute(
    "aria-pressed",
    configGridMode ? "true" : "false",
  );
  if (configGridMode) {
    reviewGridStatus.textContent =
      "配置 · " + (tableConfigurationGrid?.rowCount() ?? 0)
      + " 项 · 点击行定位 JSON";
  }
  revision.textContent = view.revision ? view.revision.slice(0, 16) : "—";
  lastSavedAt.textContent = view.lastSavedAt ?? "—";
  canEdit.textContent = view.canEdit ? "是" : "否";
  canUndo.textContent = view.canUndo ? "是" : "否";
  canRedo.textContent = view.canRedo ? "是" : "否";
  undoDepth.textContent = view.undoDepth.toString();
  redoDepth.textContent = view.redoDepth.toString();
  canSave.textContent = view.canSave ? "是" : "否";
  catalogError.textContent = view.catalogError ?? "—";
  loadError.textContent = view.loadError ?? "—";
  saveError.textContent = view.saveError ?? "—";

  refreshCatalogButton.disabled = !view.canRefreshCatalog;
  openChapterButton.disabled = !view.canOpenChapter;
  openTranslationButton.disabled = !view.canOpenTranslation;
  openBoundaryButton.disabled = !view.canOpenBoundary;
  undoButton.disabled = !view.canUndo;
  redoButton.disabled = !view.canRedo;
  saveButton.disabled = !view.canSave;
  saveButton.textContent = chapter?.kind === "translation"
    ? "保存工作稿"
    : "保存标定";
  exportCalibrationButton.disabled = !view.canExportCalibration;
  exportCalibrationButton.hidden = chapter?.kind === "translation";
  resetCalibrationButton.disabled = !view.canResetCalibration;
  resetCalibrationButton.hidden = chapter?.kind === "translation";
  exportTransButton.disabled = !view.canExportTrans;
  enterDebugButton.disabled = !view.canEnterDebug;
  exitDebugButton.disabled = !view.canExitDebug;

  const leaveVisible =
    view.session === "chapter-leave-confirm"
    || view.session === "chapter-leave-saving";
  leaveConfirmOverlay.hidden = !leaveVisible;
  leaveConfirmTitle.textContent =
    view.session === "chapter-leave-saving"
      ? "正在保存修改…"
      : "章节有未保存修改";
  leaveConfirmMessage.textContent =
    view.leaveIntentKind === "open"
      ? `保存或放弃当前修改后，才能切换到「${view.leaveTargetChapterName ?? "目标章节"}」。`
      : "保存或放弃当前修改后，才能关闭当前章节。";
  leaveCancelButton.disabled = !view.canLeaveCancel;
  leaveDiscardButton.disabled = !view.canLeaveDiscard;
  leaveSaveButton.disabled = !view.canLeaveSave;

  if (!view.canResetCalibration) resetConfirmVisible = false;
  resetConfirmOverlay.hidden = !resetConfirmVisible;
  resetConfirmButton.disabled = !view.canResetCalibration;
  resetConfirmMessage.textContent = view.chapterName
    ? `「${view.chapterName}」的当前工作稿和全部人工标定将恢复到原始状态，并立即保存。此操作会清空撤销 / 重做历史。`
    : "当前工作稿和全部人工标定将恢复到原始状态，并立即保存。此操作会清空撤销 / 重做历史。";

  const calibrationExportRunning =
    view.session === "chapter-exporting"
    && exportCalibrationPendingDestination != null;
  if (!view.canExportCalibration && !calibrationExportRunning) {
    exportCalibrationVisible = false;
    exportCalibrationPendingDestination = undefined;
  }
  if (
    exportCalibrationVisible
    && exportCalibrationPendingDestination
    && view.session === "chapter-clean"
  ) {
    if (view.saveError) {
      exportCalibrationStatus.textContent = `导出失败：${view.saveError}`;
      exportCalibrationPendingDestination = undefined;
    } else if (
      view.lastCalibrationExportDestination === exportCalibrationPendingDestination
      && view.lastCalibrationExportPath
    ) {
      exportCalibrationStatus.textContent =
        `已导出：当前章节/${view.lastCalibrationExportPath}`;
      exportCalibrationPendingDestination = undefined;
    }
  }
  exportCalibrationOverlay.hidden = !exportCalibrationVisible;
  exportDestinationTrans.disabled = calibrationExportRunning;
  exportDestinationOutput.disabled = calibrationExportRunning;
  exportCalibrationCancelButton.disabled = calibrationExportRunning;
  exportCalibrationConfirmButton.disabled =
    calibrationExportRunning
    || !view.canExportCalibration
    || !selectedCalibrationExportDestination();

});

function executeProductAction(
  action: DebugCommandAction,
  commandId?: string,
  chapterId?: string,
  reviewModule?: string,
): void {
  lastUiAction = action;
  lastCommandId = commandId;

  switch (action) {
    case "open-chapter": {
      const selectedChapterId =
        chapterId ?? deriveWorkspaceView(actor.getSnapshot()).selectedChapterId;
      if (selectedChapterId) {
        actor.send({
          type: "OPEN_CHAPTER",
          chapterId: selectedChapterId,
        });
      }
      break;
    }
    case "open-boundary":
      actor.send({ type: "OPEN_BOUNDARY" });
      break;
    case "assign-boundary-sequence":
      actor.send({ type: "ASSIGN_BOUNDARY_SEQUENCE", start: "91" });
      break;
    case "export-boundary":
      actor.send({ type: "EXPORT_BOUNDARY" });
      break;
    case "edit": {
      const view = deriveWorkspaceView(actor.getSnapshot());
      if (actor.getSnapshot().context.chapter && view.canEdit) {
        pendingEditorCommandId = commandId;
        try {
          workingEditor.insertDebugCharacter();
        } finally {
          pendingEditorCommandId = undefined;
        }
      }
      break;
    }
    case "select-review-module":
      if (
        reviewModule
        && ACTIVE_REVIEW_MODULES.includes(reviewModule as ActiveReviewModule)
      ) {
        actor.send({
          type: "SELECT_REVIEW_MODULE",
          module: reviewModule as ActiveReviewModule,
        });
      }
      break;
    case "focus-first-calibration":
      pendingCalibrationFocusCommandId = commandId;
      try {
        calibrationGrid.focusFirstVisible();
      } finally {
        pendingCalibrationFocusCommandId = undefined;
      }
      break;
    case "ignore-first-calibration":
      pendingCalibrationCommandId = commandId;
      try {
        calibrationGrid.ignoreFirstVisible();
      } finally {
        pendingCalibrationCommandId = undefined;
      }
      break;
    case "demote-first-heading":
      pendingCalibrationCommandId = commandId;
      try {
        calibrationGrid.demoteFirstVisibleHeading();
      } finally {
        pendingCalibrationCommandId = undefined;
      }
      break;
    case "toggle-heading-numbering":
      actor.send({
        type: "SET_HEADING_NUMBERING",
        enabled: !actor.getSnapshot().context.headingNumberingEnabled,
      });
      break;
    case "undo":
      actor.send({ type: "UNDO" });
      break;
    case "redo":
      actor.send({ type: "REDO" });
      break;
    case "save":
      actor.send({ type: "SAVE" });
      break;
    case "close":
      actor.send({ type: "CLOSE" });
      break;
    case "leave-cancel":
      actor.send({ type: "LEAVE_CANCEL" });
      break;
    case "leave-discard":
      actor.send({ type: "LEAVE_DISCARD" });
      break;
    case "leave-save":
      actor.send({ type: "LEAVE_SAVE" });
      break;
    case "enter-debug":
      actor.send({ type: "ENTER_DEBUG" });
      break;
    case "exit-debug":
      actor.send({ type: "EXIT_DEBUG" });
      break;
  }

  if (commandId) queueMicrotask(reportCurrentState);
}

type UndoRedoDebugContext = {
  initialSession: "idle" | "chapter-clean";
  initialChapterId?: string;
  initialReviewModule: ActiveReviewModule;
  targetChapterId: string;
  baselineWorking: string;
  baselineRevision?: string;
  baselineVisible: number;
  baselineIgnored: number;
  headingRowId: string;
};

let undoRedoDebugContext: UndoRedoDebugContext | undefined;

type IgnoreLineTypeDebugContext = {
  targetRowText: string;
  baselineActiveRows: number;
  baselineVisible: number;
  baselineIgnored: number;
  baselineRevision?: string;
};

let ignoreLineTypeDebugContext: IgnoreLineTypeDebugContext | undefined;

type SaveReloadDebugContext = {
  targetRowText: string;
  baselineLineType: string;
  temporaryLineType: string;
  baselineRevision: string;
  baselineWorkingText: string;
  baselineSidecar: Record<string, unknown>;
  temporaryRevision?: string;
  semanticRestoreRevision?: string;
};

let saveReloadDebugContext: SaveReloadDebugContext | undefined;

type DirtyLeaveDebugContext = {
  baselineWorkingText: string;
  baselineSidecar: Record<string, unknown>;
  baselineRevision: string;
  targetChapterId: string;
  targetChapterName: string;
};

let dirtyLeaveDebugContext: DirtyLeaveDebugContext | undefined;

type IllegalLineBreakDebugContext = {
  baselineWorkingText: string;
  baselineSidecar: Record<string, unknown>;
  baselineRevision: string;
  baselineWorkingLength: number;
  baselineActiveRows: number;
  baselineMergeDecisionCount: number;
  baselineMergeSpanCount: number;
  baselineIgnoredCount: number;
  temporaryRevision?: string;
};

let illegalLineBreakDebugContext: IllegalLineBreakDebugContext | undefined;

type ChangedLineDebugContext = {
  baselineWorkingText: string;
  baselineSidecar: Record<string, unknown>;
  baselineRevision: string;
  baselineWorkingLength: number;
  baselineChangedRows: number;
  temporaryRevision?: string;
};

let changedLineDebugContext: ChangedLineDebugContext | undefined;

type TableConfigDebugContext = {
  baselineExists: boolean;
  baselineSource?: string;
  baselineHeaders: string[];
  temporarySource: string;
  temporaryHeaders: string[];
};

let tableConfigDebugContext: TableConfigDebugContext | undefined;

type ChapterTitleDebugContext = {
  baselineWorkingText: string;
  baselineSidecar: Record<string, unknown>;
  baselineRevision: string;
  baselineWorkingLength: number;
  baselineActiveRows: number;
  temporaryRevision?: string;
};

let chapterTitleDebugContext: ChapterTitleDebugContext | undefined;

type AnnotationDebugContext = {
  baselineWorkingText: string;
  baselineSidecar: Record<string, unknown>;
  baselineRevision: string;
  baselineWorkingLength: number;
  baselineActiveRows: number;
  baselinePairs: number;
  temporaryRevision?: string;
};

let annotationDebugContext: AnnotationDebugContext | undefined;

type EmbedDebugContext = {
  baselineWorkingText: string;
  baselineSidecar: Record<string, unknown>;
  baselineRevision: string;
  baselineWorkingLength: number;
  baselineVisibleRows: number;
  baselineTotalRows: number;
  baselineGroupCount: number;
  baselineUnassignedRows: number;
  temporaryRevision?: string;
};

let embedDebugContext: EmbedDebugContext | undefined;

type ChapterBoundaryDebugContext = {
  baselineWorkingText: string;
  baselineText: string;
  baselineSidecar: Record<string, unknown>;
  baselineRevision: string;
  baselineWorkingLength: number;
  baselineSourceFiles: string[];
  baselineSourceFileCount: number;
  baselineHeadingCount: number;
  baselineAssignedCount: number;
  baselineSegmentCount: number;
  baselineChapterFiles: string[];
  baselineCatalogNames: string[];
  temporaryRevision?: string;
};

let chapterBoundaryDebugContext: ChapterBoundaryDebugContext | undefined;

type ChapterOpenDebugContext = {
  safeChapterId: string;
  safeChapterName: string;
  baselineWorkingText: string;
  baselineSidecar: Record<string, unknown>;
  baselineRevision: string;
  readyTargets: Array<{
    id: string;
    name: string;
    baselineWorkingText: string;
    baselineSidecar: Record<string, unknown>;
    baselineRevision: string;
  }>;
  blockedChapters: Array<{
    id: string;
    name: string;
    reason?: string;
  }>;
  projectName: string;
  chapterCount: number;
  readyCount: number;
};

let chapterOpenDebugContext: ChapterOpenDebugContext | undefined;

async function waitForWorkspaceSession(
  expected: "idle" | "chapter-clean",
  timeoutMs = 8_000,
): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    if (deriveWorkspaceView(actor.getSnapshot()).session === expected) return;
    await new Promise<void>((resolve) => window.setTimeout(resolve, 25));
  }
  throw new Error(`等待工作台状态 ${expected} 超时`);
}

async function initializeFeatureDebugWorkspace(): Promise<void> {
  featureDebugMenu.close();
  featureDebugInitializeButton.disabled = true;
  featureDebugEnvironmentReady = false;
  featureDebugChapterId = undefined;
  featureDebugBaselineRevision = undefined;
  workingTextDebugBaselineWorking = undefined;
  workingTextDebugBaselineRevision = undefined;
  ignoreLineTypeDebugContext = undefined;
  saveReloadDebugContext = undefined;
  dirtyLeaveDebugContext = undefined;
  illegalLineBreakDebugContext = undefined;
  changedLineDebugContext = undefined;
  tableConfigDebugContext = undefined;
  chapterTitleDebugContext = undefined;
  annotationDebugContext = undefined;
  embedDebugContext = undefined;
  chapterBoundaryDebugContext = undefined;
  chapterOpenDebugContext = undefined;
  markdownPreviewDebugBaselineWorking = undefined;
  markdownPreviewDebugBaselineText = undefined;
  document.documentElement.dataset.featureDebugReady = "false";
  featureDebugRunner.reset();

  try {
    const catalogDeadline = performance.now() + 8_000;
    let view = deriveWorkspaceView(actor.getSnapshot());
    while (!view.chapters.length && performance.now() < catalogDeadline) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 25));
      view = deriveWorkspaceView(actor.getSnapshot());
    }

    requireFeatureDebug(
      view.session === "idle" || view.session === "chapter-clean",
      "当前工作稿有未保存修改；请先保存、撤销或放弃后再初始化功能调试",
    );

    const target = view.chapters.find(
      (chapter) => chapter.ready && chapter.name.includes("副本"),
    );
    requireFeatureDebug(target, "项目中没有可用的功能调试安全副本");

    if (view.session === "chapter-clean") {
      executeProductAction("close");
      await waitForWorkspaceSession("idle");
    }

    sourceRegexSearch.reset();
    setRegexSearchOpen(false);
    setSourcePaneMode("source");
    workspaceSplitterControl.reset();
    editorPreviewSplitterControl.reset();
    markdownPreviewHost.scrollTop = 0;

    executeProductAction("open-chapter", undefined, target.id);
    await waitForWorkspaceSession("chapter-clean");
    executeProductAction(
      "select-review-module",
      undefined,
      undefined,
      "章节标题",
    );

    let snapshot = actor.getSnapshot();
    view = deriveWorkspaceView(snapshot);
    if (!view.headingNumberingEnabled) {
      actor.send({ type: "SET_HEADING_NUMBERING", enabled: true });
      snapshot = actor.getSnapshot();
      view = deriveWorkspaceView(snapshot);
    }

    requireFeatureDebug(
      snapshot.context.chapter?.id === target.id,
      "初始化后没有打开功能调试安全副本",
    );
    requireFeatureDebug(
      view.session === "chapter-clean",
      "初始化后工作稿不是 clean",
    );
    requireFeatureDebug(
      view.undoDepth === 0 && view.redoDepth === 0,
      "初始化后 Undo / Redo 历史不为空",
    );
    requireFeatureDebug(!view.canSave, "初始化后不应存在可保存修改");
    requireFeatureDebug(
      view.activeReviewModule === "章节标题",
      "初始化后默认模块不是章节标题",
    );

    featureDebugEnvironmentReady = true;
    featureDebugChapterId = target.id;
    featureDebugBaselineRevision = view.revision;
    document.documentElement.dataset.featureDebugReady = "true";
    featureDebugRunner.refreshControls();
    sourceLocationStatus.textContent =
      "功能调试已初始化 · 安全工作稿 clean · Undo / Redo 0/0 · 未写入磁盘";
  } catch (error) {
    featureDebugEnvironmentReady = false;
    document.documentElement.dataset.featureDebugReady = "false";
    featureDebugRunner.refreshControls();
    sourceLocationStatus.textContent =
      "功能调试初始化失败 · "
      + (error instanceof Error ? error.message : String(error));
  } finally {
    featureDebugInitializeButton.disabled = false;
  }
}

function requireInitializedFeatureDebugWorkspace(): ReturnType<typeof deriveWorkspaceView> {
  const snapshot = actor.getSnapshot();
  const view = deriveWorkspaceView(snapshot);
  requireFeatureDebug(
    featureDebugEnvironmentReady && featureDebugChapterId,
    "请先运行“初始化工作稿”",
  );
  requireFeatureDebug(
    view.session === "chapter-clean"
      && snapshot.context.chapter?.id === featureDebugChapterId,
    "功能调试工作稿已离开初始化基线；请重新运行“初始化工作稿”",
  );
  requireFeatureDebug(
    view.undoDepth === 0 && view.redoDepth === 0,
    "功能调试工作稿已有历史；请重新初始化",
  );
  requireFeatureDebug(
    view.revision === featureDebugBaselineRevision,
    "功能调试工作稿 revision 已变化；请重新初始化",
  );
  requireFeatureDebug(!view.canSave, "功能调试工作稿不再是 clean 基线");
  return view;
}

function currentChapterOpenDebugContext(): ChapterOpenDebugContext {
  requireFeatureDebug(
    chapterOpenDebugContext,
    "章节选择 / 打开章节调试上下文不存在",
  );
  return chapterOpenDebugContext;
}

function chapterOptionById(chapterId: string): HTMLOptionElement | undefined {
  return Array.from(chapterSelect.options).find(
    (option) => option.value === chapterId,
  );
}

async function waitForOpenedChapter(
  chapterId: string,
  timeoutMs = 8_000,
): Promise<ReturnType<typeof deriveWorkspaceView>> {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    const snapshot = actor.getSnapshot();
    const view = deriveWorkspaceView(snapshot);
    if (
      view.session === "chapter-clean"
      && view.workspaceKind === "chapter"
      && snapshot.context.chapter?.id === chapterId
      && view.selectedChapterId === chapterId
      && chapterSelect.value === chapterId
    ) {
      return view;
    }
    await new Promise<void>((resolve) => window.setTimeout(resolve, 25));
  }
  throw new Error("等待章节打开超时：" + chapterId);
}

function requireCleanChapterSelection(
  view: ReturnType<typeof deriveWorkspaceView>,
  expectedRevision: string,
  message: string,
): void {
  requireFeatureDebug(
    view.session === "chapter-clean"
      && view.workspaceKind === "chapter"
      && view.activeReviewModule === "章节标题"
      && view.undoDepth === 0
      && view.redoDepth === 0
      && !view.canSave
      && view.revision === expectedRevision,
    message,
  );
}

async function prepareChapterOpenFeatureDebug(): Promise<void> {
  featureDebugMenu.close();
  const view = requireInitializedFeatureDebugWorkspace();
  requireFeatureDebug(featureDebugChapterId, "功能调试安全副本不存在");
  requireFeatureDebug(view.projectName, "项目名不存在");

  const safeChapter = view.chapters.find(
    (chapter) => chapter.id === featureDebugChapterId,
  );
  requireFeatureDebug(safeChapter?.ready, "功能调试安全副本不可用");

  const readyTargets = view.chapters.filter(
    (chapter) => chapter.ready && chapter.id !== featureDebugChapterId,
  );
  const blockedChapters = view.chapters.filter((chapter) => !chapter.ready);

  requireFeatureDebug(
    readyTargets.length >= 2,
    "章节选择调试至少需要安全副本之外 2 个 ready 章节",
  );
  requireFeatureDebug(
    blockedChapters.length >= 1,
    "章节选择调试至少需要 1 个 blocked 章节",
  );

  const baseline = await fetchRawChapter(featureDebugChapterId);
  const targetSnapshots = await Promise.all(
    readyTargets.slice(0, 2).map(async (chapter) => {
      const raw = await fetchRawChapter(chapter.id);
      return {
        id: chapter.id,
        name: chapter.name,
        baselineWorkingText: raw.workingText,
        baselineSidecar: raw.sidecar,
        baselineRevision: raw.revision,
      };
    }),
  );

  chapterOpenDebugContext = {
    safeChapterId: featureDebugChapterId,
    safeChapterName: safeChapter.name,
    baselineWorkingText: baseline.workingText,
    baselineSidecar: baseline.sidecar,
    baselineRevision: baseline.revision,
    readyTargets: targetSnapshots,
    blockedChapters: blockedChapters.map((chapter) => ({
      id: chapter.id,
      name: chapter.name,
      reason: chapter.reason,
    })),
    projectName: view.projectName,
    chapterCount: view.chapters.length,
    readyCount: view.chapters.filter((chapter) => chapter.ready).length,
  };
}

function createChapterOpenFeatureDebugSteps(): readonly FeatureDebugStep[] {
  return [
    {
      label: "1 Catalog：ready / blocked 投影正确，blocked 导航项全部不可选",
      run: () => {
        const context = currentChapterOpenDebugContext();
        const view = deriveWorkspaceView(actor.getSnapshot());
        const ready = view.chapters.filter((chapter) => chapter.ready);
        const blocked = view.chapters.filter((chapter) => !chapter.ready);

        requireFeatureDebug(
          view.projectName === context.projectName
            && view.chapters.length === context.chapterCount
            && ready.length === context.readyCount
            && blocked.length === context.blockedChapters.length,
          "项目 catalog 的 ready / blocked 计数与基线不一致",
        );
        requireFeatureDebug(
          chapterSelect.options.length === context.chapterCount + 4,
          "项目导航 option 数量与 catalog 不一致",
        );

        for (const chapter of ready) {
          const option = chapterOptionById(chapter.id);
          requireFeatureDebug(
            option && !option.disabled,
            "ready 章节被错误禁用：" + chapter.name,
          );
        }
        for (const chapter of context.blockedChapters) {
          const option = chapterOptionById(chapter.id);
          requireFeatureDebug(
            option?.disabled
              && option.textContent?.includes(chapter.name)
              && (!chapter.reason || option.textContent?.includes(chapter.reason)),
            "blocked 章节没有正确禁用/显示原因：" + chapter.name,
          );
        }

        requireCleanChapterSelection(
          view,
          context.baselineRevision,
          "Catalog 基线下安全副本不是 clean 0/0",
        );
      },
    },
    {
      label: "2 真实导航：安全副本 → ready 章节 A，章节路径 / 数据表上下文同步",
      run: async () => {
        const context = currentChapterOpenDebugContext();
        const target = context.readyTargets[0];
        requireFeatureDebug(target, "ready 章节 A 不存在");

        selectChapterThroughProductUi(target.id);
        const view = await waitForOpenedChapter(target.id);

        requireCleanChapterSelection(
          view,
          target.baselineRevision,
          "ready 章节 A 打开后不是 clean / 章节标题上下文",
        );
        requireFeatureDebug(
          chapterPath.textContent?.includes("/chapters/" + target.name + "/"),
          "ready 章节 A 的 chapterPath 没有同步",
        );
        requireFeatureDebug(
          chapterSelect.value === target.id,
          "ready 章节 A 的导航选中值没有同步",
        );
      },
    },
    {
      label: "3 连续导航：ready 章节 A → ready 章节 B，仍 clean 0/0 且无保存状态",
      run: async () => {
        const context = currentChapterOpenDebugContext();
        const target = context.readyTargets[1];
        requireFeatureDebug(target, "ready 章节 B 不存在");

        selectChapterThroughProductUi(target.id);
        const view = await waitForOpenedChapter(target.id);

        requireCleanChapterSelection(
          view,
          target.baselineRevision,
          "ready 章节 B 打开后不是 clean / 章节标题上下文",
        );
        requireFeatureDebug(
          chapterPath.textContent?.includes("/chapters/" + target.name + "/"),
          "ready 章节 B 的 chapterPath 没有同步",
        );
        requireFeatureDebug(
          context.blockedChapters.every(
            (chapter) => chapterOptionById(chapter.id)?.disabled,
          ),
          "连续切换后 blocked 章节出现可选状态",
        );
      },
    },
    {
      label: "4 回安全副本：真实导航恢复章节标题表，原 revision / clean 0/0 不变",
      run: async () => {
        const context = currentChapterOpenDebugContext();

        selectChapterThroughProductUi(context.safeChapterId);
        const view = await waitForOpenedChapter(context.safeChapterId);

        requireCleanChapterSelection(
          view,
          context.baselineRevision,
          "回到安全副本后不是原 clean / revision 基线",
        );
        requireFeatureDebug(
          view.activeModuleRows === 10
            && chapterSelect.value === context.safeChapterId
            && chapterPath.textContent?.includes(
              "/chapters/" + context.safeChapterName + "/",
            ),
          "回安全副本后标题表 / 导航路径没有恢复",
        );
      },
    },
    {
      label: "5 零写入核验：安全副本 + 两个访问章节 working / sidecar / revision 全部未变",
      run: async () => {
        const context = currentChapterOpenDebugContext();
        const finalView = requireInitializedFeatureDebugWorkspace();

        const safeRaw = await fetchRawChapter(context.safeChapterId);
        requireFeatureDebug(
          safeRaw.workingText === context.baselineWorkingText
            && JSON.stringify(safeRaw.sidecar)
              === JSON.stringify(context.baselineSidecar)
            && safeRaw.revision === context.baselineRevision,
          "安全副本在章节切换调试中发生持久化变化",
        );

        for (const target of context.readyTargets) {
          const raw = await fetchRawChapter(target.id);
          requireFeatureDebug(
            raw.workingText === target.baselineWorkingText
              && JSON.stringify(raw.sidecar)
                === JSON.stringify(target.baselineSidecar)
              && raw.revision === target.baselineRevision,
            "访问章节发生持久化变化：" + target.name,
          );
        }

        requireFeatureDebug(
          finalView.undoDepth === 0
            && finalView.redoDepth === 0
            && !finalView.canSave
            && finalView.revision === context.baselineRevision,
          "章节选择调试最终业务历史 / revision 不干净",
        );
      },
    },
  ];
}

function recoverChapterOpenFeatureDebug(error: Error): void {
  const context = chapterOpenDebugContext;
  if (context) {
    const view = deriveWorkspaceView(actor.getSnapshot());
    if (
      view.session === "chapter-clean"
      && actor.getSnapshot().context.chapter?.id !== context.safeChapterId
    ) {
      selectChapterThroughProductUi(context.safeChapterId);
    }
  }
  featureDebugEnvironmentReady = false;
  document.documentElement.dataset.featureDebugReady = "false";
  featureDebugRunner.refreshControls();
  sourceLocationStatus.textContent =
    "章节选择 / 打开章节功能调试失败 · 已尝试回安全副本 · 请重新初始化 · "
    + error.message;
}

function dispatchWorkspaceSplitterKey(
  key: "ArrowLeft" | "ArrowRight",
  count: number,
): void {
  workspaceSplitter.focus();
  for (let index = 0; index < count; index += 1) {
    workspaceSplitter.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true }),
    );
  }
}

function prepareWorkspaceSplitterFeatureDebug(): void {
  featureDebugMenu.close();
  requireInitializedFeatureDebugWorkspace();
  requireFeatureDebug(
    Math.round(workspaceSplitterControl.getLeftPercent()) === 43,
    "左右分割条已离开初始化 43% 基线；请重新初始化",
  );
}

function createWorkspaceSplitterFeatureDebugSteps(): readonly FeatureDebugStep[] {
  return [
    {
      label: "1 基线：左窗 43%，工作稿保持 clean",
      run: () => {
        const view = requireInitializedFeatureDebugWorkspace();
        requireFeatureDebug(
          Math.round(workspaceSplitterControl.getLeftPercent()) === 43,
          "初始左窗比例不是 43%",
        );
        requireFeatureDebug(
          workspaceSplitter.getAttribute("aria-valuenow") === "43",
          "分割条 aria 基线不是 43",
        );
        requireFeatureDebug(view.session === "chapter-clean", "初始化基线不是 clean");
      },
    },
    {
      label: "2 正式键盘路径：ArrowRight ×4 → 51%",
      run: () => {
        dispatchWorkspaceSplitterKey("ArrowRight", 4);
        requireFeatureDebug(
          Math.round(workspaceSplitterControl.getLeftPercent()) === 51,
          "分割条没有移动到 51%",
        );
        requireInitializedFeatureDebugWorkspace();
      },
    },
    {
      label: "3 继续正式键盘路径：ArrowRight ×4 → 59%",
      run: () => {
        dispatchWorkspaceSplitterKey("ArrowRight", 4);
        requireFeatureDebug(
          Math.round(workspaceSplitterControl.getLeftPercent()) === 59,
          "分割条没有移动到 59%",
        );
        requireInitializedFeatureDebugWorkspace();
      },
    },
    {
      label: "4 ArrowLeft ×8 → 恢复 43%，业务状态零变化",
      run: () => {
        dispatchWorkspaceSplitterKey("ArrowLeft", 8);
        const view = requireInitializedFeatureDebugWorkspace();
        requireFeatureDebug(
          Math.round(workspaceSplitterControl.getLeftPercent()) === 43,
          "分割条没有恢复 43%",
        );
        requireFeatureDebug(
          localStorage.getItem("ocr2md-v2-workspace-split-v1") === "43",
          "分割条持久化比例没有恢复 43%",
        );
        requireFeatureDebug(
          view.undoDepth === 0 && view.redoDepth === 0 && !view.canSave,
          "分割条调试意外改变业务历史或保存状态",
        );
      },
    },
  ];
}

function dispatchEditorPreviewSplitterKey(
  key: "ArrowUp" | "ArrowDown",
  count: number,
): void {
  editorPreviewSplitter.focus();
  for (let index = 0; index < count; index += 1) {
    editorPreviewSplitter.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true }),
    );
  }
}

function prepareEditorPreviewSplitterFeatureDebug(): void {
  featureDebugMenu.close();
  requireInitializedFeatureDebugWorkspace();
  requireFeatureDebug(
    Math.round(editorPreviewSplitterControl.getTopPercent()) === 55,
    "水平分割条已离开初始化 55% 基线；请重新初始化",
  );
}

function createEditorPreviewSplitterFeatureDebugSteps(): readonly FeatureDebugStep[] {
  return [
    {
      label: "1 基线：源码高度 55%，工作稿保持 clean",
      run: () => {
        const view = requireInitializedFeatureDebugWorkspace();
        requireFeatureDebug(
          Math.round(editorPreviewSplitterControl.getTopPercent()) === 55,
          "初始源码高度比例不是 55%",
        );
        requireFeatureDebug(
          editorPreviewSplitter.getAttribute("aria-valuenow") === "55",
          "水平分割条 aria 基线不是 55",
        );
        requireFeatureDebug(view.session === "chapter-clean", "初始化基线不是 clean");
      },
    },
    {
      label: "2 正式键盘路径：ArrowUp ×4 → 47%",
      run: () => {
        dispatchEditorPreviewSplitterKey("ArrowUp", 4);
        requireFeatureDebug(
          Math.round(editorPreviewSplitterControl.getTopPercent()) === 47,
          "水平分割条没有移动到 47%",
        );
        requireInitializedFeatureDebugWorkspace();
      },
    },
    {
      label: "3 继续正式键盘路径：ArrowUp ×4 → 39%",
      run: () => {
        dispatchEditorPreviewSplitterKey("ArrowUp", 4);
        requireFeatureDebug(
          Math.round(editorPreviewSplitterControl.getTopPercent()) === 39,
          "水平分割条没有移动到 39%",
        );
        requireInitializedFeatureDebugWorkspace();
      },
    },
    {
      label: "4 ArrowDown ×8 → 恢复 55%，业务状态零变化",
      run: () => {
        dispatchEditorPreviewSplitterKey("ArrowDown", 8);
        const view = requireInitializedFeatureDebugWorkspace();
        requireFeatureDebug(
          Math.round(editorPreviewSplitterControl.getTopPercent()) === 55,
          "水平分割条没有恢复 55%",
        );
        requireFeatureDebug(
          localStorage.getItem("ocr2md-v2-editor-preview-split-v1") === "55",
          "水平分割条持久化比例没有恢复 55%",
        );
        requireFeatureDebug(
          view.undoDepth === 0 && view.redoDepth === 0 && !view.canSave,
          "水平分割条调试意外改变业务历史或保存状态",
        );
      },
    },
  ];
}

const WORKING_TEXT_DEBUG_PREFIX = "功能调试临时正文\n\n";

function prepareWorkingTextFeatureDebug(): void {
  featureDebugMenu.close();
  const view = requireInitializedFeatureDebugWorkspace();
  const chapter = actor.getSnapshot().context.chapter;
  requireFeatureDebug(chapter?.kind === "chapter", "修改工作稿文本调试需要普通章节");
  requireFeatureDebug(chapter.workingText.length > 0, "初始化工作稿正文为空");
  workingTextDebugBaselineWorking = chapter.workingText;
  workingTextDebugBaselineRevision = view.revision;
  workingEditor.revealOffsets(0, 0);
}

function createWorkingTextFeatureDebugSteps(): readonly FeatureDebugStep[] {
  return [
    {
      label: "1 基线：clean，working 与磁盘 revision 已记录",
      run: () => {
        const view = requireInitializedFeatureDebugWorkspace();
        requireFeatureDebug(workingTextDebugBaselineWorking, "正文调试基线 working 不存在");
        requireFeatureDebug(workingTextDebugBaselineRevision, "正文调试基线 revision 不存在");
        requireFeatureDebug(
          actor.getSnapshot().context.chapter?.workingText
            === workingTextDebugBaselineWorking,
          "当前 working 与正文调试基线不一致",
        );
        requireFeatureDebug(
          view.undoDepth === 0 && view.redoDepth === 0 && !view.canSave,
          "正文调试基线不是 clean 0/0",
        );
      },
    },
    {
      label: "2 正式正文修改：working 顶部插入“功能调试临时正文”",
      run: () => {
        requireFeatureDebug(workingTextDebugBaselineWorking, "正文调试基线 working 不存在");
        applyWorkingTextChange(
          WORKING_TEXT_DEBUG_PREFIX + workingTextDebugBaselineWorking,
        );
        const snapshot = actor.getSnapshot();
        const view = deriveWorkspaceView(snapshot);
        requireFeatureDebug(view.session === "chapter-dirty", "正文修改后没有进入 dirty");
        requireFeatureDebug(view.undoDepth === 1 && view.redoDepth === 0, "正文修改历史不正确");
        requireFeatureDebug(view.canSave, "正文修改后保存标定没有变为可用");
        requireFeatureDebug(
          snapshot.context.chapter?.workingText.startsWith(
            WORKING_TEXT_DEBUG_PREFIX,
          ),
          "临时正文没有进入正式 working",
        );
        workingEditor.revealOffsets(0, "功能调试临时正文".length);
      },
    },
    {
      label: "3 源码窗同步：CodeMirror 可见临时正文，working 长度同步增加",
      run: () => {
        requireFeatureDebug(workingTextDebugBaselineWorking, "正文调试基线 working 不存在");
        const chapter = actor.getSnapshot().context.chapter;
        requireFeatureDebug(
          workingEditorHost.textContent?.includes("功能调试临时正文"),
          "CodeMirror 没有同步显示临时正文",
        );
        requireFeatureDebug(
          chapter?.workingText.length
            === workingTextDebugBaselineWorking.length + WORKING_TEXT_DEBUG_PREFIX.length,
          "working 长度没有同步增加",
        );
      },
    },
    {
      label: "4 正式 Undo：working 精确恢复 clean，临时正文消失",
      run: () => {
        requireFeatureDebug(workingTextDebugBaselineWorking, "正文调试基线 working 不存在");
        executeProductAction("undo");
        const snapshot = actor.getSnapshot();
        const view = deriveWorkspaceView(snapshot);
        requireFeatureDebug(view.session === "chapter-clean", "Undo 后没有回到 clean");
        requireFeatureDebug(
          snapshot.context.chapter?.workingText === workingTextDebugBaselineWorking,
          "Undo 没有精确恢复原 working",
        );
        requireFeatureDebug(view.undoDepth === 0 && view.redoDepth === 1, "Undo 后历史深度不正确");
        requireFeatureDebug(!view.canSave, "Undo 后保存标定仍可用");
        requireFeatureDebug(
          !workingEditorHost.textContent?.includes("功能调试临时正文"),
          "Undo 后源码窗仍残留临时正文",
        );
      },
    },
    {
      label: "5 关闭重入：清空 Redo，并确认磁盘 revision 未改变",
      run: async () => {
        requireFeatureDebug(featureDebugChapterId, "功能调试安全副本不存在");
        requireFeatureDebug(workingTextDebugBaselineWorking, "正文调试基线 working 不存在");
        requireFeatureDebug(workingTextDebugBaselineRevision, "正文调试基线 revision 不存在");
        executeProductAction("close");
        await waitForWorkspaceSession("idle");
        executeProductAction("open-chapter", undefined, featureDebugChapterId);
        await waitForWorkspaceSession("chapter-clean");
        executeProductAction(
          "select-review-module",
          undefined,
          undefined,
          "章节标题",
        );
        const snapshot = actor.getSnapshot();
        const view = deriveWorkspaceView(snapshot);
        requireFeatureDebug(view.undoDepth === 0 && view.redoDepth === 0, "重入后历史没有清空");
        requireFeatureDebug(!view.canSave, "重入后不应存在可保存修改");
        requireFeatureDebug(
          view.revision === workingTextDebugBaselineRevision,
          "正文调试意外改变了持久化 revision",
        );
        requireFeatureDebug(
          snapshot.context.chapter?.workingText === workingTextDebugBaselineWorking,
          "重入后 working 与原基线不一致",
        );
      },
    },
  ];
}

function recoverWorkingTextFeatureDebug(error: Error): void {
  let view = deriveWorkspaceView(actor.getSnapshot());
  while (view.canUndo) {
    executeProductAction("undo");
    view = deriveWorkspaceView(actor.getSnapshot());
  }
  featureDebugEnvironmentReady = false;
  document.documentElement.dataset.featureDebugReady = "false";
  featureDebugRunner.refreshControls();
  workingTextDebugBaselineWorking = undefined;
  workingTextDebugBaselineRevision = undefined;
  sourceLocationStatus.textContent =
    "修改工作稿文本功能调试失败 · 已撤销临时修改 · 请重新初始化 · " + error.message;
}

function currentIgnoreLineTypeDebugContext(): IgnoreLineTypeDebugContext {
  requireFeatureDebug(
    ignoreLineTypeDebugContext,
    "行类型：已忽略调试上下文不存在",
  );
  return ignoreLineTypeDebugContext;
}

function prepareIgnoreLineTypeFeatureDebug(): void {
  featureDebugMenu.close();
  requireInitializedFeatureDebugWorkspace();
  executeProductAction(
    "select-review-module",
    undefined,
    undefined,
    "章节标题",
  );

  const view = requireInitializedFeatureDebugWorkspace();
  const firstSelect = calibrationGridHost.querySelector<HTMLSelectElement>(
    ".calibration-line-type:not(:disabled)",
  );
  requireFeatureDebug(firstSelect, "章节标题表没有可编辑的行类型下拉");

  const row = firstSelect.closest<HTMLElement>('[role="row"]');
  const preview = row?.querySelector<HTMLElement>(".chapter-heading-preview")
    ?.textContent?.trim();
  requireFeatureDebug(preview, "无法读取第一条标题行预览");

  ignoreLineTypeDebugContext = {
    targetRowText: preview,
    baselineActiveRows: view.activeModuleRows ?? 0,
    baselineVisible: view.visibleCalibrationRows ?? 0,
    baselineIgnored: view.ignoredCalibrationRows ?? 0,
    baselineRevision: view.revision,
  };

  requireFeatureDebug(
    ignoreLineTypeDebugContext.baselineActiveRows > 0,
    "章节标题表没有可见候选",
  );
}

function createIgnoreLineTypeFeatureDebugSteps(): readonly FeatureDebugStep[] {
  return [
    {
      label: "1 基线：目标标题行可见，计数与历史为 clean",
      run: () => {
        const context = currentIgnoreLineTypeDebugContext();
        const view = requireInitializedFeatureDebugWorkspace();
        requireFeatureDebug(
          calibrationGridHost.textContent?.includes(context.targetRowText),
          "目标标题行在基线表中不可见",
        );
        requireFeatureDebug(
          view.activeModuleRows === context.baselineActiveRows
            && view.visibleCalibrationRows === context.baselineVisible
            && view.ignoredCalibrationRows === context.baselineIgnored,
          "基线计数与记录不一致",
        );
      },
    },
    {
      label: "2 真实数据表下拉：把第一条可见标题改为“已忽略”",
      run: () => {
        const context = currentIgnoreLineTypeDebugContext();
        const select = calibrationGridHost.querySelector<HTMLSelectElement>(
          ".calibration-line-type:not(:disabled)",
        );
        requireFeatureDebug(select, "真实行类型下拉不存在");
        requireFeatureDebug(
          Array.from(select.options).some((option) => option.value === "已忽略"),
          "真实行类型下拉没有“已忽略”选项",
        );
        select.value = "已忽略";
        select.dispatchEvent(new Event("change", { bubbles: true }));

        const view = deriveWorkspaceView(actor.getSnapshot());
        requireFeatureDebug(
          view.session === "chapter-dirty",
          "设为已忽略后没有进入 dirty",
        );
        requireFeatureDebug(
          view.undoDepth === 1 && view.redoDepth === 0 && view.canSave,
          "设为已忽略后 Undo/保存状态不正确",
        );
        requireFeatureDebug(
          view.activeModuleRows === context.baselineActiveRows - 1,
          "设为已忽略后当前模块可见行数没有减 1",
        );
        requireFeatureDebug(
          view.visibleCalibrationRows === context.baselineVisible - 1
            && view.ignoredCalibrationRows === context.baselineIgnored + 1,
          "设为已忽略后全局可见/忽略计数不正确",
        );
      },
    },
    {
      label: "3 数据表投影：被忽略行立即消失",
      run: () => {
        const context = currentIgnoreLineTypeDebugContext();
        const view = deriveWorkspaceView(actor.getSnapshot());
        requireFeatureDebug(
          !calibrationGridHost.textContent?.includes(context.targetRowText),
          "被忽略标题行仍显示在数据表",
        );
        requireFeatureDebug(
          view.activeModuleRows === context.baselineActiveRows - 1,
          "数据表行数没有保持减 1",
        );
      },
    },
    {
      label: "4 正式 Undo：计数精确恢复，回到 clean",
      run: () => {
        const context = currentIgnoreLineTypeDebugContext();
        executeProductAction("undo");
        const view = deriveWorkspaceView(actor.getSnapshot());
        requireFeatureDebug(
          view.session === "chapter-clean",
          "Undo 后没有回到 clean",
        );
        requireFeatureDebug(
          view.undoDepth === 0 && view.redoDepth === 1 && !view.canSave,
          "Undo 后历史/保存状态不正确",
        );
        requireFeatureDebug(
          view.activeModuleRows === context.baselineActiveRows
            && view.visibleCalibrationRows === context.baselineVisible
            && view.ignoredCalibrationRows === context.baselineIgnored,
          "Undo 没有恢复基线计数",
        );
      },
    },
    {
      label: "5 数据表恢复并重入：目标行回来，revision 未改变",
      run: async () => {
        const context = currentIgnoreLineTypeDebugContext();
        requireFeatureDebug(featureDebugChapterId, "功能调试安全副本不存在");
        await new Promise<void>((resolve) => window.setTimeout(resolve, 50));
        requireFeatureDebug(
          calibrationGridHost.textContent?.includes(context.targetRowText),
          "Undo 后目标标题行没有重新出现",
        );

        executeProductAction("close");
        await waitForWorkspaceSession("idle");
        executeProductAction("open-chapter", undefined, featureDebugChapterId);
        await waitForWorkspaceSession("chapter-clean");
        executeProductAction(
          "select-review-module",
          undefined,
          undefined,
          "章节标题",
        );

        const view = deriveWorkspaceView(actor.getSnapshot());
        requireFeatureDebug(
          view.undoDepth === 0 && view.redoDepth === 0 && !view.canSave,
          "重入后历史没有清空",
        );
        requireFeatureDebug(
          view.revision === context.baselineRevision,
          "行类型调试意外改变了持久化 revision",
        );
        requireFeatureDebug(
          view.activeModuleRows === context.baselineActiveRows
            && view.visibleCalibrationRows === context.baselineVisible
            && view.ignoredCalibrationRows === context.baselineIgnored,
          "重入后计数与基线不一致",
        );
        requireFeatureDebug(
          calibrationGridHost.textContent?.includes(context.targetRowText),
          "重入后目标标题行未恢复",
        );
      },
    },
  ];
}

function recoverIgnoreLineTypeFeatureDebug(error: Error): void {
  let view = deriveWorkspaceView(actor.getSnapshot());
  while (view.canUndo) {
    executeProductAction("undo");
    view = deriveWorkspaceView(actor.getSnapshot());
  }
  featureDebugEnvironmentReady = false;
  document.documentElement.dataset.featureDebugReady = "false";
  featureDebugRunner.refreshControls();
  ignoreLineTypeDebugContext = undefined;
  sourceLocationStatus.textContent =
    "行类型：已忽略功能调试失败 · 已撤销临时标定 · 请重新初始化 · "
    + error.message;
}

function currentSaveReloadDebugContext(): SaveReloadDebugContext {
  requireFeatureDebug(
    saveReloadDebugContext,
    "保存标定 / 重入加载调试上下文不存在",
  );
  return saveReloadDebugContext;
}

function headingLineTypeSelectByPreview(
  targetText: string,
): HTMLSelectElement | undefined {
  const rows = Array.from(
    calibrationGridHost.querySelectorAll<HTMLElement>('[role="row"]'),
  );
  for (const row of rows) {
    const preview = row.querySelector<HTMLElement>(".chapter-heading-preview")
      ?.textContent?.trim();
    if (preview !== targetText) continue;
    return row.querySelector<HTMLSelectElement>(
      "select.calibration-line-type:not(:disabled)",
    ) ?? undefined;
  }
  return undefined;
}

async function waitForCleanRevision(
  predicate: (revision: string | undefined) => boolean,
  timeoutMs = 8_000,
): Promise<string> {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    const view = deriveWorkspaceView(actor.getSnapshot());
    if (view.session === "chapter-clean" && predicate(view.revision)) {
      requireFeatureDebug(view.revision, "保存完成后 revision 为空");
      return view.revision;
    }
    await new Promise<void>((resolve) => window.setTimeout(resolve, 25));
  }
  throw new Error("等待保存完成超时");
}

async function reopenFeatureDebugChapter(): Promise<void> {
  requireFeatureDebug(featureDebugChapterId, "功能调试安全副本不存在");
  const view = deriveWorkspaceView(actor.getSnapshot());
  if (view.session === "chapter-clean") {
    executeProductAction("close");
    await waitForWorkspaceSession("idle");
  } else {
    requireFeatureDebug(view.session === "idle", "当前状态无法安全重入功能调试章节");
  }
  executeProductAction("open-chapter", undefined, featureDebugChapterId);
  await waitForWorkspaceSession("chapter-clean");
  executeProductAction(
    "select-review-module",
    undefined,
    undefined,
    "章节标题",
  );
}

async function restoreSaveReloadSemanticBaseline(): Promise<void> {
  const context = currentSaveReloadDebugContext();
  let view = deriveWorkspaceView(actor.getSnapshot());

  if (view.session === "chapter-dirty") {
    while (view.canUndo) {
      executeProductAction("undo");
      view = deriveWorkspaceView(actor.getSnapshot());
    }
  }

  if (view.session !== "chapter-clean") {
    await reopenFeatureDebugChapter();
    view = deriveWorkspaceView(actor.getSnapshot());
  }

  const select = headingLineTypeSelectByPreview(context.targetRowText);
  requireFeatureDebug(select, "恢复原标定时找不到目标标题行");
  if (select.value === context.baselineLineType) {
    context.semanticRestoreRevision = view.revision;
    return;
  }

  const beforeRestoreRevision = view.revision;
  select.value = context.baselineLineType;
  select.dispatchEvent(new Event("change", { bubbles: true }));
  view = deriveWorkspaceView(actor.getSnapshot());
  requireFeatureDebug(
    view.session === "chapter-dirty" && view.canSave,
    "恢复原标题层级后没有进入可保存状态",
  );

  executeProductAction("save");
  context.semanticRestoreRevision = await waitForCleanRevision(
    (nextRevision) =>
      Boolean(nextRevision)
      && nextRevision !== beforeRestoreRevision,
  );

  const restoredSelect = headingLineTypeSelectByPreview(context.targetRowText);
  requireFeatureDebug(restoredSelect, "产品恢复保存后找不到目标标题行");
  requireFeatureDebug(
    restoredSelect.value === context.baselineLineType,
    "产品恢复保存后标题层级未回到原值",
  );
}

async function restoreSaveReloadRawBaseline(): Promise<void> {
  const context = currentSaveReloadDebugContext();
  requireFeatureDebug(featureDebugChapterId, "功能调试安全副本不存在");

  let view = deriveWorkspaceView(actor.getSnapshot());
  if (view.session === "chapter-dirty") {
    while (view.canUndo) {
      executeProductAction("undo");
      view = deriveWorkspaceView(actor.getSnapshot());
    }
  }
  if (view.session !== "chapter-clean") {
    await reopenFeatureDebugChapter();
    view = deriveWorkspaceView(actor.getSnapshot());
  }

  if (view.revision !== context.baselineRevision) {
    requireFeatureDebug(view.revision, "安全清理前当前 revision 为空");
    const response = await fetch("/__workspace/chapter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        chapterId: featureDebugChapterId,
        expectedRevision: view.revision,
        workingText: context.baselineWorkingText,
        sidecar: context.baselineSidecar,
      }),
    });
    requireFeatureDebug(response.ok, "调试安全清理写回原始 sidecar 失败");
    const restored = await response.json() as {
      conflict?: boolean;
      revision?: string;
    };
    requireFeatureDebug(!restored.conflict, "调试安全清理发生 revision 冲突");
    requireFeatureDebug(
      restored.revision === context.baselineRevision,
      "调试安全清理未恢复原始 revision",
    );
  }

  await reopenFeatureDebugChapter();
  view = deriveWorkspaceView(actor.getSnapshot());
  requireFeatureDebug(
    view.revision === context.baselineRevision,
    "安全清理重入后 revision 不是原基线",
  );
}

async function prepareSaveReloadFeatureDebug(): Promise<void> {
  featureDebugMenu.close();
  requireInitializedFeatureDebugWorkspace();
  executeProductAction(
    "select-review-module",
    undefined,
    undefined,
    "章节标题",
  );

  const view = requireInitializedFeatureDebugWorkspace();
  requireFeatureDebug(view.revision, "保存标定调试基线 revision 为空");
  requireFeatureDebug(featureDebugChapterId, "功能调试安全副本不存在");

  const baselineResponse = await fetch(
    "/__workspace/chapter?chapterId="
      + encodeURIComponent(featureDebugChapterId),
    { cache: "no-store" },
  );
  requireFeatureDebug(baselineResponse.ok, "读取保存标定调试原始基线失败");
  const rawBaseline = await baselineResponse.json() as {
    workingText?: string;
    sidecar?: Record<string, unknown>;
    revision?: string;
  };
  requireFeatureDebug(
    rawBaseline.revision === view.revision,
    "原始基线 revision 与当前工作台不一致",
  );
  requireFeatureDebug(
    typeof rawBaseline.workingText === "string",
    "原始基线 working 缺失",
  );
  requireFeatureDebug(rawBaseline.sidecar, "原始基线 sidecar 缺失");

  const firstSelect = calibrationGridHost.querySelector<HTMLSelectElement>(
    ".calibration-line-type:not(:disabled)",
  );
  requireFeatureDebug(firstSelect, "章节标题表没有可编辑行类型下拉");
  const row = firstSelect.closest<HTMLElement>('[role="row"]');
  const preview = row?.querySelector<HTMLElement>(".chapter-heading-preview")
    ?.textContent?.trim();
  requireFeatureDebug(preview, "无法读取保存标定调试目标标题");

  const baselineLineType = firstSelect.value;
  const temporaryLineType =
    baselineLineType === "1 级标题" ? "2 级标题" : "1 级标题";
  requireFeatureDebug(
    Array.from(firstSelect.options).some(
      (option) => option.value === temporaryLineType,
    ),
    "目标标题行没有可用的临时层级选项",
  );

  saveReloadDebugContext = {
    targetRowText: preview,
    baselineLineType,
    temporaryLineType,
    baselineRevision: view.revision,
    baselineWorkingText: rawBaseline.workingText,
    baselineSidecar: rawBaseline.sidecar,
  };
}

function createSaveReloadFeatureDebugSteps(): readonly FeatureDebugStep[] {
  return [
    {
      label: "1 基线：记录目标标题层级与原 revision",
      run: () => {
        const context = currentSaveReloadDebugContext();
        const view = requireInitializedFeatureDebugWorkspace();
        const select = headingLineTypeSelectByPreview(context.targetRowText);
        requireFeatureDebug(select, "基线目标标题行不存在");
        requireFeatureDebug(
          select.value === context.baselineLineType,
          "基线标题层级与记录不一致",
        );
        requireFeatureDebug(
          view.revision === context.baselineRevision,
          "基线 revision 与记录不一致",
        );
      },
    },
    {
      label: "2 真实数据表下拉：临时改变标题层级",
      run: () => {
        const context = currentSaveReloadDebugContext();
        const select = headingLineTypeSelectByPreview(context.targetRowText);
        requireFeatureDebug(select, "找不到目标标题行真实下拉");
        select.value = context.temporaryLineType;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        const view = deriveWorkspaceView(actor.getSnapshot());
        requireFeatureDebug(
          view.session === "chapter-dirty",
          "改变标题层级后没有进入 dirty",
        );
        requireFeatureDebug(
          view.undoDepth === 1 && view.redoDepth === 0 && view.canSave,
          "改变标题层级后历史/保存状态不正确",
        );
        requireFeatureDebug(
          view.revision === context.baselineRevision,
          "未保存时 revision 不应改变",
        );
      },
    },
    {
      label: "3 真实保存标定：生成新 revision，历史清空",
      run: async () => {
        const context = currentSaveReloadDebugContext();
        executeProductAction("save");
        const savedRevision = await waitForCleanRevision(
          (nextRevision) =>
            Boolean(nextRevision)
            && nextRevision !== context.baselineRevision,
        );
        context.temporaryRevision = savedRevision;
        const view = deriveWorkspaceView(actor.getSnapshot());
        requireFeatureDebug(
          view.undoDepth === 0 && view.redoDepth === 0 && !view.canSave,
          "保存后历史/保存状态没有清空",
        );
        requireFeatureDebug(
          Boolean(actor.getSnapshot().context.lastSavedAt),
          "保存后 lastSavedAt 未更新",
        );
      },
    },
    {
      label: "4 关闭重入确认临时标定；产品恢复原标定，并执行安全原样清理",
      run: async () => {
        const context = currentSaveReloadDebugContext();
        requireFeatureDebug(context.temporaryRevision, "临时保存 revision 不存在");

        try {
          await reopenFeatureDebugChapter();
          const view = deriveWorkspaceView(actor.getSnapshot());
          requireFeatureDebug(
            view.revision === context.temporaryRevision,
            "重入后没有加载临时保存 revision",
          );
          const select = headingLineTypeSelectByPreview(context.targetRowText);
          requireFeatureDebug(select, "重入后目标标题行不存在");
          requireFeatureDebug(
            select.value === context.temporaryLineType,
            "重入后标题层级没有保持临时保存值",
          );
        } finally {
          try {
            await restoreSaveReloadSemanticBaseline();
          } finally {
            await restoreSaveReloadRawBaseline();
          }
        }
      },
    },
    {
      label: "5 再次关闭重入：确认原层级、原 revision 与 clean 0/0 全部恢复",
      run: async () => {
        const context = currentSaveReloadDebugContext();
        await reopenFeatureDebugChapter();
        const view = deriveWorkspaceView(actor.getSnapshot());
        const select = headingLineTypeSelectByPreview(context.targetRowText);
        requireFeatureDebug(select, "最终重入后目标标题行不存在");
        requireFeatureDebug(
          select.value === context.baselineLineType,
          "最终重入后标题层级未恢复基线",
        );
        requireFeatureDebug(
          view.revision === context.baselineRevision,
          "最终重入后 revision 未恢复原基线",
        );
        requireFeatureDebug(
          view.undoDepth === 0 && view.redoDepth === 0 && !view.canSave,
          "最终重入后历史/保存状态不干净",
        );
      },
    },
  ];
}

function recoverSaveReloadFeatureDebug(error: Error): void {
  const view = deriveWorkspaceView(actor.getSnapshot());
  if (view.session === "chapter-dirty" && view.canUndo) {
    executeProductAction("undo");
  }
  featureDebugEnvironmentReady = false;
  document.documentElement.dataset.featureDebugReady = "false";
  featureDebugRunner.refreshControls();
  sourceLocationStatus.textContent =
    "保存标定 / 重入加载功能调试失败 · 已优先尝试恢复安全副本 · 请检查工程状态 · "
    + error.message;
}

function currentCalibrationHeaderOrder(): string[] {
  return Array.from(
    calibrationGridHost.querySelectorAll<HTMLElement>(".ag-header-cell-text"),
  )
    .map((node) => ({
      text: node.textContent?.trim() ?? "",
      left: node.getBoundingClientRect().left,
    }))
    .sort((left, right) => left.left - right.left)
    .map((item) => item.text);
}

function sameStringArray(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

async function switchReviewModuleThroughRealTab(
  module: ActiveReviewModule,
  expectedRows: number,
  expectedHeaders: readonly string[],
): Promise<void> {
  const button = reviewModuleButtons.find(
    (candidate) => candidate.dataset.reviewModule === module,
  );
  requireFeatureDebug(button, `找不到 ${module} 正式数据表 tag`);
  requireFeatureDebug(!button.hidden && !button.disabled, `${module} tag 不可用`);
  button.click();

  const deadline = performance.now() + 3_000;
  while (performance.now() < deadline) {
    const view = deriveWorkspaceView(actor.getSnapshot());
    const headers = currentCalibrationHeaderOrder();
    if (
      view.session === "chapter-clean"
      && view.activeReviewModule === module
      && view.activeModuleRows === expectedRows
      && sameStringArray(headers, expectedHeaders)
      && button.getAttribute("aria-pressed") === "true"
    ) {
      requireFeatureDebug(
        view.undoDepth === 0 && view.redoDepth === 0 && !view.canSave,
        `${module} 切换后意外产生历史或 dirty`,
      );
      requireFeatureDebug(
        view.revision === featureDebugBaselineRevision,
        `${module} 切换后 revision 发生变化`,
      );
      return;
    }
    await new Promise<void>((resolve) => window.setTimeout(resolve, 25));
  }

  throw new Error(
    `${module} 数据表投影未在时限内稳定：`
      + currentCalibrationHeaderOrder().join(" / "),
  );
}

function prepareReviewModuleSwitchFeatureDebug(): void {
  featureDebugMenu.close();
  requireInitializedFeatureDebugWorkspace();
  const chapter = actor.getSnapshot().context.chapter;
  requireFeatureDebug(
    chapter?.kind === "chapter",
    "数据表模块切换调试需要普通章节",
  );

  const requiredModules: ActiveReviewModule[] = [
    "章节标题",
    "注释",
    "嵌入块",
    "非法断行",
  ];
  for (const module of requiredModules) {
    const button = reviewModuleButtons.find(
      (candidate) => candidate.dataset.reviewModule === module,
    );
    requireFeatureDebug(
      button && !button.hidden && !button.disabled,
      `${module} tag 当前不可用`,
    );
  }
}

function createReviewModuleSwitchFeatureDebugSteps(): readonly FeatureDebugStep[] {
  return [
    {
      label: "1 章节标题：10 行，列头为 行号 / 行类型 / 标题预览",
      run: () => switchReviewModuleThroughRealTab(
        "章节标题",
        10,
        ["行号", "行类型", "标题预览"],
      ),
    },
    {
      label: "2 注释：20 行，列头增加 注释号 / 配对状态",
      run: () => switchReviewModuleThroughRealTab(
        "注释",
        20,
        ["行号", "行类型", "注释号", "配对状态", "预览"],
      ),
    },
    {
      label: "3 嵌入块：51 行，列头为 组号 / 行号 / 行类型 / 预览",
      run: () => switchReviewModuleThroughRealTab(
        "嵌入块",
        51,
        ["组号", "行号", "行类型", "预览"],
      ),
    },
    {
      label: "4 非法断行：6 行；5 列，iPad 当前可见前4列",
      run: async () => {
        await switchReviewModuleThroughRealTab(
          "非法断行",
          6,
          ["断行处", "行类型", "预览（前10 + 后10）", "合并预览"],
        );
        const grid = calibrationGridHost.querySelector<HTMLElement>('[role="grid"]');
        requireFeatureDebug(
          grid?.getAttribute("aria-colcount") === "5",
          "非法断行 AG Grid 总列数不是 5",
        );
      },
    },
    {
      label: "5 回到章节标题：仍 clean 0/0，revision 不变",
      run: () => switchReviewModuleThroughRealTab(
        "章节标题",
        10,
        ["行号", "行类型", "标题预览"],
      ),
    },
  ];
}

function recoverReviewModuleSwitchFeatureDebug(error: Error): void {
  const titleButton = reviewModuleButtons.find(
    (candidate) => candidate.dataset.reviewModule === "章节标题",
  );
  if (titleButton && !titleButton.hidden && !titleButton.disabled) {
    titleButton.click();
  }
  featureDebugEnvironmentReady = false;
  document.documentElement.dataset.featureDebugReady = "false";
  featureDebugRunner.refreshControls();
  sourceLocationStatus.textContent =
    "数据表模块切换功能调试失败 · 已尝试回到章节标题 · 请重新初始化 · "
    + error.message;
}

async function clickFirstCalibrationRowForFeatureDebug(): Promise<number> {
  const row = calibrationGridHost.querySelector<HTMLElement>(".ag-row");
  requireFeatureDebug(row, "当前数据表没有可点击行");
  const rect = row.getBoundingClientRect();
  requireFeatureDebug(
    rect.width > 100 && rect.height > 20,
    "当前数据表第一行没有真实可点击尺寸",
  );
  row.click();

  const deadline = performance.now() + 3_000;
  while (performance.now() < deadline) {
    const view = deriveWorkspaceView(actor.getSnapshot());
    if (view.focusedSourceLine) return view.focusedSourceLine;
    await new Promise<void>((resolve) => window.setTimeout(resolve, 25));
  }
  throw new Error("点击数据表行后源码定位未在时限内完成");
}

function prepareReviewRowLocateFeatureDebug(): void {
  featureDebugMenu.close();
  const view = requireInitializedFeatureDebugWorkspace();
  const chapter = actor.getSnapshot().context.chapter;
  requireFeatureDebug(
    chapter?.kind === "chapter",
    "数据表行定位源码调试需要普通章节",
  );
  requireFeatureDebug(
    view.undoDepth === 0 && view.redoDepth === 0 && !view.canSave,
    "行定位调试基线不是 clean 0/0",
  );
  for (const module of ["章节标题", "非法断行"] as const) {
    const button = reviewModuleButtons.find(
      (candidate) => candidate.dataset.reviewModule === module,
    );
    requireFeatureDebug(
      button && !button.hidden && !button.disabled,
      `${module} tag 当前不可用`,
    );
  }
}

function createReviewRowLocateFeatureDebugSteps(): readonly FeatureDebugStep[] {
  let headingLine = 0;
  let illegalLine = 0;

  return [
    {
      label: "1 章节标题：先打开正则搜索抽屉，再点击真实表格行",
      run: async () => {
        await switchReviewModuleThroughRealTab(
          "章节标题",
          10,
          ["行号", "行类型", "标题预览"],
        );
        setSourcePaneMode("source");
        setRegexSearchOpen(true);
        requireFeatureDebug(
          !regexSearchPanel.hidden
            && regexSearchToggle.getAttribute("aria-expanded") === "true",
          "没有打开正则搜索抽屉",
        );

        headingLine = await clickFirstCalibrationRowForFeatureDebug();
        const view = requireInitializedFeatureDebugWorkspace();
        requireFeatureDebug(
          sourceEditorTab.getAttribute("aria-selected") === "true"
            && !workingEditorHost.hidden,
          "点击数据表行后没有自动切回源码 tag",
        );
        requireFeatureDebug(
          sourceLocationStatus.textContent === `源码定位：第 ${headingLine} 行`,
          "普通数据表行定位状态不正确",
        );
        requireFeatureDebug(
          workingEditorHost.contains(document.activeElement),
          "普通数据表行定位后 CodeMirror 没有获得焦点",
        );
        requireFeatureDebug(
          workingEditor.selectedText().trim().length > 0,
          "普通数据表行定位后没有选中对应源码",
        );
        requireFeatureDebug(
          view.undoDepth === 0 && view.redoDepth === 0 && !view.canSave,
          "普通行定位意外改变业务历史",
        );
      },
    },
    {
      label: "2 非法断行：从自定义 CSS tag 点击真实断行行",
      run: async () => {
        await switchReviewModuleThroughRealTab(
          "非法断行",
          6,
          ["断行处", "行类型", "预览（前10 + 后10）", "合并预览"],
        );
        setSourcePaneMode("css");
        requireFeatureDebug(sourcePaneMode === "css", "没有进入自定义 CSS tag");

        let contextText = "";
        const contextDeadline = performance.now() + 3_000;
        while (performance.now() < contextDeadline) {
          contextText = calibrationGridHost
            .querySelector<HTMLElement>(
              '.ag-row [col-id="illegalBreakContext"]',
            )
            ?.textContent?.trim() ?? "";
          if (contextText.includes(" ⏎ ")) break;
          await new Promise<void>((resolve) => window.setTimeout(resolve, 25));
        }
        const [expectedBefore, expectedAfter] = contextText.split(" ⏎ ");
        requireFeatureDebug(
          Boolean(expectedBefore && expectedAfter),
          "非法断行数据表缺少前10 / 后10上下文",
        );

        illegalLine = await clickFirstCalibrationRowForFeatureDebug();
        const view = requireInitializedFeatureDebugWorkspace();
        requireFeatureDebug(
          sourceEditorTab.getAttribute("aria-selected") === "true"
            && !workingEditorHost.hidden,
          "断行定位后没有自动切回源码 tag",
        );
        requireFeatureDebug(
          sourceLocationStatus.textContent
            === `已定位断行 · 第 ${illegalLine} 行 · 前后各 10 字`,
          "非法断行定位状态不正确",
        );
        requireFeatureDebug(
          workingEditorHost.contains(document.activeElement),
          "非法断行定位后 CodeMirror 没有获得焦点",
        );

        const selected = workingEditor.selectedText();
        const selectedLines = selected.split(/\r?\n/);
        requireFeatureDebug(
          selectedLines.length >= 2,
          "非法断行选区没有跨越真实换行",
        );
        const selectedBefore = selectedLines[0].trimEnd();
        const selectedAfter =
          selectedLines[selectedLines.length - 1].trimStart();
        requireFeatureDebug(
          selectedBefore === expectedBefore,
          "非法断行前文选区与数据表前10不一致 · "
            + JSON.stringify(selectedBefore)
            + " != " + JSON.stringify(expectedBefore),
        );
        requireFeatureDebug(
          selectedAfter === expectedAfter,
          "非法断行后文选区与数据表后10不一致 · "
            + JSON.stringify(selectedAfter)
            + " != " + JSON.stringify(expectedAfter),
        );
        requireFeatureDebug(
          Array.from(expectedBefore).length === 10
            && Array.from(expectedAfter).length === 10,
          "非法断行数据表上下文不是前10 / 后10",
        );
        requireFeatureDebug(
          view.undoDepth === 0 && view.redoDepth === 0 && !view.canSave,
          "非法断行定位意外改变业务历史",
        );
      },
    },
    {
      label: "3 收尾：回到章节标题；定位全过程 clean 0/0，revision 不变",
      run: async () => {
        await switchReviewModuleThroughRealTab(
          "章节标题",
          10,
          ["行号", "行类型", "标题预览"],
        );
        setSourcePaneMode("source");
        const view = requireInitializedFeatureDebugWorkspace();
        requireFeatureDebug(headingLine > 0 && illegalLine > 0, "两类行定位没有都完成");
        requireFeatureDebug(
          view.undoDepth === 0 && view.redoDepth === 0 && !view.canSave,
          "行定位调试收尾时业务状态不 clean",
        );
        requireFeatureDebug(
          view.revision === featureDebugBaselineRevision,
          "行定位调试意外改变持久化 revision",
        );
      },
    },
  ];
}

function recoverReviewRowLocateFeatureDebug(error: Error): void {
  const titleButton = reviewModuleButtons.find(
    (candidate) => candidate.dataset.reviewModule === "章节标题",
  );
  if (titleButton && !titleButton.hidden && !titleButton.disabled) {
    titleButton.click();
  }
  setSourcePaneMode("source");
  sourceLocationStatus.textContent =
    "数据表行定位源码功能调试失败 · 已尝试回到章节标题 / 源码 · "
    + error.message;
}

async function waitForLeaveSession(
  expected: "chapter-dirty" | "chapter-leave-confirm",
  timeoutMs = 5_000,
): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    if (deriveWorkspaceView(actor.getSnapshot()).session === expected) return;
    await new Promise<void>((resolve) => window.setTimeout(resolve, 25));
  }
  throw new Error("等待工作台状态 " + expected + " 超时");
}

function currentDirtyLeaveDebugContext(): DirtyLeaveDebugContext {
  requireFeatureDebug(
    dirtyLeaveDebugContext,
    "脏章节离开保护调试上下文不存在",
  );
  return dirtyLeaveDebugContext;
}

async function fetchRawChapter(
  chapterId: string,
): Promise<{
  workingText: string;
  sidecar: Record<string, unknown>;
  revision: string;
}> {
  const response = await fetch(
    "/__workspace/chapter?chapterId=" + encodeURIComponent(chapterId),
    { cache: "no-store" },
  );
  requireFeatureDebug(response.ok, "读取章节原始数据失败");
  return response.json() as Promise<{
    workingText: string;
    sidecar: Record<string, unknown>;
    revision: string;
  }>;
}

function selectChapterThroughProductUi(chapterId: string): void {
  chapterSelect.value = chapterId;
  chapterSelect.dispatchEvent(new Event("change", { bubbles: true }));
}

async function restoreDirtyLeaveRawBaseline(): Promise<void> {
  const context = currentDirtyLeaveDebugContext();
  requireFeatureDebug(featureDebugChapterId, "功能调试安全副本不存在");

  const raw = await fetchRawChapter(featureDebugChapterId);
  if (raw.revision !== context.baselineRevision) {
    const response = await fetch("/__workspace/chapter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        chapterId: featureDebugChapterId,
        expectedRevision: raw.revision,
        workingText: context.baselineWorkingText,
        sidecar: context.baselineSidecar,
      }),
    });
    requireFeatureDebug(response.ok, "脏章节调试安全清理写回失败");
    const restored = await response.json() as {
      conflict?: boolean;
      revision?: string;
    };
    requireFeatureDebug(!restored.conflict, "脏章节调试安全清理发生 revision 冲突");
    requireFeatureDebug(
      restored.revision === context.baselineRevision,
      "脏章节调试安全清理未恢复原 revision",
    );
  }

  let view = deriveWorkspaceView(actor.getSnapshot());
  if (view.session === "chapter-leave-confirm") {
    leaveCancelButton.click();
    await waitForLeaveSession("chapter-dirty");
    view = deriveWorkspaceView(actor.getSnapshot());
  }
  if (view.session === "chapter-dirty") {
    while (view.canUndo) {
      executeProductAction("undo");
      view = deriveWorkspaceView(actor.getSnapshot());
    }
  }
  if (view.session === "chapter-clean") {
    executeProductAction("close");
    await waitForWorkspaceSession("idle");
  }

  view = deriveWorkspaceView(actor.getSnapshot());
  if (view.session === "idle") {
    executeProductAction("open-chapter", undefined, featureDebugChapterId);
    await waitForWorkspaceSession("chapter-clean");
  } else if (actor.getSnapshot().context.chapter?.id !== featureDebugChapterId) {
    executeProductAction("close");
    await waitForWorkspaceSession("idle");
    executeProductAction("open-chapter", undefined, featureDebugChapterId);
    await waitForWorkspaceSession("chapter-clean");
  }

  executeProductAction(
    "select-review-module",
    undefined,
    undefined,
    "章节标题",
  );

  const finalRaw = await fetchRawChapter(featureDebugChapterId);
  const finalView = deriveWorkspaceView(actor.getSnapshot());
  requireFeatureDebug(
    finalRaw.workingText === context.baselineWorkingText,
    "安全清理后 working 未恢复原基线",
  );
  requireFeatureDebug(
    JSON.stringify(finalRaw.sidecar) === JSON.stringify(context.baselineSidecar),
    "安全清理后 sidecar 未恢复原基线",
  );
  requireFeatureDebug(
    finalRaw.revision === context.baselineRevision
      && finalView.revision === context.baselineRevision,
    "安全清理后 revision 未恢复原基线",
  );
}

async function prepareDirtyLeaveProtectionFeatureDebug(): Promise<void> {
  featureDebugMenu.close();
  const view = requireInitializedFeatureDebugWorkspace();
  requireFeatureDebug(featureDebugChapterId, "功能调试安全副本不存在");

  const target = view.chapters.find(
    (chapter) =>
      chapter.ready
      && chapter.id !== featureDebugChapterId
      && !chapter.name.includes("Incomplete"),
  );
  requireFeatureDebug(target, "没有第二个可用于切换保护测试的章节");

  const raw = await fetchRawChapter(featureDebugChapterId);
  requireFeatureDebug(
    raw.revision === featureDebugBaselineRevision,
    "安全副本磁盘 revision 已偏离初始化基线",
  );

  dirtyLeaveDebugContext = {
    baselineWorkingText: raw.workingText,
    baselineSidecar: raw.sidecar,
    baselineRevision: raw.revision,
    targetChapterId: target.id,
    targetChapterName: target.name,
  };
}

function createDirtyLeaveProtectionFeatureDebugSteps(): readonly FeatureDebugStep[] {
  const closePrefix = "功能调试离开保护：关闭\n";
  const switchPrefix = "功能调试离开保护：切换\n";

  return [
    {
      label: "1 关闭保护：dirty → 关闭 → 取消，未保存修改继续保留",
      run: async () => {
        const context = currentDirtyLeaveDebugContext();
        applyWorkingTextChange(closePrefix + context.baselineWorkingText);
        let view = deriveWorkspaceView(actor.getSnapshot());
        requireFeatureDebug(
          view.session === "chapter-dirty"
            && view.undoDepth === 1
            && view.canSave,
          "制造关闭场景 dirty 失败",
        );

        executeProductAction("close");
        await waitForLeaveSession("chapter-leave-confirm");
        view = deriveWorkspaceView(actor.getSnapshot());
        requireFeatureDebug(!leaveConfirmOverlay.hidden, "离开确认框没有显示");
        requireFeatureDebug(
          leaveConfirmMessage.textContent?.includes("关闭当前章节"),
          "关闭离开确认文案不正确",
        );
        requireFeatureDebug(
          !leaveCancelButton.disabled
            && !leaveDiscardButton.disabled
            && !leaveSaveButton.disabled,
          "离开确认三按钮没有全部可用",
        );

        leaveCancelButton.click();
        await waitForLeaveSession("chapter-dirty");
        requireFeatureDebug(leaveConfirmOverlay.hidden, "取消后确认框没有关闭");
        requireFeatureDebug(
          actor.getSnapshot().context.chapter?.workingText.startsWith(closePrefix),
          "取消关闭后未保存正文丢失",
        );
      },
    },
    {
      label: "2 关闭保护：再次关闭 → 放弃修改，重开后磁盘仍是原基线",
      run: async () => {
        const context = currentDirtyLeaveDebugContext();
        executeProductAction("close");
        await waitForLeaveSession("chapter-leave-confirm");
        leaveDiscardButton.click();
        await waitForWorkspaceSession("idle");

        executeProductAction("open-chapter", undefined, featureDebugChapterId);
        await waitForWorkspaceSession("chapter-clean");
        const raw = await fetchRawChapter(featureDebugChapterId!);
        const view = deriveWorkspaceView(actor.getSnapshot());
        requireFeatureDebug(
          raw.workingText === context.baselineWorkingText
            && raw.revision === context.baselineRevision,
          "放弃修改后磁盘基线被改变",
        );
        requireFeatureDebug(
          view.undoDepth === 0 && view.redoDepth === 0 && !view.canSave,
          "放弃修改重入后历史不干净",
        );
      },
    },
    {
      label: "3 切换保护：dirty → 切另一章节 → 取消，仍留在当前脏章节",
      run: async () => {
        const context = currentDirtyLeaveDebugContext();
        applyWorkingTextChange(switchPrefix + context.baselineWorkingText);
        requireFeatureDebug(
          deriveWorkspaceView(actor.getSnapshot()).session === "chapter-dirty",
          "制造切换场景 dirty 失败",
        );

        selectChapterThroughProductUi(context.targetChapterId);
        await waitForLeaveSession("chapter-leave-confirm");
        requireFeatureDebug(
          leaveConfirmMessage.textContent?.includes(context.targetChapterName),
          "切换离开确认没有显示目标章节",
        );

        leaveCancelButton.click();
        await waitForLeaveSession("chapter-dirty");
        requireFeatureDebug(
          actor.getSnapshot().context.chapter?.id === featureDebugChapterId
            && chapterSelect.value === featureDebugChapterId,
          "取消切换后没有恢复当前章节选择",
        );
        requireFeatureDebug(
          actor.getSnapshot().context.chapter?.workingText.startsWith(switchPrefix),
          "取消切换后未保存正文丢失",
        );
      },
    },
    {
      label: "4 保存并继续：再次切换 → 保存并继续，先保存安全副本再打开目标章节",
      run: async () => {
        const context = currentDirtyLeaveDebugContext();
        selectChapterThroughProductUi(context.targetChapterId);
        await waitForLeaveSession("chapter-leave-confirm");
        leaveSaveButton.click();

        const deadline = performance.now() + 8_000;
        while (performance.now() < deadline) {
          const view = deriveWorkspaceView(actor.getSnapshot());
          if (
            view.session === "chapter-clean"
            && actor.getSnapshot().context.chapter?.id === context.targetChapterId
          ) {
            break;
          }
          await new Promise<void>((resolve) => window.setTimeout(resolve, 25));
        }

        const view = deriveWorkspaceView(actor.getSnapshot());
        requireFeatureDebug(
          view.session === "chapter-clean"
            && actor.getSnapshot().context.chapter?.id === context.targetChapterId,
          "保存并继续后没有打开目标章节",
        );

        const persisted = await fetchRawChapter(featureDebugChapterId!);
        requireFeatureDebug(
          persisted.workingText.startsWith(switchPrefix),
          "保存并继续没有先持久化当前脏章节",
        );
        requireFeatureDebug(
          persisted.revision !== context.baselineRevision,
          "保存并继续没有生成临时 revision",
        );
      },
    },
    {
      label: "5 安全清理：恢复原 working / sidecar / revision，并重回 clean 0/0",
      run: async () => {
        await restoreDirtyLeaveRawBaseline();
        const context = currentDirtyLeaveDebugContext();
        const view = requireInitializedFeatureDebugWorkspace();
        requireFeatureDebug(
          view.revision === context.baselineRevision,
          "最终工作台 revision 未回到原基线",
        );
        requireFeatureDebug(
          view.undoDepth === 0 && view.redoDepth === 0 && !view.canSave,
          "最终工作台不是 clean 0/0",
        );
      },
    },
  ];
}

function recoverDirtyLeaveProtectionFeatureDebug(error: Error): void {
  featureDebugEnvironmentReady = false;
  document.documentElement.dataset.featureDebugReady = "false";
  featureDebugRunner.refreshControls();
  sourceLocationStatus.textContent =
    "脏章节离开保护功能调试失败 · 正在尝试恢复安全副本 · " + error.message;

  void restoreDirtyLeaveRawBaseline()
    .then(() => {
      sourceLocationStatus.textContent =
        "脏章节离开保护功能调试失败 · 安全副本已恢复 · 请重新初始化";
    })
    .catch((restoreError) => {
      sourceLocationStatus.textContent =
        "脏章节离开保护功能调试失败 · 安全恢复也失败 · "
        + (restoreError instanceof Error ? restoreError.message : String(restoreError));
    });
}

function currentIllegalLineBreakDebugContext(): IllegalLineBreakDebugContext {
  requireFeatureDebug(
    illegalLineBreakDebugContext,
    "非法断行模块调试上下文不存在",
  );
  return illegalLineBreakDebugContext;
}

async function waitForIllegalLineBreakView(
  predicate: (view: ReturnType<typeof deriveWorkspaceView>) => boolean,
  message: string,
  timeoutMs = 5_000,
): Promise<ReturnType<typeof deriveWorkspaceView>> {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    const view = deriveWorkspaceView(actor.getSnapshot());
    if (predicate(view)) return view;
    await new Promise<void>((resolve) => window.setTimeout(resolve, 25));
  }
  throw new Error(message);
}

function firstIllegalLineTypeSelect(): HTMLSelectElement | undefined {
  return calibrationGridHost.querySelector<HTMLSelectElement>(
    ".ag-row select.calibration-line-type:not(:disabled)",
  ) ?? undefined;
}

async function firstIllegalBreakReason(): Promise<string> {
  const horizontalScroll = calibrationGridHost.querySelector<HTMLElement>(
    ".ag-body-horizontal-scroll-viewport",
  );
  requireFeatureDebug(horizontalScroll, "非法断行表缺少横向滚动容器");

  horizontalScroll.scrollLeft = horizontalScroll.scrollWidth;
  horizontalScroll.dispatchEvent(new Event("scroll"));
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );

  const reason = calibrationGridHost.querySelector<HTMLElement>(
    '.ag-row [col-id="breakReason"]',
  )?.textContent?.trim() ?? "";

  horizontalScroll.scrollLeft = 0;
  horizontalScroll.dispatchEvent(new Event("scroll"));
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => resolve()),
  );

  return reason;
}

async function restoreIllegalLineBreakRawBaseline(): Promise<void> {
  const context = currentIllegalLineBreakDebugContext();
  requireFeatureDebug(featureDebugChapterId, "功能调试安全副本不存在");

  let view = deriveWorkspaceView(actor.getSnapshot());

  if (view.session === "chapter-leave-confirm") {
    leaveCancelButton.click();
    await waitForLeaveSession("chapter-dirty");
    view = deriveWorkspaceView(actor.getSnapshot());
  }

  if (view.session === "chapter-dirty") {
    while (view.canUndo) {
      executeProductAction("undo");
      view = deriveWorkspaceView(actor.getSnapshot());
    }
  }

  if (view.session === "chapter-clean") {
    executeProductAction("close");
    await waitForWorkspaceSession("idle");
  }

  view = deriveWorkspaceView(actor.getSnapshot());
  if (
    view.session !== "idle"
    && actor.getSnapshot().context.chapter?.id !== featureDebugChapterId
  ) {
    if (view.session === "chapter-clean") {
      executeProductAction("close");
      await waitForWorkspaceSession("idle");
    }
  }

  const raw = await fetchRawChapter(featureDebugChapterId);
  if (raw.revision !== context.baselineRevision) {
    const response = await fetch("/__workspace/chapter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        chapterId: featureDebugChapterId,
        expectedRevision: raw.revision,
        workingText: context.baselineWorkingText,
        sidecar: context.baselineSidecar,
      }),
    });
    requireFeatureDebug(response.ok, "非法断行调试安全清理写回失败");
    const restored = await response.json() as {
      conflict?: boolean;
      revision?: string;
    };
    requireFeatureDebug(!restored.conflict, "非法断行调试安全清理发生 revision 冲突");
    requireFeatureDebug(
      restored.revision === context.baselineRevision,
      "非法断行调试安全清理未恢复原 revision",
    );
  }

  view = deriveWorkspaceView(actor.getSnapshot());
  if (view.session !== "idle") {
    if (view.session === "chapter-clean") {
      executeProductAction("close");
      await waitForWorkspaceSession("idle");
    } else {
      requireFeatureDebug(false, "非法断行调试清理时工作台无法回到 idle");
    }
  }

  executeProductAction("open-chapter", undefined, featureDebugChapterId);
  await waitForWorkspaceSession("chapter-clean");
  executeProductAction(
    "select-review-module",
    undefined,
    undefined,
    "非法断行",
  );

  const finalView = await waitForIllegalLineBreakView(
    (candidate) =>
      candidate.session === "chapter-clean"
      && candidate.activeReviewModule === "非法断行"
      && candidate.activeModuleRows === context.baselineActiveRows,
    "非法断行安全清理后模块没有恢复基线",
  );
  const finalRaw = await fetchRawChapter(featureDebugChapterId);

  requireFeatureDebug(
    finalRaw.workingText === context.baselineWorkingText,
    "非法断行安全清理后 working 未恢复原基线",
  );
  requireFeatureDebug(
    JSON.stringify(finalRaw.sidecar) === JSON.stringify(context.baselineSidecar),
    "非法断行安全清理后 sidecar 未恢复原基线",
  );
  requireFeatureDebug(
    finalRaw.revision === context.baselineRevision
      && finalView.revision === context.baselineRevision,
    "非法断行安全清理后 revision 未恢复原基线",
  );
  requireFeatureDebug(
    finalView.illegalMergeDecisionCount === context.baselineMergeDecisionCount
      && finalView.illegalMergeSpanCount === context.baselineMergeSpanCount
      && finalView.ignoredIllegalLineBreakRows === context.baselineIgnoredCount,
    "非法断行安全清理后导出决策计数未恢复",
  );
  requireFeatureDebug(
    finalView.undoDepth === 0 && finalView.redoDepth === 0 && !finalView.canSave,
    "非法断行安全清理后历史不干净",
  );
}

async function prepareIllegalLineBreakFeatureDebug(): Promise<void> {
  featureDebugMenu.close();
  const initialView = requireInitializedFeatureDebugWorkspace();
  requireFeatureDebug(featureDebugChapterId, "功能调试安全副本不存在");

  executeProductAction(
    "select-review-module",
    undefined,
    undefined,
    "非法断行",
  );

  const view = await waitForIllegalLineBreakView(
    (candidate) =>
      candidate.session === "chapter-clean"
      && candidate.activeReviewModule === "非法断行",
    "无法进入非法断行模块",
  );
  const raw = await fetchRawChapter(featureDebugChapterId);

  requireFeatureDebug(
    raw.revision === featureDebugBaselineRevision
      && view.revision === featureDebugBaselineRevision,
    "非法断行调试基线 revision 不一致",
  );
  requireFeatureDebug(
    initialView.workingLength === raw.workingText.length,
    "非法断行调试基线 working 长度不一致",
  );
  requireFeatureDebug(view.activeModuleRows > 0, "安全副本没有非法断行候选");

  illegalLineBreakDebugContext = {
    baselineWorkingText: raw.workingText,
    baselineSidecar: raw.sidecar,
    baselineRevision: raw.revision,
    baselineWorkingLength: raw.workingText.length,
    baselineActiveRows: view.activeModuleRows,
    baselineMergeDecisionCount: view.illegalMergeDecisionCount,
    baselineMergeSpanCount: view.illegalMergeSpanCount,
    baselineIgnoredCount: view.ignoredIllegalLineBreakRows,
  };
}

function createIllegalLineBreakFeatureDebugSteps(): readonly FeatureDebugStep[] {
  return [
    {
      label: "1 表格基线：6 条候选；5 列；前10/后10、合并预览、判断都有效",
      run: async () => {
        const context = currentIllegalLineBreakDebugContext();
        const view = deriveWorkspaceView(actor.getSnapshot());

        requireFeatureDebug(
          view.activeReviewModule === "非法断行"
            && view.activeModuleRows === context.baselineActiveRows
            && context.baselineActiveRows === 6,
          "非法断行安全副本基线不是 6 条可见候选",
        );
        requireFeatureDebug(
          calibrationGridHost.querySelector('[role="grid"]')
            ?.getAttribute("aria-colcount") === "5",
          "非法断行 AG Grid 总列数不是 5",
        );

        const firstRow = calibrationGridHost.querySelector<HTMLElement>(".ag-row");
        requireFeatureDebug(firstRow, "非法断行表没有第一行");

        const contextPreview = firstRow.querySelector<HTMLElement>(
          ".illegal-line-break-preview",
        )?.textContent ?? "";
        const [left = "", right = ""] = contextPreview
          .split("⏎")
          .map((part) => part.trim());
        requireFeatureDebug(
          Array.from(left).length === 10 && Array.from(right).length === 10,
          "非法断行上下文不是前10 / 后10",
        );

        const merged = firstRow.querySelector<HTMLElement>(
          '[col-id="illegalBreakMerged"]',
        )?.textContent?.trim() ?? "";
        requireFeatureDebug(
          Array.from(merged).length > 20,
          "非法断行合并预览过短或为空",
        );

        const reason = await firstIllegalBreakReason();
        requireFeatureDebug(reason.length > 0, "非法断行判断列为空");

        const select = firstIllegalLineTypeSelect();
        requireFeatureDebug(select, "非法断行第一行没有行类型下拉");
        requireFeatureDebug(select.value === "合并", "非法断行第一行基线不是“合并”");
        requireFeatureDebug(
          Array.from(select.options).map((option) => option.value).join("|")
            === "合并|已忽略",
          "非法断行行类型选项不是“合并 / 已忽略”",
        );

        requireFeatureDebug(
          view.illegalMergeDecisionCount === 6
            && view.illegalMergeSpanCount === 6
            && view.ignoredIllegalLineBreakRows === 3,
          "非法断行导出基线不是 6 组合并 / 3 条已忽略",
        );
      },
    },
    {
      label: "2 真实下拉：第一条“合并 → 已忽略”，候选与导出决策同步 6→5",
      run: async () => {
        const context = currentIllegalLineBreakDebugContext();
        const select = firstIllegalLineTypeSelect();
        requireFeatureDebug(select, "非法断行第一行下拉不存在");

        select.value = "已忽略";
        select.dispatchEvent(new Event("change", { bubbles: true }));

        const view = await waitForIllegalLineBreakView(
          (candidate) =>
            candidate.session === "chapter-dirty"
            && candidate.activeModuleRows === context.baselineActiveRows - 1,
          "非法断行改为已忽略后没有进入 5 条 dirty 状态",
        );

        requireFeatureDebug(
          view.workingLength === context.baselineWorkingLength,
          "非法断行标定不应改变 working 文本",
        );
        requireFeatureDebug(
          view.illegalMergeDecisionCount === context.baselineMergeDecisionCount - 1
            && view.illegalMergeSpanCount === context.baselineMergeSpanCount - 1
            && view.ignoredIllegalLineBreakRows === context.baselineIgnoredCount + 1,
          "非法断行忽略后导出决策没有同步 6→5",
        );
        requireFeatureDebug(
          view.undoDepth === 1 && view.redoDepth === 0 && view.canSave,
          "非法断行忽略后历史/保存状态不正确",
        );
      },
    },
    {
      label: "3 Undo / Redo：6→5 可逆，working 始终不变",
      run: async () => {
        const context = currentIllegalLineBreakDebugContext();

        undoButton.click();
        let view = await waitForIllegalLineBreakView(
          (candidate) =>
            candidate.session === "chapter-clean"
            && candidate.activeModuleRows === context.baselineActiveRows,
          "非法断行 Undo 没有恢复 6 条基线",
        );
        requireFeatureDebug(
          view.illegalMergeDecisionCount === context.baselineMergeDecisionCount
            && view.illegalMergeSpanCount === context.baselineMergeSpanCount
            && view.ignoredIllegalLineBreakRows === context.baselineIgnoredCount,
          "非法断行 Undo 后导出决策没有恢复",
        );
        requireFeatureDebug(
          view.workingLength === context.baselineWorkingLength
            && view.redoDepth === 1,
          "非法断行 Undo 后 working / Redo 状态不正确",
        );

        redoButton.click();
        view = await waitForIllegalLineBreakView(
          (candidate) =>
            candidate.session === "chapter-dirty"
            && candidate.activeModuleRows === context.baselineActiveRows - 1,
          "非法断行 Redo 没有重新回到 5 条",
        );
        requireFeatureDebug(
          view.illegalMergeDecisionCount === context.baselineMergeDecisionCount - 1
            && view.illegalMergeSpanCount === context.baselineMergeSpanCount - 1
            && view.workingLength === context.baselineWorkingLength,
          "非法断行 Redo 后导出决策或 working 不正确",
        );
      },
    },
    {
      label: "4 保存 / 重入：5 条决策持久化，working 文本不变",
      run: async () => {
        const context = currentIllegalLineBreakDebugContext();

        saveButton.click();
        context.temporaryRevision = await waitForCleanRevision(
          (nextRevision) =>
            Boolean(nextRevision)
            && nextRevision !== context.baselineRevision,
        );

        let view = deriveWorkspaceView(actor.getSnapshot());
        requireFeatureDebug(
          view.session === "chapter-clean"
            && view.undoDepth === 0
            && view.redoDepth === 0
            && !view.canSave,
          "非法断行保存后状态不 clean",
        );

        executeProductAction("close");
        await waitForWorkspaceSession("idle");
        executeProductAction("open-chapter", undefined, featureDebugChapterId);
        await waitForWorkspaceSession("chapter-clean");
        executeProductAction(
          "select-review-module",
          undefined,
          undefined,
          "非法断行",
        );

        view = await waitForIllegalLineBreakView(
          (candidate) =>
            candidate.activeReviewModule === "非法断行"
            && candidate.activeModuleRows === context.baselineActiveRows - 1,
          "非法断行保存重入后没有保持 5 条",
        );

        requireFeatureDebug(
          view.revision === context.temporaryRevision
            && view.illegalMergeDecisionCount === context.baselineMergeDecisionCount - 1
            && view.illegalMergeSpanCount === context.baselineMergeSpanCount - 1
            && view.workingLength === context.baselineWorkingLength,
          "非法断行保存重入后的 revision / 导出决策 / working 不正确",
        );
      },
    },
    {
      label: "5 安全清理：恢复原 6 条、原 working / sidecar / revision、clean 0/0",
      run: async () => {
        await restoreIllegalLineBreakRawBaseline();
        const context = currentIllegalLineBreakDebugContext();
        const view = requireInitializedFeatureDebugWorkspace();

        requireFeatureDebug(
          view.activeReviewModule === "非法断行"
            && view.activeModuleRows === context.baselineActiveRows
            && view.illegalMergeDecisionCount === context.baselineMergeDecisionCount
            && view.illegalMergeSpanCount === context.baselineMergeSpanCount
            && view.ignoredIllegalLineBreakRows === context.baselineIgnoredCount,
          "非法断行最终可见候选 / 导出决策未恢复原基线",
        );
        requireFeatureDebug(
          view.revision === context.baselineRevision
            && view.workingLength === context.baselineWorkingLength
            && view.undoDepth === 0
            && view.redoDepth === 0
            && !view.canSave,
          "非法断行最终 working / revision / 历史未恢复原基线",
        );
      },
    },
  ];
}

function recoverIllegalLineBreakFeatureDebug(error: Error): void {
  featureDebugEnvironmentReady = false;
  document.documentElement.dataset.featureDebugReady = "false";
  featureDebugRunner.refreshControls();
  sourceLocationStatus.textContent =
    "非法断行模块功能调试失败 · 正在尝试恢复安全副本 · " + error.message;

  void restoreIllegalLineBreakRawBaseline()
    .then(() => {
      sourceLocationStatus.textContent =
        "非法断行模块功能调试失败 · 安全副本已恢复 · 请重新初始化";
    })
    .catch((restoreError) => {
      sourceLocationStatus.textContent =
        "非法断行模块功能调试失败 · 安全恢复也失败 · "
        + (restoreError instanceof Error ? restoreError.message : String(restoreError));
    });
}

const CHANGED_LINE_DEBUG_PREFIX = "变动行功能调试临时正文\n";

function currentChangedLineDebugContext(): ChangedLineDebugContext {
  requireFeatureDebug(
    changedLineDebugContext,
    "变动行模块调试上下文不存在",
  );
  return changedLineDebugContext;
}

async function waitForChangedLineView(
  predicate: (view: ReturnType<typeof deriveWorkspaceView>) => boolean,
  message: string,
  timeoutMs = 5_000,
): Promise<ReturnType<typeof deriveWorkspaceView>> {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    const view = deriveWorkspaceView(actor.getSnapshot());
    if (predicate(view)) return view;
    await new Promise<void>((resolve) => window.setTimeout(resolve, 25));
  }
  throw new Error(message);
}

async function restoreChangedLineRawBaseline(): Promise<void> {
  const context = currentChangedLineDebugContext();
  requireFeatureDebug(featureDebugChapterId, "功能调试安全副本不存在");

  let view = deriveWorkspaceView(actor.getSnapshot());
  if (view.session === "chapter-leave-confirm") {
    leaveCancelButton.click();
    await waitForLeaveSession("chapter-dirty");
    view = deriveWorkspaceView(actor.getSnapshot());
  }

  if (view.session === "chapter-dirty") {
    while (view.canUndo) {
      executeProductAction("undo");
      view = deriveWorkspaceView(actor.getSnapshot());
    }
  }

  view = deriveWorkspaceView(actor.getSnapshot());
  if (view.session === "chapter-dirty") {
    executeProductAction("close");
    await waitForLeaveSession("chapter-leave-confirm");
    executeProductAction("leave-discard");
    await waitForWorkspaceSession("idle");
  } else if (view.session === "chapter-clean") {
    executeProductAction("close");
    await waitForWorkspaceSession("idle");
  }

  view = deriveWorkspaceView(actor.getSnapshot());
  if (view.session !== "idle") {
    requireFeatureDebug(false, "变动行调试安全清理无法进入 idle");
  }

  const raw = await fetchRawChapter(featureDebugChapterId);
  if (raw.revision !== context.baselineRevision) {
    const response = await fetch("/__workspace/chapter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        chapterId: featureDebugChapterId,
        expectedRevision: raw.revision,
        workingText: context.baselineWorkingText,
        sidecar: context.baselineSidecar,
      }),
    });
    requireFeatureDebug(response.ok, "变动行调试安全清理写回失败");
    const restored = await response.json() as {
      conflict?: boolean;
      revision?: string;
    };
    requireFeatureDebug(!restored.conflict, "变动行调试安全清理发生 revision 冲突");
    requireFeatureDebug(
      restored.revision === context.baselineRevision,
      "变动行调试安全清理未恢复原 revision",
    );
  }

  executeProductAction("open-chapter", undefined, featureDebugChapterId);
  await waitForWorkspaceSession("chapter-clean");
  executeProductAction(
    "select-review-module",
    undefined,
    undefined,
    "变动行",
  );

  const finalView = await waitForChangedLineView(
    (candidate) =>
      candidate.session === "chapter-clean"
      && candidate.activeReviewModule === "变动行"
      && candidate.changedLineCount === context.baselineChangedRows,
    "变动行安全清理后模块没有恢复基线",
  );
  const finalRaw = await fetchRawChapter(featureDebugChapterId);

  requireFeatureDebug(
    finalRaw.workingText === context.baselineWorkingText,
    "变动行安全清理后 working 未恢复原基线",
  );
  requireFeatureDebug(
    JSON.stringify(finalRaw.sidecar) === JSON.stringify(context.baselineSidecar),
    "变动行安全清理后 sidecar 未恢复原基线",
  );
  requireFeatureDebug(
    finalRaw.revision === context.baselineRevision
      && finalView.revision === context.baselineRevision,
    "变动行安全清理后 revision 未恢复原基线",
  );
  requireFeatureDebug(
    finalView.workingLength === context.baselineWorkingLength
      && finalView.undoDepth === 0
      && finalView.redoDepth === 0
      && !finalView.canSave,
    "变动行安全清理后 working / 历史不干净",
  );
  requireFeatureDebug(
    !changedLineModuleButton()?.hasAttribute("data-change-notice"),
    "变动行安全清理后仍残留未读提醒",
  );
}

async function prepareChangedLineFeatureDebug(): Promise<void> {
  featureDebugMenu.close();
  const initialView = requireInitializedFeatureDebugWorkspace();
  requireFeatureDebug(featureDebugChapterId, "功能调试安全副本不存在");

  executeProductAction(
    "select-review-module",
    undefined,
    undefined,
    "变动行",
  );
  const view = await waitForChangedLineView(
    (candidate) =>
      candidate.session === "chapter-clean"
      && candidate.activeReviewModule === "变动行",
    "无法进入变动行模块",
  );
  const raw = await fetchRawChapter(featureDebugChapterId);

  requireFeatureDebug(
    raw.revision === featureDebugBaselineRevision
      && view.revision === featureDebugBaselineRevision,
    "变动行调试基线 revision 不一致",
  );
  requireFeatureDebug(
    initialView.workingLength === raw.workingText.length,
    "变动行调试基线 working 长度不一致",
  );
  requireFeatureDebug(
    view.changedLineCount === 41
      && view.activeModuleRows === 41
      && raw.workingText.length === 63833,
    "安全副本变动行基线不是 41 行 / 63833 字符",
  );

  changedLineDebugContext = {
    baselineWorkingText: raw.workingText,
    baselineSidecar: raw.sidecar,
    baselineRevision: raw.revision,
    baselineWorkingLength: raw.workingText.length,
    baselineChangedRows: view.changedLineCount,
  };
}

function createChangedLineFeatureDebugSteps(): readonly FeatureDebugStep[] {
  return [
    {
      label: "1 基线：41 条完整 diff；5 列；新增/修改/删除与归属并存；clean 0/0",
      run: () => {
        const context = currentChangedLineDebugContext();
        const view = deriveWorkspaceView(actor.getSnapshot());
        requireFeatureDebug(
          view.activeReviewModule === "变动行"
            && view.activeModuleRows === context.baselineChangedRows
            && view.changedLineCount === 41,
          "变动行安全副本基线不是 41 条",
        );
        requireFeatureDebug(
          calibrationGridHost.querySelector('[role="grid"]')
            ?.getAttribute("aria-colcount") === "5",
          "变动行 AG Grid 总列数不是 5",
        );
        requireFeatureDebug(
          view.changedLineAddedCount > 0
            && view.changedLineModifiedCount > 0
            && view.changedLineDeletedCount > 0
            && view.changedLineUnclassifiedCount > 0,
          "变动行基线没有同时覆盖新增/修改/删除/未归类",
        );
        requireFeatureDebug(
          Boolean(calibrationGridHost.querySelector(".row-deleted-change")),
          "变动行基线没有删除行视觉状态",
        );
        requireFeatureDebug(
          view.workingLength === 63833
            && view.undoDepth === 0
            && view.redoDepth === 0
            && !view.canSave,
          "变动行基线不是 63833 / clean 0/0",
        );
        requireFeatureDebug(
          !changedLineModuleButton()?.hasAttribute("data-change-notice"),
          "打开变动行基线时不应存在 +N 提醒",
        );
      },
    },
    {
      label: "2 临时正文：真实 working 产生新 diff，变动行 +N 提醒且完整 diff 增加",
      run: async () => {
        const context = currentChangedLineDebugContext();
        executeProductAction(
          "select-review-module",
          undefined,
          undefined,
          "章节标题",
        );
        await waitForChangedLineView(
          (candidate) => candidate.activeReviewModule === "章节标题",
          "变动行调试无法离开变动行模块",
        );

        applyWorkingTextChange(
          CHANGED_LINE_DEBUG_PREFIX + context.baselineWorkingText,
        );
        const view = await waitForChangedLineView(
          (candidate) =>
            candidate.session === "chapter-dirty"
            && candidate.changedLineCount > context.baselineChangedRows,
          "临时正文没有产生新的变动行",
        );

        requireFeatureDebug(
          view.workingLength
            === context.baselineWorkingLength + CHANGED_LINE_DEBUG_PREFIX.length,
          "临时正文 working 长度不正确",
        );
        requireFeatureDebug(
          view.changedLineRows.some(
            (row) =>
              row.workingText === CHANGED_LINE_DEBUG_PREFIX.trimEnd()
              && row.state === "新增"
              && row.owner === "未归类",
          ),
          "临时正文没有形成“新增 / 未归类”审计行",
        );
        requireFeatureDebug(
          /^\+\d+$/.test(
            changedLineModuleButton()?.getAttribute("data-change-notice") ?? "",
          ),
          "临时正文后变动行没有出现 +N 提醒",
        );
        requireFeatureDebug(
          view.undoDepth === 1 && view.redoDepth === 0 && view.canSave,
          "临时正文后历史/保存状态不正确",
        );
      },
    },
    {
      label: "3 访问 + Undo/Redo：进入变动行清 +N；Undo 回 41；Redo 再产生 +N",
      run: async () => {
        const context = currentChangedLineDebugContext();

        executeProductAction(
          "select-review-module",
          undefined,
          undefined,
          "变动行",
        );
        let view = await waitForChangedLineView(
          (candidate) =>
            candidate.activeReviewModule === "变动行"
            && candidate.changedLineCount > context.baselineChangedRows,
          "进入变动行后没有显示新增 diff",
        );
        requireFeatureDebug(
          !changedLineModuleButton()?.hasAttribute("data-change-notice"),
          "访问变动行后 +N 没有清零",
        );

        executeProductAction(
          "select-review-module",
          undefined,
          undefined,
          "章节标题",
        );
        executeProductAction("undo");
        view = await waitForChangedLineView(
          (candidate) =>
            candidate.session === "chapter-clean"
            && candidate.changedLineCount === context.baselineChangedRows,
          "变动行 Undo 没有恢复 41 条基线",
        );
        requireFeatureDebug(
          !changedLineModuleButton()?.hasAttribute("data-change-notice")
            && view.redoDepth === 1,
          "变动行 Undo 后提醒/Redo 状态不正确",
        );

        executeProductAction("redo");
        view = await waitForChangedLineView(
          (candidate) =>
            candidate.session === "chapter-dirty"
            && candidate.changedLineCount > context.baselineChangedRows,
          "变动行 Redo 没有恢复临时 diff",
        );
        requireFeatureDebug(
          /^\+\d+$/.test(
            changedLineModuleButton()?.getAttribute("data-change-notice") ?? "",
          ),
          "变动行 Redo 后没有重新出现 +N",
        );
      },
    },
    {
      label: "4 保存 / 重入：临时 diff 持久化；Save 不清未读；重入仍按 original 审计",
      run: async () => {
        const context = currentChangedLineDebugContext();

        saveButton.click();
        context.temporaryRevision = await waitForCleanRevision(
          (nextRevision) =>
            Boolean(nextRevision)
            && nextRevision !== context.baselineRevision,
        );
        let view = deriveWorkspaceView(actor.getSnapshot());
        requireFeatureDebug(
          view.session === "chapter-clean"
            && view.changedLineCount > context.baselineChangedRows
            && /^\+\d+$/.test(
              changedLineModuleButton()?.getAttribute("data-change-notice") ?? "",
            ),
          "变动行保存后 diff 或 +N 被错误清空",
        );

        executeProductAction("close");
        await waitForWorkspaceSession("idle");
        executeProductAction("open-chapter", undefined, featureDebugChapterId);
        await waitForWorkspaceSession("chapter-clean");

        view = await waitForChangedLineView(
          (candidate) =>
            candidate.changedLineCount > context.baselineChangedRows
            && candidate.revision === context.temporaryRevision,
          "变动行保存重入后没有保留 working-vs-original diff",
        );
        requireFeatureDebug(
          view.workingLength
            === context.baselineWorkingLength + CHANGED_LINE_DEBUG_PREFIX.length,
          "变动行保存重入后 working 长度不正确",
        );
        requireFeatureDebug(
          !changedLineModuleButton()?.hasAttribute("data-change-notice"),
          "章节重入时既有 diff 不应被误报为新 +N",
        );

        executeProductAction(
          "select-review-module",
          undefined,
          undefined,
          "变动行",
        );
        await waitForChangedLineView(
          (candidate) =>
            candidate.activeReviewModule === "变动行"
            && candidate.changedLineCount > context.baselineChangedRows,
          "变动行保存重入后无法重新打开审计表",
        );
      },
    },
    {
      label: "5 安全清理：恢复原 41 条 / 63833 / sidecar / revision / clean 0/0",
      run: async () => {
        await restoreChangedLineRawBaseline();
        const context = currentChangedLineDebugContext();
        const view = requireInitializedFeatureDebugWorkspace();

        requireFeatureDebug(
          view.activeReviewModule === "变动行"
            && view.changedLineCount === context.baselineChangedRows
            && view.activeModuleRows === context.baselineChangedRows,
          "变动行最终没有恢复 41 条基线",
        );
        requireFeatureDebug(
          view.workingLength === context.baselineWorkingLength
            && view.revision === context.baselineRevision
            && view.undoDepth === 0
            && view.redoDepth === 0
            && !view.canSave,
          "变动行最终 working / revision / 历史未恢复原基线",
        );
      },
    },
  ];
}

function recoverChangedLineFeatureDebug(error: Error): void {
  featureDebugEnvironmentReady = false;
  document.documentElement.dataset.featureDebugReady = "false";
  featureDebugRunner.refreshControls();
  sourceLocationStatus.textContent =
    "变动行模块功能调试失败 · 正在尝试恢复安全副本 · " + error.message;

  void restoreChangedLineRawBaseline()
    .then(() => {
      sourceLocationStatus.textContent =
        "变动行模块功能调试失败 · 安全副本已恢复 · 请重新初始化";
    })
    .catch((restoreError) => {
      sourceLocationStatus.textContent =
        "变动行模块功能调试失败 · 安全恢复也失败 · "
        + (restoreError instanceof Error ? restoreError.message : String(restoreError));
    });
}

function currentChapterTitleDebugContext(): ChapterTitleDebugContext {
  requireFeatureDebug(
    chapterTitleDebugContext,
    "章节标题模块调试上下文不存在",
  );
  return chapterTitleDebugContext;
}

async function waitForChapterTitleView(
  predicate: (view: ReturnType<typeof deriveWorkspaceView>) => boolean,
  message: string,
  timeoutMs = 5_000,
): Promise<ReturnType<typeof deriveWorkspaceView>> {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    const view = deriveWorkspaceView(actor.getSnapshot());
    if (predicate(view)) return view;
    await new Promise<void>((resolve) => window.setTimeout(resolve, 25));
  }
  throw new Error(message);
}

function chapterTitleRow(index: number): HTMLElement | undefined {
  return calibrationGridHost.querySelector<HTMLElement>(
    `.ag-row[row-index="${index}"]`,
  ) ?? undefined;
}

function chapterTitleSelect(index: number): HTMLSelectElement | undefined {
  return chapterTitleRow(index)?.querySelector<HTMLSelectElement>(
    "select.calibration-line-type",
  ) ?? undefined;
}

function chapterTitlePreview(index: number): HTMLElement | undefined {
  return chapterTitleRow(index)?.querySelector<HTMLElement>(
    ".chapter-heading-preview",
  ) ?? undefined;
}

async function waitForChapterTitleDom(
  predicate: () => boolean,
  message: string,
  timeoutMs = 3_000,
): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    if (predicate()) return;
    await new Promise<void>((resolve) => window.setTimeout(resolve, 25));
  }
  throw new Error(message);
}

function setHeadingNumberingThroughProductUi(enabled: boolean): void {
  if (headingNumbering.checked === enabled) return;
  headingNumbering.checked = enabled;
  headingNumbering.dispatchEvent(new Event("change", { bubbles: true }));
}

async function restoreChapterTitleRawBaseline(): Promise<void> {
  const context = currentChapterTitleDebugContext();
  requireFeatureDebug(featureDebugChapterId, "功能调试安全副本不存在");

  setHeadingNumberingThroughProductUi(true);

  let view = deriveWorkspaceView(actor.getSnapshot());
  if (view.session === "chapter-leave-confirm") {
    leaveCancelButton.click();
    await waitForLeaveSession("chapter-dirty");
    view = deriveWorkspaceView(actor.getSnapshot());
  }

  if (view.session === "chapter-dirty") {
    while (view.canUndo) {
      executeProductAction("undo");
      view = deriveWorkspaceView(actor.getSnapshot());
    }
  }

  if (view.session === "chapter-clean") {
    executeProductAction("close");
    await waitForWorkspaceSession("idle");
  }

  view = deriveWorkspaceView(actor.getSnapshot());
  if (
    view.session !== "idle"
    && actor.getSnapshot().context.chapter?.id !== featureDebugChapterId
  ) {
    if (view.session === "chapter-clean") {
      executeProductAction("close");
      await waitForWorkspaceSession("idle");
    } else {
      requireFeatureDebug(false, "章节标题调试清理时工作台无法回到 idle");
    }
  }

  const raw = await fetchRawChapter(featureDebugChapterId);
  if (raw.revision !== context.baselineRevision) {
    const response = await fetch("/__workspace/chapter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        chapterId: featureDebugChapterId,
        expectedRevision: raw.revision,
        workingText: context.baselineWorkingText,
        sidecar: context.baselineSidecar,
      }),
    });
    requireFeatureDebug(response.ok, "章节标题调试安全清理写回失败");
    const restored = await response.json() as {
      conflict?: boolean;
      revision?: string;
    };
    requireFeatureDebug(!restored.conflict, "章节标题调试安全清理发生 revision 冲突");
    requireFeatureDebug(
      restored.revision === context.baselineRevision,
      "章节标题调试安全清理未恢复原 revision",
    );
  }

  view = deriveWorkspaceView(actor.getSnapshot());
  if (view.session !== "idle") {
    if (view.session === "chapter-clean") {
      executeProductAction("close");
      await waitForWorkspaceSession("idle");
    } else {
      requireFeatureDebug(false, "章节标题调试清理无法进入 idle");
    }
  }

  executeProductAction("open-chapter", undefined, featureDebugChapterId);
  await waitForWorkspaceSession("chapter-clean");
  executeProductAction(
    "select-review-module",
    undefined,
    undefined,
    "章节标题",
  );
  setHeadingNumberingThroughProductUi(true);

  const finalView = await waitForChapterTitleView(
    (candidate) =>
      candidate.session === "chapter-clean"
      && candidate.activeReviewModule === "章节标题"
      && candidate.activeModuleRows === context.baselineActiveRows
      && candidate.headingNumberingEnabled,
    "章节标题安全清理后模块没有恢复基线",
  );
  await waitForChapterTitleDom(
    () =>
      chapterTitleSelect(1)?.value === "2 级标题"
      && Boolean(chapterTitlePreview(0)?.textContent?.includes("(001)")),
    "章节标题安全清理后 AG Grid DOM 没有恢复 H2 / 编号",
  );
  const finalRaw = await fetchRawChapter(featureDebugChapterId);

  requireFeatureDebug(
    finalRaw.workingText === context.baselineWorkingText,
    "章节标题安全清理后 working 未恢复原基线",
  );
  requireFeatureDebug(
    JSON.stringify(finalRaw.sidecar) === JSON.stringify(context.baselineSidecar),
    "章节标题安全清理后 sidecar 未恢复原基线",
  );
  requireFeatureDebug(
    finalRaw.revision === context.baselineRevision
      && finalView.revision === context.baselineRevision,
    "章节标题安全清理后 revision 未恢复原基线",
  );
  requireFeatureDebug(
    finalView.workingLength === context.baselineWorkingLength
      && finalView.undoDepth === 0
      && finalView.redoDepth === 0
      && !finalView.canSave,
    "章节标题安全清理后 working / 历史不干净",
  );
}

async function prepareChapterTitleFeatureDebug(): Promise<void> {
  featureDebugMenu.close();
  const initialView = requireInitializedFeatureDebugWorkspace();
  requireFeatureDebug(featureDebugChapterId, "功能调试安全副本不存在");

  executeProductAction(
    "select-review-module",
    undefined,
    undefined,
    "章节标题",
  );
  setHeadingNumberingThroughProductUi(true);

  const view = await waitForChapterTitleView(
    (candidate) =>
      candidate.session === "chapter-clean"
      && candidate.activeReviewModule === "章节标题"
      && candidate.headingNumberingEnabled,
    "无法进入章节标题模块",
  );
  const raw = await fetchRawChapter(featureDebugChapterId);

  requireFeatureDebug(
    raw.revision === featureDebugBaselineRevision
      && view.revision === featureDebugBaselineRevision,
    "章节标题调试基线 revision 不一致",
  );
  requireFeatureDebug(
    initialView.workingLength === raw.workingText.length,
    "章节标题调试基线 working 长度不一致",
  );
  requireFeatureDebug(
    view.activeModuleRows === 10
      && view.titleHeadingCount === 10
      && view.titleExportHeadingCount === 10
      && view.titleExportNumberedCount === 10,
    "安全副本章节标题基线不是 10 / 10 / 10",
  );

  chapterTitleDebugContext = {
    baselineWorkingText: raw.workingText,
    baselineSidecar: raw.sidecar,
    baselineRevision: raw.revision,
    baselineWorkingLength: raw.workingText.length,
    baselineActiveRows: view.activeModuleRows,
  };
}

function createChapterTitleFeatureDebugSteps(): readonly FeatureDebugStep[] {
  return [
    {
      label: "1 基线：10 条标题、3 列、H1/H2 层级与 (001)/(002) 编号",
      run: () => {
        const context = currentChapterTitleDebugContext();
        const view = deriveWorkspaceView(actor.getSnapshot());
        requireFeatureDebug(
          view.activeReviewModule === "章节标题"
            && view.activeModuleRows === context.baselineActiveRows
            && context.baselineActiveRows === 10,
          "章节标题基线不是 10 条",
        );
        requireFeatureDebug(
          calibrationGridHost.querySelector('[role="grid"]')
            ?.getAttribute("aria-colcount") === "3",
          "章节标题 AG Grid 总列数不是 3",
        );

        const firstHeading = chapterTitlePreview(0);
        const secondHeading = chapterTitlePreview(1);
        requireFeatureDebug(
          firstHeading && secondHeading,
          "章节标题表缺少前两条预览",
        );
        requireFeatureDebug(
          firstHeading.tagName === "H1"
            && secondHeading.tagName === "H2",
          "章节标题前两条不是 H1 / H2 层级",
        );
        requireFeatureDebug(
          firstHeading.textContent?.includes("(001)")
            && secondHeading.textContent?.includes("(002)"),
          "章节标题编号预览不是 (001) / (002)",
        );

        const h1Style = getComputedStyle(firstHeading);
        const h2Style = getComputedStyle(secondHeading);
        requireFeatureDebug(
          h1Style.color === "rgb(218, 99, 98)"
            && h2Style.color === "rgb(215, 127, 72)"
            && Number.parseFloat(h1Style.fontSize)
              > Number.parseFloat(h2Style.fontSize),
          "章节标题 H1/H2 分层样式不正确",
        );
        requireFeatureDebug(
          headingNumbering.checked
            && view.titleHeadingCount === 10
            && view.titleExportHeadingCount === 10
            && view.titleExportNumberedCount === 10,
          "章节标题编号/导出基线不正确",
        );
      },
    },
    {
      label: "2 已忽略：第一条 10→9，working 不变；Undo 回 10",
      run: async () => {
        const context = currentChapterTitleDebugContext();
        const select = chapterTitleSelect(0);
        requireFeatureDebug(select, "章节标题第一行下拉不存在");
        requireFeatureDebug(
          Array.from(select.options).map((option) => option.value).join("|")
            === "1 级标题|2 级标题|3 级标题|4 级标题|5 级标题|6 级标题|已忽略",
          "章节标题行类型选项不完整",
        );

        select.value = "已忽略";
        select.dispatchEvent(new Event("change", { bubbles: true }));

        let view = await waitForChapterTitleView(
          (candidate) =>
            candidate.session === "chapter-dirty"
            && candidate.activeModuleRows === context.baselineActiveRows - 1,
          "章节标题设为已忽略后没有变成 9 条",
        );
        requireFeatureDebug(
          view.workingLength === context.baselineWorkingLength,
          "章节标题“已忽略”不应修改 working 文本",
        );
        requireFeatureDebug(
          view.titleHeadingCount === 9
            && view.titleExportHeadingCount === 10
            && view.titleExportNumberedCount === 9,
          "章节标题已忽略后的导出语义不是 9 / 10 / 9",
        );

        undoButton.click();
        view = await waitForChapterTitleView(
          (candidate) =>
            candidate.session === "chapter-clean"
            && candidate.activeModuleRows === context.baselineActiveRows,
          "章节标题已忽略 Undo 没有恢复 10 条",
        );
        requireFeatureDebug(
          view.workingLength === context.baselineWorkingLength
            && view.redoDepth === 1
            && view.titleHeadingCount === 10
            && view.titleExportNumberedCount === 10,
          "章节标题已忽略 Undo 后基线未恢复",
        );
      },
    },
    {
      label: "3 改层级：第二条 H2→H3，working ##→###；Undo / Redo 成组可逆",
      run: async () => {
        const context = currentChapterTitleDebugContext();
        const select = chapterTitleSelect(1);
        requireFeatureDebug(select, "章节标题第二行下拉不存在");
        requireFeatureDebug(select.value === "2 级标题", "第二条基线不是 H2");

        select.value = "3 级标题";
        select.dispatchEvent(new Event("change", { bubbles: true }));

        let view = await waitForChapterTitleView(
          (candidate) =>
            candidate.session === "chapter-dirty"
            && candidate.workingLength === context.baselineWorkingLength + 1,
          "章节标题 H2→H3 后 working 没有增加一个 #",
        );

        await waitForChapterTitleDom(
          () =>
            chapterTitleSelect(1)?.value === "3 级标题"
            && chapterTitlePreview(1)?.tagName === "H3",
          "章节标题 H2→H3 后 AG Grid DOM 没有完成 H3 投影",
        );
        let secondPreview = chapterTitlePreview(1);
        requireFeatureDebug(
          secondPreview?.tagName === "H3"
            && secondPreview.textContent?.includes("(002)"),
          "章节标题 H2→H3 后预览没有变成 H3",
        );
        requireFeatureDebug(
          getComputedStyle(secondPreview).color === "rgb(191, 152, 61)",
          "章节标题 H3 颜色不正确",
        );
        requireFeatureDebug(
          actor.getSnapshot().context.chapter?.workingText.includes("### Data Sources"),
          "章节标题 H2→H3 没有真实修改 working",
        );
        requireFeatureDebug(
          view.undoDepth === 1 && view.redoDepth === 0 && view.canSave,
          "章节标题层级修改历史不正确",
        );

        undoButton.click();
        view = await waitForChapterTitleView(
          (candidate) =>
            candidate.session === "chapter-clean"
            && candidate.workingLength === context.baselineWorkingLength,
          "章节标题层级 Undo 没有恢复 working",
        );
        await waitForChapterTitleDom(
          () => chapterTitleSelect(1)?.value === "2 级标题",
          "章节标题层级 Undo 后 AG Grid DOM 没有恢复 H2",
        );
        requireFeatureDebug(
          chapterTitleSelect(1)?.value === "2 级标题"
            && view.redoDepth === 1,
          "章节标题层级 Undo 后 H2 / Redo 不正确",
        );

        redoButton.click();
        view = await waitForChapterTitleView(
          (candidate) =>
            candidate.session === "chapter-dirty"
            && candidate.workingLength === context.baselineWorkingLength + 1,
          "章节标题层级 Redo 没有重新变成 H3",
        );
        await waitForChapterTitleDom(
          () =>
            chapterTitleSelect(1)?.value === "3 级标题"
            && chapterTitlePreview(1)?.tagName === "H3",
          "章节标题层级 Redo 后 AG Grid DOM 没有恢复 H3",
        );
        secondPreview = chapterTitlePreview(1);
        requireFeatureDebug(
          chapterTitleSelect(1)?.value === "3 级标题"
            && secondPreview?.tagName === "H3"
            && view.undoDepth === 1,
          "章节标题层级 Redo 后状态不正确",
        );
      },
    },
    {
      label: "4 编号开关：只影响导出/预览编号，不新增 Undo 历史",
      run: async () => {
        let view = deriveWorkspaceView(actor.getSnapshot());
        requireFeatureDebug(
          view.session === "chapter-dirty" && view.undoDepth === 1,
          "章节标题编号测试前历史基线不正确",
        );

        setHeadingNumberingThroughProductUi(false);
        view = await waitForChapterTitleView(
          (candidate) =>
            !candidate.headingNumberingEnabled
            && candidate.titleExportNumberedCount === 0,
          "关闭章节编号后导出编号没有变为 0",
        );
        await waitForChapterTitleDom(
          () => !(chapterTitlePreview(0)?.textContent?.includes("(001)")),
          "章节编号关闭后 AG Grid 预览没有移除编号",
        );
        requireFeatureDebug(
          view.undoDepth === 1
            && !(chapterTitlePreview(0)?.textContent?.includes("(001)")),
          "章节编号关闭后预览/Undo 历史不正确",
        );

        setHeadingNumberingThroughProductUi(true);
        view = await waitForChapterTitleView(
          (candidate) =>
            candidate.headingNumberingEnabled
            && candidate.titleExportNumberedCount === 10,
          "重新开启章节编号后没有恢复 10 个编号",
        );
        await waitForChapterTitleDom(
          () => Boolean(chapterTitlePreview(0)?.textContent?.includes("(001)")),
          "章节编号恢复后 AG Grid 预览没有恢复编号",
        );
        requireFeatureDebug(
          view.undoDepth === 1
            && chapterTitlePreview(0)?.textContent?.includes("(001)"),
          "章节编号恢复后预览/Undo 历史不正确",
        );
      },
    },
    {
      label: "5 保存 / 重入：H3 持久化；随后恢复原 H2、原 working / sidecar / revision",
      run: async () => {
        const context = currentChapterTitleDebugContext();

        saveButton.click();
        context.temporaryRevision = await waitForCleanRevision(
          (nextRevision) =>
            Boolean(nextRevision)
            && nextRevision !== context.baselineRevision,
        );

        let view = deriveWorkspaceView(actor.getSnapshot());
        requireFeatureDebug(
          view.session === "chapter-clean"
            && view.undoDepth === 0
            && view.redoDepth === 0
            && !view.canSave,
          "章节标题保存后状态不 clean",
        );

        executeProductAction("close");
        await waitForWorkspaceSession("idle");
        executeProductAction("open-chapter", undefined, featureDebugChapterId);
        await waitForWorkspaceSession("chapter-clean");
        executeProductAction(
          "select-review-module",
          undefined,
          undefined,
          "章节标题",
        );

        view = await waitForChapterTitleView(
          (candidate) =>
            candidate.activeReviewModule === "章节标题"
            && candidate.activeModuleRows === context.baselineActiveRows,
          "章节标题保存重入后没有回到 10 条",
        );
        await waitForChapterTitleDom(
          () => chapterTitleSelect(1)?.value === "3 级标题",
          "章节标题保存重入后 AG Grid DOM 没有恢复 H3",
        );
        requireFeatureDebug(
          view.revision === context.temporaryRevision
            && view.workingLength === context.baselineWorkingLength + 1
            && chapterTitleSelect(1)?.value === "3 级标题"
            && actor.getSnapshot().context.chapter?.workingText.includes("### Data Sources"),
          "章节标题 H3 保存重入没有持久化",
        );

        await restoreChapterTitleRawBaseline();
        view = requireInitializedFeatureDebugWorkspace();
        requireFeatureDebug(
          view.activeReviewModule === "章节标题"
            && view.activeModuleRows === context.baselineActiveRows
            && view.revision === context.baselineRevision
            && view.workingLength === context.baselineWorkingLength
            && chapterTitleSelect(1)?.value === "2 级标题"
            && view.headingNumberingEnabled
            && view.undoDepth === 0
            && view.redoDepth === 0
            && !view.canSave,
          "章节标题最终没有恢复原 H2 / revision / clean 基线",
        );
      },
    },
  ];
}

function recoverChapterTitleFeatureDebug(error: Error): void {
  featureDebugEnvironmentReady = false;
  document.documentElement.dataset.featureDebugReady = "false";
  featureDebugRunner.refreshControls();
  sourceLocationStatus.textContent =
    "章节标题模块功能调试失败 · 正在尝试恢复安全副本 · " + error.message;

  void restoreChapterTitleRawBaseline()
    .then(() => {
      sourceLocationStatus.textContent =
        "章节标题模块功能调试失败 · 安全副本已恢复 · 请重新初始化";
    })
    .catch((restoreError) => {
      sourceLocationStatus.textContent =
        "章节标题模块功能调试失败 · 安全恢复也失败 · "
        + (restoreError instanceof Error ? restoreError.message : String(restoreError));
    });
}

function currentAnnotationDebugContext(): AnnotationDebugContext {
  requireFeatureDebug(annotationDebugContext, "注释模块调试上下文不存在");
  return annotationDebugContext;
}

function annotationRow(index: number): HTMLElement | undefined {
  return calibrationGridHost.querySelector<HTMLElement>(
    `.ag-row[row-index="${index}"]`,
  ) ?? undefined;
}

function annotationNumberText(index: number): string {
  return annotationRow(index)?.querySelector<HTMLElement>(
    '[col-id="annotationNumber"]',
  )?.textContent?.trim() ?? "";
}

function annotationLineTypeSelect(index: number): HTMLSelectElement | undefined {
  return annotationRow(index)?.querySelector<HTMLSelectElement>(
    "select.calibration-line-type",
  ) ?? undefined;
}

async function waitForAnnotationView(
  predicate: (view: ReturnType<typeof deriveWorkspaceView>) => boolean,
  message: string,
  timeoutMs = 5_000,
): Promise<ReturnType<typeof deriveWorkspaceView>> {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    const view = deriveWorkspaceView(actor.getSnapshot());
    if (predicate(view)) return view;
    await new Promise<void>((resolve) => window.setTimeout(resolve, 25));
  }
  throw new Error(message);
}

async function waitForAnnotationDom(
  predicate: () => boolean,
  message: string,
  timeoutMs = 3_000,
): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    if (predicate()) return;
    await new Promise<void>((resolve) => window.setTimeout(resolve, 25));
  }
  throw new Error(message);
}

function setAnnotationLineTypeThroughProductUi(index: number, value: string): void {
  const select = annotationLineTypeSelect(index);
  requireFeatureDebug(select, "注释行类型下拉不存在");
  select.value = value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

async function restoreAnnotationRawBaseline(): Promise<void> {
  const context = currentAnnotationDebugContext();
  requireFeatureDebug(featureDebugChapterId, "功能调试安全副本不存在");

  let view = deriveWorkspaceView(actor.getSnapshot());
  if (view.session === "chapter-leave-confirm") {
    leaveCancelButton.click();
    await waitForLeaveSession("chapter-dirty");
    view = deriveWorkspaceView(actor.getSnapshot());
  }

  if (view.session === "chapter-dirty") {
    while (view.canUndo) {
      executeProductAction("undo");
      view = deriveWorkspaceView(actor.getSnapshot());
    }
  }

  if (view.session === "chapter-clean") {
    executeProductAction("close");
    await waitForWorkspaceSession("idle");
  }

  const raw = await fetchRawChapter(featureDebugChapterId);
  if (raw.revision !== context.baselineRevision) {
    const response = await fetch("/__workspace/chapter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        chapterId: featureDebugChapterId,
        expectedRevision: raw.revision,
        workingText: context.baselineWorkingText,
        sidecar: context.baselineSidecar,
      }),
    });
    requireFeatureDebug(response.ok, "注释模块调试安全清理写回失败");
    const restored = await response.json() as {
      conflict?: boolean;
      revision?: string;
    };
    requireFeatureDebug(!restored.conflict, "注释模块调试安全清理发生 revision 冲突");
    requireFeatureDebug(
      restored.revision === context.baselineRevision,
      "注释模块调试安全清理未恢复原 revision",
    );
  }

  view = deriveWorkspaceView(actor.getSnapshot());
  if (view.session !== "idle") {
    if (view.session === "chapter-clean") {
      executeProductAction("close");
      await waitForWorkspaceSession("idle");
    } else {
      requireFeatureDebug(false, "注释模块调试清理无法进入 idle");
    }
  }

  executeProductAction("open-chapter", undefined, featureDebugChapterId);
  await waitForWorkspaceSession("chapter-clean");
  executeProductAction(
    "select-review-module",
    undefined,
    undefined,
    "注释",
  );

  const finalView = await waitForAnnotationView(
    (candidate) =>
      candidate.session === "chapter-clean"
      && candidate.activeReviewModule === "注释"
      && candidate.activeModuleRows === context.baselineActiveRows
      && candidate.annotationPairs === context.baselinePairs,
    "注释模块安全清理后没有恢复 20 行 / 10 对",
  );
  await waitForAnnotationDom(
    () =>
      annotationNumberText(0) === "1"
      && annotationLineTypeSelect(0)?.value === "注释引用"
      && calibrationGridHost.querySelector("input.annotation-number-input") === null,
    "注释模块安全清理后首行没有恢复只读 #1 / 自动匹配",
  );

  const finalRaw = await fetchRawChapter(featureDebugChapterId);
  requireFeatureDebug(
    finalRaw.workingText === context.baselineWorkingText,
    "注释模块安全清理后 working 未恢复原基线",
  );
  requireFeatureDebug(
    JSON.stringify(finalRaw.sidecar) === JSON.stringify(context.baselineSidecar),
    "注释模块安全清理后 sidecar 未恢复原基线",
  );
  requireFeatureDebug(
    finalRaw.revision === context.baselineRevision
      && finalView.revision === context.baselineRevision,
    "注释模块安全清理后 revision 未恢复原基线",
  );
  requireFeatureDebug(
    finalView.workingLength === context.baselineWorkingLength
      && finalView.undoDepth === 0
      && finalView.redoDepth === 0
      && !finalView.canSave,
    "注释模块安全清理后 working / 历史不干净",
  );
}

async function prepareAnnotationFeatureDebug(): Promise<void> {
  featureDebugMenu.close();
  requireInitializedFeatureDebugWorkspace();
  requireFeatureDebug(featureDebugChapterId, "功能调试安全副本不存在");

  executeProductAction(
    "select-review-module",
    undefined,
    undefined,
    "注释",
  );

  const view = await waitForAnnotationView(
    (candidate) =>
      candidate.session === "chapter-clean"
      && candidate.activeReviewModule === "注释"
      && candidate.activeModuleRows === 20
      && candidate.annotationPairs === 10,
    "无法进入注释模块 20 行 / 10 对基线",
  );
  const raw = await fetchRawChapter(featureDebugChapterId);
  requireFeatureDebug(
    raw.revision === featureDebugBaselineRevision
      && view.revision === featureDebugBaselineRevision,
    "注释模块调试基线 revision 不一致",
  );
  requireFeatureDebug(
    view.annotationPairedCount === 10
      && view.annotationMissingRefCount === 0
      && view.annotationMissingBodyCount === 0
      && view.annotationMissingNumberCount === 0,
    "注释模块调试基线配对统计不干净",
  );

  annotationDebugContext = {
    baselineWorkingText: raw.workingText,
    baselineSidecar: raw.sidecar,
    baselineRevision: raw.revision,
    baselineWorkingLength: raw.workingText.length,
    baselineActiveRows: view.activeModuleRows,
    baselinePairs: view.annotationPairs ?? 0,
  };
}

function createAnnotationFeatureDebugSteps(): readonly FeatureDebugStep[] {
  return [
    {
      label: "1 基线：20 行 / 5 列 / 10 对；注释号由源码提取并只读显示",
      run: async () => {
        const context = currentAnnotationDebugContext();
        const view = deriveWorkspaceView(actor.getSnapshot());
        requireFeatureDebug(
          view.activeReviewModule === "注释"
            && view.activeModuleRows === context.baselineActiveRows
            && context.baselineActiveRows === 20
            && view.annotationPairs === context.baselinePairs
            && context.baselinePairs === 10,
          "注释模块基线不是 20 行 / 10 对",
        );
        requireFeatureDebug(
          calibrationGridHost.querySelector('[role="grid"]')
            ?.getAttribute("aria-colcount") === "5",
          "注释模块 AG Grid 总列数不是 5",
        );
        await waitForAnnotationDom(
          () =>
            annotationLineTypeSelect(0)?.value === "注释引用"
            && annotationNumberText(0) === "1"
            && calibrationGridHost.querySelector("input.annotation-number-input") === null,
          "注释模块首行不是只读 注释引用 #1 / 自动匹配",
        );
      },
    },
    {
      label: "2 只读契约：组号 1,1,2,2,3,3；无输入框；clean 0/0 不可保存",
      run: async () => {
        const context = currentAnnotationDebugContext();
        const numbers = Array.from(
          calibrationGridHost.querySelectorAll<HTMLElement>(
            '.ag-row [col-id="annotationNumber"]',
          ),
        ).slice(0, 6).map((cell) => cell.textContent?.trim() ?? "");
        const view = deriveWorkspaceView(actor.getSnapshot());
        requireFeatureDebug(
          numbers.join(",") === "1,1,2,2,3,3",
          "注释组号没有按实际引用 / 正文提取为 1,1,2,2,3,3",
        );
        requireFeatureDebug(
          calibrationGridHost.querySelector("input.annotation-number-input") === null,
          "注释号仍存在人工输入框",
        );
        requireFeatureDebug(
          view.session === "chapter-clean"
            && view.undoDepth === 0
            && view.redoDepth === 0
            && !view.canSave
            && view.workingLength === context.baselineWorkingLength,
          "只读注释号检查污染了章节状态",
        );
      },
    },
    {
      label: "3 已忽略：首个引用 20→19，#1 正文保留并显示“待补引用”；Undo 回 20",
      run: async () => {
        const context = currentAnnotationDebugContext();
        requireFeatureDebug(
          annotationLineTypeSelect(0)?.value === "注释引用"
            && annotationNumberText(0) === "1",
          "注释模块首行基线不是注释引用 #1",
        );
        setAnnotationLineTypeThroughProductUi(0, "已忽略");

        let view = await waitForAnnotationView(
          (candidate) =>
            candidate.session === "chapter-dirty"
            && candidate.activeModuleRows === context.baselineActiveRows - 1
            && candidate.annotationPairs === context.baselinePairs
            && candidate.annotationMissingRefCount === 1,
          "注释引用已忽略后没有变成 19 行 / 缺引用 1",
        );
        await waitForAnnotationDom(
          () =>
            annotationNumberText(0) === "1"
            && calibrationGridHost.querySelector("input.annotation-number-input") === null,
          "注释引用已忽略后 #1 正文 / 待补引用状态不正确",
        );

        undoButton.click();
        view = await waitForAnnotationView(
          (candidate) =>
            candidate.session === "chapter-clean"
            && candidate.activeModuleRows === context.baselineActiveRows
            && candidate.annotationPairs === context.baselinePairs
            && candidate.annotationMissingRefCount === 0
            && candidate.undoDepth === 0,
          "注释已忽略 Undo 没有恢复 20 行 / 10 对",
        );
        await waitForAnnotationDom(
          () =>
            annotationLineTypeSelect(0)?.value === "注释引用"
            && annotationNumberText(0) === "1",
          "注释已忽略 Undo 后首行没有恢复",
        );
      },
    },
    {
      label: "4 保存 / 重入：只持久化“已忽略”，注释组号仍来自源码",
      run: async () => {
        const context = currentAnnotationDebugContext();
        setAnnotationLineTypeThroughProductUi(0, "已忽略");
        await waitForAnnotationView(
          (candidate) =>
            candidate.session === "chapter-dirty"
            && candidate.activeModuleRows === context.baselineActiveRows - 1
            && candidate.annotationMissingRefCount === 1,
          "注释保存测试前没有进入已忽略状态",
        );

        saveButton.click();
        context.temporaryRevision = await waitForCleanRevision(
          (nextRevision) =>
            Boolean(nextRevision)
            && nextRevision !== context.baselineRevision,
        );

        executeProductAction("close");
        await waitForWorkspaceSession("idle");
        executeProductAction("open-chapter", undefined, featureDebugChapterId);
        await waitForWorkspaceSession("chapter-clean");
        executeProductAction("select-review-module", undefined, undefined, "注释");

        const view = await waitForAnnotationView(
          (candidate) =>
            candidate.activeReviewModule === "注释"
            && candidate.activeModuleRows === context.baselineActiveRows - 1
            && candidate.annotationPairs === context.baselinePairs
            && candidate.annotationMissingRefCount === 1,
          "注释模块保存重入后没有保留已忽略状态",
        );
        await waitForAnnotationDom(
          () =>
            annotationNumberText(0) === "1"
            && calibrationGridHost.querySelector("input.annotation-number-input") === null,
          "保存重入后注释组号不再是源码派生只读值",
        );
        requireFeatureDebug(
          view.revision === context.temporaryRevision
            && view.workingLength === context.baselineWorkingLength
            && view.undoDepth === 0
            && view.redoDepth === 0
            && !view.canSave,
          "注释模块保存重入 revision / history 不正确",
        );
      },
    },
    {
      label: "5 安全恢复：原 20 行 / 10 对 / #1 / revision / clean 基线",
      run: async () => {
        const context = currentAnnotationDebugContext();
        await restoreAnnotationRawBaseline();
        const view = requireInitializedFeatureDebugWorkspace();
        requireFeatureDebug(
          view.activeReviewModule === "注释"
            && view.activeModuleRows === context.baselineActiveRows
            && view.annotationPairs === context.baselinePairs
            && view.revision === context.baselineRevision
            && view.workingLength === context.baselineWorkingLength
            && view.undoDepth === 0
            && view.redoDepth === 0
            && !view.canSave,
          "注释模块最终没有恢复原 20 行 / 10 对 / revision / clean 基线",
        );
        await waitForAnnotationDom(
          () =>
            annotationNumberText(0) === "1"
            && calibrationGridHost.querySelector("input.annotation-number-input") === null,
          "注释模块最终没有恢复只读 #1 / 自动匹配",
        );
      },
    },
  ];
}

function recoverAnnotationFeatureDebug(error: Error): void {
  featureDebugEnvironmentReady = false;
  document.documentElement.dataset.featureDebugReady = "false";
  featureDebugRunner.refreshControls();
  sourceLocationStatus.textContent =
    "注释模块功能调试失败 · 正在尝试恢复安全副本 · " + error.message;

  void restoreAnnotationRawBaseline()
    .then(() => {
      sourceLocationStatus.textContent =
        "注释模块功能调试失败 · 安全副本已恢复 · 请重新初始化";
    })
    .catch((restoreError) => {
      sourceLocationStatus.textContent =
        "注释模块功能调试失败 · 安全恢复也失败 · "
        + (restoreError instanceof Error ? restoreError.message : String(restoreError));
    });
}

function currentEmbedDebugContext(): EmbedDebugContext {
  requireFeatureDebug(embedDebugContext, "嵌入块模块调试上下文不存在");
  return embedDebugContext;
}

function embedRow(index: number): HTMLElement | undefined {
  return calibrationGridHost.querySelector<HTMLElement>(
    `.ag-row[row-index="${index}"]`,
  ) ?? undefined;
}

function embedLineTypeSelect(index: number): HTMLSelectElement | undefined {
  return embedRow(index)?.querySelector<HTMLSelectElement>(
    "select.calibration-line-type",
  ) ?? undefined;
}

function embedNumberText(index: number): string {
  return embedRow(index)?.querySelector<HTMLElement>(
    '[col-id="embedNumber"]',
  )?.textContent?.trim() ?? "";
}

async function waitForEmbedView(
  predicate: (view: ReturnType<typeof deriveWorkspaceView>) => boolean,
  message: string,
  timeoutMs = 5_000,
): Promise<ReturnType<typeof deriveWorkspaceView>> {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    const view = deriveWorkspaceView(actor.getSnapshot());
    if (predicate(view)) return view;
    await new Promise<void>((resolve) => window.setTimeout(resolve, 25));
  }
  throw new Error(message);
}

async function waitForEmbedDom(
  predicate: () => boolean,
  message: string,
  timeoutMs = 3_000,
): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    if (predicate()) return;
    await new Promise<void>((resolve) => window.setTimeout(resolve, 25));
  }
  throw new Error(message);
}

function setEmbedLineTypeThroughProductUi(index: number, value: string): void {
  const select = embedLineTypeSelect(index);
  requireFeatureDebug(select, "嵌入块行类型下拉不存在");
  select.value = value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

async function restoreEmbedRawBaseline(): Promise<void> {
  const context = currentEmbedDebugContext();
  requireFeatureDebug(featureDebugChapterId, "功能调试安全副本不存在");

  let view = deriveWorkspaceView(actor.getSnapshot());
  if (view.session === "chapter-leave-confirm") {
    leaveCancelButton.click();
    await waitForLeaveSession("chapter-dirty");
    view = deriveWorkspaceView(actor.getSnapshot());
  }

  if (view.session === "chapter-dirty") {
    while (view.canUndo) {
      executeProductAction("undo");
      view = deriveWorkspaceView(actor.getSnapshot());
    }
  }

  if (view.session === "chapter-clean") {
    executeProductAction("close");
    await waitForWorkspaceSession("idle");
  }

  const raw = await fetchRawChapter(featureDebugChapterId);
  if (raw.revision !== context.baselineRevision) {
    const response = await fetch("/__workspace/chapter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        chapterId: featureDebugChapterId,
        expectedRevision: raw.revision,
        workingText: context.baselineWorkingText,
        sidecar: context.baselineSidecar,
      }),
    });
    requireFeatureDebug(response.ok, "嵌入块模块调试安全清理写回失败");
    const restored = await response.json() as {
      conflict?: boolean;
      revision?: string;
    };
    requireFeatureDebug(!restored.conflict, "嵌入块模块调试安全清理发生 revision 冲突");
    requireFeatureDebug(
      restored.revision === context.baselineRevision,
      "嵌入块模块调试安全清理未恢复原 revision",
    );
  }

  view = deriveWorkspaceView(actor.getSnapshot());
  if (view.session !== "idle") {
    if (view.session === "chapter-clean") {
      executeProductAction("close");
      await waitForWorkspaceSession("idle");
    } else {
      requireFeatureDebug(false, "嵌入块模块调试清理无法进入 idle");
    }
  }

  executeProductAction("open-chapter", undefined, featureDebugChapterId);
  await waitForWorkspaceSession("chapter-clean");
  executeProductAction(
    "select-review-module",
    undefined,
    undefined,
    "嵌入块",
  );

  const finalView = await waitForEmbedView(
    (candidate) =>
      candidate.session === "chapter-clean"
      && candidate.activeReviewModule === "嵌入块"
      && candidate.activeModuleRows === context.baselineVisibleRows
      && candidate.embedTotalRows === context.baselineTotalRows
      && candidate.embedVisibleRows === context.baselineVisibleRows
      && candidate.embedGroupCount === context.baselineGroupCount
      && candidate.embedUnassignedRows === context.baselineUnassignedRows,
    "嵌入块安全清理后没有恢复原分组基线",
  );
  await waitForEmbedDom(
    () =>
      embedNumberText(0) === "1"
      && embedLineTypeSelect(0)?.value === "嵌入块首",
    "嵌入块安全清理后首行没有恢复组 1 / 嵌入块首",
  );

  const finalRaw = await fetchRawChapter(featureDebugChapterId);
  requireFeatureDebug(
    finalRaw.workingText === context.baselineWorkingText,
    "嵌入块安全清理后 working 未恢复原基线",
  );
  requireFeatureDebug(
    JSON.stringify(finalRaw.sidecar) === JSON.stringify(context.baselineSidecar),
    "嵌入块安全清理后 sidecar 未恢复原基线",
  );
  requireFeatureDebug(
    finalRaw.revision === context.baselineRevision
      && finalView.revision === context.baselineRevision,
    "嵌入块安全清理后 revision 未恢复原基线",
  );
  requireFeatureDebug(
    finalView.workingLength === context.baselineWorkingLength
      && finalView.undoDepth === 0
      && finalView.redoDepth === 0
      && !finalView.canSave,
    "嵌入块安全清理后 working / 历史不干净",
  );
}

async function prepareEmbedFeatureDebug(): Promise<void> {
  featureDebugMenu.close();
  requireInitializedFeatureDebugWorkspace();
  requireFeatureDebug(featureDebugChapterId, "功能调试安全副本不存在");

  executeProductAction(
    "select-review-module",
    undefined,
    undefined,
    "嵌入块",
  );

  const view = await waitForEmbedView(
    (candidate) =>
      candidate.session === "chapter-clean"
      && candidate.activeReviewModule === "嵌入块"
      && candidate.activeModuleRows === 51
      && candidate.embedTotalRows === 65
      && candidate.embedVisibleRows === 51
      && candidate.embedGroupCount === 11
      && candidate.embedUnassignedRows === 0,
    "无法进入嵌入块 65 / 51 / 11 / 0 基线",
  );
  const raw = await fetchRawChapter(featureDebugChapterId);
  requireFeatureDebug(
    raw.revision === featureDebugBaselineRevision
      && view.revision === featureDebugBaselineRevision,
    "嵌入块调试基线 revision 不一致",
  );

  embedDebugContext = {
    baselineWorkingText: raw.workingText,
    baselineSidecar: raw.sidecar,
    baselineRevision: raw.revision,
    baselineWorkingLength: raw.workingText.length,
    baselineVisibleRows: view.embedVisibleRows,
    baselineTotalRows: view.embedTotalRows,
    baselineGroupCount: view.embedGroupCount,
    baselineUnassignedRows: view.embedUnassignedRows,
  };
}

function createEmbedFeatureDebugSteps(): readonly FeatureDebugStep[] {
  return [
    {
      label: "1 基线：总计 65 / 可见 51 / 11 组 / 未分组 0；首行 组1 / 嵌入块首",
      run: async () => {
        const context = currentEmbedDebugContext();
        const view = deriveWorkspaceView(actor.getSnapshot());

        requireFeatureDebug(
          view.activeReviewModule === "嵌入块"
            && view.activeModuleRows === context.baselineVisibleRows
            && view.embedTotalRows === context.baselineTotalRows
            && view.embedVisibleRows === context.baselineVisibleRows
            && view.embedGroupCount === context.baselineGroupCount
            && view.embedUnassignedRows === context.baselineUnassignedRows,
          "嵌入块分组基线不正确",
        );
        requireFeatureDebug(
          calibrationGridHost.querySelector('[role="grid"]')
            ?.getAttribute("aria-colcount") === "4",
          "嵌入块 AG Grid 总列数不是 4",
        );
        await waitForEmbedDom(
          () =>
            embedNumberText(0) === "1"
            && embedLineTypeSelect(0)?.value === "嵌入块首",
          "嵌入块首行不是 组 1 / 嵌入块首",
        );
        requireFeatureDebug(
          Array.from(embedLineTypeSelect(0)?.options ?? [])
            .map((option) => option.value)
            .join("|") === "嵌入块首|已忽略",
          "嵌入块首行类型选项不是 嵌入块首 / 已忽略",
        );
      },
    },
    {
      label: "2 已忽略：组1“嵌入块首 → 已忽略”，可见 51→50，11 组保持，working 不变",
      run: async () => {
        const context = currentEmbedDebugContext();
        setEmbedLineTypeThroughProductUi(0, "已忽略");

        const view = await waitForEmbedView(
          (candidate) =>
            candidate.session === "chapter-dirty"
            && candidate.activeModuleRows === context.baselineVisibleRows - 1
            && candidate.embedVisibleRows === context.baselineVisibleRows - 1
            && candidate.undoDepth === 1,
          "嵌入块首已忽略后没有变成可见 50 / dirty",
        );
        requireFeatureDebug(
          view.embedTotalRows === context.baselineTotalRows
            && view.embedGroupCount === context.baselineGroupCount
            && view.embedUnassignedRows === context.baselineUnassignedRows
            && view.workingLength === context.baselineWorkingLength,
          "嵌入块已忽略后总数 / 组数 / working 被意外改变",
        );
      },
    },
    {
      label: "3 Undo / Redo：51→50 可逆，组结构始终 11 / 未分组 0",
      run: async () => {
        const context = currentEmbedDebugContext();

        undoButton.click();
        let view = await waitForEmbedView(
          (candidate) =>
            candidate.session === "chapter-clean"
            && candidate.embedVisibleRows === context.baselineVisibleRows
            && candidate.undoDepth === 0
            && candidate.redoDepth === 1,
          "嵌入块 Undo 没有恢复可见 51",
        );
        await waitForEmbedDom(
          () => embedLineTypeSelect(0)?.value === "嵌入块首",
          "嵌入块 Undo 后首行没有恢复嵌入块首",
        );
        requireFeatureDebug(
          view.embedGroupCount === context.baselineGroupCount
            && view.embedUnassignedRows === context.baselineUnassignedRows,
          "嵌入块 Undo 后组结构不正确",
        );

        redoButton.click();
        view = await waitForEmbedView(
          (candidate) =>
            candidate.session === "chapter-dirty"
            && candidate.embedVisibleRows === context.baselineVisibleRows - 1
            && candidate.undoDepth === 1
            && candidate.redoDepth === 0,
          "嵌入块 Redo 没有重新变成可见 50",
        );
        requireFeatureDebug(
          view.embedGroupCount === context.baselineGroupCount
            && view.embedUnassignedRows === context.baselineUnassignedRows
            && view.workingLength === context.baselineWorkingLength,
          "嵌入块 Redo 后组结构 / working 不正确",
        );
      },
    },
    {
      label: "4 保存 / 重入：可见 50 持久化，组结构仍 11 / 未分组 0",
      run: async () => {
        const context = currentEmbedDebugContext();

        saveButton.click();
        context.temporaryRevision = await waitForCleanRevision(
          (nextRevision) =>
            Boolean(nextRevision)
            && nextRevision !== context.baselineRevision,
        );

        let view = deriveWorkspaceView(actor.getSnapshot());
        requireFeatureDebug(
          view.session === "chapter-clean"
            && view.undoDepth === 0
            && view.redoDepth === 0
            && !view.canSave,
          "嵌入块保存后状态不 clean",
        );

        executeProductAction("close");
        await waitForWorkspaceSession("idle");
        executeProductAction("open-chapter", undefined, featureDebugChapterId);
        await waitForWorkspaceSession("chapter-clean");
        executeProductAction(
          "select-review-module",
          undefined,
          undefined,
          "嵌入块",
        );

        view = await waitForEmbedView(
          (candidate) =>
            candidate.activeReviewModule === "嵌入块"
            && candidate.embedVisibleRows === context.baselineVisibleRows - 1
            && candidate.embedGroupCount === context.baselineGroupCount
            && candidate.embedUnassignedRows === context.baselineUnassignedRows,
          "嵌入块保存重入后没有保持可见 50 / 11 组",
        );
        requireFeatureDebug(
          view.revision === context.temporaryRevision
            && view.workingLength === context.baselineWorkingLength,
          "嵌入块保存重入 revision / working 不正确",
        );
      },
    },
    {
      label: "5 安全清理：恢复可见 51 / 11 组 / 原 working / sidecar / revision / clean 0/0",
      run: async () => {
        await restoreEmbedRawBaseline();
        const context = currentEmbedDebugContext();
        const view = requireInitializedFeatureDebugWorkspace();

        requireFeatureDebug(
          view.activeReviewModule === "嵌入块"
            && view.embedTotalRows === context.baselineTotalRows
            && view.embedVisibleRows === context.baselineVisibleRows
            && view.embedGroupCount === context.baselineGroupCount
            && view.embedUnassignedRows === context.baselineUnassignedRows
            && view.revision === context.baselineRevision
            && view.workingLength === context.baselineWorkingLength
            && view.undoDepth === 0
            && view.redoDepth === 0
            && !view.canSave,
          "嵌入块最终没有恢复原分组 / revision / clean 基线",
        );
      },
    },
  ];
}

function recoverEmbedFeatureDebug(error: Error): void {
  featureDebugEnvironmentReady = false;
  document.documentElement.dataset.featureDebugReady = "false";
  featureDebugRunner.refreshControls();
  sourceLocationStatus.textContent =
    "嵌入块模块功能调试失败 · 正在尝试恢复安全副本 · " + error.message;

  void restoreEmbedRawBaseline()
    .then(() => {
      sourceLocationStatus.textContent =
        "嵌入块模块功能调试失败 · 安全副本已恢复 · 请重新初始化";
    })
    .catch((restoreError) => {
      sourceLocationStatus.textContent =
        "嵌入块模块功能调试失败 · 安全恢复也失败 · "
        + (restoreError instanceof Error ? restoreError.message : String(restoreError));
    });
}

type RawBoundaryPayload = {
  rootMarkdown: Array<{ name: string; text: string }>;
  workingText?: string;
  baselineText?: string;
  sidecar?: Record<string, unknown>;
  revision: string;
};

function currentChapterBoundaryDebugContext(): ChapterBoundaryDebugContext {
  requireFeatureDebug(
    chapterBoundaryDebugContext,
    "章节定界模块调试上下文不存在",
  );
  return chapterBoundaryDebugContext;
}

async function fetchRawBoundary(): Promise<RawBoundaryPayload> {
  const response = await fetch("/__workspace/boundary", { cache: "no-store" });
  requireFeatureDebug(response.ok, "读取章节定界原始数据失败");
  return response.json() as Promise<RawBoundaryPayload>;
}

async function waitForBoundaryView(
  predicate: (view: ReturnType<typeof deriveWorkspaceView>) => boolean,
  message: string,
  timeoutMs = 8_000,
): Promise<ReturnType<typeof deriveWorkspaceView>> {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    const view = deriveWorkspaceView(actor.getSnapshot());
    if (predicate(view)) return view;
    await new Promise<void>((resolve) => window.setTimeout(resolve, 25));
  }
  throw new Error(message);
}

async function waitForBoundaryDom(
  predicate: () => boolean,
  message: string,
  timeoutMs = 3_000,
): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    if (predicate()) return;
    await new Promise<void>((resolve) => window.setTimeout(resolve, 25));
  }
  throw new Error(message);
}

function boundaryChapterFiles(): string[] {
  const chapter = actor.getSnapshot().context.chapter;
  if (!chapter || chapter.kind !== "boundary") return [];
  return chapter.rows
    .filter(
      (row) =>
        row.typeLabel === "章节定界"
        && row.lineType === "1 级标题",
    )
    .map((row) => String(row.chapterFile ?? "").trim());
}

function boundaryFileInputs(): HTMLInputElement[] {
  return Array.from(
    calibrationGridHost.querySelectorAll<HTMLInputElement>(
      "input.chapter-file-input:not(:disabled)",
    ),
  );
}

function openBoundaryThroughProductNavigation(): void {
  chapterSelect.value = "__node_ocr__";
  chapterSelect.dispatchEvent(new Event("change", { bubbles: true }));
}

async function restoreChapterBoundaryRawBaseline(): Promise<void> {
  const context = currentChapterBoundaryDebugContext();

  let view = deriveWorkspaceView(actor.getSnapshot());
  if (view.session === "chapter-leave-confirm") {
    leaveCancelButton.click();
    view = await waitForBoundaryView(
      (candidate) => candidate.session === "chapter-dirty",
      "章节定界安全清理取消离开确认失败",
    );
  }

  if (view.session === "chapter-dirty") {
    while (view.canUndo) {
      executeProductAction("undo");
      view = deriveWorkspaceView(actor.getSnapshot());
    }
  }

  view = deriveWorkspaceView(actor.getSnapshot());
  if (view.session === "chapter-dirty") {
    executeProductAction("close");
    await waitForLeaveSession("chapter-leave-confirm");
    leaveDiscardButton.click();
    await waitForWorkspaceSession("idle");
  } else if (view.session === "chapter-clean") {
    executeProductAction("close");
    await waitForWorkspaceSession("idle");
  } else if (view.session !== "idle") {
    throw new Error("章节定界安全清理无法回到 idle");
  }

  const raw = await fetchRawBoundary();
  if (raw.revision !== context.baselineRevision) {
    const response = await fetch("/__workspace/boundary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        expectedRevision: raw.revision,
        workingText: context.baselineWorkingText,
        baselineText: context.baselineText,
        sourceFiles: context.baselineSourceFiles,
        sidecar: context.baselineSidecar,
      }),
    });
    requireFeatureDebug(response.ok, "章节定界安全清理写回失败");
    const restored = await response.json() as {
      conflict?: boolean;
      revision?: string;
      currentRevision?: string;
    };
    requireFeatureDebug(
      !restored.conflict,
      "章节定界安全清理发生 revision 冲突",
    );
    requireFeatureDebug(
      restored.revision === context.baselineRevision,
      "章节定界安全清理未恢复原 revision",
    );
  }

  openBoundaryThroughProductNavigation();
  const finalView = await waitForBoundaryView(
    (candidate) =>
      candidate.session === "chapter-clean"
      && candidate.workspaceKind === "boundary"
      && candidate.activeReviewModule === "章节定界"
      && candidate.revision === context.baselineRevision
      && candidate.boundaryHeadingCount === context.baselineHeadingCount
      && candidate.boundaryAssignedHeadingCount
        === context.baselineAssignedCount
      && candidate.boundarySegmentCount === context.baselineSegmentCount,
    "章节定界安全清理后没有恢复原基线",
  );

  await waitForBoundaryDom(
    () =>
      JSON.stringify(boundaryChapterFiles())
      === JSON.stringify(context.baselineChapterFiles),
    "章节定界安全清理后章节文件分配没有恢复",
  );

  const finalRaw = await fetchRawBoundary();
  requireFeatureDebug(
    finalRaw.workingText === context.baselineWorkingText,
    "章节定界安全清理后 working 未恢复原基线",
  );
  requireFeatureDebug(
    JSON.stringify(finalRaw.sidecar) === JSON.stringify(context.baselineSidecar),
    "章节定界安全清理后 sidecar 未恢复原基线",
  );
  requireFeatureDebug(
    finalRaw.revision === context.baselineRevision
      && finalView.revision === context.baselineRevision,
    "章节定界安全清理后 revision 未恢复原基线",
  );
  requireFeatureDebug(
    finalView.workingLength === context.baselineWorkingLength
      && finalView.undoDepth === 0
      && finalView.redoDepth === 0
      && !finalView.canSave,
    "章节定界安全清理后 working / 历史不干净",
  );
  requireFeatureDebug(
    finalView.chapters.map((chapter) => chapter.name).join("|")
      === context.baselineCatalogNames.join("|"),
    "章节定界真实设备调试意外改变了章节目录清单",
  );
}

async function prepareChapterBoundaryFeatureDebug(): Promise<void> {
  featureDebugMenu.close();
  const initialized = requireInitializedFeatureDebugWorkspace();
  requireFeatureDebug(
    initialized.session === "chapter-clean",
    "章节定界调试需要 clean 的初始化安全副本",
  );

  openBoundaryThroughProductNavigation();

  const view = await waitForBoundaryView(
    (candidate) =>
      candidate.session === "chapter-clean"
      && candidate.workspaceKind === "boundary"
      && candidate.activeReviewModule === "章节定界",
    "无法从真实导航进入 ocr / 章节定界",
  );

  const chapter = actor.getSnapshot().context.chapter;
  requireFeatureDebug(
    chapter?.kind === "boundary",
    "当前工作区不是章节定界",
  );
  requireFeatureDebug(
    view.boundaryHeadingCount > 0,
    "当前章节定界工作稿没有一级标题",
  );

  const raw = await fetchRawBoundary();
  requireFeatureDebug(
    typeof raw.workingText === "string"
      && typeof raw.baselineText === "string"
      && raw.sidecar != null,
    "章节定界工作稿尚未形成完整持久化基线",
  );

  await waitForBoundaryDom(
    () => boundaryFileInputs().length === view.boundaryHeadingCount,
    "章节定界表没有渲染完整的章节文件输入框",
  );

  chapterBoundaryDebugContext = {
    baselineWorkingText: raw.workingText,
    baselineText: raw.baselineText,
    baselineSidecar: raw.sidecar,
    baselineRevision: raw.revision,
    baselineWorkingLength: raw.workingText.length,
    baselineSourceFiles: [...(chapter.boundarySourceFiles ?? [])],
    baselineSourceFileCount: view.boundarySourceFileCount,
    baselineHeadingCount: view.boundaryHeadingCount,
    baselineAssignedCount: view.boundaryAssignedHeadingCount,
    baselineSegmentCount: view.boundarySegmentCount,
    baselineChapterFiles: boundaryChapterFiles(),
    baselineCatalogNames: view.chapters.map((candidate) => candidate.name),
  };
}

function createChapterBoundaryFeatureDebugSteps(): readonly FeatureDebugStep[] {
  return [
    {
      label: "1 基线：真实导航 ocr → 章节定界；核对 OCR / 一级标题 / 章节文件列",
      run: async () => {
        const context = currentChapterBoundaryDebugContext();
        const view = deriveWorkspaceView(actor.getSnapshot());

        requireFeatureDebug(
          view.workspaceKind === "boundary"
            && view.activeReviewModule === "章节定界"
            && view.boundarySourceFileCount === context.baselineSourceFileCount
            && view.boundaryHeadingCount === context.baselineHeadingCount
            && view.boundaryAssignedHeadingCount
              === context.baselineAssignedCount
            && view.boundarySegmentCount === context.baselineSegmentCount,
          "章节定界基线计数不正确",
        );
        requireFeatureDebug(
          calibrationGridHost.querySelector('[role="grid"]')
            ?.getAttribute("aria-colcount") === "4",
          "章节定界 AG Grid 总列数不是 4",
        );
        requireFeatureDebug(
          !boundaryToolbar.hidden
            && boundaryFileInputs().length === context.baselineHeadingCount,
          "章节定界工具栏 / 章节文件输入框没有完整显示",
        );
        requireFeatureDebug(
          view.workingLength === context.baselineWorkingLength
            && view.revision === context.baselineRevision
            && view.undoDepth === 0
            && view.redoDepth === 0
            && !view.canSave,
          "章节定界基线不是 clean 0/0",
        );
      },
    },
    {
      label: "2 自动编号：9901 起依次编号；已分配 / segments 同步，导出按钮变为可用",
      run: async () => {
        const context = currentChapterBoundaryDebugContext();
        boundarySequenceStart.value = "9901";
        assignBoundarySequenceButton.click();

        const view = await waitForBoundaryView(
          (candidate) =>
            candidate.session === "chapter-dirty"
            && candidate.boundaryAssignedHeadingCount
              === context.baselineHeadingCount
            && candidate.boundarySegmentCount === context.baselineHeadingCount
            && candidate.undoDepth === 1,
          "章节定界自动编号后没有形成完整 segments",
        );

        const files = boundaryChapterFiles();
        requireFeatureDebug(
          files.length === context.baselineHeadingCount
            && files.every((file, index) =>
              file.startsWith(String(9901 + index) + " ")
              && file.endsWith(".md")
            ),
          "章节定界 9901 起自动编号结果不正确",
        );
        requireFeatureDebug(
          !exportBoundaryButton.disabled && view.canExportBoundary,
          "章节定界编号完成后导出按钮没有变为可用",
        );
        requireFeatureDebug(
          view.workingLength === context.baselineWorkingLength,
          "章节定界自动编号不应修改 working 文本",
        );
      },
    },
    {
      label: "3 Undo / Redo：恢复原分配，再重现 9901 编号；working 始终不变",
      run: async () => {
        const context = currentChapterBoundaryDebugContext();

        undoButton.click();
        let view = await waitForBoundaryView(
          (candidate) =>
            candidate.session === "chapter-clean"
            && candidate.boundaryAssignedHeadingCount
              === context.baselineAssignedCount
            && candidate.boundarySegmentCount === context.baselineSegmentCount
            && candidate.undoDepth === 0
            && candidate.redoDepth === 1,
          "章节定界 Undo 没有恢复原分配",
        );
        await waitForBoundaryDom(
          () =>
            JSON.stringify(boundaryChapterFiles())
            === JSON.stringify(context.baselineChapterFiles),
          "章节定界 Undo 后章节文件没有恢复原值",
        );
        requireFeatureDebug(
          view.workingLength === context.baselineWorkingLength,
          "章节定界 Undo 意外修改 working",
        );

        redoButton.click();
        view = await waitForBoundaryView(
          (candidate) =>
            candidate.session === "chapter-dirty"
            && candidate.boundaryAssignedHeadingCount
              === context.baselineHeadingCount
            && candidate.boundarySegmentCount === context.baselineHeadingCount
            && candidate.undoDepth === 1
            && candidate.redoDepth === 0,
          "章节定界 Redo 没有恢复完整编号",
        );
        requireFeatureDebug(
          view.workingLength === context.baselineWorkingLength,
          "章节定界 Redo 意外修改 working",
        );
      },
    },
    {
      label: "4 保存 / 重入：9901 编号持久化；导出能力保持可用，但真实设备不执行导出",
      run: async () => {
        const context = currentChapterBoundaryDebugContext();

        saveButton.click();
        context.temporaryRevision = await waitForCleanRevision(
          (nextRevision) =>
            Boolean(nextRevision)
            && nextRevision !== context.baselineRevision,
        );

        let view = deriveWorkspaceView(actor.getSnapshot());
        requireFeatureDebug(
          view.session === "chapter-clean"
            && view.undoDepth === 0
            && view.redoDepth === 0
            && !view.canSave,
          "章节定界保存后状态不 clean",
        );

        executeProductAction("close");
        await waitForWorkspaceSession("idle");
        openBoundaryThroughProductNavigation();

        view = await waitForBoundaryView(
          (candidate) =>
            candidate.session === "chapter-clean"
            && candidate.workspaceKind === "boundary"
            && candidate.boundaryAssignedHeadingCount
              === context.baselineHeadingCount
            && candidate.boundarySegmentCount === context.baselineHeadingCount,
          "章节定界保存重入后没有恢复编号 / segments",
        );

        const files = boundaryChapterFiles();
        requireFeatureDebug(
          files.length === context.baselineHeadingCount
            && files.every((file, index) =>
              file.startsWith(String(9901 + index) + " ")
            ),
          "章节定界保存重入后 9901 编号没有持久化",
        );
        requireFeatureDebug(
          view.revision === context.temporaryRevision
            && view.canExportBoundary
            && !exportBoundaryButton.disabled,
          "章节定界保存重入后 revision / 导出能力不正确",
        );
        requireFeatureDebug(
          view.chapters.map((chapter) => chapter.name).join("|")
            === context.baselineCatalogNames.join("|"),
          "真实设备章节定界调试在保存阶段意外生成了章节目录",
        );
      },
    },
    {
      label: "5 安全恢复：不执行真实导出；恢复原 working / sidecar / revision / 章节目录清单",
      run: async () => {
        await restoreChapterBoundaryRawBaseline();
        const context = currentChapterBoundaryDebugContext();
        const view = deriveWorkspaceView(actor.getSnapshot());

        requireFeatureDebug(
          view.workspaceKind === "boundary"
            && view.activeReviewModule === "章节定界"
            && view.boundaryHeadingCount === context.baselineHeadingCount
            && view.boundaryAssignedHeadingCount
              === context.baselineAssignedCount
            && view.boundarySegmentCount === context.baselineSegmentCount
            && view.revision === context.baselineRevision
            && view.workingLength === context.baselineWorkingLength
            && view.undoDepth === 0
            && view.redoDepth === 0
            && !view.canSave,
          "章节定界最终没有恢复原 clean 基线",
        );
      },
    },
  ];
}

function recoverChapterBoundaryFeatureDebug(error: Error): void {
  featureDebugEnvironmentReady = false;
  document.documentElement.dataset.featureDebugReady = "false";
  featureDebugRunner.refreshControls();
  sourceLocationStatus.textContent =
    "章节定界模块功能调试失败 · 正在恢复原定界工作稿 · " + error.message;

  if (!chapterBoundaryDebugContext) return;
  void restoreChapterBoundaryRawBaseline()
    .then(() => {
      sourceLocationStatus.textContent =
        "章节定界模块功能调试失败 · 原定界工作稿已恢复 · 请重新初始化";
    })
    .catch((restoreError) => {
      sourceLocationStatus.textContent =
        "章节定界模块功能调试失败 · 安全恢复也失败 · "
        + (restoreError instanceof Error ? restoreError.message : String(restoreError));
    });
}

const MARKDOWN_PREVIEW_DEBUG_PREFIX =
  "## 功能调试预览标题\n\n"
  + "> 功能调试预览引用\n\n"
  + "- 功能调试预览列表一\n"
  + "- 功能调试预览列表二\n\n"
  + "[功能调试链接](https://example.com/ocr2md-debug)\n\n"
  + "功能调试 HTML <sup>上标</sup>\n\n"
  + "功能调试行内公式 $x^2 + \\beta = 7$\n\n"
  + "$$\nE = mc^2\n$$\n\n"
  + "| 列一 | 列二 |\n"
  + "| --- | --- |\n"
  + "| A | B |\n\n";

function prepareMarkdownPreviewFeatureDebug(): void {
  featureDebugMenu.close();
  const view = requireInitializedFeatureDebugWorkspace();
  const chapter = actor.getSnapshot().context.chapter;
  requireFeatureDebug(chapter?.kind === "chapter", "Markdown 预览调试需要普通章节");
  requireFeatureDebug(
    markdownPreviewHost.querySelector("h1,h2,h3,h4,h5,h6"),
    "初始化工作稿没有可见 Markdown 标题",
  );
  requireFeatureDebug(
    (markdownPreviewHost.textContent ?? "").length > 100,
    "初始化工作稿预览内容不足",
  );
  markdownPreviewDebugBaselineWorking = chapter.workingText;
  markdownPreviewDebugBaselineText = markdownPreviewHost.textContent ?? "";
  markdownPreviewHost.scrollTop = 0;
  requireFeatureDebug(view.undoDepth === 0 && view.redoDepth === 0, "初始化历史不为空");
}

function createMarkdownPreviewFeatureDebugSteps(): readonly FeatureDebugStep[] {
  return [
    {
      label: "1 基线：原工作稿已有可见 Markdown 标题与正文",
      run: () => {
        requireInitializedFeatureDebugWorkspace();
        requireFeatureDebug(markdownPreviewDebugBaselineWorking, "预览基线 working 不存在");
        requireFeatureDebug(markdownPreviewDebugBaselineText, "预览基线文本不存在");
        requireFeatureDebug(
          markdownPreviewHost.querySelector("h1,h2,h3,h4,h5,h6"),
          "原预览没有标题结构",
        );
        markdownPreviewHost.scrollTop = 0;
      },
    },
    {
      label: "2 正式正文修改：临时插入标题、引用、列表、链接、HTML、LaTeX、表格",
      run: () => {
        requireFeatureDebug(markdownPreviewDebugBaselineWorking, "预览基线 working 不存在");
        applyWorkingTextChange(
          MARKDOWN_PREVIEW_DEBUG_PREFIX + markdownPreviewDebugBaselineWorking,
        );
        const view = deriveWorkspaceView(actor.getSnapshot());
        requireFeatureDebug(view.session === "chapter-dirty", "临时 Markdown 没有进入 dirty");
        requireFeatureDebug(view.undoDepth === 1 && view.redoDepth === 0, "临时 Markdown 历史不正确");
        workingEditor.revealOffsets(0, MARKDOWN_PREVIEW_DEBUG_PREFIX.length);
        markdownPreviewHost.scrollTop = 0;
      },
    },
    {
      label: "3 预览同步：Markdown 结构与语义渲染同时出现",
      run: () => {
        const heading = markdownPreviewHost.querySelector("h2");
        const quote = markdownPreviewHost.querySelector("blockquote");
        const items = markdownPreviewHost.querySelectorAll("ul > li");
        const link = markdownPreviewHost.querySelector<HTMLAnchorElement>(
          'a[href="https://example.com/ocr2md-debug"]',
        );
        const sup = markdownPreviewHost.querySelector("sup");
        const inlineMath = markdownPreviewHost.querySelector(".katex");
        const displayMath = markdownPreviewHost.querySelector(".katex-display");
        const table = markdownPreviewHost.querySelector("table");
        requireFeatureDebug(
          heading?.textContent === "功能调试预览标题",
          "预览没有同步渲染临时 H2",
        );
        requireFeatureDebug(
          quote?.textContent?.trim() === "功能调试预览引用",
          "预览没有同步渲染引用",
        );
        requireFeatureDebug(
          items.length >= 2
            && items[0]?.textContent === "功能调试预览列表一"
            && items[1]?.textContent === "功能调试预览列表二",
          "预览没有同步渲染列表",
        );
        requireFeatureDebug(link?.textContent === "功能调试链接", "预览没有渲染 Markdown 链接");
        requireFeatureDebug(sup?.textContent === "上标", "预览没有渲染 HTML");
        requireFeatureDebug(inlineMath, "预览没有渲染行内 LaTeX / KaTeX");
        requireFeatureDebug(displayMath, "预览没有渲染块级 LaTeX / KaTeX");
        requireFeatureDebug(
          table?.querySelectorAll("th").length === 2
            && table.querySelectorAll("td").length === 2,
          "预览没有渲染 Markdown 表格",
        );
        markdownPreviewHost.scrollTop = 0;
      },
    },
    {
      label: "4 正式 Undo：原 working 与原预览精确恢复",
      run: () => {
        requireFeatureDebug(markdownPreviewDebugBaselineWorking, "预览基线 working 不存在");
        requireFeatureDebug(markdownPreviewDebugBaselineText, "预览基线文本不存在");
        executeProductAction("undo");
        const snapshot = actor.getSnapshot();
        const view = deriveWorkspaceView(snapshot);
        requireFeatureDebug(view.session === "chapter-clean", "Undo 后没有回到 clean");
        requireFeatureDebug(
          snapshot.context.chapter?.workingText === markdownPreviewDebugBaselineWorking,
          "Undo 没有恢复原 working",
        );
        requireFeatureDebug(
          markdownPreviewHost.textContent === markdownPreviewDebugBaselineText,
          "Undo 没有恢复原预览",
        );
        requireFeatureDebug(
          !markdownPreviewHost.textContent?.includes("功能调试预览标题"),
          "临时预览内容没有清除",
        );
      },
    },
    {
      label: "5 关闭重入：清空历史并确认磁盘 revision 未改变",
      run: async () => {
        requireFeatureDebug(featureDebugChapterId, "功能调试安全副本不存在");
        requireFeatureDebug(markdownPreviewDebugBaselineWorking, "预览基线 working 不存在");
        executeProductAction("close");
        await waitForWorkspaceSession("idle");
        executeProductAction("open-chapter", undefined, featureDebugChapterId);
        await waitForWorkspaceSession("chapter-clean");
        executeProductAction("select-review-module", undefined, undefined, "章节标题");
        const snapshot = actor.getSnapshot();
        const view = deriveWorkspaceView(snapshot);
        requireFeatureDebug(view.undoDepth === 0 && view.redoDepth === 0, "重入后历史没有清空");
        requireFeatureDebug(!view.canSave, "重入后不应存在可保存修改");
        requireFeatureDebug(
          view.revision === featureDebugBaselineRevision,
          "Markdown 预览调试意外改变持久化 revision",
        );
        requireFeatureDebug(
          snapshot.context.chapter?.workingText === markdownPreviewDebugBaselineWorking,
          "重入后 working 与原基线不一致",
        );
        markdownPreviewHost.scrollTop = 0;
      },
    },
  ];
}

function recoverMarkdownPreviewFeatureDebug(error: Error): void {
  let view = deriveWorkspaceView(actor.getSnapshot());
  while (view.canUndo) {
    executeProductAction("undo");
    view = deriveWorkspaceView(actor.getSnapshot());
  }
  featureDebugEnvironmentReady = false;
  document.documentElement.dataset.featureDebugReady = "false";
  featureDebugRunner.refreshControls();
  sourceLocationStatus.textContent =
    "Markdown 预览功能调试失败 · 已撤销临时修改 · 请重新初始化 · " + error.message;
}

function previewSourceBlocks(): HTMLElement[] {
  return Array.from(
    markdownPreviewHost.querySelectorAll<HTMLElement>("[data-source-line]"),
  ).filter((node) => Number.isFinite(Number(node.dataset.sourceLine)));
}

function prepareSourcePreviewSyncFeatureDebug(): void {
  featureDebugMenu.close();
  const view = requireInitializedFeatureDebugWorkspace();
  const blocks = previewSourceBlocks();
  requireFeatureDebug(blocks.length > 20, "Markdown 预览 source-line 锚点不足");
  sourcePreviewSyncDebugBaselineSourceLine = workingEditor.topVisibleLine();
  requireFeatureDebug(
    view.undoDepth === 0 && view.redoDepth === 0 && !view.canSave,
    "联动调试基线存在业务历史或可保存修改",
  );
  sourcePreviewScrollSync.syncFromEditor();
}

function createSourcePreviewSyncFeatureDebugSteps(): readonly FeatureDebugStep[] {
  let sourceTargetLine = 0;
  let previewTargetLine = 0;

  return [
    {
      label: "1 基线：源码 / 预览均有可滚内容与 source-line 锚点",
      run: () => {
        const view = requireInitializedFeatureDebugWorkspace();
        const blocks = previewSourceBlocks();
        requireFeatureDebug(blocks.length > 20, "预览 source-line 锚点不足");
        requireFeatureDebug(
          markdownPreviewHost.scrollHeight > markdownPreviewHost.clientHeight,
          "预览窗没有可滚内容",
        );
        requireFeatureDebug(
          view.undoDepth === 0 && view.redoDepth === 0 && !view.canSave,
          "联动基线不 clean",
        );
      },
    },
    {
      label: "2 源码→预览：滚到文档中后段，预览按 source line 跟随",
      run: async () => {
        const blocks = previewSourceBlocks();
        const target = blocks[Math.floor(blocks.length * 0.72)];
        requireFeatureDebug(target, "找不到源码→预览目标锚点");
        sourceTargetLine = Number(target.dataset.sourceLine);
        requireFeatureDebug(sourceTargetLine > 20, "源码→预览目标行过早");

        workingEditor.scrollLineToTop(sourceTargetLine);
        await new Promise<void>((resolve) => window.setTimeout(resolve, 140));

        const syncedLine = Number(markdownPreviewHost.dataset.syncSourceLine ?? "0");
        requireFeatureDebug(
          markdownPreviewHost.dataset.syncOrigin === "editor",
          "源码滚动后没有触发 editor→preview 联动",
        );
        requireFeatureDebug(
          syncedLine > 20
            && syncedLine <= sourceTargetLine
            && sourceTargetLine - syncedLine <= 80,
          "预览没有跟到源码目标附近",
        );
        requireFeatureDebug(markdownPreviewHost.scrollTop > 0, "预览仍停在顶部");
        requireInitializedFeatureDebugWorkspace();
      },
    },
    {
      label: "3 预览→源码：滚到另一 source-line 锚点，源码反向跟随",
      run: async () => {
        const blocks = previewSourceBlocks();
        const target = blocks[Math.floor(blocks.length * 0.34)];
        requireFeatureDebug(target, "找不到预览→源码目标锚点");
        previewTargetLine = Number(target.dataset.sourceLine);
        requireFeatureDebug(previewTargetLine > 1, "预览→源码目标行无效");

        const previewRect = markdownPreviewHost.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        markdownPreviewHost.scrollTop += targetRect.top - previewRect.top - 18;
        markdownPreviewHost.dispatchEvent(new Event("scroll"));
        await new Promise<void>((resolve) => window.setTimeout(resolve, 140));

        const syncedLine = Number(markdownPreviewHost.dataset.syncSourceLine ?? "0");
        const sourceTopLine = workingEditor.topVisibleLine();
        requireFeatureDebug(
          markdownPreviewHost.dataset.syncOrigin === "preview",
          "预览滚动后没有触发 preview→editor 联动",
        );
        requireFeatureDebug(
          Math.abs(syncedLine - previewTargetLine) <= 8,
          "预览 source-line 锚点没有成为同步目标",
        );
        requireFeatureDebug(
          Math.abs(sourceTopLine - syncedLine) <= 8,
          "源码没有反向跟到预览目标附近",
        );
        requireInitializedFeatureDebugWorkspace();
      },
    },
    {
      label: "4 恢复：回到原源码位置，业务状态仍 clean、历史 0/0",
      run: async () => {
        workingEditor.scrollLineToTop(sourcePreviewSyncDebugBaselineSourceLine);
        await new Promise<void>((resolve) => window.setTimeout(resolve, 140));
        sourcePreviewScrollSync.syncFromEditor();
        await new Promise<void>((resolve) => window.setTimeout(resolve, 80));

        const view = requireInitializedFeatureDebugWorkspace();
        requireFeatureDebug(
          Math.abs(
            workingEditor.topVisibleLine()
              - sourcePreviewSyncDebugBaselineSourceLine,
          ) <= 8,
          "源码没有恢复到调试前位置",
        );
        requireFeatureDebug(
          view.undoDepth === 0 && view.redoDepth === 0 && !view.canSave,
          "联动调试意外改变业务历史",
        );
      },
    },
  ];
}

function recoverSourcePreviewSyncFeatureDebug(error: Error): void {
  workingEditor.scrollLineToTop(sourcePreviewSyncDebugBaselineSourceLine);
  sourcePreviewScrollSync.syncFromEditor();
  featureDebugEnvironmentReady = false;
  document.documentElement.dataset.featureDebugReady = "false";
  featureDebugRunner.refreshControls();
  sourceLocationStatus.textContent =
    "源码 / 预览联动功能调试失败 · 已尝试恢复源码位置 · 请重新初始化 · "
    + error.message;
}

function currentTableConfigDebugContext(): TableConfigDebugContext {
  requireFeatureDebug(tableConfigDebugContext, "配置调试上下文不存在");
  return tableConfigDebugContext;
}

async function readTablePresentationPayload(): Promise<{
  exists: boolean;
  source?: string;
}> {
  const response = await fetch("/__workspace/table-presentation", {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  requireFeatureDebug(response.ok, "无法读取项目配置");
  const payload = await response.json() as {
    exists?: boolean;
    source?: string | null;
  };
  return {
    exists: payload.exists === true,
    source: typeof payload.source === "string" ? payload.source : undefined,
  };
}

async function waitForTableConfigHeaderPrefix(
  expected: readonly string[],
  timeoutMs = 4_000,
): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    const headers = currentCalibrationHeaderOrder();
    if (
      headers.length >= expected.length
      && expected.every((value, index) => headers[index] === value)
    ) {
      return;
    }
    await new Promise<void>((resolve) => window.setTimeout(resolve, 25));
  }
  throw new Error(
    "表格列序未更新为 " + expected.join(" → ")
      + "；当前 " + currentCalibrationHeaderOrder().join(" → "),
  );
}

async function restoreTableConfigDebugBaseline(): Promise<void> {
  const context = currentTableConfigDebugContext();
  requireFeatureDebug(tablePresentationEditor, "配置编辑器不存在");

  tablePresentationEditor.setSource(TABLE_PRESENTATION_DEFAULT_SOURCE);
  await new Promise<void>((resolve) => window.setTimeout(resolve, 220));

  const response = context.baselineExists
    ? await fetch("/__workspace/table-presentation", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ source: context.baselineSource ?? "" }),
      })
    : await fetch("/__workspace/table-presentation", {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });
  requireFeatureDebug(response.ok, "恢复原项目配置失败");

  await tablePresentationEditor.load();
  await new Promise<void>((resolve) => window.setTimeout(resolve, 120));

  const restored = await readTablePresentationPayload();
  requireFeatureDebug(
    restored.exists === context.baselineExists,
    "项目配置存在状态未恢复",
  );
  requireFeatureDebug(
    !context.baselineExists || restored.source === context.baselineSource,
    "项目配置文本未精确恢复",
  );
}

async function prepareTableConfigFeatureDebug(): Promise<void> {
  featureDebugMenu.close();
  requireInitializedFeatureDebugWorkspace();
  requireFeatureDebug(tablePresentationEditor, "配置编辑器不存在");

  const annotationButton = reviewModuleButtons.find(
    (button) => button.dataset.reviewModule === "注释",
  );
  requireFeatureDebug(annotationButton, "找不到注释正式数据表 tag");
  annotationButton.click();
  await new Promise<void>((resolve) => window.setTimeout(resolve, 80));
  requireFeatureDebug(
    deriveWorkspaceView(actor.getSnapshot()).activeReviewModule === "注释",
    "没有进入注释模块",
  );

  setSourcePaneMode("table-config");
  await tablePresentationEditor.load();
  await new Promise<void>((resolve) => window.setTimeout(resolve, 120));

  const baseline = await readTablePresentationPayload();
  const baselineHeaders = currentCalibrationHeaderOrder();
  requireFeatureDebug(baselineHeaders.length >= 4, "注释表列头不足");

  const temporaryColumns =
    baselineHeaders[0] === "注释号"
      ? ["行号", "注释号", "预览", "行类型", "配对状态"]
      : ["注释号", "行号", "预览", "行类型", "配对状态"];
  const temporarySource = JSON.stringify({
    version: 1,
    modules: {
      注释: {
        columns: temporaryColumns,
        sort: ["注释号", "行号"],
        columnStyles: {
          行号: { pinned: null },
          预览: { minWidth: 220, flex: 1 },
        },
      },
    },
  }, null, 2) + "\n";

  tableConfigDebugContext = {
    baselineExists: baseline.exists,
    baselineSource: baseline.source,
    baselineHeaders,
    temporarySource,
    temporaryHeaders: temporaryColumns.slice(0, 4),
  };
}

function createTableConfigFeatureDebugSteps(): readonly FeatureDebugStep[] {
  const defaultProbeSource = JSON.stringify({
    version: 1,
    modules: {
      注释: {
        columns: ["行号", "行类型", "注释号", "预览", "配对状态"],
        sort: ["注释号", "行号"],
      },
    },
  }, null, 2) + "\n";

  return [
    {
      label: "1 基线：项目配置已快照，章节 clean / Undo Redo 0/0",
      run: () => {
        const context = currentTableConfigDebugContext();
        const view = requireInitializedFeatureDebugWorkspace();
        requireFeatureDebug(
          view.activeReviewModule === "注释",
          "基线没有停在注释模块",
        );
        requireFeatureDebug(
          view.undoDepth === 0 && view.redoDepth === 0 && !view.canSave,
          "基线存在章节历史或可保存修改",
        );
        requireFeatureDebug(
          sameStringArray(
            currentCalibrationHeaderOrder().slice(
              0,
              context.baselineHeaders.length,
            ),
            context.baselineHeaders,
          ),
          "基线列序与快照不一致",
        );
      },
    },
    {
      label: "2 热更新：真实配置编辑器改列序，无需 build / reload",
      run: async () => {
        const context = currentTableConfigDebugContext();
        requireFeatureDebug(tablePresentationEditor, "配置编辑器不存在");
        tablePresentationEditor.setSource(context.temporarySource);
        await waitForTableConfigHeaderPrefix(context.temporaryHeaders);
        requireFeatureDebug(
          (editorModeStatus.textContent ?? "").includes("实时预览"),
          "有效配置没有进入实时预览状态",
        );
        const view = deriveWorkspaceView(actor.getSnapshot());
        requireFeatureDebug(
          view.session === "chapter-clean"
            && view.undoDepth === 0
            && view.redoDepth === 0
            && !view.canSave,
          "热更新污染了章节业务状态",
        );
      },
    },
    {
      label: "3 非法配置：保留 last-known-good，不破坏当前表格",
      run: async () => {
        const context = currentTableConfigDebugContext();
        requireFeatureDebug(tablePresentationEditor, "配置编辑器不存在");
        tablePresentationEditor.setSource("{ bad json");
        await new Promise<void>((resolve) => window.setTimeout(resolve, 220));
        requireFeatureDebug(
          (editorModeStatus.textContent ?? "").includes(
            "已保留最后有效配置",
          ),
          "非法配置没有显示 last-known-good 保护",
        );
        await waitForTableConfigHeaderPrefix(context.temporaryHeaders);
        const view = deriveWorkspaceView(actor.getSnapshot());
        requireFeatureDebug(
          view.undoDepth === 0 && view.redoDepth === 0 && !view.canSave,
          "非法配置污染了章节历史",
        );
      },
    },
    {
      label: "4 保存 / 重载：项目配置持久化并重新加载同一列序",
      run: async () => {
        const context = currentTableConfigDebugContext();
        requireFeatureDebug(tablePresentationEditor, "配置编辑器不存在");
        tablePresentationEditor.setSource(context.temporarySource);
        await waitForTableConfigHeaderPrefix(context.temporaryHeaders);
        requireFeatureDebug(
          await tablePresentationEditor.save(),
          "临时配置保存失败",
        );

        tablePresentationEditor.setSource(defaultProbeSource);
        await waitForTableConfigHeaderPrefix(
          ["行号", "行类型", "注释号", "预览"],
        );
        await tablePresentationEditor.load();
        await waitForTableConfigHeaderPrefix(context.temporaryHeaders);

        const persisted = await readTablePresentationPayload();
        requireFeatureDebug(
          persisted.exists && persisted.source === context.temporarySource,
          "保存 / 重载后项目配置内容不一致",
        );
        const view = deriveWorkspaceView(actor.getSnapshot());
        requireFeatureDebug(
          view.session === "chapter-clean"
            && view.undoDepth === 0
            && view.redoDepth === 0
            && !view.canSave,
          "保存配置意外污染章节状态",
        );
      },
    },
    {
      label: "5 安全恢复：原配置存在状态 / 文本精确恢复，章节仍 clean",
      run: async () => {
        const context = currentTableConfigDebugContext();
        await restoreTableConfigDebugBaseline();

        if (context.baselineHeaders.length >= 4) {
          await waitForTableConfigHeaderPrefix(
            context.baselineHeaders.slice(0, 4),
          );
        }
        const view = deriveWorkspaceView(actor.getSnapshot());
        requireFeatureDebug(
          view.session === "chapter-clean"
            && view.undoDepth === 0
            && view.redoDepth === 0
            && !view.canSave,
          "恢复后章节状态不干净",
        );
        requireFeatureDebug(
          view.revision === featureDebugBaselineRevision,
          "配置调试意外改变章节 revision",
        );
      },
    },
  ];
}

function recoverTableConfigFeatureDebug(error: Error): void {
  void (async () => {
    try {
      if (tableConfigDebugContext) {
        await restoreTableConfigDebugBaseline();
      }
    } finally {
      sourceLocationStatus.textContent =
        "配置功能调试失败 · 已尝试恢复原项目配置 · " + error.message;
      tableConfigDebugContext = undefined;
    }
  })();
}

function setRegexSearchThroughProductUi(value: string): void {
  regexSearchInput.focus();
  regexSearchInput.value = value;
  regexSearchInput.dispatchEvent(new Event("input", { bubbles: true }));
}

function prepareSourceRegexSearchFeatureDebug(): void {
  featureDebugMenu.close();
  requireInitializedFeatureDebugWorkspace();
  setSourcePaneMode("source");
  setRegexSearchOpen(true);
  sourceRegexSearch.reset();
  syncRegexSearchTarget("source");
  requireFeatureDebug(regexSearchInput.value === "", "初始化后搜索框不为空");
  requireFeatureDebug(searchStatus.textContent === "", "初始化后搜索状态不为空");
  requireFeatureDebug(searchPreviousButton.disabled, "初始化后上一个按钮应禁用");
  requireFeatureDebug(searchNextButton.disabled, "初始化后下一个按钮应禁用");
}

function createSourceRegexSearchFeatureDebugSteps(): readonly FeatureDebugStep[] {
  let matchCount = 0;
  return [
    {
      label: "1 基线：搜索为空，工作稿 clean，历史 0/0",
      run: () => {
        const view = requireInitializedFeatureDebugWorkspace();
        requireFeatureDebug(regexSearchInput.value === "", "搜索框基线不为空");
        requireFeatureDebug(searchStatus.textContent === "", "搜索状态基线不为空");
        requireFeatureDebug(
          view.undoDepth === 0 && view.redoDepth === 0 && !view.canSave,
          "搜索基线意外存在业务历史或可保存修改",
        );
      },
    },
    {
      label: "2 真实输入事件：Buffett → 显示匹配计数并定位 1/N",
      run: () => {
        setRegexSearchThroughProductUi("Buffett");
        const matched = /^(\d+) 个匹配 · 1\/\1$/.exec(searchStatus.textContent ?? "");
        requireFeatureDebug(matched, "Buffett 搜索没有显示 1/N 匹配状态");
        matchCount = Number(matched[1]);
        requireFeatureDebug(matchCount > 1, "Buffett 匹配数不足以验证导航");
        requireFeatureDebug(!searchPreviousButton.disabled, "有匹配时上一个按钮仍禁用");
        requireFeatureDebug(!searchNextButton.disabled, "有匹配时下一个按钮仍禁用");
        requireInitializedFeatureDebugWorkspace();
      },
    },
    {
      label: "3 真实 ↓ 按钮：跳到 2/N",
      run: () => {
        searchNextButton.click();
        requireFeatureDebug(
          searchStatus.textContent
            === String(matchCount) + " 个匹配 · 2/" + String(matchCount),
          "下一条没有进入 2/N",
        );
        requireInitializedFeatureDebugWorkspace();
      },
    },
    {
      label: "4 真实 ↑ 按钮：返回 1/N",
      run: () => {
        searchPreviousButton.click();
        requireFeatureDebug(
          searchStatus.textContent
            === String(matchCount) + " 个匹配 · 1/" + String(matchCount),
          "上一条没有返回 1/N",
        );
        requireInitializedFeatureDebugWorkspace();
      },
    },
    {
      label: "5 非法正则：[ → 可见错误，导航禁用",
      run: () => {
        setRegexSearchThroughProductUi("[");
        requireFeatureDebug(
          regexSearchInput.getAttribute("aria-invalid") === "true",
          "非法正则没有标记 aria-invalid",
        );
        requireFeatureDebug(
          (searchStatus.textContent ?? "").startsWith("正则错误："),
          "非法正则没有显示错误信息",
        );
        requireFeatureDebug(
          searchPreviousButton.disabled && searchNextButton.disabled,
          "非法正则时导航按钮没有禁用",
        );
        requireInitializedFeatureDebugWorkspace();
      },
    },
    {
      label: "6 清空：搜索状态恢复，业务状态与 revision 零变化",
      run: () => {
        setRegexSearchThroughProductUi("");
        const view = requireInitializedFeatureDebugWorkspace();
        requireFeatureDebug(regexSearchInput.value === "", "搜索框没有清空");
        requireFeatureDebug(searchStatus.textContent === "", "搜索状态没有清空");
        requireFeatureDebug(
          regexSearchInput.getAttribute("aria-invalid") !== "true",
          "清空后 aria-invalid 没有移除",
        );
        requireFeatureDebug(
          searchPreviousButton.disabled && searchNextButton.disabled,
          "清空后导航按钮应禁用",
        );
        requireFeatureDebug(
          view.undoDepth === 0 && view.redoDepth === 0 && !view.canSave,
          "正则搜索调试意外改变业务历史或保存状态",
        );
        requireFeatureDebug(
          view.revision === featureDebugBaselineRevision,
          "正则搜索调试意外改变 revision",
        );
      },
    },
  ];
}

function recoverSourceRegexSearchFeatureDebug(error: Error): void {
  sourceRegexSearch.reset();
  sourceLocationStatus.textContent =
    "源码正则搜索功能调试失败 · 已清空搜索状态 · " + error.message;
}

function currentUndoRedoDebugContext(): UndoRedoDebugContext {
  requireFeatureDebug(undoRedoDebugContext, "撤销 / 重做调试上下文不存在");
  return undoRedoDebugContext;
}

async function prepareUndoRedoFeatureDebug(): Promise<void> {
  featureDebugMenu.close();

  const initialSnapshot = actor.getSnapshot();
  const initialView = deriveWorkspaceView(initialSnapshot);
  requireFeatureDebug(
    featureDebugEnvironmentReady && featureDebugChapterId,
    "请先运行“初始化工作稿”",
  );
  requireFeatureDebug(
    initialView.session === "chapter-clean"
      && initialSnapshot.context.chapter?.id === featureDebugChapterId,
    "功能调试工作稿已离开初始化基线；请重新运行“初始化工作稿”",
  );
  requireFeatureDebug(
    !initialView.canUndo && !initialView.canRedo,
    "当前功能调试工作稿已有 Undo / Redo 历史；请重新初始化",
  );
  requireFeatureDebug(
    initialView.revision === featureDebugBaselineRevision,
    "功能调试工作稿 revision 已变化；请重新初始化",
  );

  const initialChapterId = initialSnapshot.context.chapter?.id;
  const target = initialView.chapters.find(
    (chapter) => chapter.id === featureDebugChapterId,
  );
  requireFeatureDebug(target?.ready, "功能调试安全副本不可用");

  executeProductAction(
    "select-review-module",
    undefined,
    undefined,
    "章节标题",
  );

  const baselineSnapshot = actor.getSnapshot();
  const baselineView = deriveWorkspaceView(baselineSnapshot);
  const chapter = baselineSnapshot.context.chapter;
  requireFeatureDebug(chapter?.kind === "chapter", "功能调试章节加载失败");

  const headingRow = chapter.rows.find(
    (row) =>
      row.typeLabel === "章节标题"
      && row.lineType !== "已忽略"
      && row.lineType !== "已删除",
  );
  requireFeatureDebug(headingRow, "当前功能调试章节没有可用章节标题候选");

  undoRedoDebugContext = {
    initialSession: initialView.session,
    initialChapterId,
    initialReviewModule: initialView.activeReviewModule,
    targetChapterId: target.id,
    baselineWorking: chapter.workingText,
    baselineRevision: baselineView.revision,
    baselineVisible: baselineView.visibleCalibrationRows ?? 0,
    baselineIgnored: baselineView.ignoredCalibrationRows ?? 0,
    headingRowId: headingRow.id,
  };
}

function createUndoRedoFeatureDebugSteps(): readonly FeatureDebugStep[] {
  return [
    {
      label: "1 基线：clean，Undo / Redo 均为空",
      run: () => {
        const context = currentUndoRedoDebugContext();
        const snapshot = actor.getSnapshot();
        const view = deriveWorkspaceView(snapshot);
        requireFeatureDebug(view.session === "chapter-clean", "基线不是 clean");
        requireFeatureDebug(view.undoDepth === 0 && view.redoDepth === 0, "基线历史栈不为空");
        requireFeatureDebug(
          snapshot.context.chapter?.workingText === context.baselineWorking,
          "基线 working 不一致",
        );
      },
    },
    {
      label: "2 正文修改：进入 dirty，Undo +1",
      run: () => {
        const context = currentUndoRedoDebugContext();
        applyWorkingTextChange(context.baselineWorking + "※");
        const view = deriveWorkspaceView(actor.getSnapshot());
        requireFeatureDebug(view.session === "chapter-dirty", "正文修改后没有进入 dirty");
        requireFeatureDebug(view.undoDepth === 1 && view.redoDepth === 0, "正文修改历史不正确");
        requireFeatureDebug(
          actor.getSnapshot().context.chapter?.workingText
            === context.baselineWorking + "※",
          "正文修改没有进入正式 working",
        );
      },
    },
    {
      label: "3 标题设为已忽略：与正文共用同一历史",
      run: () => {
        const context = currentUndoRedoDebugContext();
        applyCalibrationLineTypeChange(context.headingRowId, "已忽略");
        const view = deriveWorkspaceView(actor.getSnapshot());
        requireFeatureDebug(view.undoDepth === 2 && view.redoDepth === 0, "标定修改没有进入统一历史");
        requireFeatureDebug(
          view.visibleCalibrationRows === context.baselineVisible - 1,
          "已忽略后可见标定数没有减少",
        );
        requireFeatureDebug(
          view.ignoredCalibrationRows === context.baselineIgnored + 1,
          "已忽略标定数没有增加",
        );
        requireFeatureDebug(
          actor.getSnapshot().context.chapter?.workingText
            === context.baselineWorking + "※",
          "已忽略不应修改 working",
        );
      },
    },
    {
      label: "4 Undo 标定：正文保留，标题恢复",
      run: () => {
        const context = currentUndoRedoDebugContext();
        executeProductAction("undo");
        const view = deriveWorkspaceView(actor.getSnapshot());
        requireFeatureDebug(view.undoDepth === 1 && view.redoDepth === 1, "Undo 后历史深度不正确");
        requireFeatureDebug(
          view.visibleCalibrationRows === context.baselineVisible
            && view.ignoredCalibrationRows === context.baselineIgnored,
          "Undo 没有恢复标题标定",
        );
        requireFeatureDebug(
          actor.getSnapshot().context.chapter?.workingText
            === context.baselineWorking + "※",
          "标定 Undo 错误影响了正文",
        );
      },
    },
    {
      label: "5 Redo 标定：再次恢复已忽略",
      run: () => {
        const context = currentUndoRedoDebugContext();
        executeProductAction("redo");
        const view = deriveWorkspaceView(actor.getSnapshot());
        requireFeatureDebug(view.undoDepth === 2 && view.redoDepth === 0, "Redo 后历史深度不正确");
        requireFeatureDebug(
          view.visibleCalibrationRows === context.baselineVisible - 1
            && view.ignoredCalibrationRows === context.baselineIgnored + 1,
          "Redo 没有恢复已忽略标定",
        );
      },
    },
    {
      label: "6 连续 Undo：正文与标定精确回到保存基线",
      run: () => {
        const context = currentUndoRedoDebugContext();
        executeProductAction("undo");
        executeProductAction("undo");
        const snapshot = actor.getSnapshot();
        const view = deriveWorkspaceView(snapshot);
        requireFeatureDebug(view.session === "chapter-clean", "连续 Undo 后没有回到 clean");
        requireFeatureDebug(view.undoDepth === 0 && view.redoDepth === 2, "连续 Undo 历史不正确");
        requireFeatureDebug(
          snapshot.context.chapter?.workingText === context.baselineWorking,
          "连续 Undo 没有恢复 working 基线",
        );
        requireFeatureDebug(
          view.visibleCalibrationRows === context.baselineVisible
            && view.ignoredCalibrationRows === context.baselineIgnored,
          "连续 Undo 没有恢复标定基线",
        );
      },
    },
    {
      label: "7 Undo 后新修改：旧 Redo 分支立即失效",
      run: () => {
        const context = currentUndoRedoDebugContext();
        applyWorkingTextChange(context.baselineWorking + "◇");
        let view = deriveWorkspaceView(actor.getSnapshot());
        requireFeatureDebug(view.undoDepth === 1 && view.redoDepth === 0, "新操作没有清空旧 Redo");
        executeProductAction("undo");
        view = deriveWorkspaceView(actor.getSnapshot());
        requireFeatureDebug(view.session === "chapter-clean", "新正文 Undo 后没有回到 clean");
        requireFeatureDebug(
          actor.getSnapshot().context.chapter?.workingText === context.baselineWorking,
          "新正文 Undo 没有恢复基线",
        );
      },
    },
    {
      label: "8 关闭重入清空历史，并确认磁盘 revision 未改变",
      run: async () => {
        const context = currentUndoRedoDebugContext();

        executeProductAction("close");
        await waitForWorkspaceSession("idle");
        executeProductAction("open-chapter", undefined, context.targetChapterId);
        await waitForWorkspaceSession("chapter-clean");

        let snapshot = actor.getSnapshot();
        let view = deriveWorkspaceView(snapshot);
        requireFeatureDebug(view.undoDepth === 0 && view.redoDepth === 0, "重入后历史没有清空");
        requireFeatureDebug(
          snapshot.context.chapter?.workingText === context.baselineWorking,
          "重入后 working 与磁盘基线不一致",
        );
        requireFeatureDebug(
          view.revision === context.baselineRevision,
          "功能调试意外改变了持久化 revision",
        );

        if (context.initialSession === "idle") {
          executeProductAction("close");
          await waitForWorkspaceSession("idle");
        } else {
          if (context.initialReviewModule !== view.activeReviewModule) {
            executeProductAction(
              "select-review-module",
              undefined,
              undefined,
              context.initialReviewModule,
            );
          }
          snapshot = actor.getSnapshot();
          view = deriveWorkspaceView(snapshot);
          requireFeatureDebug(
            snapshot.context.chapter?.id === context.initialChapterId,
            "没有恢复原先打开的章节",
          );
          requireFeatureDebug(view.session === "chapter-clean", "原章节恢复失败");
        }
      },
    },
  ];
}

function recoverUndoRedoFeatureDebug(): void {
  const context = undoRedoDebugContext;
  if (!context) return;

  let view = deriveWorkspaceView(actor.getSnapshot());
  while (view.canUndo) {
    executeProductAction("undo");
    view = deriveWorkspaceView(actor.getSnapshot());
  }

  if (view.session === "chapter-clean") {
    executeProductAction("close");
    if (context.initialSession === "chapter-clean" && context.initialChapterId) {
      executeProductAction("open-chapter", undefined, context.initialChapterId);
    }
  }
}

workspaceDirectoryButton.addEventListener("click", () => {
  const startPath = workspaceDirectoryPayload?.currentProjectPath ?? "";
  void loadWorkspaceDirectory(startPath, true);
});
workspaceDirectoryParent.addEventListener("click", () => {
  const parentPath = workspaceDirectoryPayload?.parentPath;
  if (parentPath == null) return;
  void loadWorkspaceDirectory(parentPath, true);
});
workspaceDirectoryCancel.addEventListener("click", closeWorkspaceDirectoryBrowser);
workspaceDirectoryOverlay.addEventListener("click", (event) => {
  if (event.target === workspaceDirectoryOverlay) closeWorkspaceDirectoryBrowser();
});
workspaceDirectorySelect.addEventListener("click", () => {
  void switchWorkspaceDirectory();
});

chapterSelect.addEventListener("change", () => {
  const target = chapterSelect.value;
  if (!target) return;

  if (target === "__node_ocr__") {
    const view = deriveWorkspaceView(actor.getSnapshot());
    if (view.session === "chapter-dirty") {
      chapterSelect.value = view.workspaceKind === "translation" && view.selectedChapterId
        ? `__node_trans_${view.selectedChapterId}__`
        : view.workspaceKind === "chapter" && view.selectedChapterId
          ? view.selectedChapterId
          : "";
      sourceLocationStatus.textContent =
        "当前工作稿有未保存修改 · 请先保存、撤销或关闭后再切换到 ocr";
      return;
    }
    executeProductAction("open-boundary");
    return;
  }

  if (target === "__node_chapters__") {
    const view = deriveWorkspaceView(actor.getSnapshot());
    const firstReady = view.chapters.find((chapter) => chapter.ready);
    if (!firstReady) {
      chapterSelect.value = view.workspaceKind === "boundary"
        ? "__node_ocr__"
        : view.workspaceKind === "translation" && view.selectedChapterId
          ? `__node_trans_${view.selectedChapterId}__`
          : view.workspaceKind === "chapter" && view.selectedChapterId
            ? view.selectedChapterId
            : "";
      return;
    }
    executeProductAction("open-chapter", undefined, firstReady.id);
    return;
  }

  const transMatch = /^__node_trans_(.+)__$/.exec(target);
  if (transMatch) {
    const view = deriveWorkspaceView(actor.getSnapshot());
    if (view.session === "chapter-dirty") {
      chapterSelect.value = view.workspaceKind === "translation" && view.selectedChapterId
        ? `__node_trans_${view.selectedChapterId}__`
        : view.workspaceKind === "chapter" && view.selectedChapterId
          ? view.selectedChapterId
          : "";
      sourceLocationStatus.textContent =
        "当前工作稿有未保存修改 · 请先保存、撤销或关闭后再进入 trans";
      return;
    }
    lastUiAction = "open-translation";
    lastCommandId = undefined;
    actor.send({ type: "OPEN_TRANSLATION", chapterId: transMatch[1] });
    return;
  }

  if (target.startsWith("__node_")) return;
  executeProductAction("open-chapter", undefined, target);
});

refreshCatalogButton.addEventListener("click", () => {
  lastUiAction = "refresh-catalog";
  lastCommandId = undefined;
  actor.send({ type: "REFRESH_CATALOG" });
});

for (const button of reviewModuleButtons) {
  button.addEventListener("click", () => {
    const module = button.dataset.reviewModule as ActiveReviewModule | undefined;
    if (!module || !ACTIVE_REVIEW_MODULES.includes(module)) return;
    if (chapterElementModules.has(module)) {
      setChapterElementMenuOpen(false);
    }
    if (translationElementModules.has(module)) {
      setTranslationElementMenuOpen(false);
    }
    if (configGridMode) setSourcePaneMode("source");
    lastUiAction = "select-review-module";
    lastCommandId = undefined;
    actor.send({ type: "SELECT_REVIEW_MODULE", module });
  });
}

async function downloadAllPendingMedia(): Promise<void> {
  if (mediaDownloadRunning || !chapterRepository.downloadExternalMedia) return;
  const initialSnapshot = actor.getSnapshot();
  const initialView = deriveWorkspaceView(initialSnapshot);
  const initialChapter = initialSnapshot.context.chapter;
  if (
    initialChapter?.kind !== "chapter"
    || initialView.canSave
    || !initialChapter.revision
  ) {
    mediaDownloadStatusText = initialView.canSave
      ? "请先保存当前编辑，再下载媒体"
      : "当前章节不能下载媒体";
    mediaDownloadStatus.textContent = mediaDownloadStatusText;
    return;
  }

  const pending = deriveMediaCatalog(initialChapter).filter(
    (item) => item.group === "未下载" && item.sourceUrl,
  );
  if (!pending.length) {
    mediaDownloadStatusText = "没有未下载媒体";
    mediaDownloadStatus.textContent = mediaDownloadStatusText;
    return;
  }

  mediaDownloadRunning = true;
  mediaDownloadStatusChapterId = initialChapter.id;
  mediaDownloadButton.disabled = true;
  workingEditor.setEditable(false);
  lastUiAction = "download-media";
  lastCommandId = undefined;
  let downloaded = 0;
  let failed = 0;

  try {
    for (const [index, item] of pending.entries()) {
      const snapshot = actor.getSnapshot();
      const view = deriveWorkspaceView(snapshot);
      const chapter = snapshot.context.chapter;
      if (
        chapter?.kind !== "chapter"
        || chapter.id !== initialChapter.id
        || view.canSave
        || !chapter.revision
      ) {
        mediaDownloadStatusText = `下载已暂停 · 已完成 ${downloaded}/${pending.length}`;
        break;
      }
      const sourceUrl = item.sourceUrl;
      if (!sourceUrl) continue;
      mediaDownloadButton.textContent = `下载中 ${index + 1}/${pending.length}`;
      mediaDownloadStatusText = `正在下载 ${index + 1}/${pending.length} · ${item.displayName}`;
      mediaDownloadStatus.textContent = mediaDownloadStatusText;
      try {
        const result = await chapterRepository.downloadExternalMedia({
          chapterId: chapter.id,
          expectedRevision: chapter.revision,
          sourceUrl,
        });
        actor.send({
          type: "MEDIA_DOWNLOAD_APPLIED",
          chapterId: chapter.id,
          workingText: result.workingText,
          revision: result.revision,
          savedAt: result.savedAt,
          media: result.media,
        });
        downloaded += 1;
        mediaDownloadStatusText = `已保存 ${downloaded}/${pending.length} · ${result.fileName}`;
        mediaDownloadStatus.textContent = mediaDownloadStatusText;
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        mediaDownloadStatusText = `第 ${index + 1}/${pending.length} 项失败 · ${message}`;
        mediaDownloadStatus.textContent = mediaDownloadStatusText;
        if (/变化|冲突|revision/i.test(message)) break;
      }
    }
  } finally {
    mediaDownloadRunning = false;
    const chapter = actor.getSnapshot().context.chapter;
    const remaining = deriveMediaCatalog(chapter).filter(
      (item) => item.group === "未下载",
    ).length;
    mediaDownloadStatusText = remaining === 0
      ? `下载完成 · 成功 ${downloaded} · 失败 ${failed} · 已全部采用本地媒体`
      : `本轮完成 · 成功 ${downloaded} · 失败 ${failed} · 剩余 ${remaining}；再次点击可续存`;
    mediaDownloadStatus.textContent = mediaDownloadStatusText;
    const view = deriveWorkspaceView(actor.getSnapshot());
    workingEditor.setEditable(Boolean(chapter) && view.canEdit);
    mediaDownloadButton.disabled = view.canSave || remaining === 0;
    mediaDownloadButton.textContent = remaining > 0
      ? `继续下载（${remaining}）`
      : "已全部下载";
  }
}

mediaDownloadButton.addEventListener("click", () => {
  void downloadAllPendingMedia();
});

headingNumbering.addEventListener("change", () => {
  lastUiAction = "set-heading-numbering";
  lastCommandId = undefined;
  actor.send({
    type: "SET_HEADING_NUMBERING",
    enabled: headingNumbering.checked,
  });
});

openChapterButton.addEventListener("click", () => executeProductAction("open-chapter"));
openTranslationButton.addEventListener("click", () => {
  const chapterId = deriveWorkspaceView(actor.getSnapshot()).selectedChapterId;
  if (!chapterId) return;
  lastUiAction = "open-translation";
  lastCommandId = undefined;
  actor.send({ type: "OPEN_TRANSLATION", chapterId });
});
openBoundaryButton.addEventListener("click", () => {
  lastUiAction = "open-boundary";
  lastCommandId = undefined;
  actor.send({ type: "OPEN_BOUNDARY" });
});
assignBoundarySequenceButton.addEventListener("click", () => {
  lastUiAction = "assign-boundary-sequence";
  lastCommandId = undefined;
  actor.send({
    type: "ASSIGN_BOUNDARY_SEQUENCE",
    start: boundarySequenceStart.value,
  });
});
exportBoundaryButton.addEventListener("click", () => {
  lastUiAction = "export-boundary";
  lastCommandId = undefined;
  actor.send({ type: "EXPORT_BOUNDARY" });
});
undoButton.addEventListener("click", () => executeProductAction("undo"));
redoButton.addEventListener("click", () => executeProductAction("redo"));
saveButton.addEventListener("click", () => executeProductAction("save"));
exportCalibrationButton.addEventListener("click", () => {
  const view = deriveWorkspaceView(actor.getSnapshot());
  if (!view.canExportCalibration) return;
  exportCalibrationVisible = true;
  exportCalibrationPendingDestination = undefined;
  exportDestinationTrans.checked = false;
  exportDestinationOutput.checked = false;
  exportCalibrationStatus.textContent = "";
  exportCalibrationConfirmButton.disabled = true;
  exportCalibrationOverlay.hidden = false;
});
for (const input of [exportDestinationTrans, exportDestinationOutput]) {
  input.addEventListener("change", () => {
    const view = deriveWorkspaceView(actor.getSnapshot());
    exportCalibrationConfirmButton.disabled =
      !view.canExportCalibration || !selectedCalibrationExportDestination();
  });
}
exportCalibrationCancelButton.addEventListener("click", () => {
  if (exportCalibrationPendingDestination) return;
  exportCalibrationVisible = false;
  exportCalibrationOverlay.hidden = true;
});
exportCalibrationConfirmButton.addEventListener("click", () => {
  const view = deriveWorkspaceView(actor.getSnapshot());
  const destination = selectedCalibrationExportDestination();
  if (!view.canExportCalibration || !destination) return;
  exportCalibrationPendingDestination = destination;
  exportCalibrationStatus.textContent =
    `正在导出到当前章节/${destination}…`;
  exportCalibrationConfirmButton.disabled = true;
  lastUiAction = "export-calibration";
  lastCommandId = undefined;
  actor.send({ type: "EXPORT_CALIBRATION", destination });
});
resetCalibrationButton.addEventListener("click", () => {
  const view = deriveWorkspaceView(actor.getSnapshot());
  if (!view.canResetCalibration) return;
  resetConfirmVisible = true;
  resetConfirmOverlay.hidden = false;
  resetConfirmButton.disabled = false;
  resetConfirmMessage.textContent = view.chapterName
    ? `「${view.chapterName}」的当前工作稿和全部人工标定将恢复到原始状态，并立即保存。此操作会清空撤销 / 重做历史。`
    : "当前工作稿和全部人工标定将恢复到原始状态，并立即保存。此操作会清空撤销 / 重做历史。";
});
resetCancelButton.addEventListener("click", () => {
  resetConfirmVisible = false;
  resetConfirmOverlay.hidden = true;
});
resetConfirmButton.addEventListener("click", () => {
  const view = deriveWorkspaceView(actor.getSnapshot());
  resetConfirmVisible = false;
  resetConfirmOverlay.hidden = true;
  if (!view.canResetCalibration) return;
  lastUiAction = "reset-calibration";
  lastCommandId = undefined;
  actor.send({ type: "RESET_CALIBRATION" });
});
exportTransButton.addEventListener("click", () => {
  lastUiAction = "export-trans";
  lastCommandId = undefined;
  actor.send({ type: "EXPORT_TRANS" });
});
leaveCancelButton.addEventListener("click", () => executeProductAction("leave-cancel"));
leaveDiscardButton.addEventListener("click", () => executeProductAction("leave-discard"));
leaveSaveButton.addEventListener("click", () => executeProductAction("leave-save"));
enterDebugButton.addEventListener("click", () => executeProductAction("enter-debug"));
exitDebugButton.addEventListener("click", () => executeProductAction("exit-debug"));
featureDebugInitializeButton.addEventListener("click", () => {
  void initializeFeatureDebugWorkspace();
});

featureDebugRunner.register({
  id: "chapter-open",
  title: "章节选择 / 打开章节",
  button: featureDebugChapterOpenButton,
  enabled: () => featureDebugEnvironmentReady,
  beforeRun: prepareChapterOpenFeatureDebug,
  steps: createChapterOpenFeatureDebugSteps,
  onSuccess: () => {
    sourceLocationStatus.textContent =
      "章节选择 / 打开章节功能调试通过 · ready/blocked + 多章节连续打开 + 回安全副本 · 全程零写入";
    chapterOpenDebugContext = undefined;
  },
  onFailure: recoverChapterOpenFeatureDebug,
});

featureDebugRunner.register({
  id: "workspace-splitter",
  title: "左右工作窗分割条",
  button: featureDebugWorkspaceSplitterButton,
  enabled: () => featureDebugEnvironmentReady,
  beforeRun: prepareWorkspaceSplitterFeatureDebug,
  steps: createWorkspaceSplitterFeatureDebugSteps,
  onSuccess: () => {
    sourceLocationStatus.textContent =
      "左右工作窗分割条功能调试通过 · 43% → 51% → 59% → 43% · 业务状态未改变";
  },
  onFailure: (error) => {
    workspaceSplitterControl.reset();
    sourceLocationStatus.textContent =
      "左右工作窗分割条功能调试失败 · 已恢复 43% · " + error.message;
  },
});

featureDebugRunner.register({
  id: "editor-preview-splitter",
  title: "源码 / 预览水平分割条",
  button: featureDebugEditorPreviewSplitterButton,
  enabled: () => featureDebugEnvironmentReady,
  beforeRun: prepareEditorPreviewSplitterFeatureDebug,
  steps: createEditorPreviewSplitterFeatureDebugSteps,
  onSuccess: () => {
    sourceLocationStatus.textContent =
      "源码 / 预览水平分割条功能调试通过 · 55% → 47% → 39% → 55% · 业务状态未改变";
  },
  onFailure: (error) => {
    editorPreviewSplitterControl.reset();
    sourceLocationStatus.textContent =
      "源码 / 预览水平分割条功能调试失败 · 已恢复 55% · " + error.message;
  },
});

featureDebugRunner.register({
  id: "working-text",
  title: "修改工作稿文本",
  button: featureDebugWorkingTextButton,
  enabled: () => featureDebugEnvironmentReady,
  beforeRun: prepareWorkingTextFeatureDebug,
  steps: createWorkingTextFeatureDebugSteps,
  onSuccess: () => {
    sourceLocationStatus.textContent =
      "修改工作稿文本功能调试通过 · 正式修改→dirty/history→Undo→重入 · 未写盘";
    workingTextDebugBaselineWorking = undefined;
    workingTextDebugBaselineRevision = undefined;
  },
  onFailure: recoverWorkingTextFeatureDebug,
});

featureDebugRunner.register({
  id: "ignore-line-type",
  title: "行类型：已忽略",
  button: featureDebugIgnoreLineTypeButton,
  enabled: () => featureDebugEnvironmentReady,
  beforeRun: prepareIgnoreLineTypeFeatureDebug,
  steps: createIgnoreLineTypeFeatureDebugSteps,
  onSuccess: () => {
    sourceLocationStatus.textContent =
      "行类型：已忽略功能调试通过 · 真实下拉→行消失→Undo恢复→重入 · 未写盘";
    ignoreLineTypeDebugContext = undefined;
  },
  onFailure: recoverIgnoreLineTypeFeatureDebug,
});

featureDebugRunner.register({
  id: "save-reload",
  title: "保存标定 / 重入加载",
  button: featureDebugSaveReloadButton,
  enabled: () => featureDebugEnvironmentReady,
  beforeRun: prepareSaveReloadFeatureDebug,
  steps: createSaveReloadFeatureDebugSteps,
  onSuccess: () => {
    sourceLocationStatus.textContent =
      "保存标定 / 重入加载功能调试通过 · 真实保存→重入加载→产品恢复原标定→安全清理还原原始 sidecar/revision";
    saveReloadDebugContext = undefined;
  },
  onFailure: recoverSaveReloadFeatureDebug,
});

featureDebugRunner.register({
  id: "review-module-switch",
  title: "数据表模块切换",
  button: featureDebugReviewModuleSwitchButton,
  enabled: () => featureDebugEnvironmentReady,
  beforeRun: prepareReviewModuleSwitchFeatureDebug,
  steps: createReviewModuleSwitchFeatureDebugSteps,
  onSuccess: () => {
    sourceLocationStatus.textContent =
      "数据表模块切换功能调试通过 · 章节标题→注释→嵌入块→非法断行→章节标题 · 全程 clean 未写盘";
  },
  onFailure: recoverReviewModuleSwitchFeatureDebug,
});

featureDebugRunner.register({
  id: "review-row-locate",
  title: "数据表行定位源码",
  button: featureDebugReviewRowLocateButton,
  enabled: () => featureDebugEnvironmentReady,
  beforeRun: prepareReviewRowLocateFeatureDebug,
  steps: createReviewRowLocateFeatureDebugSteps,
  onSuccess: () => {
    sourceLocationStatus.textContent =
      "数据表行定位源码功能调试通过 · 普通行定位 + 非法断行前后各10字 · 全程 clean 未写盘";
  },
  onFailure: recoverReviewRowLocateFeatureDebug,
});

featureDebugRunner.register({
  id: "dirty-leave-protection",
  title: "脏章节离开保护",
  button: featureDebugDirtyLeaveProtectionButton,
  enabled: () => featureDebugEnvironmentReady,
  beforeRun: prepareDirtyLeaveProtectionFeatureDebug,
  steps: createDirtyLeaveProtectionFeatureDebugSteps,
  onSuccess: () => {
    sourceLocationStatus.textContent =
      "脏章节离开保护功能调试通过 · 关闭/切换 + 取消/放弃/保存并继续 · 安全副本已恢复原基线";
    dirtyLeaveDebugContext = undefined;
  },
  onFailure: recoverDirtyLeaveProtectionFeatureDebug,
});

featureDebugRunner.register({
  id: "illegal-line-break",
  title: "非法断行模块",
  button: featureDebugIllegalLineBreakButton,
  enabled: () => featureDebugEnvironmentReady,
  beforeRun: prepareIllegalLineBreakFeatureDebug,
  steps: createIllegalLineBreakFeatureDebugSteps,
  onSuccess: () => {
    sourceLocationStatus.textContent =
      "非法断行模块功能调试通过 · 6→5→6→5 + 保存重入 + 安全恢复原 6 条 / 原 revision";
    illegalLineBreakDebugContext = undefined;
  },
  onFailure: recoverIllegalLineBreakFeatureDebug,
});

featureDebugRunner.register({
  id: "changed-line",
  title: "变动行模块",
  button: featureDebugChangedLineButton,
  enabled: () => featureDebugEnvironmentReady,
  beforeRun: prepareChangedLineFeatureDebug,
  steps: createChangedLineFeatureDebugSteps,
  onSuccess: () => {
    sourceLocationStatus.textContent =
      "变动行模块功能调试通过 · 41→新 diff + +N + Undo/Redo + 保存重入 + 安全恢复原 41 条 / 63833 / revision";
    changedLineDebugContext = undefined;
  },
  onFailure: recoverChangedLineFeatureDebug,
});

featureDebugRunner.register({
  id: "chapter-title",
  title: "章节标题模块",
  button: featureDebugChapterTitleButton,
  enabled: () => featureDebugEnvironmentReady,
  beforeRun: prepareChapterTitleFeatureDebug,
  steps: createChapterTitleFeatureDebugSteps,
  onSuccess: () => {
    sourceLocationStatus.textContent =
      "章节标题模块功能调试通过 · 已忽略 + H2→H3 + Undo/Redo + 编号开关 + 保存重入 + 安全恢复原 H2 / revision";
    chapterTitleDebugContext = undefined;
  },
  onFailure: recoverChapterTitleFeatureDebug,
});

featureDebugRunner.register({
  id: "annotation",
  title: "注释模块",
  button: featureDebugAnnotationButton,
  enabled: () => featureDebugEnvironmentReady,
  beforeRun: prepareAnnotationFeatureDebug,
  steps: createAnnotationFeatureDebugSteps,
  onSuccess: () => {
    sourceLocationStatus.textContent =
      "注释模块功能调试通过 · 注释号源码派生只读 + 已忽略缺引用 + 保存重入 + 安全恢复原 #1 / revision";
    annotationDebugContext = undefined;
  },
  onFailure: recoverAnnotationFeatureDebug,
});

featureDebugRunner.register({
  id: "embed",
  title: "嵌入块模块",
  button: featureDebugEmbedButton,
  enabled: () => featureDebugEnvironmentReady,
  beforeRun: prepareEmbedFeatureDebug,
  steps: createEmbedFeatureDebugSteps,
  onSuccess: () => {
    sourceLocationStatus.textContent =
      "嵌入块模块功能调试通过 · 65/51/11/0 + 已忽略 51→50 + Undo/Redo + 保存重入 + 安全恢复原 revision";
    embedDebugContext = undefined;
  },
  onFailure: recoverEmbedFeatureDebug,
});

featureDebugRunner.register({
  id: "chapter-boundary",
  title: "章节定界模块",
  button: featureDebugChapterBoundaryButton,
  enabled: () => featureDebugEnvironmentReady,
  beforeRun: prepareChapterBoundaryFeatureDebug,
  steps: createChapterBoundaryFeatureDebugSteps,
  onSuccess: () => {
    sourceLocationStatus.textContent =
      "章节定界模块功能调试通过 · 真实导航 + 9901 编号 + Undo/Redo + 保存重入 + 安全恢复原 revision · 未执行真实导出";
    chapterBoundaryDebugContext = undefined;
  },
  onFailure: recoverChapterBoundaryFeatureDebug,
});

featureDebugRunner.register({
  id: "markdown-preview",
  title: "Markdown 预览",
  button: featureDebugMarkdownPreviewButton,
  enabled: () => featureDebugEnvironmentReady,
  beforeRun: prepareMarkdownPreviewFeatureDebug,
  steps: createMarkdownPreviewFeatureDebugSteps,
  onSuccess: () => {
    sourceLocationStatus.textContent =
      "Markdown 预览功能调试通过 · 源码修改→结构化预览同步→Undo→重入 · 未写盘";
  },
  onFailure: recoverMarkdownPreviewFeatureDebug,
});

featureDebugRunner.register({
  id: "source-preview-sync",
  title: "源码 / 预览联动",
  button: featureDebugSourcePreviewSyncButton,
  enabled: () => featureDebugEnvironmentReady,
  beforeRun: prepareSourcePreviewSyncFeatureDebug,
  steps: createSourcePreviewSyncFeatureDebugSteps,
  onSuccess: () => {
    sourceLocationStatus.textContent =
      "源码 / 预览联动功能调试通过 · 源码→预览→源码双向 source-line 同步 · 全程 clean 未写盘";
  },
  onFailure: recoverSourcePreviewSyncFeatureDebug,
});

featureDebugRunner.register({
  id: "table-config",
  title: "配置",
  button: featureDebugTableConfigButton,
  enabled: () => featureDebugEnvironmentReady,
  beforeRun: prepareTableConfigFeatureDebug,
  steps: createTableConfigFeatureDebugSteps,
  onSuccess: () => {
    sourceLocationStatus.textContent =
      "配置功能调试通过 · 热更新→非法配置保护→保存重载→原项目配置精确恢复 · 章节全程 clean 0/0";
    tableConfigDebugContext = undefined;
  },
  onFailure: recoverTableConfigFeatureDebug,
});

featureDebugRunner.register({
  id: "source-regex-search",
  title: "源码正则搜索",
  button: featureDebugSourceRegexSearchButton,
  enabled: () => featureDebugEnvironmentReady,
  beforeRun: prepareSourceRegexSearchFeatureDebug,
  steps: createSourceRegexSearchFeatureDebugSteps,
  onSuccess: () => {
    sourceLocationStatus.textContent =
      "源码正则搜索功能调试通过 · Buffett 计数→下一个→上一个→非法正则→清空 · 业务状态未改变";
  },
  onFailure: recoverSourceRegexSearchFeatureDebug,
});

featureDebugRunner.register({
  id: "undo-redo",
  title: "撤销 / 重做",
  button: featureDebugUndoRedoButton,
  enabled: () => featureDebugEnvironmentReady,
  beforeRun: prepareUndoRedoFeatureDebug,
  steps: createUndoRedoFeatureDebugSteps,
  onSuccess: () => {
    sourceLocationStatus.textContent =
      "撤销 / 重做功能调试通过 · 已恢复原始状态 · 未写入磁盘";
    undoRedoDebugContext = undefined;
  },
  onFailure: (error) => {
    recoverUndoRedoFeatureDebug();
    sourceLocationStatus.textContent =
      "撤销 / 重做功能调试失败 · " + error.message;
    undoRedoDebugContext = undefined;
  },
});

deviceDebugBridge.install((event) => {
  reportDebugRuntime(event, deviceDebugBridge.snapshot());
});

actor.start();
void loadWorkspaceDirectory("", false);
featureDebugRunner.refreshControls();
featureDebugMenu.setEnabled(true);
document.documentElement.dataset.featureDebugReady = "false";
document.documentElement.dataset.appReady = "true";
reportDebugRuntime("page_loaded", deviceDebugBridge.snapshot());

async function waitForRemoteCommandTerminalState(): Promise<void> {
  const deadline = performance.now() + 15_000;
  while (performance.now() < deadline) {
    const session = deriveWorkspaceView(actor.getSnapshot()).session;
    if (
      session !== "opening"
      && session !== "chapter-saving"
      && session !== "chapter-leave-saving"
    ) {
      return;
    }
    await new Promise<void>((resolve) => window.setTimeout(resolve, 25));
  }
}

startDebugCommandPolling((command) => {
  executeProductAction(
    command.action,
    command.commandId,
    command.chapterId,
    command.reviewModule,
  );
}, async (command) => {
  await waitForRemoteCommandTerminalState();
  const view = deriveWorkspaceView(actor.getSnapshot());
  return createDebugStateReport(view, command.action, command.commandId);
});
