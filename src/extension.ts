import * as http from "http";
import * as https from "https";
import * as path from "path";
import { createHash, randomUUID } from "crypto";
import * as vscode from "vscode";
import {
  applyChangeState,
  buildChapterBoundarySegments,
  mergeSequenceMarkdown,
  scanChapterBoundaryLines,
  type MergeInputText,
} from "./chapterBoundary";
import {
  annotationMatchSummary,
  buildAnnotationPairs,
  extractAnnotationNumber,
} from "./annotation";
import { assignChapterFiles, type ChapterAssignMode } from "./chapterFileAssign";
import {
  activeCandidates,
  DELETED_LINE_TYPE,
  findReusableManualRow,
  markCandidatesDeleted,
} from "./candidateLifecycle";
import { MODULE_REGEX_DEFAULTS, MODULE_REGEX_PRESETS } from "./regexPresets";
import {
  attachLineIdentity,
  attachScanIdentities,
  locateCandidate,
  reconcileRows,
  relocateRows,
} from "./rowIdentity";
import { splitBlankLineBlocks } from "./atoms";
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
import { DEFAULT_TRANSLATION_SAMPLE, testDeepL, translateDeepL } from "./translationService";
import {
  TRANSLATION_STATE_FILE,
  emptyTranslationState,
  isTranslationUnitTranslated,
  parseTranslationState,
  recordTranslation,
  recordTranslationError,
  serializeTranslationState,
  translationEntryForUnit,
  translationProgress,
  translationRows,
  type TranslationStateFile,
} from "./translationState";
import {
  extractImageUrl,
  extractLocalImagePath,
  safeImageName,
  shouldDownloadImage,
  timestampedImageName,
} from "./imageDownload";
import {
  applyEmbedNumbers,
  detectEmbedLineType,
  excludeRowsOverlappingEmbeds,
  mergeEmbedScan,
  scanRegexMatches,
} from "./scanner";
import { candidatesFromSidecar, serializeSidecar } from "./sidecar";
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
import {
  CHAPTER_BOUNDARY_WORKING_FILE,
  CHAPTER_CHANGED_PROPERTY,
  CHAPTER_IMAGE_DIRECTORY,
  TRANS_OUTPUT_DIRECTORY,
  chapterCalibrationOutputDirectory,
  chapterAnnotationWorkingPath,
  chapterContentsDiffer,
  chapterDiffBaseline,
  chapterDirectoryPath,
  chapterDisplayName,
  chapterImageDirectory,
  chapterOriginalFileName,
  chapterOriginalPath,
  chapterOutputBaselinePath,
  chapterSidecarPath,
  chapterTransOutputPath,
  isCanonicalChapterOriginal,
  isChapterOutputPath,
  chapterWorkingCopyPath,
  legacyChapterOutputBaselinePath,
  legacyChapterSidecarPaths,
  legacyChapterWorkingCopyPath,
  markdownFileKind,
  planChapterWorkingCopyInit,
  withChapterChangedFrontmatter,
  withFormatCalibratedFrontmatter,
} from "./workspaceFiles";

const MODULES: ModuleName[] = ["章节定界", "章节标题", "注释", "嵌入块", "文本块", "分句", "翻译"];
const HEADING_COLORS = ["#ff5c57", "#ff9f43", "#feca57", "#9ccc65", "#55c6a9", "#d77bbf"];
const DEEPL_API_KEY_SECRET = "ocr2md.translation.deepl.apiKey";
const TRANSLATION_SERVICE_SETTING = "ocr2md.translation.service";
const TRANSLATION_SAMPLE_SETTING = "ocr2md.translation.sampleText";

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
  private headingDecorationTimer: ReturnType<typeof setTimeout> | undefined;
  private workingCopyPaintTimer: ReturnType<typeof setTimeout> | undefined;
  private pendingWorkingCopyRescan = false;
  private imageDownloadProgress: ImageDownloadProgress | undefined;
  private imageDownloadRunning = false;
  private readonly chapterDecorations: ChapterChangeDecorationProvider;
  private readonly output = vscode.window.createOutputChannel("ocr2md");
  private viewMode: "table" | "translationService" = "table";
  private translationService: TranslationServiceId = "deepl";
  private translationApiKeyConfigured = false;
  private translationSampleText = DEFAULT_TRANSLATION_SAMPLE;
  private translationTest: TranslationTestState = { phase: "idle", message: "尚未测试。" };
  private translationProgress: TranslationProgressState = { phase: "idle", completed: 0, total: 0, failed: 0 };
  private translationRunning = false;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.translationService = context.globalState.get<TranslationServiceId>(TRANSLATION_SERVICE_SETTING, "deepl");
    this.translationSampleText = context.globalState.get<string>(TRANSLATION_SAMPLE_SETTING, DEFAULT_TRANSLATION_SAMPLE);
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
      vscode.window.registerWebviewViewProvider("ocr2md.regex", this.sidebarProvider),
      vscode.commands.registerCommand("ocr2md.refreshFiles", () => this.refreshFiles()),
      vscode.commands.registerCommand("ocr2md.pickFolder", () => this.pickWorkspaceFolder()),
      vscode.commands.registerCommand("ocr2md.openMarkdownFile", (filePath: string) => this.selectFile(filePath)),
      vscode.commands.registerCommand("ocr2md.openTransChapter", (directoryPath: string, moduleName?: "文本块" | "分句" | "翻译") =>
        this.runTransAction(`打开 trans ${moduleName ?? "文本块"}`, () => this.openTransChapterDirectory(directoryPath, moduleName))),
      vscode.commands.registerCommand("ocr2md.openTranslationService", () =>
        this.runTransAction("打开翻译服务", () => this.openTranslationService())),
      vscode.commands.registerCommand("ocr2md.openChapterModule", (filePath: string, moduleName: ModuleName) => {
        if (moduleName === "章节标题" || moduleName === "注释" || moduleName === "嵌入块") {
          return this.selectFile(filePath, moduleName);
        }
        return undefined;
      }),
      vscode.commands.registerCommand("ocr2md.addCurrentLineToModule", () => this.addCurrentLine()),
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
      rows: this.rows,
      annotationPairs: this.annotationPairs,
      moduleRegexPatterns: this.moduleRegexPatterns,
      moduleRegexPresets: MODULE_REGEX_PRESETS,
      viewMode: this.viewMode,
      translationSettings: {
        service: this.translationService,
        apiKeyConfigured: this.translationApiKeyConfigured,
        sampleText: this.translationSampleText,
        test: this.translationTest,
      },
      translationProgress: this.translationProgress,
      imageDownloadProgress: this.imageDownloadProgress,
      annotationMatchSummary: annotationMatchSummary(this.rows, this.annotationPairs),
    };
  }

  private async handleMessage(message: WebviewMessage) {
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
      case "translateCurrentChapter":
        await this.runTransAction("翻译当前章节", () => this.translateCurrentChapter());
        break;
      case "exportCrossTranslation":
        await this.runTransAction("导出双向互译", () => this.exportCurrentChapterCrossTranslation());
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
    const legacyRoot = vscode.Uri.joinPath(workspace.uri, TRANS_OUTPUT_DIRECTORY);
    if (!(await exists(legacyRoot))) return;
    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(legacyRoot);
    } catch (error) {
      this.output.appendLine(`[trans] 读取旧 trans 目录失败：${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    for (const [name, type] of entries) {
      if ((type & vscode.FileType.Directory) === 0) continue;
      const source = vscode.Uri.joinPath(legacyRoot, name);
      const chapterDirectory = vscode.Uri.file(chapterDirectoryPath(workspace.uri.fsPath, name));
      const target = vscode.Uri.joinPath(chapterDirectory, TRANS_OUTPUT_DIRECTORY);
      if (!(await exists(chapterDirectory))) {
        this.output.appendLine(`[trans] 跳过旧目录 ${source.fsPath}：找不到对应章节目录。`);
        continue;
      }
      if (await exists(target)) {
        this.output.appendLine(`[trans] 跳过旧目录 ${source.fsPath}：目标已存在 ${target.fsPath}。`);
        continue;
      }
      try {
        await vscode.workspace.fs.rename(source, target, { overwrite: false });
        this.output.appendLine(`[trans] 已迁移 ${source.fsPath} -> ${target.fsPath}`);
      } catch (error) {
        this.output.appendLine(`[trans] 迁移失败 ${source.fsPath}：${error instanceof Error ? error.message : String(error)}`);
      }
    }
    try {
      const remaining = await vscode.workspace.fs.readDirectory(legacyRoot);
      if (!remaining.length) await vscode.workspace.fs.delete(legacyRoot);
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
    const text = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8");
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
    for (const moduleName of ["章节标题", "注释", "嵌入块"] as const) {
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
    if (await exists(preferred)) {
      chapterUri = preferred;
    } else {
      try {
        const entries = await vscode.workspace.fs.readDirectory(directory);
        const markdown = entries
          .filter(([name, type]) => (type & vscode.FileType.File) !== 0 && /\.md$/i.test(name))
          .map(([name]) => name)
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
    const text = Buffer.from(await vscode.workspace.fs.readFile(chapterUri)).toString("utf8");
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
      this.rows = translationRows(units, state);
      const progress = translationProgress(units, state);
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
    this.translationApiKeyConfigured = Boolean(await this.context.secrets.get(DEEPL_API_KEY_SECRET));
    this.translationTest = { phase: "idle", message: "尚未测试。" };
    this.directoryProvider.refresh();
    this.update();
  }

  private async loadTranslationSecretState() {
    this.translationApiKeyConfigured = Boolean(await this.context.secrets.get(DEEPL_API_KEY_SECRET));
    this.update();
  }

  private async saveTranslationSettings(message: WebviewMessage) {
    const service: TranslationServiceId = message.service === "deepl" ? "deepl" : this.translationService;
    const sampleText = typeof message.sampleText === "string" && message.sampleText.trim()
      ? message.sampleText
      : this.translationSampleText;
    this.translationService = service;
    this.translationSampleText = sampleText;
    await this.context.globalState.update(TRANSLATION_SERVICE_SETTING, service);
    await this.context.globalState.update(TRANSLATION_SAMPLE_SETTING, sampleText);
    if (typeof message.apiKey === "string" && message.apiKey.trim()) {
      await this.context.secrets.store(DEEPL_API_KEY_SECRET, message.apiKey.trim());
      this.translationApiKeyConfigured = true;
    } else {
      this.translationApiKeyConfigured = Boolean(await this.context.secrets.get(DEEPL_API_KEY_SECRET));
    }
    this.translationTest = { phase: "idle", message: "设置已保存。" };
    this.update();
  }

  private async testTranslationService(message: WebviewMessage) {
    this.translationService = message.service === "deepl" ? "deepl" : this.translationService;
    if (typeof message.sampleText === "string" && message.sampleText.trim()) {
      this.translationSampleText = message.sampleText;
    }
    await this.context.globalState.update(TRANSLATION_SERVICE_SETTING, this.translationService);
    await this.context.globalState.update(TRANSLATION_SAMPLE_SETTING, this.translationSampleText);

    const enteredKey = typeof message.apiKey === "string" ? message.apiKey.trim() : "";
    if (enteredKey) {
      await this.context.secrets.store(DEEPL_API_KEY_SECRET, enteredKey);
      this.translationApiKeyConfigured = true;
    }
    const apiKey = enteredKey || await this.context.secrets.get(DEEPL_API_KEY_SECRET) || "";
    if (!apiKey) {
      this.translationApiKeyConfigured = false;
      this.translationTest = { phase: "error", message: "请先填写 DeepL API Key。" };
      this.update();
      return;
    }

    this.translationTest = { phase: "testing", message: "正在请求 DeepL…" };
    this.update();
    const result = await testDeepL(apiKey, this.translationSampleText);
    this.translationApiKeyConfigured = true;
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
    const apiKey = await this.context.secrets.get(DEEPL_API_KEY_SECRET) || "";
    if (!apiKey) {
      void vscode.window.showWarningMessage("尚未设置 DeepL API Key，请先打开“翻译服务”。");
      return;
    }

    const chapterPath = this.selectedFile.path;
    const chapterUri = vscode.Uri.file(chapterPath);
    const sourceText = this.selectedFileText;
    const units = scanTranslationUnits(sourceText, chapterPath);
    const blocks = scanTextBlocks(sourceText, chapterPath);
    const blockById = new Map(blocks.map((block) => [block.id, block]));
    const { state } = await this.readValidatedTranslationState(chapterUri, units);

    this.translationRunning = true;
    this.translationProgress = translationProgress(units, state, "running");
    this.rows = translationRows(units, state);
    this.update();

    try {
      for (const unit of units) {
        if (isTranslationUnitTranslated(unit, state)) continue;
        const blockLabel = unit.parentBlockIndex == null
          ? ""
          : `B${String(unit.parentBlockIndex).padStart(3, "0")}`;
        const unitPrefix = unit.translationUnitKind === "composite" ? "C" : "S";
        const unitLabel = unit.sentenceIndex == null ? "" : `${unitPrefix}${String(unit.sentenceIndex).padStart(3, "0")}`;
        const current = [blockLabel, unitLabel].filter(Boolean).join("-");
        this.translationProgress = translationProgress(units, state, "running", current);
        this.updateTranslationUi(chapterPath, units, state);

        const protectedUnit = protectMarkdownForTranslation(unit.raw);
        const parentBlock = unit.parentBlockId ? blockById.get(unit.parentBlockId) : undefined;
        const contextText = parentBlock?.raw ?? unit.raw;
        const protectedContext = protectMarkdownForTranslation(contextText).text;
        const result = await translateDeepL(apiKey, protectedUnit.text, protectedContext);

        if (result.ok && result.translatedText) {
          const missing = missingProtectedMarkdownTokens(result.translatedText, protectedUnit.replacements);
          if (missing.length) {
            recordTranslationError(state, unit, `翻译结果缺少 Markdown 保护占位符：${missing.join(", ")}`);
          } else {
            const restored = restoreProtectedMarkdown(result.translatedText, protectedUnit.replacements);
            const structureIssue = markdownStructureIssue(unit.raw, restored);
            if (structureIssue) {
              recordTranslationError(state, unit, `翻译结果 Markdown 结构异常：${structureIssue}`);
            } else {
              recordTranslation(state, unit, restored);
            }
          }
        } else {
          recordTranslationError(state, unit, result.message);
        }

        await this.writeTranslationState(chapterUri, state);
        this.updateTranslationUi(chapterPath, units, state);

        if (result.statusCode && [401, 403, 429, 456].includes(result.statusCode)) {
          this.output.appendLine(`[translation] DeepL HTTP ${result.statusCode}; 已停止本轮翻译，可修正后继续。`);
          break;
        }
      }
    } finally {
      this.translationRunning = false;
      const progress = translationProgress(units, state);
      this.translationProgress = {
        ...progress,
        phase: progress.total > 0 && progress.completed === progress.total ? "complete" : "idle",
      };
      this.updateTranslationUi(chapterPath, units, state);
    }
  }

  private async exportCurrentChapterCrossTranslation() {
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
    const { state, invalidated } = await this.readValidatedTranslationState(chapterUri, units);
    if (invalidated) {
      this.rows = translationRows(units, state);
      const progress = translationProgress(units, state);
      this.translationProgress = { ...progress, phase: "idle" };
      this.update();
      void vscode.window.showWarningMessage(
        `检测到 ${invalidated} 个旧译文 Markdown 结构异常，已标记为失败。请点击“继续翻译”修复后再导出。`,
      );
      return;
    }
    const result = exportCrossTranslation({
      sourceMarkdown: this.selectedFileText,
      sourcePath: this.selectedFile.path,
      chapterFileName: path.basename(this.selectedFile.path),
      outputVaultRelativePath: outputRelativePath,
      translationState: state,
    });

    await vscode.workspace.fs.createDirectory(outputDirectory);
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
        await vscode.workspace.fs.writeFile(output.temp, Buffer.from(output.markdown, "utf8"));
      }
      for (const output of outputs) {
        if (!(await exists(output.target))) continue;
        await vscode.workspace.fs.rename(output.target, output.backup, { overwrite: false });
        output.backedUp = true;
      }
      for (const output of outputs) {
        await vscode.workspace.fs.rename(output.temp, output.target, { overwrite: false });
        output.committed = true;
      }
      committedAll = true;
    } catch (error) {
      for (const output of outputs) {
        if (output.committed) await deleteIfExists(output.target);
      }
      for (const output of outputs) {
        if (output.backedUp && await exists(output.backup)) {
          await vscode.workspace.fs.rename(output.backup, output.target, { overwrite: true });
        }
      }
      throw error;
    } finally {
      for (const output of outputs) await deleteIfExists(output.temp);
    }
    if (committedAll) {
      // Backup cleanup is deliberately outside the commit/rollback block. If
      // cleanup fails, keeping a .bak is safer than rolling back valid output.
      for (const output of outputs) {
        if (output.backedUp) await deleteIfExists(output.backup);
      }
    }
    void vscode.window.showInformationMessage(
      `互译与纯译文已导出：${result.orgFileName} / ${result.transFileName} / ${result.pureTransFileName}`,
    );
  }

  private updateTranslationUi(chapterPath: string, units: Candidate[], state: TranslationStateFile) {
    if (this.activeModule !== "翻译" || this.selectedFile?.path !== chapterPath) return;
    this.rows = translationRows(units, state);
    if (this.translationRunning) {
      this.translationProgress = translationProgress(units, state, "running", this.translationProgress.current);
    }
    this.update();
  }

  private async readTranslationState(chapterUri: vscode.Uri): Promise<TranslationStateFile> {
    const stateUri = vscode.Uri.joinPath(vscode.Uri.file(path.dirname(chapterUri.fsPath)), TRANSLATION_STATE_FILE);
    try {
      const raw = Buffer.from(await vscode.workspace.fs.readFile(stateUri)).toString("utf8");
      return parseTranslationState(raw, chapterUri.fsPath);
    } catch {
      return emptyTranslationState(chapterUri.fsPath);
    }
  }

  private async writeTranslationState(chapterUri: vscode.Uri, state: TranslationStateFile) {
    const directory = vscode.Uri.file(path.dirname(chapterUri.fsPath));
    const stateUri = vscode.Uri.joinPath(directory, TRANSLATION_STATE_FILE);
    const tempUri = vscode.Uri.joinPath(directory, `${TRANSLATION_STATE_FILE}.tmp`);
    await vscode.workspace.fs.writeFile(tempUri, Buffer.from(serializeTranslationState(state), "utf8"));
    await vscode.workspace.fs.rename(tempUri, stateUri, { overwrite: true });
  }

  private async readValidatedTranslationState(
    chapterUri: vscode.Uri,
    units: readonly Candidate[],
  ): Promise<{ state: TranslationStateFile; invalidated: number }> {
    const state = await this.readTranslationState(chapterUri);
    let invalidated = 0;
    for (const unit of units) {
      const entry = translationEntryForUnit(unit, state);
      if (entry?.status !== "translated" || !entry.translatedText) continue;
      const issue = markdownStructureIssue(unit.raw, entry.translatedText);
      if (!issue) continue;
      recordTranslationError(state, unit, `译文 Markdown 结构校验失败：${issue}`);
      invalidated += 1;
    }
    if (invalidated) {
      await this.writeTranslationState(chapterUri, state);
      this.output.appendLine(`[translation] 检测到 ${invalidated} 个旧译文 Markdown 结构异常，已标记为失败并等待重译。`);
    }
    return { state, invalidated };
  }

  private async activateModule(moduleName: ModuleName) {
    this.viewMode = "table";
    this.activeModule = moduleName;
    if (moduleName === "章节定界") {
      const workspace = vscode.workspace.workspaceFolders?.[0];
      const working = workspace ? vscode.Uri.joinPath(workspace.uri, ".ocr2md-merged.working.md") : undefined;
      if (working && await exists(working)) {
        this.chapterBoundaryWorkingUri = working;
        await this.refreshChapterBoundaryRows();
      }
    } else if (moduleName === "章节标题") {
      if (this.selectedFile) await this.openChapterWorkingCopy({ silent: true });
    } else if (moduleName === "文本块" || moduleName === "分句" || moduleName === "翻译") {
      if (this.selectedFile?.kind === "trans") {
        if (moduleName === "翻译") {
          const units = scanTranslationUnits(this.selectedFileText, this.selectedFile.path);
          const { state } = await this.readValidatedTranslationState(vscode.Uri.file(this.selectedFile.path), units);
          this.rows = translationRows(units, state);
          const progress = translationProgress(units, state);
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
          this.rows = translationRows(units, state);
          const progress = translationProgress(units, state);
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
    const patterns = splitPatterns(this.moduleRegexPatterns[moduleName] ?? "");
    const unique = new Map<string, Candidate>();
    const scannedEmbeds = moduleName === "嵌入块" ? mergeEmbedScan(text, patterns) : [];
    for (const candidate of scannedEmbeds) {
      unique.set(candidatePositionKey({ ...candidate, sourcePath: source, workingCopyPath: workingPath }), {
        ...candidate,
        typeLabel: moduleName,
        lineType: candidate.lineType ?? defaultLineType(moduleName, candidate.raw),
        sourcePath: source,
        sourceLabel: workspaceRoot ? path.relative(workspaceRoot, source) : path.basename(source),
        workingCopyPath: workingPath,
      });
    }
    if (moduleName !== "嵌入块") {
      for (const pattern of patterns) {
        for (const match of scanRegexMatches(text, pattern)) {
          const extractedNumber = extractAnnotationNumber(match.raw);
          const row: Candidate = {
            ...match,
            typeLabel: moduleName,
            lineType: defaultLineType(moduleName, match.raw),
            regexSource: pattern,
            annotationNumber: extractedNumber,
            annotationNumberSource: extractedNumber ? "extracted" : undefined,
            sourcePath: source,
            sourceLabel: workspaceRoot ? path.relative(workspaceRoot, source) : path.basename(source),
            workingCopyPath: workingPath,
          };
          unique.set(candidatePositionKey(row), row);
        }
      }
    }
    const scanned = attachScanIdentities([...unique.values()], text, { moduleName, sourcePath: source });
    const previous = this.rows.filter((row) => row.typeLabel === moduleName && row.sourcePath === source);
    let reconciled = reconcileRows(previous, scanned, text);
    if (moduleName === "嵌入块") {
      const present = new Set(reconciled.map((row) => row.id));
      const extras = previous.filter((row) =>
        !present.has(row.id) && (row.chapterBoundaryState === "deleted" || row.isWorkingCorrection));
      reconciled = applyEmbedNumbers(
        dedupeImageRows([...reconciled, ...relocateRows(extras, text)], text),
        text,
      );
    }
    this.rows = [
      ...this.rows.filter((row) => !(row.typeLabel === moduleName && row.sourcePath === source)),
      ...reconciled,
    ].sort(compareRows);
    if (moduleName === "注释") this.rebuildAnnotationPairs();
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
    if (!(await exists(uri))) return "";
    return Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8");
  }

  private async readChapterOriginalText(): Promise<string | undefined> {
    const originalPath = this.selectedFile?.path;
    const workspace = vscode.workspace.workspaceFolders?.[0];
    if (!workspace || !originalPath || !isChapterOutputPath(workspace.uri.fsPath, originalPath)) return undefined;
    const uri = vscode.Uri.file(originalPath);
    if (!(await exists(uri))) return undefined;
    return Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8");
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
    if (lineType === DELETED_LINE_TYPE) {
      this.rows = markCandidatesDeleted(this.rows, selected);
    } else {
      const titleRows = this.rows.filter((row) => selected.has(row.id) && row.typeLabel === "章节标题");
      if (titleRows.length && /^(?:[1-6] 级标题|非标题)$/.test(lineType)) {
        await this.applyHeadingLineType(titleRows, lineType);
      }
      this.rows = this.rows.map((row) => selected.has(row.id) ? { ...row, lineType } : row);
    }
    this.rebuildAnnotationPairs();
    this.update();
  }

  private setChapterFile(ids: string[], value: string) {
    const chapterFile = value.trim();
    const selected = new Set(ids);
    this.rows = this.rows.map((row) => selected.has(row.id) ? { ...row, chapterFile } : row);
    this.update();
  }

  private assignSelectedChapterFiles(ids: string[], mode: string, value: string) {
    const selected = new Set(ids);
    const rows = this.rows.filter((row) =>
      selected.has(row.id) && row.typeLabel === "章节定界" && row.lineType === "1 级标题");
    const result = assignChapterFiles({
      mode: mode as ChapterAssignMode,
      value,
      rows: rows.map((row) => ({ id: row.id, raw: row.raw, chapterFile: row.chapterFile })),
    });
    if (!result.ok) {
      void vscode.window.showWarningMessage(result.error);
      return;
    }
    this.rows = this.rows.map((row) => result.files[row.id] !== undefined ? { ...row, chapterFile: result.files[row.id] } : row);
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
      for (const row of targetRows) {
        const located = locateCandidate(documentText, row);
        if (!located || located.line >= document.lineCount) continue;
        const sourceLine = document.lineAt(located.line);
        const content = sourceLine.text.replace(/^ {0,3}#{1,6}(?:\s+|$)/, "");
        const match = /^([1-6]) 级标题$/.exec(lineType);
        const replacement = match ? `${"#".repeat(Number(match[1]))} ${content}` : content;
        if (replacement !== sourceLine.text) edit.replace(uri, sourceLine.range, replacement);
      }
      await vscode.workspace.applyEdit(edit);
      await document.save();
    }
  }

  private rebuildAnnotationPairs() {
    this.rows = this.rows.map((row) => {
      if (row.typeLabel !== "注释" || row.annotationNumberSource === "manual") return row;
      const extracted = extractAnnotationNumber(row.raw);
      return extracted ? { ...row, annotationNumber: extracted, annotationNumberSource: "extracted" } : row;
    });
    this.annotationPairs = buildAnnotationPairs(this.rows, this.annotationPairs);
  }

  private matchAnnotationPairs() {
    this.rebuildAnnotationPairs();
    this.update();
  }

  private setAnnotationNumber(id: string, value: string) {
    const annotationNumber = value.trim();
    this.rows = this.rows.map((row) => row.id === id
      ? { ...row, annotationNumber: annotationNumber || undefined, annotationNumberSource: "manual" }
      : row);
    this.rebuildAnnotationPairs();
    this.update();
  }

  private async openAnnotationWorkingCopy() {
    const file = this.selectedFile;
    const workspace = file ? vscode.workspace.getWorkspaceFolder(vscode.Uri.file(file.path)) ?? vscode.workspace.workspaceFolders?.[0] : undefined;
    if (!file || !workspace) {
      void vscode.window.showWarningMessage("请先选择 Markdown 文件。");
      return;
    }
    const uri = vscode.Uri.file(chapterAnnotationWorkingPath(file.path));
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(uri.fsPath)));
    if (!(await exists(uri))) {
      const corrected = applyAnnotationCorrections(this.selectedFileText, this.rows.filter((row) => row.typeLabel === "注释"));
      await vscode.workspace.fs.writeFile(uri, Buffer.from(corrected, "utf8"));
    }
    this.annotationWorkingUri = uri;
    this.modulePreviewPaths.set("注释", uri.fsPath);
    await this.showDocumentPair(uri);
  }

  private async addCurrentLine() {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== "markdown") return;
    const moduleName = this.activeModule;
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
      this.rows = this.rows.map((row) => row.id === existing.id
        ? { ...row, isWorkingCorrection: true, chapterBoundaryState: "added" as const, range: { ...row.range, line: lineNumber } }
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
    this.rows = await this.applyWorkingCopyDiff(this.rows, documentText);
    this.rebuildAnnotationPairs();
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
    if (!target || !(await exists(vscode.Uri.file(target)))) {
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
    this.rows = this.rows.map((candidate) => candidate.id === current.id ? { ...candidate, range: located } : candidate);
    this.update();
  }

  private async showDocumentPair(uri: vscode.Uri, options: { preserveFocus?: boolean } = {}): Promise<vscode.TextEditor> {
    const document = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(document, {
      preview: false,
      preserveFocus: options.preserveFocus,
    });
    this.applyHeadingDecorations(editor);
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
    const candidates = activeCandidates(this.rows).filter((row) => row.typeLabel === "嵌入块" && extractImageUrl(row.raw));
    if (!candidates.length) {
      void vscode.window.showWarningMessage("当前嵌入块没有可下载的外部图片。");
      return;
    }
    const originalPath = this.selectedFile?.path ?? workspace.uri.fsPath;
    const directory = vscode.Uri.file(this.selectedFile ? chapterImageDirectory(originalPath) : path.join(workspace.uri.fsPath, CHAPTER_IMAGE_DIRECTORY));
    await vscode.workspace.fs.createDirectory(directory);
    this.imageDownloadRunning = true;
    let downloaded = 0;
    let skipped = 0;
    let failed = 0;
    const total = candidates.length;
    try {
      for (const [index, row] of candidates.entries()) {
        const url = extractImageUrl(row.raw);
        const name = url ? safeImageName(url, row.range.line) : "";
        const target = name ? vscode.Uri.joinPath(directory, name) : undefined;
        const existsAlready = target ? await exists(target) : false;
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
        if (!url || !target) {
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
          await vscode.workspace.fs.writeFile(target, await download(url));
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
    const sourceDirectory = path.dirname(working.fsPath);
    const patches = new Map<string, string>();
    for (const row of activeCandidates(this.rows)) {
      if (row.typeLabel !== "嵌入块" || row.lineType !== "嵌入链接" || row.localPath) continue;
      const localReference = extractLocalImagePath(row.raw);
      if (!localReference) continue;
      const sourcePath = path.isAbsolute(localReference)
        ? localReference
        : path.resolve(sourceDirectory, localReference);
      try {
        const stat = await vscode.workspace.fs.stat(vscode.Uri.file(sourcePath));
        patches.set(row.id, `${CHAPTER_IMAGE_DIRECTORY}/${timestampedImageName(sourcePath, stat.mtime)}`);
      } catch {
        // Leave unresolved local images unchanged so the source remains inspectable.
      }
    }
    if (!patches.size) return;
    this.rows = this.rows.map((row) => {
      const localPath = patches.get(row.id);
      return localPath ? { ...row, localPath } : row;
    });
  }

  private async copyLocalImagesForExport(working: vscode.Uri) {
    const file = this.selectedFile;
    if (!file) return;
    await this.planLocalImageExportPaths(working);
    const sourceDirectory = path.dirname(working.fsPath);
    const chapterDirectory = path.dirname(file.path);
    const imageDirectory = vscode.Uri.file(chapterImageDirectory(file.path));
    await vscode.workspace.fs.createDirectory(imageDirectory);
    for (const row of activeCandidates(this.rows)) {
      if (row.typeLabel !== "嵌入块" || row.lineType !== "嵌入链接") continue;
      const localReference = extractLocalImagePath(row.raw);
      if (!localReference || !row.localPath) continue;
      const sourcePath = path.isAbsolute(localReference)
        ? localReference
        : path.resolve(sourceDirectory, localReference);
      const sourceUri = vscode.Uri.file(sourcePath);
      if (!(await exists(sourceUri))) {
        throw new Error(`本地图片不存在：${localReference}`);
      }
      const targetUri = vscode.Uri.file(path.resolve(chapterDirectory, row.localPath));
      await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(targetUri.fsPath)));
      if (sourceUri.fsPath !== targetUri.fsPath) {
        await vscode.workspace.fs.copy(sourceUri, targetUri, { overwrite: true });
      }
    }
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
    const markdown = exportByCalibration(this.selectedFileText, this.rows);
    const directory = vscode.Uri.file(chapterCalibrationOutputDirectory(file.path));
    const outputUri = vscode.Uri.joinPath(directory, `${path.parse(file.path).name}.md`);
    await vscode.workspace.fs.createDirectory(directory);
    await vscode.workspace.fs.writeFile(outputUri, Buffer.from(markdown, "utf8"));
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
    const markdown = withFormatCalibratedFrontmatter(exportByCalibration(this.selectedFileText, this.rows));
    const outputUri = vscode.Uri.file(chapterTransOutputPath(workspace.uri.fsPath, file.path));
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(outputUri.fsPath)));
    await vscode.workspace.fs.writeFile(outputUri, Buffer.from(markdown, "utf8"));
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
    const originalUri = vscode.Uri.file(file.path);
    const originalText = (await exists(originalUri))
      ? Buffer.from(await vscode.workspace.fs.readFile(originalUri)).toString("utf8")
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
    const workingPath = chapterWorkingCopyPath(workspace.uri.fsPath, file.path);
    const workingUri = vscode.Uri.file(workingPath);
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(workingPath)));
    if (!(await exists(workingUri))) {
      const legacyWorking = vscode.Uri.file(legacyChapterWorkingCopyPath(workspace.uri.fsPath, file.path));
      if (await exists(legacyWorking)) {
        await vscode.workspace.fs.writeFile(workingUri, await vscode.workspace.fs.readFile(legacyWorking));
      }
    }
    let baselineText: string | undefined;
    if (isChapterOutputPath(workspace.uri.fsPath, file.path)) {
      const baselineCandidates = [
        chapterOutputBaselinePath(workspace.uri.fsPath, file.path),
        legacyChapterOutputBaselinePath(workspace.uri.fsPath, file.path),
      ];
      for (const baselinePath of baselineCandidates) {
        const baselineUri = vscode.Uri.file(baselinePath);
        if (await exists(baselineUri)) {
          baselineText = Buffer.from(await vscode.workspace.fs.readFile(baselineUri)).toString("utf8");
          break;
        }
      }
    }
    const plan = planChapterWorkingCopyInit({
      workingExists: await exists(workingUri),
      originalText,
      baselineText,
    });
    if (plan.action === "keep-working") {
      const workingText = Buffer.from(await vscode.workspace.fs.readFile(workingUri)).toString("utf8");
      return { workingUri, workingText };
    }
    await vscode.workspace.fs.writeFile(workingUri, Buffer.from(plan.workingText, "utf8"));
    if (plan.restoreOriginal !== undefined) {
      await vscode.workspace.fs.writeFile(vscode.Uri.file(file.path), Buffer.from(plan.restoreOriginal, "utf8"));
    }
    return { workingUri, workingText: plan.workingText };
  }

  private async refreshChapterTitleRows(
    uri: vscode.Uri,
    options: { writeMarker?: boolean; currentText?: string; silent?: boolean } = {},
  ) {
    if (!(await exists(uri)) && options.currentText === undefined) return;
    const workspace = vscode.workspace.getWorkspaceFolder(uri) ?? vscode.workspace.workspaceFolders?.[0];
    const current = await this.readWorkingText(uri, options.currentText);
    const originalPath = this.selectedFile?.path;
    let baseline = current;
    if (workspace && originalPath && isChapterOutputPath(workspace.uri.fsPath, originalPath) && originalPath !== uri.fsPath) {
      const originalUri = vscode.Uri.file(originalPath);
      if (await exists(originalUri)) baseline = Buffer.from(await vscode.workspace.fs.readFile(originalUri)).toString("utf8");
    }
    const previousTitles = this.rows.filter((row) => row.typeLabel === "章节标题" && rowBelongsToChapter(row, originalPath, uri.fsPath));
    const previousImages = this.rows.filter((row) => row.typeLabel === "嵌入块" && rowBelongsToChapter(row, originalPath, uri.fsPath));
    const changes = scanChapterBoundaryLines(chapterDiffBaseline(baseline, current), current);
    const currentChanges = changes.filter((entry) => entry.state !== "deleted");
    const sourcePath = originalPath ?? uri.fsPath;
    const sourceLabel = workspace ? path.relative(workspace.uri.fsPath, sourcePath) : path.basename(sourcePath);
    const blocks = splitBlankLineBlocks(current).map((block) => {
      const endLine = block.range.endLine ?? block.range.line;
      const change = currentChanges.find((entry) => entry.line >= block.range.line && entry.line <= endLine);
      const heading = /^ {0,3}(#{1,6})(?:\s+|$)/.exec(block.raw.split("\n")[0] ?? "");
      return {
        id: `chapter-block-${candidateHash(`${sourcePath}\0${block.range.line}\0${block.raw}`)}`,
        kind: "regex" as const,
        label: block.raw.split("\n")[0]?.trim() || `L${block.range.line + 1}`,
        raw: block.raw,
        preview: block.raw.slice(0, 255),
        range: block.range,
        typeLabel: "章节标题" as const,
        lineType: heading ? `${heading[1].length} 级标题` : "非标题",
        workingCopyPath: uri.fsPath,
        sourcePath,
        sourceLabel,
        status: "候选" as const,
        chapterBoundaryState: change?.state ?? "heading" as const,
        baselinePreview: change?.baselineText,
      };
    });
    const identityContext = { sourcePath };
    const titleBlocks = attachScanIdentities(
      blocks.filter((row) => !detectEmbedLineType(row.raw)),
      current,
      { moduleName: "章节标题", ...identityContext },
    );
    const imageBlocks = attachScanIdentities(
      mergeEmbedScan(current, splitPatterns(this.moduleRegexPatterns["嵌入块"] ?? "")).map((row) => ({
        ...row,
        typeLabel: "嵌入块" as const,
        workingCopyPath: uri.fsPath,
        sourcePath,
        sourceLabel,
      })),
      current,
      { moduleName: "嵌入块", ...identityContext },
    );
    const titleRows = reconcileRows(previousTitles.filter((row) => row.chapterBoundaryState !== "deleted"), titleBlocks, current);
    let imageRows = applyEmbedNumbers(
      dedupeImageRows(
        reconcileRows(previousImages.filter((row) => row.chapterBoundaryState !== "deleted"), imageBlocks, current)
          .map((row) => applyChangeState(row, changes)),
        current,
      ),
      current,
    );
    const lines = current.replace(/\r\n?/g, "\n").split("\n");
    for (const entry of changes.filter((candidate) => candidate.state === "deleted")) {
      const raw = entry.baselineText ?? "";
      const imageLineType = detectEmbedLineType(raw);
      const deleted = attachLineIdentity({
        id: `chapter-deleted-${candidateHash(`${uri.fsPath}\0${raw}`)}`,
        kind: "regex",
        label: raw.trim() || `L${entry.line + 1}`,
        raw,
        preview: raw,
        range: { line: Math.min(entry.line, Math.max(0, lines.length - 1)), start: 0, end: 0 },
        typeLabel: imageLineType ? "嵌入块" : "章节标题",
        lineType: imageLineType ?? "非标题",
        chapterBoundaryState: "deleted",
        baselinePreview: raw,
        workingCopyPath: uri.fsPath,
        sourcePath,
        sourceLabel: workspace ? path.relative(workspace.uri.fsPath, sourcePath) : path.basename(sourcePath),
        status: "候选",
      }, current, { moduleName: imageLineType ? "嵌入块" : "章节标题", sourcePath });
      (imageLineType ? imageRows : titleRows).push(deleted);
    }
    imageRows = applyEmbedNumbers(imageRows, current);
    const cleanedTitleRows = excludeRowsOverlappingEmbeds(titleRows, imageRows);
    this.rows = [
      ...this.rows.filter((row) => row.typeLabel !== "章节标题"
        && !(row.typeLabel === "嵌入块" && rowBelongsToChapter(row, originalPath, uri.fsPath))),
      ...cleanedTitleRows,
      ...imageRows,
    ].sort(compareRows);
    if (options.writeMarker !== false && workspace && originalPath && isChapterOutputPath(workspace.uri.fsPath, originalPath)) {
      await this.writeChapterChangedMarker(originalPath, chapterContentsDiffer(baseline, current));
    }
    if (!options.silent) this.update();
  }

  private async syncChapterChangeMarkers(workspace: vscode.WorkspaceFolder, files: FileEntry[]): Promise<FileEntry[]> {
    const next: FileEntry[] = [];
    for (const file of files) {
      if (file.kind !== "chapter" || !isChapterOutputPath(workspace.uri.fsPath, file.path)) {
        next.push(file);
        continue;
      }
      const originalUri = vscode.Uri.file(file.path);
      const originalText = Buffer.from(await vscode.workspace.fs.readFile(originalUri)).toString("utf8");
      const workingUri = vscode.Uri.file(chapterWorkingCopyPath(workspace.uri.fsPath, file.path));
      const workingText = (await exists(workingUri))
        ? Buffer.from(await vscode.workspace.fs.readFile(workingUri)).toString("utf8")
        : undefined;
      const changed = workingText !== undefined && chapterContentsDiffer(originalText, workingText);
      const updated = withChapterChangedFrontmatter(originalText, changed);
      if (updated !== originalText) await vscode.workspace.fs.writeFile(originalUri, Buffer.from(updated, "utf8"));
      next.push({ ...file, changed });
    }
    return next;
  }

  private async writeChapterChangedMarker(originalPath: string, changed: boolean) {
    const uri = vscode.Uri.file(originalPath);
    if (!(await exists(uri))) return;
    const text = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8");
    const updated = withChapterChangedFrontmatter(text, changed);
    if (updated !== text) await vscode.workspace.fs.writeFile(uri, Buffer.from(updated, "utf8"));
    this.files = this.files.map((file) => file.path === originalPath ? { ...file, changed } : file);
    this.directoryProvider.refresh();
    this.chapterDecorations.refresh();
  }

  private async openChapterBoundaryWork() {
    const workspace = vscode.workspace.workspaceFolders?.[0];
    if (!workspace) return;
    const workingUri = vscode.Uri.joinPath(workspace.uri, CHAPTER_BOUNDARY_WORKING_FILE);
    const boundaryDirectory = vscode.Uri.joinPath(workspace.uri, ".ocr2md", "chapter-boundary");
    const baselineUri = vscode.Uri.joinPath(boundaryDirectory, "baseline.md");
    const manifestUri = vscode.Uri.joinPath(boundaryDirectory, "manifest.json");
    const inputs = await this.readSequenceInputs(workspace, workingUri.fsPath);
    if (!inputs.length && !(await exists(workingUri))) {
      void vscode.window.showWarningMessage("工作目录根层没有可合并的序列 Markdown 文件。");
      return;
    }
    await vscode.workspace.fs.createDirectory(boundaryDirectory);
    if (!(await exists(workingUri))) await vscode.workspace.fs.writeFile(workingUri, Buffer.from(mergeSequenceMarkdown(inputs), "utf8"));
    const workingText = Buffer.from(await vscode.workspace.fs.readFile(workingUri)).toString("utf8");
    if (!(await exists(baselineUri))) await vscode.workspace.fs.writeFile(baselineUri, Buffer.from(workingText, "utf8"));
    if (!(await exists(manifestUri))) {
      await vscode.workspace.fs.writeFile(manifestUri, Buffer.from(JSON.stringify({
        schemaVersion: 2,
        createdAt: new Date().toISOString(),
        workingFile: workingUri.fsPath,
        sourceFiles: inputs.map((input) => input.path),
      }, null, 2), "utf8"));
    }
    this.chapterBoundaryWorkingUri = workingUri;
    this.modulePreviewPaths.set("章节定界", workingUri.fsPath);
    this.activeModule = "章节定界";
    this.selectedFile = { label: path.basename(workingUri.fsPath), path: workingUri.fsPath, kind: "working" };
    this.selectedFileText = workingText;
    await this.reloadSidecar({ silent: true, reindex: false });
    await this.refreshChapterBoundaryRows();
    await this.showDocumentPair(workingUri);
  }

  private async readSequenceInputs(workspace: vscode.WorkspaceFolder, workingPath: string): Promise<MergeInputText[]> {
    const files = (await this.discoverWorkspaceFiles(workspace))
      .filter((file) => file.kind === "ocr" && file.path !== workingPath)
      .sort((left, right) => left.label.localeCompare(right.label, "zh-CN", { numeric: true }));
    const inputs: MergeInputText[] = [];
    for (const file of files) {
      const uri = vscode.Uri.file(file.path);
      inputs.push({ path: file.path, text: Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8") });
    }
    return inputs;
  }

  private async discoverWorkspaceFiles(workspace: vscode.WorkspaceFolder): Promise<FileEntry[]> {
    const uris = await vscode.workspace.findFiles(
      "**/*.md",
      `{**/.ocr2md/**,**/node_modules/**,**/out/**,**/output/**,**/output_chapters/**,**/${TRANS_OUTPUT_DIRECTORY}/**,**/${CHAPTER_BOUNDARY_WORKING_FILE},**/*.working.md,**/*.annotation.working.md,**/*.baseline.md}`,
    );
    const files = await Promise.all(uris.filter((uri) => {
      if (!isChapterOutputPath(workspace.uri.fsPath, uri.fsPath)) return true;
      return isCanonicalChapterOriginal(workspace.uri.fsPath, uri.fsPath);
    }).map(async (uri): Promise<FileEntry> => {
      const text = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8");
      return {
        label: path.relative(workspace.uri.fsPath, uri.fsPath),
        path: uri.fsPath,
        kind: markdownFileKind(text),
      };
    }));
    return files.sort((left, right) => left.label.localeCompare(right.label, "zh-CN", { numeric: true }));
  }

  private async refreshChapterBoundaryRows() {
    const workspace = vscode.workspace.workspaceFolders?.[0];
    const working = this.chapterBoundaryWorkingUri;
    if (!workspace || !working) return;
    const baselineUri = vscode.Uri.joinPath(workspace.uri, ".ocr2md", "chapter-boundary", "baseline.md");
    if (!(await exists(baselineUri)) || !(await exists(working))) return;
    const baseline = Buffer.from(await vscode.workspace.fs.readFile(baselineUri)).toString("utf8");
    const current = Buffer.from(await vscode.workspace.fs.readFile(working)).toString("utf8");
    const previous = this.rows.filter((row) => row.typeLabel === "章节定界");
    const lines = current.replace(/\r\n?/g, "\n").split("\n");
    const scanned = attachScanIdentities(scanChapterBoundaryLines(baseline, current).map((entry) => {
      const raw = entry.text || entry.baselineText || "";
      const heading = /^ {0,3}#(?!#)(?:\s+|$)/.test(entry.text);
      return {
        id: entry.id,
        kind: "regex" as const,
        label: raw.trim() || `L${entry.line + 1}`,
        raw,
        preview: raw,
        range: { line: Math.min(entry.line, Math.max(0, lines.length - 1)), start: 0, end: entry.state === "deleted" ? 0 : raw.length },
        typeLabel: "章节定界" as const,
        lineType: heading ? "1 级标题" : boundaryStateLabel(entry.state),
        chapterBoundaryState: entry.state,
        baselinePreview: entry.baselineText,
        workingCopyPath: working.fsPath,
        sourcePath: working.fsPath,
        sourceLabel: path.basename(working.fsPath),
        status: "候选" as const,
      };
    }), current, { moduleName: "章节定界", sourcePath: working.fsPath });
    this.rows = [...this.rows.filter((row) => row.typeLabel !== "章节定界"), ...reconcileRows(previous, scanned)].sort(compareRows);
    this.selectedFileText = current;
    this.update();
  }

  private async exportChapterBoundaryChapters() {
    const workspace = vscode.workspace.workspaceFolders?.[0];
    const working = this.chapterBoundaryWorkingUri;
    if (!workspace || !working || !(await exists(working))) {
      void vscode.window.showWarningMessage("请先创建或打开章节定界工作稿。");
      return;
    }
    await this.refreshChapterBoundaryRows();
    const starts = activeCandidates(this.rows)
      .filter((row) => row.typeLabel === "章节定界" && row.lineType === "1 级标题" && row.chapterFile?.trim())
      .map((row) => ({ line: row.range.line, chapterFile: chapterOriginalFileName(row.chapterFile!) }));
    if (!starts.length) {
      void vscode.window.showWarningMessage("请先为至少一个一级标题设置章节文件。");
      return;
    }
    const text = Buffer.from(await vscode.workspace.fs.readFile(working)).toString("utf8");
    const lines = text.replace(/\r\n?/g, "\n").split("\n");
    const segments = buildChapterBoundarySegments(starts, lines.length);
    for (const segment of segments) {
      const body = lines.slice(segment.startLine, segment.endLine).join("\n");
      const output = withChapterFrontmatter(body, segment.chapterFile, path.basename(working.fsPath));
      const chapterDir = vscode.Uri.file(chapterDirectoryPath(workspace.uri.fsPath, segment.chapterFile));
      const originalUri = vscode.Uri.file(chapterOriginalPath(workspace.uri.fsPath, segment.chapterFile));
      const workingUri = vscode.Uri.file(chapterWorkingCopyPath(workspace.uri.fsPath, originalUri.fsPath));
      const imageDir = vscode.Uri.file(chapterImageDirectory(originalUri.fsPath));
      await vscode.workspace.fs.createDirectory(chapterDir);
      await vscode.workspace.fs.createDirectory(imageDir);
      await vscode.workspace.fs.writeFile(originalUri, Buffer.from(output, "utf8"));
      if (!(await exists(workingUri))) await vscode.workspace.fs.writeFile(workingUri, Buffer.from(output, "utf8"));
    }
    await this.refreshFiles();
    void vscode.window.showInformationMessage(`已导出 ${segments.length} 个章节到 chapters/章节名称/。`);
  }

  private async reloadSidecar(options: { silent?: boolean; reindex?: boolean } = {}) {
    const file = this.selectedFile;
    const workspace = file ? vscode.workspace.getWorkspaceFolder(vscode.Uri.file(file.path)) ?? vscode.workspace.workspaceFolders?.[0] : undefined;
    if (!file || !workspace) return;
    let sidecarPath: string | undefined;
    for (const candidate of [chapterSidecarPath(file.path), ...legacyChapterSidecarPaths(workspace.uri.fsPath, file.path)]) {
      if (await exists(vscode.Uri.file(candidate))) {
        sidecarPath = candidate;
        break;
      }
    }
    if (!sidecarPath) return;
    const uri = vscode.Uri.file(sidecarPath);
    try {
      const parsed = JSON.parse(Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8"));
      const loaded = candidatesFromSidecar(parsed);
      this.rows = loaded.rows.filter((row) =>
        row.typeLabel && rowBelongsToChapter(row, file.path, this.chapterWorkingUri?.fsPath ?? file.path)
      ).sort(compareRows);
      this.annotationPairs = (loaded.annotationPairs ?? []).filter((pair) => pair.sourcePath === file.path);
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
    const workspace = file ? vscode.workspace.getWorkspaceFolder(vscode.Uri.file(file.path)) ?? vscode.workspace.workspaceFolders?.[0] : undefined;
    if (!file || !workspace) return;
    const sidecarPath = chapterSidecarPath(file.path);
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(sidecarPath)));
    const sidecar = serializeSidecar(file.path, this.rows, this.annotationPairs);
    await vscode.workspace.fs.writeFile(vscode.Uri.file(sidecarPath), Buffer.from(JSON.stringify(sidecar, null, 2), "utf8"));
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
    private readonly onMessage: (message: WebviewMessage) => Promise<void>,
  ) {}

  resolveWebviewView(view: vscode.WebviewView) {
    this.view = view;
    this.loaded = false;
    view.webview.options = { enableScripts: true };
    view.webview.onDidReceiveMessage((message: WebviewMessage) => this.onMessage(message));
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

  static chapterModule(label: string, moduleName: Exclude<ModuleName, "章节定界" | "文本块">, file: FileEntry, selected: boolean) {
    const item = new DirectoryItem(label, "chapter-module", vscode.TreeItemCollapsibleState.None, file);
    item.description = selected ? "当前" : undefined;
    item.tooltip = `${file.path} · ${label}`;
    item.command = { command: "ocr2md.openChapterModule", title: `打开${label}模块`, arguments: [file.path, moduleName] };
    item.iconPath = new vscode.ThemeIcon(moduleName === "章节标题" ? "symbol-key" : moduleName === "注释" ? "references" : "file-media");
    return item;
  }
}

function chapterTreeLabel(workspacePath: string, file: FileEntry): string {
  return chapterDisplayName(workspacePath, file.path) || file.label;
}

interface WebviewMessage {
  command: string;
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

function dedupeImageRows(rows: Candidate[], text?: string): Candidate[] {
  const deleted = rows.filter((row) => row.chapterBoundaryState === "deleted");
  const live = rows.filter((row) => row.chapterBoundaryState !== "deleted");
  const lines = text ? text.replace(/\r\n?/g, "\n").split("\n") : undefined;
  const score = (row: Candidate): number => {
    const lineText = lines?.[row.range.line];
    if (lineText === undefined) return 0;
    const raw = (row.raw ?? "").split("\n")[0]?.trim() ?? "";
    if (lineText === row.raw) return 5;
    if (lineText.trim() === raw) return 4;
    if (detectEmbedLineType(lineText) === row.lineType) return 3;
    if (raw && lineText.includes(raw)) return 2;
    return 0;
  };
  const byLine = new Map<number, Candidate>();
  for (const row of live) {
    const existing = byLine.get(row.range.line);
    if (!existing || score(row) > score(existing)) byLine.set(row.range.line, row);
  }
  return [...deleted, ...byLine.values()].sort(compareRows);
}

function applyAnnotationCorrections(text: string, rows: Candidate[]): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  for (const row of activeCandidates(rows)) {
    const located = locateCandidate(text, row);
    const lineNumber = located?.line;
    if (lineNumber === undefined || lines[lineNumber] === undefined) continue;
    const line = lines[lineNumber];
    const number = row.annotationNumber ?? extractAnnotationNumber(row.raw);
    if (!number) continue;
    if (row.lineType === "注释引用") {
      const pattern = new RegExp(`<sup>\\s*\\(?\\s*${escapeRegex(number)}\\s*\\)?\\s*</sup>|\\[\\*${escapeRegex(number)}\\]`, "i");
      lines[lineNumber] = line.replace(pattern, `[^${number}]`);
    } else if (row.lineType === "注释正文") {
      lines[lineNumber] = line.replace(/^\s*(?:\d+\.|\*\d+|\[\^\d+\]:)\s+/, `[^${number}]: `);
    }
  }
  return lines.join("\n");
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

function candidatePositionKey(row: Candidate): string {
  return `${row.sourcePath}\0${row.range.line}\0${row.range.start}\0${row.raw}`;
}

function candidateHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 20);
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

function isModuleName(value: unknown): value is ModuleName {
  return typeof value === "string" && MODULES.includes(value as ModuleName);
}

function boundaryStateLabel(state: "heading" | "added" | "modified" | "deleted"): string {
  return state === "added" ? "新增" : state === "modified" ? "修改" : state === "deleted" ? "删除" : "1 级标题";
}

function withChapterFrontmatter(markdown: string, chapterFile: string, source: string): string {
  const body = markdown.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, "").replace(/^\s+/, "");
  return `---\nocr2md_chapter_split: true\nocr2md_chapter_split_at: ${new Date().toISOString()}\nocr2md_chapter_file: ${JSON.stringify(chapterFile)}\nocr2md_chapter_source: ${JSON.stringify(source)}\n${CHAPTER_CHANGED_PROPERTY}: false\n---\n\n${body}`;
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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

async function deleteIfExists(uri: vscode.Uri): Promise<void> {
  try {
    await vscode.workspace.fs.delete(uri, { useTrash: false });
  } catch {
    // Temporary export file may already have been renamed or may never exist.
  }
}
