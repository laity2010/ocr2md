import { annotationMatchSummary } from "../src/annotation";
import { exportByCalibration } from "../src/calibrationExport";
import { applyHeadingLineTypeToText } from "../src/chapterReviewActions";
import { ChapterReviewApplication } from "../src/chapterReviewApplication";
import { MODULE_REGEX_DEFAULTS } from "../src/regexPresets";
import { withFormatCalibratedFrontmatter } from "../src/workspaceFiles";
import type { Candidate, SidebarState } from "../src/types";
import type { UiCommandMessage } from "../src/uiProtocol";
import {
  installGoogleDriveCloudPanel,
  type GoogleDriveCloudConfig,
  type GoogleDriveOpenedFile,
} from "./googleDriveCloudPanel";

interface DemoPayload {
  initialState: SidebarState;
  sourceText: string;
  workingText: string;
  goldenText: string;
  sourcePath: string;
  workingPath: string;
  sourceLabel: string;
  googleDrive?: GoogleDriveCloudConfig;
}

interface SavedReviewState {
  rows: Candidate[];
  annotationPairs: SidebarState["annotationPairs"];
  workingText: string;
  headingNumberingEnabled: boolean;
}

const REVIEW_SAVE_KEY = "ocr2md-cloud-smoke-review-v1";
const VIEW_STATE_KEY = "ocr2md-cloud-smoke-view-v1";

export function install(payload: DemoPayload): void {
  let state = clone(payload.initialState);
  let sourceText = payload.sourceText;
  let workingText = payload.workingText;
  let sourcePath = payload.sourcePath;
  let workingPath = payload.workingPath;
  let sourceLabel = payload.sourceLabel;
  let application = new ChapterReviewApplication({ rows: state.rows, annotationPairs: state.annotationPairs });
  let saved = currentSavedState();
  const listeners: Array<(state: SidebarState) => void> = [];

  const host = {
    postMessage(message: UiCommandMessage) {
      void dispatch(message);
    },
    getState() {
      return parseJson(localStorage.getItem(VIEW_STATE_KEY));
    },
    setState(value: unknown) {
      localStorage.setItem(VIEW_STATE_KEY, JSON.stringify(value ?? {}));
    },
    onState(listener: (next: SidebarState) => void) {
      listeners.push(listener);
    },
  };

  (window as unknown as { ocr2mdHost: typeof host }).ocr2mdHost = host;
  if (payload.googleDrive) {
    installGoogleDriveCloudPanel(
      payload.googleDrive,
      setStatus,
      openDriveDocument,
      getDriveSaveText,
      markDriveDocumentSaved,
    );
  }
  queueMicrotask(() => host.postMessage({ command: "exportByCalibration" }));

  async function dispatch(message: UiCommandMessage): Promise<void> {
    try {
      switch (message.command) {
        case "setActiveModule":
          if (message.moduleName) state.activeModule = message.moduleName as SidebarState["activeModule"];
          publish();
          return;
        case "setHeadingNumbering":
          state.headingNumberingEnabled = message.enabled !== false;
          publish();
          return;
        case "setRowsLineType": {
          const ids = message.ids ?? [];
          const lineType = message.lineType ?? "";
          const selectedRows = state.rows.filter((row) => ids.includes(row.id));
          const headingRows = selectedRows.filter((row) => row.typeLabel === "章节标题");
          if (lineType !== "已删除" && headingRows.length && /^(?:[1-6] 级标题|非标题)$/.test(lineType)) {
            workingText = applyHeadingLineTypeToText(workingText, headingRows, lineType);
          }
          const next = application.setRowsLineType({
            ids,
            lineType,
            text: workingText,
            sourcePath,
            workingPath,
          });
          updateFromApplication(next);
          setStatus(`已更新 ${ids.length} 行 → ${lineType}`, "ready");
          return;
        }
        case "setAnnotationNumber": {
          if (!message.id) return;
          updateFromApplication(application.setAnnotationNumber(message.id, message.annotationNumber ?? ""));
          return;
        }
        case "matchAnnotationPairs":
          updateFromApplication(application.matchAnnotationPairs());
          setStatus("注释配对已重建", "ready");
          return;
        case "scanModule": {
          const moduleName = message.moduleName ?? state.activeModule;
          const patterns = splitPatterns(message.pattern ?? state.moduleRegexPatterns[moduleName] ?? "");
          if (moduleName === "注释") {
            updateFromApplication(application.refreshAnnotation({
              baselineText: sourceText,
              workingText,
              sourcePath,
              workingPath,
              sourceLabel,
              patterns,
            }));
          } else if (moduleName === "嵌入块") {
            updateFromApplication(application.refreshEmbed({
              baselineText: sourceText,
              workingText,
              sourcePath,
              workingPath,
              sourceLabel,
              patterns,
            }));
          }
          state.moduleRegexPatterns[moduleName] = message.pattern ?? state.moduleRegexPatterns[moduleName] ?? "";
          publish();
          setStatus(`${moduleName} 已重新扫描`, "ready");
          return;
        }
        case "setChapterFile":
          updateFromApplication(application.setChapterFile(message.ids ?? (message.id ? [message.id] : []), message.chapterFile ?? ""));
          return;
        case "assignChapterFiles": {
          const result = application.assignChapterFiles(message.ids ?? [], (message.mode ?? "sequence") as "sequence" | "manual", message.value ?? "");
          if (!result.ok) {
            setStatus(result.error, "fail");
            return;
          }
          updateFromApplication(result);
          return;
        }
        case "saveAnnotations":
          saved = currentSavedState();
          localStorage.setItem(REVIEW_SAVE_KEY, JSON.stringify(saved));
          setStatus(`SAVED · ${saved.rows.length} 条审核记录`, "pass");
          return;
        case "reloadAnnotations": {
          const persisted = parseJson(localStorage.getItem(REVIEW_SAVE_KEY)) as SavedReviewState | undefined;
          const restore = persisted?.rows ? persisted : saved;
          workingText = restore.workingText;
          state.headingNumberingEnabled = restore.headingNumberingEnabled;
          application = new ChapterReviewApplication({ rows: restore.rows, annotationPairs: restore.annotationPairs });
          updateFromApplication(application.snapshot());
          setStatus("RELOADED · 审核状态已恢复", "pass");
          return;
        }
        case "exportByCalibration":
          verifyGolden();
          return;
        case "exportCalibrationToTrans": {
          const output = withFormatCalibratedFrontmatter(exportByCalibration(workingText, application.snapshot().rows, { numberHeadings: state.headingNumberingEnabled }));
          setStatus(`trans 版已生成 · ${byteLength(output).toLocaleString()} bytes`, "pass");
          return;
        }
        case "locateRow": {
          const row = state.rows.find((candidate) => candidate.id === message.id);
          if (row) showSource(row, workingText);
          return;
        }
        case "showWarning":
          setStatus(message.message ?? "提示", "fail");
          return;
        case "openChapterWorkingCopy":
        case "openAnnotationWorkingCopy":
          setStatus("Cloud Smoke：当前使用浏览器内存工作稿", "ready");
          return;
        case "downloadImages":
          setStatus("Cloud Smoke：网络图片下载暂未接入", "ready");
          return;
        case "openChapterBoundaryWork":
        case "exportChapterBoundaryChapters":
          setStatus("Cloud Smoke：本轮只验证 chapters 审核模块", "ready");
          return;
        default:
          setStatus(`Cloud Smoke 暂不处理：${message.command}`, "ready");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), "fail");
      console.error(error);
    }
  }

  function openDriveDocument(file: GoogleDriveOpenedFile): void {
    sourceText = file.text;
    workingText = file.text;
    sourcePath = file.path;
    workingPath = `${file.path}.ocr2md-memory-working`;
    sourceLabel = file.name;

    application = new ChapterReviewApplication({ rows: [], annotationPairs: [] });
    application.refreshChapterTitle({
      baselineText: sourceText,
      workingText,
      sourcePath,
      workingPath,
      sourceLabel,
      embedPatterns: splitPatterns(state.moduleRegexPatterns["嵌入块"] ?? MODULE_REGEX_DEFAULTS["嵌入块"] ?? ""),
    });
    application.refreshAnnotation({
      baselineText: sourceText,
      workingText,
      sourcePath,
      workingPath,
      sourceLabel,
      patterns: splitPatterns(state.moduleRegexPatterns["注释"] ?? MODULE_REGEX_DEFAULTS["注释"] ?? ""),
    });
    application.refreshEmbed({
      baselineText: sourceText,
      workingText,
      sourcePath,
      workingPath,
      sourceLabel,
      patterns: splitPatterns(state.moduleRegexPatterns["嵌入块"] ?? MODULE_REGEX_DEFAULTS["嵌入块"] ?? ""),
    });
    application.refreshIllegalLineBreak({ workingText, sourcePath, workingPath });

    const snapshot = application.snapshot();
    state.workspaceLabel = `Google Drive · ${file.name}`;
    state.selectedFile = { label: file.name, path: file.path, kind: "chapter" };
    state.files = [state.selectedFile];
    state.activeModule = "章节标题";
    state.viewMode = "table";
    state.rows = snapshot.rows;
    state.annotationPairs = snapshot.annotationPairs;
    saved = currentSavedState();
    publish();
    setStatus(`已载入工作台 · ${file.name}`, "pass");
  }

  function getDriveSaveText(path: string): string | undefined {
    return sourcePath === path ? workingText : undefined;
  }

  function markDriveDocumentSaved(file: GoogleDriveOpenedFile): void {
    if (sourcePath !== file.path) return;
    sourceText = file.text;
    state.selectedFile = state.selectedFile ? { ...state.selectedFile, changed: false } : state.selectedFile;
    publish();
  }

  function verifyGolden(): void {
    if (sourcePath !== payload.sourcePath) {
      setStatus(`真实 Drive 文件已载入 · ${sourceLabel}`, "pass");
      return;
    }
    const output = exportByCalibration(workingText, application.snapshot().rows, { numberHeadings: state.headingNumberingEnabled });
    const passed = output === payload.goldenText;
    setStatus(`${passed ? "GOLDEN PASS" : "GOLDEN FAIL"} · ${byteLength(output).toLocaleString()} bytes`, passed ? "pass" : "fail");
  }

  function currentSavedState(): SavedReviewState {
    const snapshot = application.snapshot();
    return {
      rows: clone(snapshot.rows),
      annotationPairs: clone(snapshot.annotationPairs),
      workingText,
      headingNumberingEnabled: state.headingNumberingEnabled,
    };
  }

  function updateFromApplication(next: { rows: Candidate[]; annotationPairs: SidebarState["annotationPairs"] }): void {
    state.rows = next.rows;
    state.annotationPairs = next.annotationPairs;
    state.annotationMatchSummary = annotationMatchSummary(next.rows, next.annotationPairs);
    publish();
  }

  function publish(): void {
    state.annotationMatchSummary = annotationMatchSummary(state.rows, state.annotationPairs);
    for (const listener of listeners) listener(clone(state));
  }
}

function splitPatterns(value: string): string[] {
  return value.split(/^\s*---\s*$/m).map((item) => item.trim()).filter(Boolean);
}

function setStatus(text: string, kind: "ready" | "pass" | "fail"): void {
  let node = document.getElementById("cloud-smoke-status");
  if (!node) {
    node = document.createElement("div");
    node.id = "cloud-smoke-status";
    document.body.append(node);
  }
  node.textContent = text;
  node.dataset.kind = kind;
}

function showSource(row: Candidate, text: string): void {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const line = Math.max(0, Math.min(row.range.line, lines.length - 1));
  const before = Math.max(0, line - 1);
  const after = Math.min(lines.length, (row.range.endLine ?? line) + 2);
  let panel = document.getElementById("cloud-smoke-source");
  if (!panel) {
    panel = document.createElement("pre");
    panel.id = "cloud-smoke-source";
    panel.addEventListener("click", () => panel?.remove());
    document.body.append(panel);
  }
  panel.textContent = lines.slice(before, after).map((value, index) => `${before + index + 1}: ${value}`).join("\n");
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function parseJson(value: string | null): unknown {
  if (!value) return undefined;
  try { return JSON.parse(value); } catch { return undefined; }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export const DEFAULT_BROWSER_REGEX = MODULE_REGEX_DEFAULTS;
