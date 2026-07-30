import * as http from "http";
import * as http2 from "http2";
import * as https from "https";
import * as fs from "fs";
import * as path from "path";
import * as tls from "tls";
import * as vscode from "vscode";
import {
  buildFootnotePairs,
  scanFootnoteBodies,
  scanFootnoteRefs,
  scanIllegalLineBreakCandidates,
  isMarkdownStructuralLine,
  scanRegexMatches,
  scanSuspiciousSup,
} from "./scanner";
import { splitOcrSentenceSegments } from "./sentenceSegmentation";
import { MODULE_REGEX_DEFAULTS, MODULE_REGEX_PRESETS, REGEX_PRESETS } from "./regexPresets";
import {
  renderObsidianTranslationBundle,
  type ObsidianStructureRole,
  type ObsidianTranslationUnit,
} from "./translationExport";
import type { AnnotationPair, Candidate, FileEntry, FootnotePair, PairStatus, RegexPreset, SidebarState, SourceRange, TranslationProtectedToken } from "./types";

const readonlyScheme = "ocr2md-readonly";

interface ImageDownloadProgress {
  phase: "downloading" | "complete";
  completed: number;
  total: number;
  current?: string;
  failed?: number;
  lastError?: string;
}

interface TranslationTestResult {
  success: boolean;
  message: string;
}

interface TranslationProgress {
  phase: "translating" | "exporting" | "complete";
  operation?: "translation" | "export";
  completed: number;
  total: number;
  current?: string;
  failed?: number;
  lastError?: string;
}

export function activate(context: vscode.ExtensionContext) {
  console.log("ocr2md extension activated");
  const app = new Ocr2mdApp(context);
  context.subscriptions.push(app);
}

export function deactivate() {
  // Nothing to dispose beyond subscriptions registered in activate.
}

class Ocr2mdApp implements vscode.Disposable {
  private readonly readonlyProvider = new ReadonlyMarkdownProvider();
  private readonly directoryProvider: Ocr2mdDirectoryProvider;
  private readonly directoryView: vscode.TreeView<Ocr2mdDirectoryItem>;
  private readonly regexProvider: Ocr2mdRegexProvider;
  private pairPanel: vscode.WebviewPanel | undefined;
  private files: FileEntry[] = [];
  private selectedFile: FileEntry | undefined;
  private selectedFileText = "";
  private searchPattern = "";
  private regexScopeDirectory = "";
  private regexScopeWorkspaceRoot: string | undefined;
  private regexIncludeSubdirectories = false;
  private regexSearchVersion = 0;
  private readonly moduleRegexPatterns: Record<string, string> = { ...MODULE_REGEX_DEFAULTS };
  private moduleScanVersion = 0;
  private readonlyUri: vscode.Uri | undefined;
  private workingCopyUri: vscode.Uri | undefined;
  private previewEditable = false;
  private searchMatches: Candidate[] = [];
  private searchTableRows: Candidate[] = [];
  private readonly deletedSidecarRowKeys = new Set<string>();
  private readonly ignoredSpellingKeys = new Set<string>();
  private sentenceRows: Candidate[] = [];
  private searchTableActive = false;
  private postOcrCleanMode = false;
  private imageDownloadProgress: ImageDownloadProgress | undefined;
  private deeplConfigured = false;
  private translationTestResult: TranslationTestResult | undefined;
  private translationProgress: TranslationProgress | undefined;
  private failedTranslationBlockIndexes = new Set<number>();
  private selectedCandidate: Candidate | undefined;
  private selectedPairId: string | undefined;
  private refs: Candidate[] = [];
  private bodies: Candidate[] = [];
  private suspicious: Candidate[] = [];
  private pairs: FootnotePair[] = [];
  private annotationPairs: AnnotationPair[] = [];
  private readonly singleDecoration: vscode.TextEditorDecorationType;
  private readonly refDecoration: vscode.TextEditorDecorationType;
  private readonly bodyDecoration: vscode.TextEditorDecorationType;
  private readonly headingDecorations: vscode.TextEditorDecorationType[];
  private readonly disposables: vscode.Disposable[] = [];
  private translationNodePaths: string[];

  constructor(private readonly context: vscode.ExtensionContext) {
    this.translationNodePaths = context.workspaceState.get<string[]>("ocr2md.translationNodePaths", []);
    this.singleDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: "rgba(255, 214, 10, 0.35)",
      border: "1px solid rgba(255, 214, 10, 0.9)",
      overviewRulerColor: "rgba(255, 214, 10, 0.9)",
      overviewRulerLane: vscode.OverviewRulerLane.Center,
    });
    this.refDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: "rgba(64, 156, 255, 0.35)",
      border: "1px solid rgba(64, 156, 255, 0.9)",
      overviewRulerColor: "rgba(64, 156, 255, 0.9)",
      overviewRulerLane: vscode.OverviewRulerLane.Left,
    });
    this.bodyDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: "rgba(46, 204, 113, 0.32)",
      border: "1px solid rgba(46, 204, 113, 0.9)",
      overviewRulerColor: "rgba(46, 204, 113, 0.9)",
      overviewRulerLane: vscode.OverviewRulerLane.Right,
    });
    this.headingDecorations = ["#ff5c57", "#ff9f43", "#feca57", "#9ccc65", "#55c6a9", "#d77bbf"].map((color) =>
      vscode.window.createTextEditorDecorationType({
        color,
        fontWeight: "700",
        overviewRulerColor: color,
        overviewRulerLane: vscode.OverviewRulerLane.Full,
      }),
    );

    this.directoryProvider = new Ocr2mdDirectoryProvider(
      () => this.files,
      () => vscode.workspace.workspaceFolders?.[0],
      () => this.selectedFile?.path,
      () => this.translationNodePaths,
    );
    this.directoryView = vscode.window.createTreeView("ocr2md.directory", {
      treeDataProvider: this.directoryProvider,
      canSelectMany: true,
    });
    this.regexProvider = new Ocr2mdRegexProvider(context.extensionUri, () => this.getSidebarState(), (message) =>
      this.handleSidebarMessage(message),
    );

    this.disposables.push(
      vscode.workspace.registerTextDocumentContentProvider(readonlyScheme, this.readonlyProvider),
      this.directoryView,
      vscode.window.registerWebviewViewProvider("ocr2md.regex", this.regexProvider),
      vscode.commands.registerCommand("ocr2md.refreshFiles", () => this.refreshFiles()),
      vscode.commands.registerCommand("ocr2md.pickFolder", () => this.pickWorkspaceFolder()),
      vscode.commands.registerCommand("ocr2md.openMarkdownFile", (filePath: string) => this.selectFile(filePath)),
      vscode.commands.registerCommand("ocr2md.installMarkdownPreviewStyles", () => this.installMarkdownPreviewStyles()),
      vscode.commands.registerCommand("ocr2md.addCurrentLineToModule", () => this.addCurrentLineToModule()),
      vscode.commands.registerCommand("ocr2md.openWorkingCopyHere", () => this.openWorkingCopyAtCurrentLine()),
      vscode.commands.registerCommand("ocr2md.deleteMarkdownFile", (item: Ocr2mdDirectoryItem) => this.deleteMarkdownFile(item)),
      vscode.commands.registerCommand("ocr2md.addToTranslation", (item: Ocr2mdDirectoryItem) => this.addToTranslation(item)),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.initializeWorkspace()),
      vscode.workspace.onDidSaveTextDocument((document) => this.handleSavedTextDocument(document)),
      this.singleDecoration,
      this.refDecoration,
      this.bodyDecoration,
      ...this.headingDecorations,
    );

    void this.initializeWorkspace();
  }

  dispose() {
    this.disposables.forEach((disposable) => disposable.dispose());
    this.pairPanel?.dispose();
  }

  private async initializeWorkspace() {
    await this.refreshFiles();
    if (!vscode.workspace.workspaceFolders?.length) {
      return;
    }

    try {
      await this.installMarkdownPreviewStyles({ silent: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      void vscode.window.showWarningMessage(`ocr2md 无法安装 Markdown 预览样式：${message}`);
    }
  }

  private getSidebarState(): SidebarState {
    const workspaceLabel = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "未选择";
    return {
      workspaceLabel,
      selectedFile: this.selectedFile,
      previewEditable: this.previewEditable,
      files: this.files,
      searchPattern: this.searchPattern,
      regexScopeDirectory: this.regexScopeDirectory || workspaceLabel,
      regexIncludeSubdirectories: this.regexIncludeSubdirectories,
      searchMatches: this.searchMatches,
      searchTableRows: this.searchTableRows,
      sentenceRows: this.sentenceRows,
      moduleRegexPatterns: this.moduleRegexPatterns,
      moduleRegexPresets: MODULE_REGEX_PRESETS,
      selectedCandidate: this.selectedCandidate,
      selectedPairId: this.selectedPairId,
      postOcrCleanMode: this.postOcrCleanMode,
      imageDownloadProgress: this.imageDownloadProgress,
      deeplConfigured: this.deeplConfigured,
      translationTestResult: this.translationTestResult,
      translationProgress: this.translationProgress,
      failedTranslationBlockIndexes: [...this.failedTranslationBlockIndexes],
      regexPresets: REGEX_PRESETS,
      refs: this.refs,
      bodies: this.bodies,
      suspicious: this.suspicious,
      pairs: this.pairs,
      annotationPairs: this.annotationPairs,
    };
  }

  private async handleSidebarMessage(message: WebviewMessage) {
    switch (message.command) {
      case "refreshFiles":
        await this.refreshFiles();
        break;
      case "pickFolder":
        await this.pickWorkspaceFolder();
        break;
      case "selectFile":
        if (typeof message.path === "string") {
          await this.selectFile(message.path);
        }
        break;
      case "setPreviewEditable":
        if (typeof message.previewEditable === "boolean") {
          await this.setPreviewEditable(message.previewEditable);
        }
        break;
      case "installMarkdownPreviewStyles":
        await this.installMarkdownPreviewStyles();
        break;
      case "scanRefs":
        this.scanRefs();
        break;
      case "regexChanged":
        if (typeof message.pattern === "string") {
          this.searchPattern = message.pattern;
          await this.scanSearchMatches();
        }
        break;
      case "regexScopeChanged":
        if (typeof message.regexScopeDirectory === "string") {
          this.regexScopeDirectory = message.regexScopeDirectory;
        }
        if (typeof message.regexIncludeSubdirectories === "boolean") {
          this.regexIncludeSubdirectories = message.regexIncludeSubdirectories;
        }
        await this.scanSearchMatches();
        break;
      case "scanModuleRegex":
        if (typeof message.moduleName === "string" && typeof message.pattern === "string") {
          await this.scanModuleRegex(message.moduleName, message.pattern, message.regexScopeDirectory, message.regexIncludeSubdirectories);
        }
        break;
      case "addSearchResultsToTable":
        await this.addSearchResultsToTable();
        break;
      case "scanIllegalLineBreaks":
        this.scanIllegalLineBreaks();
        break;
      case "saveAnnotations":
        await this.saveAnnotationSidecar();
        break;
      case "exportCorrectedMarkdown":
        await this.exportCorrectedMarkdown();
        break;
      case "openCorrectedWorkingCopy":
        await this.openCorrectedWorkingCopy();
        break;
      case "syncWorkingCopyCorrections":
        await this.syncWorkingCopyCorrections();
        break;
      case "scanBodies":
        this.scanBodies();
        break;
      case "showCandidate":
        if (typeof message.id === "string") {
          await this.showCandidate(message.id);
        }
        break;
      case "rejectCandidate":
        if (typeof message.id === "string") {
          this.updateCandidateStatus(message.id, "已拒绝");
        }
        break;
      case "flagCandidate":
        if (typeof message.id === "string") {
          this.updateCandidateStatus(message.id, "异常");
        }
        break;
      default:
        await this.handlePairMessage(message);
        break;
    }
  }

  private async refreshFiles() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      this.files = [];
      this.regexScopeDirectory = "";
      this.regexScopeWorkspaceRoot = undefined;
      this.regexIncludeSubdirectories = false;
      this.directoryProvider.refresh();
      this.regexProvider.update();
      return;
    }

    if (this.regexScopeWorkspaceRoot !== workspaceFolder.uri.fsPath) {
      this.regexScopeWorkspaceRoot = workspaceFolder.uri.fsPath;
      this.regexScopeDirectory = workspaceFolder.uri.fsPath;
      this.regexIncludeSubdirectories = false;
    }

    const uris = await vscode.workspace.findFiles(
      new vscode.RelativePattern(workspaceFolder, "**/*.md"),
      "{**/.git/**,**/node_modules/**,**/out/**,**/dist/**}",
      500,
    );

    this.files = uris
      .map((uri) => ({
        label: path.relative(workspaceFolder.uri.fsPath, uri.fsPath),
        path: uri.fsPath,
      }))
      .sort((left, right) => left.label.localeCompare(right.label));
    this.directoryProvider.refresh();
    this.regexProvider.update();
  }

  private async pickWorkspaceFolder() {
    const selection = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: "打开工作目录",
      title: "选择包含 OCR Markdown 文件的工作目录",
    });
    if (!selection?.[0]) {
      return;
    }
    await vscode.commands.executeCommand("vscode.openFolder", selection[0], false);
  }

  private async deleteMarkdownFile(item: Ocr2mdDirectoryItem) {
    const filePath = item?.filePath;
    const file = filePath ? this.files.find((entry) => entry.path === filePath) : undefined;
    if (!file) {
      void vscode.window.showWarningMessage("无法确定要删除的 Markdown 文件，请刷新目录后重试。");
      return;
    }

    const confirmation = await vscode.window.showWarningMessage(
      `确定将“${file.label}”移到废纸篓吗？`,
      { modal: true },
      "移到废纸篓",
    );
    if (confirmation !== "移到废纸篓") {
      return;
    }

    try {
      await vscode.workspace.fs.delete(vscode.Uri.file(file.path), { recursive: false, useTrash: true });
      if (this.selectedFile?.path === file.path) {
        this.selectedFile = undefined;
        this.selectedFileText = "";
        this.workingCopyUri = undefined;
        this.searchMatches = [];
        this.searchTableRows = [];
        this.searchTableActive = false;
        this.refs = [];
        this.bodies = [];
        this.suspicious = [];
        this.pairs = [];
        this.annotationPairs = [];
        this.updatePairPanel(undefined, undefined, false);
      }
      await this.refreshFiles();
      void vscode.window.showInformationMessage(`已将“${file.label}”移到废纸篓。`);
    } catch (error) {
      void vscode.window.showErrorMessage(`删除文件失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async addToTranslation(clickedItem?: Ocr2mdDirectoryItem) {
    const selectedItems = clickedItem
      ? (this.directoryView.selection.includes(clickedItem) ? this.directoryView.selection : [clickedItem])
      : this.directoryView.selection;
    const candidatePaths = selectedItems
      .filter((item) => item.kind === "file" || item.kind === "folder")
      .map((item) => item.nodePath)
      .filter((nodePath): nodePath is string => Boolean(nodePath));
    if (!candidatePaths.length) {
      void vscode.window.showWarningMessage("请选择要加入翻译模块的文件或目录。");
      return;
    }

    const nextPaths = new Set(this.translationNodePaths.map((nodePath) => path.resolve(nodePath)));
    let added = 0;
    for (const candidatePath of candidatePaths.map((nodePath) => path.resolve(nodePath))) {
      if ([...nextPaths].some((existingPath) => isSameOrChildPath(existingPath, candidatePath))) {
        continue;
      }
      for (const existingPath of [...nextPaths]) {
        if (isSameOrChildPath(candidatePath, existingPath)) {
          nextPaths.delete(existingPath);
        }
      }
      nextPaths.add(candidatePath);
      added += 1;
    }

    this.translationNodePaths = [...nextPaths].sort((left, right) => left.localeCompare(right));
    await this.context.workspaceState.update("ocr2md.translationNodePaths", this.translationNodePaths);
    this.directoryProvider.refresh();
    if (added) {
      void vscode.window.showInformationMessage(`已将 ${added} 个节点加入“翻译”。`);
    } else {
      void vscode.window.showInformationMessage("所选节点已经位于“翻译”中。");
    }
  }

  private async installMarkdownPreviewStyles(options: { silent?: boolean } = {}) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      if (!options.silent) {
        void vscode.window.showWarningMessage("请先打开包含 Markdown 文件的工作区。");
      }
      return;
    }

    const stylePath = ".vscode/ocr2md-markdown-preview.css";
    const styleUri = vscode.Uri.joinPath(workspaceFolder.uri, stylePath);
    const config = vscode.workspace.getConfiguration(undefined, workspaceFolder.uri);
    const currentStyles = config.get<string[]>("markdown.styles", []);
    const nextStyles = currentStyles.filter((style) => {
      const normalized = style.replace(/\\/g, "/");
      return normalized !== stylePath
        && !normalized.endsWith(`/${stylePath}`)
        && style !== styleUri.toString();
    });
    if (nextStyles.length !== currentStyles.length) {
      await config.update("markdown.styles", nextStyles, vscode.ConfigurationTarget.Workspace);
    }
    await config.update("markdown.preview.breaks", true, vscode.ConfigurationTarget.Workspace);
    await config.update("markdown.preview.scrollPreviewWithEditor", true, vscode.ConfigurationTarget.Workspace);
    await config.update("markdown.preview.scrollEditorWithPreview", true, vscode.ConfigurationTarget.Workspace);

    if (!options.silent) {
      void vscode.window.showInformationMessage("ocr2md Markdown 预览标题样式已由插件启用。");
    }
  }

  private async selectFile(filePath: string, options: { preserveTable?: boolean } = {}) {
    const file = this.files.find((entry) => entry.path === filePath) ?? {
      label: path.basename(filePath),
      path: filePath,
    };

    this.selectedFile = file;
    this.workingCopyUri = undefined;
    await this.reloadSelectedFileText();
    await this.scanSearchMatches();
    if (!options.preserveTable) {
      this.postOcrCleanMode = isOcrCorrectedMarkdown(this.selectedFileText);
    }
    this.deeplConfigured = Boolean(await this.context.secrets.get("ocr2md.deeplApiKey"));
    const loadedSidecar = options.preserveTable || this.postOcrCleanMode ? undefined : await this.loadAnnotationSidecar(file);
    if (!options.preserveTable) {
      this.searchTableRows = this.postOcrCleanMode ? scanTextBlocks(this.selectedFileText) : loadedSidecar?.rows ?? [];
      this.annotationPairs = this.postOcrCleanMode ? [] : loadedSidecar?.annotationPairs ?? [];
      this.sentenceRows = [];
      this.deletedSidecarRowKeys.clear();
      this.ignoredSpellingKeys.clear();
      loadedSidecar?.ignoredSpellings.forEach((word) => this.ignoredSpellingKeys.add(spellingKey(word)));
    }
    if (this.postOcrCleanMode && !options.preserveTable) {
      const restoredTranslations = await this.loadTranslationSidecar(file);
      if (restoredTranslations.rows.length) {
        this.restoreSavedTranslations(restoredTranslations.rows);
      }
      if (restoredTranslations.error) {
        void vscode.window.showWarningMessage(`ocr2md 翻译加载失败：${restoredTranslations.error}`);
      }
    }
    this.searchTableActive = options.preserveTable ? this.searchTableActive : this.postOcrCleanMode || this.searchTableRows.length > 0;
    this.refs = [];
    this.bodies = [];
    this.suspicious = [];
    this.pairs = [];

    this.readonlyUri = vscode.Uri.from({
      scheme: readonlyScheme,
      path: `/${encodeURIComponent(file.label).replace(/%2F/g, "/")}`,
      query: encodeURIComponent(file.path),
    });
    this.readonlyProvider.setContent(this.readonlyUri, this.selectedFileText);

    this.clearDecorations();
    await this.ensureDefaultEditorLayout();
    await this.openSelectedFilePreview();
    await this.openMarkdownPreviewPane();
    this.directoryProvider.refresh();
    this.regexProvider.update();
    this.updatePairPanel(undefined, undefined, this.searchTableActive);
    if (this.postOcrCleanMode) {
      void vscode.window.showInformationMessage(`ocr2md 已打开清洗后文本块数据表：${this.searchTableRows.length} 个文本块`);
    } else if (loadedSidecar?.loaded) {
      void vscode.window.showInformationMessage(`ocr2md 已恢复标定：${this.searchTableRows.length} 行`);
    } else if (loadedSidecar?.error) {
      void vscode.window.showWarningMessage(`ocr2md 标定恢复失败：${loadedSidecar.error}`);
    }
  }

  private async handleSavedTextDocument(document: vscode.TextDocument) {
    if (!this.selectedFile || document.uri.fsPath !== this.selectedFile.path) {
      return;
    }

    await this.reloadSelectedFileText();
    await this.scanSearchMatches();

    if (this.postOcrCleanMode) {
      this.searchTableRows = scanTextBlocks(this.selectedFileText);
      // A source edit invalidates sentence offsets, so they must be regenerated.
      this.sentenceRows = [];
      this.searchTableActive = true;
      this.updatePairPanel(undefined, undefined, true);
      return;
    }

    if (this.refs.length || this.suspicious.length) {
      this.refs = scanFootnoteRefs(this.selectedFileText);
      this.suspicious = scanSuspiciousSup(this.selectedFileText);
    }
    if (this.bodies.length) {
      this.bodies = scanFootnoteBodies(this.selectedFileText);
    }
    if (this.refs.length || this.bodies.length) {
      this.rebuildPairs();
    } else {
      this.regexProvider.update();
      this.updatePairPanel();
    }
    vscode.window.visibleTextEditors
      .filter((editor) => this.isPreviewDocument(editor.document.uri))
      .forEach((editor) => this.applyHeadingDecorations(editor));
  }

  private async reloadSelectedFileText() {
    if (!this.selectedFile) {
      return;
    }

    const uri = vscode.Uri.file(this.selectedFile.path);
    const bytes = await vscode.workspace.fs.readFile(uri);
    this.selectedFileText = Buffer.from(bytes).toString("utf8");
    if (this.readonlyUri) {
      this.readonlyProvider.setContent(this.readonlyUri, this.selectedFileText);
    }
  }

  private async setPreviewEditable(previewEditable: boolean) {
    if (this.previewEditable === previewEditable) {
      return;
    }

    this.clearDecorations();
    this.previewEditable = previewEditable;
    if (this.selectedFile) {
      await this.ensureDefaultEditorLayout();
      await this.openSelectedFilePreview();
      await this.openMarkdownPreviewPane();
    }
    this.regexProvider.update();
  }

  private async ensureDefaultEditorLayout() {
    await vscode.commands.executeCommand("vscode.setEditorLayout", {
      orientation: 1,
      groups: [
        { size: 0.56 },
        { size: 0.44 },
      ],
    });
  }

  private async openSelectedFilePreview() {
    if (!this.selectedFile) {
      return;
    }

    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(this.selectedFile.path));
    const editor = await vscode.window.showTextDocument(document, { preview: false, viewColumn: vscode.ViewColumn.One });
    await this.applySourceEditMode();
    this.applyHeadingDecorations(editor);
  }

  private async applySourceEditMode() {
    const command = this.previewEditable
      ? "workbench.action.files.resetActiveEditorReadonlyInSession"
      : "workbench.action.files.setActiveEditorReadonlyInSession";
    try {
      await vscode.commands.executeCommand(command);
    } catch {
      // Older VS Code builds may not expose the per-editor readonly command.
    }
  }

  private async openMarkdownPreviewPane() {
    if (!this.selectedFile) {
      return;
    }

    await this.installMarkdownPreviewStyles({ silent: true });

    const sourceUri = vscode.Uri.file(this.selectedFile.path);
    try {
      await vscode.commands.executeCommand("vscode.openWith", sourceUri, "vscode.markdown.preview.editor", {
        preview: false,
        viewColumn: vscode.ViewColumn.Two,
      });
    } catch {
      const document = await vscode.workspace.openTextDocument(sourceUri);
      await vscode.window.showTextDocument(document, {
        preview: false,
        viewColumn: vscode.ViewColumn.Two,
        preserveFocus: false,
      });
      await vscode.commands.executeCommand("markdown.showPreview");
    }
  }

  private async openCorrectedWorkingCopy() {
    if (!this.selectedFile) {
      void vscode.window.showWarningMessage("请先选择一个 Markdown 文件。");
      return;
    }

    const file = this.selectedFile;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(file.path)) ?? vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      void vscode.window.showWarningMessage("请先打开工作区。");
      return;
    }

    const ensured = await this.ensureCorrectedWorkingCopy(file, workspaceFolder);
    if (!ensured) return;
    const { uri: workingUri, result } = ensured;

    const document = await vscode.workspace.openTextDocument(workingUri);
    const editor = await vscode.window.showTextDocument(document, { preview: false, viewColumn: vscode.ViewColumn.Two, preserveFocus: false });
    this.applyHeadingDecorations(editor);
    const message = result
      ? `已基于原文件创建注释工作稿：应用 ${result.applied} 项注释标定，待确认 ${result.skipped.length} 项；其他模块标定未应用。`
      : "已打开现有注释工作稿；原始文件未修改。";
    void vscode.window.showInformationMessage(message);
  }

  private async ensureCorrectedWorkingCopy(
    file: FileEntry,
    workspaceFolder: vscode.WorkspaceFolder,
  ): Promise<{ uri: vscode.Uri; result?: { text: string; applied: number; skipped: string[] } } | undefined> {
    const workingDirectory = vscode.Uri.joinPath(workspaceFolder.uri, ".ocr2md", "working");
    const workingUri = this.workingCopyUriForFile(file, workspaceFolder);
    this.workingCopyUri = workingUri;

    let result: { text: string; applied: number; skipped: string[] } | undefined;
    try {
      await vscode.workspace.fs.stat(workingUri);
    } catch {
      result = this.buildCorrectedWorkingCopy();
      if (!result) return undefined;
      await vscode.workspace.fs.createDirectory(workingDirectory);
      await vscode.workspace.fs.writeFile(workingUri, Buffer.from(result.text, "utf8"));
    }
    return { uri: workingUri, result };
  }

  private async openWorkingCopyAtCurrentLine() {
    const sourceEditor = vscode.window.activeTextEditor;
    const file = this.selectedFile;
    if (!sourceEditor || !file || sourceEditor.document.uri.fsPath !== file.path) {
      void vscode.window.showWarningMessage("请先在 ocr2md 只读源码预览中定位到要查看的位置。");
      return;
    }

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(file.path)) ?? vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      void vscode.window.showWarningMessage("请先打开工作区。");
      return;
    }

    const sourcePosition = sourceEditor.selection.active;
    const ensured = await this.ensureCorrectedWorkingCopy(file, workspaceFolder);
    if (!ensured) return;

    const workingBytes = await vscode.workspace.fs.readFile(ensured.uri);
    const workingText = Buffer.from(workingBytes).toString("utf8");
    const targetLine = findWorkingLineForSourceLine(this.selectedFileText, workingText, sourcePosition.line);
    const document = await vscode.workspace.openTextDocument(ensured.uri);
    const editor = await vscode.window.showTextDocument(document, {
      preview: false,
      viewColumn: vscode.ViewColumn.Two,
      preserveFocus: false,
    });
    const line = document.lineAt(Math.max(0, Math.min(targetLine, document.lineCount - 1)));
    const character = Math.min(sourcePosition.character, line.text.length);
    const position = new vscode.Position(line.lineNumber, character);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(line.range, vscode.TextEditorRevealType.InCenter);
    this.applyHeadingDecorations(editor);

    if (ensured.result) {
      void vscode.window.showInformationMessage("已基于原文件创建注释工作稿，并定位到对应内容；其他模块标定未应用。");
    }
  }

  private workingCopyUriForFile(file: FileEntry, workspaceFolder: vscode.WorkspaceFolder): vscode.Uri {
    const sourceStem = path.basename(file.path, path.extname(file.path));
    const relativePath = path.relative(workspaceFolder.uri.fsPath, file.path).replace(/[\\/]/g, "__");
    return vscode.Uri.joinPath(workspaceFolder.uri, ".ocr2md", "working", `${relativePath || sourceStem}.working.md`);
  }

  private async syncWorkingCopyCorrections() {
    if (!this.selectedFile) {
      void vscode.window.showWarningMessage("请先选择一个 Markdown 文件。");
      return;
    }
    const file = this.selectedFile;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(file.path)) ?? vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      void vscode.window.showWarningMessage("请先打开工作区。");
      return;
    }
    const workingUri = this.workingCopyUri ?? this.workingCopyUriForFile(file, workspaceFolder);
    let workingText: string;
    try {
      workingText = Buffer.from(await vscode.workspace.fs.readFile(workingUri)).toString("utf8");
    } catch {
      void vscode.window.showWarningMessage("尚未找到订正工作稿。请先点击“打开订正工作稿”。");
      return;
    }
    const workingSourceLines = mapWorkingLinesToSourceLines(this.selectedFileText, workingText);

    // Compare body occurrences rather than only unique keys. A correction may
    // legitimately add another body with the same number or even the same text.
    const originalBodyCounts = new Map<string, number>();
    for (const body of extractAnnotationBodies(this.selectedFileText)) {
      const key = annotationBodyKey(body);
      originalBodyCounts.set(key, (originalBodyCounts.get(key) ?? 0) + 1);
    }
    const originalRefLocationCounts = new Map<string, number>();
    for (const ref of extractAnnotationRefs(this.selectedFileText)) {
      const key = `${ref.number}\u0000${ref.line}`;
      originalRefLocationCounts.set(key, (originalRefLocationCounts.get(key) ?? 0) + 1);
    }
    const existingWorkingBodyRows = new Map(
      this.searchTableRows
        .filter((row) => row.isWorkingCorrection && row.workingCopyPath === workingUri.fsPath && row.lineType === "注释正文")
        .map((row) => [annotationBodyKey({
          number: row.annotationNumber ?? annotationNumberFromText(row.raw, row.lineType) ?? "",
          content: row.raw.replace(/^\s*(?:\[\^\d+\]:|\d+\.|\(\d+\))\s+/, ""),
        }), row]),
    );
    const existingWorkingBodyRowsByLocation = new Map(
      this.searchTableRows
        .filter((row) => row.isWorkingCorrection && row.workingCopyPath === workingUri.fsPath && row.lineType === "注释正文")
        .map((row) => [
          `${row.annotationNumber ?? annotationNumberFromText(row.raw, row.lineType) ?? ""}\u0000${row.sourceLine ?? row.range.line}`,
          row,
        ]),
    );
    const existingWorkingRefRows = new Map(
      this.searchTableRows
        .filter((row) => row.isWorkingCorrection && row.workingCopyPath === workingUri.fsPath && row.lineType === "注释引用")
        .map((row) => [`${row.annotationNumber ?? annotationNumberFromText(row.raw, row.lineType) ?? ""}\u0000${row.range.line}\u0000${row.range.start}`, row]),
    );
    const existingWorkingRefRowsBySourceLocation = new Map(
      this.searchTableRows
        .filter((row) => row.isWorkingCorrection && row.workingCopyPath === workingUri.fsPath && row.lineType === "注释引用")
        .map((row) => [
          `${row.annotationNumber ?? annotationNumberFromText(row.raw, row.lineType) ?? ""}\u0000${row.sourceLine ?? row.range.line}`,
          row,
        ]),
    );
    const imported = new Map<string, Candidate>();
    const workingBodies = extractAnnotationBodies(workingText);
    const workingBodyCounts = new Map<string, number>();
    for (const body of workingBodies) {
      const bodyKey = annotationBodyKey(body);
      const occurrence = (workingBodyCounts.get(bodyKey) ?? 0) + 1;
      workingBodyCounts.set(bodyKey, occurrence);
      if (occurrence <= (originalBodyCounts.get(bodyKey) ?? 0)) {
        continue;
      }
      const correctionKey = `${bodyKey}\u0000${occurrence}`;
      const sourceLine = workingSourceLines[body.line] ?? body.line;
      const existing = existingWorkingBodyRows.get(correctionKey)
        ?? existingWorkingBodyRows.get(bodyKey)
        ?? existingWorkingBodyRowsByLocation.get(`${body.number}\u0000${sourceLine}`);
      imported.set(`body\u0000${correctionKey}`, {
        id: existing?.id ?? `working-annotation-${encodeURIComponent(file.path)}-${body.number}-${body.line}-${occurrence}`,
        kind: "regex",
        label: body.number,
        raw: body.text,
        preview: body.text,
        regexSource: "工作稿人工补充",
        annotationNumber: body.number,
        isWorkingCorrection: true,
        workingCopyPath: workingUri.fsPath,
        sourceLine,
        range: { line: body.line, start: 0, end: body.text.length },
        typeLabel: "注释",
        lineType: "注释正文",
        // Keep the original source as the pairing identity. Navigation uses
        // workingCopyPath so clicking this row opens the editable work file.
        sourcePath: file.path,
        sourceLabel: `工作稿修正：${file.label}`,
        status: "候选",
      });
    }

    const workingRefs = extractAnnotationRefs(workingText);
    const workingRefLocationCounts = new Map<string, number>();
    let importedRefCount = 0;
    for (const ref of workingRefs) {
      const sourceLine = workingSourceLines[ref.line] ?? ref.line;
      const sourceLocationKey = `${ref.number}\u0000${sourceLine}`;
      const occurrence = (workingRefLocationCounts.get(sourceLocationKey) ?? 0) + 1;
      workingRefLocationCounts.set(sourceLocationKey, occurrence);
      if (occurrence <= (originalRefLocationCounts.get(sourceLocationKey) ?? 0)) {
        continue;
      }
      const locationKey = `${ref.number}\u0000${ref.line}\u0000${ref.start}`;
      const existing = existingWorkingRefRows.get(locationKey)
        ?? existingWorkingRefRowsBySourceLocation.get(sourceLocationKey);
      imported.set(`ref\u0000${locationKey}`, {
        id: existing?.id ?? `working-annotation-ref-${encodeURIComponent(file.path)}-${ref.number}-${ref.line}-${ref.start}`,
        kind: "regex",
        label: ref.number,
        raw: ref.text,
        preview: ref.preview,
        regexSource: "工作稿人工补充",
        annotationNumber: ref.number,
        isWorkingCorrection: true,
        workingCopyPath: workingUri.fsPath,
        sourceLine,
        range: { line: ref.line, start: ref.start, end: ref.end },
        typeLabel: "注释",
        lineType: "注释引用",
        sourcePath: file.path,
        sourceLabel: `工作稿修正：${file.label}`,
        status: "候选",
      });
      importedRefCount += 1;
    }

    // Synchronization is intentionally non-destructive. A working copy may have
    // been recreated from the source, so absence there is not sufficient proof
    // that the user intended to delete an earlier correction. Explicit removal
    // remains available through the data table's Ignore action.
    const mergedRows = new Map(this.searchTableRows.map((row) => [row.id, row]));
    imported.forEach((row) => mergedRows.set(row.id, row));
    const importedIds = new Set([...imported.values()].map((row) => row.id));
    const preservedHistoryCount = this.searchTableRows.filter((row) =>
      row.isWorkingCorrection && row.workingCopyPath === workingUri.fsPath && !importedIds.has(row.id)
    ).length;
    this.searchTableRows = [...mergedRows.values()].sort(compareCandidatesByPosition);
    this.searchTableActive = this.searchTableRows.length > 0;
    this.workingCopyUri = workingUri;
    this.updatePairPanel();
    const importedBodyCount = imported.size - importedRefCount;
    const preservedMessage = preservedHistoryCount ? `；保留历史修正 ${preservedHistoryCount} 条` : "";
    const message = `工作稿检测到引用 ${workingRefs.length} 条、正文 ${workingBodies.length} 条；已同步引用 ${importedRefCount} 条、正文 ${importedBodyCount} 条${preservedMessage}。`;
    if (imported.size) {
      void vscode.window.showInformationMessage(message);
    } else {
      void vscode.window.showWarningMessage(`${message} 请确认新增引用使用 <sup>n</sup>、<sup>(n)</sup> 或 [^n]，新增正文以 [^n]:、n.、(n) 或（n）开头，并已保存工作稿。`);
    }
  }

  private buildCorrectedWorkingCopy(): { text: string; applied: number; skipped: string[] } | undefined {
    if (!this.selectedFile) {
      return undefined;
    }
    const annotationRows = this.searchTableRows.filter((row) =>
      row.typeLabel === "注释" && (!row.sourcePath || row.sourcePath === this.selectedFile!.path)
    );
    return applyMarkdownCorrections(this.selectedFileText, annotationRows);
  }

  private scanRefs() {
    if (!this.ensureFileSelected()) {
      return;
    }

    this.refs = scanFootnoteRefs(this.selectedFileText);
    this.suspicious = scanSuspiciousSup(this.selectedFileText);
    this.rebuildPairs();
  }

  private async scanSearchMatches() {
    const searchVersion = ++this.regexSearchVersion;
    const pattern = this.searchPattern;
    if (!pattern.trim()) {
      this.searchMatches = [];
      this.regexProvider.updateSearchResults();
      return;
    }

    const matches = await this.scanRegexMatchesInScope(pattern, this.regexScopeDirectory, this.regexIncludeSubdirectories);
    if (searchVersion !== this.regexSearchVersion) {
      return;
    }
    this.searchMatches = matches;
    this.regexProvider.updateSearchResults();
  }

  private async scanRegexMatchesInScope(pattern: string, scopeDirectoryValue: string, includeSubdirectories: boolean): Promise<Candidate[]> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder || !pattern.trim()) {
      return [];
    }

    const workspaceRoot = path.resolve(workspaceFolder.uri.fsPath);
    const requestedScope = scopeDirectoryValue.trim() || workspaceRoot;
    const scopeDirectory = path.resolve(requestedScope);

    let files: vscode.Uri[];
    try {
      files = await vscode.workspace.findFiles(
        new vscode.RelativePattern(vscode.Uri.file(scopeDirectory), includeSubdirectories ? "**/*.md" : "*.md"),
        "{**/.git/**,**/node_modules/**,**/out/**,**/dist/**}",
        500,
      );
    } catch {
      files = [];
    }

    const scanned = await Promise.all(files.map(async (uri) => {
      try {
        const text = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8");
        return scanRegexMatches(text, pattern).map((candidate, index) => ({
          ...candidate,
          id: `regex-${encodeURIComponent(uri.fsPath)}-${candidate.range.line}-${candidate.range.start}-${index}`,
          sourcePath: uri.fsPath,
          sourceLabel: path.relative(workspaceRoot, uri.fsPath) || path.basename(uri.fsPath),
        }));
      } catch {
        return [] as Candidate[];
      }
    }));

    return scanned.flat();
  }

  private async scanModuleRegex(moduleName: string, pattern: string, scopeDirectory?: string, includeSubdirectories?: boolean) {
    if (!(moduleName in MODULE_REGEX_DEFAULTS)) {
      return;
    }
    const scanVersion = ++this.moduleScanVersion;
    this.moduleRegexPatterns[moduleName] = pattern;
    if (scopeDirectory !== undefined) {
      this.regexScopeDirectory = scopeDirectory;
    }
    if (includeSubdirectories !== undefined) {
      this.regexIncludeSubdirectories = includeSubdirectories;
    }
    const patterns = splitModuleRegexPatterns(pattern);
    if (!patterns.length) {
      return;
    }
    const scopedMatchGroups = await Promise.all(patterns.map(async (singlePattern) =>
      (await this.scanRegexMatchesInScope(
        singlePattern,
        scopeDirectory ?? this.regexScopeDirectory,
        includeSubdirectories ?? this.regexIncludeSubdirectories,
      )).map((candidate) => ({ ...candidate, regexSource: singlePattern })),
    ));
    const scopedMatches = scopedMatchGroups.flat();
    // Typing in the exploratory regex field can issue scans in quick
    // succession. Ignore a slower, older scan instead of overwriting newer
    // results and focus state.
    if (scanVersion !== this.moduleScanVersion) {
      return;
    }
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const selectedFile = this.selectedFile;
    const selectedFileMatches = selectedFile
      ? patterns.flatMap((singlePattern) => scanRegexMatches(this.selectedFileText, singlePattern).map((candidate) => ({ ...candidate, regexSource: singlePattern }))).map((candidate, index) => ({
          ...candidate,
          id: `regex-${encodeURIComponent(selectedFile.path)}-${candidate.range.line}-${candidate.range.start}-${index}`,
          sourcePath: selectedFile.path,
          sourceLabel: workspaceRoot
            ? path.relative(workspaceRoot, selectedFile.path) || path.basename(selectedFile.path)
            : path.basename(selectedFile.path),
        }))
      : [];
    // 未分类 is a live exploration result set, not an accumulating bucket.
    // Remove its previous candidates before adding exact matches for the new
    // pattern. Rows already assigned to a real module remain untouched.
    const retainedRows = moduleName === "未分类"
      ? this.searchTableRows.filter((candidate) => (candidate.typeLabel ?? "未分类") !== "未分类")
      : this.searchTableRows;
    // Existing unclassified rows still help dedicated module scans promote
    // candidates without requiring another directory walk.
    const tableMatches = moduleName === "未分类"
      ? []
      : this.searchTableRows.filter((candidate) =>
          (candidate.typeLabel ?? "未分类") === "未分类" && patterns.some((singlePattern) => regexMatchesCandidate(candidate, singlePattern)),
        );
    const matches = await this.excludeStructuralModuleMatches(
      moduleName,
      [...scopedMatches, ...selectedFileMatches, ...tableMatches],
    );
    const cleanedRetainedRows = await this.excludeStructuralModuleMatches(moduleName, retainedRows, true);
    if (scanVersion !== this.moduleScanVersion) {
      return;
    }
    const existing = new Map(cleanedRetainedRows.map((candidate) => [tableRowKey(candidate), candidate]));
    for (const candidate of matches) {
      const key = tableRowKey(candidate);
      this.deletedSidecarRowKeys.delete(key);
      const existingRow = existing.get(key);
      if (existingRow) {
        // A directory-wide generic scan initially places rows in 未分类. When a
        // module rule later recognizes one, promote it into that module. Rows
        // already classified by the user in another module remain untouched.
        if ((existingRow.typeLabel ?? "未分类") === "未分类" || existingRow.typeLabel === moduleName) {
          existing.set(key, {
            ...existingRow,
            typeLabel: moduleName,
            lineType: existingRow.lineType ?? defaultLineTypeForModule(moduleName, candidate.raw),
            regexSource: existingRow.regexSource ?? candidate.regexSource,
            annotationNumber: existingRow.annotationNumber || annotationNumberFromText(candidate.raw, defaultLineTypeForModule(moduleName, candidate.raw)),
            preview: moduleName === "非法断行" ? candidate.preview : existingRow.preview,
            range: moduleName === "非法断行" ? candidate.range : existingRow.range,
          });
        }
        continue;
      }
      existing.set(key, {
        ...candidate,
        id: `table-${key}`,
        typeLabel: moduleName,
        lineType: defaultLineTypeForModule(moduleName, candidate.raw),
        annotationNumber: annotationNumberFromText(candidate.raw, defaultLineTypeForModule(moduleName, candidate.raw)),
      });
    }
    this.searchTableRows = [...existing.values()].sort(compareCandidatesByPosition);
    this.searchTableActive = true;
    this.regexProvider.updateSearchResults();
    this.updatePairPanel(undefined, undefined, true);
  }

  private async excludeStructuralModuleMatches(
    moduleName: string,
    candidates: Candidate[],
    assignedRowsOnly = false,
  ): Promise<Candidate[]> {
    if (moduleName !== "非法断行") {
      return candidates;
    }

    const sourceTexts = new Map<string, string>();
    if (this.selectedFile) {
      sourceTexts.set(this.selectedFile.path, this.selectedFileText);
    }
    const sourcePaths = [...new Set(candidates
      .filter((candidate) => !assignedRowsOnly || candidate.typeLabel === moduleName)
      .map((candidate) => candidate.sourcePath)
      .filter((sourcePath): sourcePath is string => Boolean(sourcePath) && !sourceTexts.has(sourcePath!)))];
    await Promise.all(sourcePaths.map(async (sourcePath) => {
      try {
        sourceTexts.set(sourcePath, Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.file(sourcePath))).toString("utf8"));
      } catch {
        // Keep the candidate when its source cannot be read; manual review is
        // preferable to silently dropping an unknown row.
      }
    }));
    const sourceLines = new Map([...sourceTexts].map(([sourcePath, text]) => [sourcePath, text.split(/\r?\n/)]));

    return candidates.flatMap((candidate) => {
      if (assignedRowsOnly && candidate.typeLabel !== moduleName) {
        return [candidate];
      }
      const sourcePath = candidate.sourcePath ?? this.selectedFile?.path;
      const lines = sourcePath ? sourceLines.get(sourcePath) : undefined;
      const line = lines?.[candidate.range.line];
      if (line !== undefined && isMarkdownStructuralLine(line)) {
        return [];
      }
      if (!lines || candidate.range.endLine !== undefined) {
        return [candidate];
      }
      let nextLine = candidate.range.line + 1;
      while (nextLine < lines.length && !lines[nextLine].trim() && nextLine - candidate.range.line <= 2) {
        nextLine += 1;
      }
      if (nextLine >= lines.length || nextLine - candidate.range.line > 2 || isMarkdownStructuralLine(lines[nextLine])) {
        return [];
      }
      return [{
        ...candidate,
        preview: `${line?.trim() ?? candidate.preview} ⏎ ${lines[nextLine].trim()}`,
        range: { ...candidate.range, endLine: nextLine, end: lines[nextLine].length },
      }];
    });
  }

  private async addSearchResultsToTable() {
    if (!this.selectedFile) {
      const firstResult = this.searchMatches.find((candidate) => candidate.sourcePath);
      if (!firstResult?.sourcePath) {
        void vscode.window.showWarningMessage("没有可加入数据表的正则搜索结果。");
        return;
      }
      await this.selectFile(firstResult.sourcePath);
    }

    if (!this.selectedFile) {
      return;
    }

    const existingByKey = new Map(this.searchTableRows.map((candidate) => [tableRowKey(candidate), candidate]));
    const mergedRows = [...this.searchTableRows];

    if (!this.searchMatches.length) {
      void vscode.window.showInformationMessage("没有可加入数据表的正则搜索结果。");
      return;
    }
    for (const candidate of this.searchMatches) {
      const key = tableRowKey(candidate);
      if (existingByKey.has(key)) {
        continue;
      }
      const row = {
        ...candidate,
        id: `table-${key}`,
        typeLabel: candidate.typeLabel ?? "未分类",
      };
      existingByKey.set(key, row);
      mergedRows.push(row);
    }

    this.searchTableRows = mergedRows.sort((left, right) => {
      const sourceOrder = (left.sourceLabel ?? "").localeCompare(right.sourceLabel ?? "");
      if (sourceOrder !== 0) {
        return sourceOrder;
      }
      if (left.range.line !== right.range.line) {
        return left.range.line - right.range.line;
      }
      return left.range.start - right.range.start;
    });
    this.searchTableActive = true;
    this.updatePairPanel(undefined, undefined, true);
  }

  private scanIllegalLineBreaks() {
    if (!this.ensureFileSelected()) {
      return;
    }
    this.searchMatches = scanIllegalLineBreakCandidates(this.selectedFileText);
    this.regexProvider.updateSearchResults();
  }

  private async addCurrentLineToModule() {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== "markdown" || editor.document.uri.scheme !== "file") {
      void vscode.window.showWarningMessage("请先在 Markdown 源码编辑器中定位到要标定的行。");
      return;
    }

    const moduleName = await vscode.window.showQuickPick(
      ["未分类", "注释", "标题", "图片", "非法断行"],
      { placeHolder: "将当前行加入哪个 ocr2md 模块？" },
    );
    if (!moduleName) {
      return;
    }

    const sourcePath = editor.document.uri.fsPath;
    if (this.selectedFile?.path !== sourcePath) {
      await this.selectFile(sourcePath, { preserveTable: this.searchTableRows.length > 0 });
    }

    let lineNumber = editor.selection.active.line;
    // Right-clicking near an end-of-line can place VS Code's caret on the next
    // blank line. For line annotation, use the preceding content line instead.
    while (lineNumber > 0 && !editor.document.lineAt(lineNumber).text.trim()) {
      lineNumber -= 1;
    }
    const line = editor.document.lineAt(lineNumber);
    const linePreview = line.text.trimStart();
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const candidate: Candidate = {
      id: "",
      kind: "regex",
      label: linePreview.trim() || `L${line.lineNumber + 1}`,
      raw: line.text,
      preview: linePreview,
      range: { line: line.lineNumber, start: 0, end: line.text.length },
      sourcePath,
      sourceLabel: workspaceRoot ? path.relative(workspaceRoot, sourcePath) || path.basename(sourcePath) : path.basename(sourcePath),
      typeLabel: moduleName,
      lineType: defaultLineTypeForModule(moduleName, line.text) ?? (moduleName === "注释" ? "注释引用" : undefined),
      annotationNumber: moduleName === "注释"
        ? annotationNumberFromText(line.text, defaultLineTypeForModule(moduleName, line.text))
        : undefined,
      status: "候选",
    };
    const key = tableRowKey(candidate);
    this.deletedSidecarRowKeys.delete(key);
    candidate.id = `table-${key}`;
    const index = this.searchTableRows.findIndex((row) => tableRowKey(row) === key);
    if (index >= 0) {
      this.searchTableRows[index] = {
        ...this.searchTableRows[index],
        typeLabel: moduleName,
        lineType: candidate.lineType ?? this.searchTableRows[index].lineType,
        annotationNumber: candidate.annotationNumber || this.searchTableRows[index].annotationNumber,
      };
    } else {
      this.searchTableRows.push(candidate);
      this.searchTableRows.sort(compareCandidatesByPosition);
    }
    this.searchTableActive = true;
    this.updatePairPanel(candidate, undefined, true);
    void vscode.window.showInformationMessage(`已将第 ${line.lineNumber + 1} 行加入“${moduleName}”模块。`);
  }

  private setSearchRowsType(ids: string[], typeLabel: string) {
    const selectedIds = new Set(ids);
    if (typeLabel === "ignore") {
      const selectedSpellings = new Set(
        this.searchTableRows
          .filter((candidate) => selectedIds.has(candidate.id) && candidate.typeLabel === "拼写检查")
          .map((candidate) => spellingKey(candidate.raw)),
      );
      const shouldIgnore = (candidate: Candidate) =>
        selectedIds.has(candidate.id) ||
        (candidate.typeLabel === "拼写检查" && selectedSpellings.has(spellingKey(candidate.raw)));
      this.searchTableRows
        .filter(shouldIgnore)
        .forEach((candidate) => {
          this.deletedSidecarRowKeys.add(tableRowKey(candidate));
          if (candidate.typeLabel === "拼写检查") {
            this.ignoredSpellingKeys.add(spellingKey(candidate.raw));
          }
        });
      this.searchTableRows = this.searchTableRows.filter((candidate) => !shouldIgnore(candidate));
      this.searchTableActive = this.searchTableRows.length > 0;
      this.updatePairPanel();
      return;
    }

    this.searchTableRows = this.searchTableRows.map((candidate) => {
      if (!selectedIds.has(candidate.id)) {
        return candidate;
      }
      return {
        ...candidate,
        typeLabel,
        // The table displays this as the default already. Persist it as well so
        // future sidecar loads and exports do not lose the intended ref type.
        lineType: typeLabel === "注释" ? candidate.lineType ?? "注释引用" : candidate.lineType,
        annotationNumber: typeLabel === "注释"
          ? candidate.annotationNumber || annotationNumberFromText(candidate.raw, candidate.lineType ?? "注释引用")
          : candidate.annotationNumber,
      };
    });
    this.updatePairPanel();
  }

  private setSearchRowsLineType(ids: string[], lineType: string) {
    const selectedIds = new Set(ids);
    const selectedSpellings = new Set(
      this.searchTableRows
        .filter((candidate) => selectedIds.has(candidate.id) && candidate.typeLabel === "拼写检查")
        .map((candidate) => spellingKey(candidate.raw)),
    );
    if (lineType === "忽略" || lineType === "ignore") {
      selectedSpellings.forEach((word) => this.ignoredSpellingKeys.add(word));
      this.searchTableRows
        .filter((candidate) =>
          selectedIds.has(candidate.id) ||
          (candidate.typeLabel === "拼写检查" && selectedSpellings.has(spellingKey(candidate.raw))),
        )
        .forEach((candidate) => this.deletedSidecarRowKeys.add(tableRowKey(candidate)));
      this.searchTableRows = this.searchTableRows.filter(
        (candidate) =>
          !selectedIds.has(candidate.id) &&
          !(candidate.typeLabel === "拼写检查" && selectedSpellings.has(spellingKey(candidate.raw))),
      );
      this.searchTableActive = this.searchTableRows.length > 0;
      this.updatePairPanel();
      return;
    }
    this.searchTableRows = this.searchTableRows.map((candidate) => {
      const applies = selectedIds.has(candidate.id) || (candidate.typeLabel === "拼写检查" && selectedSpellings.has(spellingKey(candidate.raw)));
      if (!applies) return candidate;
      return {
        ...candidate,
        lineType,
        annotationNumber: candidate.typeLabel === "注释"
          ? annotationNumberFromText(candidate.raw, lineType) ?? candidate.annotationNumber
          : candidate.annotationNumber,
      };
    });
    this.updatePairPanel();
  }

  private setSearchRowsChapterFile(ids: string[], chapterFile: string) {
    const selectedIds = new Set(ids);
    this.searchTableRows = this.searchTableRows.map((candidate) =>
      selectedIds.has(candidate.id) ? { ...candidate, chapterFile } : candidate,
    );
    this.updatePairPanel();
  }

  private setSearchRowsChapterFiles(chapterFiles: Record<string, string>) {
    this.searchTableRows = this.searchTableRows.map((candidate) => {
      const chapterFile = chapterFiles[candidate.id];
      return chapterFile === undefined ? candidate : { ...candidate, chapterFile };
    });
    this.updatePairPanel();
  }

  private assignAnnotationsToChapterFiles(options: { silent?: boolean } = {}) {
    this.rebuildAnnotationPairs();
    const titleRows = this.searchTableRows
      .filter((row) => row.typeLabel === "标题" && row.chapterFile?.trim() && row.sourcePath)
      .sort(compareCandidatesByGlobalPosition);
    if (!titleRows.length) {
      if (!options.silent) {
        void vscode.window.showWarningMessage("标题模块尚未设置章节文件。");
      }
      return;
    }

    const candidateById = new Map(this.searchTableRows.map((row) => [row.id, row]));
    const assignments = new Map<string, string>();
    let assignedPairs = 0;
    let skippedPairs = 0;
    for (const pair of this.annotationPairs) {
      const ref = pair.refCandidateId ? candidateById.get(pair.refCandidateId) : undefined;
      const body = pair.bodyCandidateId ? candidateById.get(pair.bodyCandidateId) : undefined;
      if (!ref || !body) {
        skippedPairs += 1;
        continue;
      }
      const chapter = [...titleRows]
        .reverse()
        .find((title) => compareCandidatesByGlobalPosition(title, ref) <= 0);
      if (!chapter?.chapterFile) {
        skippedPairs += 1;
        continue;
      }
      assignments.set(ref.id, chapter.chapterFile);
      assignments.set(body.id, chapter.chapterFile);
      assignedPairs += 1;
    }
    this.searchTableRows = this.searchTableRows.map((row) =>
      assignments.has(row.id) ? { ...row, chapterFile: assignments.get(row.id) } : row,
    );
    this.updatePairPanel(undefined, undefined, true);
    if (!options.silent) {
      const skippedMessage = skippedPairs ? `，跳过 ${skippedPairs} 个不完整 Pair` : "";
      void vscode.window.showInformationMessage(`已将 ${assignedPairs} 组注释分配到章节文件${skippedMessage}。请保存标定。`);
    }
  }

  private setSearchRowReplacement(candidateId: string, replacement: string) {
    const target = this.searchTableRows.find((candidate) => candidate.id === candidateId);
    const targetSpelling = target?.typeLabel === "拼写检查" ? spellingKey(target.raw) : undefined;
    const normalizedReplacement = target?.typeLabel === "非法断行" && target.lineType === "单行订正"
      ? normalizeSingleLineCorrection(replacement)
      : target?.typeLabel === "拼写检查"
        ? normalizeSpellingReplacement(replacement)
        : replacement.trim();
    this.searchTableRows = this.searchTableRows.map((candidate) =>
      candidate.id === candidateId || (candidate.typeLabel === "拼写检查" && targetSpelling === spellingKey(candidate.raw))
        ? { ...candidate, replacement: normalizedReplacement }
        : candidate,
    );
    this.updatePairPanel();
  }

  private async scanSpelling() {
    if (!this.ensureFileSelected()) {
      return;
    }

    try {
      const sourcePath = this.selectedFile!.path;
      const openSourceDocument = vscode.workspace.textDocuments.find((document) =>
        document.uri.scheme === "file" && document.uri.fsPath === sourcePath
      );
      if (openSourceDocument) {
        this.selectedFileText = openSourceDocument.getText();
      } else {
        await this.reloadSelectedFileText();
      }
      const candidates = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: "ocr2md 正在扫描拼写错误", cancellable: false },
        async () => scanCSpellCandidates(this.selectedFileText, sourcePath),
      );
      const existingSpellingRows = this.searchTableRows.filter((candidate) => candidate.typeLabel === "拼写检查");
      const existingPolicies = new Map<string, Candidate>();
      const policyPriority = (candidate: Candidate) => {
        if (candidate.lineType === "已确认") return 4;
        if (candidate.lineType === "latex") return 3;
        if (candidate.lineType === "待确认") return 2;
        return 1;
      };
      for (const candidate of existingSpellingRows) {
        const key = spellingKey(candidate.raw);
        const previous = existingPolicies.get(key);
        if (!previous || policyPriority(candidate) >= policyPriority(previous)) {
          existingPolicies.set(key, candidate);
        }
      }
      const activeCandidates = candidates.filter((candidate) => !this.ignoredSpellingKeys.has(spellingKey(candidate.raw)));
      const preservedCandidates = activeCandidates.map((candidate) => {
        const previous = existingPolicies.get(spellingKey(candidate.raw));
        const inferredReplacement = inferJoinedOcrReplacement(candidate.raw, existingPolicies);
        return previous
          ? {
            ...candidate,
            lineType: previous.lineType,
            replacement: normalizeSpellingReplacement(previous.replacement || candidate.replacement || ""),
          }
          : inferredReplacement
            ? {
              ...candidate,
              suggestions: [inferredReplacement, ...(candidate.suggestions ?? [])],
              replacement: inferredReplacement,
              reason: "疑似 OCR 粘连词",
            }
            : candidate;
      });
      const retainedOtherFileRows = existingSpellingRows.filter((candidate) =>
        Boolean(candidate.sourcePath) && candidate.sourcePath !== sourcePath
      );
      const previousCurrentFileCount = existingSpellingRows.length - retainedOtherFileRows.length;
      const migratedCount = preservedCandidates.filter((candidate) => existingPolicies.has(spellingKey(candidate.raw))).length;
      this.searchTableRows = [
        ...this.searchTableRows.filter((candidate) => candidate.typeLabel !== "拼写检查"),
        ...retainedOtherFileRows,
        ...preservedCandidates,
      ].sort(compareCandidatesByPosition);
      this.searchTableActive = true;
      this.updatePairPanel(undefined, undefined, true);
      const ignoredCount = candidates.length - activeCandidates.length;
      void vscode.window.showInformationMessage(
        `ocr2md 拼写定位已刷新：发现 ${preservedCandidates.length} 个候选，过滤 ${ignoredCount} 个已忽略词，迁移 ${migratedCount} 条既有词项状态，替换 ${previousCurrentFileCount} 条旧位置记录。`,
      );
    } catch (error) {
      void vscode.window.showErrorMessage(`ocr2md 拼写检查失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async addSpellTermsToWhitelist(ids: string[]) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      void vscode.window.showWarningMessage("请先打开工作区。");
      return;
    }
    const words = this.searchTableRows
      .filter((candidate) => ids.includes(candidate.id) && candidate.typeLabel === "拼写检查")
      .map((candidate) => candidate.raw)
      .filter(Boolean);
    if (!words.length) {
      return;
    }
    const configUri = vscode.Uri.joinPath(workspaceFolder.uri, ".cspell.json");
    try {
      let config: Record<string, unknown> = { version: "0.2", words: [] };
      try {
        config = JSON.parse(Buffer.from(await vscode.workspace.fs.readFile(configUri)).toString("utf8")) as Record<string, unknown>;
      } catch (error) {
        const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
        if (code !== "FileNotFound" && code !== "ENOENT") {
          throw error;
        }
      }
      const knownWords = new Set(Array.isArray(config.words) ? config.words.filter((word): word is string => typeof word === "string") : []);
      words.forEach((word) => knownWords.add(word));
      config.words = [...knownWords].sort((left, right) => left.localeCompare(right, "en"));
      await vscode.workspace.fs.writeFile(configUri, Buffer.from(JSON.stringify(config, null, 2), "utf8"));
      const whitelistedSpellings = new Set(words.map(spellingKey));
      this.searchTableRows = this.searchTableRows.map((candidate) =>
        candidate.typeLabel === "拼写检查" && whitelistedSpellings.has(spellingKey(candidate.raw))
          ? { ...candidate, lineType: "忽略" }
          : candidate,
      );
      this.updatePairPanel();
      void vscode.window.showInformationMessage(`ocr2md 已将 ${words.length} 个术语加入 .cspell.json。`);
    } catch (error) {
      void vscode.window.showErrorMessage(`ocr2md 术语白名单保存失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async reloadAnnotationsFromSidecar(options: { silent?: boolean } = {}) {
    const loaded = await this.loadAnnotationSidecar(this.selectedFile);
    if (!loaded.loaded) {
      if (!options.silent) {
        void vscode.window.showWarningMessage(loaded.error ? `标定恢复失败：${loaded.error}` : "尚未找到保存的标定文件。");
      }
      return;
    }
    const transientSpellingRows = this.searchTableRows.filter((candidate) => candidate.typeLabel === "拼写检查");
    const restoredKeys = new Set(loaded.rows.map(tableRowKey));
    this.searchTableRows = [...loaded.rows, ...transientSpellingRows.filter((row) => !restoredKeys.has(tableRowKey(row)))].sort(compareCandidatesByPosition);
    this.annotationPairs = loaded.annotationPairs;
    this.ignoredSpellingKeys.clear();
    loaded.ignoredSpellings.forEach((word) => this.ignoredSpellingKeys.add(spellingKey(word)));
    this.deletedSidecarRowKeys.clear();
    this.searchTableActive = this.searchTableRows.length > 0;
    this.updatePairPanel(undefined, undefined, true);
    const hasConfiguredTitles = this.searchTableRows.some((row) => row.typeLabel === "标题" && row.chapterFile?.trim());
    const annotationRows = this.searchTableRows.filter((row) => row.typeLabel === "注释");
    if (
      hasConfiguredTitles &&
      annotationRows.length > 0 &&
      !annotationRows.some((row) => row.chapterFile?.trim())
    ) {
      // Sidecars written by the first chapter-assignment implementation could
      // lose the derived annotation field during Pair normalization. Recover
      // it deterministically from the saved title chapters and current Pairs.
      this.assignAnnotationsToChapterFiles({ silent: true });
    }
    if (!options.silent) {
      void vscode.window.showInformationMessage(`ocr2md 已恢复 ${loaded.rows.length} 条保存标定。`);
    }
  }

  private async downloadImageRows(ids: string[]) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      void vscode.window.showWarningMessage("请先打开工作区。");
      return;
    }

    const selectedIds = new Set(ids);
    const rows = this.searchTableRows.filter((candidate) => selectedIds.has(candidate.id));
    if (!rows.length) {
      return;
    }

    const localPaths = new Map<string, string>();
    const failures: string[] = [];
    const imgsDir = vscode.Uri.joinPath(workspaceFolder.uri, "imgs");
    await vscode.workspace.fs.createDirectory(imgsDir);
    void vscode.window.showInformationMessage(`ocr2md：开始下载 ${rows.length} 张图片到 imgs。`);

    this.reportImageDownloadProgress({
      phase: "downloading",
      completed: 0,
      total: rows.length,
      current: "准备下载图片...",
      failed: 0,
    });

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "ocr2md 正在下载图片",
        cancellable: false,
      },
      async (progress) => {
        for (const [index, row] of rows.entries()) {
          const progressLabel = `第 ${index + 1} / ${rows.length} 张，行 ${row.range.line + 1}`;
          this.reportImageDownloadProgress({
            phase: "downloading",
            completed: index,
            total: rows.length,
            current: progressLabel,
            failed: failures.length,
          });
          progress.report({
            increment: index === 0 ? 0 : 100 / rows.length,
            message: progressLabel,
          });
          try {
            const imageUrl = extractExternalImageUrl(row.raw) ?? extractExternalImageUrl(row.preview);
            if (!imageUrl) {
              const reason = "未找到外部图片 URL";
              failures.push(`${row.range.line + 1}: ${reason}`);
              this.reportImageDownloadProgress({
                phase: "downloading",
                completed: index + 1,
                total: rows.length,
                current: progressLabel,
                failed: failures.length,
                lastError: `行 ${row.range.line + 1}: ${reason}`,
              });
              continue;
            }

            const fileName = imageFileNameFromUrl(imageUrl, row);
            const relativePath = path.posix.join("imgs", fileName);
            const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, "imgs", fileName);
            const bytes = await downloadUrlBytes(imageUrl);
            await vscode.workspace.fs.writeFile(fileUri, bytes);
            localPaths.set(row.id, replaceImageUrlWithLocalPath(row.raw, relativePath));
          } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            failures.push(`${row.range.line + 1}: ${reason}`);
            this.reportImageDownloadProgress({
              phase: "downloading",
              completed: index + 1,
              total: rows.length,
              current: progressLabel,
              failed: failures.length,
              lastError: `行 ${row.range.line + 1}: ${reason}`,
            });
            continue;
          }

          this.reportImageDownloadProgress({
            phase: "downloading",
            completed: index + 1,
            total: rows.length,
            current: progressLabel,
            failed: failures.length,
          });
        }
        progress.report({ increment: 100 / rows.length, message: "完成" });
      },
    );

    if (localPaths.size) {
      this.searchTableRows = this.searchTableRows.map((candidate) =>
        localPaths.has(candidate.id) ? { ...candidate, localPath: localPaths.get(candidate.id) } : candidate,
      );
      this.updatePairPanel();
    }

    this.reportImageDownloadProgress({
      phase: "complete",
      completed: rows.length,
      total: rows.length,
      current: `完成：已下载 ${localPaths.size} 张${failures.length ? `，失败 ${failures.length} 张` : ""}`,
      failed: failures.length,
      lastError: failures.length ? failures[failures.length - 1] : undefined,
    });

    if (failures.length) {
      void vscode.window.showWarningMessage(`ocr2md 图片下载完成 ${localPaths.size} 个，失败 ${failures.length} 个。`);
    } else {
      void vscode.window.showInformationMessage(`ocr2md 图片已下载到 imgs：${localPaths.size} 个`);
    }
  }

  private reportImageDownloadProgress(progress: ImageDownloadProgress) {
    this.imageDownloadProgress = progress;
    void this.regexProvider.postMessage({ command: "imageDownloadProgress", progress });
  }

  private async saveAnnotationSidecar() {
    const workspaceFolder = this.selectedFile
      ? vscode.workspace.getWorkspaceFolder(vscode.Uri.file(this.selectedFile.path)) ?? vscode.workspace.workspaceFolders?.[0]
      : vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      void vscode.window.showWarningMessage("ocr2md 标定保存失败：请先打开工作区。");
      return;
    }
    if (!this.searchTableRows.length && !this.ignoredSpellingKeys.size) {
      void vscode.window.showWarningMessage("ocr2md 标定保存失败：当前数据表没有可保存的标定。");
      return;
    }

    // Persist the same normalized annotation snapshot currently represented
    // by the table, including removal of redundant working-copy corrections.
    this.rebuildAnnotationPairs();
    const previouslySaved = await this.loadAnnotationSidecar(this.selectedFile);
    previouslySaved.ignoredSpellings.forEach((word) => this.ignoredSpellingKeys.add(spellingKey(word)));
    const mergedRows = new Map<string, Candidate>();
    const currentModuleNames = new Set(
      this.searchTableRows.map((candidate) => candidate.typeLabel ?? "未分类"),
    );
    if (previouslySaved.loaded) {
      for (const candidate of previouslySaved.rows) {
        const key = tableRowKey(candidate);
        const moduleName = candidate.typeLabel ?? "未分类";
        if (moduleName === "拼写检查" && this.ignoredSpellingKeys.has(spellingKey(candidate.raw))) {
          continue;
        }
        // A module present in memory is an authoritative snapshot of that
        // module. This prevents rows removed by working-copy synchronization
        // from being resurrected while still preserving unloaded modules.
        if (!currentModuleNames.has(moduleName) && !this.deletedSidecarRowKeys.has(key)) {
          mergedRows.set(key, candidate);
        }
      }
    }
    for (const candidate of this.searchTableRows) {
      const key = tableRowKey(candidate);
      if (!this.deletedSidecarRowKeys.has(key)) {
        mergedRows.set(key, candidate);
      }
    }
    const rowsToSave = [...mergedRows.values()].sort(compareCandidatesByPosition);
    const annotationPairsToSave = currentModuleNames.has("注释")
      ? this.annotationPairs
      : previouslySaved.annotationPairs;
    const sidecar = {
      schemaVersion: 1,
      sourceFile: this.selectedFile?.path ?? workspaceFolder.uri.fsPath,
      savedAt: new Date().toISOString(),
      rows: rowsToSave.map((candidate) => ({
        id: candidate.id,
        kind: candidate.kind,
        typeLabel: candidate.typeLabel ?? "未分类",
        lineType: candidate.lineType,
        chapterFile: candidate.chapterFile,
        localPath: candidate.localPath,
        suggestions: candidate.suggestions,
        replacement: candidate.typeLabel === "拼写检查" && candidate.replacement
          ? normalizeSpellingReplacement(candidate.replacement)
          : candidate.replacement,
        // Older table rows may not have stored source metadata. Persist the
        // current file in that case so a workspace-level reload remains
        // navigable after switching source documents.
        sourcePath: candidate.sourcePath ?? this.selectedFile?.path,
        sourceLabel: candidate.sourceLabel ?? path.basename(candidate.sourcePath ?? this.selectedFile?.path ?? ""),
        label: candidate.label,
        raw: candidate.raw,
        preview: candidate.preview,
        regexSource: candidate.regexSource,
        annotationNumber: candidate.annotationNumber,
        isWorkingCorrection: candidate.isWorkingCorrection,
        workingCopyPath: candidate.workingCopyPath,
        sourceLine: candidate.sourceLine,
        line: candidate.range.line,
        start: candidate.range.start,
        endLine: candidate.range.endLine,
        end: candidate.range.end,
      })),
      annotationPairs: annotationPairsToSave,
      ignoredSpellings: [...this.ignoredSpellingKeys].sort((left, right) => left.localeCompare(right, "en")),
    };
    const fileSidecarUri = this.selectedFile ? annotationSidecarUri(this.selectedFile) : undefined;
    const workspaceSidecarUri = vscode.Uri.joinPath(workspaceFolder.uri, ".ocr2md", "annotations.json");
    try {
      const encodedSidecar = Buffer.from(JSON.stringify(sidecar, null, 2), "utf8");
      await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(workspaceFolder.uri, ".ocr2md"));
      try {
        const previousBytes = await vscode.workspace.fs.readFile(workspaceSidecarUri);
        await vscode.workspace.fs.writeFile(
          vscode.Uri.joinPath(workspaceFolder.uri, ".ocr2md", "annotations.backup.json"),
          previousBytes,
        );
      } catch {
        // The first save has no workspace sidecar to back up.
      }
      await vscode.workspace.fs.writeFile(workspaceSidecarUri, encodedSidecar);
      if (fileSidecarUri) {
        await vscode.workspace.fs.writeFile(fileSidecarUri, encodedSidecar);
      }
      this.searchTableRows = rowsToSave;
      this.annotationPairs = annotationPairsToSave;
      this.searchTableActive = this.searchTableRows.length > 0;
      this.deletedSidecarRowKeys.clear();
      this.updatePairPanel(undefined, undefined, true);
      const savedLocation = fileSidecarUri
        ? `${path.basename(fileSidecarUri.fsPath)} 和 .ocr2md/annotations.json`
        : ".ocr2md/annotations.json";
      void vscode.window.showInformationMessage(`ocr2md 标定已保存：${savedLocation}`);
    } catch (error) {
      void vscode.window.showErrorMessage(`ocr2md 标定保存失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async exportCorrectedMarkdown() {
    if (!this.selectedFile) {
      void vscode.window.showWarningMessage("请先选择一个 Markdown 文件。");
      return;
    }
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      void vscode.window.showWarningMessage("请先打开工作区。");
      return;
    }
    if (!this.searchTableRows.length) {
      void vscode.window.showWarningMessage("数据表没有标定行，无法生成订正输出。");
      return;
    }

    try {
      this.rebuildAnnotationPairs();
      const configuredTitles = this.searchTableRows.filter((row) =>
        row.typeLabel === "标题" && row.chapterFile?.trim() && row.sourcePath
      );
      const sourcePaths = [...new Set(configuredTitles.map((row) => row.sourcePath!))].sort(compareSourcePaths);
      const sourceOffsets = new Map<string, number>();
      const sourceLines: string[] = [];
      for (const [index, sourcePath] of sourcePaths.entries()) {
        const text = Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.file(sourcePath))).toString("utf8");
        const lines = text.split(/\r?\n/);
        sourceOffsets.set(sourcePath, sourceLines.length);
        sourceLines.push(...lines);
        if (index < sourcePaths.length - 1) sourceLines.push("");
      }
      const globalRows = this.searchTableRows.flatMap((row) => {
        const sourcePath = row.sourcePath ?? this.selectedFile?.path;
        const offset = sourcePath ? sourceOffsets.get(sourcePath) : undefined;
        return offset === undefined ? [] : [shiftCandidateToGlobalSource(row, offset)];
      });
      const chapters = buildChapterOutputSegments(globalRows, sourceLines.length);
      if (!chapters.length) {
        void vscode.window.showWarningMessage("请先在“标题”模块选择标题行，并通过“设置章节文件”为至少一个章节设置章节文件。");
        return;
      }

      const unassignedPairs = this.annotationPairs.filter((pair) => {
        if (!pair.refCandidateId || !pair.bodyCandidateId) return true;
        const ref = this.searchTableRows.find((row) => row.id === pair.refCandidateId);
        const body = this.searchTableRows.find((row) => row.id === pair.bodyCandidateId);
        return !ref?.chapterFile || ref.chapterFile !== body?.chapterFile;
      });
      if (unassignedPairs.length) {
        void vscode.window.showWarningMessage(`仍有 ${unassignedPairs.length} 个注释 Pair 未分配到同一章节。请先点击“分配到章节文件”。`);
        return;
      }

      const relocation = relocateAnnotationBodiesToChapterEnds(sourceLines, globalRows, this.annotationPairs);
      const workingRefResult = applyWorkingAnnotationReferences(sourceLines, globalRows);

      const outputDirectory = vscode.Uri.joinPath(workspaceFolder.uri, "output");
      await vscode.workspace.fs.createDirectory(outputDirectory);
      const outputTimestamp = formatLocalIsoTimestamp(new Date());
      const confirmedSpellingPolicies = this.searchTableRows.filter((row) =>
        row.typeLabel === "拼写检查" && row.lineType === "已确认" && row.raw && row.replacement?.trim()
      );
      let applied = relocation.applied + workingRefResult.applied;
      let skipped = relocation.skipped.length + workingRefResult.skipped.length;
      let firstOutputUri: vscode.Uri | undefined;
      for (const chapter of chapters) {
        const chapterText = sourceLines.slice(chapter.startLine, chapter.endLine).join("\n");
        const chapterRows = globalRows
          .filter((row) =>
            row.range.line >= chapter.startLine && row.range.line < chapter.endLine &&
            !(row.typeLabel === "注释" && row.lineType === "注释正文")
          )
          .map((row) => shiftCandidateToChapter(row, chapter.startLine));
        // Apply position-based structural corrections before relocated
        // footnotes are appended. Spelling policies run afterward across the
        // complete chapter so moved footnote bodies cannot bypass them.
        const result = applyMarkdownCorrections(chapterText, chapterRows, []);
        const outputUri = vscode.Uri.joinPath(outputDirectory, chapter.fileName);
        const footnotes = relocation.footnotesByChapter.get(chapter.fileName) ?? [];
        const chapterWithFootnotes = footnotes.length
          ? `${result.text.replace(/\s+$/, "")}\n\n${footnotes.join("\n\n")}\n`
          : result.text;
        const spellingResult = applyMarkdownCorrections(chapterWithFootnotes, [], confirmedSpellingPolicies);
        const outputText = withOcrCorrectionFrontMatter(spellingResult.text, outputTimestamp);
        await vscode.workspace.fs.writeFile(outputUri, Buffer.from(outputText, "utf8"));
        firstOutputUri ??= outputUri;
        applied += result.applied + spellingResult.applied;
        skipped += result.skipped.length + spellingResult.skipped.length;
      }

      const skippedMessage = skipped ? `；跳过 ${skipped} 条位置不匹配的标定` : "";
      void vscode.window.showInformationMessage(`ocr2md 已输出 ${chapters.length} 个章节文件到 output/（应用 ${applied} 项${skippedMessage}）`);
      if (firstOutputUri) {
        const document = await vscode.workspace.openTextDocument(firstOutputUri);
        await vscode.window.showTextDocument(document, { preview: false, viewColumn: vscode.ViewColumn.Two, preserveFocus: true });
      }
    } catch (error) {
      void vscode.window.showErrorMessage(`ocr2md 输出订正文件失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async loadAnnotationSidecar(file?: FileEntry): Promise<{
    rows: Candidate[];
    annotationPairs: AnnotationPair[];
    ignoredSpellings: string[];
    loaded: boolean;
    error?: string;
  }> {
    const workspaceFolder = file
      ? vscode.workspace.getWorkspaceFolder(vscode.Uri.file(file.path)) ?? vscode.workspace.workspaceFolders?.[0]
      : vscode.workspace.workspaceFolders?.[0];
    const workspaceSidecarUri = workspaceFolder
      ? vscode.Uri.joinPath(workspaceFolder.uri, ".ocr2md", "annotations.json")
      : undefined;
    // Prefer the workspace table because module rows can originate from many
    // files. Fall back to legacy per-Markdown sidecars for existing projects.
    const uris = [workspaceSidecarUri, file ? annotationSidecarUri(file) : undefined].filter((uri): uri is vscode.Uri => Boolean(uri));
    const mapRows = (payload: AnnotationSidecar): Candidate[] => {
      const ignoredSpellings = new Set(
        (Array.isArray(payload.ignoredSpellings) ? payload.ignoredSpellings : [])
          .filter((word): word is string => typeof word === "string")
          .map(spellingKey),
      );
      return payload.rows.map((row) => ({
        id: row.id,
        kind: row.kind ?? "regex",
        label: row.label,
        raw: row.raw,
        preview: row.preview,
        regexSource: row.regexSource,
        annotationNumber: row.annotationNumber || annotationNumberFromText(row.raw, row.lineType),
        isWorkingCorrection: row.isWorkingCorrection,
        workingCopyPath: row.workingCopyPath,
        sourceLine: row.sourceLine,
        typeLabel: row.typeLabel ?? "未分类",
        lineType: row.lineType,
        chapterFile: row.chapterFile ? outputChapterFileName(row.chapterFile) : undefined,
        localPath: row.localPath,
        suggestions: row.suggestions,
        replacement: (row.typeLabel ?? "未分类") === "拼写检查" && row.replacement
          ? normalizeSpellingReplacement(row.replacement)
          : row.replacement,
        sourcePath: row.sourcePath ?? payload.sourceFile ?? file?.path,
        sourceLabel: row.sourceLabel ?? path.basename(row.sourcePath ?? payload.sourceFile ?? file?.path ?? ""),
        range: {
          line: row.line,
          start: row.start,
          endLine: row.endLine,
          end: row.end,
        },
        status: "候选" as const,
      })).filter((row) =>
        row.typeLabel !== "拼写检查" || !ignoredSpellings.has(spellingKey(row.raw))
      );
    };
    let lastError: string | undefined;
    for (const uri of uris) {
      try {
        const bytes = await vscode.workspace.fs.readFile(uri);
        const payload = JSON.parse(Buffer.from(bytes).toString("utf8")) as AnnotationSidecar;
        if (payload.schemaVersion !== 1 || !Array.isArray(payload.rows)) {
          lastError = "sidecar schema 不匹配";
          continue;
        }
        return {
          loaded: true,
          rows: mapRows(payload),
          annotationPairs: Array.isArray(payload.annotationPairs) ? payload.annotationPairs : [],
          ignoredSpellings: Array.isArray(payload.ignoredSpellings)
            ? payload.ignoredSpellings.filter((word): word is string => typeof word === "string")
            : [],
        };
      } catch (error) {
        const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
        if (code !== "FileNotFound" && code !== "ENOENT") {
          lastError = error instanceof Error ? error.message : String(error);
        }
      }
    }

    // Migration for annotations saved before the workspace-level table was
    // introduced. Old sidecars may belong to another source file because the
    // table can contain rows from the whole directory.
    if (workspaceFolder) {
      try {
        const legacyUris = await vscode.workspace.findFiles("**/*.md.ocr2md.json", "**/{node_modules,.git}/**");
        const merged = new Map<string, Candidate>();
        for (const legacyUri of legacyUris) {
          try {
            const payload = JSON.parse(Buffer.from(await vscode.workspace.fs.readFile(legacyUri)).toString("utf8")) as AnnotationSidecar;
            if (payload.schemaVersion !== 1 || !Array.isArray(payload.rows)) {
              continue;
            }
            for (const row of mapRows(payload)) {
              merged.set(tableRowKey(row), row);
            }
          } catch {
            // A malformed legacy sidecar must not prevent the remaining saved
            // annotations from being restored.
          }
        }
        if (merged.size) {
          return {
            rows: [...merged.values()].sort(compareCandidatesByPosition),
            annotationPairs: [],
            ignoredSpellings: [],
            loaded: true,
          };
        }
      } catch (error) {
        lastError ??= error instanceof Error ? error.message : String(error);
      }
    }
    return { rows: [], annotationPairs: [], ignoredSpellings: [], loaded: false, error: lastError };
  }

  private scanBodies() {
    if (!this.ensureFileSelected()) {
      return;
    }

    this.bodies = scanFootnoteBodies(this.selectedFileText);
    this.rebuildPairs();
  }

  private rebuildPairs() {
    const previousStatus = new Map(this.pairs.map((pair) => [pair.id, pair.status]));
    this.pairs = buildFootnotePairs(this.refs, this.bodies).map((pair) => {
      const status = previousStatus.get(pair.id);
      return status === "已确认" || status === "异常" ? { ...pair, status } : pair;
    });
    this.regexProvider.update();
    this.updatePairPanel();
  }

  private ensureFileSelected(): boolean {
    if (this.selectedFile) {
      return true;
    }

    void vscode.window.showWarningMessage("请先选择一个 Markdown 文件。");
    return false;
  }

  private async showCandidate(candidateId: string) {
    const candidate = this.findCandidate(candidateId);
    if (!candidate) {
      return;
    }

    if (candidate.workingCopyPath) {
      await this.revealWorkingCopyCandidate(candidate);
    } else {
      await this.openCandidateSource(candidate);
      await this.revealRanges({ single: candidate.range, target: candidate.range });
    }
    this.updatePairPanel(candidate);
  }

  private async locateSourceCandidate(candidateId: string) {
    const candidate = this.findCandidate(candidateId);
    if (!candidate) {
      return;
    }
    if (candidate.workingCopyPath) {
      await this.revealWorkingCopyCandidate(candidate);
    } else {
      await this.openCandidateSource(candidate);
      // Only reveal the native source editor. Do not reload or scroll the Markdown preview pane.
      await this.revealRanges({ single: candidate.range, target: candidate.range });
    }
  }

  private async revealWorkingCopyCandidate(candidate: Candidate) {
    if (!candidate.workingCopyPath) return;
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(candidate.workingCopyPath));
    const editor = await vscode.window.showTextDocument(document, { preview: false, viewColumn: vscode.ViewColumn.Two, preserveFocus: false });
    const range = toVsCodeRange(candidate.range);
    editor.selection = new vscode.Selection(range.start, range.end);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    this.applyHeadingDecorations(editor);
  }

  private async openCandidateSource(candidate: Candidate) {
    if (candidate.sourcePath && candidate.sourcePath !== this.selectedFile?.path) {
      await this.selectFile(candidate.sourcePath, { preserveTable: true });
    }
  }

  private updateCandidateStatus(candidateId: string, status: "已拒绝" | "异常") {
    const update = (candidate: Candidate) => (candidate.id === candidateId ? { ...candidate, status } : candidate);
    this.refs = this.refs.map(update);
    this.bodies = this.bodies.map(update);
    this.suspicious = this.suspicious.map(update);
    this.regexProvider.update();
    this.updatePairPanel();
  }

  private findCandidate(candidateId: string): Candidate | undefined {
    return [...this.searchTableRows, ...this.sentenceRows, ...this.searchMatches, ...this.refs, ...this.bodies, ...this.suspicious].find(
      (candidate) => candidate.id === candidateId,
    );
  }

  private splitPostOcrSentences() {
    if (!this.postOcrCleanMode) {
      return;
    }
    const eligibleBlocks = this.searchTableRows.filter((row) =>
      row.lineType === "正文" || row.lineType === "注释正文" || row.lineType === "合成.文本",
    );
    this.sentenceRows = scanSentencesInTextBlocks(eligibleBlocks);
    this.updatePairPanel();
    void vscode.window.showInformationMessage(
      `ocr2md 已从 ${eligibleBlocks.length} 个可处理文本块生成 ${this.sentenceRows.length} 个分句。`,
    );
  }

  private async translatePostOcrBlocks(retryFailedOnly: boolean) {
    if (!this.postOcrCleanMode) {
      return;
    }
    const apiKey = await this.context.secrets.get("ocr2md.deeplApiKey");
    if (!apiKey) {
      void vscode.window.showWarningMessage("请先在“翻译设置”中保存并测试 DeepL API Key。");
      return;
    }

    const eligibleBlocks = this.searchTableRows.filter((row) =>
      row.lineType === "正文" || row.lineType === "注释正文" || row.lineType === "合成.文本",
    );
    const generatedSentences = scanSentencesInTextBlocks(eligibleBlocks);
    const existingById = new Map(this.sentenceRows.map((row) => [row.id, row]));
    this.sentenceRows = generatedSentences.map((row) => ({ ...row, ...existingById.get(row.id) }));

    const blocksByIndex = new Map<number, Candidate[]>();
    for (const sentence of this.sentenceRows) {
      const blockIndex = sentence.blockIndex;
      if (blockIndex === undefined || !Number.isInteger(blockIndex)) {
        continue;
      }
      const rows = blocksByIndex.get(blockIndex) ?? [];
      rows.push(sentence);
      blocksByIndex.set(blockIndex, rows);
    }
    const blockIndexes = [...blocksByIndex.keys()]
      .filter((blockIndex) => !retryFailedOnly || this.failedTranslationBlockIndexes.has(blockIndex))
      .sort((left, right) => left - right);
    if (!blockIndexes.length) {
      void vscode.window.showInformationMessage(retryFailedOnly ? "没有可重试的失败文本块。" : "没有可翻译的文本块。");
      return;
    }

    if (!retryFailedOnly) {
      this.failedTranslationBlockIndexes.clear();
    }
    this.reportTranslationProgress({
      phase: "translating",
      operation: "translation",
      completed: 0,
      total: blockIndexes.length,
      current: "准备翻译...",
      failed: 0,
    });

    for (const [index, blockIndex] of blockIndexes.entries()) {
      const sentences = (blocksByIndex.get(blockIndex) ?? []).sort(compareCandidatesByPosition);
      const label = `文本块 ${blockIndex}（${index + 1}/${blockIndexes.length}）`;
      try {
        const translated = await translateTextBlockWithRetry(apiKey, sentences, 3);
        const translatedById = parseTranslatedSentences(translated, sentences);
        this.sentenceRows = this.sentenceRows.map((row) => {
          const translation = translatedById.get(row.id);
          return translation === undefined
            ? row
            : { ...row, translation, restoredTranslation: restoreProtectedTranslation(translation, row.protectedTokens ?? []) };
        });
        this.failedTranslationBlockIndexes.delete(blockIndex);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        this.failedTranslationBlockIndexes.add(blockIndex);
        this.reportTranslationProgress({
          phase: "translating",
          operation: "translation",
          completed: index + 1,
          total: blockIndexes.length,
          current: label,
          failed: this.failedTranslationBlockIndexes.size,
          lastError: `${label}: ${reason}`,
        });
        continue;
      }
      this.reportTranslationProgress({
        phase: "translating",
        operation: "translation",
        completed: index + 1,
        total: blockIndexes.length,
        current: label,
        failed: this.failedTranslationBlockIndexes.size,
      });
    }

    const failed = this.failedTranslationBlockIndexes.size;
    this.reportTranslationProgress({
      phase: "complete",
      operation: "translation",
      completed: blockIndexes.length,
      total: blockIndexes.length,
      current: failed ? `完成，${failed} 个文本块待重试` : "翻译完成",
      failed,
    });
    this.updatePairPanel();
    void vscode.window.showInformationMessage(failed ? `ocr2md 翻译完成，${failed} 个文本块失败，可点击“重试失败”。` : "ocr2md 文本块翻译完成。");
  }

  private reportTranslationProgress(progress: TranslationProgress) {
    this.translationProgress = progress;
    void this.regexProvider.postMessage({ command: "translationProgress", progress });
  }

  private async saveTranslationSidecar() {
    if (!this.selectedFile || !this.postOcrCleanMode) {
      return;
    }
    if (!this.sentenceRows.length) {
      void vscode.window.showWarningMessage("请先分句或翻译文本块，再保存翻译结果。");
      return;
    }
    const sidecar: TranslationSidecar = {
      schemaVersion: 1,
      sourceFile: this.selectedFile.path,
      savedAt: new Date().toISOString(),
      failedBlockIndexes: [...this.failedTranslationBlockIndexes],
      sentences: this.sentenceRows.map((sentence) => toTranslationSidecarRow(sentence)),
    };
    const uri = translationSidecarUri(this.selectedFile);
    try {
      await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(sidecar, null, 2), "utf8"));
      void vscode.window.showInformationMessage(`ocr2md 翻译已保存：${path.basename(uri.fsPath)}`);
    } catch (error) {
      void vscode.window.showErrorMessage(`ocr2md 翻译保存失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async reloadTranslationSidecar() {
    if (!this.selectedFile || !this.postOcrCleanMode) {
      return;
    }
    const loaded = await this.loadTranslationSidecar(this.selectedFile);
    if (loaded.error) {
      void vscode.window.showWarningMessage(`ocr2md 翻译加载失败：${loaded.error}`);
      return;
    }
    if (!loaded.rows.length) {
      void vscode.window.showInformationMessage("未找到已保存的翻译结果。");
      return;
    }
    this.restoreSavedTranslations(loaded.rows, loaded.failedBlockIndexes);
    this.updatePairPanel();
    void vscode.window.showInformationMessage(`ocr2md 已加载 ${this.sentenceRows.length} 个分句翻译结果。`);
  }

  private async exportObsidianCrossTranslation() {
    if (!this.selectedFile || !this.postOcrCleanMode) {
      void vscode.window.showWarningMessage("请先打开一份带有 ocr2md_corrected: true 的 Markdown 文件。");
      return;
    }

    const eligibleBlocks = this.searchTableRows.filter(isTranslatableTextBlock);
    const generatedSentences = scanSentencesInTextBlocks(eligibleBlocks);
    const existingById = new Map(this.sentenceRows.map((row) => [row.id, row]));
    const currentSentences = generatedSentences.map((row) => {
      const existing = existingById.get(row.id);
      return existing && existing.raw === row.raw
        ? { ...row, translation: existing.translation, restoredTranslation: existing.restoredTranslation }
        : row;
    });
    this.sentenceRows = currentSentences;

    const output = translationExportPaths(this.selectedFile);
    const units = buildObsidianTranslationUnits(this.selectedFileText, this.searchTableRows, currentSentences);
    const bundle = renderObsidianTranslationBundle({
      units,
      sourceLinkTarget: output.sourceLinkTarget,
      translationLinkTarget: output.translationLinkTarget,
    });
    const targets = [
      { label: "org", uri: output.orgUri, content: bundle.org },
      { label: "trans", uri: output.transUri, content: bundle.trans },
      { label: "cross/trans2org", uri: output.trans2orgUri, content: bundle.trans2org },
      { label: "cross/org2trans", uri: output.org2transUri, content: bundle.org2trans },
    ];

    this.reportTranslationProgress({
      phase: "exporting",
      operation: "export",
      completed: 0,
      total: targets.length,
      current: "准备导出 Obsidian 交叉互译...",
      failed: 0,
    });

    try {
      for (const [index, target] of targets.entries()) {
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(target.uri.fsPath)));
        await vscode.workspace.fs.writeFile(target.uri, Buffer.from(target.content, "utf8"));
        this.reportTranslationProgress({
          phase: "exporting",
          operation: "export",
          completed: index + 1,
          total: targets.length,
          current: target.label,
          failed: 0,
        });
      }

      const translationSidecar: TranslationSidecar = {
        schemaVersion: 1,
        sourceFile: this.selectedFile.path,
        savedAt: new Date().toISOString(),
        failedBlockIndexes: [...this.failedTranslationBlockIndexes],
        sentences: currentSentences.map((sentence) => toTranslationSidecarRow(sentence)),
      };
      await vscode.workspace.fs.writeFile(
        translationSidecarUri(this.selectedFile),
        Buffer.from(JSON.stringify(translationSidecar, null, 2), "utf8"),
      );

      const summary = bundle.missingTranslationCount
        ? `已导出 4 个文件；${bundle.translatedCount} 句有译文，${bundle.missingTranslationCount} 句暂以原文保留。`
        : `已导出 4 个文件；${bundle.translatedCount} 句译文已写入。`;
      this.reportTranslationProgress({
        phase: "complete",
        operation: "export",
        completed: targets.length,
        total: targets.length,
        current: summary,
        failed: 0,
      });
      this.updatePairPanel();
      const action = await vscode.window.showInformationMessage(
        `ocr2md Obsidian 交叉互译导出完成：${output.outputRoot.fsPath}`,
        "打开输出目录",
      );
      if (action === "打开输出目录") {
        await vscode.commands.executeCommand("revealFileInOS", output.outputRoot);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.reportTranslationProgress({
        phase: "complete",
        operation: "export",
        completed: 0,
        total: targets.length,
        current: "导出失败",
        failed: 1,
        lastError: reason,
      });
      void vscode.window.showErrorMessage(`ocr2md Obsidian 交叉互译导出失败：${reason}`);
    }
  }

  private restoreSavedTranslations(rows: TranslationSidecarRow[], failedBlockIndexes: number[] = []) {
    const eligibleBlocks = this.searchTableRows.filter((row) =>
      row.lineType === "正文" || row.lineType === "注释正文" || row.lineType === "合成.文本",
    );
    const currentRows = scanSentencesInTextBlocks(eligibleBlocks);
    const savedById = new Map(rows.map((row) => [row.id, row]));
    this.sentenceRows = currentRows.map((row) => {
      const saved = savedById.get(row.id);
      return saved && saved.raw === row.raw
        ? { ...row, translation: saved.translation, restoredTranslation: saved.restoredTranslation }
        : row;
    });
    this.failedTranslationBlockIndexes = new Set(failedBlockIndexes);
  }

  private async loadTranslationSidecar(file: FileEntry): Promise<{ rows: TranslationSidecarRow[]; failedBlockIndexes: number[]; error?: string }> {
    try {
      const bytes = await vscode.workspace.fs.readFile(translationSidecarUri(file));
      const payload = JSON.parse(Buffer.from(bytes).toString("utf8")) as TranslationSidecar;
      if (payload.schemaVersion !== 1 || !Array.isArray(payload.sentences)) {
        return { rows: [], failedBlockIndexes: [], error: "sidecar schema 不匹配" };
      }
      return { rows: payload.sentences, failedBlockIndexes: Array.isArray(payload.failedBlockIndexes) ? payload.failedBlockIndexes : [] };
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
      if (code === "FileNotFound" || code === "ENOENT") {
        return { rows: [], failedBlockIndexes: [] };
      }
      return { rows: [], failedBlockIndexes: [], error: error instanceof Error ? error.message : String(error) };
    }
  }

  private setSentenceTranslation(candidateId: string, translation: string) {
    this.sentenceRows = this.sentenceRows.map((candidate) => {
      if (candidate.id !== candidateId) {
        return candidate;
      }
      return {
        ...candidate,
        translation,
        restoredTranslation: restoreProtectedTranslation(translation, candidate.protectedTokens ?? []),
      };
    });
    this.updatePairPanel();
  }

  private async testDeepLTranslation(apiKeyInput: string, text: string) {
    const apiKey = apiKeyInput.trim() || await this.context.secrets.get("ocr2md.deeplApiKey") || "";
    if (!apiKey) {
      this.translationTestResult = { success: false, message: "请输入 DeepL API Key 后再测试。" };
      this.updatePairPanel();
      return;
    }
    if (!text.trim()) {
      this.translationTestResult = { success: false, message: "待翻译文本不能为空。" };
      this.updatePairPanel();
      return;
    }

    await this.context.secrets.store("ocr2md.deeplApiKey", apiKey);
    this.deeplConfigured = true;
    try {
      const translatedText = await translateWithDeepL(apiKey, text.trim());
      this.translationTestResult = { success: true, message: translatedText };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.translationTestResult = { success: false, message: `DeepL 测试失败：${reason}` };
    }
    this.updatePairPanel();
  }

  private async handlePairMessage(message: WebviewMessage) {
    switch (message.command) {
      case "selectPair":
        if (typeof message.id === "string") {
          await this.showPair(message.id, "ref");
        }
        break;
      case "selectCandidate":
        if (typeof message.id === "string") {
          await this.showCandidate(message.id);
        }
        break;
      case "locateSourceCandidate":
        if (typeof message.id === "string") {
          await this.locateSourceCandidate(message.id);
        }
        break;
      case "setRowsType":
        if (Array.isArray(message.ids) && typeof message.typeLabel === "string") {
          this.setSearchRowsType(message.ids, message.typeLabel);
        }
        break;
      case "scanModuleRegex":
        if (typeof message.moduleName === "string" && typeof message.pattern === "string") {
          await this.scanModuleRegex(message.moduleName, message.pattern, message.regexScopeDirectory, message.regexIncludeSubdirectories);
        }
        break;
      case "setRowsLineType":
        if (Array.isArray(message.ids) && typeof message.lineType === "string") {
          this.setSearchRowsLineType(message.ids, message.lineType);
        }
        break;
      case "confirmAnnotationPairs":
        if (Array.isArray(message.ids)) {
          this.confirmAnnotationPairs(message.ids);
        }
        break;
      case "setRowsChapterFile":
        if (Array.isArray(message.ids) && typeof message.chapterFile === "string") {
          this.setSearchRowsChapterFile(message.ids, message.chapterFile);
        }
        break;
      case "setRowsChapterFiles":
        if (message.chapterFiles && typeof message.chapterFiles === "object") {
          this.setSearchRowsChapterFiles(message.chapterFiles);
        }
        break;
      case "assignAnnotationsToChapters":
        this.assignAnnotationsToChapterFiles();
        break;
      case "setSpellReplacement":
      case "setRowReplacement":
        if (typeof message.id === "string" && typeof message.replacement === "string") {
          this.setSearchRowReplacement(message.id, message.replacement);
        }
        break;
      case "scanSpelling":
        await this.scanSpelling();
        break;
      case "splitSentences":
        this.splitPostOcrSentences();
        break;
      case "setSentenceTranslation":
        if (typeof message.id === "string" && typeof message.translation === "string") {
          this.setSentenceTranslation(message.id, message.translation);
        }
        break;
      case "testDeepL":
        await this.testDeepLTranslation(message.apiKey ?? "", message.text ?? "");
        break;
      case "translateTextBlocks":
        await this.translatePostOcrBlocks(false);
        break;
      case "retryFailedTextBlocks":
        await this.translatePostOcrBlocks(true);
        break;
      case "saveTranslations":
        await this.saveTranslationSidecar();
        break;
      case "reloadTranslations":
        await this.reloadTranslationSidecar();
        break;
      case "exportObsidianCrossTranslation":
        await this.exportObsidianCrossTranslation();
        break;
      case "addSpellTermsToWhitelist":
        if (Array.isArray(message.ids)) {
          await this.addSpellTermsToWhitelist(message.ids);
        }
        break;
      case "reloadAnnotations":
        await this.reloadAnnotationsFromSidecar({ silent: message.silent === true });
        break;
      case "downloadImages":
        if (Array.isArray(message.ids)) {
          await this.downloadImageRows(message.ids);
        }
        break;
      case "saveAnnotations":
        await this.saveAnnotationSidecar();
        break;
      case "exportCorrectedMarkdown":
        await this.exportCorrectedMarkdown();
        break;
      case "locateRef":
        if (typeof message.id === "string") {
          await this.showPair(message.id, "ref");
        }
        break;
      case "locateBody":
        if (typeof message.id === "string") {
          await this.showPair(message.id, "body");
        }
        break;
      case "confirmPair":
        if (typeof message.id === "string") {
          this.updatePairStatus(message.id, "已确认");
        }
        break;
      case "flagPair":
        if (typeof message.id === "string") {
          this.updatePairStatus(message.id, "异常");
        }
        break;
    }
  }

  private async showPair(pairId: string, target: "ref" | "body") {
    const pair = this.pairs.find((entry) => entry.id === pairId);
    if (!pair) {
      return;
    }

    const targetRange = target === "body" ? pair.body?.range ?? pair.ref?.range : pair.ref?.range ?? pair.body?.range;
    if (!targetRange) {
      return;
    }

    await this.revealRanges({
      ref: pair.ref?.range,
      body: pair.body?.range,
      target: targetRange,
    });
    this.updatePairPanel(undefined, pair.id);
  }

  private updatePairStatus(pairId: string, status: PairStatus) {
    this.pairs = this.pairs.map((pair) => (pair.id === pairId ? { ...pair, status } : pair));
    this.regexProvider.update();
    this.updatePairPanel(undefined, pairId);
  }

  private async revealRanges(ranges: {
    single?: SourceRange;
    ref?: SourceRange;
    body?: SourceRange;
    target: SourceRange;
  }) {
    const previewUri = this.currentPreviewUri();
    if (!previewUri) {
      return;
    }

    await this.ensureDefaultEditorLayout();
    const document = await vscode.workspace.openTextDocument(previewUri);
    const editor = await vscode.window.showTextDocument(document, { preview: false, viewColumn: vscode.ViewColumn.One });
    const targetRange = toVsCodeRange(ranges.target);
    editor.selection = new vscode.Selection(targetRange.start, targetRange.end);
    editor.revealRange(targetRange, vscode.TextEditorRevealType.InCenter);
    this.applyHeadingDecorations(editor);
    editor.setDecorations(this.singleDecoration, ranges.single ? [toVsCodeRange(ranges.single)] : []);
    editor.setDecorations(this.refDecoration, ranges.ref ? [toVsCodeRange(ranges.ref)] : []);
    editor.setDecorations(this.bodyDecoration, ranges.body ? [toVsCodeRange(ranges.body)] : []);
  }

  private clearDecorations() {
    vscode.window.visibleTextEditors
      .filter((candidate) => this.isPreviewDocument(candidate.document.uri))
      .forEach((editor) => {
        editor.setDecorations(this.singleDecoration, []);
        editor.setDecorations(this.refDecoration, []);
        editor.setDecorations(this.bodyDecoration, []);
        this.headingDecorations.forEach((decoration) => editor.setDecorations(decoration, []));
      });
  }

  private applyHeadingDecorations(editor: vscode.TextEditor) {
    if (!this.isPreviewDocument(editor.document.uri)) {
      return;
    }

    const rangesByLevel: vscode.Range[][] = [[], [], [], [], [], []];
    for (let lineIndex = 0; lineIndex < editor.document.lineCount; lineIndex += 1) {
      const line = editor.document.lineAt(lineIndex);
      const match = /^(#{1,6})\s+/.exec(line.text);
      if (!match) {
        continue;
      }
      rangesByLevel[match[1].length - 1].push(line.range);
    }

    this.headingDecorations.forEach((decoration, index) => {
      editor.setDecorations(decoration, rangesByLevel[index]);
    });
  }

  private currentPreviewUri(): vscode.Uri | undefined {
    return this.selectedFile ? vscode.Uri.file(this.selectedFile.path) : undefined;
  }

  private isPreviewDocument(uri: vscode.Uri): boolean {
    return uri.scheme === readonlyScheme || uri.toString() === this.workingCopyUri?.toString() || (!!this.selectedFile && uri.fsPath === this.selectedFile.path);
  }

  private rebuildAnnotationPairs() {
    const savedChapterById = new Map<string, string>();
    const savedChapterByKey = new Map<string, string>();
    for (const row of this.searchTableRows) {
      const chapterFile = row.chapterFile?.trim();
      if (!chapterFile) continue;
      savedChapterById.set(row.id, chapterFile);
      savedChapterByKey.set(tableRowKey(row), chapterFile);
    }
    this.searchTableRows = deduplicateCandidatesById(this.searchTableRows);
    this.searchTableRows = removeRedundantWorkingAnnotationRefs(this.searchTableRows);
    this.searchTableRows = removeSupersededOriginalAnnotationBodies(this.searchTableRows);
    this.searchTableRows = removeInvalidWorkingAnnotationBodies(this.searchTableRows);
    this.searchTableRows = this.searchTableRows.map((row) => {
      const chapterFile = row.chapterFile?.trim() || savedChapterById.get(row.id) || savedChapterByKey.get(tableRowKey(row));
      return chapterFile ? { ...row, chapterFile } : row;
    });
    const previousById = new Map(this.annotationPairs.map((pair) => [pair.id, pair]));
    const refsByNumber = new Map<string, Candidate[]>();
    const bodies: Candidate[] = [];
    const sourcePathFor = (row: Candidate) => row.sourcePath ?? this.selectedFile?.path ?? "";
    const annotationRows = this.searchTableRows.filter((row) => row.typeLabel === "注释" && row.lineType !== "忽略");
    const sourcePaths = [...new Set(annotationRows.map(sourcePathFor))].sort((left, right) =>
      path.basename(left).localeCompare(path.basename(right), "zh-CN", { numeric: true }) || left.localeCompare(right),
    );
    const sourceOrder = new Map(sourcePaths.map((sourcePath, index) => [sourcePath, index + 1]));
    const logicalLineFor = (row: Candidate) => row.sourceLine ?? row.range.line;
    const displayPairIdFor = (sourcePath: string, anchor: Candidate) =>
      `${String(sourceOrder.get(sourcePath) ?? 1).padStart(3, "0")}-${String(logicalLineFor(anchor) + 1).padStart(6, "0")}`;
    const compareGlobalPosition = (left: Candidate, right: Candidate) =>
      (sourceOrder.get(sourcePathFor(left)) ?? Number.MAX_SAFE_INTEGER) -
        (sourceOrder.get(sourcePathFor(right)) ?? Number.MAX_SAFE_INTEGER) ||
      logicalLineFor(left) - logicalLineFor(right) ||
      left.range.start - right.range.start;
    const pairIdFor = (sourcePath: string, number: string, ref?: Candidate, body?: Candidate) =>
      `annotation-pair-${encodeURIComponent(sourcePath)}-${number}-${ref?.id ?? "missing-ref"}-${body?.id ?? "missing-body"}`;

    for (const row of annotationRows) {
      const number = annotationNumberForRow(row);
      if (!number) continue;
      if (row.lineType === "注释正文") {
        bodies.push(row);
        continue;
      }
      if (row.lineType !== "注释引用") continue;
      const refs = refsByNumber.get(number) ?? [];
      refs.push(row);
      refsByNumber.set(number, refs);
    }

    refsByNumber.forEach((refs) => refs.sort(compareGlobalPosition));
    const pairs: AnnotationPair[] = [];
    for (const body of bodies.sort(compareGlobalPosition)) {
      const number = annotationNumberForRow(body);
      if (!number) continue;
      const refs = refsByNumber.get(number) ?? [];
      let chosenIndex = -1;
      for (let index = refs.length - 1; index >= 0; index -= 1) {
        if (compareGlobalPosition(refs[index], body) < 0) {
          chosenIndex = index;
          break;
        }
      }
      const ref = chosenIndex >= 0 ? refs.splice(chosenIndex, 1)[0] : undefined;
      const sourcePath = sourcePathFor(ref ?? body);
      const id = pairIdFor(sourcePath, number, ref, body);
      const previous = previousById.get(id);
      pairs.push({
        id,
        pairId: displayPairIdFor(sourcePath, ref ?? body),
        sourcePath,
        number,
        refCandidateId: ref?.id,
        bodyCandidateId: body.id,
        status: ref ? (previous?.status === "已确认" || previous?.status === "异常" ? previous.status : "自动匹配") : "待补引用",
        confidence: ref ? (body.isWorkingCorrection ? "medium" : "high") : "low",
        bodyOrigin: body.isWorkingCorrection ? "工作稿人工补充" : "原文",
      });
    }

    for (const refs of refsByNumber.values()) {
      for (const ref of refs) {
        const number = annotationNumberForRow(ref);
        if (!number) continue;
        const sourcePath = sourcePathFor(ref);
        const id = pairIdFor(sourcePath, number, ref);
        const previous = previousById.get(id);
        pairs.push({
          id,
          pairId: displayPairIdFor(sourcePath, ref),
          sourcePath,
          number,
          refCandidateId: ref.id,
          status: previous?.status === "异常" ? "异常" : "待补正文",
          confidence: "low",
          bodyOrigin: "原文",
        });
      }
    }
    const candidatesById = new Map(annotationRows.map((row) => [row.id, row]));
    const pairsByBaseId = new Map<string, AnnotationPair[]>();
    for (const pair of pairs) {
      const sameBase = pairsByBaseId.get(pair.pairId) ?? [];
      sameBase.push(pair);
      pairsByBaseId.set(pair.pairId, sameBase);
    }
    for (const [baseId, sameBasePairs] of pairsByBaseId) {
      if (sameBasePairs.length < 2) continue;
      sameBasePairs
        .sort((left, right) => {
          const leftAnchor = candidatesById.get(left.refCandidateId ?? left.bodyCandidateId ?? "");
          const rightAnchor = candidatesById.get(right.refCandidateId ?? right.bodyCandidateId ?? "");
          return Number(left.number) - Number(right.number) || (leftAnchor?.range.start ?? 0) - (rightAnchor?.range.start ?? 0);
        })
        .forEach((pair, index) => {
          pair.pairId = `${baseId}-${String(index + 1).padStart(2, "0")}`;
        });
    }
    const rowsById = new Map(this.searchTableRows.map((row) => [row.id, row]));
    const pairChapterByCandidateId = new Map<string, string>();
    for (const pair of pairs) {
      const ref = pair.refCandidateId ? rowsById.get(pair.refCandidateId) : undefined;
      const body = pair.bodyCandidateId ? rowsById.get(pair.bodyCandidateId) : undefined;
      const chapterFile = ref?.chapterFile?.trim() || body?.chapterFile?.trim();
      if (!chapterFile) continue;
      if (ref) pairChapterByCandidateId.set(ref.id, chapterFile);
      if (body) pairChapterByCandidateId.set(body.id, chapterFile);
    }
    if (pairChapterByCandidateId.size) {
      this.searchTableRows = this.searchTableRows.map((row) => {
        const chapterFile = pairChapterByCandidateId.get(row.id);
        return chapterFile ? { ...row, chapterFile } : row;
      });
    }
    this.annotationPairs = pairs.sort((left, right) => left.pairId.localeCompare(right.pairId, "zh-CN", { numeric: true }));
  }

  private confirmAnnotationPairs(candidateIds: string[]) {
    const selected = new Set(candidateIds);
    let confirmed = 0;
    this.annotationPairs = this.annotationPairs.map((pair) => {
      if (!pair.refCandidateId || !pair.bodyCandidateId || (!selected.has(pair.refCandidateId) && !selected.has(pair.bodyCandidateId))) {
        return pair;
      }
      confirmed += 1;
      return { ...pair, status: "已确认", confidence: "high" };
    });
    void vscode.window.showInformationMessage(confirmed ? `已确认 ${confirmed} 组注释配对。` : "所选行中没有可确认的完整注释 Pair。");
    this.updatePairPanel();
  }

  private updatePairPanel(selectedCandidate?: Candidate, selectedPairId?: string, _reveal = false) {
    // The data-table workbench lives in the left ocr2md WebviewView. Dispose a
    // panel left over from earlier versions instead of opening a right editor.
    this.pairPanel?.dispose();
    this.pairPanel = undefined;
    this.selectedCandidate = selectedCandidate;
    this.selectedPairId = selectedPairId ??
      (selectedCandidate?.kind === "ref" || selectedCandidate?.kind === "body" ? `pair-${selectedCandidate.label}` : undefined);
    this.rebuildAnnotationPairs();
    this.regexProvider.update();
  }
}

class ReadonlyMarkdownProvider implements vscode.TextDocumentContentProvider {
  private readonly emitter = new vscode.EventEmitter<vscode.Uri>();
  private readonly contents = new Map<string, string>();
  readonly onDidChange = this.emitter.event;

  setContent(uri: vscode.Uri, content: string) {
    this.contents.set(uri.toString(), content);
    this.emitter.fire(uri);
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.contents.get(uri.toString()) ?? "";
  }
}

class Ocr2mdDirectoryProvider implements vscode.TreeDataProvider<Ocr2mdDirectoryItem> {
  private readonly emitter = new vscode.EventEmitter<Ocr2mdDirectoryItem | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(
    private readonly getFiles: () => FileEntry[],
    private readonly getWorkspaceFolder: () => vscode.WorkspaceFolder | undefined,
    private readonly getSelectedFilePath: () => string | undefined,
    private readonly getTranslationNodePaths: () => string[],
  ) {}

  refresh() {
    this.emitter.fire(undefined);
  }

  getTreeItem(element: Ocr2mdDirectoryItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: Ocr2mdDirectoryItem): Ocr2mdDirectoryItem[] {
    const workspaceFolder = this.getWorkspaceFolder();
    if (!workspaceFolder) {
      return [
        new Ocr2mdDirectoryItem("选择工作目录...", "empty", vscode.TreeItemCollapsibleState.None, {
          command: "ocr2md.pickFolder",
          title: "选择工作文件夹",
        }),
      ];
    }

    if (element) {
      return element.children;
    }

    const root = buildDirectoryTree(
      workspaceFolder.name.toUpperCase(),
      this.getFiles(),
      this.getSelectedFilePath(),
      workspaceFolder.uri.fsPath,
    );
    if (!root.children.length) {
      root.children.push(
        new Ocr2mdDirectoryItem("未找到 Markdown 文件", "empty", vscode.TreeItemCollapsibleState.None, {
          command: "ocr2md.refreshFiles",
          title: "刷新",
        }),
      );
    }
    const translationRoot = buildTranslationTree(
      this.getFiles(),
      this.getTranslationNodePaths(),
      this.getSelectedFilePath(),
    );
    return [
      root,
      translationRoot,
      new Ocr2mdDirectoryItem("打开其他工作目录...", "empty", vscode.TreeItemCollapsibleState.None, {
        command: "ocr2md.pickFolder",
        title: "打开其他工作目录",
      }),
    ];
  }
}

class Ocr2mdDirectoryItem extends vscode.TreeItem {
  readonly children: Ocr2mdDirectoryItem[] = [];

  constructor(
    label: string,
    readonly kind: "folder" | "file" | "translationRoot" | "translationFolder" | "translationFile" | "empty",
    collapsibleState: vscode.TreeItemCollapsibleState,
    command?: vscode.Command,
    readonly filePath?: string,
    readonly nodePath?: string,
  ) {
    super(label, collapsibleState);
    this.command = command;
    this.contextValue = kind;
    this.iconPath =
      kind === "folder" || kind === "translationFolder"
        ? new vscode.ThemeIcon("folder")
        : kind === "file" || kind === "translationFile"
          ? new vscode.ThemeIcon("markdown")
          : kind === "translationRoot"
            ? new vscode.ThemeIcon("globe")
          : new vscode.ThemeIcon("info");
  }
}

function buildDirectoryTree(
  rootLabel: string,
  files: FileEntry[],
  selectedFilePath: string | undefined,
  rootPath?: string,
  translationTree = false,
): Ocr2mdDirectoryItem {
  const folderKind = translationTree ? "translationFolder" : "folder";
  const fileKind = translationTree ? "translationFile" : "file";
  const root = new Ocr2mdDirectoryItem(
    rootLabel,
    folderKind,
    vscode.TreeItemCollapsibleState.Expanded,
    undefined,
    undefined,
    rootPath,
  );
  const folderMap = new Map<string, Ocr2mdDirectoryItem>([["", root]]);

  for (const file of files) {
    const parts = file.label.split(path.sep).filter(Boolean);
    let parentPath = "";
    let parent = root;

    parts.slice(0, -1).forEach((part) => {
      const nextPath = parentPath ? `${parentPath}${path.sep}${part}` : part;
      let folder = folderMap.get(nextPath);
      if (!folder) {
        folder = new Ocr2mdDirectoryItem(
          part,
          folderKind,
          vscode.TreeItemCollapsibleState.Collapsed,
          undefined,
          undefined,
          rootPath ? path.join(rootPath, nextPath) : undefined,
        );
        folderMap.set(nextPath, folder);
        parent.children.push(folder);
      }
      parentPath = nextPath;
      parent = folder;
    });

    const filename = parts[parts.length - 1] ?? file.label;
    const item = new Ocr2mdDirectoryItem(filename, fileKind, vscode.TreeItemCollapsibleState.None, {
      command: "ocr2md.openMarkdownFile",
      title: "打开 Markdown 文件",
      arguments: [file.path],
    }, file.path, file.path);
    item.description = file.path === selectedFilePath ? "当前" : undefined;
    item.tooltip = file.path;
    parent.children.push(item);
  }

  sortTree(root);
  return root;
}

function buildTranslationTree(
  files: FileEntry[],
  translationNodePaths: string[],
  selectedFilePath: string | undefined,
): Ocr2mdDirectoryItem {
  const root = new Ocr2mdDirectoryItem("翻译", "translationRoot", vscode.TreeItemCollapsibleState.Expanded);
  for (const nodePath of translationNodePaths) {
    const directFile = files.find((file) => path.resolve(file.path) === path.resolve(nodePath));
    if (directFile) {
      const item = new Ocr2mdDirectoryItem(
        path.basename(directFile.path),
        "translationFile",
        vscode.TreeItemCollapsibleState.None,
        {
          command: "ocr2md.openMarkdownFile",
          title: "打开 Markdown 文件",
          arguments: [directFile.path],
        },
        directFile.path,
        directFile.path,
      );
      item.description = directFile.path === selectedFilePath ? "当前" : undefined;
      item.tooltip = directFile.path;
      root.children.push(item);
      continue;
    }

    const childFiles = files
      .filter((file) => isSameOrChildPath(nodePath, file.path))
      .map((file) => ({ ...file, label: path.relative(nodePath, file.path) }));
    if (childFiles.length) {
      root.children.push(buildDirectoryTree(
        path.basename(nodePath) || nodePath,
        childFiles,
        selectedFilePath,
        nodePath,
        true,
      ));
    }
  }
  sortTree(root);
  return root;
}

function sortTree(item: Ocr2mdDirectoryItem) {
  item.children.sort((left, right) => {
    const leftFolder = left.kind === "folder" || left.kind === "translationFolder";
    const rightFolder = right.kind === "folder" || right.kind === "translationFolder";
    if (leftFolder !== rightFolder) {
      return leftFolder ? -1 : 1;
    }
    return String(left.label).localeCompare(String(right.label));
  });
  item.children.forEach(sortTree);
}

function isSameOrChildPath(parentPath: string, candidatePath: string): boolean {
  const relative = path.relative(path.resolve(parentPath), path.resolve(candidatePath));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function extractExternalImageUrl(value: string): string | undefined {
  const markdownImageMatch = String(value).match(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/i);
  if (markdownImageMatch?.[1]) {
    return markdownImageMatch[1];
  }
  return String(value).match(/https?:\/\/[^\s)]+/i)?.[0];
}

function replaceImageUrlWithLocalPath(value: string, localPath: string): string {
  const textValue = String(value);
  const imageMatch = textValue.match(/(!\[[^\]]*\]\()(https?:\/\/[^\s)]+)(\))/i);
  if (imageMatch) {
    return `${imageMatch[1]}${localPath}${imageMatch[3]}`;
  }
  return localPath;
}

function imageFileNameFromUrl(imageUrl: string, row: Candidate): string {
  let baseName = "";
  try {
    baseName = path.posix.basename(new URL(imageUrl).pathname);
  } catch {
    baseName = "";
  }

  const fallback = `image-${row.range.line + 1}-${row.range.start}.jpg`;
  const fileName = baseName || fallback;
  return fileName.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_");
}

function downloadUrlBytes(url: string, redirectsRemaining = 5): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === "http:" ? http : https;
    const request = client.get(parsedUrl, (response) => {
      const status = response.statusCode ?? 0;
      const location = response.headers.location;
      if (status >= 300 && status < 400 && location && redirectsRemaining > 0) {
        response.resume();
        const nextUrl = new URL(location, parsedUrl).toString();
        downloadUrlBytes(nextUrl, redirectsRemaining - 1).then(resolve, reject);
        return;
      }

      if (status < 200 || status >= 300) {
        response.resume();
        reject(new Error(`HTTP ${status}`));
        return;
      }

      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => resolve(Buffer.concat(chunks)));
    });
    request.on("error", reject);
    request.setTimeout(30000, () => {
      request.destroy(new Error("下载超时"));
    });
  });
}

function connectDeepLProxyTunnel(proxyUrl: URL): Promise<tls.TLSSocket> {
  const targetHost = "api-free.deepl.com";
  const targetPort = 443;
  return new Promise((resolve, reject) => {
    const proxyClient = proxyUrl.protocol === "https:" ? https : http;
    const headers: http.OutgoingHttpHeaders = {
      Host: `${targetHost}:${targetPort}`,
    };
    if (proxyUrl.username || proxyUrl.password) {
      const credentials = `${decodeURIComponent(proxyUrl.username)}:${decodeURIComponent(proxyUrl.password)}`;
      headers["Proxy-Authorization"] = `Basic ${Buffer.from(credentials).toString("base64")}`;
    }

    const connectRequest = proxyClient.request({
      hostname: proxyUrl.hostname,
      port: Number(proxyUrl.port || (proxyUrl.protocol === "https:" ? 443 : 80)),
      method: "CONNECT",
      path: `${targetHost}:${targetPort}`,
      headers,
    });
    connectRequest.once("connect", (response, socket, head) => {
      if ((response.statusCode ?? 0) !== 200) {
        socket.destroy();
        reject(new Error(`代理 CONNECT 返回 HTTP ${response.statusCode ?? 0}`));
        return;
      }
      if (head.length) {
        socket.unshift(head);
      }
      const secureSocket = tls.connect({
        socket,
        servername: targetHost,
        ALPNProtocols: ["h2"],
      });
      secureSocket.once("secureConnect", () => {
        if (secureSocket.alpnProtocol !== "h2") {
          secureSocket.destroy();
          reject(new Error(`DeepL 未协商 HTTP/2（实际：${secureSocket.alpnProtocol || "无"}）`));
          return;
        }
        resolve(secureSocket);
      });
      secureSocket.once("error", reject);
    });
    connectRequest.once("error", reject);
    connectRequest.setTimeout(10000, () => {
      connectRequest.destroy(new Error("代理连接超时"));
    });
    connectRequest.end();
  });
}

function deepLProxyUrl(): URL | undefined {
  const configuredProxy = vscode.workspace.getConfiguration("http").get<string>("proxy", "").trim();
  const proxyValue = configuredProxy
    || process.env.HTTPS_PROXY
    || process.env.https_proxy
    || process.env.HTTP_PROXY
    || process.env.http_proxy
    || "";
  if (!proxyValue) {
    return undefined;
  }
  try {
    const proxyUrl = new URL(proxyValue);
    return proxyUrl.protocol === "http:" || proxyUrl.protocol === "https:" ? proxyUrl : undefined;
  } catch {
    return undefined;
  }
}

function displayProxyUrl(proxyUrl: URL): string {
  return `${proxyUrl.protocol}//${proxyUrl.hostname}:${proxyUrl.port || (proxyUrl.protocol === "https:" ? "443" : "80")}`;
}

function parseDeepLResponse(statusCode: number, responseText: string): string {
  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(`HTTP ${statusCode}: ${responseText.slice(0, 300)}`);
  }
  const payload = JSON.parse(responseText) as { translations?: Array<{ text?: string }> };
  const translatedText = payload.translations?.[0]?.text;
  if (!translatedText) {
    throw new Error("DeepL 返回中未包含 translations[0].text");
  }
  return translatedText;
}

async function translateWithDeepLProxy(apiKey: string, body: string, proxyUrl: URL): Promise<string> {
  let secureSocket: tls.TLSSocket;
  try {
    secureSocket = await connectDeepLProxyTunnel(proxyUrl);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `DeepL 代理连接失败（${displayProxyUrl(proxyUrl)}）：${reason}。请确认代理已启动，或修改 VS Code 的 http.proxy 设置。`,
    );
  }
  return new Promise<string>((resolve, reject) => {
    const session = http2.connect("https://api-free.deepl.com", {
      createConnection: () => secureSocket,
    });
    let statusCode = 0;
    const chunks: Buffer[] = [];
    let completed = false;
    const finish = (error?: Error, result?: string) => {
      if (completed) return;
      completed = true;
      session.close();
      if (error) reject(error);
      else resolve(result ?? "");
    };
    session.once("error", (error) => finish(error));
    const request = session.request({
      ":method": "POST",
      ":path": "/v2/translate",
      authorization: `DeepL-Auth-Key ${apiKey}`,
      "content-type": "application/x-www-form-urlencoded",
      "content-length": Buffer.byteLength(body),
    });
    request.on("response", (headers) => {
      statusCode = Number(headers[":status"] ?? 0);
    });
    request.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => {
      const responseText = Buffer.concat(chunks).toString("utf8");
      try {
        finish(undefined, parseDeepLResponse(statusCode, responseText));
      } catch (error) {
        finish(error instanceof Error ? error : new Error("无法解析 DeepL 返回内容"));
      }
    });
    request.once("error", (error) => finish(error));
    request.setTimeout(30000, () => {
      request.close(http2.constants.NGHTTP2_CANCEL);
      finish(new Error("DeepL 请求超时"));
    });
    request.end(body);
  });
}

function translateWithDeepL(apiKey: string, text: string): Promise<string> {
  const body = new URLSearchParams({ text, source_lang: "EN", target_lang: "ZH" }).toString();
  const proxyUrl = deepLProxyUrl();
  if (proxyUrl) {
    return translateWithDeepLProxy(apiKey, body, proxyUrl);
  }
  return new Promise((resolve, reject) => {
    const request = https.request(
      "https://api-free.deepl.com/v2/translate",
      {
        method: "POST",
        headers: {
          Authorization: `DeepL-Auth-Key ${apiKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          const responseText = Buffer.concat(chunks).toString("utf8");
          try {
            resolve(parseDeepLResponse(response.statusCode ?? 0, responseText));
          } catch (error) {
            reject(error instanceof Error ? error : new Error("无法解析 DeepL 返回内容"));
          }
        });
      },
    );
    request.on("error", (error) => reject(new Error(`DeepL 连接失败：${error.message}`)));
    request.setTimeout(30000, () => request.destroy(new Error("DeepL 请求超时")));
    request.write(body);
    request.end();
  });
}

async function translateTextBlockWithRetry(apiKey: string, sentences: Candidate[], maxAttempts: number): Promise<string> {
  const requestText = sentences
    .map((sentence) => `[[S:${sentenceTranslationId(sentence)}]] ${sentence.translationText || sentence.raw}`)
    .join("\n");
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await translateWithDeepL(apiKey, requestText);
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        await delay(400 * attempt);
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("DeepL 请求失败");
}

function parseTranslatedSentences(translatedText: string, expectedSentences: Candidate[]): Map<string, string> {
  const expectedByTranslationId = new Map(expectedSentences.map((sentence) => [sentenceTranslationId(sentence), sentence]));
  const parsed = new Map<string, string>();
  const pattern = /\[\[S:(\d+\.\d+)\]\]\s*([\s\S]*?)(?=\s*\[\[S:\d+\.\d+\]\]|$)/g;
  for (const match of translatedText.matchAll(pattern)) {
    const translationId = match[1];
    const sentence = expectedByTranslationId.get(translationId);
    if (!sentence || parsed.has(sentence.id)) {
      throw new Error(`DeepL 返回了未知或重复的分句 ID：${translationId}`);
    }
    parsed.set(sentence.id, match[2].trim());
  }
  if (parsed.size !== expectedSentences.length) {
    const missing = expectedSentences
      .filter((sentence) => !parsed.has(sentence.id))
      .map(sentenceTranslationId)
      .join(", ");
    throw new Error(`DeepL 返回缺少分句 ID：${missing}`);
  }
  return parsed;
}

function sentenceTranslationId(sentence: Candidate): string {
  return `${sentence.blockIndex ?? sentence.range.line + 1}.${sentence.sentenceIndex ?? 1}`;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

class Ocr2mdRegexProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly getState: () => SidebarState,
    private readonly onMessage: (message: WebviewMessage) => void | Promise<void>,
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };
    webviewView.webview.onDidReceiveMessage((message: WebviewMessage) => this.onMessage(message));
    this.update();
  }

  update() {
    if (!this.view) {
      return;
    }

    this.view.webview.html = renderSidebarHtml(this.getState());
  }

  updateSearchResults() {
    this.update();
  }

  postMessage(message: unknown): Thenable<boolean> {
    return this.view?.webview.postMessage(message) ?? Promise.resolve(false);
  }
}

interface WebviewMessage {
  command?: string;
  id?: string;
  ids?: string[];
  path?: string;
  pattern?: string;
  moduleName?: string;
  regexScopeDirectory?: string;
  regexIncludeSubdirectories?: boolean;
  typeLabel?: string;
  lineType?: string;
  chapterFile?: string;
  chapterFiles?: Record<string, string>;
  localPath?: string;
  suggestions?: string[];
  replacement?: string;
  translation?: string;
  apiKey?: string;
  text?: string;
  silent?: boolean;
  previewEditable?: boolean;
}

interface AnnotationSidecar {
  schemaVersion: number;
  sourceFile: string;
  savedAt: string;
  rows: AnnotationSidecarRow[];
  annotationPairs?: AnnotationPair[];
  ignoredSpellings?: string[];
}

interface AnnotationSidecarRow {
  id: string;
  kind?: Candidate["kind"];
  typeLabel?: string;
  lineType?: string;
  chapterFile?: string;
  localPath?: string;
  suggestions?: string[];
  replacement?: string;
  sourcePath?: string;
  sourceLabel?: string;
  label: string;
  raw: string;
  preview: string;
  regexSource?: string;
  annotationNumber?: string;
  isWorkingCorrection?: boolean;
  workingCopyPath?: string;
  sourceLine?: number;
  line: number;
  start: number;
  endLine?: number;
  end: number;
}

interface TranslationSidecar {
  schemaVersion: number;
  sourceFile: string;
  savedAt: string;
  failedBlockIndexes: number[];
  sentences: TranslationSidecarRow[];
}

interface TranslationSidecarRow {
  id: string;
  raw: string;
  blockIndex?: number;
  sentenceIndex?: number;
  parentBlockId?: string;
  line: number;
  start: number;
  endLine?: number;
  end: number;
  translationText?: string;
  translation?: string;
  restoredTranslation?: string;
}

function toVsCodeRange(range: SourceRange): vscode.Range {
  return new vscode.Range(range.line, range.start, range.endLine ?? range.line, range.end);
}

function annotationSidecarUri(file: FileEntry): vscode.Uri {
  return vscode.Uri.file(`${file.path}.ocr2md.json`);
}

function translationSidecarUri(file: FileEntry): vscode.Uri {
  return vscode.Uri.file(`${file.path}.ocr2md.translations.json`);
}

interface TranslationExportPaths {
  outputRoot: vscode.Uri;
  orgUri: vscode.Uri;
  transUri: vscode.Uri;
  trans2orgUri: vscode.Uri;
  org2transUri: vscode.Uri;
  sourceLinkTarget: string;
  translationLinkTarget: string;
}

function translationExportPaths(file: FileEntry): TranslationExportPaths {
  const sourceUri = vscode.Uri.file(file.path);
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(sourceUri) ?? vscode.workspace.workspaceFolders?.[0];
  let basePath = workspaceFolder?.uri.fsPath ?? path.dirname(file.path);
  let relativePath = workspaceFolder ? path.relative(basePath, file.path) : path.basename(file.path);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    basePath = path.dirname(file.path);
    relativePath = path.basename(file.path);
  }

  const relativeParts = relativePath.split(path.sep).filter(Boolean);
  if (relativeParts[0]?.toLocaleLowerCase("en") === "output") {
    relativeParts.shift();
  }
  const normalizedRelativePath = relativeParts.length ? path.join(...relativeParts) : path.basename(file.path);
  const relativeDirectory = path.dirname(normalizedRelativePath) === "." ? "" : path.dirname(normalizedRelativePath);
  const outputRoot = vscode.Uri.file(path.join(basePath, "output_translated"));
  const orgUri = vscode.Uri.joinPath(outputRoot, "org", normalizedRelativePath);
  const transUri = vscode.Uri.joinPath(outputRoot, "trans", normalizedRelativePath);
  const crossDirectory = vscode.Uri.joinPath(outputRoot, "cross", relativeDirectory);
  const fileName = path.basename(normalizedRelativePath);
  const relativeWithoutExtension = normalizedRelativePath.replace(/\.md$/i, "").split(path.sep).join("/");
  const vaultRoot = findObsidianVaultRoot(basePath);
  const outputLinkRoot = (vaultRoot
    ? path.relative(vaultRoot, outputRoot.fsPath)
    : path.basename(outputRoot.fsPath))
    .split(path.sep)
    .join("/");

  return {
    outputRoot,
    orgUri,
    transUri,
    trans2orgUri: vscode.Uri.joinPath(crossDirectory, `trans2org ${fileName}`),
    org2transUri: vscode.Uri.joinPath(crossDirectory, `org2trans ${fileName}`),
    sourceLinkTarget: `${outputLinkRoot}/org/${relativeWithoutExtension}`,
    translationLinkTarget: `${outputLinkRoot}/trans/${relativeWithoutExtension}`,
  };
}

function findObsidianVaultRoot(startPath: string): string | undefined {
  let current = path.resolve(startPath);
  while (true) {
    if (fs.existsSync(path.join(current, ".obsidian"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

function toTranslationSidecarRow(sentence: Candidate): TranslationSidecarRow {
  return {
    id: sentence.id,
    raw: sentence.raw,
    blockIndex: sentence.blockIndex,
    sentenceIndex: sentence.sentenceIndex,
    parentBlockId: sentence.parentBlockId,
    line: sentence.range.line,
    start: sentence.range.start,
    endLine: sentence.range.endLine,
    end: sentence.range.end,
    translationText: sentence.translationText,
    translation: sentence.translation,
    restoredTranslation: sentence.restoredTranslation,
  };
}

function isTranslatableTextBlock(candidate: Candidate): boolean {
  return candidate.lineType === "正文"
    || candidate.lineType === "注释正文"
    || candidate.lineType === "合成.文本";
}

function buildObsidianTranslationUnits(
  sourceText: string,
  blocks: Candidate[],
  sentences: Candidate[],
): ObsidianTranslationUnit[] {
  const units: ObsidianTranslationUnit[] = [];
  const yaml = sourceYamlFrontmatter(sourceText);
  if (yaml) {
    units.push({ kind: "yaml", source: yaml });
  }

  const sentencesByBlockId = new Map<string, Candidate[]>();
  for (const sentence of [...sentences].sort(compareCandidatesByPosition)) {
    if (!sentence.parentBlockId) {
      continue;
    }
    const rows = sentencesByBlockId.get(sentence.parentBlockId) ?? [];
    rows.push(sentence);
    sentencesByBlockId.set(sentence.parentBlockId, rows);
  }

  const blockGroups = new Map<number, Candidate[]>();
  for (const block of [...blocks].sort(compareCandidatesByPosition)) {
    const blockIndex = block.blockIndex ?? block.range.line + 1;
    const rows = blockGroups.get(blockIndex) ?? [];
    rows.push(block);
    blockGroups.set(blockIndex, rows);
  }

  const sortedGroups = [...blockGroups.entries()].sort((left, right) => {
    const leftLine = Math.min(...left[1].map((candidate) => candidate.range.line));
    const rightLine = Math.min(...right[1].map((candidate) => candidate.range.line));
    return leftLine - rightLine || left[0] - right[0];
  });

  for (const [blockIndex, unsortedSegments] of sortedGroups) {
    const segments = [...unsortedSegments].sort(compareCandidatesByPosition);
    const groupId = `block-${blockIndex}`;
    for (const [segmentIndex, segment] of segments.entries()) {
      const segmentSentences = sentencesByBlockId.get(segment.id) ?? [];
      const segmentSuffix = segments.length > 1 ? `-${segmentIndex + 1}` : "";

      if (segment.lineType === "注释正文") {
        units.push({
          kind: "footnote",
          source: segment.raw,
          translation: translatedTextBlock(segment.raw, segmentSentences),
          anchorId: `bid-${blockIndex}${segmentSuffix}`,
          breakAfter: true,
          groupId,
        });
        continue;
      }

      if (isTranslatableTextBlock(segment)) {
        for (const sentence of segmentSentences) {
          const sentenceIndex = sentence.sentenceIndex ?? 1;
          units.push({
            kind: "sentence",
            source: sentence.raw.trim(),
            translation: translatedSentenceText(sentence),
            anchorId: `sid-${blockIndex}-${sentenceIndex}`,
            groupId,
          });
        }
        continue;
      }

      if (segment.lineType === "标题") {
        units.push({
          kind: "sentence",
          source: segment.raw,
          // Heading translation is not collected by the current MVP, so keep
          // the heading unchanged without counting it as a missing translation.
          translation: segment.raw,
          anchorId: `sid-${blockIndex}-1`,
          breakAfter: true,
          groupId,
        });
        continue;
      }

      units.push({
        kind: "structure",
        source: segment.raw,
        translation: segment.raw,
        anchorId: `bid-${blockIndex}${segmentSuffix}`,
        breakAfter: true,
        groupId,
        structureRole: translationStructureRole(segment.lineType),
      });
    }
  }
  return units;
}

function translationStructureRole(lineType: string | undefined): ObsidianStructureRole {
  switch (lineType) {
    case "合成.标记":
      return "marker";
    case "合成.图片":
      return "image";
    case "合成.callout":
      return "callout";
    case "合成.html":
      return "html";
    case "latex.标记":
      return "latex-marker";
    case "latex.代码":
      return "latex-code";
    case "latex":
      return "latex";
    default:
      return "other";
  }
}

function sourceYamlFrontmatter(sourceText: string): string | undefined {
  const lines = sourceText.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines[0]?.trim() !== "---") {
    return undefined;
  }
  const closingOffset = lines.slice(1).findIndex((line) => /^(?:---|\.\.\.)\s*$/.test(line.trim()));
  if (closingOffset < 0) {
    return undefined;
  }
  return lines.slice(0, closingOffset + 2).join("\n");
}

function translatedSentenceText(sentence: Candidate): string | undefined {
  const translation = sentence.restoredTranslation?.trim() || sentence.translation?.trim();
  if (!translation) {
    return undefined;
  }
  const leading = sentence.raw.match(/^\s*/)?.[0] ?? "";
  const trailing = sentence.raw.match(/\s*$/)?.[0] ?? "";
  return `${leading}${translation}${trailing}`.trim();
}

function translatedTextBlock(source: string, sentences: Candidate[]): string | undefined {
  if (!sentences.length || !sentences.some((sentence) => sentence.restoredTranslation?.trim() || sentence.translation?.trim())) {
    return undefined;
  }
  let cursor = 0;
  let result = "";
  for (const sentence of [...sentences].sort(compareCandidatesByPosition)) {
    const sourceAt = source.indexOf(sentence.raw, cursor);
    if (sourceAt < 0) {
      return undefined;
    }
    result += source.slice(cursor, sourceAt);
    result += translatedSentenceText(sentence) ?? sentence.raw;
    cursor = sourceAt + sentence.raw.length;
  }
  return result + source.slice(cursor);
}

function tableRowKey(candidate: Candidate): string {
  return `${candidate.sourcePath ?? ""}:${candidate.range.line}:${candidate.range.start}:${candidate.range.endLine ?? candidate.range.line}:${candidate.range.end}:${candidate.raw}`;
}

function spellingKey(word: string): string {
  return word.trim().toLocaleLowerCase("en");
}

function inferJoinedOcrReplacement(word: string, policies: Map<string, Candidate>): string | undefined {
  const parts = splitLikelyJoinedOcrWord(word);
  if (!parts) {
    return undefined;
  }
  const prefixPolicy = policies.get(spellingKey(parts.prefix));
  if (prefixPolicy?.lineType !== "已确认" || !prefixPolicy.replacement?.trim()) {
    return undefined;
  }
  return `${normalizeSpellingReplacement(prefixPolicy.replacement)}-${parts.suffix}`;
}

function isOcrCorrectedMarkdown(text: string): boolean {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines[0]?.trim() !== "---") {
    return false;
  }
  const closingIndex = lines.slice(1).findIndex((line) => /^(?:---|\.\.\.)\s*$/.test(line.trim()));
  if (closingIndex < 0) {
    return false;
  }
  return lines
    .slice(1, closingIndex + 1)
    .some((line) => /^\s*ocr2md_corrected\s*:\s*(?:true|"true"|'true')\s*(?:#.*)?$/i.test(line));
}

function scanTextBlocks(text: string): Candidate[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  let bodyStartLine = 0;
  if (lines[0]?.trim() === "---") {
    const closingIndex = lines.slice(1).findIndex((line) => /^(?:---|\.\.\.)\s*$/.test(line.trim()));
    if (closingIndex >= 0) {
      bodyStartLine = closingIndex + 2;
    }
  }

  const blocks: Candidate[] = [];
  const appendBlock = (start: number, end: number, lineType: string, blockIndex: number) => {
    const raw = lines.slice(start, end + 1).join("\n");
    blocks.push({
      id: `text-block-${start}-${end}-${blocks.length + 1}`,
      kind: "regex",
      // Segments derived from one original text block intentionally share this index.
      label: `文本块 ${blockIndex}`,
      raw,
      preview: raw,
      range: { line: start, start: 0, endLine: end, end: lines[end]?.length ?? 0 },
      typeLabel: "文本块",
      lineType,
      blockIndex,
      status: "候选",
    });
  };
  let startLine = -1;
  let sourceBlockIndex = 0;
  const finishBlock = (endLine: number) => {
    if (startLine < 0 || endLine < startLine) {
      return;
    }
    sourceBlockIndex += 1;
    const raw = lines.slice(startLine, endLine + 1).join("\n");
    const blockType = detectTextBlockType(raw);
    if (blockType === "合成块") {
      splitCompositeTextBlock(lines, startLine, endLine).forEach((segment) =>
        appendBlock(segment.startLine, segment.endLine, segment.lineType, sourceBlockIndex),
      );
    } else {
      appendBlock(startLine, endLine, blockType, sourceBlockIndex);
    }
    startLine = -1;
  };

  for (let lineIndex = bodyStartLine; lineIndex < lines.length; lineIndex += 1) {
    if (lines[lineIndex].trim() === "") {
      finishBlock(lineIndex - 1);
    } else if (startLine < 0) {
      startLine = lineIndex;
    }
  }
  finishBlock(lines.length - 1);
  return blocks;
}

function scanSentencesInTextBlocks(blocks: Candidate[]): Candidate[] {
  const nextSentenceIndexByBlock = new Map<number, number>();
  return [...blocks]
    .sort(compareCandidatesByPosition)
    .flatMap((block) => {
      const blockIndex = block.blockIndex ?? block.range.line + 1;
      const startIndex = nextSentenceIndexByBlock.get(blockIndex) ?? 0;
      const sentences = scanSentencesInTextBlock(block, startIndex);
      nextSentenceIndexByBlock.set(blockIndex, startIndex + sentences.length);
      return sentences;
    });
}

function scanSentencesInTextBlock(block: Candidate, initialSentenceIndex = 0): Candidate[] {
  const sentences = splitOcrSentenceSegments(block.raw);
  let sentenceIndex = initialSentenceIndex;
  return sentences.map((sentence) => {
    sentenceIndex += 1;
    const [startOffset, endOffset] = sentence.range;
    const start = textPositionAt(block.raw, startOffset);
    const end = textPositionAt(block.raw, endOffset);
    const blockIndex = block.blockIndex ?? block.range.line + 1;
    const protectedText = protectTranslationSyntax(sentence.raw);
    return {
      id: `sentence-${block.id}-${startOffset}-${endOffset}`,
      kind: "regex" as const,
      label: `分句 ${blockIndex}.${sentenceIndex}`,
      raw: sentence.raw,
      preview: sentence.raw,
      translationText: protectedText.text,
      protectedTokens: protectedText.tokens,
      range: {
        line: block.range.line + start.line,
        start: start.column,
        endLine: block.range.line + end.line,
        end: end.column,
      },
      typeLabel: "分句",
      lineType: "待确认",
      blockIndex: block.blockIndex,
      sentenceIndex,
      parentBlockId: block.id,
      reason: `来自文本块 ${blockIndex}`,
      status: "候选" as const,
    };
  });
}

function protectTranslationSyntax(text: string): { text: string; tokens: TranslationProtectedToken[] } {
  const matches: Array<{ start: number; end: number; kind: TranslationProtectedToken["kind"] }> = [];
  const footnotePattern = /\[\^\d+\]:\s*/g;
  const inlineLatexPattern = /(?<!\\)\$(?!\$)(?:\\.|[^$\\\r\n])+(?<!\\)\$/g;

  for (const match of text.matchAll(footnotePattern)) {
    matches.push({ start: match.index ?? 0, end: (match.index ?? 0) + match[0].length, kind: "footnote" });
  }
  for (const match of text.matchAll(inlineLatexPattern)) {
    matches.push({ start: match.index ?? 0, end: (match.index ?? 0) + match[0].length, kind: "latex" });
  }

  const tokens: TranslationProtectedToken[] = [];
  let output = "";
  let cursor = 0;
  for (const match of matches.sort((left, right) => left.start - right.start)) {
    if (match.start < cursor) {
      continue;
    }
    const placeholder = `[[OCR2MD_${match.kind.toUpperCase()}_${tokens.length + 1}]]`;
    tokens.push({ placeholder, original: text.slice(match.start, match.end), kind: match.kind });
    output += text.slice(cursor, match.start) + placeholder;
    cursor = match.end;
  }
  return { text: output + text.slice(cursor), tokens };
}

function restoreProtectedTranslation(text: string, tokens: TranslationProtectedToken[]): string {
  return tokens.reduce((result, token) => {
    let restored = "";
    let cursor = 0;
    let tokenAt = result.indexOf(token.placeholder, cursor);
    while (tokenAt >= 0) {
      const nextCharacter = result.charAt(tokenAt + token.placeholder.length);
      const replacement = /\s$/.test(token.original) && /^\s/.test(nextCharacter)
        ? token.original.replace(/\s+$/, "")
        : token.original;
      restored += result.slice(cursor, tokenAt) + replacement;
      cursor = tokenAt + token.placeholder.length;
      tokenAt = result.indexOf(token.placeholder, cursor);
    }
    return restored + result.slice(cursor);
  }, text);
}

function textPositionAt(text: string, offset: number): { line: number; column: number } {
  const prefix = text.slice(0, offset);
  const lineBreak = prefix.lastIndexOf("\n");
  return {
    line: (prefix.match(/\n/g) ?? []).length,
    column: lineBreak < 0 ? prefix.length : prefix.length - lineBreak - 1,
  };
}

function detectTextBlockType(raw: string): "标题" | "正文" | "注释正文" | "latex" | "合成块" {
  const trimmed = raw.trim();
  const isMultiLine = trimmed.includes("\n");
  if (!isMultiLine && /^#{1,6}\s+/.test(trimmed)) {
    return "标题";
  }
  if (!isMultiLine && /^(?:\[\^\d+\]:|\d+\.\s+)/.test(trimmed)) {
    return "注释正文";
  }
  if (!isMultiLine && /^(?:\\\[|\\begin\{|\\\(|\$\$|\\(?:frac|sum|prod|int|Bigg|left|right)\b)/.test(trimmed)) {
    return "latex";
  }
  return isMultiLine ? "合成块" : "正文";
}

interface TextBlockSegment {
  startLine: number;
  endLine: number;
  lineType:
    | "合成.标记"
    | "合成.图片"
    | "合成.文本"
    | "合成.callout"
    | "合成.html"
    | "latex"
    | "latex.标记"
    | "latex.代码";
}

function splitCompositeTextBlock(lines: string[], startLine: number, endLine: number): TextBlockSegment[] {
  const segments: TextBlockSegment[] = [];
  let current: TextBlockSegment | undefined;
  let latexDelimiter: "$$" | "\\[" | undefined;
  for (let lineIndex = startLine; lineIndex <= endLine; lineIndex += 1) {
    const trimmed = lines[lineIndex].trim();
    let lineType: TextBlockSegment["lineType"];

    if (latexDelimiter) {
      const isClosingDelimiter =
        (latexDelimiter === "$$" && trimmed === "$$") ||
        (latexDelimiter === "\\[" && trimmed === "\\]");
      lineType = isClosingDelimiter ? "latex.标记" : "latex.代码";
      if (isClosingDelimiter) {
        latexDelimiter = undefined;
      }
    } else if (trimmed === "$$" || trimmed === "\\[") {
      latexDelimiter = trimmed;
      lineType = "latex.标记";
    } else {
      lineType = detectCompositeLineType(lines[lineIndex]);
    }

    if (current?.lineType === lineType && isMergeableCompositeType(lineType)) {
      current.endLine = lineIndex;
      continue;
    }
    current = { startLine: lineIndex, endLine: lineIndex, lineType };
    segments.push(current);
  }
  return segments;
}

function detectCompositeLineType(
  line: string,
): "合成.标记" | "合成.图片" | "合成.文本" | "合成.callout" | "合成.html" | "latex" {
  const trimmed = line.trim();
  const quoteContent = trimmed.replace(/^(?:>\s*)+/, "").trim();
  if (/^>+\s*$/.test(trimmed)) {
    return "合成.标记";
  }
  if (/^\[![^\]]+\]/.test(quoteContent)) {
    return "合成.callout";
  }
  if (/!\[[^\]]*\]\([^)]*\)|!\[\[[^\]]+\]\]|<img\b/i.test(quoteContent)) {
    return "合成.图片";
  }
  if (/^<\/?[A-Za-z][^>]*>/.test(quoteContent)) {
    return "合成.html";
  }
  if (/^(?:\\\[|\\begin\{|\\\(|\$\$|\\(?:frac|sum|prod|int|Bigg|left|right)\b)/.test(quoteContent)) {
    return "latex";
  }
  if (/^(?:#{1,6}\s+|[-*+]\s*$|\d+\.\s*$|(?:---|\*\*\*|___)\s*$|<sup>\s*\d+\s*<\/sup>\s*$)/i.test(quoteContent)) {
    return "合成.标记";
  }
  return "合成.文本";
}

function isMergeableCompositeType(lineType: TextBlockSegment["lineType"]): boolean {
  return lineType === "合成.文本" || lineType === "latex" || lineType === "latex.代码";
}

async function scanCSpellCandidates(text: string, sourcePath: string): Promise<Candidate[]> {
  // cspell-lib is ESM-only. Keep the extension CommonJS-compatible while asking
  // the VS Code Node runtime to load the optional spell-checking module natively.
  const dynamicImport = new Function("modulePath", "return import(modulePath);") as (modulePath: string) => Promise<typeof import("cspell-lib")>;
  const cspell = await dynamicImport("cspell-lib");
  const result = await cspell.spellCheckDocument(
    {
      uri: vscode.Uri.file(sourcePath).toString(),
      text,
      languageId: "markdown",
      locale: "en",
    },
    {
      generateSuggestions: true,
      numSuggestions: 5,
      noConfigSearch: false,
    },
    { enabled: true, language: "en" },
  );
  const lines = text.split(/\r?\n/);
  const spacedWordCandidates = await scanSpacedWordCandidates(cspell, text, sourcePath, lines);
  const spacedWordIssueOffsets = new Set(
    spacedWordCandidates.map((candidate) =>
      textOffsetAtPosition(text, candidate.range.line, candidate.range.start) + candidate.raw.indexOf(" ") + 1,
    ),
  );
  const spellingCandidates = result.issues
    .filter((issue) => !spacedWordIssueOffsets.has(issue.offset))
    .filter((issue) => isLatexCommandIssue(text, issue) || shouldKeepSpellIssue(issue))
    .map((issue, index) => {
      const { line, character: start } = positionAtTextOffset(text, issue.offset);
      const isLatex = isLatexCommandIssue(text, issue);
      const raw = isLatex ? `\\${issue.text}` : issue.text;
      const rangeStart = isLatex ? Math.max(0, start - 1) : start;
      const suggestions = isLatex ? [] : normalizeSpellSuggestions(issue.text, issue.suggestions ?? []);
      return {
        id: `spelling-${encodeURIComponent(sourcePath)}-${line}-${rangeStart}-${raw}-${index}`,
        kind: "regex" as const,
        label: raw,
        raw,
        preview: lines[line]?.trim() ?? issue.line.text.trim(),
        sourcePath,
        sourceLabel: path.basename(sourcePath),
        range: { line, start: rangeStart, end: rangeStart + raw.length },
        typeLabel: "拼写检查",
        lineType: isLatex ? "latex" : "待确认",
        suggestions,
        replacement: suggestions[0] ?? "",
        reason: isLatex ? "LaTeX 命令" : "CSpell 未识别词",
        status: "候选" as const,
      };
    });
  return [...spellingCandidates, ...spacedWordCandidates].sort(compareCandidatesByPosition);
}

async function scanSpacedWordCandidates(
  cspell: typeof import("cspell-lib"),
  text: string,
  sourcePath: string,
  lines: string[],
): Promise<Candidate[]> {
  const candidates: Candidate[] = [];
  const testedWords = new Map<string, boolean>();
  const pattern = /\b([A-Za-z]{3,}) ([A-Za-z]{2,})\b/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    const [, prefix, suffix] = match;
    if (!isLikelyWordSuffix(suffix)) {
      continue;
    }
    const joined = `${prefix}${suffix}`;
    let isKnown = testedWords.get(joined.toLocaleLowerCase("en"));
    if (isKnown === undefined) {
      const checked = await cspell.spellCheckDocument(
        { uri: vscode.Uri.file(sourcePath).toString(), text: joined, languageId: "markdown", locale: "en" },
        { generateSuggestions: false, numSuggestions: 0, noConfigSearch: false },
        { enabled: true, language: "en" },
      );
      isKnown = !checked.issues.some((issue) => issue.text.toLocaleLowerCase("en") === joined.toLocaleLowerCase("en"));
      testedWords.set(joined.toLocaleLowerCase("en"), isKnown);
    }
    if (!isKnown) {
      continue;
    }
    const { line, character: start } = positionAtTextOffset(text, match.index);
    const raw = match[0];
    candidates.push({
      id: `spelling-space-${encodeURIComponent(sourcePath)}-${line}-${start}-${raw}`,
      kind: "regex",
      label: raw,
      raw,
      preview: lines[line]?.trim() ?? raw,
      sourcePath,
      sourceLabel: path.basename(sourcePath),
      range: { line, start, end: start + raw.length },
      typeLabel: "拼写检查",
      lineType: "待确认",
      suggestions: [joined],
      replacement: joined,
      reason: "疑似 OCR 单词断开",
      status: "候选",
    });
  }
  return candidates;
}

function isLikelyWordSuffix(word: string): boolean {
  return /^(?:ized|ised|ization|isation|ing|tion|tions|ment|ments|ness|able|ible|ality|ities|ously|ively|edly|ed|ly|er|ers|est)$/i.test(word);
}

function normalizeSpellSuggestions(source: string, suggestions: string[]): string[] {
  const normalized = suggestions.map((suggestion) =>
    normalizeSpellingReplacement(matchWordCapitalization(source, suggestion))
  );
  return [...new Set(normalized)];
}

function normalizeSpellingReplacement(value: string): string {
  // OCR and dictionaries can produce compatibility ligatures such as "ﬀ".
  // NFKC converts them to ordinary editable characters without normalizing
  // unrelated Markdown source text.
  return value.normalize("NFKC").trim();
}

function shouldKeepSpellIssue(issue: { text: string; suggestions?: string[] }): boolean {
  const word = issue.text;
  if (isLikelyAcronym(word)) {
    return false;
  }
  if (!isTitleCaseWord(word)) {
    return true;
  }
  if (splitLikelyJoinedOcrWord(word)) {
    return true;
  }

  // Names are intentionally treated more conservatively than normal words.
  // Keep examples such as "Bufet" -> "Buffett", but suppress unknown names
  // whose dictionary suggestions are unrelated.
  return (issue.suggestions ?? []).some((suggestion) =>
    editDistance(word.toLocaleLowerCase("en"), suggestion.toLocaleLowerCase("en")) <= Math.max(2, Math.ceil(word.length * 0.25)),
  );
}

function splitLikelyJoinedOcrWord(word: string): { prefix: string; suffix: string } | undefined {
  const suffixes = ["specific", "related", "style", "based", "like"];
  const lower = word.toLocaleLowerCase("en");
  const suffix = suffixes.find((candidate) =>
    lower.endsWith(candidate) && word.length - candidate.length >= 3
  );
  if (!suffix) {
    return undefined;
  }
  return {
    prefix: word.slice(0, -suffix.length),
    suffix: word.slice(-suffix.length),
  };
}

function isLatexCommandIssue(text: string, issue: { offset: number; text: string }): boolean {
  return issue.offset > 0 && text[issue.offset - 1] === "\\" && /^[A-Za-z]+$/.test(issue.text);
}

function isLikelyAcronym(word: string): boolean {
  return /^(?:[A-Z]{2,}|(?:[A-Z]\.){2,}|[A-Z][A-Z0-9_-]*\d[A-Z0-9_-]*)$/.test(word);
}

function isTitleCaseWord(word: string): boolean {
  return /^[A-Z][a-z]+(?:['-][A-Z]?[a-z]+)*$/.test(word);
}

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0];
    previous[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex];
      previous[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[right.length];
}

function matchWordCapitalization(source: string, suggestion: string): string {
  if (!source || !suggestion) {
    return suggestion;
  }
  if (source === source.toUpperCase() && source !== source.toLowerCase()) {
    return suggestion.toUpperCase();
  }
  if (source[0] === source[0].toUpperCase() && source[0] !== source[0].toLowerCase()) {
    return `${suggestion[0]?.toUpperCase() ?? ""}${suggestion.slice(1)}`;
  }
  return suggestion;
}

function positionAtTextOffset(text: string, offset: number): { line: number; character: number } {
  const before = text.slice(0, offset);
  const lastNewline = before.lastIndexOf("\n");
  const line = (before.match(/\n/g) ?? []).length;
  return { line, character: offset - lastNewline - 1 };
}

function textOffsetAtPosition(text: string, line: number, character: number): number {
  let offset = 0;
  for (let index = 0; index < line; index += 1) {
    const nextNewline = text.indexOf("\n", offset);
    if (nextNewline < 0) {
      return text.length;
    }
    offset = nextNewline + 1;
  }
  return offset + character;
}

function compareCandidatesByPosition(left: Candidate, right: Candidate): number {
  return (left.sourceLabel ?? "").localeCompare(right.sourceLabel ?? "") || left.range.line - right.range.line || left.range.start - right.range.start || left.raw.localeCompare(right.raw);
}

function compareSourcePaths(left: string, right: string): number {
  return path.basename(left).localeCompare(path.basename(right), "zh-CN", { numeric: true }) || left.localeCompare(right);
}

function compareCandidatesByGlobalPosition(left: Candidate, right: Candidate): number {
  const leftPath = left.sourcePath ?? "";
  const rightPath = right.sourcePath ?? "";
  return compareSourcePaths(leftPath, rightPath) ||
    (left.sourceLine ?? left.range.line) - (right.sourceLine ?? right.range.line) ||
    left.range.start - right.range.start;
}

function defaultLineTypeForModule(moduleName: string, raw: string): string | undefined {
  if (moduleName === "注释") {
    if (/<sup>\s*\(?\s*\d+\s*\)?\s*<\/sup>|\[\^\d+\](?!:)/i.test(raw)) {
      return "注释引用";
    }
    if (/^\s*(?:\d+\.\s+|\(\d+\)(?:\s|$)|\[\^\d+\]:\s+)/.test(raw)) {
      return "注释正文";
    }
    return "注释引用";
  }
  if (moduleName === "标题") {
    const match = /^(#{1,6})\s+/.exec(raw);
    return match ? ["一级", "二级", "三级", "四级", "五级", "六级"][match[1].length - 1] : "非标题";
  }
  if (moduleName === "图片") return "图片引用";
  if (moduleName === "非法断行") return "断行候选";
  return undefined;
}

function splitModuleRegexPatterns(input: string): string[] {
  return input
    .split(/^\s*---\s*$/m)
    .map((pattern) => pattern.trim())
    .filter(Boolean);
}

function regexMatchesCandidate(candidate: Candidate, pattern: string): boolean {
  try {
    const regex = new RegExp(pattern, "gm");
    return regex.test(candidate.raw);
  } catch {
    return false;
  }
}

interface ChapterOutputSegment {
  fileName: string;
  startLine: number;
  endLine: number;
}

function buildChapterOutputSegments(rows: Candidate[], lineCount: number): ChapterOutputSegment[] {
  const chapterStarts = new Map<string, number>();
  for (const row of rows) {
    if (row.typeLabel !== "标题" || !row.chapterFile?.trim()) {
      continue;
    }
    const fileName = outputChapterFileName(row.chapterFile);
    const existingStart = chapterStarts.get(fileName);
    if (existingStart === undefined || row.range.line < existingStart) {
      chapterStarts.set(fileName, row.range.line);
    }
  }

  const starts = [...chapterStarts.entries()]
    .map(([fileName, startLine]) => ({ fileName, startLine }))
    .sort((left, right) => left.startLine - right.startLine || left.fileName.localeCompare(right.fileName));

  return starts.map((chapter, index) => ({
    fileName: chapter.fileName,
    // Front matter and document-level metadata belong to the first configured chapter.
    startLine: index === 0 ? 0 : chapter.startLine,
    endLine: starts[index + 1]?.startLine ?? lineCount,
  }));
}

function outputChapterFileName(chapterFile: string): string {
  const withoutExtension = chapterFile.trim().replace(/\.md$/i, "");
  const safeName = withoutExtension
    .replace(/<sup\b[^>]*>[\s\S]*?<\/sup>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/[\/\\:*?"<>|]/g, " ")
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .trim() || "未命名章节";
  return `${safeName}.md`;
}

function shiftCandidateToChapter(candidate: Candidate, lineOffset: number): Candidate {
  return {
    ...candidate,
    range: {
      ...candidate.range,
      line: candidate.range.line - lineOffset,
      endLine: candidate.range.endLine === undefined ? undefined : candidate.range.endLine - lineOffset,
    },
  };
}

function shiftCandidateToGlobalSource(candidate: Candidate, lineOffset: number): Candidate {
  const localLine = candidate.isWorkingCorrection && candidate.sourceLine !== undefined
    ? candidate.sourceLine
    : candidate.range.line;
  return {
    ...candidate,
    sourceLine: lineOffset + localLine,
    range: {
      ...candidate.range,
      line: lineOffset + localLine,
      endLine: candidate.isWorkingCorrection
        ? lineOffset + localLine
        : candidate.range.endLine === undefined ? undefined : lineOffset + candidate.range.endLine,
    },
  };
}

interface AnnotationRelocationResult {
  footnotesByChapter: Map<string, string[]>;
  applied: number;
  skipped: string[];
}

function relocateAnnotationBodiesToChapterEnds(
  lines: string[],
  rows: Candidate[],
  pairs: AnnotationPair[],
): AnnotationRelocationResult {
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const footnotesByChapter = new Map<string, string[]>();
  const skipped: string[] = [];
  let applied = 0;

  for (const pair of pairs) {
    const ref = pair.refCandidateId ? rowsById.get(pair.refCandidateId) : undefined;
    const body = pair.bodyCandidateId ? rowsById.get(pair.bodyCandidateId) : undefined;
    if (!ref || !body || !ref.chapterFile || ref.chapterFile !== body.chapterFile) {
      skipped.push(pair.id);
      continue;
    }
    const removed = removeAnnotationBodyFromSource(lines, body, pair.number);
    if (!removed && !body.isWorkingCorrection) {
      skipped.push(body.id);
      continue;
    }
    const footnote = canonicalFootnoteBody(pair.number, body.raw, removed?.text ?? "");
    if (!footnote) {
      skipped.push(body.id);
      continue;
    }
    const chapterFile = outputChapterFileName(ref.chapterFile);
    const chapterFootnotes = footnotesByChapter.get(chapterFile) ?? [];
    chapterFootnotes.push(footnote);
    footnotesByChapter.set(chapterFile, chapterFootnotes);
    applied += 1;
  }

  return { footnotesByChapter, applied, skipped };
}

function removeAnnotationBodyFromSource(
  lines: string[],
  body: Candidate,
  number: string,
): { text: string } | undefined {
  const expectedLine = body.range.line;
  const candidates = Array.from({ length: 25 }, (_, index) => expectedLine + (index === 0 ? 0 : Math.ceil(index / 2) * (index % 2 ? -1 : 1)))
    .filter((line) => line >= 0 && line < lines.length);
  const escapedNumber = escapeRegex(number);
  // A footnote body marker must begin the logical line. An unanchored (n)
  // also matches the number inside an inline <sup>(n)</sup> reference and can
  // delete prose when a working-copy body has no exact source-line mapping.
  const markerPattern = new RegExp(
    `^\\s*(?:\\[\\^${escapedNumber}\\]:|\\(\\s*${escapedNumber}\\s*\\)|（\\s*${escapedNumber}\\s*）|${escapedNumber}\\.\\s+)`,
    "i",
  );
  for (const lineIndex of candidates) {
    const line = lines[lineIndex];
    const marker = markerPattern.exec(line);
    if (!marker) continue;
    const text = line.slice(marker.index).trim();
    lines[lineIndex] = line.slice(0, marker.index).trimEnd();
    return { text };
  }
  return undefined;
}

function canonicalFootnoteBody(number: string, preferredText: string, fallbackText: string): string | undefined {
  const escapedNumber = escapeRegex(number);
  const removeMarker = (value: string) => value.replace(
    new RegExp(`^\\s*(?:\\[\\^${escapedNumber}\\]:|\\(\\s*${escapedNumber}\\s*\\)|（\\s*${escapedNumber}\\s*）|${escapedNumber}\\.)\\s*`, "i"),
    "",
  );
  const preferredContent = normalizeSingleLineCorrection(removeMarker(preferredText));
  const fallbackContent = normalizeSingleLineCorrection(removeMarker(fallbackText));
  const content = preferredContent || fallbackContent;
  return content ? `[^${number}]: ${content}` : undefined;
}

function applyWorkingAnnotationReferences(lines: string[], rows: Candidate[]): { applied: number; skipped: string[] } {
  const skipped: string[] = [];
  let applied = 0;
  for (const row of rows.filter((candidate) =>
    candidate.typeLabel === "注释" && candidate.lineType === "注释引用" && candidate.isWorkingCorrection
  )) {
    const number = annotationNumberForRow(row);
    const lineIndex = row.range.line;
    if (!number || lineIndex < 0 || lineIndex >= lines.length) {
      skipped.push(row.id);
      continue;
    }
    const canonical = `[^${number}]`;
    const line = lines[lineIndex];
    if (line.includes(canonical)) continue;
    const escapedNumber = escapeRegex(number);
    const markerPattern = new RegExp(`<sup>\\s*\\(?\\s*${escapedNumber}\\s*\\)?\\s*</sup>|\\(\\s*${escapedNumber}\\s*\\)|（\\s*${escapedNumber}\\s*）`, "ig");
    const matches = [...line.matchAll(markerPattern)];
    const nearest = matches.sort((left, right) =>
      Math.abs((left.index ?? 0) - row.range.start) - Math.abs((right.index ?? 0) - row.range.start)
    )[0];
    if (nearest?.index !== undefined) {
      lines[lineIndex] = `${line.slice(0, nearest.index)}${canonical}${line.slice(nearest.index + nearest[0].length)}`;
    } else {
      lines[lineIndex] = `${line.trimEnd()} ${canonical}`;
    }
    applied += 1;
  }
  return { applied, skipped };
}

function withOcrCorrectionFrontMatter(markdown: string, outputTimestamp: string): string {
  const normalized = markdown.replace(/^\uFEFF/, "");
  const lines = normalized.split("\n");
  const hasFrontMatter = lines[0]?.trim() === "---";
  if (!hasFrontMatter) {
    return [
      "---",
      "ocr2md_corrected: true",
      `ocr2md_corrected_at: \"${outputTimestamp}\"`,
      "---",
      "",
      normalized,
    ].join("\n");
  }

  const closingIndex = lines.slice(1).findIndex((line) => /^(?:---|\.\.\.)\s*$/.test(line.trim()));
  if (closingIndex < 0) {
    // A malformed existing frontmatter block is left untouched; prepend a valid
    // marker rather than risking corruption of user metadata.
    return withOcrCorrectionFrontMatter(`\n${normalized}`, outputTimestamp);
  }

  const endIndex = closingIndex + 1;
  const frontMatter = lines.slice(1, endIndex);
  const upsert = (key: string, value: string) => {
    const index = frontMatter.findIndex((line) => new RegExp(`^${escapeRegex(key)}\\s*:`).test(line));
    if (index >= 0) {
      frontMatter[index] = `${key}: ${value}`;
    } else {
      frontMatter.push(`${key}: ${value}`);
    }
  };
  upsert("ocr2md_corrected", "true");
  upsert("ocr2md_corrected_at", `\"${outputTimestamp}\"`);
  return ["---", ...frontMatter, lines[endIndex], ...lines.slice(endIndex + 1)].join("\n");
}

function formatLocalIsoTimestamp(date: Date): string {
  const pad = (value: number, width = 2) => String(value).padStart(width, "0");
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offsetMinutes);
  return [
    `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`,
  ].join("T") + `${sign}${pad(Math.floor(absoluteOffset / 60))}:${pad(absoluteOffset % 60)}`;
}

function applyMarkdownCorrections(
  sourceText: string,
  rows: Candidate[],
  spellingPolicies: Candidate[] = rows,
): { text: string; applied: number; skipped: string[] } {
  const lines = sourceText.split(/\r?\n/);
  const skipped: string[] = [];
  let applied = 0;

  const spellingResult = applyConfirmedSpellingCorrections(lines, spellingPolicies);
  applied += spellingResult.applied;
  skipped.push(...spellingResult.skipped);

  // These edits preserve line count, so the stored line positions remain valid
  // until the final pass that joins confirmed illegal line breaks.
  for (const row of rows) {
    if (row.typeLabel === "拼写检查" || row.isWorkingCorrection) {
      continue;
    }
    const normalizedRow = withDefaultLineType(row);
    const lineIndex = isAnnotationLineType(normalizedRow.lineType)
      ? resolveAnnotationLineIndex(lines, normalizedRow)
      : row.range.line;
    if (lineIndex < 0 || lineIndex >= lines.length) {
      skipped.push(row.id);
      continue;
    }

    if (row.typeLabel === "标题") {
      const heading = normalizeHeadingLine(lines[lineIndex], row.lineType);
      if (heading === undefined) {
        skipped.push(row.id);
      } else if (heading !== lines[lineIndex]) {
        lines[lineIndex] = heading;
        applied += 1;
      }
      continue;
    }

    if (row.typeLabel === "非法断行" && row.lineType === "单行订正") {
      const correctedLine = normalizeSingleLineCorrection(row.replacement ?? "");
      if (!correctedLine) {
        skipped.push(row.id);
      } else if (correctedLine !== lines[lineIndex]) {
        lines[lineIndex] = correctedLine;
        applied += 1;
      }
      continue;
    }

    if (isAnnotationLineType(normalizedRow.lineType)) {
      const annotation = normalizeAnnotationLine(lines[lineIndex], normalizedRow);
      if (annotation === undefined) {
        skipped.push(row.id);
      } else if (annotation !== lines[lineIndex]) {
        lines[lineIndex] = annotation;
        applied += 1;
      }
      continue;
    }

    if (row.typeLabel === "图片" && row.localPath) {
      const replacement = replaceExactText(lines[lineIndex], row.raw, row.localPath);
      if (replacement === undefined) {
        skipped.push(row.id);
      } else if (replacement !== lines[lineIndex]) {
        lines[lineIndex] = replacement;
        applied += 1;
      }
    }
  }

  const confirmedBreaks = rows
    .filter((row) => row.typeLabel === "非法断行" && row.lineType === "需要合并" && row.range.endLine !== undefined)
    .sort((left, right) => (right.range.line - left.range.line) || ((right.range.endLine ?? 0) - (left.range.endLine ?? 0)));
  let previouslyMergedStart = Number.POSITIVE_INFINITY;
  for (const row of confirmedBreaks) {
    const start = row.range.line;
    const end = row.range.endLine ?? start;
    if (start < 0 || end >= lines.length || end <= start || end >= previouslyMergedStart) {
      skipped.push(row.id);
      continue;
    }
    const merged = mergeMarkdownLines(lines.slice(start, end + 1), row.replacement);
    if (!merged) {
      skipped.push(row.id);
      continue;
    }
    lines.splice(start, end - start + 1, merged);
    previouslyMergedStart = start;
    applied += 1;
  }

  return { text: lines.join("\n"), applied, skipped };
}

function applyConfirmedSpellingCorrections(lines: string[], rows: Candidate[]): { applied: number; skipped: string[] } {
  const policies = new Map<string, string>();
  rows
    .filter((row) => row.typeLabel === "拼写检查" && row.lineType === "已确认" && row.raw && row.replacement?.trim())
    .forEach((row) => policies.set(row.raw, normalizeSpellingReplacement(row.replacement ?? "")));
  const orderedPolicies = [...policies.entries()]
    .filter(([raw, replacement]) => raw !== replacement)
    .sort(([left], [right]) => right.length - left.length);
  let applied = 0;

  for (const [raw, replacement] of orderedPolicies) {
    if (!replacement) {
      continue;
    }
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegex(raw)}(?![\\p{L}\\p{N}_])`, "gu");
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      lines[lineIndex] = lines[lineIndex].replace(pattern, () => {
        applied += 1;
        return replacement;
      });
    }
  }
  return { applied, skipped: [] };
}

function closestTextIndex(line: string, value: string, expectedIndex: number): number {
  const positions: number[] = [];
  let index = line.indexOf(value);
  while (index >= 0) {
    positions.push(index);
    index = line.indexOf(value, index + value.length);
  }
  if (!positions.length) {
    return -1;
  }
  return positions.reduce((closest, candidate) =>
    Math.abs(candidate - expectedIndex) < Math.abs(closest - expectedIndex) ? candidate : closest,
  );
}

function normalizeHeadingLine(line: string, lineType: string | undefined): string | undefined {
  const levelByType: Record<string, number> = {
    "一级": 1,
    "二级": 2,
    "三级": 3,
    "四级": 4,
    "五级": 5,
    "六级": 6,
  };
  if (!lineType || !(lineType in levelByType) && lineType !== "非标题") {
    return undefined;
  }
  const indent = /^\s*/.exec(line)?.[0] ?? "";
  const content = line.replace(/^\s*#{1,6}\s+/, "").trim();
  if (!content) {
    return undefined;
  }
  return lineType === "非标题" ? `${indent}${content}` : `${indent}${"#".repeat(levelByType[lineType])} ${content}`;
}

function normalizeAnnotationLine(line: string, row: Candidate): string | undefined {
  const annotationNumber = annotationNumberForRow(row, line);
  if (!annotationNumber || !row.lineType) {
    return undefined;
  }
  if (row.lineType === "注释引用") {
    const supPattern = new RegExp(`<sup>\\s*\\(?\\s*${escapeRegex(annotationNumber)}\\s*\\)?\\s*</sup>`, "i");
    return supPattern.test(line) ? line.replace(supPattern, `[^${annotationNumber}]`) : undefined;
  }
  if (row.lineType === "注释正文") {
    const bodyPattern = new RegExp(`^(\\s*)(?:${escapeRegex(annotationNumber)}\\.|\\(${escapeRegex(annotationNumber)}\\)|\\[\\^${escapeRegex(annotationNumber)}\\]:)\\s+(.+)$`);
    const match = line.match(bodyPattern);
    return match ? `${match[1]}[^${annotationNumber}]: ${match[2]}` : undefined;
  }
  return undefined;
}

function isAnnotationLineType(lineType: string | undefined): lineType is "注释引用" | "注释正文" {
  return lineType === "注释引用" || lineType === "注释正文";
}

function deduplicateCandidatesById(rows: Candidate[]): Candidate[] {
  const unique = new Map<string, Candidate>();
  for (const row of rows) {
    // Working-copy synchronization can preserve an old location while reusing
    // its stable candidate ID at the new location. The later row is the latest
    // snapshot and must be the only row participating in Pair construction.
    unique.set(row.id, row);
  }
  return [...unique.values()].sort(compareCandidatesByPosition);
}

function removeRedundantWorkingAnnotationRefs(rows: Candidate[]): Candidate[] {
  const identityFor = (row: Candidate): string => [
    row.sourcePath ?? "",
    annotationNumberForRow(row) ?? "",
    row.sourceLine ?? row.range.line,
    row.range.start,
  ].join("\u0000");
  const originalRefIdentities = new Set(
    rows
      .filter((row) => row.typeLabel === "注释" && row.lineType === "注释引用" && !row.isWorkingCorrection)
      .map(identityFor),
  );

  return rows.filter((row) => !(
    row.typeLabel === "注释"
    && row.lineType === "注释引用"
    && row.isWorkingCorrection
    && originalRefIdentities.has(identityFor(row))
  ));
}

function removeSupersededOriginalAnnotationBodies(rows: Candidate[]): Candidate[] {
  const sourceLineFor = (row: Candidate) => row.sourceLine ?? row.range.line;
  const sourcePathFor = (row: Candidate) => row.sourcePath ?? "";
  const originals = rows.filter((row) =>
    row.typeLabel === "注释" && row.lineType === "注释正文" && !row.isWorkingCorrection
  );
  const supersededIds = new Set<string>();

  for (const workingBody of rows.filter((row) =>
    row.typeLabel === "注释" && row.lineType === "注释正文" && row.isWorkingCorrection
  )) {
    const number = annotationNumberForRow(workingBody);
    if (!number) continue;
    const nearest = originals
      .filter((original) =>
        !supersededIds.has(original.id) &&
        sourcePathFor(original) === sourcePathFor(workingBody) &&
        annotationNumberForRow(original) === number
      )
      .map((original) => ({
        original,
        distance: Math.abs(sourceLineFor(original) - sourceLineFor(workingBody)),
      }))
      .sort((left, right) => left.distance - right.distance)[0];
    if (nearest && nearest.distance <= 4) {
      supersededIds.add(nearest.original.id);
    }
  }

  return rows.filter((row) => !supersededIds.has(row.id));
}

function removeInvalidWorkingAnnotationBodies(rows: Candidate[]): Candidate[] {
  return rows.filter((row) => {
    if (row.typeLabel !== "注释" || row.lineType !== "注释正文" || !row.isWorkingCorrection) {
      return true;
    }
    const numberedLine = /^\s*(\d+)\.\s+/.exec(row.raw);
    if (!numberedLine) {
      return true;
    }
    const inlineRef = /\[\^(\d+)\](?!:)|<sup>\s*\(?\s*(\d+)\s*\)?\s*<\/sup>/i.exec(row.raw);
    const inlineNumber = inlineRef?.[1] ?? inlineRef?.[2];
    return !inlineNumber || inlineNumber === numberedLine[1];
  });
}

function withDefaultLineType(row: Candidate): Candidate {
  return row.typeLabel === "注释" && !row.lineType ? { ...row, lineType: "注释引用" } : row;
}

function resolveAnnotationLineIndex(lines: string[], row: Candidate): number {
  const expectedNumber = annotationNumberForRow(row);
  const expectedPattern = row.lineType === "注释引用"
    ? expectedNumber ? new RegExp(`<sup>\\s*\\(?\\s*${escapeRegex(expectedNumber)}\\s*\\)?\\s*</sup>`, "i") : /<sup>\s*\(?\s*\d+\s*\)?\s*<\/sup>/i
    : expectedNumber
      ? new RegExp(`^\\s*(?:${escapeRegex(expectedNumber)}\\.|\\(${escapeRegex(expectedNumber)}\\)|\\[\\^${escapeRegex(expectedNumber)}\\]:)\\s+`)
      : /^\s*(?:\d+\.|\(\d+\)|\[\^\d+\]:)\s+/;

  if (row.range.line >= 0 && row.range.line < lines.length && expectedPattern.test(lines[row.range.line])) {
    return row.range.line;
  }

  const matches = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => expectedPattern.test(line))
    .map(({ index }) => index);
  if (!matches.length) {
    return -1;
  }
  return matches.reduce((closest, index) =>
    Math.abs(index - row.range.line) < Math.abs(closest - row.range.line) ? index : closest,
  );
}

function annotationNumberForRow(row: Candidate, line?: string): string | undefined {
  if (row.annotationNumber) return row.annotationNumber;
  const fromRaw = annotationNumberFromText(row.raw, row.lineType);
  if (fromRaw) return fromRaw;
  if (/^\d+$/.test(row.label)) {
    return row.label;
  }
  return line ? annotationNumberFromText(line, row.lineType) : undefined;
}

function annotationNumberFromText(text: string, lineType?: string): string | undefined {
  const bodyMatch = /^\s*(?:\[\^(\d+)\]:|(\d+)\.|\((\d+)\))(?:\s|$)/.exec(text);
  if (lineType === "注释正文" && bodyMatch) {
    return bodyMatch[1] ?? bodyMatch[2] ?? bodyMatch[3];
  }
  const refMatch = /<sup>\s*\(?\s*(\d+)\s*\)?\s*<\/sup>|\[\^(\d+)\](?!:)/i.exec(text);
  if (refMatch) {
    return refMatch[1] ?? refMatch[2];
  }
  return bodyMatch?.[1] ?? bodyMatch?.[2] ?? bodyMatch?.[3];
}

function mapWorkingLinesToSourceLines(sourceText: string, workingText: string): number[] {
  const sourceLines = sourceText.split(/\r?\n/);
  const workingLines = workingText.split(/\r?\n/);
  const sourcePositions = new Map<string, number[]>();
  const workingCounts = new Map<string, number>();
  sourceLines.forEach((line, index) => {
    const key = normalizeAlignmentLine(line);
    if (!key) return;
    const positions = sourcePositions.get(key) ?? [];
    positions.push(index);
    sourcePositions.set(key, positions);
  });
  workingLines.forEach((line) => {
    const key = normalizeAlignmentLine(line);
    if (key) workingCounts.set(key, (workingCounts.get(key) ?? 0) + 1);
  });

  const anchors: Array<{ working: number; source: number }> = [{ working: -1, source: -1 }];
  let lastSource = -1;
  workingLines.forEach((line, working) => {
    const key = normalizeAlignmentLine(line);
    const positions = sourcePositions.get(key);
    if (!key || positions?.length !== 1 || workingCounts.get(key) !== 1 || positions[0] <= lastSource) return;
    anchors.push({ working, source: positions[0] });
    lastSource = positions[0];
  });
  anchors.push({ working: workingLines.length, source: sourceLines.length });

  const result = new Array<number>(workingLines.length);
  for (let anchorIndex = 0; anchorIndex < anchors.length - 1; anchorIndex += 1) {
    const previous = anchors[anchorIndex];
    const next = anchors[anchorIndex + 1];
    for (let working = previous.working + 1; working < next.working; working += 1) {
      const projected = previous.source + (working - previous.working);
      result[working] = Math.max(0, Math.min(next.source, projected));
    }
    if (next.working < workingLines.length) {
      result[next.working] = next.source;
    }
  }
  return result;
}

function normalizeAlignmentLine(line: string): string {
  return line
    .replace(/<sup>\s*\(?\s*\d+\s*\)?\s*<\/sup>|\[\^\d+\](?!:)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function findWorkingLineForSourceLine(sourceText: string, workingText: string, sourceLine: number): number {
  const sourceLines = sourceText.split(/\r?\n/);
  const workingLines = workingText.split(/\r?\n/);
  if (!workingLines.length) return 0;

  const clampedSourceLine = Math.max(0, Math.min(sourceLine, Math.max(0, sourceLines.length - 1)));
  const sourceKey = normalizeAlignmentLine(sourceLines[clampedSourceLine] ?? "");
  const mapping = mapWorkingLinesToSourceLines(sourceText, workingText);
  const exactMappedLines: number[] = [];
  mapping.forEach((mappedSourceLine, workingLine) => {
    if (mappedSourceLine === clampedSourceLine) exactMappedLines.push(workingLine);
  });

  const contentMatch = exactMappedLines.find((workingLine) =>
    sourceKey.length > 0 && normalizeAlignmentLine(workingLines[workingLine] ?? "") === sourceKey
  );
  if (contentMatch !== undefined) return contentMatch;
  if (exactMappedLines.length) {
    return exactMappedLines.reduce((best, current) =>
      Math.abs(current - clampedSourceLine) < Math.abs(best - clampedSourceLine) ? current : best
    );
  }

  let bestWorkingLine = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  mapping.forEach((mappedSourceLine, workingLine) => {
    const distance = Math.abs(mappedSourceLine - clampedSourceLine);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestWorkingLine = workingLine;
    }
  });
  return bestWorkingLine;
}

function extractAnnotationRefs(text: string): Array<{ number: string; text: string; preview: string; line: number; start: number; end: number }> {
  return text.split(/\r?\n/).flatMap((line, lineIndex) => {
    const refs: Array<{ number: string; text: string; preview: string; line: number; start: number; end: number }> = [];
    const pattern = /<sup>\s*\(?\s*(\d+)\s*\)?\s*<\/sup>|\[\^(\d+)\](?!:)/gi;
    for (const match of line.matchAll(pattern)) {
      const number = match[1] ?? match[2];
      if (!number || match.index === undefined) continue;
      refs.push({
        number,
        text: match[0],
        preview: line,
        line: lineIndex,
        start: match.index,
        end: match.index + match[0].length,
      });
    }
    return refs;
  });
}

function extractAnnotationBodies(text: string): Array<{ number: string; content: string; text: string; line: number }> {
  return text.split(/\r?\n/).flatMap((line, lineIndex) => {
    // Working copies often use block quotes or full-width Chinese parentheses
    // for manually added notes; accept those variants without treating normal
    // inline parenthetical prose as an annotation body.
    const match = /^\s*(?:>\s*)?(?:\[\^(\d+)\]:|(\d+)\.|[\(（](\d+)[\)）])\s+(.+)$/.exec(line);
    const number = match?.[1] ?? match?.[2] ?? match?.[3];
    return number ? [{ number, content: match?.[4] ?? "", text: line, line: lineIndex }] : [];
  });
}

function annotationBodyKey(body: { number: string; content: string }): string {
  return `${body.number}\u0000${body.content.replace(/\s+/g, " ").trim()}`;
}

function replaceExactText(line: string, source: string, replacement: string): string | undefined {
  const index = line.indexOf(source);
  return index >= 0 ? `${line.slice(0, index)}${replacement}${line.slice(index + source.length)}` : undefined;
}

function normalizeSingleLineCorrection(value: string): string {
  return value
    .replace(/[\r\n\u2028\u2029]+/g, " ")
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function mergeMarkdownLines(sourceLines: string[], connector = ""): string | undefined {
  const nonEmpty = sourceLines.map((line) => line.trim()).filter(Boolean);
  if (nonEmpty.length < 2) {
    return undefined;
  }
  if (connector) {
    return nonEmpty.join(connector);
  }
  return nonEmpty.slice(1).reduce((merged, next) => {
    if (merged.endsWith("-")) {
      return `${merged.slice(0, -1)}${next}`;
    }
    return `${merged} ${next}`;
  }, nonEmpty[0]);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderSidebarHtml(state: SidebarState): string {
  return renderPairHtml({
    file: state.selectedFile ?? { label: "未选择文件", path: "" },
    searchTableActive: true,
    postOcrCleanMode: state.postOcrCleanMode,
    searchRows: state.postOcrCleanMode ? [...state.searchTableRows, ...state.sentenceRows] : state.searchTableRows,
    imageDownloadProgress: state.imageDownloadProgress,
    deeplConfigured: state.deeplConfigured,
    translationTestResult: state.translationTestResult,
    translationProgress: state.translationProgress,
    failedTranslationBlockIndexes: state.failedTranslationBlockIndexes,
    regexScopeDirectory: state.regexScopeDirectory,
    regexIncludeSubdirectories: state.regexIncludeSubdirectories,
    moduleRegexPatterns: state.moduleRegexPatterns,
    moduleRegexPresets: state.moduleRegexPresets,
    pairs: state.pairs,
    annotationPairs: state.annotationPairs,
    selectedCandidate: state.selectedCandidate,
    selectedPairId: state.selectedPairId,
  });

  /* Legacy compact sidebar markup retained below temporarily for reference. */
  const stateJson = escapeScriptJson(state);
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${baseCss()}</style>
</head>
<body>
  <div id="app"></div>
  <script>
    const vscode = acquireVsCodeApi();
    let state = ${stateJson};
    const app = document.getElementById("app");
    let regexTimer;
    const sidebarViewState = vscode.getState?.() || {};
    const TABLE_MODULES = ["未分类", "注释", "标题", "图片", "非法断行", "拼写检查"];
    let activeTableModule = TABLE_MODULES.includes(sidebarViewState.activeTableModule) ? sidebarViewState.activeTableModule : "未分类";

    function post(command, payload = {}) {
      vscode.postMessage({ command, ...payload });
    }

    function applyPattern(pattern) {
      const input = document.getElementById("regex-search-input");
      if (!input) {
        return;
      }
      input.value = pattern;
      input.focus();
      clearTimeout(regexTimer);
      post("regexChanged", { pattern });
    }

    window.addEventListener("message", (event) => {
      if (event.data?.command !== "searchResultsUpdated") {
        return;
      }
      state = event.data.state;
      updateSidebarModuleTable();
    });

    function render() {
      const hasWorkspace = state.workspaceLabel !== "未选择";
      const selectedFile = state.selectedFile;
      app.innerHTML = "";
      app.append(
        section("工作区", [
          pill(state.workspaceLabel),
          checkboxRow("预览文档可编辑", state.previewEditable, (checked) => post("setPreviewEditable", { previewEditable: checked })),
          hasWorkspace ? button("启用 Markdown 预览标题颜色", () => post("installMarkdownPreviewStyles")) : null,
          button("刷新", () => post("refreshFiles")),
          button(hasWorkspace ? "打开其他工作目录" : "选择工作文件夹", () => post("pickFolder"), "primary"),
          !hasWorkspace ? text("请先选择包含 OCR Markdown 文件的目录") : null,
        ]),
      );

      if (!hasWorkspace) return;

      if (!selectedFile) {
        app.append(section("搜索", [
          text("未选择当前文件；选择目录中的 Markdown 文件后即可标定。"),
        ]));
      }

      app.append(sidebarModuleWorkspace());
    }

    function updateSidebarModuleTable() {
      const slot = document.getElementById("sidebar-module-table");
      if (!slot) {
        return;
      }
      slot.innerHTML = "";
      slot.append(sidebarModuleRows());
    }

    function sidebarModuleWorkspace() {
      const sectionElement = document.createElement("section");
      sectionElement.className = "sidebar-module-workspace";
      const tabs = document.createElement("div");
      tabs.className = "sidebar-module-tabs";
      TABLE_MODULES.forEach((moduleName) => {
        const tab = document.createElement("button");
        tab.type = "button";
        tab.className = moduleName === activeTableModule ? "sidebar-module-tab active" : "sidebar-module-tab";
        const count = state.searchTableRows.filter((row) => (row.typeLabel || "未分类") === moduleName).length;
        tab.textContent = moduleName + " (" + count + ")";
        tab.addEventListener("click", () => {
          activeTableModule = moduleName;
          vscode.setState?.({ activeTableModule });
          render();
          scanSidebarModule();
        });
        tabs.append(tab);
      });
      sectionElement.append(tabs, sidebarModuleRegexPanel());
      const slot = document.createElement("div");
      slot.id = "sidebar-module-table";
      slot.append(sidebarModuleRows());
      sectionElement.append(slot);
      return sectionElement;
    }

    function scanSidebarModule() {
      if (activeTableModule === "拼写检查") {
        return;
      }
      const pattern = state.moduleRegexPatterns?.[activeTableModule] || "";
      if (!pattern.trim()) {
        return;
      }
      post("scanModuleRegex", {
        moduleName: activeTableModule,
        pattern,
        regexScopeDirectory: state.regexScopeDirectory,
        regexIncludeSubdirectories: state.regexIncludeSubdirectories,
      });
    }

    function sidebarModuleRegexPanel() {
      const element = document.createElement("div");
      element.className = "sidebar-module-regex";
      if (activeTableModule === "拼写检查") {
        element.textContent = "拼写检查使用 CSpell 扫描，请在右侧数据表执行“扫描拼写”。";
        return element;
      }
      const scope = document.createElement("input");
      scope.value = state.regexScopeDirectory;
      scope.placeholder = "作用目录";
      const pattern = document.createElement("input");
      pattern.value = state.moduleRegexPatterns?.[activeTableModule] || "";
      pattern.placeholder = "输入正则表达式";
      pattern.spellcheck = false;
      const include = document.createElement("input");
      include.type = "checkbox";
      include.checked = state.regexIncludeSubdirectories;
      const includeLabel = document.createElement("label");
      includeLabel.className = "checkbox-row";
      includeLabel.append(include, document.createTextNode("包括子目录"));
      let timer;
      const scan = () => post("scanModuleRegex", {
        moduleName: activeTableModule,
        pattern: pattern.value,
        regexScopeDirectory: scope.value,
        regexIncludeSubdirectories: include.checked,
      });
      const defer = () => { clearTimeout(timer); timer = setTimeout(scan, 300); };
      scope.addEventListener("input", defer);
      pattern.addEventListener("input", defer);
      include.addEventListener("change", scan);
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = activeTableModule + "正则演示和语法";
      const presets = document.createElement("div");
      presets.className = "sidebar-preset-list";
      (state.moduleRegexPresets?.[activeTableModule] || []).forEach((preset) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = preset.label + " · " + preset.pattern;
        button.addEventListener("click", () => {
          pattern.value = preset.pattern;
          details.open = false;
          scan();
        });
        presets.append(button);
      });
      details.append(summary, presets);
      element.append(scope, pattern, includeLabel, details);
      return element;
    }

    function sidebarModuleRows() {
      const rows = state.searchTableRows
        .filter((row) => (row.typeLabel || "未分类") === activeTableModule)
        .slice()
        .sort((left, right) => String(left.sourceLabel || "").localeCompare(String(right.sourceLabel || "")) || left.range.line - right.range.line);
      const table = document.createElement("div");
      table.className = "sidebar-data-table";
      table.innerHTML = "<div class='sidebar-data-head'><span>#</span><span>源文件</span><span>匹配</span><span>行号</span></div>";
      if (!rows.length) {
        table.append(emptyLine("暂无匹配。输入正则或从演示中选择规则。"));
        return table;
      }
      rows.forEach((candidate, index) => {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "sidebar-data-row";
        row.title = candidate.preview || candidate.raw;
        row.innerHTML = "<span>" + (index + 1) + "</span><span>" + escapeHtml(candidate.sourceLabel || "当前文件") + "</span><code>" + escapeHtml(candidate.raw) + "</code><span>L" + (candidate.range.line + 1) + "</span>";
        row.addEventListener("click", () => post("showCandidate", { id: candidate.id }));
        table.append(row);
      });
      return table;
    }

    function searchPanel() {
      const element = document.createElement("section");
      element.className = "search-panel";

      const scopeInput = document.createElement("input");
      scopeInput.className = "scope-input";
      scopeInput.value = state.regexScopeDirectory;
      scopeInput.placeholder = "作用目录（默认当前工作目录）";
      scopeInput.title = "仅扫描该目录中的 Markdown 文件";

      let scopeTimer;
      const postScope = () => post("regexScopeChanged", {
        regexScopeDirectory: scopeInput.value,
        regexIncludeSubdirectories: includeSubdirectories.checked,
      });
      scopeInput.addEventListener("input", () => {
        clearTimeout(scopeTimer);
        scopeTimer = setTimeout(postScope, 350);
      });
      scopeInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          clearTimeout(scopeTimer);
          postScope();
        }
      });

      const includeSubdirectories = document.createElement("input");
      includeSubdirectories.type = "checkbox";
      includeSubdirectories.checked = state.regexIncludeSubdirectories;
      includeSubdirectories.addEventListener("change", postScope);
      const scopeCheckbox = document.createElement("label");
      scopeCheckbox.className = "checkbox-row scope-checkbox";
      scopeCheckbox.append(includeSubdirectories, document.createTextNode("包括子目录"));

      const inputRow = document.createElement("div");
      inputRow.className = "search-input-row";

      const input = document.createElement("input");
      input.id = "regex-search-input";
      input.className = "search-input";
      input.value = state.searchPattern;
      input.placeholder = "输入任意正则，例如 <sup>(\\d+)</sup> 或 Buffett";
      input.spellcheck = false;
      input.addEventListener("input", () => {
        clearTimeout(regexTimer);
        regexTimer = setTimeout(() => post("regexChanged", { pattern: input.value }), 250);
      });
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          clearTimeout(regexTimer);
          post("regexChanged", { pattern: input.value });
        }
      });

      const regexToggle = document.createElement("button");
      regexToggle.className = "icon-toggle active";
      regexToggle.type = "button";
      regexToggle.title = "使用正则表达式";
      regexToggle.textContent = ".*";

      inputRow.append(input, regexToggle);

      const meta = document.createElement("div");
      meta.id = "search-meta";
      meta.className = "search-meta";
      meta.textContent = "匹配 " + state.searchMatches.length + " 处。正则只做通用候选搜索，不影响下方注释 Pair。";

      element.append(scopeInput, scopeCheckbox, inputRow, presetDropdown(), meta);
      return element;
    }

    function presetDropdown() {
      const details = document.createElement("details");
      details.className = "preset-dropdown";
      const summary = document.createElement("summary");
      summary.textContent = "常用正则演示和语法";
      details.append(summary);

      const list = document.createElement("div");
      list.className = "preset-list";
      state.regexPresets.forEach((preset) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "preset-item";
        item.addEventListener("click", () => {
          applyPattern(preset.pattern);
          details.open = false;
        });
        item.innerHTML = ""
          + "<span class='preset-label'>" + escapeHtml(preset.label) + "</span>"
          + "<code>" + escapeHtml(preset.pattern) + "</code>"
          + "<span class='preset-description'>" + escapeHtml(preset.description) + "</span>";
        list.append(item);
      });
      details.append(list);
      return details;
    }

    function resultSlot(id) {
      const element = document.createElement("div");
      element.id = id;
      return element;
    }

    function actionBar() {
      const element = document.createElement("section");
      element.className = "search-actions";
      element.append(
        miniButton("扫描非法断行", () => post("scanIllegalLineBreaks")),
        miniButton("结果加到数据表", () => post("addSearchResultsToTable"), "primary"),
      );
      return element;
    }

    function resultGroup(title, candidates, kind) {
      const element = document.createElement("section");
      element.className = "result-group";
      const heading = document.createElement("div");
      heading.className = "result-heading";
      heading.textContent = title + " (" + candidates.length + ")";
      element.append(heading);
      if (!candidates.length) {
        element.append(emptyLine("暂无候选"));
        return element;
      }
      candidates.forEach((candidate) => element.append(candidateRow(candidate, kind)));
      return element;
    }

    function candidateRow(candidate, kind) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "search-result " + kind + " " + (candidate.status === "异常" ? "danger" : candidate.status === "已拒绝" ? "muted" : "");
      row.addEventListener("click", () => post("showCandidate", { id: candidate.id }));
      row.innerHTML = ""
        + "<span class='line-no'>L" + (candidate.range.line + 1) + "</span>"
        + "<span class='result-body'><span class='result-raw'>" + escapeHtml(candidate.raw) + "</span>"
        + "<span class='result-preview'>" + escapeHtml(candidate.preview || "") + "</span>"
        + (candidate.sourceLabel ? "<span class='source-file'>" + escapeHtml(candidate.sourceLabel) + "</span>" : "")
        + (candidate.reason ? "<span class='reason'>" + escapeHtml(candidate.reason) + "</span>" : "")
        + "</span>";
      return row;
    }

    function suspiciousGroup(candidates) {
      const element = document.createElement("section");
      element.className = "result-group";
      const heading = document.createElement("div");
      heading.className = "result-heading";
      heading.textContent = "Suspicious Sup (" + candidates.length + ")";
      element.append(heading);
      if (!candidates.length) {
        element.append(emptyLine("暂无疑似误判"));
        return element;
      }
      candidates.forEach((candidate) => {
        const wrapper = document.createElement("div");
        wrapper.className = "suspicious-row";
        wrapper.append(candidateRow(candidate, "suspicious"));
        const reason = document.createElement("div");
        reason.className = "reason";
        reason.textContent = candidate.reason || "疑似误判";
        wrapper.append(reason, inlineActions([
          miniButton("拒绝候选", () => post("rejectCandidate", { id: candidate.id })),
          miniButton("标记异常", () => post("flagCandidate", { id: candidate.id }), "danger"),
        ]));
        element.append(wrapper);
      });
      return element;
    }

    function pairSummary() {
      const element = document.createElement("section");
      element.className = "result-group";
      const heading = document.createElement("div");
      heading.className = "result-heading";
      heading.textContent = "Pair 概览 (" + state.pairs.length + ")";
      element.append(heading);
      if (!state.pairs.length) {
        element.append(emptyLine("暂无 Pair"));
        return element;
      }
      state.pairs.forEach((pair) => {
        const row = document.createElement("div");
        row.className = "pair-chip";
        row.textContent = "#" + pair.label + " / " + pair.status;
        element.append(row);
      });
      return element;
    }

    function section(title, children) {
      const element = document.createElement("section");
      const heading = document.createElement("h2");
      heading.textContent = title;
      element.append(heading, ...children.filter(Boolean));
      return element;
    }

    function button(label, onClick, variant = "") {
      const element = document.createElement("button");
      element.className = variant;
      element.type = "button";
      element.textContent = label;
      element.addEventListener("click", onClick);
      return element;
    }

    function miniButton(label, onClick, variant = "") {
      const element = button(label, onClick, variant);
      element.className = "mini " + variant;
      return element;
    }

    function text(value) {
      const element = document.createElement("p");
      element.textContent = value;
      return element;
    }

    function pill(value) {
      const element = document.createElement("div");
      element.className = "pill";
      element.textContent = value;
      return element;
    }

    function checkboxRow(label, checked, onChange) {
      const wrapper = document.createElement("label");
      wrapper.className = "checkbox-row";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = checked;
      input.addEventListener("change", () => onChange(input.checked));
      const textNode = document.createElement("span");
      textNode.textContent = label;
      wrapper.append(input, textNode);
      return wrapper;
    }

    function inlineActions(children) {
      const element = document.createElement("div");
      element.className = "inline-actions";
      element.append(...children);
      return element;
    }

    function emptyLine(value) {
      const element = document.createElement("div");
      element.className = "empty-line";
      element.textContent = value;
      return element;
    }

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    render();
  </script>
</body>
</html>`;
}

function renderPairHtml(input: {
  file: FileEntry;
  searchTableActive: boolean;
  postOcrCleanMode: boolean;
  searchRows: Candidate[];
  imageDownloadProgress?: ImageDownloadProgress;
  deeplConfigured: boolean;
  translationTestResult?: TranslationTestResult;
  translationProgress?: TranslationProgress;
  failedTranslationBlockIndexes: number[];
  regexScopeDirectory: string;
  regexIncludeSubdirectories: boolean;
  moduleRegexPatterns: Record<string, string>;
  moduleRegexPresets: Record<string, RegexPreset[]>;
  pairs: FootnotePair[];
  annotationPairs: AnnotationPair[];
  selectedCandidate?: Candidate;
  selectedPairId?: string;
}): string {
  const stateJson = escapeScriptJson(input);
  const initialBody = input.searchTableActive
    ? renderInitialSearchTable(input.file, input.searchRows)
    : `<h1>注释配对表格</h1><p>${escapeHtmlText(input.file.label)}</p><p>请先在左侧搜索，并点击“结果加到数据表”。</p>`;
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${baseCss()}
    body { padding: 16px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border-bottom: 1px solid var(--vscode-panel-border); padding: 6px 8px; text-align: left; vertical-align: top; }
    tr { cursor: pointer; }
    tr:hover, tr.selected { background: var(--vscode-list-hoverBackground); }
    .card { border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 12px; margin-top: 16px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .compact-grid {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      min-width: 1160px;
    }
    .table-scroll {
      max-height: calc(100vh - 230px);
      overflow: auto;
      border-radius: 6px;
      scrollbar-gutter: stable;
    }
    .text-block-table { min-width: 840px; table-layout: fixed; }
    .text-block-table th {
      position: sticky;
      top: 0;
      z-index: 5;
      background: var(--vscode-sideBarSectionHeader-background);
      color: var(--vscode-descriptionForeground);
    }
    .text-block-table th:nth-child(1) { width: 56px; }
    .text-block-table th:nth-child(2) { width: 130px; }
    .text-block-table th:nth-child(4), .text-block-table th:nth-child(5) { width: 84px; }
    .sentence-table { min-width: 1760px; width: 1760px; }
    .sentence-table th:nth-child(1), .sentence-table td:nth-child(1) { width: 76px; }
    .sentence-table th:nth-child(2), .sentence-table td:nth-child(2) { width: 76px; }
    .sentence-table th:nth-child(3), .sentence-table td:nth-child(3) { width: 340px; }
    .sentence-table th:nth-child(4), .sentence-table td:nth-child(4) { width: 390px; }
    .sentence-table th:nth-child(5), .sentence-table td:nth-child(5) { width: 390px; }
    .sentence-table th:nth-child(6), .sentence-table td:nth-child(6),
    .sentence-table th:nth-child(7), .sentence-table td:nth-child(7) { width: 84px; }
    .sentence-translation-input {
      width: 100%; min-width: 0; min-height: 52px; box-sizing: border-box; resize: vertical;
      color: var(--vscode-input-foreground); background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border); padding: 4px 6px; font: inherit;
    }
    .translation-settings { display: grid; gap: 12px; max-width: 920px; }
    .translation-settings label { display: grid; gap: 6px; font-weight: 600; }
    .translation-settings input, .translation-settings textarea, .translation-settings select {
      width: 100%; box-sizing: border-box; color: var(--vscode-input-foreground);
      background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border);
      padding: 7px 8px; font: inherit;
    }
    .translation-settings textarea { min-height: 100px; resize: vertical; }
    .translation-test-result { white-space: pre-wrap; overflow-wrap: anywhere; }
    .translation-test-result.success { border-color: rgba(80, 180, 100, 0.8); }
    .translation-test-result.error { border-color: rgba(240, 80, 80, 0.8); }
    .text-block-content { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.55; }
    .text-block-type-select {
      width: 100%;
      min-width: 0;
      color: var(--vscode-dropdown-foreground);
      background: var(--vscode-dropdown-background);
      border: 1px solid var(--vscode-dropdown-border, var(--vscode-input-border));
    }
    .text-block-type-select option { color: var(--vscode-dropdown-foreground); background: var(--vscode-dropdown-background); }
    .compact-row {
      display: grid;
      grid-template-columns: 34px 48px minmax(140px, 0.8fr) minmax(90px, 0.7fr) minmax(220px, 2fr) 80px 150px 76px;
      align-items: center;
      gap: 8px;
      min-height: 34px;
      padding: 4px 8px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    .compact-grid.annotation-grid { min-width: 1580px; }
    .compact-row.annotation-row {
      grid-template-columns: 34px 48px 110px 86px 80px minmax(160px, 0.9fr) minmax(280px, 2fr) 150px minmax(190px, 1fr) minmax(140px, 0.8fr);
    }
    .compact-grid.title-grid { min-width: 940px; }
    .compact-row.title-row {
      grid-template-columns: 34px minmax(150px, 0.9fr) 80px minmax(180px, 1.5fr) 130px minmax(180px, 1fr);
    }
    .compact-grid.image-grid { min-width: 1560px; }
    .compact-row.image-row {
      grid-template-columns: 34px 48px minmax(140px, 0.8fr) minmax(130px, 0.8fr) minmax(240px, 1.4fr) 80px 130px minmax(300px, 1.4fr) 76px;
    }
    .compact-grid.illegal-break-grid { min-width: 1500px; }
    .compact-row.illegal-break-row {
      grid-template-columns: 34px 48px minmax(150px, 0.8fr) minmax(110px, 0.6fr) minmax(320px, 2fr) 80px 150px minmax(120px, 0.7fr) 76px;
    }
    .compact-grid.spell-grid { min-width: 1420px; }
    .compact-row.spell-row {
      grid-template-columns: 34px 48px minmax(140px, 0.8fr) 130px minmax(110px, 0.6fr) minmax(160px, 1fr) minmax(260px, 1.7fr) 80px 76px;
    }
    .spell-replacement-input, .line-break-connector-input {
      width: 100%;
      min-width: 0;
      box-sizing: border-box;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
      padding: 3px 5px;
    }
    .compact-row:last-child { border-bottom: 0; }
    .source-file-cell {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--vscode-descriptionForeground);
    }
    .compact-row:not(.compact-head) { cursor: pointer; }
    .compact-row:not(.compact-head):hover { background: var(--vscode-list-hoverBackground); }
    .compact-row.selected { background: var(--vscode-list-activeSelectionBackground); }
    .compact-row.annotation-unmatched {
      background: rgba(244, 67, 54, 0.18);
      outline: 1px solid rgba(244, 67, 54, 0.55);
      outline-offset: -1px;
    }
    .compact-row.annotation-unmatched:hover { background: rgba(244, 67, 54, 0.26); }
    .compact-row.annotation-matched {
      box-shadow: inset 3px 0 0 rgba(46, 204, 113, 0.85);
    }
    .compact-row.working-correction {
      background: rgba(66, 165, 245, 0.16);
      box-shadow: inset 4px 0 0 rgba(66, 165, 245, 0.95);
      outline: 1px solid rgba(66, 165, 245, 0.55);
      outline-offset: -1px;
    }
    .compact-row.working-correction:hover { background: rgba(66, 165, 245, 0.25); }
    .annotation-pair-status {
      display: block;
      margin-top: 3px;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      white-space: nowrap;
    }
    .compact-row.title-mismatch {
      background: rgba(255, 159, 67, 0.18);
      outline: 1px solid rgba(255, 159, 67, 0.6);
      outline-offset: -1px;
    }
    .compact-row.title-mismatch:hover { background: rgba(255, 159, 67, 0.26); }
    .compact-row.illegal-break-merge {
      background: rgba(255, 159, 67, 0.16);
      box-shadow: inset 3px 0 0 rgba(255, 159, 67, 0.9);
    }
    .compact-row.illegal-break-merge:hover { background: rgba(255, 159, 67, 0.24); }
    .compact-row.illegal-break-reviewed {
      background: rgba(70, 190, 125, 0.14);
      box-shadow: inset 3px 0 0 rgba(70, 190, 125, 0.9);
    }
    .compact-row.illegal-break-reviewed:hover { background: rgba(70, 190, 125, 0.22); }
    .compact-row.spell-pending-modified {
      background: rgba(72, 184, 255, 0.14);
      box-shadow: inset 3px 0 0 rgba(72, 184, 255, 0.9);
    }
    .compact-row.spell-pending-modified:hover { background: rgba(72, 184, 255, 0.22); }
    .compact-row.spell-resolved {
      background: rgba(70, 190, 125, 0.14);
      box-shadow: inset 3px 0 0 rgba(70, 190, 125, 0.9);
    }
    .compact-row.spell-resolved:hover { background: rgba(70, 190, 125, 0.22); }
    .match-summary {
      display: inline-block;
      margin-left: 8px;
      color: var(--vscode-descriptionForeground);
    }
    .compact-head {
      position: sticky;
      top: 0;
      z-index: 5;
      color: var(--vscode-descriptionForeground);
      background: var(--vscode-sideBarSectionHeader-background);
      font-weight: 600;
    }
    .sort-head {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      min-width: 0;
    }
    .sort-head input { margin: 0; }
    .sort-dir {
      min-width: 22px;
      padding: 1px 4px;
    }
    .compact-hit {
      width: fit-content;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      cursor: pointer;
    }
    .compact-preview {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--vscode-descriptionForeground);
      cursor: pointer;
    }
    .table-toolbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      margin: 10px 0;
    }
    .download-progress {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: min(100%, 310px);
      max-width: 420px;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }
    .download-progress progress {
      width: 112px;
      height: 12px;
      accent-color: var(--vscode-progressBar-background);
    }
    .download-progress.error { color: var(--vscode-errorForeground); }
    .translation-progress { margin: 8px 0; color: var(--vscode-descriptionForeground); font-size: 12px; }
    .translation-progress progress { width: 180px; height: 12px; accent-color: var(--vscode-progressBar-background); vertical-align: middle; }
    .translation-progress.error { color: var(--vscode-errorForeground); }
    .sticky-controls {
      position: sticky;
      top: 0;
      z-index: 20;
      padding: 1px 0 8px;
      background: var(--vscode-editor-background);
      border-bottom: 1px solid var(--vscode-panel-border);
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.14);
    }
    .module-tabs {
      display: flex;
      flex-direction: row;
      flex-wrap: wrap;
      align-items: flex-end;
      gap: 6px;
      margin: 12px 0 8px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    .module-tab {
      display: inline-flex;
      width: auto;
      white-space: nowrap;
      border: 1px solid transparent;
      border-bottom: 0;
      border-radius: 4px 4px 0 0;
      padding: 5px 10px;
      color: var(--vscode-foreground);
      background: transparent;
      cursor: pointer;
      text-align: center;
    }
    .module-tab.active {
      border-color: var(--vscode-panel-border);
      background: var(--vscode-editor-background);
      font-weight: 600;
    }
    .module-work {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      padding: 10px 12px;
      margin: 10px 0;
      color: var(--vscode-descriptionForeground);
    }
    .module-regex-panel {
      display: grid;
      grid-template-columns: minmax(180px, 0.8fr) minmax(260px, 1.2fr) auto auto;
      gap: 6px;
      align-items: center;
      margin: 8px 0;
    }
    .module-regex-panel input, .module-regex-panel textarea { min-width: 0; }
    .module-regex-panel textarea {
      min-height: 54px;
      resize: vertical;
      box-sizing: border-box;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
      padding: 5px 7px;
      font: inherit;
    }
    .module-regex-panel details { grid-column: 1 / -1; }
    .module-regex-panel .checkbox-row { width: auto; margin: 0; white-space: nowrap; }
    .module-regex-presets { display: grid; gap: 4px; padding: 6px 0 2px; }
    .module-regex-presets button { width: 100%; text-align: left; }
    .type-select {
      color: var(--vscode-dropdown-foreground);
      background: var(--vscode-dropdown-background);
      border: 1px solid var(--vscode-dropdown-border);
      border-radius: 2px;
      padding: 3px 6px;
      min-width: 128px;
    }
    .modal-backdrop {
      position: fixed;
      inset: 0;
      z-index: 100;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding-top: 72px;
      background: rgba(0, 0, 0, 0.45);
    }
    .modal {
      width: min(420px, calc(100vw - 32px));
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      padding: 14px;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
    }
    .modal h2 {
      margin-top: 0;
      font-size: 14px;
    }
    .modal input {
      width: 100%;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
      padding: 6px 8px;
      margin: 8px 0 12px;
    }
    .modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
  </style>
</head>
<body>
  <div id="app">${initialBody}</div>
  <script>
    window.addEventListener("error", (event) => {
      const app = document.getElementById("app");
      if (app) {
        app.insertAdjacentHTML("afterbegin", "<div class='card'><strong>数据表脚本错误：</strong> " + escapeHtml(event.message || "unknown") + "</div>");
      }
    });
    const vscode = acquireVsCodeApi();
    const state = ${stateJson};
    const app = document.getElementById("app");
    const postOcrCleanMode = state.postOcrCleanMode === true;
    const annotationPairsByCandidateId = new Map();
    const annotationPairSortOrder = new Map();
    (state.annotationPairs || []).forEach((pair) => {
      if (pair.refCandidateId) annotationPairsByCandidateId.set(pair.refCandidateId, pair);
      if (pair.bodyCandidateId) annotationPairsByCandidateId.set(pair.bodyCandidateId, pair);
    });
    (state.annotationPairs || []).forEach((pair, pairIndex) => {
      if (pair.refCandidateId) annotationPairSortOrder.set(pair.refCandidateId, pairIndex * 2);
      if (pair.bodyCandidateId) annotationPairSortOrder.set(pair.bodyCandidateId, pairIndex * 2 + 1);
    });
    const TEXT_BLOCK_TYPES = [
      "标题", "正文", "注释正文", "latex", "合成块",
      "合成.标记", "合成.图片", "合成.文本", "合成.callout", "合成.html",
      "latex.标记", "latex.代码",
    ];
    const MODULES = postOcrCleanMode ? ["文本块", "分句", "翻译设置"] : ["未分类", "注释", "标题", "图片", "非法断行", "拼写检查"];
    const TYPE_OPTIONS = [...MODULES, "ignore"];
    const MODULE_LINE_TYPES = {
      "注释": ["注释引用", "注释正文", "忽略"],
      "标题": ["一级", "二级", "三级", "四级", "五级", "六级", "非标题"],
      "图片": ["图片引用", "图片说明", "图片正文"],
      "非法断行": ["断行候选", "需要合并", "单行订正", "保留断行"],
      "拼写检查": ["待确认", "已确认", "忽略", "latex"],
    };
    const SORT_COLUMNS = [
      { key: "raw", label: "匹配" },
      { key: "preview", label: "预览" },
      { key: "line", label: "行号" },
      { key: "typeLabel", label: "模块" },
    ];
    const persistedViewState = vscode.getState?.() || {};
    const selectedRowIds = new Set(Array.isArray(persistedViewState.selectedRowIds) ? persistedViewState.selectedRowIds : []);
    const rowById = new Map();
    const checkboxById = new Map();
    const moduleRegexConfigs = persistedViewState.moduleRegexConfigs || {};
    const savedIllegalBreakRegex = moduleRegexConfigs["非法断行"];
    if (
      savedIllegalBreakRegex?.pattern?.includes("(?:about|and|or|the|a|an|of|to|in|for|with|by|from)") &&
      !savedIllegalBreakRegex.pattern.includes("[A-Za-z]{2,}")
    ) {
      // Migrate the original built-in rule cached by older webview versions.
      // User-authored illegal-break expressions are left untouched.
      savedIllegalBreakRegex.pattern = state.moduleRegexPatterns?.["非法断行"] || savedIllegalBreakRegex.pattern;
    }
    let activeModule = MODULES.includes(persistedViewState.activeModule)
      ? persistedViewState.activeModule
      : (postOcrCleanMode ? "文本块" : "未分类");
    const sortStatesByModule = persistedViewState.sortStatesByModule || {};
    const savedModuleSortState = sortStatesByModule[activeModule];
    const canMigrateLegacySort = !savedModuleSortState && !postOcrCleanMode;
    const sortRules = Array.isArray(savedModuleSortState?.rules)
      ? savedModuleSortState.rules.map((rule) => ({ ...rule }))
      : canMigrateLegacySort && Array.isArray(persistedViewState.sortRules)
        ? persistedViewState.sortRules.map((rule) => ({ ...rule }))
        : [];
    let sortRulesConfigured = savedModuleSortState
      ? savedModuleSortState.configured === true
      : canMigrateLegacySort && persistedViewState.sortRulesConfigured === true;
    let annotationMatchSortInitialized = persistedViewState.annotationMatchSortInitialized === true;
    let annotationOnlyUnmatched = persistedViewState.annotationOnlyUnmatched === true;
    if (!sortRules.length) {
      setDefaultSortRules(activeModule);
    } else if (!postOcrCleanMode && activeModule === "注释" && !annotationMatchSortInitialized) {
      sortRules.splice(0, sortRules.length, { key: "annotationMatched", direction: "asc" }, ...sortRules);
      annotationMatchSortInitialized = true;
    }
    let annotationAutoMatch = persistedViewState.annotationAutoMatch === true;
    let lastSelectedIndex = -1;
    let focusState = persistedViewState.focusState || null;
    let workingRowId = typeof persistedViewState.workingRowId === "string" ? persistedViewState.workingRowId : null;
    let tableScrollState = persistedViewState.tableScrollState || null;
    let imageDownloadProgress = state.imageDownloadProgress || null;
    let imageDownloadRunning = imageDownloadProgress?.phase === "downloading";
    let translationProgress = state.translationProgress || null;
    let translationRunning = translationProgress?.phase === "translating" || translationProgress?.phase === "exporting";

    window.addEventListener("message", (event) => {
      if (event.data?.command === "imageDownloadProgress") {
        imageDownloadProgress = event.data.progress || null;
        imageDownloadRunning = imageDownloadProgress?.phase === "downloading";
        updateImageDownloadProgress();
        return;
      }
      if (event.data?.command === "translationProgress") {
        translationProgress = event.data.progress || null;
        translationRunning = translationProgress?.phase === "translating" || translationProgress?.phase === "exporting";
        updateTranslationProgress();
      }
    });

    function post(command, payload = {}) {
      // Explicit refreshes should start at the first result. Keep the current
      // table position only for in-place edits such as changing a row type.
      const resetsTablePosition = ["refreshFiles", "reloadAnnotations", "scanSpelling"].includes(command);
      if (resetsTablePosition) {
        tableScrollState = { top: 0, left: 0 };
        focusState = null;
      } else {
        captureTableContext();
      }
      persistViewState();
      vscode.postMessage({ command, ...payload });
    }

    function persistViewState() {
      storeCurrentModuleSortState();
      vscode.setState?.({
        activeModule,
        sortRules,
        sortRulesConfigured,
        sortStatesByModule,
        annotationMatchSortInitialized,
        annotationAutoMatch,
        annotationOnlyUnmatched,
        focusState,
        selectedRowIds: Array.from(selectedRowIds),
        workingRowId,
        tableScrollState,
        moduleRegexConfigs,
      });
    }

    function storeCurrentModuleSortState() {
      sortStatesByModule[activeModule] = {
        rules: sortRules.map((rule) => ({ ...rule })),
        configured: sortRulesConfigured,
      };
    }

    function loadModuleSortState(moduleName) {
      const saved = sortStatesByModule[moduleName];
      sortRules.splice(0, sortRules.length);
      if (saved && Array.isArray(saved.rules)) {
        sortRules.push(...saved.rules.map((rule) => ({ ...rule })));
        sortRulesConfigured = saved.configured === true;
      } else {
        sortRulesConfigured = false;
        setDefaultSortRules(moduleName);
      }
    }

    function setDefaultSortRules(moduleName) {
      sortRules.splice(0, sortRules.length);
      if (postOcrCleanMode && (moduleName === "文本块" || moduleName === "分句")) {
        sortRules.push({ key: "line", direction: "asc" });
        return;
      }
      if (!postOcrCleanMode && moduleName === "标题") {
        sortRules.push({ key: "sourceLabel", direction: "asc" }, { key: "line", direction: "asc" });
        return;
      }
      if (!postOcrCleanMode && moduleName === "注释") {
        sortRules.push(
          { key: "annotationMatched", direction: "asc" },
          { key: "annotationPairOrder", direction: "asc" },
          { key: "line", direction: "asc" },
        );
        annotationMatchSortInitialized = true;
        return;
      }
      sortRules.push({ key: "raw", direction: "asc" });
    }

    function captureTableContext() {
      const tableScroll = document.querySelector(".table-scroll");
      if (tableScroll) {
        const anchor = workingRowId
          ? document.querySelector('[data-row-id="' + CSS.escape(workingRowId) + '"]')
          : null;
        tableScrollState = {
          top: tableScroll.scrollTop,
          left: tableScroll.scrollLeft,
          anchorId: anchor ? workingRowId : null,
          anchorOffset: anchor
            ? anchor.getBoundingClientRect().top - tableScroll.getBoundingClientRect().top
            : null,
        };
      }
      const active = document.activeElement;
      if (active?.dataset?.focusId && active.dataset.focusControl) {
        focusState = {
          id: active.dataset.focusId,
          control: active.dataset.focusControl,
          selectionStart: typeof active.selectionStart === "number" ? active.selectionStart : undefined,
          selectionEnd: typeof active.selectionEnd === "number" ? active.selectionEnd : undefined,
        };
      }
    }

    function restoreTableContext() {
      requestAnimationFrame(() => {
        const tableScroll = document.querySelector(".table-scroll");
        if (tableScroll && tableScrollState) {
          tableScroll.scrollTop = tableScrollState.top || 0;
          tableScroll.scrollLeft = tableScrollState.left || 0;
          const anchorId = tableScrollState.anchorId || workingRowId;
          const anchor = anchorId
            ? document.querySelector('[data-row-id="' + CSS.escape(anchorId) + '"]')
            : null;
          if (anchor && typeof tableScrollState.anchorOffset === "number") {
            const currentOffset = anchor.getBoundingClientRect().top - tableScroll.getBoundingClientRect().top;
            tableScroll.scrollTop += currentOffset - tableScrollState.anchorOffset;
          }
        }
        if (!focusState) {
          return;
        }
        const control = Array.from(document.querySelectorAll("[data-focus-id][data-focus-control]")).find((element) =>
          element.dataset.focusId === focusState.id && element.dataset.focusControl === focusState.control,
        );
        if (!control) {
          return;
        }
        control.focus();
        if (typeof control.setSelectionRange === "function" && typeof focusState.selectionStart === "number") {
          control.setSelectionRange(focusState.selectionStart, focusState.selectionEnd ?? focusState.selectionStart);
        }
      });
    }

    function render() {
      app.innerHTML = "";
      const title = document.createElement("h1");
      title.textContent = state.searchTableActive
        ? (postOcrCleanMode ? "清洗后文本块数据表" : "搜索结果数据表")
        : "注释配对表格";
      app.append(title, text(state.file.label));
      if (!state.file.path) {
        app.append(
          smallButton("打开工作目录", () => post("pickFolder"), "primary"),
          text("请在上方目录中选择 Markdown 文件；模块数据表结构会保持可见。"),
        );
      }

      // Regular OCR files always use the module data-table work surface. The
      // legacy footnote-pair screen remains available only before this table was
      // introduced for a post-OCR document.
      if (state.searchTableActive || !postOcrCleanMode) {
        app.append(stickyControls());
        if (postOcrCleanMode && activeModule === "翻译设置") {
          app.append(translationSettingsPanel());
          restoreTableContext();
          return;
        }
        const moduleRows = rowsForModule(activeModule);
        const rows = activeModule === "注释" && annotationOnlyUnmatched
          ? moduleRows.filter((candidate) => !annotationIsMatched(candidate))
          : moduleRows;
        const sortedRows = getSortedRows(rows);
        // Keep the module table and its column headers visible even before a rule
        // produces candidates, so changing regex never makes the work surface vanish.
        app.append(tableScroll(searchTable(sortedRows)));
        restoreTableContext();
        return;
      }

      if (!state.pairs.length) {
        app.append(text("请先在左侧搜索，并点击“结果加到数据表”。"));
        if (state.selectedCandidate) {
          app.append(suspiciousCard(state.selectedCandidate));
        }
        return;
      }

      const table = document.createElement("table");
      table.innerHTML = \`
        <thead>
          <tr>
            <th>编号</th>
            <th>注释引用 ref</th>
            <th>ref 行号</th>
            <th>注释正文 body</th>
            <th>body 行号</th>
            <th>规范预览</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody></tbody>
      \`;
      const tbody = table.querySelector("tbody");
      state.pairs.forEach((pair) => {
        const row = document.createElement("tr");
        row.className = state.selectedPairId === pair.id ? "selected" : "";
        row.innerHTML = \`
          <td>\${escapeHtml(pair.label)}</td>
          <td><code>\${escapeHtml(pair.ref?.raw || "")}</code></td>
          <td>\${pair.ref ? pair.ref.range.line + 1 : ""}</td>
          <td><code>\${escapeHtml(pair.body?.raw || "")}</code></td>
          <td>\${pair.body ? pair.body.range.line + 1 : ""}</td>
          <td><code>\${escapeHtml(pair.normalizedBody || pair.normalizedRef)}</code></td>
          <td>\${escapeHtml(pair.status)}</td>
          <td></td>
        \`;
        row.addEventListener("click", () => post("selectPair", { id: pair.id }));
        const actions = row.querySelector("td:last-child");
        actions.append(
          smallButton("ref", (event) => { event.stopPropagation(); post("locateRef", { id: pair.id }); }),
          smallButton("body", (event) => { event.stopPropagation(); post("locateBody", { id: pair.id }); }),
        );
        tbody.append(row);
      });
      app.append(table);

      const selectedPair = state.pairs.find((pair) => pair.id === state.selectedPairId) || state.pairs[0];
      if (selectedPair) {
        app.append(pairCard(selectedPair));
      }
      if (state.selectedCandidate?.kind === "suspicious") {
        app.append(suspiciousCard(state.selectedCandidate));
      }
    }

    function searchTable(rows) {
      if (postOcrCleanMode) {
        return activeModule === "分句" ? sentenceTable(rows) : textBlockTable(rows);
      }
      rowById.clear();
      checkboxById.clear();
      const isAnnotationModule = activeModule === "注释";
      const isTitleModule = activeModule === "标题";
      const isImageModule = activeModule === "图片";
      const isIllegalBreakModule = activeModule === "非法断行";
      const isSpellModule = activeModule === "拼写检查";
      const grid = document.createElement("div");
      grid.className = isAnnotationModule
        ? "compact-grid annotation-grid"
        : isTitleModule
          ? "compact-grid title-grid"
          : isImageModule
            ? "compact-grid image-grid"
            : isIllegalBreakModule
              ? "compact-grid illegal-break-grid"
            : isSpellModule
              ? "compact-grid spell-grid"
            : "compact-grid";
      const head = document.createElement("div");
      head.className = isAnnotationModule
        ? "compact-row annotation-row compact-head"
        : isTitleModule
          ? "compact-row title-row compact-head"
          : isImageModule
            ? "compact-row image-row compact-head"
            : isIllegalBreakModule
              ? "compact-row illegal-break-row compact-head"
            : isSpellModule
              ? "compact-row spell-row compact-head"
            : "compact-row compact-head";
      if (isAnnotationModule) {
        head.append(
          selectAllHead(rows),
          plainHead("#"),
          sortHead("PairID", "pairId"),
          sortHead("注释号", "annotationNumber"),
          sortHead("行号", "line"),
          sortHead("正则", "regexSource"),
          sortHead("预览", "preview"),
          sortHead("行类型", "lineType"),
          sortHead("章节文件", "chapterFile"),
          sortHead("源文件", "sourceLabel"),
        );
      } else if (isTitleModule) {
        head.append(
          selectAllHead(rows),
          sortHead("源文件", "sourceLabel"),
          sortHead("行号", "line"),
          sortHead("匹配", "raw"),
          sortHead("行类型", "lineType"),
          sortHead("章节文件", "chapterFile"),
        );
      } else if (isImageModule) {
        head.append(
          selectAllHead(rows),
          plainHead("#"),
          sortHead("源文件", "sourceLabel"),
          sortHead("匹配", "raw"),
          sortHead("预览", "preview"),
          sortHead("行号", "line"),
          sortHead("行类型", "lineType"),
          sortHead("本地路径", "localPath"),
          plainHead("操作"),
        );
      } else if (isSpellModule) {
        head.append(
          selectAllHead(rows),
          plainHead("#"),
          sortHead("源文件", "sourceLabel"),
          sortHead("状态", "lineType"),
          sortHead("原词", "raw"),
          sortHead("建议替换", "replacement"),
          sortHead("上下文", "preview"),
          sortHead("行号", "line"),
          plainHead("操作"),
        );
      } else if (isIllegalBreakModule) {
        head.append(
          selectAllHead(rows),
          plainHead("#"),
          sortHead("源文件", "sourceLabel"),
          sortHead("匹配", "raw"),
          sortHead("预览", "preview"),
          sortHead("行号", "line"),
          sortHead("行类型", "lineType"),
          sortHead("连接符 / 订正文本", "replacement"),
          plainHead("操作"),
        );
      } else {
        head.append(
          selectAllHead(rows),
          plainHead("#"),
          sortHead("源文件", "sourceLabel"),
          sortHead("匹配", "raw"),
          sortHead("预览", "preview"),
          sortHead("行号", "line"),
          sortHead(moduleActionConfig().header, moduleActionConfig().sortKey),
          plainHead("操作"),
        );
      }
      grid.append(head);
      rows.forEach((candidate, index) => {
        const row = document.createElement("div");
        const matchClass = annotationAutoMatch ? annotationMatchClass(candidate) : "";
        row.className = [
          "compact-row",
          isAnnotationModule ? "annotation-row" : "",
          isTitleModule ? "title-row" : "",
          isImageModule ? "image-row" : "",
          isIllegalBreakModule ? "illegal-break-row" : "",
          isSpellModule ? "spell-row" : "",
          isSpellModule ? spellModifiedClass(candidate) : "",
          isIllegalBreakModule ? illegalBreakModifiedClass(candidate) : "",
          candidate.isWorkingCorrection ? "working-correction" : "",
          titleMismatchClass(candidate),
          selectedRowIds.has(candidate.id) ? "selected" : "",
          matchClass,
        ].filter(Boolean).join(" ");
        row.dataset.rowId = candidate.id;
        rowById.set(candidate.id, row);
        const sourceLabel = candidate.sourceLabel || "当前文件";
        const preview = truncateText(candidate.preview || "", 256);
        if (isAnnotationModule) {
          row.innerHTML = \`
            <span></span>
            <span>\${index + 1}</span>
            <code class="compact-hit">\${escapeHtml(annotationPairId(candidate))}</code>
            <span>\${escapeHtml(annotationNumber(candidate) || "未识别")}</span>
            <span>\${candidate.range.line + 1}</span>
            <code class="compact-hit" title="\${escapeHtml(annotationRegexSource(candidate))}">\${escapeHtml(annotationRegexSource(candidate))}</code>
            <span class="compact-preview" title="\${escapeHtml(candidate.preview || "")}">\${escapeHtml(preview)}</span>
            <span class="line-type-cell"></span>
            <span title="\${escapeHtml(candidate.chapterFile || "")}">\${escapeHtml(candidate.chapterFile || "")}</span>
            <span class="source-file-cell" title="\${escapeHtml(candidate.sourcePath || sourceLabel)}">\${escapeHtml(sourceLabel)}</span>
          \`;
        } else if (isTitleModule) {
          row.innerHTML = \`
            <span></span>
            <span class="source-file-cell" title="\${escapeHtml(candidate.sourcePath || sourceLabel)}">\${escapeHtml(sourceLabel)}</span>
            <span>\${candidate.range.line + 1}</span>
            <code class="compact-hit" title="\${escapeHtml(candidate.preview || candidate.raw)}">\${escapeHtml(truncateText(candidate.preview || candidate.raw, 256))}</code>
            <span class="line-type-cell"></span>
            <span title="\${escapeHtml(candidate.chapterFile || "")}">\${escapeHtml(candidate.chapterFile || "")}</span>
          \`;
        } else if (isImageModule) {
          row.innerHTML = \`
            <span></span>
            <span>\${index + 1}</span>
            <span class="source-file-cell" title="\${escapeHtml(candidate.sourcePath || sourceLabel)}">\${escapeHtml(sourceLabel)}</span>
            <code class="compact-hit" title="\${escapeHtml(candidate.raw)}">\${escapeHtml(candidate.raw)}</code>
            <span class="compact-preview" title="\${escapeHtml(candidate.preview || "")}">\${escapeHtml(preview)}</span>
            <span>\${candidate.range.line + 1}</span>
            <span class="line-type-cell"></span>
            <code class="compact-preview" title="\${escapeHtml(candidate.localPath || "")}">\${escapeHtml(candidate.localPath || "")}</code>
            <span class="row-actions-cell"></span>
          \`;
        } else if (isIllegalBreakModule) {
          row.innerHTML = \`
            <span></span>
            <span>\${index + 1}</span>
            <span class="source-file-cell" title="\${escapeHtml(candidate.sourcePath || sourceLabel)}">\${escapeHtml(sourceLabel)}</span>
            <code class="compact-hit" title="\${escapeHtml(candidate.raw)}">\${escapeHtml(candidate.raw)}</code>
            <span class="compact-preview" title="\${escapeHtml(candidate.preview || "")}">\${escapeHtml(preview)}</span>
            <span>\${candidate.range.line + 1}</span>
            <span class="line-type-cell"></span>
            <span class="line-break-connector-cell"></span>
            <span class="row-actions-cell"></span>
          \`;
        } else if (isSpellModule) {
          row.innerHTML = \`
            <span></span>
            <span>\${index + 1}</span>
            <span class="source-file-cell" title="\${escapeHtml(candidate.sourcePath || sourceLabel)}">\${escapeHtml(sourceLabel)}</span>
            <span class="line-type-cell"></span>
            <code class="compact-hit" title="\${escapeHtml(candidate.raw)}">\${escapeHtml(candidate.raw)}</code>
            <span class="spell-replacement-cell"></span>
            <span class="compact-preview" title="\${escapeHtml(candidate.preview || "")}">\${escapeHtml(preview)}</span>
            <span>\${candidate.range.line + 1}</span>
            <span class="row-actions-cell"></span>
          \`;
        } else {
          row.innerHTML = \`
            <span></span>
            <span>\${index + 1}</span>
            <span class="source-file-cell" title="\${escapeHtml(candidate.sourcePath || sourceLabel)}">\${escapeHtml(sourceLabel)}</span>
            <code class="compact-hit" title="\${escapeHtml(candidate.raw)}">\${escapeHtml(candidate.raw)}</code>
            <span class="compact-preview" title="\${escapeHtml(candidate.preview || "")}">\${escapeHtml(preview)}</span>
            <span>\${candidate.range.line + 1}</span>
            <span class="line-type-cell"></span>
            <span class="row-actions-cell"></span>
          \`;
        }
        const checkboxHolder = row.querySelector("span:first-child");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = selectedRowIds.has(candidate.id);
        checkboxById.set(candidate.id, checkbox);
        checkbox.addEventListener("click", (event) => {
          event.stopPropagation();
          if (event.shiftKey && lastSelectedIndex >= 0) {
            selectRange(rows, lastSelectedIndex, index, checkbox.checked);
          } else {
            setRowSelection(candidate.id, checkbox.checked);
          }
          lastSelectedIndex = index;
        });
        checkboxHolder.append(checkbox);

        const typeHolder = row.querySelector(".line-type-cell");
        const action = moduleActionConfig();
        const typeSelect = optionSelect(action.value(candidate), action.options, (value, event) => {
          event.stopPropagation();
          post(action.command, { ids: [candidate.id], [action.payloadKey]: value });
        });
        typeSelect.dataset.focusId = candidate.id;
        typeSelect.dataset.focusControl = "lineType";
        typeSelect.addEventListener("focus", () => { workingRowId = candidate.id; });
        typeHolder.append(typeSelect);
        if (isAnnotationModule) {
          const pair = annotationPairsByCandidateId.get(candidate.id);
          const pairStatus = document.createElement("span");
          pairStatus.className = "annotation-pair-status";
          pairStatus.textContent = pair ? "Pair " + pair.number + " · " + pair.status + " · " + pair.confidence : "未进入 Pair";
          typeHolder.append(pairStatus);
        }

        if (isSpellModule) {
          const replacementHolder = row.querySelector(".spell-replacement-cell");
          const replacementInput = document.createElement("input");
          replacementInput.className = "spell-replacement-input";
          replacementInput.dataset.focusId = candidate.id;
          replacementInput.dataset.focusControl = "replacement";
          replacementInput.value = candidate.replacement || "";
          replacementInput.placeholder = "输入正确拼写";
          replacementInput.title = (candidate.suggestions || []).join("\\n");
          const suggestionsId = "spell-suggestions-" + index;
          replacementInput.setAttribute("list", suggestionsId);
          const suggestionList = document.createElement("datalist");
          suggestionList.id = suggestionsId;
          (candidate.suggestions || []).forEach((suggestion) => {
            const option = document.createElement("option");
            option.value = suggestion;
            suggestionList.append(option);
          });
          replacementInput.addEventListener("click", (event) => event.stopPropagation());
          replacementInput.addEventListener("focus", () => { workingRowId = candidate.id; });
          replacementInput.addEventListener("change", () => post("setSpellReplacement", { id: candidate.id, replacement: replacementInput.value }));
          replacementHolder.append(replacementInput, suggestionList);
        }

        if (isIllegalBreakModule) {
          const connectorHolder = row.querySelector(".line-break-connector-cell");
          const connectorInput = document.createElement("input");
          connectorInput.className = "line-break-connector-input";
          connectorInput.dataset.focusId = candidate.id;
          connectorInput.dataset.focusControl = "connector";
          connectorInput.value = candidate.replacement || "";
          const isSingleLineCorrection = candidate.lineType === "单行订正";
          connectorInput.placeholder = isSingleLineCorrection ? "输入完整正确行" : "默认空格，例如 --";
          connectorInput.title = isSingleLineCorrection
            ? "输出时使用此文本替换当前整行"
            : "两行之间使用的连接符；留空时自动使用一个空格";
          connectorInput.addEventListener("click", (event) => event.stopPropagation());
          connectorInput.addEventListener("focus", () => { workingRowId = candidate.id; });
          connectorInput.addEventListener("change", () => post("setRowReplacement", { id: candidate.id, replacement: connectorInput.value }));
          connectorHolder.append(connectorInput);
        }

        const hitCell = row.querySelector(".compact-hit");
        const previewCell = row.querySelector(".compact-preview");
        hitCell.addEventListener("click", (event) => {
          event.stopPropagation();
          workingRowId = candidate.id;
          post(isSpellModule ? "locateSourceCandidate" : "selectCandidate", { id: candidate.id });
        });
        previewCell?.addEventListener("click", (event) => {
          event.stopPropagation();
          workingRowId = candidate.id;
          post("locateSourceCandidate", { id: candidate.id });
        });

        row.addEventListener("click", (event) => {
          workingRowId = candidate.id;
          if (event.shiftKey && lastSelectedIndex >= 0) {
            selectRange(rows, lastSelectedIndex, index, true);
            lastSelectedIndex = index;
            return;
          }
          if (event.metaKey || event.ctrlKey) {
            checkbox.checked = !checkbox.checked;
            setRowSelection(candidate.id, checkbox.checked);
            lastSelectedIndex = index;
            return;
          }
        });
        if (!isAnnotationModule && !isTitleModule) {
          const actions = row.querySelector(".row-actions-cell");
          actions.append(smallButton("定位", (event) => {
            event.stopPropagation();
            workingRowId = candidate.id;
            post("selectCandidate", { id: candidate.id });
          }));
        }
        grid.append(row);
      });
      return grid;
    }

    function textBlockTable(rows) {
      const table = document.createElement("table");
      table.className = "text-block-table";
      table.innerHTML = "<thead><tr></tr></thead><tbody></tbody>";
      const header = table.querySelector("thead tr");
      header.append(
        textBlockSortHead("#", "blockIndex"),
        textBlockSortHead("块类型", "blockType"),
        textBlockSortHead("预览", "preview"),
        textBlockSortHead("起始行", "line"),
        textBlockSortHead("结束行", "endLine"),
      );
      const body = table.querySelector("tbody");
      rows.forEach((candidate, index) => {
        const row = document.createElement("tr");
        row.dataset.rowId = candidate.id;
        row.innerHTML = "<td>" + textBlockNumber(candidate) + "</td><td class='text-block-type'></td><td class='text-block-content'></td><td>" + (candidate.range.line + 1) + "</td><td>" + ((candidate.range.endLine ?? candidate.range.line) + 1) + "</td>";
        const typeSelect = document.createElement("select");
        typeSelect.className = "text-block-type-select";
        TEXT_BLOCK_TYPES.forEach((type) => {
          const option = document.createElement("option");
          option.value = type;
          option.textContent = type;
          option.selected = type === candidate.lineType;
          typeSelect.append(option);
        });
        typeSelect.addEventListener("click", (event) => event.stopPropagation());
        typeSelect.addEventListener("focus", () => { workingRowId = candidate.id; });
        typeSelect.addEventListener("change", () => post("setRowsLineType", { ids: [candidate.id], lineType: typeSelect.value }));
        row.querySelector(".text-block-type").append(typeSelect);
        row.querySelector(".text-block-content").textContent = truncateText(candidate.preview || candidate.raw, 256);
        row.addEventListener("click", () => {
          workingRowId = candidate.id;
          post("locateSourceCandidate", { id: candidate.id });
        });
        body.append(row);
      });
      return table;
    }

    function sentenceTable(rows) {
      const table = document.createElement("table");
      table.className = "text-block-table sentence-table";
      table.innerHTML = "<thead><tr></tr></thead><tbody></tbody>";
      const header = table.querySelector("thead tr");
      header.append(
        textBlockSortHead("#", "sentenceIndex"),
        textBlockSortHead("所属块", "blockIndex"),
        textBlockSortHead("待翻译文本", "translationText"),
        textBlockSortHead("译文", "translation"),
        textBlockSortHead("还原结果", "restoredTranslation"),
        textBlockSortHead("起始行", "line"),
        textBlockSortHead("结束行", "endLine"),
      );
      const body = table.querySelector("tbody");
      rows.forEach((candidate) => {
        const row = document.createElement("tr");
        row.dataset.rowId = candidate.id;
        row.innerHTML = "<td>" + sentenceDisplayId(candidate) + "</td><td>" + textBlockNumber(candidate) + "</td><td class='text-block-content sentence-translation-source'></td><td class='sentence-translation-cell'></td><td class='text-block-content sentence-restored-result'></td><td>" + (candidate.range.line + 1) + "</td><td>" + ((candidate.range.endLine ?? candidate.range.line) + 1) + "</td>";
        row.querySelector(".sentence-translation-source").textContent = truncateText(candidate.translationText || candidate.raw, 256);
        row.querySelector(".sentence-restored-result").textContent = truncateText(candidate.restoredTranslation || "", 256);
        const translationInput = document.createElement("textarea");
        translationInput.className = "sentence-translation-input";
        translationInput.value = candidate.translation || "";
        translationInput.placeholder = "粘贴翻译引擎返回的译文";
        translationInput.addEventListener("click", (event) => event.stopPropagation());
        translationInput.addEventListener("focus", () => { workingRowId = candidate.id; });
        translationInput.addEventListener("change", () => post("setSentenceTranslation", { id: candidate.id, translation: translationInput.value }));
        row.querySelector(".sentence-translation-cell").append(translationInput);
        row.addEventListener("click", () => {
          workingRowId = candidate.id;
          post("locateSourceCandidate", { id: candidate.id });
        });
        body.append(row);
      });
      return table;
    }

    function textBlockNumber(candidate) {
      if (Number.isInteger(candidate.blockIndex)) {
        return candidate.blockIndex;
      }
      const match = String(candidate.label || "").match(/^文本块\s+(\d+)$/);
      return match ? Number(match[1]) : candidate.range.line + 1;
    }

    function sentenceNumber(candidate) {
      if (Number.isInteger(candidate.sentenceIndex)) {
        return candidate.sentenceIndex;
      }
      const match = String(candidate.label || "").match(/^分句\s+\d+\.(\d+)$/);
      return match ? Number(match[1]) : candidate.range.line + 1;
    }

    function sentenceDisplayId(candidate) {
      return textBlockNumber(candidate) + "." + sentenceNumber(candidate);
    }

    function textBlockSortHead(label, key) {
      const cell = document.createElement("th");
      const wrap = document.createElement("label");
      wrap.className = "sort-head";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = sortRules.some((rule) => rule.key === key);
      checkbox.addEventListener("click", (event) => {
        event.stopPropagation();
        setSortEnabled(key, checkbox.checked);
      });
      const labelText = document.createElement("span");
      labelText.textContent = label;
      const direction = smallButton(sortDirection(key) === "desc" ? "↓" : "↑", (event) => {
        event.stopPropagation();
        toggleSortDirection(key);
      });
      direction.classList.add("sort-dir");
      wrap.append(checkbox, labelText, direction);
      cell.append(wrap);
      return cell;
    }

    function tableScroll(table) {
      const wrapper = document.createElement("div");
      wrapper.className = "table-scroll";
      wrapper.append(table);
      return wrapper;
    }

    function stickyControls() {
      const controls = document.createElement("div");
      controls.className = "sticky-controls";
      if (postOcrCleanMode) {
        controls.append(moduleTabs());
        if (activeModule === "文本块") {
          const splitButton = smallButton("分句全部可处理块", () => post("splitSentences"));
          splitButton.title = "仅处理正文、注释正文和合成.文本；源文件不会修改。";
          const translateButton = smallButton(translationRunning ? "正在翻译" : "翻译全部文本块", () => post("translateTextBlocks"), "primary");
          translateButton.classList.add("translate-blocks-button");
          translateButton.disabled = translationRunning;
          translateButton.title = "按文本块请求 DeepL，并按分句 ID 回填。";
          controls.append(
            splitButton,
            translateButton,
            smallButton("保存翻译", () => post("saveTranslations")),
            smallButton("加载翻译", () => post("reloadTranslations")),
            translationExportButton(),
          );
          if (state.failedTranslationBlockIndexes.length) {
            const retryButton = smallButton("重试失败 (" + state.failedTranslationBlockIndexes.length + ")", () => post("retryFailedTextBlocks"));
            retryButton.disabled = translationRunning;
            controls.append(retryButton);
          }
          controls.append(translationProgressElement(), text("文本块按两个及以上连续换行分隔；翻译按块请求、按分句 ID 回填，源码不会修改。"));
        } else if (activeModule === "分句") {
          controls.append(
            smallButton("保存翻译", () => post("saveTranslations")),
            smallButton("加载翻译", () => post("reloadTranslations")),
            translationExportButton(),
            translationProgressElement(),
          );
        }
      } else {
        controls.append(moduleTabs(), moduleRegexPanel(), moduleWorkPanel(), tableToolbar());
      }
      return controls;
    }

    function translationProgressElement() {
      const element = document.createElement("div");
      element.className = "translation-progress";
      renderTranslationProgress(element);
      return element;
    }

    function updateTranslationProgress() {
      document.querySelectorAll(".translation-progress").forEach(renderTranslationProgress);
      document.querySelectorAll(".translate-blocks-button").forEach((button) => {
        button.textContent = translationProgress?.phase === "translating" ? "正在翻译" : "翻译全部文本块";
        button.disabled = translationRunning;
      });
      document.querySelectorAll(".translation-export-button").forEach((button) => {
        button.textContent = translationProgress?.phase === "exporting" ? "正在导出" : "导出 Obsidian 交叉互译";
        button.disabled = translationRunning;
      });
    }

    function renderTranslationProgress(element) {
      if (!translationProgress) {
        element.textContent = "";
        return;
      }
      const progress = document.createElement("progress");
      progress.max = Math.max(translationProgress.total || 1, 1);
      progress.value = Math.min(translationProgress.completed || 0, progress.max);
      const label = document.createElement("span");
      const isExport = translationProgress.operation === "export" || translationProgress.phase === "exporting";
      const prefix = translationProgress.phase === "complete"
        ? (isExport ? "导出完成" : "翻译完成")
        : (isExport ? "导出中" : "翻译中");
      label.textContent = prefix + " " + (translationProgress.completed || 0) + " / " + translationProgress.total + " · " + (translationProgress.current || "");
      element.replaceChildren(progress, label);
      element.classList.toggle("error", Boolean(translationProgress.lastError));
      element.title = translationProgress.lastError || "";
    }

    function translationExportButton() {
      const button = smallButton(
        translationProgress?.phase === "exporting" ? "正在导出" : "导出 Obsidian 交叉互译",
        () => post("exportObsidianCrossTranslation"),
        "primary",
      );
      button.classList.add("translation-export-button");
      button.disabled = translationRunning;
      button.title = "输出 org、trans、trans2org 和 org2trans 四份 Markdown；不修改当前源文件。";
      return button;
    }

    function moduleTabs() {
      const tabs = document.createElement("div");
      tabs.className = "module-tabs";
      MODULES.forEach((moduleName) => {
        const tab = document.createElement("button");
        tab.type = "button";
        tab.className = moduleName === activeModule ? "module-tab active" : "module-tab";
        const count = moduleCount(moduleName);
        tab.textContent = count === "" ? moduleName : moduleName + " (" + count + ")";
        tab.addEventListener("click", () => {
          storeCurrentModuleSortState();
          activeModule = moduleName;
          loadModuleSortState(moduleName);
          selectedRowIds.clear();
          lastSelectedIndex = -1;
          workingRowId = null;
          persistViewState();
          render();
          if (moduleName === "注释") {
            post("reloadAnnotations", { silent: true });
          } else if (hasModuleRegex(moduleName)) {
            queueModuleRegexScan();
          }
        });
        tabs.append(tab);
      });
      return tabs;
    }

    function hasModuleRegex(moduleName) {
      return !postOcrCleanMode && moduleName !== "拼写检查" && state.moduleRegexPresets?.[moduleName];
    }

    function currentModuleRegexConfig() {
      const saved = moduleRegexConfigs[activeModule] || {};
      return {
        regexScopeDirectory: saved.regexScopeDirectory ?? state.regexScopeDirectory,
        regexIncludeSubdirectories: saved.regexIncludeSubdirectories ?? state.regexIncludeSubdirectories,
        pattern: saved.pattern ?? state.moduleRegexPatterns?.[activeModule] ?? "",
      };
    }

    function queueModuleRegexScan() {
      if (!hasModuleRegex(activeModule)) {
        return;
      }
      const config = currentModuleRegexConfig();
      if (!config.pattern.trim()) {
        return;
      }
      post("scanModuleRegex", { moduleName: activeModule, ...config });
    }

    function moduleRegexPanel() {
      if (!hasModuleRegex(activeModule)) {
        return document.createDocumentFragment();
      }
      const config = currentModuleRegexConfig();
      const panel = document.createElement("div");
      panel.className = "module-regex-panel";
      const scopeInput = document.createElement("input");
      scopeInput.value = config.regexScopeDirectory;
      scopeInput.placeholder = "作用目录";
      scopeInput.title = "扫描该目录中的 Markdown 文件";
      scopeInput.dataset.focusId = "module-regex-" + activeModule;
      scopeInput.dataset.focusControl = "scope";

      const patternInput = document.createElement("textarea");
      patternInput.value = config.pattern;
      patternInput.placeholder = "输入正则；多条规则用独立一行 --- 分隔";
      patternInput.spellcheck = false;
      patternInput.dataset.focusId = "module-regex-" + activeModule;
      patternInput.dataset.focusControl = "pattern";

      const include = document.createElement("input");
      include.type = "checkbox";
      include.checked = config.regexIncludeSubdirectories;
      const includeLabel = document.createElement("label");
      includeLabel.className = "checkbox-row";
      includeLabel.append(include, document.createTextNode("包括子目录"));

      const rememberDraft = () => {
        moduleRegexConfigs[activeModule] = {
          regexScopeDirectory: scopeInput.value,
          regexIncludeSubdirectories: include.checked,
          pattern: patternInput.value,
        };
        persistViewState();
      };
      const scan = () => {
        const next = {
          regexScopeDirectory: scopeInput.value,
          regexIncludeSubdirectories: include.checked,
          pattern: patternInput.value,
        };
        moduleRegexConfigs[activeModule] = next;
        persistViewState();
        if (!next.pattern.trim()) {
          captureTableContext();
          render();
          return;
        }
        post("scanModuleRegex", { moduleName: activeModule, ...next });
      };
      let timer;
      const scheduleExplorationScan = () => {
        rememberDraft();
        clearTimeout(timer);
        timer = setTimeout(scan, 120);
      };
      // 未分类 behaves like VS Code search: update the table while typing.
      // scanModuleRegex preserves focus/selection so its full table refresh
      // does not interrupt composition in the input.
      if (activeModule === "未分类") {
        scopeInput.addEventListener("input", scheduleExplorationScan);
        patternInput.addEventListener("input", scheduleExplorationScan);
      } else {
        scopeInput.addEventListener("input", rememberDraft);
        patternInput.addEventListener("input", rememberDraft);
      }
      scopeInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          clearTimeout(timer);
          scan();
        }
      });
      patternInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          clearTimeout(timer);
          scan();
        }
      });
      include.addEventListener("change", scan);
      const applyButton = smallButton("应用正则", scan, "primary");

      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = activeModule + "正则演示和语法（多条规则以 --- 分隔）";
      const presets = document.createElement("div");
      presets.className = "module-regex-presets";
      (state.moduleRegexPresets[activeModule] || []).forEach((preset) => {
        const item = document.createElement("button");
        item.type = "button";
        item.textContent = preset.label + "  " + preset.pattern + " · " + preset.description;
        item.addEventListener("click", () => {
          patternInput.value = preset.pattern;
          details.open = false;
          scan();
        });
        presets.append(item);
      });
      details.append(summary, presets);
      panel.append(scopeInput, patternInput, includeLabel, applyButton, details);
      return panel;
    }

    function moduleWorkPanel() {
      const panel = document.createElement("div");
      panel.className = "module-work";
      const title = document.createElement("strong");
      title.textContent = activeModule + "模块";
      const detail = document.createElement("span");
      detail.textContent = " · " + moduleWorkText(activeModule);
      panel.append(title, detail);
      if (activeModule === "注释") {
        const summary = document.createElement("span");
        summary.className = "match-summary";
        summary.textContent = annotationMatchSummary();
        panel.append(summary);
      }
      return panel;
    }

    function moduleWorkText(moduleName) {
      if (moduleName === "未分类") {
        return "探索模块：在这里试验任意正则；命中行先保留为未分类，再由人工分配到目标模块。";
      }
      if (moduleName === "注释") {
        return "专用模块：选择注释正则后，命中行直接进入本表，用于 footnote ref/body 的后续配对确认。";
      }
      if (moduleName === "标题") {
        return "专用模块：选择标题正则后，命中行直接进入本表。行类型与原文标题层级不一致时会着色提示，但不会修改源文件。";
      }
      if (moduleName === "图片") {
        return "专用模块：选择图片正则后，命中行直接进入本表，用于后续图片引用和说明检查。";
      }
      if (moduleName === "非法断行") {
        return "专用模块：选择断行正则后，命中行直接进入本表，用于后续断行异常确认。";
      }
      if (moduleName === "拼写检查") {
        return "使用 CSpell 扫描英文拼写候选；仅“已确认”的替换会写入章节输出，源文件不会修改。";
      }
      return "";
    }

    function translationSettingsPanel() {
      const panel = document.createElement("section");
      panel.className = "translation-settings";
      const title = document.createElement("div");
      title.className = "card";
      title.textContent = "DeepL Free 测试会把当前 Key 保存在 VS Code 的 SecretStorage 中。测试文本建议使用分句表的待翻译文本，占位符会原样交给 DeepL。";

      const engineLabel = document.createElement("label");
      engineLabel.textContent = "翻译引擎";
      const engineSelect = document.createElement("select");
      const deepLOption = document.createElement("option");
      deepLOption.value = "deepl-free";
      deepLOption.textContent = "DeepL Free";
      engineSelect.append(deepLOption);
      engineLabel.append(engineSelect);

      const keyLabel = document.createElement("label");
      keyLabel.textContent = "DeepL API Key";
      const keyInput = document.createElement("input");
      keyInput.type = "password";
      keyInput.autocomplete = "off";
      keyInput.placeholder = state.deeplConfigured ? "已保存 Key；留空则使用已保存的 Key" : "输入 DeepL API Free Key";
      keyLabel.append(keyInput);

      const textLabel = document.createElement("label");
      textLabel.textContent = "测试待翻译文本";
      const testText = document.createElement("textarea");
      testText.value = "[[OCR2MD_FOOTNOTE_1]]The return is [[OCR2MD_LATEX_2]] after tax.";
      textLabel.append(testText);

      const testButton = smallButton("测试翻译", () => post("testDeepL", { apiKey: keyInput.value, text: testText.value }), "primary");
      panel.append(
        title,
        engineLabel,
        keyLabel,
        textLabel,
        testButton,
        translationExportButton(),
        translationProgressElement(),
      );

      if (state.translationTestResult) {
        const result = document.createElement("div");
        result.className = "card translation-test-result " + (state.translationTestResult.success ? "success" : "error");
        result.textContent = state.translationTestResult.success
          ? "测试翻译结果：\\n" + state.translationTestResult.message
          : state.translationTestResult.message;
        panel.append(result);
      }
      return panel;
    }

    function rowsForModule(moduleName) {
      const moduleRows = state.searchRows.filter((row) => rowModule(row) === moduleName);
      if (moduleName !== "未分类") {
        return moduleRows;
      }

      // 未分类 is the exploratory regex surface: keep only the rows matched
      // by the regex currently shown above this table.
      const patterns = splitRegexInput(currentModuleRegexConfig().pattern);
      if (!patterns.length) {
        return [];
      }
      try {
        const regexes = patterns.map((pattern) => new RegExp(pattern, "m"));
        return moduleRows.filter((row) => regexes.some((regex) => regex.test(String(row.raw || row.preview || ""))));
      } catch {
        return [];
      }
    }

    function splitRegexInput(input) {
      return String(input || "")
        .split(/^\\s*---\\s*$/m)
        .map((pattern) => pattern.trim())
        .filter(Boolean);
    }

    function moduleCount(moduleName) {
      if (moduleName === "翻译设置") {
        return "";
      }
      return rowsForModule(moduleName).length;
    }

    function rowModule(row) {
      return MODULES.includes(row.typeLabel) ? row.typeLabel : "未分类";
    }

    function annotationMatchClass(candidate) {
      if (activeModule !== "注释" || rowModule(candidate) !== "注释") {
        return "";
      }
      const match = annotationMatchInfo();
      if (match.unmatchedIds.has(candidate.id)) {
        return "annotation-unmatched";
      }
      if (match.matchedIds.has(candidate.id)) {
        return "annotation-matched";
      }
      return "";
    }

    function titleMismatchClass(candidate) {
      if (activeModule !== "标题" || rowModule(candidate) !== "标题") {
        return "";
      }
      const original = originalTitleLineType(candidate);
      const current = titleLineType(candidate);
      return current !== original ? "title-mismatch" : "";
    }

    function spellModifiedClass(candidate) {
      if (activeModule !== "拼写检查" || rowModule(candidate) !== "拼写检查") {
        return "";
      }
      const defaultReplacement = (candidate.suggestions || [])[0] || "";
      if (candidate.lineType !== "待确认") {
        return "spell-resolved";
      }
      return (candidate.replacement || "") !== defaultReplacement ? "spell-pending-modified" : "";
    }

    function illegalBreakModifiedClass(candidate) {
      if (activeModule !== "非法断行" || rowModule(candidate) !== "非法断行") {
        return "";
      }
      if (candidate.lineType === "需要合并" || candidate.lineType === "单行订正") {
        return "illegal-break-merge";
      }
      if (candidate.lineType === "保留断行") {
        return "illegal-break-reviewed";
      }
      return "";
    }

    function annotationMatchSummary() {
      const match = annotationMatchInfo();
      return "引用 " + match.refCount + " / 正文 " + match.bodyCount + " / 可配对 " + match.matchedPairCount + " 组 / 未匹配 " + match.unmatchedIds.size + " 行";
    }

    function annotationMatchInfo() {
      const unmatchedIds = new Set();
      const matchedIds = new Set();
      let refCount = 0;
      let bodyCount = 0;
      const rows = rowsForModule("注释");
      const visibleIds = new Set(rows.map((row) => row.id));

      rows.forEach((row) => {
        const lineType = row.lineType || "注释引用";
        if (lineType === "注释正文") {
          bodyCount += 1;
        } else if (lineType === "注释引用") {
          refCount += 1;
        }
        unmatchedIds.add(row.id);
      });

      (state.annotationPairs || []).forEach((pair) => {
        if (!pair.refCandidateId || !pair.bodyCandidateId) return;
        if (!visibleIds.has(pair.refCandidateId) || !visibleIds.has(pair.bodyCandidateId)) return;
        matchedIds.add(pair.refCandidateId);
        matchedIds.add(pair.bodyCandidateId);
        unmatchedIds.delete(pair.refCandidateId);
        unmatchedIds.delete(pair.bodyCandidateId);
      });

      return {
        matchedIds,
        unmatchedIds,
        refCount,
        bodyCount,
        matchedPairCount: Math.floor(matchedIds.size / 2),
      };
    }

    function annotationSourceKey(candidate) {
      return String(candidate.sourcePath || candidate.sourceLabel || "当前文件");
    }

    function annotationNumber(candidate) {
      const storedNumber = String(candidate.annotationNumber ?? "").trim();
      if (storedNumber) {
        return storedNumber;
      }
      const raw = String(candidate.raw || "");
      const preview = String(candidate.preview || "");
      const textValue = raw || preview;
      const lineType = candidate.lineType || "注释引用";
      if (lineType === "注释正文") {
        const bodyMatch = textValue.match(/^\\s*(?:\\[\\^(\\d+)\\]:|(\\d+)\\.|\\((\\d+)\\))(?:\\s|$)/) || preview.match(/^\\s*(?:\\[\\^(\\d+)\\]:|(\\d+)\\.|\\((\\d+)\\))(?:\\s|$)/);
        return bodyMatch?.[1] || bodyMatch?.[2] || bodyMatch?.[3] || "";
      }
      const refMatch =
        textValue.match(/<sup>\\s*\\(?\\s*(\\d+)\\s*\\)?\\s*<\\/sup>|\\[\\^(\\d+)\\](?!:)/i) ||
        preview.match(/<sup>\\s*\\(?\\s*(\\d+)\\s*\\)?\\s*<\\/sup>|\\[\\^(\\d+)\\](?!:)/i) ||
        textValue.match(/^\\s*(\\d+)\\s*$/);
      if (refMatch) {
        return refMatch[1] || refMatch[2] || "";
      }
      // Keep the number visible even when an existing body row was previously
      // assigned the wrong line type and has not yet been manually corrected.
      const bodyMatch = textValue.match(/^\\s*(?:\\[\\^(\\d+)\\]:|(\\d+)\\.|\\((\\d+)\\))(?:\\s|$)/) || preview.match(/^\\s*(?:\\[\\^(\\d+)\\]:|(\\d+)\\.|\\((\\d+)\\))(?:\\s|$)/);
      return bodyMatch?.[1] || bodyMatch?.[2] || bodyMatch?.[3] || "";
    }

    function annotationRegexSource(candidate) {
      if (candidate.regexSource) {
        return candidate.regexSource;
      }
      return (candidate.lineType || "注释引用") === "注释正文"
        ? "^\\s*\\d+\\.\\s+.+"
        : "<sup>(\\d+)</sup>";
    }

    function annotationPairId(candidate) {
      return annotationPairsByCandidateId.get(candidate.id)?.pairId || "未匹配";
    }

    function annotationIsMatched(candidate) {
      const pair = annotationPairsByCandidateId.get(candidate.id);
      return Boolean(pair?.refCandidateId && pair?.bodyCandidateId);
    }

    function titleLineType(candidate) {
      const options = MODULE_LINE_TYPES["标题"];
      return options.includes(candidate.lineType) ? candidate.lineType : originalTitleLineType(candidate);
    }

    function originalTitleLineType(candidate) {
      const raw = String(candidate.raw || "").trim();
      const preview = String(candidate.preview || "").trim();
      const match = preview.match(/^(#{1,6})\\s+/) || raw.match(/^(#{1,6})\\s+/);
      if (!match) {
        return "非标题";
      }
      return ["一级", "二级", "三级", "四级", "五级", "六级"][match[1].length - 1] || "非标题";
    }

    function plainHead(label) {
      const element = document.createElement("span");
      element.textContent = label;
      return element;
    }

    function selectAllHead(rows) {
      const cell = document.createElement("span");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "table-select-all";
      const selectedCount = rows.filter((row) => selectedRowIds.has(row.id)).length;
      checkbox.checked = rows.length > 0 && selectedCount === rows.length;
      checkbox.indeterminate = selectedCount > 0 && selectedCount < rows.length;
      checkbox.title = "全选或取消当前表格中的行";
      checkbox.addEventListener("click", (event) => {
        event.stopPropagation();
        if (checkbox.checked) {
          rows.forEach((row) => setRowSelection(row.id, true));
          workingRowId = rows.at(-1)?.id || null;
          return;
        }
        selectedRowIds.clear();
        workingRowId = null;
        checkboxById.forEach((rowCheckbox) => { rowCheckbox.checked = false; });
        rowById.forEach((row) => row.classList.remove("selected"));
        updateSelectedCount();
        updateSelectAllCheckbox();
      });
      cell.append(checkbox);
      return cell;
    }

    function updateSelectedCount() {
      const count = document.getElementById("selected-count");
      if (count) {
        count.textContent = "已选 " + selectedRowIds.size;
      }
    }

    function updateSelectAllCheckbox() {
      const checkbox = document.querySelector(".table-select-all");
      if (!checkbox) {
        return;
      }
      const visibleIds = Array.from(checkboxById.keys());
      const selectedCount = visibleIds.filter((id) => selectedRowIds.has(id)).length;
      checkbox.checked = visibleIds.length > 0 && selectedCount === visibleIds.length;
      checkbox.indeterminate = selectedCount > 0 && selectedCount < visibleIds.length;
    }

    function sortHead(label, key) {
      const cell = document.createElement("span");
      const wrap = document.createElement("label");
      wrap.className = "sort-head";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = sortRules.some((rule) => rule.key === key);
      checkbox.addEventListener("click", (event) => {
        event.stopPropagation();
        setSortEnabled(key, checkbox.checked);
      });
      const labelText = document.createElement("span");
      labelText.textContent = label;
      const direction = smallButton(sortDirection(key) === "desc" ? "↓" : "↑", (event) => {
        event.stopPropagation();
        toggleSortDirection(key);
      });
      direction.classList.add("sort-dir");
      wrap.append(checkbox, labelText, direction);
      cell.append(wrap);
      return cell;
    }

    function setSortEnabled(key, enabled) {
      sortRulesConfigured = true;
      const index = sortRules.findIndex((rule) => rule.key === key);
      if (enabled && index < 0) {
        // The most recently selected column is the primary key. Earlier checked
        // columns remain as deterministic secondary keys.
        sortRules.unshift({ key, direction: "asc" });
      }
      if (!enabled && index >= 0) {
        sortRules.splice(index, 1);
      }
      persistViewState();
      render();
    }

    function toggleSortDirection(key) {
      sortRulesConfigured = true;
      let rule = sortRules.find((entry) => entry.key === key);
      if (!rule) {
        rule = { key, direction: "desc" };
        sortRules.unshift(rule);
      } else {
        rule.direction = rule.direction === "asc" ? "desc" : "asc";
      }
      persistViewState();
      render();
    }

    function sortDirection(key) {
      return sortRules.find((rule) => rule.key === key)?.direction || "asc";
    }

    function getSortedRows(rows) {
      if (!sortRules.length) {
        return rows;
      }
      return rows
        .map((row, index) => ({ row, index }))
        .sort((left, right) => {
          for (const rule of sortRules) {
            const comparison = compareSortValue(sortValue(left.row, rule.key), sortValue(right.row, rule.key));
            if (comparison !== 0) {
              return rule.direction === "desc" ? -comparison : comparison;
            }
          }
          return left.index - right.index;
        })
        .map((entry) => entry.row);
    }

    function sortValue(candidate, key) {
      if (key === "line") {
        return candidate.range.line + 1;
      }
      if (key === "blockIndex") {
        return textBlockNumber(candidate);
      }
      if (key === "sentenceIndex") {
        return sentenceNumber(candidate);
      }
      if (key === "endLine") {
        return (candidate.range.endLine ?? candidate.range.line) + 1;
      }
      if (key === "blockType") {
        return candidate.lineType || "";
      }
      if (key === "annotationNumber") {
        const number = annotationNumber(candidate);
        return number ? Number(number) : Number.MAX_SAFE_INTEGER;
      }
      if (key === "annotationPairOrder") {
        return annotationPairSortOrder.get(candidate.id) ?? Number.MAX_SAFE_INTEGER;
      }
      if (key === "annotationMatched") {
        return annotationIsMatched(candidate) ? 1 : 0;
      }
      if (key === "pairId") {
        return annotationPairSortOrder.get(candidate.id) ?? Number.MAX_SAFE_INTEGER;
      }
      if (key === "annotationRole") {
        return candidate.lineType === "注释引用" ? 0 : candidate.lineType === "注释正文" ? 1 : 2;
      }
      if (key === "sourcePath") {
        return candidate.sourcePath || "";
      }
      if (key === "regexSource") {
        return annotationRegexSource(candidate);
      }
      if (key === "lineType") {
        return moduleActionConfig().value(candidate);
      }
      if (key === "typeLabel") {
        return candidate.typeLabel || "未分类";
      }
      if (key === "chapterFile") {
        return candidate.chapterFile || "";
      }
      if (key === "localPath") {
        return candidate.localPath || "";
      }
      if (key === "replacement") {
        return candidate.replacement || "";
      }
      if (key === "translationText") {
        return candidate.translationText || candidate.raw;
      }
      if (key === "translation") {
        return candidate.translation || "";
      }
      if (key === "restoredTranslation") {
        return candidate.restoredTranslation || "";
      }
      return candidate[key] || "";
    }

    function compareSortValue(left, right) {
      if (typeof left === "number" && typeof right === "number") {
        return left - right;
      }
      return String(left).localeCompare(String(right), "zh-CN", { numeric: true, sensitivity: "base" });
    }

    function tableToolbar() {
      const toolbar = document.createElement("div");
      toolbar.className = "table-toolbar";
      const count = document.createElement("span");
      count.id = "selected-count";
      count.textContent = "已选 0";
      const action = moduleActionConfig();
      const select = optionSelect(action.defaultValue, action.options, (value) => {
        const ids = Array.from(selectedRowIds);
        if (!ids.length) {
          return;
        }
        post(action.command, { ids, [action.payloadKey]: value });
      });
      toolbar.append(...[
        count,
        text(action.toolbarLabel),
        select,
        activeModule === "注释"
          ? smallButton(annotationAutoMatch ? "刷新匹配" : "自动匹配", () => {
              annotationAutoMatch = true;
              sortRulesConfigured = false;
              annotationMatchSortInitialized = true;
              sortRules.splice(0, sortRules.length,
                { key: "annotationMatched", direction: "asc" },
                { key: "annotationPairOrder", direction: "asc" },
                { key: "line", direction: "asc" },
              );
              persistViewState();
            render();
          })
          : null,
        activeModule === "注释" ? annotationUnmatchedFilterControl() : null,
        activeModule === "注释"
          ? smallButton("同步工作稿修正", () => post("syncWorkingCopyCorrections"))
          : null,
        activeModule === "注释"
          ? smallButton("确认所选配对", () => {
              const ids = Array.from(selectedRowIds);
              if (ids.length) post("confirmAnnotationPairs", { ids });
            })
          : null,
        activeModule === "注释"
          ? smallButton("分配到章节文件", () => post("assignAnnotationsToChapters"))
          : null,
        activeModule === "标题"
          ? smallButton("设置章节文件", () => setSelectedTitleChapterFile())
          : null,
        activeModule === "图片"
          ? smallButton(imageDownloadRunning ? "正在下载" : "下载图片", () => downloadSelectedImages())
          : null,
        activeModule === "图片" ? imageDownloadProgressElement() : null,
        activeModule === "拼写检查"
          ? smallButton(
              rowsForModule("拼写检查").length ? "重新扫描并定位" : "扫描拼写",
              () => post("scanSpelling"),
            )
          : null,
        activeModule === "拼写检查"
          ? smallButton("加入术语白名单", () => {
              const ids = Array.from(selectedRowIds);
              if (ids.length) post("addSpellTermsToWhitelist", { ids });
            })
          : null,
        smallButton("重新加载标定", () => post("reloadAnnotations")),
        smallButton("忽略所选", () => {
          const ids = Array.from(selectedRowIds);
          if (!ids.length) {
            return;
          }
          post("setRowsType", { ids, typeLabel: "ignore" });
        }),
        smallButton("保存标定", () => post("saveAnnotations")),
        smallButton("打开订正工作稿", () => post("openCorrectedWorkingCopy")),
        smallButton("输出订正文件", () => post("exportCorrectedMarkdown"), "primary"),
      ].filter(Boolean));
      return toolbar;
    }

    function annotationUnmatchedFilterControl() {
      const label = document.createElement("label");
      label.className = "checkbox-row";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = annotationOnlyUnmatched;
      checkbox.addEventListener("change", () => {
        captureTableContext();
        annotationOnlyUnmatched = checkbox.checked;
        selectedRowIds.clear();
        lastSelectedIndex = -1;
        persistViewState();
        render();
      });
      label.append(checkbox, document.createTextNode("仅显示未匹配"));
      return label;
    }

    function downloadSelectedImages() {
      if (imageDownloadRunning) {
        return;
      }
      const rows = getSortedRows(rowsForModule("图片"));
      const selectedRows = rows.filter((row) => selectedRowIds.has(row.id));
      if (!selectedRows.length) {
        imageDownloadProgress = {
          phase: "complete",
          completed: 0,
          total: 0,
          current: "请先在第一列勾选要下载的图片。",
          failed: 0,
        };
        updateImageDownloadProgress();
        return;
      }
      imageDownloadRunning = true;
      imageDownloadProgress = {
        phase: "downloading",
        completed: 0,
        total: selectedRows.length,
        current: "准备下载图片...",
        failed: 0,
      };
      updateImageDownloadProgress();
      post("downloadImages", { ids: selectedRows.map((row) => row.id) });
    }

    function imageDownloadProgressElement() {
      const element = document.createElement("div");
      element.id = "image-download-progress";
      element.className = "download-progress";
      renderImageDownloadProgress(element);
      return element;
    }

    function updateImageDownloadProgress() {
      const element = document.getElementById("image-download-progress");
      if (element) {
        renderImageDownloadProgress(element);
      }
      const toolbarButton = Array.from(document.querySelectorAll(".table-toolbar button"))
        .find((button) => button.textContent === "下载图片" || button.textContent === "正在下载");
      if (toolbarButton) {
        toolbarButton.textContent = imageDownloadRunning ? "正在下载" : "下载图片";
        toolbarButton.disabled = imageDownloadRunning;
      }
    }

    function renderImageDownloadProgress(element) {
      if (!imageDownloadProgress) {
        element.textContent = "";
        return;
      }
      const progress = document.createElement("progress");
      progress.max = Math.max(imageDownloadProgress.total || 1, 1);
      progress.value = Math.min(imageDownloadProgress.completed || 0, progress.max);
      const label = document.createElement("span");
      const prefix = imageDownloadProgress.phase === "complete" ? "下载完成" : "下载中";
      label.textContent = prefix + " " + (imageDownloadProgress.completed || 0) + " / " + imageDownloadProgress.total + " · " + (imageDownloadProgress.current || "");
      element.classList.toggle("error", Boolean(imageDownloadProgress.lastError));
      element.replaceChildren(progress, label);
      if (imageDownloadProgress.lastError) {
        element.title = imageDownloadProgress.lastError;
      } else {
        element.removeAttribute("title");
      }
    }

    function setSelectedTitleChapterFile() {
      const sortedRows = getSortedRows(rowsForModule("标题"));
      const selectedRows = sortedRows.filter((row) => selectedRowIds.has(row.id));
      if (!selectedRows.length) {
        return;
      }

      openChapterNumberModal(selectedRows);
    }

    function applyChapterFiles(selectedRows, chapterNumber, modeName) {
      const trimmedNumber = chapterNumber.trim();
      // The modal owns DOM focus at this point. Restore the selected work row
      // after the table redraw instead of reviving an unrelated old control.
      focusState = null;
      // The chapter assignment is complete once submitted. Clear the batch
      // selection while retaining the last selected work row for redraw.
      selectedRowIds.clear();
      workingRowId = selectedRows.at(-1)?.id || workingRowId;
      lastSelectedIndex = -1;
      if (modeName === "same") {
        const chapterFile = trimmedNumber + " " + titleTextForChapterFile(selectedRows[0]) + ".md";
        post("setRowsChapterFile", {
          ids: selectedRows.map((row) => row.id),
          chapterFile,
        });
        return;
      }

      const chapterFiles = {};
      if (modeName === "offset") {
        const offset = Number.parseInt(trimmedNumber, 10);
        selectedRows.forEach((row) => {
          const current = chapterFileParts(row);
          if (!current) return;
          const shifted = String(current.number + offset).padStart(current.width, "0");
          chapterFiles[row.id] = shifted + " " + current.title + ".md";
        });
      } else {
        const numberWidth = trimmedNumber.length;
        const startingNumber = Number.parseInt(trimmedNumber, 10);
        selectedRows.forEach((row, index) => {
          const sequenceNumber = String(startingNumber + index).padStart(numberWidth, "0");
          chapterFiles[row.id] = sequenceNumber + " " + titleTextForChapterFile(row) + ".md";
        });
      }
      post("setRowsChapterFiles", { chapterFiles });
    }

    function openChapterNumberModal(selectedRows) {
      closeModal();
      const recommendedStart = recommendedChapterStartNumber();

      const backdrop = document.createElement("div");
      backdrop.className = "modal-backdrop";
      backdrop.id = "chapter-number-modal";
      const modal = document.createElement("div");
      modal.className = "modal";
      const title = document.createElement("h2");
      title.textContent = "设置章节文件";
      const description = document.createElement("p");
      description.textContent = "统一序号会归入同一章节；依次递增会创建独立章节；整体偏移会在现有章节序号上统一加减。";
      const mode = document.createElement("select");
      mode.className = "type-select";
      mode.innerHTML = "<option value='same'>统一序号</option><option value='sequence'>从起始序号依次递增</option><option value='offset'>整体偏移</option>";
      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = "推荐起始编号：" + recommendedStart + "（可修改）";
      input.inputMode = "numeric";
      input.autocomplete = "off";
      const preview = document.createElement("p");
      const actions = document.createElement("div");
      actions.className = "modal-actions";
      const cancel = button("取消", () => closeModal());
      const confirm = button("确认", () => {
        input.setCustomValidity("");
        const isOffset = mode.value === "offset";
        const value = input.value.trim() || (isOffset ? "" : recommendedStart);
        if (isOffset && !/^[+-]\\d+$/.test(value)) {
          input.setCustomValidity("请输入 +数字 或 -数字，例如 +2、-3。");
          input.reportValidity();
          input.focus();
          return;
        }
        if (!isOffset && !/^\\d+$/.test(value)) {
          input.setCustomValidity("请输入数字章节序号。");
          input.reportValidity();
          input.focus();
          return;
        }
        if (isOffset) {
          const offset = Number.parseInt(value, 10);
          const invalidRows = selectedRows.filter((row) => {
            const current = chapterFileParts(row);
            return !current || current.number + offset < 0;
          });
          if (invalidRows.length) {
            input.setCustomValidity("所选行必须已有数字章节序号，且偏移后序号不能小于 0。");
            input.reportValidity();
            input.focus();
            return;
          }
        }
        applyChapterFiles(selectedRows, value, mode.value);
        closeModal();
      }, "primary");

      const updatePreview = () => {
        input.setCustomValidity("");
        const isOffset = mode.value === "offset";
        input.placeholder = isOffset
          ? "+数字代表输出序号整体增加；-数字代表输出序号整体减少"
          : "推荐起始编号：" + recommendedStart + "（可修改）";
        input.inputMode = isOffset ? "text" : "numeric";
        const value = input.value.trim() || (isOffset ? "" : recommendedStart);
        if (mode.value === "same") {
          preview.textContent = "章节文件：" + value + " " + titleTextForChapterFile(selectedRows[0]) + ".md（全部选中行）";
          return;
        }
        if (isOffset) {
          if (!/^[+-]\\d+$/.test(value)) {
            preview.textContent = "请输入整体偏移量，例如 +2 或 -3。";
            return;
          }
          const offset = Number.parseInt(value, 10);
          const first = chapterFileParts(selectedRows[0]);
          const last = chapterFileParts(selectedRows[selectedRows.length - 1]);
          if (!first || !last || first.number + offset < 0 || last.number + offset < 0) {
            preview.textContent = "所选标题需要已有有效章节序号，且偏移后不能小于 0。";
            return;
          }
          const firstNumber = String(first.number + offset).padStart(first.width, "0");
          const lastNumber = String(last.number + offset).padStart(last.width, "0");
          preview.textContent = "章节文件：" + firstNumber + " " + first.title + ".md；...；" + lastNumber + " " + last.title + ".md";
          return;
        }
        const first = value;
        const last = String(Number.parseInt(value, 10) + selectedRows.length - 1).padStart(value.length, "0");
        preview.textContent = "章节文件：" + first + " " + titleTextForChapterFile(selectedRows[0]) + ".md；...；" + last + " " + titleTextForChapterFile(selectedRows[selectedRows.length - 1]) + ".md";
      };
      input.addEventListener("input", updatePreview);
      mode.addEventListener("change", updatePreview);
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          confirm.click();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          closeModal();
        }
      });
      backdrop.addEventListener("click", (event) => {
        if (event.target === backdrop) {
          closeModal();
        }
      });

      actions.append(cancel, confirm);
      modal.append(title, description, mode, input, preview, actions);
      backdrop.append(modal);
      document.body.append(backdrop);
      updatePreview();
      setTimeout(() => input.focus(), 0);
    }

    function recommendedChapterStartNumber() {
      let highest = -1;
      let width = 2;
      rowsForModule("标题").forEach((row) => {
        const match = /^(\\d+)\\s+/.exec(String(row.chapterFile || "").trim());
        if (!match) {
          return;
        }
        highest = Math.max(highest, Number.parseInt(match[1], 10));
        width = Math.max(width, match[1].length);
      });
      return String(highest + 1).padStart(width, "0");
    }

    function closeModal() {
      document.getElementById("chapter-number-modal")?.remove();
    }

    function titleTextForChapterFile(candidate) {
      const source = String(candidate.raw || candidate.preview || "").trim();
      const textValue = source
        .replace(/^#{1,6}\\s+/, "")
        .replace(/<sup\\b[^>]*>[\\s\\S]*?<\\/sup>/gi, "")
        .replace(/<[^>]+>/g, "")
        .replace(/\\.md$/i, "")
        .replace(/[\\/\\\\:*?"<>|]/g, " ")
        .replace(/\\s+/g, " ")
        .trim();
      return textValue || "未命名章节";
    }

    function chapterFileParts(candidate) {
      const chapterFile = String(candidate.chapterFile || "").trim();
      const match = /^(\\d+)\\s+(.+?)(?:\\.md)?$/i.exec(chapterFile);
      if (!match) {
        return null;
      }
      return {
        number: Number.parseInt(match[1], 10),
        width: match[1].length,
        title: match[2].replace(/\\.md$/i, "").trim(),
      };
    }

    function moduleActionConfig() {
      if (activeModule === "未分类") {
        return {
          header: "分配模块",
          sortKey: "typeLabel",
          toolbarLabel: "分配到模块",
          options: TYPE_OPTIONS,
          defaultValue: "注释",
          command: "setRowsType",
          payloadKey: "typeLabel",
          value: (candidate) => rowModule(candidate),
        };
      }

      const options = MODULE_LINE_TYPES[activeModule] || ["候选"];
      return {
        header: "行类型",
        sortKey: "lineType",
        toolbarLabel: "批量设置行类型",
        options,
        defaultValue: options[0],
        command: "setRowsLineType",
        payloadKey: "lineType",
        value: (candidate) => {
          if (activeModule === "标题") {
            return titleLineType(candidate);
          }
          return candidate.lineType || options[0];
        },
      };
    }

    function optionSelect(value, options, onChange) {
      const select = document.createElement("select");
      select.className = "type-select";
      options.forEach((option) => {
        const element = document.createElement("option");
        element.value = option;
        element.textContent = option;
        element.selected = option === value;
        select.append(element);
      });
      select.addEventListener("click", (event) => event.stopPropagation());
      select.addEventListener("change", (event) => onChange(select.value, event));
      return select;
    }

    function selectRange(rows, fromIndex, toIndex, selected) {
      const start = Math.min(fromIndex, toIndex);
      const end = Math.max(fromIndex, toIndex);
      for (let index = start; index <= end; index += 1) {
        setRowSelection(rows[index].id, selected);
      }
    }

    function setRowSelection(id, selected) {
      if (selected) {
        selectedRowIds.add(id);
        workingRowId = id;
      } else {
        selectedRowIds.delete(id);
        if (workingRowId === id) {
          workingRowId = Array.from(selectedRowIds).at(-1) || null;
        }
      }
      const row = rowById.get(id);
      row?.classList.toggle("selected", selected);
      const checkbox = checkboxById.get(id);
      if (checkbox) {
        checkbox.checked = selected;
      }
      updateSelectedCount();
      updateSelectAllCheckbox();
    }

    function truncateText(value, maxLength) {
      const textValue = String(value);
      return textValue.length > maxLength ? textValue.slice(0, maxLength) + "..." : textValue;
    }

    function pairCard(pair) {
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = \`
        <h2>Pair \${escapeHtml(pair.label)}</h2>
        <div class="grid">
          <div>
            <h3>引用</h3>
            <p>原文：<code>\${escapeHtml(pair.ref?.raw || "缺失")}</code></p>
            <p>规范输出：<code>\${escapeHtml(pair.normalizedRef)}</code></p>
          </div>
          <div>
            <h3>正文</h3>
            <p>原文：<code>\${escapeHtml(pair.body?.raw || "缺失")}</code></p>
            <p>规范输出：<code>\${escapeHtml(pair.normalizedBody || "缺失")}</code></p>
          </div>
        </div>
        <h3>检查</h3>
        <p>编号一致：是</p>
        <p>ref 存在：\${pair.ref ? "是" : "否"}</p>
        <p>body 存在：\${pair.body ? "是" : "否"}</p>
        <p>状态：\${escapeHtml(pair.status)}</p>
      \`;
      card.append(inlineActions([
        button("定位 ref", () => post("locateRef", { id: pair.id })),
        button("定位 body", () => post("locateBody", { id: pair.id })),
        button("确认配对", () => post("confirmPair", { id: pair.id }), "primary"),
        button("标记异常", () => post("flagPair", { id: pair.id }), "danger"),
      ]));
      return card;
    }

    function suspiciousCard(candidate) {
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = \`
        <h2>疑似误判</h2>
        <p>原文：<code>\${escapeHtml(candidate.raw)}</code></p>
        <p>行号：\${candidate.range.line + 1}</p>
        <p>原因：\${escapeHtml(candidate.reason || "")}</p>
      \`;
      return card;
    }

    function button(label, onClick, variant = "") {
      const element = document.createElement("button");
      element.type = "button";
      element.className = variant;
      element.textContent = label;
      element.addEventListener("click", onClick);
      return element;
    }

    function smallButton(label, onClick) {
      const element = button(label, onClick);
      element.className = "small";
      return element;
    }

    function inlineActions(children) {
      const element = document.createElement("div");
      element.className = "inline-actions";
      element.append(...children);
      return element;
    }

    function text(value) {
      const element = document.createElement("p");
      element.textContent = value;
      return element;
    }

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    try {
      render();
    } catch (error) {
      app.insertAdjacentHTML("afterbegin", "<div class='card'><strong>数据表渲染错误：</strong> " + escapeHtml(error?.message || String(error)) + "</div>");
    }
  </script>
</body>
</html>`;
}

function renderInitialSearchTable(file: FileEntry, rows: Candidate[]): string {
  const body = [
    `<h1>搜索结果数据表</h1>`,
    `<p>${escapeHtmlText(file.label)}</p>`,
    `<div class="table-toolbar"><span>已选 0</span><span>批量设置类型</span></div>`,
  ];

  if (!rows.length) {
    body.push(`<p>当前搜索结果为空。</p>`);
    return body.join("");
  }

  body.push(`<div class="compact-grid">`);
  body.push(
    `<div class="compact-row compact-head"><span>选</span><span>#</span><span>匹配</span><span>预览</span><span>行号</span><span>类型</span><span>操作</span></div>`,
  );
  rows.forEach((candidate, index) => {
    body.push(
      `<div class="compact-row">` +
        `<span><input type="checkbox"></span>` +
        `<span>${index + 1}</span>` +
        `<code class="compact-hit">${escapeHtmlText(candidate.raw)}</code>` +
        `<span class="compact-preview">${escapeHtmlText(truncateTextForHtml(candidate.preview || "", 256))}</span>` +
        `<span>${candidate.range.line + 1}</span>` +
        `<span>${escapeHtmlText(candidate.typeLabel || "未分类")}</span>` +
        `<span><button class="small" type="button">定位</button></span>` +
      `</div>`,
    );
  });
  body.push(`</div>`);
  return body.join("");
}

function truncateTextForHtml(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function escapeHtmlText(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function baseCss(): string {
  return `
    * { box-sizing: border-box; }
    body {
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      margin: 0;
      padding: 8px;
    }
    h1 { font-size: 18px; margin: 0 0 8px; }
    h2 { font-size: 13px; margin: 14px 0 8px; }
    h3 { font-size: 12px; margin: 10px 0 6px; }
    p { margin: 6px 0; color: var(--vscode-descriptionForeground); }
    section { border-bottom: 1px solid var(--vscode-panel-border); padding: 8px 0; }
    .checkbox-row {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 8px 0;
      color: var(--vscode-foreground);
      cursor: pointer;
      user-select: none;
    }
    .checkbox-row input { margin: 0; }
    button {
      width: 100%;
      margin: 3px 0;
      padding: 6px 8px;
      color: var(--vscode-button-secondaryForeground);
      background: var(--vscode-button-secondaryBackground);
      border: 0;
      border-radius: 4px;
      text-align: left;
      cursor: pointer;
      overflow-wrap: anywhere;
    }
    button:hover { background: var(--vscode-button-secondaryHoverBackground); }
    button.primary {
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
    }
    button.primary:hover { background: var(--vscode-button-hoverBackground); }
    button.active { outline: 1px solid var(--vscode-focusBorder); }
    button.danger { color: var(--vscode-errorForeground); }
    button.muted { opacity: 0.58; }
    button.small { width: auto; padding: 3px 6px; margin-right: 4px; }
    button.mini { width: auto; padding: 3px 8px; font-size: 11px; text-align: center; }
    input {
      width: 100%;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 2px;
      padding: 5px 7px;
      outline: none;
    }
    input:focus { border-color: var(--vscode-focusBorder); }
    .search-panel { padding-top: 10px; }
    .sidebar-module-workspace { min-width: 0; }
    .sidebar-module-tabs { display: flex; flex-wrap: wrap; gap: 3px; margin: 8px 0; }
    .sidebar-module-tab { width: auto; margin: 0; padding: 4px 6px; font-size: 11px; }
    .sidebar-module-tab.active { outline: 1px solid var(--vscode-focusBorder); background: var(--vscode-list-activeSelectionBackground); }
    .sidebar-module-regex { display: grid; gap: 5px; margin-bottom: 8px; }
    .sidebar-module-regex .checkbox-row { margin: 0; font-size: 11px; }
    .sidebar-preset-list { display: grid; gap: 3px; padding: 6px 0; }
    .sidebar-preset-list button { margin: 0; padding: 4px 6px; font-size: 11px; }
    .sidebar-data-table { border-top: 1px solid var(--vscode-panel-border); max-height: 46vh; overflow: auto; }
    .sidebar-data-head, .sidebar-data-row { display: grid; grid-template-columns: 28px minmax(70px, 0.9fr) minmax(90px, 1.6fr) 38px; gap: 5px; align-items: center; }
    .sidebar-data-head { position: sticky; top: 0; z-index: 1; padding: 5px 2px; color: var(--vscode-descriptionForeground); background: var(--vscode-editor-background); font-size: 11px; font-weight: 600; }
    .sidebar-data-row { width: 100%; margin: 0; padding: 5px 2px; border-radius: 0; background: transparent; font-size: 11px; }
    .sidebar-data-row span, .sidebar-data-row code { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sidebar-data-row code { color: var(--vscode-textPreformat-foreground); font-family: var(--vscode-editor-font-family); }
    .scope-input { margin: 0 0 2px; font-family: var(--vscode-editor-font-family); }
    .scope-checkbox { margin: 4px 0 8px; font-size: 12px; }
    .search-input-row { display: grid; grid-template-columns: 1fr auto; gap: 4px; align-items: stretch; }
    .search-input { font-family: var(--vscode-editor-font-family); }
    .icon-toggle {
      width: 34px;
      margin: 0;
      padding: 0;
      text-align: center;
      font-family: var(--vscode-editor-font-family);
      font-weight: 600;
      border: 1px solid var(--vscode-input-border, transparent);
      background: var(--vscode-input-background);
    }
    .icon-toggle.active {
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
    }
    .search-toolbar { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .search-meta { margin-top: 6px; color: var(--vscode-descriptionForeground); font-size: 11px; }
    .preset-dropdown {
      margin-top: 6px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 3px;
      background: var(--vscode-sideBar-background);
    }
    .preset-dropdown summary {
      cursor: pointer;
      padding: 5px 7px;
      color: var(--vscode-descriptionForeground);
      user-select: none;
    }
    .preset-list { border-top: 1px solid var(--vscode-panel-border); padding: 3px; }
    .preset-item {
      display: grid;
      grid-template-columns: 1fr;
      gap: 2px;
      width: 100%;
      margin: 0;
      padding: 6px;
      background: transparent;
      border-radius: 2px;
      color: var(--vscode-foreground);
      text-align: left;
    }
    .preset-item:hover { background: var(--vscode-list-hoverBackground); }
    .preset-label { font-weight: 600; }
    .preset-description {
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      line-height: 1.35;
    }
    .result-group { padding-top: 8px; }
    .result-heading {
      color: var(--vscode-sideBarSectionHeader-foreground);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0;
      margin-bottom: 4px;
    }
    .search-result {
      display: grid;
      grid-template-columns: 42px 1fr;
      gap: 6px;
      align-items: start;
      margin: 0;
      padding: 4px 6px;
      border-radius: 2px;
      background: transparent;
      color: var(--vscode-foreground);
    }
    .search-result:hover { background: var(--vscode-list-hoverBackground); }
    .line-no { color: var(--vscode-descriptionForeground); font-variant-numeric: tabular-nums; }
    .result-body { min-width: 0; display: grid; gap: 2px; }
    .result-raw {
      color: var(--vscode-editor-findMatchForeground, var(--vscode-foreground));
      background: var(--vscode-editor-findMatchBackground);
      border-radius: 2px;
      padding: 0 2px;
      width: fit-content;
      max-width: 100%;
      overflow-wrap: anywhere;
    }
    .result-preview {
      color: var(--vscode-descriptionForeground);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .suspicious-row { margin-bottom: 8px; }
    .reason, .empty-line { color: var(--vscode-descriptionForeground); font-size: 12px; padding: 3px 6px; }
    .pair-chip {
      padding: 3px 6px;
      color: var(--vscode-descriptionForeground);
      border-radius: 2px;
    }
    code {
      background: var(--vscode-textCodeBlock-background);
      border-radius: 3px;
      padding: 1px 3px;
      overflow-wrap: anywhere;
    }
    .pill {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      padding: 6px 8px;
      overflow-wrap: anywhere;
    }
    .row-block { margin-bottom: 8px; }
    .inline-actions { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
    .inline-actions button { width: auto; }
  `;
}

function escapeScriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}
