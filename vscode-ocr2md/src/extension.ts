import * as http from "http";
import * as https from "https";
import * as path from "path";
import * as vscode from "vscode";
import { SentenceSplitterSyntax, split as splitSentences } from "sentence-splitter";
import {
  buildFootnotePairs,
  scanFootnoteBodies,
  scanFootnoteRefs,
  scanIllegalLineBreakCandidates,
  scanRegexMatches,
  scanSuspiciousSup,
} from "./scanner";
import { REGEX_PRESETS } from "./regexPresets";
import type { Candidate, FileEntry, FootnotePair, PairStatus, SidebarState, SourceRange, TranslationProtectedToken } from "./types";

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
  phase: "translating" | "complete";
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
  private readonly regexProvider: Ocr2mdRegexProvider;
  private pairPanel: vscode.WebviewPanel | undefined;
  private files: FileEntry[] = [];
  private selectedFile: FileEntry | undefined;
  private selectedFileText = "";
  private searchPattern = "";
  private readonlyUri: vscode.Uri | undefined;
  private previewEditable = false;
  private searchMatches: Candidate[] = [];
  private searchTableRows: Candidate[] = [];
  private sentenceRows: Candidate[] = [];
  private searchTableActive = false;
  private postOcrCleanMode = false;
  private imageDownloadProgress: ImageDownloadProgress | undefined;
  private deeplConfigured = false;
  private translationTestResult: TranslationTestResult | undefined;
  private translationProgress: TranslationProgress | undefined;
  private failedTranslationBlockIndexes = new Set<number>();
  private refs: Candidate[] = [];
  private bodies: Candidate[] = [];
  private suspicious: Candidate[] = [];
  private pairs: FootnotePair[] = [];
  private readonly singleDecoration: vscode.TextEditorDecorationType;
  private readonly refDecoration: vscode.TextEditorDecorationType;
  private readonly bodyDecoration: vscode.TextEditorDecorationType;
  private readonly headingDecorations: vscode.TextEditorDecorationType[];
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly context: vscode.ExtensionContext) {
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
    );
    this.regexProvider = new Ocr2mdRegexProvider(context.extensionUri, () => this.getSidebarState(), (message) =>
      this.handleSidebarMessage(message),
    );

    this.disposables.push(
      vscode.workspace.registerTextDocumentContentProvider(readonlyScheme, this.readonlyProvider),
      vscode.window.registerTreeDataProvider("ocr2md.directory", this.directoryProvider),
      vscode.window.registerWebviewViewProvider("ocr2md.regex", this.regexProvider),
      vscode.commands.registerCommand("ocr2md.refreshFiles", () => this.refreshFiles()),
      vscode.commands.registerCommand("ocr2md.pickFolder", () => this.pickWorkspaceFolder()),
      vscode.commands.registerCommand("ocr2md.openMarkdownFile", (filePath: string) => this.selectFile(filePath)),
      vscode.commands.registerCommand("ocr2md.installMarkdownPreviewStyles", () => this.installMarkdownPreviewStyles()),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.refreshFiles()),
      vscode.workspace.onDidSaveTextDocument((document) => this.handleSavedTextDocument(document)),
      this.singleDecoration,
      this.refDecoration,
      this.bodyDecoration,
      ...this.headingDecorations,
    );

    void this.refreshFiles();
  }

  dispose() {
    this.disposables.forEach((disposable) => disposable.dispose());
    this.pairPanel?.dispose();
  }

  private getSidebarState(): SidebarState {
    const workspaceLabel = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "未选择";
    return {
      workspaceLabel,
      selectedFile: this.selectedFile,
      previewEditable: this.previewEditable,
      files: this.files,
      searchPattern: this.searchPattern,
      searchMatches: this.searchMatches,
      regexPresets: REGEX_PRESETS,
      refs: this.refs,
      bodies: this.bodies,
      suspicious: this.suspicious,
      pairs: this.pairs,
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
          if (this.selectedFile) {
            this.scanSearchMatches();
          } else {
            this.regexProvider.update();
          }
        }
        break;
      case "addSearchResultsToTable":
        this.addSearchResultsToTable();
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
    }
  }

  private async refreshFiles() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      this.files = [];
      this.directoryProvider.refresh();
      this.regexProvider.update();
      return;
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
    await vscode.commands.executeCommand("vscode.openFolder");
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
    const vscodeDir = vscode.Uri.joinPath(workspaceFolder.uri, ".vscode");
    const styleUri = vscode.Uri.joinPath(workspaceFolder.uri, stylePath);
    await vscode.workspace.fs.createDirectory(vscodeDir);
    await vscode.workspace.fs.writeFile(styleUri, Buffer.from(markdownPreviewStyleCss(), "utf8"));

    const config = vscode.workspace.getConfiguration(undefined, workspaceFolder.uri);
    const currentStyles = config.get<string[]>("markdown.styles", []);
    const styleValue = styleUri.fsPath;
    const nextStyles = [
      ...currentStyles.filter((style) => style !== stylePath && style !== styleValue && style !== styleUri.toString()),
      styleValue,
    ];
    await config.update("markdown.styles", nextStyles, vscode.ConfigurationTarget.Workspace);
    await config.update("markdown.preview.breaks", true, vscode.ConfigurationTarget.Workspace);
    await config.update("markdown.preview.scrollPreviewWithEditor", true, vscode.ConfigurationTarget.Workspace);
    await config.update("markdown.preview.scrollEditorWithPreview", true, vscode.ConfigurationTarget.Workspace);

    if (!options.silent) {
      void vscode.window.showInformationMessage("ocr2md 已安装 Markdown 预览标题样式。插件会在重新打开预览时生效。");
    }
  }

  private async selectFile(filePath: string) {
    const file = this.files.find((entry) => entry.path === filePath) ?? {
      label: path.basename(filePath),
      path: filePath,
    };

    this.selectedFile = file;
    await this.reloadSelectedFileText();
    this.searchMatches = scanRegexMatches(this.selectedFileText, this.searchPattern);
    this.postOcrCleanMode = isOcrCorrectedMarkdown(this.selectedFileText);
    this.deeplConfigured = Boolean(await this.context.secrets.get("ocr2md.deeplApiKey"));
    const loadedSidecar = this.postOcrCleanMode ? undefined : await this.loadAnnotationSidecar(file);
    this.searchTableRows = this.postOcrCleanMode ? scanTextBlocks(this.selectedFileText) : loadedSidecar?.rows ?? [];
    this.sentenceRows = [];
    if (this.postOcrCleanMode) {
      const restoredTranslations = await this.loadTranslationSidecar(file);
      if (restoredTranslations.rows.length) {
        this.restoreSavedTranslations(restoredTranslations.rows);
      }
      if (restoredTranslations.error) {
        void vscode.window.showWarningMessage(`ocr2md 翻译加载失败：${restoredTranslations.error}`);
      }
    }
    this.searchTableActive = this.postOcrCleanMode || this.searchTableRows.length > 0;
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
    this.searchMatches = scanRegexMatches(this.selectedFileText, this.searchPattern);

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
      orientation: 0,
      groups: [
        {
          size: 0.6,
          orientation: 1,
          groups: [{ size: 0.56 }, { size: 0.44 }],
        },
        { size: 0.4 },
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

  private scanRefs() {
    if (!this.ensureFileSelected()) {
      return;
    }

    this.refs = scanFootnoteRefs(this.selectedFileText);
    this.suspicious = scanSuspiciousSup(this.selectedFileText);
    this.rebuildPairs();
  }

  private scanSearchMatches() {
    this.searchMatches = scanRegexMatches(this.selectedFileText, this.searchPattern);
    this.regexProvider.updateSearchResults();
  }

  private addSearchResultsToTable() {
    if (!this.ensureFileSelected()) {
      return;
    }

    const existingByKey = new Map(this.searchTableRows.map((candidate) => [tableRowKey(candidate), candidate]));
    const mergedRows = [...this.searchTableRows];

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

  private setSearchRowsType(ids: string[], typeLabel: string) {
    const selectedIds = new Set(ids);
    if (typeLabel === "ignore") {
      this.searchTableRows = this.searchTableRows.filter((candidate) => !selectedIds.has(candidate.id));
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
    this.searchTableRows = this.searchTableRows.map((candidate) =>
      selectedIds.has(candidate.id) || (candidate.typeLabel === "拼写检查" && selectedSpellings.has(spellingKey(candidate.raw)))
        ? { ...candidate, lineType }
        : candidate,
    );
    this.updatePairPanel();
  }

  private setSearchRowsChapterFile(ids: string[], chapterFile: string) {
    const selectedIds = new Set(ids);
    this.searchTableRows = this.searchTableRows.map((candidate) =>
      selectedIds.has(candidate.id) ? { ...candidate, chapterFile } : candidate,
    );
    this.updatePairPanel();
  }

  private setSearchRowReplacement(candidateId: string, replacement: string) {
    const target = this.searchTableRows.find((candidate) => candidate.id === candidateId);
    const targetSpelling = target?.typeLabel === "拼写检查" ? spellingKey(target.raw) : undefined;
    this.searchTableRows = this.searchTableRows.map((candidate) =>
      candidate.id === candidateId || (candidate.typeLabel === "拼写检查" && targetSpelling === spellingKey(candidate.raw))
        ? { ...candidate, replacement: replacement.trim() }
        : candidate,
    );
    this.updatePairPanel();
  }

  private async scanSpelling() {
    if (!this.ensureFileSelected()) {
      return;
    }

    try {
      const candidates = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: "ocr2md 正在扫描拼写错误", cancellable: false },
        async () => scanCSpellCandidates(this.selectedFileText, this.selectedFile!.path),
      );
      const existingByKey = new Map(
        this.searchTableRows
          .filter((candidate) => candidate.typeLabel === "拼写检查")
          .map((candidate) => [tableRowKey(candidate), candidate]),
      );
      const preservedCandidates = candidates.map((candidate) => {
        const previous = existingByKey.get(tableRowKey(candidate));
        return previous
          ? { ...candidate, lineType: previous.lineType, replacement: previous.replacement || candidate.replacement }
          : candidate;
      });
      this.searchTableRows = [
        ...this.searchTableRows.filter((candidate) => candidate.typeLabel !== "拼写检查"),
        ...preservedCandidates,
      ].sort(compareCandidatesByPosition);
      this.searchTableActive = true;
      this.updatePairPanel(undefined, undefined, true);
      void vscode.window.showInformationMessage(`ocr2md 拼写检查完成：发现 ${preservedCandidates.length} 个候选。`);
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

  private async reloadAnnotationsFromSidecar() {
    if (!this.selectedFile) {
      void vscode.window.showWarningMessage("请先选择一个 Markdown 文件。");
      return;
    }
    const loaded = await this.loadAnnotationSidecar(this.selectedFile);
    if (!loaded.loaded) {
      void vscode.window.showWarningMessage(loaded.error ? `标定恢复失败：${loaded.error}` : "尚未找到保存的标定文件。");
      return;
    }
    const transientSpellingRows = this.searchTableRows.filter((candidate) => candidate.typeLabel === "拼写检查");
    const restoredKeys = new Set(loaded.rows.map(tableRowKey));
    this.searchTableRows = [...loaded.rows, ...transientSpellingRows.filter((row) => !restoredKeys.has(tableRowKey(row)))].sort(compareCandidatesByPosition);
    this.searchTableActive = this.searchTableRows.length > 0;
    this.updatePairPanel(undefined, undefined, true);
    void vscode.window.showInformationMessage(`ocr2md 已恢复 ${loaded.rows.length} 条保存标定。`);
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
    void this.pairPanel?.webview.postMessage({ command: "imageDownloadProgress", progress });
  }

  private async saveAnnotationSidecar() {
    if (!this.selectedFile) {
      return;
    }

    const sidecar = {
      schemaVersion: 1,
      sourceFile: this.selectedFile.path,
      savedAt: new Date().toISOString(),
      rows: this.searchTableRows.map((candidate) => ({
        id: candidate.id,
        kind: candidate.kind,
        typeLabel: candidate.typeLabel ?? "未分类",
        lineType: candidate.lineType,
        chapterFile: candidate.chapterFile,
        localPath: candidate.localPath,
        suggestions: candidate.suggestions,
        replacement: candidate.replacement,
        label: candidate.label,
        raw: candidate.raw,
        preview: candidate.preview,
        line: candidate.range.line,
        start: candidate.range.start,
        endLine: candidate.range.endLine,
        end: candidate.range.end,
      })),
    };
    const uri = annotationSidecarUri(this.selectedFile);
    try {
      await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(sidecar, null, 2), "utf8"));
      void vscode.window.showInformationMessage(`ocr2md 标定已保存：${path.basename(uri.fsPath)}`);
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
      const sourceUri = vscode.Uri.file(this.selectedFile.path);
      const sourceText = Buffer.from(await vscode.workspace.fs.readFile(sourceUri)).toString("utf8");
      const sourceLines = sourceText.split(/\r?\n/);
      const chapters = buildChapterOutputSegments(this.searchTableRows, sourceLines.length);
      if (!chapters.length) {
        void vscode.window.showWarningMessage("请先在“标题”模块选择标题行，并通过“设置章节序号”为至少一个章节设置章节文件。");
        return;
      }

      const outputDirectory = vscode.Uri.joinPath(workspaceFolder.uri, "output");
      await vscode.workspace.fs.createDirectory(outputDirectory);
      const outputTimestamp = formatLocalIsoTimestamp(new Date());
      let applied = 0;
      let skipped = 0;
      let firstOutputUri: vscode.Uri | undefined;
      for (const chapter of chapters) {
        const chapterText = sourceLines.slice(chapter.startLine, chapter.endLine).join("\n");
        const chapterRows = this.searchTableRows
          .filter((row) => row.range.line >= chapter.startLine && row.range.line < chapter.endLine)
          .map((row) => shiftCandidateToChapter(row, chapter.startLine));
        const result = applyMarkdownCorrections(chapterText, chapterRows);
        const outputUri = vscode.Uri.joinPath(outputDirectory, chapter.fileName);
        const outputText = withOcrCorrectionFrontMatter(result.text, outputTimestamp);
        await vscode.workspace.fs.writeFile(outputUri, Buffer.from(outputText, "utf8"));
        firstOutputUri ??= outputUri;
        applied += result.applied;
        skipped += result.skipped.length;
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

  private async loadAnnotationSidecar(file: FileEntry): Promise<{ rows: Candidate[]; loaded: boolean; error?: string }> {
    const uri = annotationSidecarUri(file);
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      const payload = JSON.parse(Buffer.from(bytes).toString("utf8")) as AnnotationSidecar;
      if (payload.schemaVersion !== 1 || !Array.isArray(payload.rows)) {
        return { rows: [], loaded: false, error: "sidecar schema 不匹配" };
      }

      return {
        loaded: true,
        rows: payload.rows.map((row) => ({
        id: row.id,
        kind: row.kind ?? "regex",
        label: row.label,
        raw: row.raw,
        preview: row.preview,
        typeLabel: row.typeLabel ?? "未分类",
        lineType: row.lineType,
        chapterFile: row.chapterFile,
        localPath: row.localPath,
        suggestions: row.suggestions,
        replacement: row.replacement,
        range: {
          line: row.line,
          start: row.start,
          endLine: row.endLine,
          end: row.end,
        },
        status: "候选",
        })),
      };
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
      if (code === "FileNotFound" || code === "ENOENT") {
        return { rows: [], loaded: false };
      }
      return { rows: [], loaded: false, error: error instanceof Error ? error.message : String(error) };
    }
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

    await this.revealRanges({ single: candidate.range, target: candidate.range });
    this.updatePairPanel(candidate);
  }

  private async locateSourceCandidate(candidateId: string) {
    const candidate = this.findCandidate(candidateId);
    if (!candidate) {
      return;
    }
    // Only reveal the native source editor. Do not reload or scroll the Markdown preview pane.
    await this.revealRanges({ single: candidate.range, target: candidate.range });
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
        completed: index + 1,
        total: blockIndexes.length,
        current: label,
        failed: this.failedTranslationBlockIndexes.size,
      });
    }

    const failed = this.failedTranslationBlockIndexes.size;
    this.reportTranslationProgress({
      phase: "complete",
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
    void this.pairPanel?.webview.postMessage({ command: "translationProgress", progress });
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
      case "setRowsLineType":
        if (Array.isArray(message.ids) && typeof message.lineType === "string") {
          this.setSearchRowsLineType(message.ids, message.lineType);
        }
        break;
      case "setRowsChapterFile":
        if (Array.isArray(message.ids) && typeof message.chapterFile === "string") {
          this.setSearchRowsChapterFile(message.ids, message.chapterFile);
        }
        break;
      case "setSpellReplacement":
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
      case "addSpellTermsToWhitelist":
        if (Array.isArray(message.ids)) {
          await this.addSpellTermsToWhitelist(message.ids);
        }
        break;
      case "reloadAnnotations":
        await this.reloadAnnotationsFromSidecar();
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
    return uri.scheme === readonlyScheme || (!!this.selectedFile && uri.fsPath === this.selectedFile.path);
  }

  private updatePairPanel(selectedCandidate?: Candidate, selectedPairId?: string, reveal = false) {
    if (!this.selectedFile) {
      this.pairPanel?.dispose();
      this.pairPanel = undefined;
      return;
    }

    if (!this.pairPanel) {
      this.pairPanel = vscode.window.createWebviewPanel(
        "ocr2mdPairs",
        "ocr2md 数据表",
        vscode.ViewColumn.Three,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
        },
      );
      this.pairPanel.onDidDispose(() => {
        this.pairPanel = undefined;
      });
      this.pairPanel.webview.onDidReceiveMessage((message: WebviewMessage) => this.handlePairMessage(message));
    }

    this.pairPanel.title = this.postOcrCleanMode ? "ocr2md 文本块" : "ocr2md 数据表";

    if (reveal) {
      this.pairPanel.reveal(vscode.ViewColumn.Three, false);
    }

    const selectedPair =
      selectedPairId ??
      (selectedCandidate?.kind === "ref" || selectedCandidate?.kind === "body"
        ? `pair-${selectedCandidate.label}`
        : undefined);
    this.pairPanel.webview.html = renderPairHtml({
      file: this.selectedFile,
      searchTableActive: this.searchTableActive,
      postOcrCleanMode: this.postOcrCleanMode,
      searchRows: this.postOcrCleanMode ? [...this.searchTableRows, ...this.sentenceRows] : this.searchTableRows,
      imageDownloadProgress: this.imageDownloadProgress,
      deeplConfigured: this.deeplConfigured,
      translationTestResult: this.translationTestResult,
      translationProgress: this.translationProgress,
      failedTranslationBlockIndexes: [...this.failedTranslationBlockIndexes],
      pairs: this.pairs,
      selectedCandidate,
      selectedPairId: selectedPair,
    });
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
        new Ocr2mdDirectoryItem("未选择工作区", "empty", vscode.TreeItemCollapsibleState.None, {
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
    );
    if (!root.children.length) {
      root.children.push(
        new Ocr2mdDirectoryItem("未找到 Markdown 文件", "empty", vscode.TreeItemCollapsibleState.None, {
          command: "ocr2md.refreshFiles",
          title: "刷新",
        }),
      );
    }
    return [root];
  }
}

class Ocr2mdDirectoryItem extends vscode.TreeItem {
  readonly children: Ocr2mdDirectoryItem[] = [];

  constructor(
    label: string,
    readonly kind: "folder" | "file" | "empty",
    collapsibleState: vscode.TreeItemCollapsibleState,
    command?: vscode.Command,
  ) {
    super(label, collapsibleState);
    this.command = command;
    this.contextValue = kind;
    this.iconPath =
      kind === "folder"
        ? new vscode.ThemeIcon("folder")
        : kind === "file"
          ? new vscode.ThemeIcon("markdown")
          : new vscode.ThemeIcon("info");
  }
}

function buildDirectoryTree(rootLabel: string, files: FileEntry[], selectedFilePath: string | undefined): Ocr2mdDirectoryItem {
  const root = new Ocr2mdDirectoryItem(rootLabel, "folder", vscode.TreeItemCollapsibleState.Expanded);
  const folderMap = new Map<string, Ocr2mdDirectoryItem>([["", root]]);

  for (const file of files) {
    const parts = file.label.split(path.sep).filter(Boolean);
    let parentPath = "";
    let parent = root;

    parts.slice(0, -1).forEach((part) => {
      const nextPath = parentPath ? `${parentPath}${path.sep}${part}` : part;
      let folder = folderMap.get(nextPath);
      if (!folder) {
        folder = new Ocr2mdDirectoryItem(part, "folder", vscode.TreeItemCollapsibleState.Collapsed);
        folderMap.set(nextPath, folder);
        parent.children.push(folder);
      }
      parentPath = nextPath;
      parent = folder;
    });

    const filename = parts[parts.length - 1] ?? file.label;
    const item = new Ocr2mdDirectoryItem(filename, "file", vscode.TreeItemCollapsibleState.None, {
      command: "ocr2md.openMarkdownFile",
      title: "打开 Markdown 文件",
      arguments: [file.path],
    });
    item.description = file.path === selectedFilePath ? "当前" : undefined;
    item.tooltip = file.path;
    parent.children.push(item);
  }

  sortTree(root);
  return root;
}

function sortTree(item: Ocr2mdDirectoryItem) {
  item.children.sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === "folder" ? -1 : 1;
    }
    return String(left.label).localeCompare(String(right.label));
  });
  item.children.forEach(sortTree);
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

function translateWithDeepL(apiKey: string, text: string): Promise<string> {
  const body = new URLSearchParams({ text, source_lang: "EN", target_lang: "ZH" }).toString();
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
          if ((response.statusCode ?? 0) < 200 || (response.statusCode ?? 0) >= 300) {
            reject(new Error(`HTTP ${response.statusCode ?? 0}: ${responseText.slice(0, 300)}`));
            return;
          }
          try {
            const payload = JSON.parse(responseText) as { translations?: Array<{ text?: string }> };
            const translatedText = payload.translations?.[0]?.text;
            if (!translatedText) {
              reject(new Error("DeepL 返回中未包含 translations[0].text"));
              return;
            }
            resolve(translatedText);
          } catch (error) {
            reject(error instanceof Error ? error : new Error("无法解析 DeepL 返回内容"));
          }
        });
      },
    );
    request.on("error", reject);
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
    void this.view?.webview.postMessage({
      command: "searchResultsUpdated",
      state: this.getState(),
    });
  }
}

interface WebviewMessage {
  command?: string;
  id?: string;
  ids?: string[];
  path?: string;
  pattern?: string;
  typeLabel?: string;
  lineType?: string;
  chapterFile?: string;
  localPath?: string;
  suggestions?: string[];
  replacement?: string;
  translation?: string;
  apiKey?: string;
  text?: string;
  previewEditable?: boolean;
}

interface AnnotationSidecar {
  schemaVersion: number;
  sourceFile: string;
  savedAt: string;
  rows: AnnotationSidecarRow[];
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
  label: string;
  raw: string;
  preview: string;
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

function tableRowKey(candidate: Candidate): string {
  return `${candidate.range.line}:${candidate.range.start}:${candidate.range.endLine ?? candidate.range.line}:${candidate.range.end}:${candidate.raw}`;
}

function spellingKey(word: string): string {
  return word.trim().toLocaleLowerCase("en");
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
  const sentences = splitSentences(block.raw).filter((node) => node.type === SentenceSplitterSyntax.Sentence);
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
        id: `spelling-${line}-${rangeStart}-${raw}-${index}`,
        kind: "regex" as const,
        label: raw,
        raw,
        preview: lines[line]?.trim() ?? issue.line.text.trim(),
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
      id: `spelling-space-${line}-${start}-${raw}`,
      kind: "regex",
      label: raw,
      raw,
      preview: lines[line]?.trim() ?? raw,
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
  const normalized = suggestions.map((suggestion) => matchWordCapitalization(source, suggestion));
  return [...new Set(normalized)];
}

function shouldKeepSpellIssue(issue: { text: string; suggestions?: string[] }): boolean {
  const word = issue.text;
  if (isLikelyAcronym(word)) {
    return false;
  }
  if (!isTitleCaseWord(word)) {
    return true;
  }

  // Names are intentionally treated more conservatively than normal words.
  // Keep examples such as "Bufet" -> "Buffett", but suppress unknown names
  // whose dictionary suggestions are unrelated.
  return (issue.suggestions ?? []).some((suggestion) =>
    editDistance(word.toLocaleLowerCase("en"), suggestion.toLocaleLowerCase("en")) <= Math.max(2, Math.ceil(word.length * 0.25)),
  );
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
  return left.range.line - right.range.line || left.range.start - right.range.start || left.raw.localeCompare(right.raw);
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
  const baseName = path.basename(chapterFile.trim());
  const withoutTrailingDots = baseName.replace(/^\.+/, "").trim() || "未命名章节";
  return withoutTrailingDots.toLowerCase().endsWith(".md") ? withoutTrailingDots : `${withoutTrailingDots}.md`;
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

function applyMarkdownCorrections(sourceText: string, rows: Candidate[]): { text: string; applied: number; skipped: string[] } {
  const lines = sourceText.split(/\r?\n/);
  const skipped: string[] = [];
  let applied = 0;

  const spellingResult = applyConfirmedSpellingCorrections(lines, rows);
  applied += spellingResult.applied;
  skipped.push(...spellingResult.skipped);

  // These edits preserve line count, so the stored line positions remain valid
  // until the final pass that joins confirmed illegal line breaks.
  for (const row of rows) {
    if (row.typeLabel === "拼写检查") {
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
    const merged = mergeMarkdownLines(lines.slice(start, end + 1));
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
  const confirmed = rows
    .filter((row) => row.typeLabel === "拼写检查" && row.lineType === "已确认" && row.replacement?.trim())
    .sort((left, right) => right.range.line - left.range.line || right.range.start - left.range.start);
  const skipped: string[] = [];
  let applied = 0;

  for (const row of confirmed) {
    const line = lines[row.range.line];
    const replacement = row.replacement?.trim();
    if (line === undefined || !replacement) {
      skipped.push(row.id);
      continue;
    }
    let start = row.range.start;
    if (line.slice(start, start + row.raw.length) !== row.raw) {
      start = closestTextIndex(line, row.raw, row.range.start);
    }
    if (start < 0) {
      skipped.push(row.id);
      continue;
    }
    lines[row.range.line] = `${line.slice(0, start)}${replacement}${line.slice(start + row.raw.length)}`;
    applied += 1;
  }
  return { applied, skipped };
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
    const supPattern = new RegExp(`<sup>\\s*${escapeRegex(annotationNumber)}\\s*</sup>`, "i");
    return supPattern.test(line) ? line.replace(supPattern, `[^${annotationNumber}]`) : undefined;
  }
  if (row.lineType === "注释正文") {
    const bodyPattern = new RegExp(`^(\\s*)${escapeRegex(annotationNumber)}\\.\\s+(.+)$`);
    const match = line.match(bodyPattern);
    return match ? `${match[1]}[^${annotationNumber}]: ${match[2]}` : undefined;
  }
  return undefined;
}

function isAnnotationLineType(lineType: string | undefined): lineType is "注释引用" | "注释正文" {
  return lineType === "注释引用" || lineType === "注释正文";
}

function withDefaultLineType(row: Candidate): Candidate {
  return row.typeLabel === "注释" && !row.lineType ? { ...row, lineType: "注释引用" } : row;
}

function resolveAnnotationLineIndex(lines: string[], row: Candidate): number {
  const expectedNumber = annotationNumberForRow(row);
  const expectedPattern = row.lineType === "注释引用"
    ? expectedNumber ? new RegExp(`<sup>\\s*${escapeRegex(expectedNumber)}\\s*</sup>`, "i") : /<sup>\s*\d+\s*<\/sup>/i
    : expectedNumber ? new RegExp(`^\\s*${escapeRegex(expectedNumber)}\\.\\s+`) : /^\s*\d+\.\s+/;

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
  const supMatch = /<sup>\s*(\d+)\s*<\/sup>/i.exec(row.raw);
  if (supMatch) {
    return supMatch[1];
  }
  const bodyMatch = /^\s*(\d+)\.(?:\s|$)/.exec(row.raw);
  if (bodyMatch) {
    return bodyMatch[1];
  }
  if (/^\d+$/.test(row.label)) {
    return row.label;
  }
  const lineSupMatch = line ? /<sup>\s*(\d+)\s*<\/sup>/i.exec(line) : undefined;
  if (lineSupMatch) {
    return lineSupMatch[1];
  }
  const lineBodyMatch = line ? /^\s*(\d+)\.\s+/.exec(line) : undefined;
  return lineBodyMatch?.[1];
}

function replaceExactText(line: string, source: string, replacement: string): string | undefined {
  const index = line.indexOf(source);
  return index >= 0 ? `${line.slice(0, index)}${replacement}${line.slice(index + source.length)}` : undefined;
}

function mergeMarkdownLines(sourceLines: string[]): string | undefined {
  const nonEmpty = sourceLines.map((line) => line.trim()).filter(Boolean);
  if (nonEmpty.length < 2) {
    return undefined;
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

function markdownPreviewStyleCss(): string {
  return `body {
  font-family: "PingFang SC", "Microsoft YaHei", "Inter", sans-serif;
  line-height: 1.7;
  padding: 16px 28px;
}

h1 {
  color: #ff5c57;
  font-size: 2.2em;
  border-bottom: 3px solid #ff5c57;
  padding-bottom: 0.25em;
}

h2 {
  color: #ff9f43;
  font-size: 1.8em;
  border-bottom: 1px solid #d0d7de;
  padding-bottom: 0.2em;
}

h3 {
  color: #feca57;
  font-size: 1.45em;
}

h4 {
  color: #9ccc65;
  font-size: 1.25em;
}

h5 {
  color: #55c6a9;
  font-size: 1.1em;
}

h6 {
  color: #d77bbf;
  font-size: 1em;
  font-weight: 700;
}
`;
}

function renderSidebarHtml(state: SidebarState): string {
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
      updateSearchResults();
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
          !hasWorkspace ? button("选择工作文件夹", () => post("pickFolder"), "primary") : null,
          !hasWorkspace ? text("请先选择包含 OCR Markdown 文件的目录") : null,
        ]),
      );

      if (!hasWorkspace) return;

      if (!selectedFile) {
        app.append(section("搜索", [
          text("请先在上方“目录”中选择一个 Markdown 文件。"),
        ]));
        return;
      }

      app.append(searchPanel());
      app.append(actionBar());
      app.append(resultSlot("search-results"));
      updateSearchResults();
    }

    function updateSearchResults() {
      const slot = document.getElementById("search-results");
      if (!slot) {
        return;
      }
      slot.innerHTML = "";
      slot.append(resultGroup("搜索结果", state.searchMatches, "regex"));
      const meta = document.getElementById("search-meta");
      if (meta) {
        const isIllegalBreakScan = state.searchMatches.some((candidate) => candidate.typeLabel === "非法断行");
        meta.textContent = isIllegalBreakScan
          ? "发现 " + state.searchMatches.length + " 个非法断行候选。候选不会修改原文，请加入数据表后人工确认。"
          : "匹配 " + state.searchMatches.length + " 处。正则只做通用候选搜索，不影响下方注释 Pair。";
      }
    }

    function searchPanel() {
      const element = document.createElement("section");
      element.className = "search-panel";

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

      element.append(inputRow, presetDropdown(), meta);
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
  pairs: FootnotePair[];
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
      min-width: 980px;
    }
    .table-scroll {
      max-height: calc(100vh - 230px);
      overflow: auto;
      border-radius: 6px;
      scrollbar-gutter: stable;
    }
    .text-block-table { min-width: 840px; table-layout: fixed; }
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
      grid-template-columns: 34px 48px minmax(90px, 0.7fr) minmax(220px, 2fr) 80px 150px 76px;
      align-items: center;
      gap: 8px;
      min-height: 34px;
      padding: 4px 8px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    .compact-grid.annotation-grid { min-width: 1120px; }
    .compact-row.annotation-row {
      grid-template-columns: 34px 48px 86px minmax(130px, 0.8fr) 80px 150px minmax(280px, 2fr);
    }
    .compact-grid.title-grid { min-width: 1320px; }
    .compact-row.title-row {
      grid-template-columns: 34px 48px minmax(130px, 0.8fr) minmax(260px, 1.8fr) 80px 130px minmax(220px, 1fr) 76px;
    }
    .compact-grid.image-grid { min-width: 1420px; }
    .compact-row.image-row {
      grid-template-columns: 34px 48px minmax(130px, 0.8fr) minmax(240px, 1.4fr) 80px 130px minmax(300px, 1.4fr) 76px;
    }
    .compact-grid.spell-grid { min-width: 1280px; }
    .compact-row.spell-row {
      grid-template-columns: 34px 48px 130px minmax(110px, 0.6fr) minmax(160px, 1fr) minmax(260px, 1.7fr) 80px 76px;
    }
    .spell-replacement-input {
      width: 100%;
      min-width: 0;
      box-sizing: border-box;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
      padding: 3px 5px;
    }
    .compact-row:last-child { border-bottom: 0; }
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
    .compact-row.title-mismatch {
      background: rgba(255, 159, 67, 0.18);
      outline: 1px solid rgba(255, 159, 67, 0.6);
      outline-offset: -1px;
    }
    .compact-row.title-mismatch:hover { background: rgba(255, 159, 67, 0.26); }
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
    const TEXT_BLOCK_TYPES = [
      "标题", "正文", "注释正文", "latex", "合成块",
      "合成.标记", "合成.图片", "合成.文本", "合成.callout", "合成.html",
      "latex.标记", "latex.代码",
    ];
    const MODULES = postOcrCleanMode ? ["文本块", "分句", "翻译设置"] : ["未分类", "注释", "标题", "图片", "非法断行", "拼写检查"];
    const TYPE_OPTIONS = [...MODULES, "ignore"];
    const MODULE_LINE_TYPES = {
      "注释": ["注释引用", "注释正文"],
      "标题": ["一级", "二级", "三级", "四级", "五级", "六级", "非标题"],
      "图片": ["图片引用", "图片说明", "图片正文"],
      "非法断行": ["断行候选", "需要合并", "保留断行"],
      "拼写检查": ["待确认", "已确认", "忽略", "latex"],
    };
    const SORT_COLUMNS = [
      { key: "raw", label: "匹配" },
      { key: "preview", label: "预览" },
      { key: "line", label: "行号" },
      { key: "typeLabel", label: "模块" },
    ];
    const selectedRowIds = new Set();
    const rowById = new Map();
    const checkboxById = new Map();
    const persistedViewState = vscode.getState?.() || {};
    const sortRules = Array.isArray(persistedViewState.sortRules) ? persistedViewState.sortRules : [];
    let sortRulesConfigured = persistedViewState.sortRulesConfigured === true;
    if (postOcrCleanMode && !sortRulesConfigured) {
      // Text blocks should initially follow the order in the source document.
      sortRules.splice(0, sortRules.length, { key: "line", direction: "asc" });
    } else if (!sortRulesConfigured && !sortRules.length) {
      sortRules.push({ key: "raw", direction: "asc" });
    }
    let activeModule = MODULES.includes(persistedViewState.activeModule)
      ? persistedViewState.activeModule
      : (postOcrCleanMode ? "文本块" : "未分类");
    let annotationAutoMatch = persistedViewState.annotationAutoMatch === true;
    let lastSelectedIndex = -1;
    let focusState = persistedViewState.focusState || null;
    let tableScrollState = persistedViewState.tableScrollState || null;
    let imageDownloadProgress = state.imageDownloadProgress || null;
    let imageDownloadRunning = imageDownloadProgress?.phase === "downloading";
    let translationProgress = state.translationProgress || null;
    let translationRunning = translationProgress?.phase === "translating";

    window.addEventListener("message", (event) => {
      if (event.data?.command === "imageDownloadProgress") {
        imageDownloadProgress = event.data.progress || null;
        imageDownloadRunning = imageDownloadProgress?.phase === "downloading";
        updateImageDownloadProgress();
        return;
      }
      if (event.data?.command === "translationProgress") {
        translationProgress = event.data.progress || null;
        translationRunning = translationProgress?.phase === "translating";
        updateTranslationProgress();
      }
    });

    function post(command, payload = {}) {
      captureTableContext();
      persistViewState();
      vscode.postMessage({ command, ...payload });
    }

    function persistViewState() {
      vscode.setState?.({
        activeModule,
        sortRules,
        sortRulesConfigured,
        annotationAutoMatch,
        focusState,
        tableScrollState,
      });
    }

    function captureTableContext() {
      const tableScroll = document.querySelector(".table-scroll");
      if (tableScroll) {
        tableScrollState = { top: tableScroll.scrollTop, left: tableScroll.scrollLeft };
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

      if (state.searchTableActive) {
        app.append(stickyControls());
        if (postOcrCleanMode && activeModule === "翻译设置") {
          app.append(translationSettingsPanel());
          restoreTableContext();
          return;
        }
        const rows = rowsForModule(activeModule);
        const sortedRows = getSortedRows(rows);
        app.append(rows.length ? tableScroll(searchTable(sortedRows)) : text("当前模块为空。"));
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
      const isSpellModule = activeModule === "拼写检查";
      const grid = document.createElement("div");
      grid.className = isAnnotationModule
        ? "compact-grid annotation-grid"
        : isTitleModule
          ? "compact-grid title-grid"
          : isImageModule
            ? "compact-grid image-grid"
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
            : isSpellModule
              ? "compact-row spell-row compact-head"
            : "compact-row compact-head";
      if (isAnnotationModule) {
        head.append(
          plainHead("选"),
          plainHead("#"),
          sortHead("注释号", "annotationNumber"),
          sortHead("匹配", "raw"),
          sortHead("行号", "line"),
          sortHead("行类型", "lineType"),
          sortHead("预览", "preview"),
        );
      } else if (isTitleModule) {
        head.append(
          plainHead("选"),
          plainHead("#"),
          sortHead("匹配", "raw"),
          sortHead("预览", "preview"),
          sortHead("行号", "line"),
          sortHead("行类型", "lineType"),
          sortHead("章节文件", "chapterFile"),
          plainHead("操作"),
        );
      } else if (isImageModule) {
        head.append(
          plainHead("选"),
          plainHead("#"),
          sortHead("匹配", "raw"),
          sortHead("预览", "preview"),
          sortHead("行号", "line"),
          sortHead("行类型", "lineType"),
          sortHead("本地路径", "localPath"),
          plainHead("操作"),
        );
      } else if (isSpellModule) {
        head.append(
          plainHead("选"),
          plainHead("#"),
          sortHead("状态", "lineType"),
          sortHead("原词", "raw"),
          sortHead("建议替换", "replacement"),
          sortHead("上下文", "preview"),
          sortHead("行号", "line"),
          plainHead("操作"),
        );
      } else {
        head.append(
          plainHead("选"),
          plainHead("#"),
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
          isSpellModule ? "spell-row" : "",
          isSpellModule ? spellModifiedClass(candidate) : "",
          titleMismatchClass(candidate),
          selectedRowIds.has(candidate.id) ? "selected" : "",
          matchClass,
        ].filter(Boolean).join(" ");
        row.dataset.rowId = candidate.id;
        rowById.set(candidate.id, row);
        const preview = truncateText(candidate.preview || "", 256);
        if (isAnnotationModule) {
          row.innerHTML = \`
            <span></span>
            <span>\${index + 1}</span>
            <span>\${escapeHtml(annotationNumber(candidate) || "未识别")}</span>
            <code class="compact-hit" title="\${escapeHtml(candidate.raw)}">\${escapeHtml(candidate.raw)}</code>
            <span>\${candidate.range.line + 1}</span>
            <span class="line-type-cell"></span>
            <span class="compact-preview" title="\${escapeHtml(candidate.preview || "")}">\${escapeHtml(preview)}</span>
          \`;
        } else if (isTitleModule) {
          row.innerHTML = \`
            <span></span>
            <span>\${index + 1}</span>
            <code class="compact-hit" title="\${escapeHtml(candidate.raw)}">\${escapeHtml(candidate.raw)}</code>
            <span class="compact-preview" title="\${escapeHtml(candidate.preview || "")}">\${escapeHtml(preview)}</span>
            <span>\${candidate.range.line + 1}</span>
            <span class="line-type-cell"></span>
            <span title="\${escapeHtml(candidate.chapterFile || "")}">\${escapeHtml(candidate.chapterFile || "")}</span>
            <span class="row-actions-cell"></span>
          \`;
        } else if (isImageModule) {
          row.innerHTML = \`
            <span></span>
            <span>\${index + 1}</span>
            <code class="compact-hit" title="\${escapeHtml(candidate.raw)}">\${escapeHtml(candidate.raw)}</code>
            <span class="compact-preview" title="\${escapeHtml(candidate.preview || "")}">\${escapeHtml(preview)}</span>
            <span>\${candidate.range.line + 1}</span>
            <span class="line-type-cell"></span>
            <code class="compact-preview" title="\${escapeHtml(candidate.localPath || "")}">\${escapeHtml(candidate.localPath || "")}</code>
            <span class="row-actions-cell"></span>
          \`;
        } else if (isSpellModule) {
          row.innerHTML = \`
            <span></span>
            <span>\${index + 1}</span>
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
        typeHolder.append(typeSelect);

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
          replacementInput.addEventListener("change", () => post("setSpellReplacement", { id: candidate.id, replacement: replacementInput.value }));
          replacementHolder.append(replacementInput, suggestionList);
        }

        const hitCell = row.querySelector(".compact-hit");
        const previewCell = row.querySelector(".compact-preview");
        hitCell.addEventListener("click", (event) => {
          event.stopPropagation();
          post(isSpellModule ? "locateSourceCandidate" : "selectCandidate", { id: candidate.id });
        });
        previewCell.addEventListener("click", (event) => {
          event.stopPropagation();
          post("selectCandidate", { id: candidate.id });
        });

        row.addEventListener("click", (event) => {
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
        if (!isAnnotationModule) {
          const actions = row.querySelector(".row-actions-cell");
          actions.append(smallButton("定位", (event) => { event.stopPropagation(); post("selectCandidate", { id: candidate.id }); }));
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
        typeSelect.addEventListener("change", () => post("setRowsLineType", { ids: [candidate.id], lineType: typeSelect.value }));
        row.querySelector(".text-block-type").append(typeSelect);
        row.querySelector(".text-block-content").textContent = truncateText(candidate.preview || candidate.raw, 256);
        row.addEventListener("click", () => post("locateSourceCandidate", { id: candidate.id }));
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
        row.innerHTML = "<td>" + sentenceDisplayId(candidate) + "</td><td>" + textBlockNumber(candidate) + "</td><td class='text-block-content sentence-translation-source'></td><td class='sentence-translation-cell'></td><td class='text-block-content sentence-restored-result'></td><td>" + (candidate.range.line + 1) + "</td><td>" + ((candidate.range.endLine ?? candidate.range.line) + 1) + "</td>";
        row.querySelector(".sentence-translation-source").textContent = truncateText(candidate.translationText || candidate.raw, 256);
        row.querySelector(".sentence-restored-result").textContent = truncateText(candidate.restoredTranslation || "", 256);
        const translationInput = document.createElement("textarea");
        translationInput.className = "sentence-translation-input";
        translationInput.value = candidate.translation || "";
        translationInput.placeholder = "粘贴翻译引擎返回的译文";
        translationInput.addEventListener("click", (event) => event.stopPropagation());
        translationInput.addEventListener("change", () => post("setSentenceTranslation", { id: candidate.id, translation: translationInput.value }));
        row.querySelector(".sentence-translation-cell").append(translationInput);
        row.addEventListener("click", () => post("locateSourceCandidate", { id: candidate.id }));
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
          );
          if (state.failedTranslationBlockIndexes.length) {
            const retryButton = smallButton("重试失败 (" + state.failedTranslationBlockIndexes.length + ")", () => post("retryFailedTextBlocks"));
            retryButton.disabled = translationRunning;
            controls.append(retryButton);
          }
          controls.append(translationProgressElement(), text("文本块按两个及以上连续换行分隔；翻译按块请求、按分句 ID 回填，源码不会修改。"));
        }
      } else {
        controls.append(moduleTabs(), moduleWorkPanel(), tableToolbar());
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
        button.textContent = translationRunning ? "正在翻译" : "翻译全部文本块";
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
      const prefix = translationProgress.phase === "complete" ? "翻译完成" : "翻译中";
      label.textContent = prefix + " " + (translationProgress.completed || 0) + " / " + translationProgress.total + " · " + (translationProgress.current || "");
      element.replaceChildren(progress, label);
      element.classList.toggle("error", Boolean(translationProgress.lastError));
      element.title = translationProgress.lastError || "";
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
          activeModule = moduleName;
          selectedRowIds.clear();
          lastSelectedIndex = -1;
          persistViewState();
          render();
        });
        tabs.append(tab);
      });
      return tabs;
    }

    function moduleWorkPanel() {
      const panel = document.createElement("div");
      panel.className = "module-work";
      const title = document.createElement("strong");
      title.textContent = activeModule + "模块";
      const detail = document.createElement("span");
      detail.textContent = " · " + moduleWorkText(activeModule);
      panel.append(title, detail);
      if (activeModule === "注释" && annotationAutoMatch) {
        const summary = document.createElement("span");
        summary.className = "match-summary";
        summary.textContent = annotationMatchSummary();
        panel.append(summary);
      }
      return panel;
    }

    function moduleWorkText(moduleName) {
      if (moduleName === "未分类") {
        return "多选行后通过分类下拉分配到目标模块。";
      }
      if (moduleName === "注释") {
        return "用于 footnote ref/body 的后续配对确认。";
      }
      if (moduleName === "标题") {
        return "用于后续标题层级确认。行类型与原文标题层级不一致时会着色提示，但不会修改源文件。";
      }
      if (moduleName === "图片") {
        return "用于后续图片引用和说明检查。";
      }
      if (moduleName === "非法断行") {
        return "用于后续断行异常确认。";
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
      panel.append(title, engineLabel, keyLabel, textLabel, testButton);

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
      return state.searchRows.filter((row) => rowModule(row) === moduleName);
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

    function annotationMatchSummary() {
      const match = annotationMatchInfo();
      return "匹配 " + match.matchedPairCount + " 组 / 未匹配 " + match.unmatchedIds.size + " 行";
    }

    function annotationMatchInfo() {
      const refs = new Map();
      const bodies = new Map();
      const unmatchedIds = new Set();
      const matchedIds = new Set();
      const rows = rowsForModule("注释");

      rows.forEach((row) => {
        const number = annotationNumber(row);
        if (!number) {
          unmatchedIds.add(row.id);
          return;
        }
        const lineType = row.lineType || "注释引用";
        const bucket = lineType === "注释正文" ? bodies : refs;
        const list = bucket.get(number) || [];
        list.push(row);
        bucket.set(number, list);
      });

      const numbers = new Set([...refs.keys(), ...bodies.keys()]);
      numbers.forEach((number) => {
        const refRows = refs.get(number) || [];
        const bodyRows = bodies.get(number) || [];
        if (refRows.length && bodyRows.length) {
          refRows.forEach((row) => matchedIds.add(row.id));
          bodyRows.forEach((row) => matchedIds.add(row.id));
          return;
        }
        refRows.forEach((row) => unmatchedIds.add(row.id));
        bodyRows.forEach((row) => unmatchedIds.add(row.id));
      });

      return {
        matchedIds,
        unmatchedIds,
        matchedPairCount: [...numbers].filter((number) => refs.has(number) && bodies.has(number)).length,
      };
    }

    function annotationNumber(candidate) {
      const raw = String(candidate.raw || "");
      const preview = String(candidate.preview || "");
      const textValue = raw || preview;
      const lineType = candidate.lineType || "注释引用";
      if (lineType === "注释正文") {
        const bodyMatch = textValue.match(/^\\s*(\\d+)\\.\\s+/) || preview.match(/^\\s*(\\d+)\\.\\s+/);
        return bodyMatch?.[1] || "";
      }
      const refMatch =
        textValue.match(/<(?:sup|sub)>\\s*(\\d+)\\s*<\\/(?:sup|sub)>/i) ||
        preview.match(/<(?:sup|sub)>\\s*(\\d+)\\s*<\\/(?:sup|sub)>/i) ||
        textValue.match(/^\\s*(\\d+)\\s*$/);
      return refMatch?.[1] || "";
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
              sortRules.splice(0, sortRules.length, { key: "annotationNumber", direction: "asc" }, { key: "line", direction: "asc" });
              persistViewState();
              render();
            })
          : null,
        activeModule === "标题"
          ? smallButton("设置章节序号", () => setSelectedTitleChapterFile())
          : null,
        activeModule === "图片"
          ? smallButton(imageDownloadRunning ? "正在下载" : "下载图片", () => downloadSelectedImages())
          : null,
        activeModule === "图片" ? imageDownloadProgressElement() : null,
        activeModule === "拼写检查"
          ? smallButton("扫描拼写", () => post("scanSpelling"))
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
        smallButton("输出订正文件", () => post("exportCorrectedMarkdown"), "primary"),
      ].filter(Boolean));
      return toolbar;
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

    function applyChapterNumber(selectedRows, chapterNumber) {
      const trimmedNumber = chapterNumber.trim();
      const firstTitle = titleTextForChapterFile(selectedRows[0]);
      const chapterFile = trimmedNumber + " " + firstTitle + ".md";
      post("setRowsChapterFile", {
        ids: selectedRows.map((row) => row.id),
        chapterFile,
      });
    }

    function openChapterNumberModal(selectedRows) {
      closeModal();

      const backdrop = document.createElement("div");
      backdrop.className = "modal-backdrop";
      backdrop.id = "chapter-number-modal";
      const modal = document.createElement("div");
      modal.className = "modal";
      const title = document.createElement("h2");
      title.textContent = "设置章节序号";
      const description = document.createElement("p");
      description.textContent = "将 " + selectedRows.length + " 行设置为同一个章节文件。";
      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = "例如 00 或 0002";
      input.autocomplete = "off";
      const preview = document.createElement("p");
      const actions = document.createElement("div");
      actions.className = "modal-actions";
      const cancel = button("取消", () => closeModal());
      const confirm = button("确认", () => {
        const value = input.value.trim();
        if (!value) {
          input.focus();
          return;
        }
        applyChapterNumber(selectedRows, value);
        closeModal();
      }, "primary");

      const updatePreview = () => {
        const value = input.value.trim() || "00";
        preview.textContent = "章节文件：" + value + " " + titleTextForChapterFile(selectedRows[0]) + ".md";
      };
      input.addEventListener("input", updatePreview);
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
      modal.append(title, description, input, preview, actions);
      backdrop.append(modal);
      document.body.append(backdrop);
      updatePreview();
      setTimeout(() => input.focus(), 0);
    }

    function closeModal() {
      document.getElementById("chapter-number-modal")?.remove();
    }

    function titleTextForChapterFile(candidate) {
      const source = String(candidate.raw || candidate.preview || "").trim();
      const textValue = source
        .replace(/^#{1,6}\\s+/, "")
        .replace(/\\.md$/i, "")
        .trim();
      return textValue || "未命名章节";
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
      } else {
        selectedRowIds.delete(id);
      }
      const row = rowById.get(id);
      row?.classList.toggle("selected", selected);
      const checkbox = checkboxById.get(id);
      if (checkbox) {
        checkbox.checked = selected;
      }
      const count = document.getElementById("selected-count");
      if (count) {
        count.textContent = "已选 " + selectedRowIds.size;
      }
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
