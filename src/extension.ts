import * as http from "http";
import * as https from "https";
import * as path from "path";
import { randomUUID } from "crypto";
import * as vscode from "vscode";
import {
  applyChangeState,
  mergeSequenceMarkdown,
  scanChapterBoundaryLines,
} from "./chapterBoundary";
import {
  annotationMatchSummary,
  extractAnnotationNumber,
} from "./annotation";
import type { ChapterAssignMode } from "./chapterFileAssign";
import {
  activeCandidates,
  DELETED_LINE_TYPE,
  IGNORED_LINE_TYPE,
  isIgnoredEmbedCandidate,
  findReusableManualRow,
} from "./candidateLifecycle";
import { MODULE_REGEX_DEFAULTS, MODULE_REGEX_PRESETS } from "./regexPresets";
import {
  attachLineIdentity,
  locateCandidate,
} from "./rowIdentity";
import { exportByCalibration } from "./calibrationExport";
import { exportCrossTranslation, normalizeVaultRelativePath } from "./crossTranslationExport";
import { scanTextBlocks } from "./textBlocks";
import { scanSentences } from "./sentences";
import {
  markdownStructureIssue,
  missingProtectedMarkdownTokens,
  protectMarkdownForTranslation,
  restoreProtectedMarkdown,
} from "./markdownProtection";
import { scanTranslationUnits } from "./translationUnits";
import {
  DEFAULT_OPENAI_MODEL,
  DEFAULT_OPENAI_TRANSLATION_PROMPT,
  DEFAULT_TRANSLATION_SAMPLE,
  testDeepL,
  testOpenAI,
  translateDeepL,
  translateOpenAI,
} from "./translationService";
import {
  TRANSLATION_STATE_FILE,
  backfillTranslationFingerprints,
  emptyTranslationState,
  isTranslationUnitTranslated,
  parseTranslationState,
  recordTranslation,
  recordTranslationError,
  serializeTranslationState,
  translationResultForUnit,
  translationProgress,
  translationRows,
  type TranslationStateFile,
} from "./translationState";
import {
  extractImageUrl,
  safeImageName,
  shouldDownloadImage,
} from "./imageDownload";
import {
  applyEmbedNumbers,
  detectEmbedLineType,
} from "./scanner";
import type {
  AnnotationPair,
  Candidate,
  FileEntry,
  ImageDownloadProgress,
  ModuleName,
  SidebarState,
  TranslationProgressState,
  TranslationServiceId,
  TranslationTestState,
} from "./types";
import { renderSidebar } from "./webview";
import { ChapterReviewApplication } from "./chapterReviewApplication";
import { ChapterWorkspaceApplication } from "./chapterWorkspaceApplication";
import { VsCodeWorkspaceStorage } from "./vscodeWorkspaceStorage";
import { deleteIfExists as deleteStoredIfExists, readText, writeText, type WorkspaceStorage } from "./workspaceStorage";
import {
  applyRowsLineType as applyReviewRowsLineType,
  planHeadingLineTypeEdits,
} from "./chapterReviewActions";
import type { UiCommandMessage } from "./uiProtocol";
import {
  CHAPTER_BOUNDARY_WORKING_FILE,
  CHAPTER_IMAGE_DIRECTORY,
  TRANS_OUTPUT_DIRECTORY,
  chapterDiffBaseline,
  chapterDirectoryPath,
  chapterDisplayName,
  chapterImageDirectory,
  isChapterOutputPath,
  markdownFileKind,
  withFormatCalibratedFrontmatter,
} from "./workspaceFiles";

const MODULES: ModuleName[] = ["章节定界", "章节标题", "注释", "嵌入块", "非法断行", "文本块", "分句", "翻译"];
const HEADING_COLORS = ["#ff5c57", "#ff9f43", "#feca57", "#9ccc65", "#55c6a9", "#d77bbf"];
const DEEPL_API_KEY_SECRET = "ocr2md.translation.deepl.apiKey";
const OPENAI_API_KEY_SECRET = "ocr2md.translation.openai.apiKey";
const TRANSLATION_SERVICE_SETTING = "ocr2md.translation.service";
const TRANSLATION_EXPORT_SERVICE_SETTING = "ocr2md.translation.exportService";
const TRANSLATION_SAMPLE_SETTING = "ocr2md.translation.sampleText";
const OPENAI_MODEL_SETTING = "ocr2md.translation.openai.model";
const OPENAI_PROMPT_SETTING = "ocr2md.translation.openai.prompt";
const HEADING_NUMBERING_SETTING = "ocr2md.heading.numberingEnabled";

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(new Ocr2mdExtension(context));
}

export function deactivate() {
  // VS Code disposes the extension subscriptions registered in activate.
}

class Ocr2mdExtension implements vscode.Disposable {
  private readonly directoryProvider: DirectoryProvider;
  private readonly directoryView: vscode.TreeView<DirectoryItem>;
  private readonly sidebarProvider: SidebarProvider;
  private readonly disposables: vscode.Disposable[] = [];
  private files: FileEntry[] = [];
  private selectedFile: FileEntry | undefined;
  private selectedFileText = "";
  private activeModule: ModuleName = "章节定界";
  private rows: Candidate[] = [];
  private annotationPairs: AnnotationPair[] = [];
  private readonly moduleRegexPatterns = { ...MODULE_REGEX_DEFAULTS };
  private chapterBoundaryWorkingUri: vscode.Uri | undefined;
  private chapterWorkingUri: vscode.Uri | undefined;
  private annotationWorkingUri: vscode.Uri | undefined;
  private readonly modulePreviewPaths = new Map<ModuleName, string>();
  private readonly headingDecorations = HEADING_COLORS.map((color) =>
    vscode.window.createTextEditorDecorationType({ color, fontWeight: "bold" })
  );
  private readonly locatedRowDecoration = vscode.window.createTextEditorDecorationType({
    border: "1px solid",
    borderColor: new vscode.ThemeColor("editor.findMatchBorder"),
    borderRadius: "2px",
  });
  private readonly sourceLineBreakDecoration = vscode.window.createTextEditorDecorationType({
    after: {
      contentText: "↵",
      color: "#ff9f43",
      backgroundColor: "rgba(255, 159, 67, 0.18)",
      fontWeight: "bold",
      margin: "0 0 0 3px",
    },
  });
  private headingDecorationTimer: ReturnType<typeof setTimeout> | undefined;
  private workingCopyPaintTimer: ReturnType<typeof setTimeout> | undefined;
  private pendingWorkingCopyRescan = false;
  private imageDownloadProgress: ImageDownloadProgress | undefined;
  private imageDownloadRunning = false;
  private readonly chapterDecorations: ChapterChangeDecorationProvider;
  private readonly output = vscode.window.createOutputChannel("ocr2md");
  private viewMode: "table" | "translationService" = "table";
  private translationService: TranslationServiceId = "deepl";
  private translationExportService: TranslationServiceId = "deepl";
  private translationApiKeyConfigured: Record<TranslationServiceId, boolean> = { deepl: false, openai: false };
  private translationSampleText = DEFAULT_TRANSLATION_SAMPLE;
  private openAIModel = DEFAULT_OPENAI_MODEL;
  private openAIPrompt = DEFAULT_OPENAI_TRANSLATION_PROMPT;
  private translationTest: TranslationTestState = { phase: "idle", message: "尚未测试。" };
  private translationProgress: TranslationProgressState = { phase: "idle", completed: 0, total: 0, failed: 0 };
  private translationRunning = false;
  private headingNumberingEnabled = true;
  private readonly storage: WorkspaceStorage;
  private readonly chapterWorkspace: ChapterWorkspaceApplication;

  constructor(private readonly context: vscode.ExtensionContext, storage: WorkspaceStorage = new VsCodeWorkspaceStorage()) {
    this.storage = storage;
    this.chapterWorkspace = new ChapterWorkspaceApplication(storage);
    this.translationService = context.globalState.get<TranslationServiceId>(TRANSLATION_SERVICE_SETTING, "deepl");
    this.translationExportService = context.globalState.get<TranslationServiceId>(TRANSLATION_EXPORT_SERVICE_SETTING, "deepl");
    this.translationSampleText = context.globalState.get<string>(TRANSLATION_SAMPLE_SETTING, DEFAULT_TRANSLATION_SAMPLE);
    this.openAIModel = context.globalState.get<string>(OPENAI_MODEL_SETTING, DEFAULT_OPENAI_MODEL);
    this.openAIPrompt = context.globalState.get<string>(OPENAI_PROMPT_SETTING, DEFAULT_OPENAI_TRANSLATION_PROMPT);
    this.headingNumberingEnabled = context.workspaceState.get<boolean>(HEADING_NUMBERING_SETTING, true);
    this.directoryProvider = new DirectoryProvider(
      () => vscode.workspace.workspaceFolders?.[0],
      () => this.files,
      () => this.selectedFile?.path,
      () => this.activeModule,
      () => this.viewMode,
    );
    this.directoryView = vscode.window.createTreeView("ocr2md.directory", {
      treeDataProvider: this.directoryProvider,
    });
    this.chapterDecorations = new ChapterChangeDecorationProvider(() => this.files);
    this.sidebarProvider = new SidebarProvider(() => this.sidebarState(), (message) => this.handleMessage(message));

    this.disposables.push(
      this.directoryView,
      this.output,
      this.chapterDecorations,
      vscode.window.registerFileDecorationProvider(this.chapterDecorations),
      ...this.headingDecorations,
      this.locatedRowDecoration,
      this.sourceLineBreakDecoration,
      vscode.window.registerWebviewViewProvider("ocr2md.regex", this.sidebarProvider),
      vscode.commands.registerCommand("ocr2md.refreshFiles", () => this.refreshFiles()),
      vscode.commands.registerCommand("ocr2md.pickFolder", () => this.pickWorkspaceFolder()),
      vscode.commands.registerCommand("ocr2md.openMarkdownFile", (filePath: string) => this.selectFile(filePath)),
      vscode.commands.registerCommand("ocr2md.openTransChapter", (directoryPath: string, moduleName?: "文本块" | "分句" | "翻译") =>
        this.runTransAction(`打开 trans ${moduleName ?? "文本块"}`, () => this.openTransChapterDirectory(directoryPath, moduleName))),
      vscode.commands.registerCommand("ocr2md.openTranslationService", () =>
        this.runTransAction("打开翻译服务", () => this.openTranslationService())),
      vscode.commands.registerCommand("ocr2md.openChapterModule", (filePath: string, moduleName: ModuleName) => {
        if (moduleName === "章节标题" || moduleName === "注释" || moduleName === "嵌入块" || moduleName === "非法断行") {
          return this.selectFile(filePath, moduleName);
        }
        return undefined;
      }),
      vscode.commands.registerCommand("ocr2md.addCurrentLineToModule", () => this.addCurrentLine()),
      vscode.commands.registerCommand("ocr2md.markIllegalLineBreak", () => this.markIllegalLineBreakAtCursor()),
      vscode.commands.registerCommand("ocr2md.openChapterBoundaryWork", () => this.openChapterBoundaryWork()),
      vscode.commands.registerCommand("ocr2md.openChapterWorkingCopy", () => this.openChapterWorkingCopy()),
      vscode.commands.registerCommand("ocr2md.exportChapterBoundaryChapters", () => this.exportChapterBoundaryChapters()),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.refreshFiles()),
      vscode.workspace.onDidSaveTextDocument((document) => this.handleSavedDocument(document)),
      vscode.window.onDidChangeActiveTextEditor(() => {
        if (this.pendingWorkingCopyRescan && !this.shouldDeferWorkingCopyUi()) {
          const uri = this.chapterWorkingUri;
          const document = uri
            ? vscode.workspace.textDocuments.find((item) => item.uri.fsPath === uri.fsPath)
            : undefined;
          if (document) void this.syncWorkingCopyTable(document);
        }
      }),
      vscode.workspace.onDidChangeTextDocument((event) => {
        for (const editor of vscode.window.visibleTextEditors) {
          if (editor.document.uri.toString() === event.document.uri.toString()) this.decorateSourceLineBreaks(editor);
        }
        if (event.document.uri.fsPath === this.chapterWorkingUri?.fsPath) {
          this.pendingWorkingCopyRescan = true;
          this.scheduleWorkingCopyReindex(event.document);
          return;
        }
        this.scheduleHeadingDecorations(event.document);
      }),
    );
    void this.loadTranslationSecretState();
    void this.refreshFiles();
  }

  dispose() {
    if (this.headingDecorationTimer) clearTimeout(this.headingDecorationTimer);
    if (this.workingCopyPaintTimer) clearTimeout(this.workingCopyPaintTimer);
    this.disposables.forEach((disposable) => disposable.dispose());
  }

  private async runTransAction(label: string, action: () => Promise<void>) {
    this.output.appendLine(`[trans] ${label}`);
    try {
      await action();
      this.output.appendLine(`[trans] ${label} 完成`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.output.appendLine(`[trans] ${label} 失败：${message}`);
      if (stack) this.output.appendLine(stack);
      void vscode.window.showErrorMessage(`ocr2md trans 操作失败：${message}`);
    }
  }

  private sidebarState(): SidebarState {
    return {
      workspaceLabel: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "未选择工作区",
      selectedFile: this.selectedFile,
      files: this.files,
      activeModule: this.activeModule,
      headingNumberingEnabled: this.headingNumberingEnabled,
      rows: this.rows,
      annotationPairs: this.annotationPairs,
      moduleRegexPatterns: this.moduleRegexPatterns,
      moduleRegexPresets: MODULE_REGEX_PRESETS,
      viewMode: this.viewMode,
      translationSettings: {
        service: this.translationService,
        exportService: this.translationExportService,
        services: [
          { id: "deepl", label: "DeepL", apiKeyConfigured: this.translationApiKeyConfigured.deepl },
          {
            id: "openai",
            label: "GPT",
            apiKeyConfigured: this.translationApiKeyConfigured.openai,
            model: this.openAIModel,
            prompt: this.openAIPrompt,
          },
        ],
        sampleText: this.translationSampleText,
        test: this.translationTest,
      },
      translationProgress: this.translationProgress,
      imageDownloadProgress: this.imageDownloadProgress,
      annotationMatchSummary: annotationMatchSummary(this.rows, this.annotationPairs),
    };
  }

  private async handleMessage(message: UiCommandMessage) {
    switch (message.command) {
      case "setActiveModule":
        if (isModuleName(message.moduleName)) await this.activateModule(message.moduleName);
        break;
      case "saveTranslationSettings":
        await this.saveTranslationSettings(message);
        break;
      case "testTranslationService":
        await this.testTranslationService(message);
        break;
      case "setTranslationService":
        if (isTranslationServiceId(message.service)) await this.selectTranslationService(message.service);
        break;
      case "setExportTranslationService":
        if (isTranslationServiceId(message.service)) {
          this.translationExportService = message.service;
          await this.context.globalState.update(TRANSLATION_EXPORT_SERVICE_SETTING, message.service);
          this.update();
        }
        break;
      case "translateCurrentChapter":
        await this.runTransAction("翻译当前章节", () => this.translateCurrentChapter());
        break;
      case "exportCrossTranslation":
        await this.runTransAction("导出双向互译", () => this.exportCurrentChapterCrossTranslation(message.service));
        break;
      case "openChapterBoundaryWork":
        await this.openChapterBoundaryWork();
        break;
      case "openChapterWorkingCopy":
        await this.openChapterWorkingCopy();
        break;
      case "openAnnotationWorkingCopy":
        await this.openAnnotationWorkingCopy();
        break;
      case "exportChapterBoundaryChapters":
        await this.exportChapterBoundaryChapters();
        break;
      case "scanModule":
        if ((message.moduleName === "注释" || message.moduleName === "嵌入块") && typeof message.pattern === "string") {
          this.moduleRegexPatterns[message.moduleName] = message.pattern;
          await this.scanCurrentModule(message.moduleName);
        }
        break;
      case "setHeadingNumbering":
        if (typeof message.enabled === "boolean") {
          this.headingNumberingEnabled = message.enabled;
          await this.context.workspaceState.update(HEADING_NUMBERING_SETTING, message.enabled);
          this.update();
        }
        break;
      case "setRowsLineType":
        if (Array.isArray(message.ids) && typeof message.lineType === "string") {
          await this.setRowsLineType(message.ids, message.lineType);
        }
        break;
      case "setChapterFile":
        if (typeof message.chapterFile === "string") {
          const ids = Array.isArray(message.ids) && message.ids.length
            ? message.ids.filter((id): id is string => typeof id === "string")
            : (typeof message.id === "string" ? [message.id] : []);
          if (ids.length) this.setChapterFile(ids, message.chapterFile);
        }
        break;
      case "assignChapterFiles":
        if (typeof message.mode === "string" && typeof message.value === "string" && Array.isArray(message.ids)) {
          this.assignSelectedChapterFiles(
            message.ids.filter((id): id is string => typeof id === "string"),
            message.mode,
            message.value,
          );
        }
        break;
      case "showWarning":
        if (typeof message.message === "string" && message.message.trim()) {
          void vscode.window.showWarningMessage(message.message);
        }
        break;
      case "matchAnnotationPairs":
        this.matchAnnotationPairs();
        break;
      case "setAnnotationNumber":
        if (typeof message.id === "string" && typeof message.annotationNumber === "string") {
          this.setAnnotationNumber(message.id, message.annotationNumber);
        }
        break;
      case "locateRow":
        if (typeof message.id === "string") await this.locateRow(message.id);
        break;
      case "downloadImages":
        await this.downloadImages();
        break;
      case "exportByCalibration":
        await this.exportCalibratedChapter();
        break;
      case "exportCalibrationToTrans":
        await this.exportCalibratedChapterToTrans();
        break;
      case "saveAnnotations":
        await this.saveSidecar();
        break;
      case "reloadAnnotations":
        await this.reloadSidecar({ reindex: true });
        break;
    }
  }

  private async refreshFiles() {
    const workspace = vscode.workspace.workspaceFolders?.[0];
    if (!workspace) {
      this.files = [];
      this.directoryProvider.refresh();
      this.update();
      return;
    }
    await this.migrateLegacyTransDirectories(workspace);
    this.files = await this.syncChapterChangeMarkers(workspace, await this.discoverWorkspaceFiles(workspace));
    this.directoryProvider.refresh();
    this.chapterDecorations.refresh();
    this.update();
  }

  private async migrateLegacyTransDirectories(workspace: vscode.WorkspaceFolder) {
    const legacyRootPath = path.join(workspace.uri.fsPath, TRANS_OUTPUT_DIRECTORY);
    if (!(await this.storage.exists(legacyRootPath))) return;
    let entries;
    try {
      entries = await this.storage.readDirectory(legacyRootPath);
    } catch (error) {
      this.output.appendLine(`[trans] 读取旧 trans 目录失败：${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    for (const entry of entries) {
      if (entry.type !== "directory") continue;
      const sourcePath = path.join(legacyRootPath, entry.name);
      const chapterDirectoryPathValue = chapterDirectoryPath(workspace.uri.fsPath, entry.name);
      const targetPath = path.join(chapterDirectoryPathValue, TRANS_OUTPUT_DIRECTORY);
      if (!(await this.storage.exists(chapterDirectoryPathValue))) {
        this.output.appendLine(`[trans] 跳过旧目录 ${sourcePath}：找不到对应章节目录。`);
        continue;
      }
      if (await this.storage.exists(targetPath)) {
        this.output.appendLine(`[trans] 跳过旧目录 ${sourcePath}：目标已存在 ${targetPath}。`);
        continue;
      }
      try {
        await this.storage.rename(sourcePath, targetPath, { overwrite: false });
        this.output.appendLine(`[trans] 已迁移 ${sourcePath} -> ${targetPath}`);
      } catch (error) {
        this.output.appendLine(`[trans] 迁移失败 ${sourcePath}：${error instanceof Error ? error.message : String(error)}`);
      }
    }
    try {
      const remaining = await this.storage.readDirectory(legacyRootPath);
      if (!remaining.length) await this.storage.delete(legacyRootPath);
    } catch {
      // Keep the legacy root when it still has entries or cannot be removed safely.
    }
  }

  private async pickWorkspaceFolder() {
    const picked = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false });
    if (!picked?.[0]) return;
    await vscode.commands.executeCommand("vscode.openFolder", picked[0]);
  }

  private async selectFile(filePath: string, requestedModule?: Exclude<ModuleName, "章节定界" | "文本块">) {
    this.viewMode = "table";
    const uri = vscode.Uri.file(filePath);
    const workspace = vscode.workspace.getWorkspaceFolder(uri) ?? vscode.workspace.workspaceFolders?.[0];
    const text = await readText(this.storage, filePath);
    this.selectedFile = this.files.find((file) => file.path === filePath) ?? {
      label: workspace ? path.relative(workspace.uri.fsPath, filePath) || path.basename(filePath) : path.basename(filePath),
      path: filePath,
      kind: markdownFileKind(text),
    };
    this.chapterWorkingUri = undefined;
    let editorUri = uri;
    this.selectedFileText = text;
    if (workspace && isChapterOutputPath(workspace.uri.fsPath, filePath)) {
      const ensured = await this.ensureChapterWorkingCopy(workspace, this.selectedFile, text);
      this.chapterWorkingUri = ensured.workingUri;
      this.selectedFileText = ensured.workingText;
      editorUri = ensured.workingUri;
    }
    for (const moduleName of ["章节标题", "注释", "嵌入块", "非法断行"] as const) {
      this.modulePreviewPaths.set(moduleName, editorUri.fsPath);
    }
    this.rows = [];
    this.annotationPairs = [];
    await this.reloadSidecar({ silent: true, reindex: false });
    if (requestedModule === "章节标题" || (!requestedModule && this.selectedFile.kind === "chapter")) {
      this.activeModule = "章节标题";
      if (!this.chapterWorkingUri && workspace) {
        const ensured = await this.ensureChapterWorkingCopy(workspace, this.selectedFile, text);
        this.chapterWorkingUri = ensured.workingUri;
        this.selectedFileText = ensured.workingText;
        editorUri = ensured.workingUri;
      }
      this.chapterWorkingUri = this.chapterWorkingUri ?? editorUri;
      await this.reindexChapterWorkingCopy(this.selectedFileText);
    } else if (requestedModule === "非法断行") {
      this.activeModule = requestedModule;
      this.refreshIllegalLineBreakRows(this.selectedFileText, editorUri.fsPath);
    } else if (requestedModule === "注释" || requestedModule === "嵌入块") {
      this.activeModule = requestedModule;
      await this.reindexChapterWorkingCopy(this.selectedFileText);
    } else if (this.activeModule === "注释" || this.activeModule === "嵌入块" || this.activeModule === "章节标题") {
      await this.reindexChapterWorkingCopy(this.selectedFileText);
    }
    await this.showDocumentPair(editorUri, { preserveFocus: true });
    this.directoryProvider.refresh();
    this.update();
  }

  private async openTransChapterDirectory(directoryPath: string, moduleName: "文本块" | "分句" | "翻译" = "文本块") {
    this.viewMode = "table";
    const directory = vscode.Uri.file(directoryPath);
    const workspace = vscode.workspace.getWorkspaceFolder(directory) ?? vscode.workspace.workspaceFolders?.[0];
    if (!workspace) return;
    const chapterName = path.basename(path.dirname(directoryPath));
    const preferred = vscode.Uri.joinPath(directory, `${chapterName}.md`);
    let chapterUri: vscode.Uri | undefined;
    if (await this.storage.exists(preferred.fsPath)) {
      chapterUri = preferred;
    } else {
      try {
        const entries = await this.storage.readDirectory(directoryPath);
        const markdown = entries
          .filter((entry) => entry.type === "file" && /\.md$/i.test(entry.name))
          .map((entry) => entry.name)
          .sort((left, right) => left.localeCompare(right, "zh-CN", { numeric: true }));
        if (markdown[0]) chapterUri = vscode.Uri.joinPath(directory, markdown[0]);
      } catch {
        chapterUri = undefined;
      }
    }
    if (!chapterUri) {
      void vscode.window.showWarningMessage(`trans 章节目录中没有 Markdown 文件：${chapterName}`);
      return;
    }
    const text = await readText(this.storage, chapterUri.fsPath);
    this.selectedFile = {
      label: path.relative(workspace.uri.fsPath, chapterUri.fsPath) || path.basename(chapterUri.fsPath),
      path: chapterUri.fsPath,
      kind: "trans",
    };
    this.selectedFileText = text;
    this.chapterWorkingUri = undefined;
    this.annotationWorkingUri = undefined;
    this.annotationPairs = [];
    if (moduleName === "翻译") {
      const units = scanTranslationUnits(text, chapterUri.fsPath);
      const { state } = await this.readValidatedTranslationState(chapterUri, units);
      this.rows = translationRows(units, state, this.translationService);
      const progress = translationProgress(units, state, "idle", undefined, this.translationService);
      this.translationProgress = {
        ...progress,
        phase: progress.total > 0 && progress.completed === progress.total ? "complete" : "idle",
      };
    } else {
      this.rows = moduleName === "分句" ? scanSentences(text, chapterUri.fsPath) : scanTextBlocks(text, chapterUri.fsPath);
    }
    this.activeModule = moduleName;
    this.modulePreviewPaths.set(moduleName, chapterUri.fsPath);
    await this.showDocumentPair(chapterUri, { preserveFocus: true });
    this.directoryProvider.refresh();
    this.update();
  }

  private async openTranslationService() {
    this.viewMode = "translationService";
    await this.refreshTranslationSecretFlags();
    this.translationTest = { phase: "idle", message: "尚未测试。" };
    this.directoryProvider.refresh();
    this.update();
  }

  private async loadTranslationSecretState() {
    await this.refreshTranslationSecretFlags();
    this.update();
  }

  private async refreshTranslationSecretFlags() {
    this.translationApiKeyConfigured = {
      deepl: Boolean(await this.context.secrets.get(DEEPL_API_KEY_SECRET)),
      openai: Boolean(await this.context.secrets.get(OPENAI_API_KEY_SECRET)),
    };
  }

  private async selectTranslationService(service: TranslationServiceId) {
    if (this.translationRunning) return;
    this.translationService = service;
    await this.context.globalState.update(TRANSLATION_SERVICE_SETTING, service);
    if (this.activeModule === "翻译" && this.selectedFile?.kind === "trans") {
      const units = scanTranslationUnits(this.selectedFileText, this.selectedFile.path);
      const { state } = await this.readValidatedTranslationState(vscode.Uri.file(this.selectedFile.path), units, [service]);
      this.rows = translationRows(units, state, service);
      const progress = translationProgress(units, state, "idle", undefined, service);
      this.translationProgress = { ...progress, phase: progress.total > 0 && progress.completed === progress.total ? "complete" : "idle" };
    }
    this.update();
  }

  private async saveTranslationSettings(message: UiCommandMessage) {
    const service = isTranslationServiceId(message.service) ? message.service : this.translationService;
    const sampleText = typeof message.sampleText === "string" && message.sampleText.trim()
      ? message.sampleText
      : this.translationSampleText;
    this.translationService = service;
    this.translationSampleText = sampleText;
    if (service === "openai") {
      if (typeof message.model === "string" && message.model.trim()) this.openAIModel = message.model.trim();
      if (typeof message.prompt === "string" && message.prompt.trim()) this.openAIPrompt = message.prompt.trim();
      await this.context.globalState.update(OPENAI_MODEL_SETTING, this.openAIModel);
      await this.context.globalState.update(OPENAI_PROMPT_SETTING, this.openAIPrompt);
    }
    await this.context.globalState.update(TRANSLATION_SERVICE_SETTING, service);
    await this.context.globalState.update(TRANSLATION_SAMPLE_SETTING, sampleText);
    const enteredKey = typeof message.apiKey === "string" ? message.apiKey.trim() : "";
    if (enteredKey) await this.context.secrets.store(translationSecretKey(service), enteredKey);
    await this.refreshTranslationSecretFlags();
    this.translationTest = { phase: "idle", message: "设置已保存。" };
    this.update();
  }

  private async testTranslationService(message: UiCommandMessage) {
    const service = isTranslationServiceId(message.service) ? message.service : this.translationService;
    this.translationService = service;
    if (typeof message.sampleText === "string" && message.sampleText.trim()) this.translationSampleText = message.sampleText;
    if (service === "openai") {
      if (typeof message.model === "string" && message.model.trim()) this.openAIModel = message.model.trim();
      if (typeof message.prompt === "string" && message.prompt.trim()) this.openAIPrompt = message.prompt.trim();
      await this.context.globalState.update(OPENAI_MODEL_SETTING, this.openAIModel);
      await this.context.globalState.update(OPENAI_PROMPT_SETTING, this.openAIPrompt);
    }
    await this.context.globalState.update(TRANSLATION_SERVICE_SETTING, service);
    await this.context.globalState.update(TRANSLATION_SAMPLE_SETTING, this.translationSampleText);

    const enteredKey = typeof message.apiKey === "string" ? message.apiKey.trim() : "";
    if (enteredKey) await this.context.secrets.store(translationSecretKey(service), enteredKey);
    const apiKey = enteredKey || await this.context.secrets.get(translationSecretKey(service)) || "";
    if (!apiKey) {
      this.translationApiKeyConfigured[service] = false;
      this.translationTest = { phase: "error", message: `请先填写 ${translationServiceLabel(service)} API Key。` };
      this.update();
      return;
    }

    this.translationTest = { phase: "testing", message: `正在请求 ${translationServiceLabel(service)}…` };
    this.update();
    const result = service === "deepl"
      ? await testDeepL(apiKey, this.translationSampleText)
      : await testOpenAI(apiKey, this.translationSampleText, this.openAIModel, this.openAIPrompt);
    this.translationApiKeyConfigured[service] = true;
    this.translationTest = {
      phase: result.ok ? "success" : "error",
      message: result.message,
      statusCode: result.statusCode,
      translatedText: result.translatedText,
      rawResponse: result.rawResponse,
    };
    this.update();
  }

  private async translateCurrentChapter() {
    if (this.translationRunning) return;
    if (this.activeModule !== "翻译" || this.selectedFile?.kind !== "trans") {
      void vscode.window.showWarningMessage("请先打开 trans 章节的“翻译”模块。");
      return;
    }
    const serviceId = this.translationService;
    const apiKey = await this.context.secrets.get(translationSecretKey(serviceId)) || "";
    if (!apiKey) {
      void vscode.window.showWarningMessage(`尚未设置 ${translationServiceLabel(serviceId)} API Key，请先打开“翻译服务”。`);
      return;
    }

    const chapterPath = this.selectedFile.path;
    const chapterUri = vscode.Uri.file(chapterPath);
    const sourceText = this.selectedFileText;
    const units = scanTranslationUnits(sourceText, chapterPath);
    const blocks = scanTextBlocks(sourceText, chapterPath);
    const blockById = new Map(blocks.map((block) => [block.id, block]));
    const { state } = await this.readValidatedTranslationState(chapterUri, units, [serviceId]);
    const model = serviceId === "openai" ? this.openAIModel : undefined;

    this.translationRunning = true;
    this.translationProgress = translationProgress(units, state, "running", undefined, serviceId);
    this.rows = translationRows(units, state, serviceId);
    this.update();

    try {
      for (const unit of units) {
        if (isTranslationUnitTranslated(unit, state, serviceId)) continue;
        const blockLabel = unit.parentBlockIndex == null ? "" : `B${String(unit.parentBlockIndex).padStart(3, "0")}`;
        const unitPrefix = unit.translationUnitKind === "composite" ? "C" : "S";
        const unitLabel = unit.sentenceIndex == null ? "" : `${unitPrefix}${String(unit.sentenceIndex).padStart(3, "0")}`;
        const current = [blockLabel, unitLabel].filter(Boolean).join("-");
        this.translationProgress = translationProgress(units, state, "running", current, serviceId);
        this.updateTranslationUi(chapterPath, units, state);

        const protectedUnit = protectMarkdownForTranslation(unit.raw);
        const parentBlock = unit.parentBlockId ? blockById.get(unit.parentBlockId) : undefined;
        const contextText = parentBlock?.raw ?? unit.raw;
        const protectedContext = protectMarkdownForTranslation(contextText).text;
        const result = serviceId === "deepl"
          ? await translateDeepL(apiKey, protectedUnit.text, protectedContext)
          : await translateOpenAI(apiKey, protectedUnit.text, protectedContext, this.openAIModel, this.openAIPrompt);

        if (result.ok && result.translatedText) {
          const missing = missingProtectedMarkdownTokens(result.translatedText, protectedUnit.replacements);
          if (missing.length) {
            recordTranslationError(state, unit, `翻译结果缺少 Markdown 保护占位符：${missing.join(", ")}`, undefined, serviceId, model);
          } else {
            const restored = restoreProtectedMarkdown(result.translatedText, protectedUnit.replacements);
            const structureIssue = markdownStructureIssue(unit.raw, restored);
            if (structureIssue) {
              recordTranslationError(state, unit, `翻译结果 Markdown 结构异常：${structureIssue}`, undefined, serviceId, model);
            } else {
              recordTranslation(state, unit, restored, undefined, serviceId, model);
            }
          }
        } else {
          recordTranslationError(state, unit, result.message, undefined, serviceId, model);
        }

        await this.writeTranslationState(chapterUri, state);
        this.updateTranslationUi(chapterPath, units, state);
        if (result.statusCode && [401, 403, 429, 456].includes(result.statusCode)) {
          this.output.appendLine(`[translation] ${translationServiceLabel(serviceId)} HTTP ${result.statusCode}; 已停止本轮翻译，可修正后继续。`);
          break;
        }
      }
    } finally {
      this.translationRunning = false;
      const progress = translationProgress(units, state, "idle", undefined, serviceId);
      this.translationProgress = { ...progress, phase: progress.total > 0 && progress.completed === progress.total ? "complete" : "idle" };
      this.updateTranslationUi(chapterPath, units, state);
    }
  }

  private async exportCurrentChapterCrossTranslation(requestedService?: string) {
    const serviceId = isTranslationServiceId(requestedService) ? requestedService : this.translationExportService;
    this.translationExportService = serviceId;
    await this.context.globalState.update(TRANSLATION_EXPORT_SERVICE_SETTING, serviceId);
    if (this.translationRunning) {
      void vscode.window.showWarningMessage("翻译进行中，请等待当前翻译结束后再导出。");
      return;
    }
    if (this.activeModule !== "翻译" || this.selectedFile?.kind !== "trans") {
      void vscode.window.showWarningMessage("请先打开章节 trans 下的“翻译”模块。");
      return;
    }
    const workspace = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(this.selectedFile.path))
      ?? vscode.workspace.workspaceFolders?.[0];
    if (!workspace) throw new Error("当前没有打开工作目录。");

    const outputDirectory = vscode.Uri.file(path.dirname(this.selectedFile.path));
    const outputRelativePath = normalizeVaultRelativePath(
      path.relative(workspace.uri.fsPath, outputDirectory.fsPath).replace(/\\/g, "/") || ".",
    );
    const chapterUri = vscode.Uri.file(this.selectedFile.path);
    const units = scanTranslationUnits(this.selectedFileText, this.selectedFile.path);
    const { state, invalidated } = await this.readValidatedTranslationState(chapterUri, units, [serviceId]);
    if (invalidated) {
      this.rows = translationRows(units, state, this.translationService);
      const progress = translationProgress(units, state, "idle", undefined, this.translationService);
      this.translationProgress = { ...progress, phase: "idle" };
      this.update();
      void vscode.window.showWarningMessage(
        `检测到 ${invalidated} 个 ${translationServiceLabel(serviceId)} 译文 Markdown 结构异常，已标记为失败。请修复后再导出。`,
      );
      return;
    }
    const result = exportCrossTranslation({
      sourceMarkdown: this.selectedFileText,
      sourcePath: this.selectedFile.path,
      chapterFileName: path.basename(this.selectedFile.path),
      outputVaultRelativePath: outputRelativePath,
      translationState: state,
      translationServiceId: serviceId,
    });

    await this.storage.createDirectory(outputDirectory.fsPath);
    const transactionId = randomUUID();
    const outputs = [
      { fileName: result.orgFileName, markdown: result.orgMarkdown },
      { fileName: result.transFileName, markdown: result.transMarkdown },
      { fileName: result.pureTransFileName, markdown: result.pureTransMarkdown },
    ].map((output) => ({
      ...output,
      target: vscode.Uri.joinPath(outputDirectory, output.fileName),
      temp: vscode.Uri.joinPath(outputDirectory, `.${output.fileName}.${transactionId}.tmp`),
      backup: vscode.Uri.joinPath(outputDirectory, `.${output.fileName}.${transactionId}.bak`),
      backedUp: false,
      committed: false,
    }));

    let committedAll = false;
    try {
      for (const output of outputs) {
        await writeText(this.storage, output.temp.fsPath, output.markdown);
      }
      for (const output of outputs) {
        if (!(await this.storage.exists(output.target.fsPath))) continue;
        await this.storage.rename(output.target.fsPath, output.backup.fsPath, { overwrite: false });
        output.backedUp = true;
      }
      for (const output of outputs) {
        await this.storage.rename(output.temp.fsPath, output.target.fsPath, { overwrite: false });
        output.committed = true;
      }
      committedAll = true;
    } catch (error) {
      for (const output of outputs) {
        if (output.committed) await deleteStoredIfExists(this.storage, output.target.fsPath);
      }
      for (const output of outputs) {
        if (output.backedUp && await this.storage.exists(output.backup.fsPath)) {
          await this.storage.rename(output.backup.fsPath, output.target.fsPath, { overwrite: true });
        }
      }
      throw error;
    } finally {
      for (const output of outputs) await deleteStoredIfExists(this.storage, output.temp.fsPath);
    }
    if (committedAll) {
      // Backup cleanup is deliberately outside the commit/rollback block. If
      // cleanup fails, keeping a .bak is safer than rolling back valid output.
      for (const output of outputs) {
        if (output.backedUp) await deleteStoredIfExists(this.storage, output.backup.fsPath);
      }
    }
    void vscode.window.showInformationMessage(
      `互译与纯译文已导出：${result.orgFileName} / ${result.transFileName} / ${result.pureTransFileName}`,
    );
  }

  private updateTranslationUi(chapterPath: string, units: Candidate[], state: TranslationStateFile) {
    if (this.activeModule !== "翻译" || this.selectedFile?.path !== chapterPath) return;
    this.rows = translationRows(units, state, this.translationService);
    if (this.translationRunning) {
      this.translationProgress = translationProgress(units, state, "running", this.translationProgress.current, this.translationService);
    }
    this.update();
  }

  private async readTranslationState(chapterUri: vscode.Uri): Promise<TranslationStateFile> {
    const statePath = path.join(path.dirname(chapterUri.fsPath), TRANSLATION_STATE_FILE);
    try {
      const raw = await readText(this.storage, statePath);
      return parseTranslationState(raw, chapterUri.fsPath);
    } catch {
      return emptyTranslationState(chapterUri.fsPath);
    }
  }

  private async writeTranslationState(chapterUri: vscode.Uri, state: TranslationStateFile) {
    const directoryPath = path.dirname(chapterUri.fsPath);
    const statePath = path.join(directoryPath, TRANSLATION_STATE_FILE);
    const tempPath = path.join(directoryPath, `${TRANSLATION_STATE_FILE}.tmp`);
    await writeText(this.storage, tempPath, serializeTranslationState(state));
    await this.storage.rename(tempPath, statePath, { overwrite: true });
  }

  private async readValidatedTranslationState(
    chapterUri: vscode.Uri,
    units: readonly Candidate[],
    serviceIds: readonly TranslationServiceId[] = ["deepl", "openai"],
  ): Promise<{ state: TranslationStateFile; invalidated: number }> {
    const state = await this.readTranslationState(chapterUri);
    const fingerprintUpdates = backfillTranslationFingerprints(units, state);
    let invalidated = 0;
    for (const unit of units) {
      for (const serviceId of serviceIds) {
        const result = translationResultForUnit(unit, state, serviceId);
        if (result?.status !== "translated" || !result.translatedText) continue;
        const issue = markdownStructureIssue(unit.raw, result.translatedText);
        if (!issue) continue;
        recordTranslationError(state, unit, `译文 Markdown 结构校验失败：${issue}`, undefined, serviceId, result.model);
        invalidated += 1;
      }
    }
    if (invalidated || fingerprintUpdates) await this.writeTranslationState(chapterUri, state);
    if (fingerprintUpdates) {
      this.output.appendLine(`[translation] 已为 ${fingerprintUpdates} 项旧翻译补充稳定内容/上下文指纹，无需重翻。`);
    }
    if (invalidated) {
      this.output.appendLine(`[translation] 检测到 ${invalidated} 个旧译文 Markdown 结构异常，已按服务分别标记为失败。`);
    }
    return { state, invalidated };
  }

  private async activateModule(moduleName: ModuleName) {
    this.viewMode = "table";
    this.activeModule = moduleName;
    if (moduleName === "章节定界") {
      const workspace = vscode.workspace.workspaceFolders?.[0];
      const working = workspace ? vscode.Uri.joinPath(workspace.uri, ".ocr2md-merged.working.md") : undefined;
      if (working && await this.storage.exists(working.fsPath)) {
        this.chapterBoundaryWorkingUri = working;
        await this.refreshChapterBoundaryRows();
      }
    } else if (moduleName === "章节标题") {
      if (this.selectedFile) await this.openChapterWorkingCopy({ silent: true });
    } else if (moduleName === "非法断行") {
      if (this.selectedFile?.kind === "chapter") {
        const workingPath = this.chapterWorkingUri?.fsPath ?? this.selectedFile.path;
        const text = this.chapterWorkingUri ? await this.readWorkingText(this.chapterWorkingUri) : this.selectedFileText;
        this.selectedFileText = text;
        this.refreshIllegalLineBreakRows(text, workingPath);
      }
    } else if (moduleName === "文本块" || moduleName === "分句" || moduleName === "翻译") {
      if (this.selectedFile?.kind === "trans") {
        if (moduleName === "翻译") {
          const units = scanTranslationUnits(this.selectedFileText, this.selectedFile.path);
          const { state } = await this.readValidatedTranslationState(vscode.Uri.file(this.selectedFile.path), units);
          this.rows = translationRows(units, state, this.translationService);
          const progress = translationProgress(units, state, "idle", undefined, this.translationService);
          this.translationProgress = {
            ...progress,
            phase: progress.total > 0 && progress.completed === progress.total ? "complete" : "idle",
          };
        } else {
          this.rows = moduleName === "分句"
            ? scanSentences(this.selectedFileText, this.selectedFile.path)
            : scanTextBlocks(this.selectedFileText, this.selectedFile.path);
        }
        this.modulePreviewPaths.set(moduleName, this.selectedFile.path);
      }
    } else if (this.selectedFile) {
      await this.reindexChapterWorkingCopy(this.selectedFileText);
    }
    this.directoryProvider.refresh();
    this.update();
  }

  private async handleSavedDocument(document: vscode.TextDocument) {
    if (document.uri.fsPath === this.chapterBoundaryWorkingUri?.fsPath) {
      this.selectedFileText = document.getText();
      await this.refreshChapterBoundaryRows();
      return;
    }
    if (document.uri.fsPath === this.chapterWorkingUri?.fsPath) {
      await this.syncTableToWorkingCopy(document.uri, document.getText(), { writeMarker: true });
      return;
    }
    if (document.uri.fsPath === this.annotationWorkingUri?.fsPath) {
      await this.scanModuleText("注释", document.getText(), document.uri.fsPath, this.selectedFile?.path);
      return;
    }
    if (document.uri.fsPath === this.selectedFile?.path) {
      if (this.chapterWorkingUri && this.chapterWorkingUri.fsPath !== document.uri.fsPath) return;
      this.selectedFileText = document.getText();
      if ((this.activeModule === "文本块" || this.activeModule === "分句" || this.activeModule === "翻译") && this.selectedFile.kind === "trans") {
        if (this.activeModule === "翻译") {
          const units = scanTranslationUnits(this.selectedFileText, this.selectedFile.path);
          const { state } = await this.readValidatedTranslationState(vscode.Uri.file(this.selectedFile.path), units);
          this.rows = translationRows(units, state, this.translationService);
          const progress = translationProgress(units, state, "idle", undefined, this.translationService);
          this.translationProgress = {
            ...progress,
            phase: progress.total > 0 && progress.completed === progress.total ? "complete" : "idle",
          };
        } else {
          this.rows = this.activeModule === "分句"
            ? scanSentences(this.selectedFileText, this.selectedFile.path)
            : scanTextBlocks(this.selectedFileText, this.selectedFile.path);
        }
        this.update();
      } else if (this.activeModule === "注释" || this.activeModule === "嵌入块") {
        await this.scanCurrentModule(this.activeModule);
      }
    }
  }

  private async scanCurrentModule(moduleName: "注释" | "嵌入块", options: { silent?: boolean } = {}) {
    if (!this.selectedFile) return;
    const workingPath = this.chapterWorkingUri?.fsPath ?? this.selectedFile.path;
    const text = this.chapterWorkingUri
      ? await this.readWorkingText(this.chapterWorkingUri)
      : this.selectedFileText;
    this.selectedFileText = text;
    await this.scanModuleText(moduleName, text, workingPath, this.selectedFile.path, { silent: true });
    this.rows = await this.applyWorkingCopyDiff(this.rows, text);
    if (!options.silent) this.update();
  }

  private async scanModuleText(
    moduleName: "注释" | "嵌入块",
    text: string,
    workingPath: string,
    sourcePath?: string,
    options: { silent?: boolean } = {},
  ) {
    this.modulePreviewPaths.set(moduleName, workingPath);
    const source = sourcePath ?? workingPath;
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const sourceLabel = workspaceRoot ? path.relative(workspaceRoot, source) : path.basename(source);
    const patterns = splitPatterns(this.moduleRegexPatterns[moduleName] ?? "");

    if (moduleName === "注释") {
      const application = new ChapterReviewApplication({ rows: this.rows, annotationPairs: this.annotationPairs });
      const result = application.refreshAnnotation({
        baselineText: await this.readChapterOriginalText(),
        workingText: text,
        sourcePath: source,
        workingPath,
        sourceLabel,
        patterns,
      });
      this.rows = result.rows;
      this.annotationPairs = result.annotationPairs;
      if (!options.silent) this.update();
      return;
    }

    const application = new ChapterReviewApplication({ rows: this.rows, annotationPairs: this.annotationPairs });
    const result = application.refreshEmbed({
      baselineText: await this.readChapterOriginalText(),
      workingText: text,
      sourcePath: source,
      workingPath,
      sourceLabel,
      patterns,
    });
    this.rows = result.rows;
    this.annotationPairs = result.annotationPairs;
    if (!options.silent) this.update();
  }

  private async applyWorkingCopyDiff(rows: Candidate[], current: string): Promise<Candidate[]> {
    const baseline = await this.readChapterOriginalText();
    if (baseline === undefined) return rows;
    const workingPath = this.chapterWorkingUri?.fsPath ?? "";
    const originalPath = this.selectedFile?.path;
    const changes = scanChapterBoundaryLines(chapterDiffBaseline(baseline, current), current);
    return rows.map((row) =>
      rowBelongsToChapter(row, originalPath, workingPath) ? applyChangeState(row, changes) : row);
  }

  private async readWorkingText(uri: vscode.Uri, override?: string): Promise<string> {
    if (override !== undefined) return override;
    const open = vscode.workspace.textDocuments.find((document) => document.uri.fsPath === uri.fsPath);
    if (open) return open.getText();
    if (!(await this.storage.exists(uri.fsPath))) return "";
    return readText(this.storage, uri.fsPath);
  }

  private async readChapterOriginalText(): Promise<string | undefined> {
    const originalPath = this.selectedFile?.path;
    const workspace = vscode.workspace.workspaceFolders?.[0];
    if (!workspace || !originalPath || !isChapterOutputPath(workspace.uri.fsPath, originalPath)) return undefined;
    if (!(await this.storage.exists(originalPath))) return undefined;
    return readText(this.storage, originalPath);
  }

  private isWorkingCopyEditorActive(): boolean {
    return Boolean(this.chapterWorkingUri && vscode.window.activeTextEditor?.document.uri.fsPath === this.chapterWorkingUri.fsPath);
  }

  private shouldDeferWorkingCopyUi(): boolean {
    return this.isWorkingCopyEditorActive();
  }

  private scheduleWorkingCopyReindex(document: vscode.TextDocument) {
    if (this.workingCopyPaintTimer) clearTimeout(this.workingCopyPaintTimer);
    this.workingCopyPaintTimer = setTimeout(() => {
      this.workingCopyPaintTimer = undefined;
      if (this.shouldDeferWorkingCopyUi()) {
        this.pendingWorkingCopyRescan = true;
        return;
      }
      void this.syncTableToWorkingCopy(document.uri, document.getText(), { writeMarker: false });
    }, 300);
  }

  private refreshIllegalLineBreakRows(text: string, workingPath: string) {
    const sourcePath = this.selectedFile?.path ?? workingPath;
    const application = new ChapterReviewApplication({ rows: this.rows, annotationPairs: this.annotationPairs });
    const result = application.refreshIllegalLineBreak({
      workingText: text,
      sourcePath,
      workingPath,
    });
    this.rows = result.rows;
    this.annotationPairs = result.annotationPairs;
    this.modulePreviewPaths.set("非法断行", workingPath);
  }

  private async reindexChapterWorkingCopy(text: string, options: { writeMarker?: boolean; silent?: boolean } = {}) {
    const uri = this.chapterWorkingUri;
    if (!uri) {
      if (this.activeModule === "注释" || this.activeModule === "嵌入块") {
        await this.scanCurrentModule(this.activeModule, { silent: options.silent });
      }
      return;
    }
    await this.syncTableToWorkingCopy(uri, text, { writeMarker: options.writeMarker, silent: options.silent });
  }

  private async syncTableToWorkingCopy(
    uri: vscode.Uri,
    current: string,
    options: { writeMarker?: boolean; silent?: boolean } = {},
  ) {
    if (this.workingCopyPaintTimer) {
      clearTimeout(this.workingCopyPaintTimer);
      this.workingCopyPaintTimer = undefined;
    }
    this.selectedFileText = current;
    await this.refreshChapterTitleRows(uri, {
      writeMarker: Boolean(options.writeMarker),
      currentText: current,
      silent: true,
    });
    await this.scanModuleText(
      "注释",
      current,
      uri.fsPath,
      this.selectedFile?.path,
      { silent: true },
    );
    this.rows = await this.applyWorkingCopyDiff(this.rows, current);
    this.refreshIllegalLineBreakRows(current, uri.fsPath);
    await this.planLocalImageExportPaths(uri);
    this.pendingWorkingCopyRescan = false;
    if (!options.silent) this.update();
  }

  private async syncWorkingCopyTable(document: vscode.TextDocument) {
    if (document.uri.fsPath !== this.chapterWorkingUri?.fsPath) return;
    if (this.shouldDeferWorkingCopyUi()) {
      this.pendingWorkingCopyRescan = true;
      return;
    }
    this.pendingWorkingCopyRescan = false;
    await this.syncTableToWorkingCopy(document.uri, document.getText(), { writeMarker: false });
  }

  private async setRowsLineType(ids: string[], lineType: string) {
    const selected = new Set(ids);
    const selectedRows = this.rows.filter((row) => selected.has(row.id));
    if (lineType === IGNORED_LINE_TYPE && selectedRows.some((row) => row.typeLabel !== "嵌入块" && row.typeLabel !== "章节定界" && row.typeLabel !== "非法断行")) return;
    const titleRows = selectedRows.filter((row) => row.typeLabel === "章节标题");
    if (lineType !== DELETED_LINE_TYPE && titleRows.length && /^(?:[1-6] 级标题|非标题)$/.test(lineType)) {
      await this.applyHeadingLineType(titleRows, lineType);
    }
    const sourcePath = this.selectedFile?.path;
    const workingPath = this.chapterWorkingUri?.fsPath ?? sourcePath;
    this.rows = applyReviewRowsLineType(this.rows, ids, lineType, this.selectedFileText, { sourcePath, workingPath });
    this.rebuildAnnotationPairs();
    this.update();
  }

  private setChapterFile(ids: string[], value: string) {
    const application = new ChapterReviewApplication({ rows: this.rows, annotationPairs: this.annotationPairs });
    const result = application.setChapterFile(ids, value);
    this.rows = result.rows;
    this.annotationPairs = result.annotationPairs;
    this.update();
  }

  private assignSelectedChapterFiles(ids: string[], mode: string, value: string) {
    const application = new ChapterReviewApplication({ rows: this.rows, annotationPairs: this.annotationPairs });
    const result = application.assignChapterFiles(ids, mode as ChapterAssignMode, value);
    if (!result.ok) {
      void vscode.window.showWarningMessage(result.error);
      return;
    }
    this.rows = result.rows;
    this.annotationPairs = result.annotationPairs;
    this.update();
  }

  private async applyHeadingLineType(rows: Candidate[], lineType: string) {
    const byPath = new Map<string, Candidate[]>();
    for (const row of rows) {
      const target = row.workingCopyPath ?? row.sourcePath;
      if (target) byPath.set(target, [...(byPath.get(target) ?? []), row]);
    }
    for (const [target, targetRows] of byPath) {
      const uri = vscode.Uri.file(target);
      const document = await vscode.workspace.openTextDocument(uri);
      const edit = new vscode.WorkspaceEdit();
      const documentText = document.getText();
      for (const planned of planHeadingLineTypeEdits(documentText, targetRows, lineType)) {
        if (planned.line >= document.lineCount) continue;
        const sourceLine = document.lineAt(planned.line);
        if (planned.replacement !== sourceLine.text) edit.replace(uri, sourceLine.range, planned.replacement);
      }
      await vscode.workspace.applyEdit(edit);
      await document.save();
    }
  }

  private rebuildAnnotationPairs() {
    const application = new ChapterReviewApplication({ rows: this.rows, annotationPairs: this.annotationPairs });
    const next = application.matchAnnotationPairs();
    this.rows = next.rows;
    this.annotationPairs = next.annotationPairs;
  }

  private matchAnnotationPairs() {
    this.rebuildAnnotationPairs();
    this.update();
  }

  private setAnnotationNumber(id: string, value: string) {
    const application = new ChapterReviewApplication({ rows: this.rows, annotationPairs: this.annotationPairs });
    const next = application.setAnnotationNumber(id, value);
    this.rows = next.rows;
    this.annotationPairs = next.annotationPairs;
    this.update();
  }

  private async openAnnotationWorkingCopy() {
    const file = this.selectedFile;
    const workspace = file ? vscode.workspace.getWorkspaceFolder(vscode.Uri.file(file.path)) ?? vscode.workspace.workspaceFolders?.[0] : undefined;
    if (!file || !workspace) {
      void vscode.window.showWarningMessage("请先选择 Markdown 文件。");
      return;
    }
    const application = new ChapterReviewApplication({ rows: this.rows, annotationPairs: this.annotationPairs });
    const corrected = application.annotationWorkingText(this.selectedFileText);
    const workingPath = await this.chapterWorkspace.ensureAnnotationWorkingCopy(file.path, corrected);
    const uri = vscode.Uri.file(workingPath);
    this.annotationWorkingUri = uri;
    this.modulePreviewPaths.set("注释", uri.fsPath);
    await this.showDocumentPair(uri);
  }

  private async addCurrentLine() {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== "markdown") return;
    const moduleName = this.activeModule;
    if (moduleName === "非法断行") {
      await this.markIllegalLineBreakAtCursor();
      return;
    }
    const sourcePath = this.selectedFile?.path ?? editor.document.uri.fsPath;
    const workingPath = this.chapterWorkingUri?.fsPath ?? editor.document.uri.fsPath;
    const hintLine = editor.selection.active.line;
    const lineText = editor.document.lineAt(hintLine).text;
    const documentText = workingPath === editor.document.uri.fsPath
      ? editor.document.getText()
      : await this.readWorkingText(vscode.Uri.file(workingPath));
    const lineNumber = nearestMatchingLine(documentText, lineText, hintLine);
    const existing = findReusableManualRow(this.rows, {
      typeLabel: moduleName,
      raw: lineText,
      line: lineNumber,
      belongs: (row) => rowBelongsToChapter(row, sourcePath, workingPath),
    });
    if (existing) {
      const restoredLineType = existing.lineType === IGNORED_LINE_TYPE
        ? (moduleName === "章节定界" ? "新增" : defaultLineType(moduleName, lineText))
        : existing.lineType;
      this.rows = this.rows.map((row) => row.id === existing.id
        ? {
            ...row,
            lineType: restoredLineType,
            isWorkingCorrection: true,
            chapterBoundaryState: "added" as const,
            range: { ...row.range, line: lineNumber },
          }
        : row);
    } else {
      const manualId = `manual-${randomUUID()}`;
      const extractedNumber = moduleName === "注释" ? extractAnnotationNumber(lineText) : undefined;
      const attached = attachLineIdentity({
        id: manualId,
        kind: "regex",
        label: lineText.trim(),
        raw: lineText,
        preview: lineText,
        range: { line: lineNumber, start: 0, end: lineText.length },
        typeLabel: moduleName,
        lineType: moduleName === "章节定界" ? "新增" : defaultLineType(moduleName, lineText),
        annotationNumber: extractedNumber,
        annotationNumberSource: extractedNumber ? "extracted" : undefined,
        isWorkingCorrection: true,
        chapterBoundaryState: "added",
        workingCopyPath: workingPath,
        sourcePath,
        sourceLabel: path.basename(sourcePath),
        status: "候选",
      }, documentText, { moduleName, sourcePath });
      this.rows = [...this.rows, { ...attached, id: manualId, isWorkingCorrection: true, chapterBoundaryState: "added" as const }].sort(compareRows);
    }
    this.modulePreviewPaths.set(moduleName, workingPath);
    if (moduleName === "嵌入块") {
      const chapterEmbeds = this.rows.filter((row) =>
        row.typeLabel === "嵌入块" && rowBelongsToChapter(row, sourcePath, workingPath));
      const numbered = applyEmbedNumbers(chapterEmbeds, documentText);
      const byId = new Map(numbered.map((row) => [row.id, row]));
      this.rows = this.rows.map((row) => byId.get(row.id) ?? row).sort(compareRows);
    }
    this.rebuildAnnotationPairs();
    // A context-menu add is an explicit calibration action, not a text-edit rescan:
    // surface it in the table immediately, before any asynchronous diff bookkeeping.
    this.update();
    this.rows = await this.applyWorkingCopyDiff(this.rows, documentText);
    this.update();
  }

  private async markIllegalLineBreakAtCursor() {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== "markdown") return;
    if (this.activeModule !== "非法断行") {
      void vscode.window.showWarningMessage("请先进入“非法断行”模块，再在章节工作稿中标记断行。 ");
      return;
    }
    const working = this.chapterWorkingUri;
    if (!working || editor.document.uri.fsPath !== working.fsPath) {
      void vscode.window.showWarningMessage("请在当前章节的 .working.md 源码窗口中标记非法断行。");
      return;
    }

    const text = editor.document.getText();
    const sourcePath = this.selectedFile?.path ?? working.fsPath;
    const application = new ChapterReviewApplication({ rows: this.rows, annotationPairs: this.annotationPairs });
    const result = application.markIllegalLineBreak({
      workingText: text,
      sourcePath,
      workingPath: working.fsPath,
      cursorLine: editor.selection.active.line,
    });
    if (!result) {
      void vscode.window.showWarningMessage("此处无法形成断行边界：请把光标放在断行前正文行或两段之间的空行。");
      return;
    }
    this.rows = result.rows;
    this.annotationPairs = result.annotationPairs;
    this.modulePreviewPaths.set("非法断行", working.fsPath);
    this.update();
  }

  private async locateRow(id: string) {
    if (this.pendingWorkingCopyRescan && this.chapterWorkingUri) {
      const open = vscode.workspace.textDocuments.find((item) => item.uri.fsPath === this.chapterWorkingUri?.fsPath);
      if (open) await this.syncTableToWorkingCopy(open.uri, open.getText(), { writeMarker: false });
    }
    const row = this.rows.find((candidate) => candidate.id === id);
    const target = this.modulePreviewPaths.get(this.activeModule)
      ?? row?.workingCopyPath
      ?? this.chapterWorkingUri?.fsPath
      ?? row?.sourcePath;
    if (!row) return;
    if (!target || !(await this.storage.exists(target))) {
      void vscode.window.showWarningMessage("无法打开源文件。");
      return;
    }
    const editor = await this.showDocumentPair(vscode.Uri.file(target));
    const document = editor.document;
    const current = this.rows.find((candidate) => candidate.id === id) ?? row;
    const located = locateCandidate(document.getText(), current);
    if (!located) {
      void vscode.window.showWarningMessage("无法在当前文档中定位该行。");
      return;
    }
    const startLine = Math.min(located.line, Math.max(0, document.lineCount - 1));
    const endLine = Math.min(located.endLine ?? located.line, Math.max(0, document.lineCount - 1));
    const start = Math.min(located.start, document.lineAt(startLine).text.length);
    const end = Math.min(Math.max(start, located.end), document.lineAt(endLine).text.length);
    const range = new vscode.Range(startLine, start, endLine, end);
    editor.selection = new vscode.Selection(range.start, range.end);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    this.decorateLocatedRow(editor, range);
    this.rows = this.rows.map((candidate) => candidate.id === current.id ? { ...candidate, range: located } : candidate);
    this.update();
  }

  private decorateLocatedRow(editor: vscode.TextEditor, range: vscode.Range) {
    for (const visible of vscode.window.visibleTextEditors) {
      visible.setDecorations(this.locatedRowDecoration, []);
    }
    const textRanges: vscode.Range[] = [];
    for (let line = range.start.line; line <= range.end.line; line += 1) {
      const textLine = editor.document.lineAt(line);
      const start = line === range.start.line ? Math.min(range.start.character, textLine.text.length) : 0;
      const end = line === range.end.line ? Math.min(range.end.character, textLine.text.length) : textLine.text.length;
      textRanges.push(new vscode.Range(line, start, line, Math.max(start, end)));
    }
    editor.setDecorations(this.locatedRowDecoration, textRanges);
  }

  /** Source-window feature shared by every module: visualize every real physical line break. */
  private decorateSourceLineBreaks(editor: vscode.TextEditor) {
    const document = editor.document;
    const hasFinalBreak = /(?:\r\n|\r|\n)$/.test(document.getText());
    const ranges: vscode.Range[] = [];
    for (let line = 0; line < document.lineCount; line += 1) {
      if (line === document.lineCount - 1 && !hasFinalBreak) continue;
      const textLine = document.lineAt(line);
      ranges.push(new vscode.Range(line, textLine.text.length, line, textLine.text.length));
    }
    editor.setDecorations(this.sourceLineBreakDecoration, ranges);
  }

  private async showDocumentPair(uri: vscode.Uri, options: { preserveFocus?: boolean } = {}): Promise<vscode.TextEditor> {
    const document = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(document, {
      preview: false,
      preserveFocus: options.preserveFocus,
    });
    this.applyHeadingDecorations(editor);
    this.decorateSourceLineBreaks(editor);
    return editor;
  }

  private scheduleHeadingDecorations(document: vscode.TextDocument) {
    if (document.languageId !== "markdown") return;
    if (this.headingDecorationTimer) clearTimeout(this.headingDecorationTimer);
    this.headingDecorationTimer = setTimeout(() => {
      for (const editor of vscode.window.visibleTextEditors) {
        if (editor.document.uri.toString() === document.uri.toString()) this.applyHeadingDecorations(editor);
      }
    }, 100);
  }

  private applyHeadingDecorations(editor: vscode.TextEditor) {
    const ranges = HEADING_COLORS.map(() => [] as vscode.Range[]);
    if (editor.document.languageId === "markdown") {
      for (let line = 0; line < editor.document.lineCount; line += 1) {
        const textLine = editor.document.lineAt(line);
        const match = /^ {0,3}(#{1,6})(?:\s+|$)/.exec(textLine.text);
        if (match) ranges[match[1].length - 1].push(textLine.range);
      }
    }
    this.headingDecorations.forEach((decoration, index) => editor.setDecorations(decoration, ranges[index]));
  }

  private async downloadImages() {
    if (this.imageDownloadRunning) return;
    const workspace = vscode.workspace.workspaceFolders?.[0];
    if (!workspace) return;
    const candidates = activeCandidates(this.rows).filter((row) => row.typeLabel === "嵌入块" && !isIgnoredEmbedCandidate(row) && extractImageUrl(row.raw));
    if (!candidates.length) {
      void vscode.window.showWarningMessage("当前嵌入块没有可下载的外部图片。");
      return;
    }
    const originalPath = this.selectedFile?.path ?? workspace.uri.fsPath;
    const directoryPath = this.selectedFile ? chapterImageDirectory(originalPath) : path.join(workspace.uri.fsPath, CHAPTER_IMAGE_DIRECTORY);
    await this.storage.createDirectory(directoryPath);
    this.imageDownloadRunning = true;
    let downloaded = 0;
    let skipped = 0;
    let failed = 0;
    const total = candidates.length;
    try {
      for (const [index, row] of candidates.entries()) {
        const url = extractImageUrl(row.raw);
        const name = url ? safeImageName(url, row.range.line) : "";
        const targetPath = name ? path.join(directoryPath, name) : undefined;
        const existsAlready = targetPath ? await this.storage.exists(targetPath) : false;
        this.imageDownloadProgress = {
          phase: "downloading",
          completed: index,
          total,
          downloaded,
          skipped,
          failed,
          current: `下载中 ${index + 1}/${total}`,
        };
        this.update();
        if (!url || !targetPath) {
          failed += 1;
          this.patchImageRow(row.id, { imageDownloadStatus: "failed", imageDownloadError: "未找到外部图片 URL" });
          await this.saveSidecar({ silent: true });
          continue;
        }
        const localPath = `${CHAPTER_IMAGE_DIRECTORY}/${name}`;
        if (!shouldDownloadImage({ raw: row.raw, localPath, imageDownloadStatus: row.imageDownloadStatus }, existsAlready)) {
          skipped += 1;
          this.patchImageRow(row.id, {
            localPath,
            imageDownloadStatus: "done",
            imageDownloadError: undefined,
          });
          await this.saveSidecar({ silent: true });
          continue;
        }
        try {
          await this.storage.writeFile(targetPath, await download(url));
          downloaded += 1;
          this.patchImageRow(row.id, {
            localPath,
            imageDownloadStatus: "done",
            imageDownloadError: undefined,
          });
        } catch (error) {
          failed += 1;
          this.patchImageRow(row.id, {
            imageDownloadStatus: "failed",
            imageDownloadError: error instanceof Error ? error.message : String(error),
          });
          this.imageDownloadProgress = {
            phase: "downloading",
            completed: index + 1,
            total,
            downloaded,
            skipped,
            failed,
            current: `下载中 ${index + 1}/${total}`,
            lastError: error instanceof Error ? error.message : String(error),
          };
        }
        await this.saveSidecar({ silent: true });
      }
      this.imageDownloadProgress = {
        phase: "complete",
        completed: total,
        total,
        downloaded,
        skipped,
        failed,
        current: `图片下载完成：成功 ${downloaded} · 跳过 ${skipped} · 失败 ${failed}`,
      };
      this.update();
    } finally {
      this.imageDownloadRunning = false;
    }
  }

  private patchImageRow(id: string, patch: Partial<Candidate>) {
    this.rows = this.rows.map((candidate) => candidate.id === id ? { ...candidate, ...patch } : candidate);
  }

  private async planLocalImageExportPaths(working: vscode.Uri) {
    this.rows = await this.chapterWorkspace.planLocalImageExportPaths(this.rows, working.fsPath);
  }

  private async copyLocalImagesForExport(working: vscode.Uri) {
    const file = this.selectedFile;
    if (!file) return;
    this.rows = await this.chapterWorkspace.copyLocalImagesForExport({
      filePath: file.path,
      workingPath: working.fsPath,
      rows: this.rows,
    });
    await this.saveSidecar({ silent: true });
  }

  private async exportCalibratedChapter() {
    const file = this.selectedFile;
    const working = this.chapterWorkingUri;
    if (!file || !working) {
      void vscode.window.showWarningMessage("请先打开章节工作稿。");
      return;
    }
    await this.reindexChapterWorkingCopy(await this.readWorkingText(working), { silent: true });
    try {
      await this.copyLocalImagesForExport(working);
    } catch (error) {
      void vscode.window.showErrorMessage(`本地图片导出失败：${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    const markdown = exportByCalibration(this.selectedFileText, this.rows, { numberHeadings: this.headingNumberingEnabled });
    const outputPath = await this.chapterWorkspace.writeCalibrationOutput(file.path, markdown);
    const outputUri = vscode.Uri.file(outputPath);
    await this.showDocumentPair(outputUri);
    void vscode.window.showInformationMessage(`已按标定导出到 ${outputUri.fsPath}`);
  }

  private async exportCalibratedChapterToTrans() {
    const file = this.selectedFile;
    const working = this.chapterWorkingUri;
    const workspace = file
      ? vscode.workspace.getWorkspaceFolder(vscode.Uri.file(file.path)) ?? vscode.workspace.workspaceFolders?.[0]
      : undefined;
    if (!file || !working || !workspace) {
      void vscode.window.showWarningMessage("请先打开章节工作稿。");
      return;
    }
    await this.reindexChapterWorkingCopy(await this.readWorkingText(working), { silent: true });
    try {
      await this.copyLocalImagesForExport(working);
    } catch (error) {
      void vscode.window.showErrorMessage(`本地图片导出失败：${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    const markdown = withFormatCalibratedFrontmatter(exportByCalibration(this.selectedFileText, this.rows, { numberHeadings: this.headingNumberingEnabled }));
    const outputPath = await this.chapterWorkspace.writeTransOutput(workspace.uri.fsPath, file.path, markdown);
    const outputUri = vscode.Uri.file(outputPath);
    this.directoryProvider.refresh();
    await this.showDocumentPair(outputUri);
    void vscode.window.showInformationMessage(`已导出标定到 trans：${outputUri.fsPath}`);
  }

  private async openChapterWorkingCopy(options: { silent?: boolean } = {}) {
    const file = this.selectedFile;
    const workspace = file ? vscode.workspace.getWorkspaceFolder(vscode.Uri.file(file.path)) ?? vscode.workspace.workspaceFolders?.[0] : undefined;
    if (!file || !workspace) {
      if (!options.silent) void vscode.window.showWarningMessage("请先选择 Markdown 文件。");
      return;
    }
    const originalText = (await this.storage.exists(file.path))
      ? await readText(this.storage, file.path)
      : this.selectedFileText;
    const ensured = await this.ensureChapterWorkingCopy(workspace, file, originalText);
    this.chapterWorkingUri = ensured.workingUri;
    this.selectedFileText = ensured.workingText;
    this.modulePreviewPaths.set("章节标题", ensured.workingUri.fsPath);
    this.modulePreviewPaths.set("注释", ensured.workingUri.fsPath);
    this.modulePreviewPaths.set("嵌入块", ensured.workingUri.fsPath);
    this.activeModule = "章节标题";
    await this.reindexChapterWorkingCopy(ensured.workingText, { silent: options.silent });
    await this.showDocumentPair(ensured.workingUri);
  }

  private async ensureChapterWorkingCopy(
    workspace: vscode.WorkspaceFolder,
    file: FileEntry,
    originalText: string,
  ): Promise<{ workingUri: vscode.Uri; workingText: string }> {
    const ensured = await this.chapterWorkspace.ensureChapterWorkingCopy({
      workspaceRoot: workspace.uri.fsPath,
      filePath: file.path,
      originalText,
    });
    return { workingUri: vscode.Uri.file(ensured.workingPath), workingText: ensured.workingText };
  }

  private async refreshChapterTitleRows(
    uri: vscode.Uri,
    options: { writeMarker?: boolean; currentText?: string; silent?: boolean } = {},
  ) {
    if (!(await this.storage.exists(uri.fsPath)) && options.currentText === undefined) return;
    const workspace = vscode.workspace.getWorkspaceFolder(uri) ?? vscode.workspace.workspaceFolders?.[0];
    const current = await this.readWorkingText(uri, options.currentText);
    const originalPath = this.selectedFile?.path;
    let baseline = current;
    if (workspace && originalPath && isChapterOutputPath(workspace.uri.fsPath, originalPath) && originalPath !== uri.fsPath) {
      if (await this.storage.exists(originalPath)) baseline = await readText(this.storage, originalPath);
    }

    const sourcePath = originalPath ?? uri.fsPath;
    const sourceLabel = workspace ? path.relative(workspace.uri.fsPath, sourcePath) : path.basename(sourcePath);
    const application = new ChapterReviewApplication({ rows: this.rows, annotationPairs: this.annotationPairs });
    const result = application.refreshChapterTitle({
      baselineText: baseline,
      workingText: current,
      sourcePath,
      workingPath: uri.fsPath,
      sourceLabel,
      embedPatterns: splitPatterns(this.moduleRegexPatterns["嵌入块"] ?? ""),
    });
    this.rows = result.rows;
    this.annotationPairs = result.annotationPairs;

    if (options.writeMarker !== false && workspace && originalPath && isChapterOutputPath(workspace.uri.fsPath, originalPath)) {
      await this.writeChapterChangedMarker(originalPath, result.changed);
    }
    if (!options.silent) this.update();
  }

  private async syncChapterChangeMarkers(workspace: vscode.WorkspaceFolder, files: FileEntry[]): Promise<FileEntry[]> {
    return this.chapterWorkspace.syncChapterChangeMarkers(workspace.uri.fsPath, files);
  }

  private async writeChapterChangedMarker(originalPath: string, changed: boolean) {
    await this.chapterWorkspace.writeChapterChangedMarker(originalPath, changed);
    this.files = this.files.map((file) => file.path === originalPath ? { ...file, changed } : file);
    this.directoryProvider.refresh();
    this.chapterDecorations.refresh();
  }

  private async openChapterBoundaryWork() {
    const workspace = vscode.workspace.workspaceFolders?.[0];
    if (!workspace) return;
    const workingUri = vscode.Uri.joinPath(workspace.uri, CHAPTER_BOUNDARY_WORKING_FILE);
    const inputs = await this.readSequenceInputs(workspace, workingUri.fsPath);
    const prepared = await this.chapterWorkspace.ensureChapterBoundaryWork({
      workspaceRoot: workspace.uri.fsPath,
      workingPath: workingUri.fsPath,
      inputs,
      mergedText: mergeSequenceMarkdown(inputs),
    });
    if (!prepared) {
      void vscode.window.showWarningMessage("工作目录根层没有可合并的序列 Markdown 文件。");
      return;
    }
    this.chapterBoundaryWorkingUri = workingUri;
    this.modulePreviewPaths.set("章节定界", workingUri.fsPath);
    this.activeModule = "章节定界";
    this.selectedFile = { label: path.basename(workingUri.fsPath), path: workingUri.fsPath, kind: "working" };
    this.selectedFileText = prepared.workingText;
    await this.reloadSidecar({ silent: true, reindex: false });
    await this.refreshChapterBoundaryRows();
    await this.showDocumentPair(workingUri);
  }

  private async readSequenceInputs(workspace: vscode.WorkspaceFolder, workingPath: string) {
    return this.chapterWorkspace.readSequenceInputs(workspace.uri.fsPath, workingPath);
  }

  private async discoverWorkspaceFiles(workspace: vscode.WorkspaceFolder): Promise<FileEntry[]> {
    return this.chapterWorkspace.discoverWorkspaceFiles(workspace.uri.fsPath);
  }

  private async refreshChapterBoundaryRows() {
    const workspace = vscode.workspace.workspaceFolders?.[0];
    const working = this.chapterBoundaryWorkingUri;
    if (!workspace || !working) return;
    const baselinePath = path.join(workspace.uri.fsPath, ".ocr2md", "chapter-boundary", "baseline.md");
    if (!(await this.storage.exists(baselinePath)) || !(await this.storage.exists(working.fsPath))) return;
    const baseline = await readText(this.storage, baselinePath);
    const current = await readText(this.storage, working.fsPath);
    const application = new ChapterReviewApplication({ rows: this.rows, annotationPairs: this.annotationPairs });
    const result = application.refreshChapterBoundary({
      baselineText: baseline,
      workingText: current,
      workingPath: working.fsPath,
      sourceLabel: path.basename(working.fsPath),
    });
    this.rows = result.rows;
    this.annotationPairs = result.annotationPairs;
    this.selectedFileText = current;
    this.update();
  }

  private async exportChapterBoundaryChapters() {
    const workspace = vscode.workspace.workspaceFolders?.[0];
    const working = this.chapterBoundaryWorkingUri;
    if (!workspace || !working || !(await this.storage.exists(working.fsPath))) {
      void vscode.window.showWarningMessage("请先创建或打开章节定界工作稿。");
      return;
    }
    await this.refreshChapterBoundaryRows();
    const text = await readText(this.storage, working.fsPath);
    const application = new ChapterReviewApplication({ rows: this.rows, annotationPairs: this.annotationPairs });
    const segments = application.chapterBoundarySegments(text);
    if (!segments.length) {
      void vscode.window.showWarningMessage("请先为至少一个一级标题设置章节文件。");
      return;
    }
    await this.chapterWorkspace.writeChapterBoundarySegments({
      workspaceRoot: workspace.uri.fsPath,
      workingPath: working.fsPath,
      workingText: text,
      segments,
    });
    await this.refreshFiles();
    void vscode.window.showInformationMessage(`已导出 ${segments.length} 个章节到 chapters/章节名称/。`);
  }

  private async reloadSidecar(options: { silent?: boolean; reindex?: boolean } = {}) {
    const file = this.selectedFile;
    const workspace = file ? vscode.workspace.getWorkspaceFolder(vscode.Uri.file(file.path)) ?? vscode.workspace.workspaceFolders?.[0] : undefined;
    if (!file || !workspace) return;
    try {
      const loaded = await this.chapterWorkspace.loadSidecar({
        workspaceRoot: workspace.uri.fsPath,
        filePath: file.path,
        workingPath: this.chapterWorkingUri?.fsPath ?? file.path,
      });
      if (!loaded.sidecarPath) return;
      this.rows = loaded.rows;
      this.annotationPairs = loaded.annotationPairs;
      if (options.reindex !== false && this.chapterWorkingUri) {
        await this.reindexChapterWorkingCopy(this.selectedFileText, { silent: true });
      } else {
        this.rebuildAnnotationPairs();
      }
      if (!options.silent) void vscode.window.showInformationMessage(`已恢复 ${this.rows.length} 条标定。`);
      this.update();
    } catch (error) {
      void vscode.window.showErrorMessage(`标定恢复失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async saveSidecar(options: { silent?: boolean } = {}) {
    const file = this.selectedFile;
    if (!file) return;
    await this.chapterWorkspace.saveSidecar({
      filePath: file.path,
      rows: this.rows,
      annotationPairs: this.annotationPairs,
    });
    if (!options.silent) void vscode.window.showInformationMessage(`已保存 ${this.rows.length} 条标定。`);
  }

  private update() {
    this.sidebarProvider.update();
  }
}

class SidebarProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private loaded = false;

  constructor(
    private readonly state: () => SidebarState,
    private readonly onMessage: (message: UiCommandMessage) => Promise<void>,
  ) {}

  resolveWebviewView(view: vscode.WebviewView) {
    this.view = view;
    this.loaded = false;
    view.webview.options = { enableScripts: true };
    view.webview.onDidReceiveMessage((message: UiCommandMessage) => this.onMessage(message));
    this.update();
  }

  update() {
    if (!this.view) return;
    const state = this.state();
    if (this.loaded) {
      void this.view.webview.postMessage({ command: "setState", state });
      return;
    }
    this.view.webview.html = renderSidebar(state);
    this.loaded = true;
  }
}

class ChapterChangeDecorationProvider implements vscode.FileDecorationProvider, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();
  readonly onDidChangeFileDecorations = this.emitter.event;

  constructor(private readonly files: () => FileEntry[]) {}

  refresh() {
    this.emitter.fire(undefined);
  }

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    const file = this.files().find((entry) => entry.path === uri.fsPath);
    if (!file?.changed) return undefined;
    return new vscode.FileDecoration("改", "工作稿相对章节原件已有变动", new vscode.ThemeColor("gitDecoration.modifiedResourceForeground"));
  }

  dispose() {
    this.emitter.dispose();
  }
}

type DirectoryNodeKind = "workspace" | "ocr-group" | "chapters-group" | "translation-service" | "ocr-file" | "chapter-file" | "chapter-module" | "chapter-trans" | "trans-module";

class DirectoryProvider implements vscode.TreeDataProvider<DirectoryItem> {
  private readonly emitter = new vscode.EventEmitter<DirectoryItem | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(
    private readonly workspace: () => vscode.WorkspaceFolder | undefined,
    private readonly files: () => FileEntry[],
    private readonly selectedPath: () => string | undefined,
    private readonly activeModule: () => ModuleName,
    private readonly viewMode: () => "table" | "translationService",
  ) {}

  refresh() {
    this.emitter.fire(undefined);
  }

  getTreeItem(item: DirectoryItem) {
    return item;
  }

  getChildren(item?: DirectoryItem): vscode.ProviderResult<DirectoryItem[]> {
    const workspace = this.workspace();
    if (!workspace) return [];
    if (!item) {
      return [DirectoryItem.workspace(workspace.uri.fsPath)];
    }
    if (item.nodeKind === "workspace") {
      return [
        DirectoryItem.group("ocr", "ocr-group"),
        DirectoryItem.group("chapters", "chapters-group"),
        DirectoryItem.translationService(this.viewMode() === "translationService"),
      ];
    }
    if (item.nodeKind === "ocr-group") {
      return this.files()
        .filter((file) => file.kind === "ocr")
        .map((file) => DirectoryItem.ocrFile(file, file.path === this.selectedPath()));
    }
    if (item.nodeKind === "chapters-group") {
      return this.files()
        .filter((file) => file.kind === "chapter")
        .map((file) => DirectoryItem.chapterFile(file, chapterTreeLabel(workspace.uri.fsPath, file), file.path === this.selectedPath()));
    }
    if (item.nodeKind === "chapter-file" && item.file) {
      const modules = ([
        ["标题", "章节标题"],
        ["注释", "注释"],
        ["嵌入块", "嵌入块"],
        ["非法断行", "非法断行"],
      ] as const).map(([label, moduleName]) => DirectoryItem.chapterModule(
        label,
        moduleName,
        item.file!,
        item.file!.path === this.selectedPath() && moduleName === this.activeModule(),
      ));
      const transDirectoryPath = path.join(path.dirname(item.file.path), TRANS_OUTPUT_DIRECTORY);
      const transSelected = this.viewMode() === "table"
        && Boolean(this.selectedPath())
        && path.dirname(this.selectedPath()!) === transDirectoryPath;
      return [...modules, DirectoryItem.chapterTrans(transDirectoryPath, transSelected)];
    }
    if (item.nodeKind === "chapter-trans" && item.resourceUri) {
      const directoryPath = item.resourceUri.fsPath;
      return (["文本块", "分句", "翻译"] as const).map((moduleName) => DirectoryItem.transModule(
        moduleName,
        directoryPath,
        Boolean(this.selectedPath())
          && path.dirname(this.selectedPath()!) === directoryPath
          && this.activeModule() === moduleName,
      ));
    }
    return [];
  }

}

class DirectoryItem extends vscode.TreeItem {
  transDirectoryPath?: string;
  transModuleName?: "文本块" | "分句" | "翻译";

  private constructor(
    label: string,
    readonly nodeKind: DirectoryNodeKind,
    collapsibleState: vscode.TreeItemCollapsibleState,
    readonly file?: FileEntry,
  ) {
    super(label, collapsibleState);
  }

  static workspace(workspacePath: string) {
    const item = new DirectoryItem(workspacePath, "workspace", vscode.TreeItemCollapsibleState.Expanded);
    item.tooltip = workspacePath;
    item.iconPath = new vscode.ThemeIcon("root-folder");
    return item;
  }

  static group(label: string, nodeKind: "ocr-group" | "chapters-group") {
    const item = new DirectoryItem(label, nodeKind, vscode.TreeItemCollapsibleState.Collapsed);
    item.iconPath = new vscode.ThemeIcon("folder");
    return item;
  }

  static translationService(selected: boolean) {
    const item = new DirectoryItem("翻译服务", "translation-service", vscode.TreeItemCollapsibleState.None);
    item.description = selected ? "当前" : undefined;
    item.tooltip = "设置并测试翻译服务";
    item.command = { command: "ocr2md.openTranslationService", title: "打开翻译服务设置" };
    item.iconPath = new vscode.ThemeIcon("plug");
    return item;
  }

  static chapterTrans(directoryPath: string, selected: boolean) {
    const item = new DirectoryItem("trans", "chapter-trans", vscode.TreeItemCollapsibleState.Collapsed);
    item.transDirectoryPath = directoryPath;
    item.resourceUri = vscode.Uri.file(directoryPath);
    item.description = selected ? "当前" : undefined;
    item.tooltip = `${directoryPath}\n展开查看文本块、分句与翻译`;
    item.iconPath = new vscode.ThemeIcon("folder");
    return item;
  }

  static transModule(moduleName: "文本块" | "分句" | "翻译", directoryPath: string, selected: boolean) {
    const item = new DirectoryItem(moduleName, "trans-module", vscode.TreeItemCollapsibleState.None);
    item.transDirectoryPath = directoryPath;
    item.transModuleName = moduleName;
    item.description = selected ? "当前" : undefined;
    item.tooltip = `${directoryPath} · ${moduleName}`;
    item.command = {
      command: "ocr2md.openTransChapter",
      title: `打开 trans ${moduleName}`,
      arguments: [directoryPath, moduleName],
    };
    item.iconPath = new vscode.ThemeIcon(moduleName === "文本块" ? "symbol-structure" : moduleName === "分句" ? "list-ordered" : "globe");
    return item;
  }

  static ocrFile(file: FileEntry, selected: boolean) {
    const item = new DirectoryItem(file.label, "ocr-file", vscode.TreeItemCollapsibleState.None, file);
    item.description = selected ? "当前" : undefined;
    item.tooltip = file.path;
    item.command = { command: "ocr2md.openMarkdownFile", title: "打开 OCR Markdown", arguments: [file.path] };
    item.iconPath = new vscode.ThemeIcon("markdown");
    return item;
  }

  static chapterFile(file: FileEntry, label: string, selected: boolean) {
    const item = new DirectoryItem(label, "chapter-file", vscode.TreeItemCollapsibleState.Collapsed, file);
    item.resourceUri = vscode.Uri.file(file.path);
    item.description = file.changed
      ? (selected ? "当前章节 · 已变动" : "已变动")
      : (selected ? "当前章节" : undefined);
    item.tooltip = file.changed ? `${file.path}\n工作稿相对章节原件已有变动` : file.path;
    item.iconPath = file.changed
      ? new vscode.ThemeIcon("book", new vscode.ThemeColor("gitDecoration.modifiedResourceForeground"))
      : new vscode.ThemeIcon("book");
    return item;
  }

  static chapterModule(label: string, moduleName: Extract<ModuleName, "章节标题" | "注释" | "嵌入块" | "非法断行">, file: FileEntry, selected: boolean) {
    const item = new DirectoryItem(label, "chapter-module", vscode.TreeItemCollapsibleState.None, file);
    item.description = selected ? "当前" : undefined;
    item.tooltip = `${file.path} · ${label}`;
    item.command = { command: "ocr2md.openChapterModule", title: `打开${label}模块`, arguments: [file.path, moduleName] };
    item.iconPath = new vscode.ThemeIcon(
      moduleName === "章节标题" ? "symbol-key"
        : moduleName === "注释" ? "references"
          : moduleName === "非法断行" ? "warning"
            : "file-media",
    );
    return item;
  }
}

function chapterTreeLabel(workspacePath: string, file: FileEntry): string {
  return chapterDisplayName(workspacePath, file.path) || file.label;
}


function nearestMatchingLine(text: string, lineText: string, hint: number): number {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  if (lines[hint] === lineText) return hint;
  let best = hint;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index] !== lineText) continue;
    const distance = Math.abs(index - hint);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  }
  return best;
}

function rowBelongsToChapter(row: Candidate, originalPath: string | undefined, workingPath: string): boolean {
  if (row.sourcePath === workingPath || row.workingCopyPath === workingPath) return true;
  return Boolean(originalPath) && (row.sourcePath === originalPath || row.workingCopyPath === originalPath);
}

function defaultLineType(moduleName: ModuleName, raw: string): string {
  if (moduleName === "章节定界") return /^ {0,3}#(?!#)(?:\s+|$)/.test(raw) ? "1 级标题" : "修改";
  if (moduleName === "章节标题") {
    const match = /^ {0,3}(#{1,6})(?:\s+|$)/.exec(raw);
    return match ? `${match[1].length} 级标题` : "非标题";
  }
  if (moduleName === "注释") {
    return /^\s*(?:\d+\.|\*\d+|\[\^\d+\]:)\s+/.test(raw) ? "注释正文" : "注释引用";
  }
  return detectEmbedLineType(raw) ?? "嵌入文本";
}



function compareRows(left: Candidate, right: Candidate): number {
  return (left.sourceLabel ?? "").localeCompare(right.sourceLabel ?? "", "zh-CN", { numeric: true })
    || left.range.line - right.range.line
    || left.range.start - right.range.start
    || left.raw.localeCompare(right.raw);
}

function splitPatterns(value: string): string[] {
  return value.split(/^\s*---\s*$/m).map((item) => item.trim()).filter(Boolean);
}

function isTranslationServiceId(value: unknown): value is TranslationServiceId {
  return value === "deepl" || value === "openai";
}

function translationSecretKey(serviceId: TranslationServiceId): string {
  return serviceId === "openai" ? OPENAI_API_KEY_SECRET : DEEPL_API_KEY_SECRET;
}

function translationServiceLabel(serviceId: TranslationServiceId): string {
  return serviceId === "openai" ? "GPT" : "DeepL";
}

function isModuleName(value: unknown): value is ModuleName {
  return typeof value === "string" && MODULES.includes(value as ModuleName);
}



function download(url: string, redirects = 5): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const request = (parsed.protocol === "http:" ? http : https).get(parsed, (response) => {
      const status = response.statusCode ?? 0;
      if (status >= 300 && status < 400 && response.headers.location && redirects > 0) {
        response.resume();
        download(new URL(response.headers.location, parsed).toString(), redirects - 1).then(resolve, reject);
        return;
      }
      if (status < 200 || status >= 300) {
        response.resume();
        reject(new Error(`HTTP ${status}`));
        return;
      }
      const chunks: Buffer[] = [];
      response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      response.on("end", () => resolve(Buffer.concat(chunks)));
    });
    request.on("error", reject);
  });
}
