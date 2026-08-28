import type { ModuleName } from "./types";

export type UiCommand =
  | { command: "setActiveModule"; moduleName: ModuleName }
  | { command: "saveTranslationSettings"; service?: string; apiKey?: string; sampleText?: string; model?: string; prompt?: string }
  | { command: "testTranslationService"; service?: string; apiKey?: string; sampleText?: string; model?: string; prompt?: string }
  | { command: "setTranslationService"; service?: string }
  | { command: "setExportTranslationService"; service?: string }
  | { command: "translateCurrentChapter" }
  | { command: "exportCrossTranslation"; service?: string }
  | { command: "openChapterBoundaryWork" }
  | { command: "openChapterWorkingCopy" }
  | { command: "openAnnotationWorkingCopy" }
  | { command: "exportChapterBoundaryChapters" }
  | { command: "scanModule"; moduleName?: string; pattern?: string }
  | { command: "setHeadingNumbering"; enabled?: boolean }
  | { command: "setRowsLineType"; ids?: string[]; lineType?: string }
  | { command: "setChapterFile"; ids?: string[]; id?: string; chapterFile?: string }
  | { command: "assignChapterFiles"; ids?: string[]; mode?: string; value?: string }
  | { command: "showWarning"; message?: string }
  | { command: "matchAnnotationPairs" }
  | { command: "setAnnotationNumber"; id?: string; annotationNumber?: string }
  | { command: "locateRow"; id?: string }
  | { command: "downloadImages" }
  | { command: "exportByCalibration" }
  | { command: "exportCalibrationToTrans" }
  | { command: "saveAnnotations" }
  | { command: "reloadAnnotations" };

export interface UiCommandMessage {
  command: UiCommand["command"];
  moduleName?: string;
  pattern?: string;
  ids?: string[];
  id?: string;
  lineType?: string;
  mode?: string;
  value?: string;
  message?: string;
  chapterFile?: string;
  annotationNumber?: string;
  service?: string;
  apiKey?: string;
  sampleText?: string;
  model?: string;
  prompt?: string;
  enabled?: boolean;
}

export interface UiStateMessage<TState = unknown> {
  command: "setState";
  state: TState;
}

/**
 * Platform-neutral contract used by both the VS Code Webview host and a future
 * browser/cloud host. The review UI only knows these three operations.
 */
export interface ReviewUiHost<State = unknown> {
  postMessage(message: UiCommand): void;
  getState(): unknown;
  setState(value: unknown): void;
  onState(listener: (state: State) => void): void;
}

export const CHAPTER_REVIEW_COMMANDS = [
  "setActiveModule",
  "openChapterBoundaryWork",
  "openChapterWorkingCopy",
  "openAnnotationWorkingCopy",
  "exportChapterBoundaryChapters",
  "scanModule",
  "setHeadingNumbering",
  "setRowsLineType",
  "setChapterFile",
  "assignChapterFiles",
  "showWarning",
  "matchAnnotationPairs",
  "setAnnotationNumber",
  "locateRow",
  "downloadImages",
  "exportByCalibration",
  "exportCalibrationToTrans",
  "saveAnnotations",
  "reloadAnnotations",
] as const;
