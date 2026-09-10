import { assign, fromPromise, setup, type SnapshotFrom } from "xstate";
import { ChapterReviewApplication } from "../../../src/chapterReviewApplication";
import { annotationMatchSummary } from "../../../src/annotation";
import { applyHeadingLineTypeToText } from "../../../src/chapterReviewActions";
import { buildIllegalMergeSpans, exportByCalibration } from "../../../src/calibrationExport";
import { MODULE_REGEX_DEFAULTS } from "../../../src/regexPresets";
import { translationProgress } from "../../../src/translationState";
import { withFormatCalibratedFrontmatter } from "../../../src/workspaceFiles";
import {
  cloneWorkbenchHistorySnapshot,
  type WorkbenchHistorySnapshot,
} from "../../../src/workbenchHistory";
import type {
  BoundaryExportResult,
  ChapterCatalog,
  ChapterListItem,
  ChapterRepository,
  ChapterSaveResult,
  ChapterWorkspaceData,
} from "./chapterRepository";
import {
  deriveChangedLineAuditRows,
  type ChangedLineAuditRow,
} from "./changedLineAudit";
import { deriveMediaCatalog } from "./mediaCatalog";

export type ActiveReviewModule =
  | "章节定界"
  | "章节标题"
  | "注释"
  | "嵌入块"
  | "非法断行"
  | "媒体"
  | "变动行"
  | "翻译";

export const ACTIVE_REVIEW_MODULES: readonly ActiveReviewModule[] = [
  "章节定界",
  "章节标题",
  "注释",
  "嵌入块",
  "非法断行",
  "媒体",
  "变动行",
  "翻译",
];

export type WorkspaceMachineInput = {
  chapterRepository: ChapterRepository;
};

export type PendingLeaveIntent =
  | { kind: "close" }
  | { kind: "open"; chapterId: string };

export type WorkspaceContext = {
  chapterRepository: ChapterRepository;
  projectName?: string;
  chapters: ChapterListItem[];
  boundary?: ChapterCatalog["boundary"];
  selectedChapterId?: string;
  pendingChapterId?: string;
  activeReviewModule: ActiveReviewModule;
  headingNumberingEnabled: boolean;
  focusedReviewRowId?: string;
  focusedSourceLine?: number;
  chapter?: ChapterWorkspaceData;
  undoStack: WorkbenchHistorySnapshot[];
  redoStack: WorkbenchHistorySnapshot[];
  savedBaseline?: WorkbenchHistorySnapshot;
  pendingLeaveIntent?: PendingLeaveIntent;
  catalogError?: string;
  loadError?: string;
  saveError?: string;
  lastSavedAt?: string;
  lastExportedCount?: number;
};

export type WorkspaceEvent =
  | { type: "REFRESH_CATALOG" }
  | { type: "SELECT_CHAPTER"; chapterId: string }
  | { type: "OPEN_CHAPTER"; chapterId: string }
  | { type: "OPEN_BOUNDARY" }
  | { type: "OPEN_TRANSLATION"; chapterId: string }
  | { type: "SELECT_REVIEW_MODULE"; module: ActiveReviewModule }
  | { type: "SET_HEADING_NUMBERING"; enabled: boolean }
  | { type: "CALIBRATION_ROW_FOCUSED"; rowId: string; sourceLine: number }
  | { type: "ADD_SOURCE_LINE_TO_ACTIVE_MODULE"; sourceLine: number }
  | { type: "WORKING_CHANGED"; text: string }
  | {
      type: "MEDIA_DOWNLOAD_APPLIED";
      chapterId: string;
      workingText: string;
      revision: string;
      savedAt: string;
      media: NonNullable<ChapterWorkspaceData["media"]>;
    }
  | { type: "CALIBRATION_LINE_TYPE_CHANGED"; rowId: string; lineType: string }
  | { type: "CHAPTER_FILE_CHANGED"; rowId: string; value: string }
  | { type: "ASSIGN_BOUNDARY_SEQUENCE"; start: string }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "SAVE" }
  | { type: "RESET_CALIBRATION" }
  | { type: "EXPORT_BOUNDARY" }
  | { type: "EXPORT_TRANS" }
  | { type: "CLOSE" }
  | { type: "LEAVE_CANCEL" }
  | { type: "LEAVE_DISCARD" }
  | { type: "LEAVE_SAVE" }
  | { type: "ENTER_DEBUG" }
  | { type: "EXIT_DEBUG" };

type RepositoryInput = {
  chapterRepository: ChapterRepository;
};

type LoadChapterInput = RepositoryInput & {
  chapterId: string;
};

type SaveChapterActorInput = RepositoryInput & {
  chapter: ChapterWorkspaceData;
};

type ExportTransActorInput = SaveChapterActorInput & {
  headingNumberingEnabled: boolean;
};

type ResetChapterActorOutput = {
  chapter: ChapterWorkspaceData;
  saveResult: ChapterSaveResult;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const HISTORY_LIMIT = 100;

function splitPatterns(value: string): string[] {
  return value
    .split(/^\s*---\s*$/m)
    .map((item) => item.trim())
    .filter(Boolean);
}

const EMBED_PATTERNS = splitPatterns(MODULE_REGEX_DEFAULTS["嵌入块"] ?? "");
const ANNOTATION_PATTERNS = splitPatterns(MODULE_REGEX_DEFAULTS["注释"] ?? "");

type ManualReviewModule =
  | "章节定界"
  | "章节标题"
  | "注释"
  | "嵌入块"
  | "非法断行";

function isManualReviewModule(
  module: ActiveReviewModule,
): module is ManualReviewModule {
  return module === "章节定界"
    || module === "章节标题"
    || module === "注释"
    || module === "嵌入块"
    || module === "非法断行";
}

function chapterWithManualSourceLine(
  context: WorkspaceContext,
  sourceLine: number,
): ChapterWorkspaceData | undefined {
  const chapter = context.chapter;
  const module = context.activeReviewModule;
  if (
    !chapter
    || chapter.kind === "translation"
    || !isManualReviewModule(module)
    || !Number.isInteger(sourceLine)
    || sourceLine < 1
  ) {
    return undefined;
  }

  const lines = chapter.workingText.replace(/\r\n?/g, "\n").split("\n");
  const lineIndex = sourceLine - 1;
  const lineText = lines[lineIndex];
  if (lineText === undefined) return undefined;

  const scopedRow = chapter.rows.find((row) => row.typeLabel === module)
    ?? chapter.rows.find((row) => row.sourcePath || row.workingCopyPath);
  const sourcePath = scopedRow?.sourcePath ?? chapter.path;
  const workingPath = scopedRow?.workingCopyPath ?? chapter.path;
  const application = new ChapterReviewApplication({
    rows: chapter.rows,
    annotationPairs: chapter.annotationPairs,
  });

  const next = module === "非法断行"
    ? application.markIllegalLineBreak({
        workingText: chapter.workingText,
        sourcePath,
        workingPath,
        cursorLine: lineIndex,
      })
    : application.addManualReviewLine({
        moduleName: module,
        documentText: chapter.workingText,
        lineText,
        hintLine: lineIndex,
        sourcePath,
        workingPath,
      });
  if (!next) return undefined;

  return {
    ...chapter,
    rows: next.rows,
    annotationPairs: next.annotationPairs,
  };
}

function manualSourceLineWouldChange(
  context: WorkspaceContext,
  sourceLine: number,
): boolean {
  const next = chapterWithManualSourceLine(context, sourceLine);
  if (!next || !context.chapter) return false;
  return JSON.stringify(next.rows) !== JSON.stringify(context.chapter.rows)
    || JSON.stringify(next.annotationPairs)
      !== JSON.stringify(context.chapter.annotationPairs);
}

function historySnapshot(chapter: ChapterWorkspaceData): WorkbenchHistorySnapshot {
  return cloneWorkbenchHistorySnapshot({
    workingText: chapter.workingText,
    rows: chapter.rows,
    annotationPairs: chapter.annotationPairs,
  });
}

function restoreHistorySnapshot(
  chapter: ChapterWorkspaceData,
  snapshot: WorkbenchHistorySnapshot,
): ChapterWorkspaceData {
  const restored = cloneWorkbenchHistorySnapshot(snapshot);
  return {
    ...chapter,
    workingText: restored.workingText,
    rows: restored.rows,
    annotationPairs: restored.annotationPairs,
  };
}

function pushHistory(
  stack: WorkbenchHistorySnapshot[],
  snapshot: WorkbenchHistorySnapshot,
): WorkbenchHistorySnapshot[] {
  const next = [...stack, cloneWorkbenchHistorySnapshot(snapshot)];
  return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
}

function refreshReviewForText(
  chapter: ChapterWorkspaceData,
  workingText: string,
): ChapterWorkspaceData {
  if (chapter.kind === "boundary") {
    const application = new ChapterReviewApplication({
      rows: chapter.rows,
      annotationPairs: chapter.annotationPairs,
    });
    const refreshed = application.refreshChapterBoundary({
      baselineText: chapter.originalText,
      workingText,
      workingPath: chapter.path,
      sourceLabel: chapter.name,
    });
    return {
      ...chapter,
      workingText,
      rows: refreshed.rows,
      annotationPairs: refreshed.annotationPairs,
    };
  }

  const scopedRow = chapter.rows.find(
    (row) =>
      row.typeLabel === "章节标题"
      || row.typeLabel === "注释"
      || row.typeLabel === "嵌入块",
  );
  const sourcePath = scopedRow?.sourcePath ?? chapter.path;
  const workingPath = scopedRow?.workingCopyPath ?? chapter.path;
  const application = new ChapterReviewApplication({
    rows: chapter.rows,
    annotationPairs: chapter.annotationPairs,
  });
  application.refreshChapterTitle({
    baselineText: chapter.originalText,
    workingText,
    sourcePath,
    workingPath,
    sourceLabel: chapter.name,
    embedPatterns: EMBED_PATTERNS,
  });
  application.refreshAnnotation({
    baselineText: chapter.originalText,
    workingText,
    sourcePath,
    workingPath,
    sourceLabel: chapter.name,
    patterns: ANNOTATION_PATTERNS,
  });
  const refreshed = application.refreshEmbed({
    baselineText: chapter.originalText,
    workingText,
    sourcePath,
    workingPath,
    sourceLabel: chapter.name,
    patterns: EMBED_PATTERNS,
  });
  return {
    ...chapter,
    workingText,
    rows: refreshed.rows,
    annotationPairs: refreshed.annotationPairs,
  };
}

export function resetChapterToOriginal(
  chapter: ChapterWorkspaceData,
): ChapterWorkspaceData {
  if (chapter.kind !== "chapter") {
    throw new Error("只有普通章节可以重置标定");
  }

  const scopedRow = chapter.rows.find(
    (row) =>
      row.typeLabel === "章节标题"
      || row.typeLabel === "注释"
      || row.typeLabel === "嵌入块"
      || row.typeLabel === "非法断行",
  );
  const sourcePath = scopedRow?.sourcePath ?? chapter.path;
  const workingPath = scopedRow?.workingCopyPath ?? chapter.path;
  const application = new ChapterReviewApplication({
    rows: [],
    annotationPairs: [],
  });
  application.refreshChapterTitle({
    baselineText: chapter.originalText,
    workingText: chapter.originalText,
    sourcePath,
    workingPath,
    sourceLabel: chapter.name,
    embedPatterns: EMBED_PATTERNS,
  });
  application.refreshAnnotation({
    baselineText: chapter.originalText,
    workingText: chapter.originalText,
    sourcePath,
    workingPath,
    sourceLabel: chapter.name,
    patterns: ANNOTATION_PATTERNS,
  });
  application.refreshEmbed({
    baselineText: chapter.originalText,
    workingText: chapter.originalText,
    sourcePath,
    workingPath,
    sourceLabel: chapter.name,
    patterns: EMBED_PATTERNS,
  });
  const reset = application.refreshIllegalLineBreak({
    workingText: chapter.originalText,
    sourcePath,
    workingPath,
  });

  return {
    ...chapter,
    workingText: chapter.originalText,
    rows: reset.rows,
    annotationPairs: reset.annotationPairs,
  };
}

function sameHistorySnapshot(
  left: WorkbenchHistorySnapshot | undefined,
  right: WorkbenchHistorySnapshot | undefined,
): boolean {
  if (!left || !right) return false;
  return left.workingText === right.workingText
    && JSON.stringify(left.rows) === JSON.stringify(right.rows)
    && JSON.stringify(left.annotationPairs) === JSON.stringify(right.annotationPairs);
}

export const workspaceMachine = setup({
  types: {
    context: {} as WorkspaceContext,
    events: {} as WorkspaceEvent,
    input: {} as WorkspaceMachineInput,
  },
  actors: {
    listChapters: fromPromise(async ({ input }: { input: RepositoryInput }) =>
      input.chapterRepository.listChapters()),
    loadChapter: fromPromise(async ({ input }: { input: LoadChapterInput }) =>
      input.chapterRepository.loadChapter(input.chapterId)),
    loadTranslation: fromPromise(async ({ input }: { input: LoadChapterInput }) => {
      if (!input.chapterRepository.loadTranslation) {
        throw new Error("当前 workspace repository 不支持翻译工作台");
      }
      return input.chapterRepository.loadTranslation(input.chapterId);
    }),
    saveChapter: fromPromise(async ({ input }: { input: SaveChapterActorInput }) =>
      input.chapterRepository.saveChapter({
        chapter: input.chapter,
        workingText: input.chapter.workingText,
      })),
    resetChapter: fromPromise(
      async ({ input }: { input: SaveChapterActorInput }): Promise<ResetChapterActorOutput> => {
        const chapter = resetChapterToOriginal(input.chapter);
        const saveResult = await input.chapterRepository.saveChapter({
          chapter,
          workingText: chapter.workingText,
        });
        return { chapter, saveResult };
      },
    ),
    exportBoundary: fromPromise(async ({ input }: { input: SaveChapterActorInput }) => {
      if (!input.chapterRepository.exportBoundary) {
        throw new Error("当前 workspace repository 不支持章节定界导出");
      }
      return input.chapterRepository.exportBoundary({
        chapter: input.chapter,
        workingText: input.chapter.workingText,
      });
    }),
    exportTransSource: fromPromise(
      async ({ input }: { input: ExportTransActorInput }) => {
        if (!input.chapterRepository.exportTransSource) {
          throw new Error("当前 workspace repository 不支持导出 trans");
        }
        if (input.chapter.kind !== "chapter") {
          throw new Error("只有普通章节可以导出到 trans");
        }
        const markdown = withFormatCalibratedFrontmatter(
          exportByCalibration(input.chapter.workingText, input.chapter.rows, {
            numberHeadings: input.headingNumberingEnabled,
          }),
        );
        return input.chapterRepository.exportTransSource({
          chapterId: input.chapter.id,
          expectedRevision: input.chapter.revision,
          markdown,
        });
      },
    ),
  },
  guards: {
    chapterReady: ({ context, event }) => {
      if (event.type !== "SELECT_CHAPTER" && event.type !== "OPEN_CHAPTER") return false;
      return context.chapters.some(
        (chapter) => chapter.id === event.chapterId && chapter.ready,
      );
    },
    chapterReadyAndDifferent: ({ context, event }) => {
      if (event.type !== "OPEN_CHAPTER") return false;
      return context.chapters.some(
        (chapter) => chapter.id === event.chapterId && chapter.ready,
      ) && context.chapter?.id !== event.chapterId;
    },
    translationChapterReady: ({ context, event }) =>
      event.type === "OPEN_TRANSLATION"
      && context.chapters.some(
        (chapter) => chapter.id === event.chapterId && chapter.ready,
      ),
    boundaryReady: ({ context, event }) =>
      event.type === "OPEN_BOUNDARY"
      && context.boundary?.ready === true,
    canResetCalibration: ({ context, event }) =>
      event.type === "RESET_CALIBRATION"
      && context.chapter?.kind === "chapter",
    workingTextChanged: ({ context, event }) =>
      event.type === "WORKING_CHANGED"
      && context.chapter?.kind !== "translation"
      && context.chapter?.workingText !== event.text,
    reviewModuleAvailable: ({ context, event }) => {
      if (
        event.type !== "SELECT_REVIEW_MODULE"
        || !ACTIVE_REVIEW_MODULES.includes(event.module)
        || !context.chapter
      ) {
        return false;
      }
      if (context.chapter.kind === "boundary") {
        return event.module === "章节定界";
      }
      if (context.chapter.kind === "translation") {
        return event.module === "翻译";
      }
      return event.module !== "章节定界" && event.module !== "翻译";
    },
    canExportTrans: ({ context, event }) =>
      event.type === "EXPORT_TRANS" && context.chapter?.kind === "chapter",
    calibrationLineTypeChanged: ({ context, event }) =>
      event.type === "CALIBRATION_LINE_TYPE_CHANGED"
      && context.chapter?.kind !== "translation"
      && context.chapter?.rows.some(
        (row) => row.id === event.rowId && row.lineType !== event.lineType,
      ) === true,
    canAddSourceLineToActiveModule: ({ context, event }) =>
      event.type === "ADD_SOURCE_LINE_TO_ACTIVE_MODULE"
      && manualSourceLineWouldChange(context, event.sourceLine),
    chapterFileChanged: ({ context, event }) =>
      event.type === "CHAPTER_FILE_CHANGED"
      && context.chapter?.kind === "boundary"
      && context.chapter.rows.some(
        (row) =>
          row.id === event.rowId
          && row.typeLabel === "章节定界"
          && row.lineType === "1 级标题"
          && String(row.chapterFile ?? "").trim() !== event.value.trim(),
      ),
    canAssignBoundarySequence: ({ context, event }) =>
      event.type === "ASSIGN_BOUNDARY_SEQUENCE"
      && context.chapter?.kind === "boundary"
      && /^\d+$/.test(event.start.trim())
      && context.chapter.rows.some(
        (row) => row.typeLabel === "章节定界" && row.lineType === "1 级标题",
      ),
    canExportBoundary: ({ context }) => {
      if (context.chapter?.kind !== "boundary") return false;
      const application = new ChapterReviewApplication({
        rows: context.chapter.rows,
        annotationPairs: context.chapter.annotationPairs,
      });
      try {
        return application.chapterBoundarySegments(
          context.chapter.workingText,
        ).length > 0;
      } catch {
        return false;
      }
    },
    canUndoHistory: ({ context }) => context.undoStack.length > 0,
    canRedoHistory: ({ context }) => context.redoStack.length > 0,
    undoTargetIsSavedBaseline: ({ context }) => {
      const target = context.undoStack.at(-1);
      return sameHistorySnapshot(target, context.savedBaseline);
    },
    redoTargetIsSavedBaseline: ({ context }) => {
      const target = context.redoStack.at(-1);
      return sameHistorySnapshot(target, context.savedBaseline);
    },
    pendingLeaveIsClose: ({ context }) =>
      context.pendingLeaveIntent?.kind === "close",
    pendingLeaveIsOpen: ({ context }) =>
      context.pendingLeaveIntent?.kind === "open",
  },
  actions: {
    applyCatalog: assign({
      projectName: ({ event }) =>
        "output" in event ? (event.output as ChapterCatalog).projectName : undefined,
      chapters: ({ event }) =>
        "output" in event ? (event.output as ChapterCatalog).chapters : [],
      boundary: ({ event }) =>
        "output" in event ? (event.output as ChapterCatalog).boundary : undefined,
      selectedChapterId: ({ context, event }) => {
        if (!("output" in event)) return undefined;
        const chapters = (event.output as ChapterCatalog).chapters;
        return chapters.some(
          (chapter) => chapter.id === context.selectedChapterId && chapter.ready,
        )
          ? context.selectedChapterId
          : undefined;
      },
      catalogError: () => undefined,
      loadError: () => undefined,
    }),
    recordCatalogError: assign({
      projectName: () => undefined,
      chapters: () => [],
      boundary: () => undefined,
      selectedChapterId: () => undefined,
      catalogError: ({ event }) =>
        "error" in event ? errorMessage(event.error) : "unknown catalog error",
    }),
    selectChapter: assign({
      selectedChapterId: ({ event }) =>
        event.type === "SELECT_CHAPTER" ? event.chapterId : undefined,
      loadError: () => undefined,
    }),
    selectReviewModule: assign({
      activeReviewModule: ({ event, context }) =>
        event.type === "SELECT_REVIEW_MODULE" ? event.module : context.activeReviewModule,
      focusedReviewRowId: () => undefined,
      focusedSourceLine: () => undefined,
    }),
    setHeadingNumbering: assign({
      headingNumberingEnabled: ({ event, context }) =>
        event.type === "SET_HEADING_NUMBERING"
          ? event.enabled
          : context.headingNumberingEnabled,
    }),
    focusCalibrationRow: assign({
      focusedReviewRowId: ({ event }) =>
        event.type === "CALIBRATION_ROW_FOCUSED" ? event.rowId : undefined,
      focusedSourceLine: ({ event }) =>
        event.type === "CALIBRATION_ROW_FOCUSED" ? event.sourceLine : undefined,
    }),
    requestChapter: assign({
      selectedChapterId: ({ event }) =>
        event.type === "OPEN_CHAPTER" ? event.chapterId : undefined,
      pendingChapterId: ({ event }) =>
        event.type === "OPEN_CHAPTER" ? event.chapterId : undefined,
      activeReviewModule: () => "章节标题" as const,
      chapter: () => undefined,
      undoStack: () => [],
      redoStack: () => [],
      savedBaseline: () => undefined,
      pendingLeaveIntent: () => undefined,
      focusedReviewRowId: () => undefined,
      focusedSourceLine: () => undefined,
      loadError: () => undefined,
      saveError: () => undefined,
      lastSavedAt: () => undefined,
      lastExportedCount: () => undefined,
    }),
    requestBoundary: assign({
      selectedChapterId: () => undefined,
      pendingChapterId: () => "__boundary__",
      activeReviewModule: () => "章节定界" as const,
      chapter: () => undefined,
      undoStack: () => [],
      redoStack: () => [],
      savedBaseline: () => undefined,
      pendingLeaveIntent: () => undefined,
      focusedReviewRowId: () => undefined,
      focusedSourceLine: () => undefined,
      loadError: () => undefined,
      saveError: () => undefined,
      lastSavedAt: () => undefined,
      lastExportedCount: () => undefined,
    }),
    requestTranslation: assign({
      selectedChapterId: ({ event }) =>
        event.type === "OPEN_TRANSLATION" ? event.chapterId : undefined,
      pendingChapterId: ({ event }) =>
        event.type === "OPEN_TRANSLATION" ? event.chapterId : undefined,
      activeReviewModule: () => "翻译" as const,
      chapter: () => undefined,
      undoStack: () => [],
      redoStack: () => [],
      savedBaseline: () => undefined,
      pendingLeaveIntent: () => undefined,
      focusedReviewRowId: () => undefined,
      focusedSourceLine: () => undefined,
      loadError: () => undefined,
      saveError: () => undefined,
      lastSavedAt: () => undefined,
      lastExportedCount: () => undefined,
    }),
    applyTranslationWorkspace: assign(({ event }) => {
      if (!("output" in event)) return {};
      const chapter = event.output as ChapterWorkspaceData;
      return {
        selectedChapterId: chapter.translationSourceChapterId,
        pendingChapterId: undefined,
        activeReviewModule: "翻译" as const,
        chapter,
        undoStack: [],
        redoStack: [],
        savedBaseline: historySnapshot(chapter),
        pendingLeaveIntent: undefined,
        focusedReviewRowId: undefined,
        focusedSourceLine: undefined,
        loadError: undefined,
        saveError: undefined,
        lastSavedAt: undefined,
        lastExportedCount: undefined,
      };
    }),
    clearChapter: assign({
      pendingChapterId: () => undefined,
      chapter: () => undefined,
      undoStack: () => [],
      redoStack: () => [],
      savedBaseline: () => undefined,
      pendingLeaveIntent: () => undefined,
      focusedReviewRowId: () => undefined,
      focusedSourceLine: () => undefined,
      loadError: () => undefined,
      saveError: () => undefined,
      lastSavedAt: () => undefined,
    }),
    clearSaveError: assign({
      saveError: () => undefined,
    }),
    requestCloseLeave: assign({
      pendingLeaveIntent: () => ({ kind: "close" as const }),
      saveError: () => undefined,
    }),
    requestOpenLeave: assign({
      pendingLeaveIntent: ({ event }) =>
        event.type === "OPEN_CHAPTER"
          ? ({ kind: "open", chapterId: event.chapterId } as const)
          : undefined,
      selectedChapterId: ({ event, context }) =>
        event.type === "OPEN_CHAPTER" ? event.chapterId : context.selectedChapterId,
      saveError: () => undefined,
    }),
    cancelLeave: assign({
      pendingLeaveIntent: () => undefined,
      selectedChapterId: ({ context }) => context.chapter?.id,
      saveError: () => undefined,
    }),
    prepareLeaveOpen: assign(({ context }) => {
      if (context.pendingLeaveIntent?.kind !== "open") return {};
      return {
        selectedChapterId: context.pendingLeaveIntent.chapterId,
        pendingChapterId: context.pendingLeaveIntent.chapterId,
        pendingLeaveIntent: undefined,
        chapter: undefined,
        undoStack: [],
        redoStack: [],
        savedBaseline: undefined,
        focusedReviewRowId: undefined,
        focusedSourceLine: undefined,
        loadError: undefined,
        saveError: undefined,
        lastSavedAt: undefined,
      };
    }),
    finishSavedClose: assign(({ event }) => ({
      pendingChapterId: undefined,
      pendingLeaveIntent: undefined,
      chapter: undefined,
      undoStack: [],
      redoStack: [],
      savedBaseline: undefined,
      focusedReviewRowId: undefined,
      focusedSourceLine: undefined,
      loadError: undefined,
      saveError: undefined,
      lastSavedAt: "output" in event
        ? (event.output as ChapterSaveResult).savedAt
        : undefined,
    })),
    finishSavedOpen: assign(({ context, event }) => {
      if (context.pendingLeaveIntent?.kind !== "open") return {};
      return {
        selectedChapterId: context.pendingLeaveIntent.chapterId,
        pendingChapterId: context.pendingLeaveIntent.chapterId,
        pendingLeaveIntent: undefined,
        chapter: undefined,
        undoStack: [],
        redoStack: [],
        savedBaseline: undefined,
        focusedReviewRowId: undefined,
        focusedSourceLine: undefined,
        loadError: undefined,
        saveError: undefined,
        lastSavedAt: "output" in event
          ? (event.output as ChapterSaveResult).savedAt
          : undefined,
      };
    }),
    updateWorkingText: assign(({ context, event }) => {
      if (!context.chapter || event.type !== "WORKING_CHANGED") return {};
      return {
        chapter: refreshReviewForText(context.chapter, event.text),
        undoStack: pushHistory(context.undoStack, historySnapshot(context.chapter)),
        redoStack: [],
        saveError: undefined,
      };
    }),
    applyMediaDownloadResult: assign(({ context, event }) => {
      if (
        !context.chapter
        || event.type !== "MEDIA_DOWNLOAD_APPLIED"
        || context.chapter.id !== event.chapterId
      ) return {};
      const chapter = {
        ...refreshReviewForText(context.chapter, event.workingText),
        revision: event.revision,
        media: event.media,
      };
      return {
        chapter,
        savedBaseline: historySnapshot(chapter),
        undoStack: [],
        redoStack: [],
        lastSavedAt: event.savedAt,
        saveError: undefined,
      };
    }),
    addSourceLineToActiveModule: assign(({ context, event }) => {
      if (event.type !== "ADD_SOURCE_LINE_TO_ACTIVE_MODULE" || !context.chapter) {
        return {};
      }
      const chapter = chapterWithManualSourceLine(context, event.sourceLine);
      if (!chapter) return {};
      return {
        chapter,
        undoStack: pushHistory(
          context.undoStack,
          historySnapshot(context.chapter),
        ),
        redoStack: [],
        focusedReviewRowId: undefined,
        focusedSourceLine: event.sourceLine,
        saveError: undefined,
      };
    }),
    updateCalibrationLineType: assign(({ context, event }) => {
      if (!context.chapter || event.type !== "CALIBRATION_LINE_TYPE_CHANGED") {
        return {};
      }
      const row = context.chapter.rows.find((candidate) => candidate.id === event.rowId);
      let chapter: ChapterWorkspaceData;

      if (
        row?.typeLabel === "章节标题"
        && /^[1-6]\s*级标题$/.test(event.lineType)
      ) {
        const workingText = applyHeadingLineTypeToText(
          context.chapter.workingText,
          [row],
          event.lineType,
        );
        chapter = refreshReviewForText(context.chapter, workingText);
      } else {
        const application = new ChapterReviewApplication({
          rows: context.chapter.rows,
          annotationPairs: context.chapter.annotationPairs,
        });
        const next = application.setRowsLineType({
          ids: [event.rowId],
          lineType: event.lineType,
          text: context.chapter.workingText,
          workingPath: row?.workingCopyPath ?? context.chapter.path,
        });
        chapter = {
          ...context.chapter,
          rows: next.rows,
          annotationPairs: next.annotationPairs,
        };
      }

      return {
        chapter,
        undoStack: pushHistory(context.undoStack, historySnapshot(context.chapter)),
        redoStack: [],
        focusedReviewRowId: undefined,
        focusedSourceLine: undefined,
        saveError: undefined,
      };
    }),
    updateChapterFile: assign(({ context, event }) => {
      if (
        !context.chapter
        || context.chapter.kind !== "boundary"
        || event.type !== "CHAPTER_FILE_CHANGED"
      ) {
        return {};
      }
      const application = new ChapterReviewApplication({
        rows: context.chapter.rows,
        annotationPairs: context.chapter.annotationPairs,
      });
      const next = application.setChapterFile([event.rowId], event.value.trim());
      return {
        chapter: {
          ...context.chapter,
          rows: next.rows,
          annotationPairs: next.annotationPairs,
        },
        undoStack: pushHistory(
          context.undoStack,
          historySnapshot(context.chapter),
        ),
        redoStack: [],
        focusedReviewRowId: undefined,
        focusedSourceLine: undefined,
        saveError: undefined,
      };
    }),
    assignBoundarySequence: assign(({ context, event }) => {
      if (
        !context.chapter
        || context.chapter.kind !== "boundary"
        || event.type !== "ASSIGN_BOUNDARY_SEQUENCE"
      ) {
        return {};
      }
      const application = new ChapterReviewApplication({
        rows: context.chapter.rows,
        annotationPairs: context.chapter.annotationPairs,
      });
      const headingIds = context.chapter.rows
        .filter(
          (row) =>
            row.typeLabel === "章节定界"
            && row.lineType === "1 级标题",
        )
        .map((row) => row.id);
      const next = application.assignChapterFiles(
        headingIds,
        "sequence",
        event.start.trim(),
      );
      if (!next.ok) {
        return { saveError: next.error };
      }
      return {
        chapter: {
          ...context.chapter,
          rows: next.rows,
          annotationPairs: next.annotationPairs,
        },
        undoStack: pushHistory(
          context.undoStack,
          historySnapshot(context.chapter),
        ),
        redoStack: [],
        focusedReviewRowId: undefined,
        focusedSourceLine: undefined,
        saveError: undefined,
      };
    }),
    applyUndo: assign(({ context }) => {
      if (!context.chapter || context.undoStack.length === 0) return {};
      const target = context.undoStack[context.undoStack.length - 1];
      return {
        chapter: restoreHistorySnapshot(context.chapter, target),
        undoStack: context.undoStack.slice(0, -1),
        redoStack: pushHistory(context.redoStack, historySnapshot(context.chapter)),
        focusedReviewRowId: undefined,
        focusedSourceLine: undefined,
        saveError: undefined,
      };
    }),
    applyRedo: assign(({ context }) => {
      if (!context.chapter || context.redoStack.length === 0) return {};
      const target = context.redoStack[context.redoStack.length - 1];
      return {
        chapter: restoreHistorySnapshot(context.chapter, target),
        undoStack: pushHistory(context.undoStack, historySnapshot(context.chapter)),
        redoStack: context.redoStack.slice(0, -1),
        focusedReviewRowId: undefined,
        focusedSourceLine: undefined,
        saveError: undefined,
      };
    }),
    applySaveResult: assign(({ context, event }) => {
      if (!context.chapter || !("output" in event)) return {};
      const output = event.output as ChapterSaveResult;
      const chapter = {
        ...context.chapter,
        workingText: output.workingText,
        revision: output.revision,
      };
      return {
        chapter,
        savedBaseline: historySnapshot(chapter),
        undoStack: [],
        redoStack: [],
        lastSavedAt: output.savedAt,
        saveError: undefined,
      };
    }),
    applyResetResult: assign(({ event }) => {
      if (!("output" in event)) return {};
      const output = event.output as ResetChapterActorOutput;
      const chapter = {
        ...output.chapter,
        workingText: output.saveResult.workingText,
        revision: output.saveResult.revision,
      };
      return {
        chapter,
        savedBaseline: historySnapshot(chapter),
        undoStack: [],
        redoStack: [],
        focusedReviewRowId: undefined,
        focusedSourceLine: undefined,
        lastSavedAt: output.saveResult.savedAt,
        saveError: undefined,
      };
    }),
    applyBoundaryExportResult: assign(({ context, event }) => {
      if (!context.chapter || !("output" in event)) return {};
      const output = event.output as BoundaryExportResult;
      const chapter = {
        ...context.chapter,
        workingText: output.workingText,
        revision: output.revision,
      };
      return {
        chapter,
        savedBaseline: historySnapshot(chapter),
        undoStack: [],
        redoStack: [],
        lastSavedAt: output.savedAt,
        lastExportedCount: output.exported.length,
        saveError: undefined,
      };
    }),
    recordSaveActorError: assign({
      saveError: ({ event }) =>
        "error" in event ? errorMessage(event.error) : "unknown save error",
    }),
  },
}).createMachine({
  id: "workspace",
  initial: "catalogLoading",
  context: ({ input }) => ({
    chapterRepository: input.chapterRepository,
    chapters: [],
    activeReviewModule: "章节标题",
    headingNumberingEnabled: true,
    undoStack: [],
    redoStack: [],
  }),
  states: {
    catalogLoading: {
      invoke: {
        src: "listChapters",
        input: ({ context }) => ({
          chapterRepository: context.chapterRepository,
        }),
        onDone: {
          target: "idle",
          actions: "applyCatalog",
        },
        onError: {
          target: "catalogError",
          actions: "recordCatalogError",
        },
      },
    },
    catalogError: {
      on: {
        REFRESH_CATALOG: {
          target: "catalogLoading",
        },
      },
    },
    idle: {
      on: {
        SELECT_CHAPTER: {
          guard: "chapterReady",
          actions: "selectChapter",
        },
        OPEN_CHAPTER: {
          guard: "chapterReady",
          target: "opening",
          actions: "requestChapter",
        },
        OPEN_BOUNDARY: {
          guard: "boundaryReady",
          target: "opening",
          actions: "requestBoundary",
        },
        OPEN_TRANSLATION: {
          guard: "translationChapterReady",
          target: "translationOpening",
          actions: "requestTranslation",
        },
        REFRESH_CATALOG: {
          target: "catalogLoading",
        },
        ENTER_DEBUG: {
          target: "debug",
        },
      },
    },
    opening: {
      invoke: {
        src: "loadChapter",
        input: ({ context }) => ({
          chapterRepository: context.chapterRepository,
          chapterId: context.pendingChapterId ?? "",
        }),
        onDone: {
          target: "chapter.clean",
          actions: assign(({ event }) => ({
            chapter: event.output,
            activeReviewModule:
              event.output.kind === "boundary" ? "章节定界" : "章节标题",
            pendingChapterId: undefined,
            undoStack: [],
            redoStack: [],
            savedBaseline: historySnapshot(event.output),
            loadError: undefined,
            saveError: undefined,
            lastSavedAt: undefined,
            lastExportedCount: undefined,
          })),
        },
        onError: {
          target: "loadError",
          actions: assign({
            chapter: () => undefined,
            pendingChapterId: () => undefined,
            loadError: ({ event }) => errorMessage(event.error),
          }),
        },
      },
    },
    translationOpening: {
      invoke: {
        src: "loadTranslation",
        input: ({ context }) => ({
          chapterRepository: context.chapterRepository,
          chapterId: context.pendingChapterId ?? "",
        }),
        onDone: {
          target: "chapter.clean",
          actions: "applyTranslationWorkspace",
        },
        onError: {
          target: "loadError",
          actions: assign({
            chapter: () => undefined,
            pendingChapterId: () => undefined,
            loadError: ({ event }) => errorMessage(event.error),
          }),
        },
      },
    },
    loadError: {
      on: {
        SELECT_CHAPTER: {
          guard: "chapterReady",
          actions: "selectChapter",
        },
        OPEN_CHAPTER: {
          guard: "chapterReady",
          target: "opening",
          actions: "requestChapter",
        },
        OPEN_BOUNDARY: {
          guard: "boundaryReady",
          target: "opening",
          actions: "requestBoundary",
        },
        OPEN_TRANSLATION: {
          guard: "translationChapterReady",
          target: "translationOpening",
          actions: "requestTranslation",
        },
        REFRESH_CATALOG: {
          target: "catalogLoading",
        },
      },
    },
    chapter: {
      initial: "clean",
      states: {
        clean: {
          on: {
            SELECT_CHAPTER: {
              guard: "chapterReady",
              actions: "selectChapter",
            },
            OPEN_CHAPTER: {
              guard: "chapterReadyAndDifferent",
              target: "#workspace.opening",
              actions: "requestChapter",
            },
            OPEN_BOUNDARY: {
              guard: "boundaryReady",
              target: "#workspace.opening",
              actions: "requestBoundary",
            },
            OPEN_TRANSLATION: {
              guard: "translationChapterReady",
              target: "#workspace.translationOpening",
              actions: "requestTranslation",
            },
            SELECT_REVIEW_MODULE: {
              guard: "reviewModuleAvailable",
              actions: "selectReviewModule",
            },
            SET_HEADING_NUMBERING: {
              actions: "setHeadingNumbering",
            },
            CALIBRATION_ROW_FOCUSED: {
              actions: "focusCalibrationRow",
            },
            ADD_SOURCE_LINE_TO_ACTIVE_MODULE: {
              guard: "canAddSourceLineToActiveModule",
              target: "dirty",
              actions: "addSourceLineToActiveModule",
            },
            WORKING_CHANGED: {
              guard: "workingTextChanged",
              target: "dirty",
              actions: "updateWorkingText",
            },
            MEDIA_DOWNLOAD_APPLIED: {
              actions: "applyMediaDownloadResult",
            },
            CALIBRATION_LINE_TYPE_CHANGED: {
              guard: "calibrationLineTypeChanged",
              target: "dirty",
              actions: "updateCalibrationLineType",
            },
            CHAPTER_FILE_CHANGED: {
              guard: "chapterFileChanged",
              target: "dirty",
              actions: "updateChapterFile",
            },
            ASSIGN_BOUNDARY_SEQUENCE: {
              guard: "canAssignBoundarySequence",
              target: "dirty",
              actions: "assignBoundarySequence",
            },
            EXPORT_BOUNDARY: {
              guard: "canExportBoundary",
              target: "exportingClean",
              actions: "clearSaveError",
            },
            EXPORT_TRANS: {
              guard: "canExportTrans",
              target: "exportingTrans",
              actions: "clearSaveError",
            },
            RESET_CALIBRATION: {
              guard: "canResetCalibration",
              target: "resettingClean",
              actions: "clearSaveError",
            },
            REDO: [
              {
                guard: "redoTargetIsSavedBaseline",
                actions: "applyRedo",
              },
              {
                guard: "canRedoHistory",
                target: "dirty",
                actions: "applyRedo",
              },
            ],
            CLOSE: {
              target: "#workspace.idle",
              actions: "clearChapter",
            },
          },
        },
        dirty: {
          on: {
            SELECT_CHAPTER: {
              guard: "chapterReady",
              actions: "selectChapter",
            },
            OPEN_CHAPTER: {
              guard: "chapterReadyAndDifferent",
              target: "leaveConfirm",
              actions: "requestOpenLeave",
            },
            SELECT_REVIEW_MODULE: {
              guard: "reviewModuleAvailable",
              actions: "selectReviewModule",
            },
            SET_HEADING_NUMBERING: {
              actions: "setHeadingNumbering",
            },
            CALIBRATION_ROW_FOCUSED: {
              actions: "focusCalibrationRow",
            },
            ADD_SOURCE_LINE_TO_ACTIVE_MODULE: {
              guard: "canAddSourceLineToActiveModule",
              actions: "addSourceLineToActiveModule",
            },
            WORKING_CHANGED: {
              guard: "workingTextChanged",
              actions: "updateWorkingText",
            },
            CALIBRATION_LINE_TYPE_CHANGED: {
              guard: "calibrationLineTypeChanged",
              actions: "updateCalibrationLineType",
            },
            CHAPTER_FILE_CHANGED: {
              guard: "chapterFileChanged",
              actions: "updateChapterFile",
            },
            ASSIGN_BOUNDARY_SEQUENCE: {
              guard: "canAssignBoundarySequence",
              actions: "assignBoundarySequence",
            },
            EXPORT_BOUNDARY: {
              guard: "canExportBoundary",
              target: "exportingDirty",
              actions: "clearSaveError",
            },
            UNDO: [
              {
                guard: "undoTargetIsSavedBaseline",
                target: "clean",
                actions: "applyUndo",
              },
              {
                guard: "canUndoHistory",
                actions: "applyUndo",
              },
            ],
            REDO: [
              {
                guard: "redoTargetIsSavedBaseline",
                target: "clean",
                actions: "applyRedo",
              },
              {
                guard: "canRedoHistory",
                actions: "applyRedo",
              },
            ],
            SAVE: {
              target: "saving",
              actions: "clearSaveError",
            },
            RESET_CALIBRATION: {
              guard: "canResetCalibration",
              target: "resettingDirty",
              actions: "clearSaveError",
            },
            CLOSE: {
              target: "leaveConfirm",
              actions: "requestCloseLeave",
            },
          },
        },
        leaveConfirm: {
          on: {
            LEAVE_CANCEL: {
              target: "dirty",
              actions: "cancelLeave",
            },
            LEAVE_DISCARD: [
              {
                guard: "pendingLeaveIsClose",
                target: "#workspace.idle",
                actions: "clearChapter",
              },
              {
                guard: "pendingLeaveIsOpen",
                target: "#workspace.opening",
                actions: "prepareLeaveOpen",
              },
            ],
            LEAVE_SAVE: {
              target: "leaveSaving",
              actions: "clearSaveError",
            },
          },
        },
        leaveSaving: {
          invoke: {
            src: "saveChapter",
            input: ({ context }) => {
              if (!context.chapter) throw new Error("cannot save without an open chapter");
              return {
                chapterRepository: context.chapterRepository,
                chapter: context.chapter,
              };
            },
            onDone: [
              {
                guard: "pendingLeaveIsClose",
                target: "#workspace.idle",
                actions: "finishSavedClose",
              },
              {
                guard: "pendingLeaveIsOpen",
                target: "#workspace.opening",
                actions: "finishSavedOpen",
              },
            ],
            onError: {
              target: "leaveConfirm",
              actions: "recordSaveActorError",
            },
          },
        },
        saving: {
          invoke: {
            src: "saveChapter",
            input: ({ context }) => {
              if (!context.chapter) throw new Error("cannot save without an open chapter");
              return {
                chapterRepository: context.chapterRepository,
                chapter: context.chapter,
              };
            },
            onDone: {
              target: "clean",
              actions: "applySaveResult",
            },
            onError: {
              target: "dirty",
              actions: "recordSaveActorError",
            },
          },
        },
        resettingClean: {
          invoke: {
            src: "resetChapter",
            input: ({ context }) => {
              if (!context.chapter) throw new Error("cannot reset without an open chapter");
              return {
                chapterRepository: context.chapterRepository,
                chapter: context.chapter,
              };
            },
            onDone: {
              target: "clean",
              actions: "applyResetResult",
            },
            onError: {
              target: "clean",
              actions: "recordSaveActorError",
            },
          },
        },
        resettingDirty: {
          invoke: {
            src: "resetChapter",
            input: ({ context }) => {
              if (!context.chapter) throw new Error("cannot reset without an open chapter");
              return {
                chapterRepository: context.chapterRepository,
                chapter: context.chapter,
              };
            },
            onDone: {
              target: "clean",
              actions: "applyResetResult",
            },
            onError: {
              target: "dirty",
              actions: "recordSaveActorError",
            },
          },
        },
        exportingClean: {
          invoke: {
            src: "exportBoundary",
            input: ({ context }) => {
              if (!context.chapter) {
                throw new Error("cannot export without an open boundary");
              }
              return {
                chapterRepository: context.chapterRepository,
                chapter: context.chapter,
              };
            },
            onDone: {
              target: "clean",
              actions: "applyBoundaryExportResult",
            },
            onError: {
              target: "clean",
              actions: "recordSaveActorError",
            },
          },
        },
        exportingDirty: {
          invoke: {
            src: "exportBoundary",
            input: ({ context }) => {
              if (!context.chapter) {
                throw new Error("cannot export without an open boundary");
              }
              return {
                chapterRepository: context.chapterRepository,
                chapter: context.chapter,
              };
            },
            onDone: {
              target: "clean",
              actions: "applyBoundaryExportResult",
            },
            onError: {
              target: "dirty",
              actions: "recordSaveActorError",
            },
          },
        },
        exportingTrans: {
          invoke: {
            src: "exportTransSource",
            input: ({ context }) => {
              if (!context.chapter) {
                throw new Error("cannot export trans without an open chapter");
              }
              return {
                chapterRepository: context.chapterRepository,
                chapter: context.chapter,
                headingNumberingEnabled: context.headingNumberingEnabled,
              };
            },
            onDone: {
              target: "clean",
              actions: "applyTranslationWorkspace",
            },
            onError: {
              target: "clean",
              actions: "recordSaveActorError",
            },
          },
        },
      },
    },
    debug: {
      on: {
        EXIT_DEBUG: {
          target: "idle",
        },
      },
    },
  },
});

export type WorkspaceSnapshot = SnapshotFrom<typeof workspaceMachine>;

export type WorkspaceViewModel = {
  session:
    | "catalog-loading"
    | "catalog-error"
    | "idle"
    | "opening"
    | "load-error"
    | "chapter-clean"
    | "chapter-dirty"
    | "chapter-leave-confirm"
    | "chapter-leave-saving"
    | "chapter-saving"
    | "chapter-resetting"
    | "chapter-exporting"
    | "debug";
  projectName?: string;
  chapters: ChapterListItem[];
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
  activeReviewModule: ActiveReviewModule;
  activeModuleRows: number;
  changedLineRows: ChangedLineAuditRow[];
  changedLineCount: number;
  changedLineAddedCount: number;
  changedLineModifiedCount: number;
  changedLineDeletedCount: number;
  changedLineUnclassifiedCount: number;
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
  revision?: string;
  canSelectChapter: boolean;
  canOpenChapter: boolean;
  canRefreshCatalog: boolean;
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
  leaveIntentKind?: PendingLeaveIntent["kind"];
  leaveTargetChapterName?: string;
  canEnterDebug: boolean;
  canExitDebug: boolean;
  catalogError?: string;
  loadError?: string;
  saveError?: string;
  lastSavedAt?: string;
};

function documentLineCount(text: string): number {
  return text ? text.split(/\r\n|\r|\n/).length : 1;
}

function rowVisibleInModule(
  row: ChapterWorkspaceData["rows"][number],
  module: ActiveReviewModule,
): boolean {
  if (row.typeLabel !== module) return false;
  if (row.lineType === "已忽略" || row.lineType === "已删除") return false;
  if (module === "章节标题") {
    return /^[1-6]\s*级标题$/.test(row.lineType ?? "");
  }
  return true;
}

export function deriveWorkspaceView(snapshot: WorkspaceSnapshot): WorkspaceViewModel {
  const catalogLoading = snapshot.matches("catalogLoading");
  const catalogErrorState = snapshot.matches("catalogError");
  const idle = snapshot.matches("idle");
  const opening =
    snapshot.matches("opening") || snapshot.matches("translationOpening");
  const loadErrorState = snapshot.matches("loadError");
  const chapterClean = snapshot.matches({ chapter: "clean" });
  const chapterDirty = snapshot.matches({ chapter: "dirty" });
  const chapterLeaveConfirm = snapshot.matches({ chapter: "leaveConfirm" });
  const chapterLeaveSaving = snapshot.matches({ chapter: "leaveSaving" });
  const chapterSaving = snapshot.matches({ chapter: "saving" });
  const chapterResetting =
    snapshot.matches({ chapter: "resettingClean" })
    || snapshot.matches({ chapter: "resettingDirty" });
  const chapterExporting =
    snapshot.matches({ chapter: "exportingClean" })
    || snapshot.matches({ chapter: "exportingDirty" })
    || snapshot.matches({ chapter: "exportingTrans" });
  const debug = snapshot.matches("debug");
  const chapter = snapshot.context.chapter;
  const selectedReady = snapshot.context.chapters.some(
    (item) => item.id === snapshot.context.selectedChapterId && item.ready,
  );

  let session: WorkspaceViewModel["session"] = "idle";
  if (catalogLoading) session = "catalog-loading";
  else if (catalogErrorState) session = "catalog-error";
  else if (opening) session = "opening";
  else if (loadErrorState) session = "load-error";
  else if (chapterClean) session = "chapter-clean";
  else if (chapterDirty) session = "chapter-dirty";
  else if (chapterLeaveConfirm) session = "chapter-leave-confirm";
  else if (chapterLeaveSaving) session = "chapter-leave-saving";
  else if (chapterSaving) session = "chapter-saving";
  else if (chapterResetting) session = "chapter-resetting";
  else if (chapterExporting) session = "chapter-exporting";
  else if (debug) session = "debug";

  const canSelectChapter =
    idle
    || loadErrorState
    || chapterClean
    || chapterDirty;
  const selectedDifferentFromOpen =
    !chapter || snapshot.context.selectedChapterId !== chapter.id;
  const canUseReviewGrid = chapterClean || chapterDirty;
  const translationProgressState =
    chapter?.kind === "translation" && chapter.translationState
      ? translationProgress(
          chapter.rows,
          chapter.translationState,
          "idle",
          undefined,
          chapter.translationServiceId ?? "deepl",
        )
      : {
          completed: 0,
          total: 0,
          failed: 0,
          serviceId: undefined,
        };
  const boundaryRows = chapter?.kind === "boundary"
    ? chapter.rows.filter((row) => row.typeLabel === "章节定界")
    : [];
  const boundaryHeadings = boundaryRows.filter(
    (row) => row.lineType === "1 级标题",
  );
  const boundaryAssignedHeadings = boundaryHeadings.filter(
    (row) => Boolean(row.chapterFile?.trim()),
  );
  let boundarySegmentCount = 0;
  if (chapter?.kind === "boundary") {
    try {
      const application = new ChapterReviewApplication({
        rows: chapter.rows,
        annotationPairs: chapter.annotationPairs,
      });
      boundarySegmentCount = application.chapterBoundarySegments(
        chapter.workingText,
      ).length;
    } catch {
      boundarySegmentCount = 0;
    }
  }
  const pendingLeaveIntent = snapshot.context.pendingLeaveIntent;
  const leaveTargetChapterName =
    pendingLeaveIntent?.kind === "open"
      ? snapshot.context.chapters.find(
          (item) => item.id === pendingLeaveIntent.chapterId,
        )?.name
      : undefined;
  const changedLineRows =
    chapter?.kind === "chapter" || (!chapter?.kind && chapter)
      ? deriveChangedLineAuditRows({
          originalText: chapter.originalText,
          workingText: chapter.workingText,
          calibrationRows: chapter.rows,
        })
      : [];
  const activeModuleRows = snapshot.context.activeReviewModule === "变动行"
    ? changedLineRows.length
    : snapshot.context.activeReviewModule === "媒体"
      ? deriveMediaCatalog(chapter).length
      : chapter
        ? chapter.rows.filter((row) =>
            rowVisibleInModule(row, snapshot.context.activeReviewModule)).length
        : 0;
  const illegalLineBreakRows = chapter
    ? chapter.rows.filter((row) => row.typeLabel === "非法断行")
    : [];
  const illegalMergeDecisionCount = illegalLineBreakRows.filter(
    (row) => row.lineType === "合并",
  ).length;
  const illegalMergeSpanCount = chapter
    ? buildIllegalMergeSpans(chapter.rows).length
    : 0;
  const ignoredIllegalLineBreakRows = illegalLineBreakRows.filter(
    (row) => row.lineType === "已忽略",
  ).length;
  const titleHeadingCount = chapter
    ? chapter.rows.filter(
        (row) =>
          row.typeLabel === "章节标题"
          && /^[1-6]\s*级标题$/.test(row.lineType ?? ""),
      ).length
    : 0;
  const titleExport = chapter
    ? exportByCalibration(chapter.workingText, chapter.rows, {
        numberHeadings: snapshot.context.headingNumberingEnabled,
      })
    : "";
  const titleExportHeadingCount = (
    titleExport.match(/^#{1,6}(?:\s|$)/gm) ?? []
  ).length;
  const titleExportNumberedCount = (
    titleExport.match(/^#{1,6}\s+\(\d{3}\)\s/gm) ?? []
  ).length;
  const annotationSummary = chapter
    ? annotationMatchSummary(chapter.rows, chapter.annotationPairs)
    : {
        calibrated: 0,
        paired: 0,
        missingRef: 0,
        missingBody: 0,
        missingNumber: 0,
      };
  const embedRows = chapter
    ? chapter.rows.filter((row) => row.typeLabel === "嵌入块")
    : [];
  const visibleEmbedRows = embedRows.filter(
    (row) => row.lineType !== "已忽略" && row.lineType !== "已删除",
  );
  const embedGroups = new Set(
    visibleEmbedRows
      .map((row) => row.embedNumber)
      .filter((value): value is number => typeof value === "number"),
  );

  return {
    session,
    projectName: snapshot.context.projectName,
    chapters: snapshot.context.chapters,
    workspaceKind: chapter?.kind,
    boundaryReady: snapshot.context.boundary?.ready === true,
    boundarySourceFileCount: snapshot.context.boundary?.sourceFileCount ?? 0,
    boundaryHeadingCount: boundaryHeadings.length,
    boundaryAssignedHeadingCount: boundaryAssignedHeadings.length,
    boundarySegmentCount,
    canOpenBoundary:
      (idle || loadErrorState)
      && snapshot.context.boundary?.ready === true,
    canExportBoundary:
      (chapterClean || chapterDirty)
      && chapter?.kind === "boundary"
      && boundarySegmentCount > 0,
    canOpenTranslation:
      (idle || loadErrorState || chapterClean)
      && selectedReady
      && chapter?.kind !== "boundary",
    canExportTrans: chapterClean && chapter?.kind === "chapter",
    translationTotal: translationProgressState.total,
    translationCompleted: translationProgressState.completed,
    translationFailed: translationProgressState.failed,
    translationServiceId: chapter?.kind === "translation"
      ? chapter.translationServiceId
      : undefined,
    lastExportedCount: snapshot.context.lastExportedCount,
    selectedChapterId: snapshot.context.selectedChapterId,
    activeReviewModule: snapshot.context.activeReviewModule,
    activeModuleRows,
    changedLineRows,
    changedLineCount: changedLineRows.length,
    changedLineAddedCount: changedLineRows.filter((row) => row.state === "新增").length,
    changedLineModifiedCount: changedLineRows.filter((row) => row.state === "修改").length,
    changedLineDeletedCount: changedLineRows.filter((row) => row.state === "删除").length,
    changedLineUnclassifiedCount: changedLineRows.filter((row) => row.owner === "未归类").length,
    headingNumberingEnabled: snapshot.context.headingNumberingEnabled,
    titleHeadingCount,
    titleExportHeadingCount,
    titleExportNumberedCount,
    canSetHeadingNumbering:
      canUseReviewGrid
      && chapter?.kind !== "boundary"
      && chapter?.kind !== "translation",
    focusedReviewRowId: snapshot.context.focusedReviewRowId,
    focusedSourceLine: snapshot.context.focusedSourceLine,
    chapterPath: chapter?.path,
    chapterName: chapter?.name,
    workingLines: chapter ? documentLineCount(chapter.workingText) : undefined,
    workingLength: chapter?.workingText.length,
    calibrationRows: chapter?.rows.length,
    visibleCalibrationRows: chapter?.rows.filter(
      (row) => row.lineType !== "已忽略" && row.lineType !== "已删除",
    ).length,
    ignoredCalibrationRows: chapter?.rows.filter(
      (row) => row.lineType === "已忽略",
    ).length,
    illegalMergeDecisionCount,
    illegalMergeSpanCount,
    ignoredIllegalLineBreakRows,
    annotationPairs: chapter?.annotationPairs.length,
    annotationCalibratedRows: annotationSummary.calibrated,
    annotationPairedCount: annotationSummary.paired,
    annotationMissingRefCount: annotationSummary.missingRef,
    annotationMissingBodyCount: annotationSummary.missingBody,
    annotationMissingNumberCount: annotationSummary.missingNumber,
    embedTotalRows: embedRows.length,
    embedVisibleRows: visibleEmbedRows.length,
    embedGroupCount: embedGroups.size,
    embedUnassignedRows: visibleEmbedRows.filter(
      (row) => typeof row.embedNumber !== "number",
    ).length,
    revision: chapter?.revision,
    canSelectChapter,
    canOpenChapter: canSelectChapter && selectedReady && selectedDifferentFromOpen,
    canRefreshCatalog: idle || loadErrorState || catalogErrorState,
    canSelectReviewModule: canUseReviewGrid,
    canFocusReviewRow: canUseReviewGrid && activeModuleRows > 0,
    canEdit:
      (chapterClean || chapterDirty) && chapter?.kind !== "translation",
    canUndo:
      canUseReviewGrid
      && chapter?.kind !== "translation"
      && snapshot.context.undoStack.length > 0,
    canRedo:
      canUseReviewGrid
      && chapter?.kind !== "translation"
      && snapshot.context.redoStack.length > 0,
    undoDepth: snapshot.context.undoStack.length,
    redoDepth: snapshot.context.redoStack.length,
    canSave: chapterDirty && chapter?.kind !== "translation",
    canResetCalibration:
      (chapterClean || chapterDirty) && chapter?.kind === "chapter",
    canClose: chapterClean || chapterDirty,
    canLeaveCancel: chapterLeaveConfirm,
    canLeaveDiscard: chapterLeaveConfirm,
    canLeaveSave: chapterLeaveConfirm,
    leaveIntentKind: snapshot.context.pendingLeaveIntent?.kind,
    leaveTargetChapterName,
    canEnterDebug: idle,
    canExitDebug: debug,
    catalogError: snapshot.context.catalogError,
    loadError: snapshot.context.loadError,
    saveError: snapshot.context.saveError,
    lastSavedAt: snapshot.context.lastSavedAt,
  };
}
