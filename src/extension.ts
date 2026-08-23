import * as http from "http";
import * as https from "https";
import * as path from "path";
import { createHash, randomUUID } from "crypto";
import * as vscode from "vscode";
import {
  applyChangeState,
  buildChapterBoundarySegments,
  mapLinesAfterEdit,
  mergeSequenceMarkdown,
  remapRangeLines,
  scanChapterBoundaryLines,
  type MergeInputText,
} from "./chapterBoundary";
import {
  annotationMatchSummary,
  buildAnnotationPairs,
  extractAnnotationNumber,
} from "./annotation";
import {
  activeCandidates,
  DELETED_LINE_TYPE,
  isDeletedCandidate,
  markCandidatesDeleted,
} from "./candidateLifecycle";
import { MODULE_REGEX_DEFAULTS, MODULE_REGEX_PRESETS } from "./regexPresets";
import {
  attachLineIdentity,
  attachScanIdentities,
  locateCandidate,
  reconcileRows,
} from "./rowIdentity";
import { detectImageLineType, imageRowsFromBlock, scanRegexMatches } from "./scanner";
import type {
  AnnotationPair,
  Candidate,
  FileEntry,
  ImageDownloadProgress,
  ModuleName,
  SidebarState,
  SourceRange,
} from "./types";
import { renderSidebar } from "./webview";
import {
  CHAPTER_BOUNDARY_WORKING_FILE,
  CHAPTER_CHANGED_PROPERTY,
  chapterContentsDiffer,
  chapterDiffBaseline,
  chapterOutputBaselinePath,
  chapterWorkingCopyPath,
  isChapterOutputPath,
  markdownFileKind,
  planChapterWorkingCopyInit,
  withChapterChangedFrontmatter,
} from "./workspaceFiles";

const MODULES: ModuleName[] = ["章节定界", "章节标题", "注释", "图片"];
const HEADING_COLORS = ["#ff5c57", "#ff9f43", "#feca57", "#9ccc65", "#55c6a9", "#d77bbf"];
/** Source on top, Markdown Preview below. Never include an empty group: VS Code closes those and the remaining pair becomes two columns. */
const STACKED_SOURCE_PREVIEW_LAYOUT = {
  orientation: 1,
  groups: [{ size: 1 / 2 }, { size: 1 / 2 }],
};

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(new Ocr2mdExtension());
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
  private workingCopySyncTimer: ReturnType<typeof setTimeout> | undefined;
  private imageDownloadProgress: ImageDownloadProgress | undefined;
  private readonly chapterDecorations: ChapterChangeDecorationProvider;

  constructor() {
    this.directoryProvider = new DirectoryProvider(
      () => vscode.workspace.workspaceFolders?.[0],
      () => this.files,
      () => this.selectedFile?.path,
      () => this.activeModule,
    );
    this.directoryView = vscode.window.createTreeView("ocr2md.directory", {
      treeDataProvider: this.directoryProvider,
    });
    this.chapterDecorations = new ChapterChangeDecorationProvider(() => this.files);
    this.sidebarProvider = new SidebarProvider(() => this.sidebarState(), (message) => this.handleMessage(message));

    this.disposables.push(
      this.directoryView,
      this.chapterDecorations,
      vscode.window.registerFileDecorationProvider(this.chapterDecorations),
      ...this.headingDecorations,
      vscode.window.registerWebviewViewProvider("ocr2md.regex", this.sidebarProvider),
      vscode.commands.registerCommand("ocr2md.refreshFiles", () => this.refreshFiles()),
      vscode.commands.registerCommand("ocr2md.pickFolder", () => this.pickWorkspaceFolder()),
      vscode.commands.registerCommand("ocr2md.openMarkdownFile", (filePath: string) => this.selectFile(filePath)),
      vscode.commands.registerCommand("ocr2md.openChapterModule", (filePath: string, moduleName: ModuleName) => {
        if (moduleName === "章节标题" || moduleName === "注释" || moduleName === "图片") {
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
      vscode.window.onDidChangeVisibleTextEditors((editors) => editors.forEach((editor) => this.applyHeadingDecorations(editor))),
      vscode.workspace.onDidChangeTextDocument((event) => {
        this.scheduleHeadingDecorations(event.document);
        this.scheduleWorkingCopySync(event.document);
      }),
    );
    void this.refreshFiles();
  }

  dispose() {
    if (this.headingDecorationTimer) clearTimeout(this.headingDecorationTimer);
    if (this.workingCopySyncTimer) clearTimeout(this.workingCopySyncTimer);
    this.disposables.forEach((disposable) => disposable.dispose());
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
      imageDownloadProgress: this.imageDownloadProgress,
      annotationMatchSummary: annotationMatchSummary(this.rows, this.annotationPairs),
    };
  }

  private async handleMessage(message: WebviewMessage) {
    switch (message.command) {
      case "setActiveModule":
        if (isModuleName(message.moduleName)) await this.activateModule(message.moduleName);
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
        if ((message.moduleName === "注释" || message.moduleName === "图片") && typeof message.pattern === "string") {
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
        if (typeof message.id === "string" && typeof message.chapterFile === "string") {
          const chapterFile = message.chapterFile.trim();
          this.rows = this.rows.map((row) => row.id === message.id ? { ...row, chapterFile } : row);
          this.update();
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
        if (Array.isArray(message.ids)) await this.downloadImages(message.ids);
        break;
      case "saveAnnotations":
        await this.saveSidecar();
        break;
      case "reloadAnnotations":
        await this.reloadSidecar();
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
    this.files = await this.syncChapterChangeMarkers(workspace, await this.discoverWorkspaceFiles(workspace));
    this.directoryProvider.refresh();
    this.chapterDecorations.refresh();
    this.update();
  }

  private async pickWorkspaceFolder() {
    const picked = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false });
    if (!picked?.[0]) return;
    await vscode.commands.executeCommand("vscode.openFolder", picked[0]);
  }

  private async selectFile(filePath: string, requestedModule?: Exclude<ModuleName, "章节定界">) {
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
    for (const moduleName of ["章节标题", "注释", "图片"] as const) {
      this.modulePreviewPaths.set(moduleName, editorUri.fsPath);
    }
    this.rows = [];
    this.annotationPairs = [];
    await this.reloadSidecar({ silent: true });
    if (requestedModule === "章节标题" || (!requestedModule && this.selectedFile.kind === "chapter")) {
      this.activeModule = "章节标题";
      if (!this.chapterWorkingUri && workspace) {
        const ensured = await this.ensureChapterWorkingCopy(workspace, this.selectedFile, text);
        this.chapterWorkingUri = ensured.workingUri;
        this.selectedFileText = ensured.workingText;
        editorUri = ensured.workingUri;
      }
      this.chapterWorkingUri = this.chapterWorkingUri ?? editorUri;
      await this.refreshChapterTitleRows(this.chapterWorkingUri);
    } else if (requestedModule === "注释" || requestedModule === "图片") {
      this.activeModule = requestedModule;
      if (requestedModule === "图片" && this.chapterWorkingUri) {
        await this.refreshChapterTitleRows(this.chapterWorkingUri, { writeMarker: false });
      }
      await this.scanCurrentModule(requestedModule);
    } else if (this.activeModule === "注释" || this.activeModule === "图片") {
      await this.scanCurrentModule(this.activeModule);
    }
    await this.showDocumentPair(editorUri, { preserveFocus: true });
    this.directoryProvider.refresh();
    this.update();
  }

  private async activateModule(moduleName: ModuleName) {
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
    } else if (this.selectedFile) {
      if (moduleName === "图片" && this.chapterWorkingUri) {
        await this.refreshChapterTitleRows(this.chapterWorkingUri, { writeMarker: false });
      }
      await this.scanCurrentModule(moduleName);
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
      if (this.activeModule === "注释" || this.activeModule === "图片") {
        await this.scanCurrentModule(this.activeModule);
      }
    }
  }

  private async scanCurrentModule(moduleName: "注释" | "图片", options: { silent?: boolean } = {}) {
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
    moduleName: "注释" | "图片",
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
    for (const pattern of patterns) {
      for (const candidate of scanRegexMatches(text, pattern)) {
        const extractedNumber = moduleName === "注释" ? extractAnnotationNumber(candidate.raw) : undefined;
        const row: Candidate = {
          ...candidate,
          typeLabel: moduleName,
          lineType: defaultLineType(moduleName, candidate.raw),
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
    const scanned = attachScanIdentities([...unique.values()], text, { moduleName, sourcePath: source });
    const previous = this.rows.filter((row) => row.typeLabel === moduleName && row.sourcePath === source);
    let reconciled = reconcileRows(previous, scanned, text);
    if (moduleName === "图片") {
      const present = new Set(reconciled.map((row) => row.id));
      const extras = previous.filter((row) =>
        !present.has(row.id) && (row.chapterBoundaryState === "deleted" || row.isWorkingCorrection));
      reconciled = dedupeImageRows([...reconciled, ...extras]);
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

  private scheduleWorkingCopySync(document: vscode.TextDocument) {
    if (document.uri.fsPath !== this.chapterWorkingUri?.fsPath) return;
    if (this.workingCopySyncTimer) clearTimeout(this.workingCopySyncTimer);
    this.workingCopySyncTimer = setTimeout(() => {
      void this.syncWorkingCopyTable(document);
    }, 200);
  }

  private shiftWorkingCopyRows(current: string) {
    if (this.selectedFileText === current) return;
    const lineMap = mapLinesAfterEdit(this.selectedFileText, current);
    this.rows = this.rows.map((row) => remapRangeLines(row, lineMap));
    this.selectedFileText = current;
  }

  private async syncTableToWorkingCopy(uri: vscode.Uri, current: string, options: { writeMarker?: boolean } = {}) {
    this.shiftWorkingCopyRows(current);
    await this.refreshChapterTitleRows(uri, {
      writeMarker: options.writeMarker,
      currentText: current,
      silent: true,
    });
    if (this.activeModule === "注释" || this.activeModule === "图片") {
      await this.scanCurrentModule(this.activeModule, { silent: true });
    }
    this.rows = await this.applyWorkingCopyDiff(this.rows, current);
    this.update();
  }

  private async syncWorkingCopyTable(document: vscode.TextDocument) {
    if (document.uri.fsPath !== this.chapterWorkingUri?.fsPath) return;
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
    const relative = path.relative(workspace.uri.fsPath, file.path).replace(/[\\/]/g, "__");
    const directory = vscode.Uri.joinPath(workspace.uri, ".ocr2md", "annotation-working");
    const uri = vscode.Uri.joinPath(directory, `${relative}.annotation.working.md`);
    await vscode.workspace.fs.createDirectory(directory);
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
    const existing = this.rows.find((row) =>
      row.typeLabel === moduleName
      && !isDeletedCandidate(row)
      && row.raw === lineText
      && rowBelongsToChapter(row, sourcePath, workingPath));
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
    const row = this.rows.find((candidate) => candidate.id === id);
    const target = this.modulePreviewPaths.get(this.activeModule)
      ?? row?.workingCopyPath
      ?? row?.sourcePath;
    if (!row || !target || !(await exists(vscode.Uri.file(target)))) return;
    const editor = await this.showDocumentPair(vscode.Uri.file(target));
    const document = editor.document;
    const located = locateCandidate(document.getText(), row);
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
    this.rows = this.rows.map((candidate) => candidate.id === row.id ? { ...candidate, range: located } : candidate);
  }

  private async showDocumentPair(uri: vscode.Uri, options: { preserveFocus?: boolean } = {}): Promise<vscode.TextEditor> {
    const document = await vscode.workspace.openTextDocument(uri);
    if (!this.hasStackedSourcePreview(uri)) await this.openStackedSourcePreview(document, uri);
    const editor = await vscode.window.showTextDocument(document, {
      preview: false,
      viewColumn: vscode.ViewColumn.One,
      preserveFocus: options.preserveFocus,
    });
    this.applyHeadingDecorations(editor);
    return editor;
  }

  private hasStackedSourcePreview(uri: vscode.Uri): boolean {
    const sourceColumn = sourceViewColumn(uri);
    const previewColumn = markdownPreviewGroup()?.viewColumn;
    return sourceColumn === vscode.ViewColumn.One
      && previewColumn === vscode.ViewColumn.Two
      && vscode.window.tabGroups.all.length === 2;
  }

  private async openStackedSourcePreview(document: vscode.TextDocument, uri: vscode.Uri): Promise<void> {
    await vscode.commands.executeCommand("vscode.setEditorLayout", { orientation: 0, groups: [{ size: 1 }] });
    await vscode.window.showTextDocument(document, { preview: false, viewColumn: vscode.ViewColumn.One, preserveFocus: false });
    await vscode.commands.executeCommand("workbench.action.splitEditorDown");
    await vscode.commands.executeCommand("vscode.setEditorLayout", STACKED_SOURCE_PREVIEW_LAYOUT);
    await vscode.window.showTextDocument(document, { preview: false, viewColumn: vscode.ViewColumn.Two, preserveFocus: false });
    try {
      await vscode.commands.executeCommand("markdown.showPreview", uri);
    } catch {
      return;
    }
    if (!markdownPreviewGroup()) await delay(100);
    if (!markdownPreviewGroup()) return;
    const tabsToClose = vscode.window.tabGroups.all.flatMap((group) => group.tabs.filter((tab) => {
      const isSource = tab.input instanceof vscode.TabInputText && tab.input.uri.fsPath === uri.fsPath;
      const isPreview = isMarkdownPreviewTab(tab);
      if (group.viewColumn === vscode.ViewColumn.One) return isPreview;
      if (group.viewColumn === vscode.ViewColumn.Two) return isSource;
      return isSource || isPreview;
    }));
    if (tabsToClose.length) await vscode.window.tabGroups.close(tabsToClose, true);
    await vscode.commands.executeCommand("vscode.setEditorLayout", STACKED_SOURCE_PREVIEW_LAYOUT);
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

  private async downloadImages(ids: string[]) {
    const workspace = vscode.workspace.workspaceFolders?.[0];
    if (!workspace) return;
    const selected = new Set(ids);
    const rows = activeCandidates(this.rows).filter((row) => selected.has(row.id) && row.typeLabel === "图片");
    if (!rows.length) {
      void vscode.window.showWarningMessage("请先选择有效图片记录。");
      return;
    }
    const directory = vscode.Uri.joinPath(workspace.uri, "imgs");
    await vscode.workspace.fs.createDirectory(directory);
    let failed = 0;
    for (const [index, row] of rows.entries()) {
      this.imageDownloadProgress = { phase: "downloading", completed: index, total: rows.length, current: row.raw, failed };
      this.update();
      try {
        const url = extractImageUrl(row.raw);
        if (!url) throw new Error("未找到外部图片 URL");
        const name = safeImageName(url, row);
        await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(directory, name), await download(url));
        const localPath = `imgs/${name}`;
        this.rows = this.rows.map((candidate) => candidate.id === row.id ? { ...candidate, localPath } : candidate);
      } catch (error) {
        failed += 1;
        this.imageDownloadProgress = {
          phase: "downloading",
          completed: index + 1,
          total: rows.length,
          current: row.raw,
          failed,
          lastError: error instanceof Error ? error.message : String(error),
        };
      }
    }
    this.imageDownloadProgress = { phase: "complete", completed: rows.length, total: rows.length, failed, current: "图片下载完成" };
    this.update();
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
    this.modulePreviewPaths.set("图片", ensured.workingUri.fsPath);
    this.activeModule = "章节标题";
    await this.refreshChapterTitleRows(ensured.workingUri);
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
    let baselineText: string | undefined;
    if (isChapterOutputPath(workspace.uri.fsPath, file.path)) {
      const baselineUri = vscode.Uri.file(chapterOutputBaselinePath(workspace.uri.fsPath, file.path));
      if (await exists(baselineUri)) {
        baselineText = Buffer.from(await vscode.workspace.fs.readFile(baselineUri)).toString("utf8");
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
    const previousImages = this.rows.filter((row) => row.typeLabel === "图片" && rowBelongsToChapter(row, originalPath, uri.fsPath));
    const changes = scanChapterBoundaryLines(chapterDiffBaseline(baseline, current), current);
    const currentChanges = changes.filter((entry) => entry.state !== "deleted");
    const sourcePath = originalPath ?? uri.fsPath;
    const blocks = scanChapterBlocks(current, uri.fsPath, workspace?.uri.fsPath, sourcePath).map((row) => {
      const endLine = row.range.endLine ?? row.range.line;
      const change = currentChanges.find((entry) => entry.line >= row.range.line && entry.line <= endLine);
      return { ...row, chapterBoundaryState: change?.state ?? "heading", baselinePreview: change?.baselineText };
    });
    const identityContext = { sourcePath };
    const titleBlocks = attachScanIdentities(
      blocks.filter((row) => !detectImageLineType(row.raw)),
      current,
      { moduleName: "章节标题", ...identityContext },
    );
    const imageBlocks = attachScanIdentities(
      blocks.flatMap((row) => imageRowsFromBlock(row)),
      current,
      { moduleName: "图片", ...identityContext },
    );
    const titleRows = reconcileRows(previousTitles.filter((row) => row.chapterBoundaryState !== "deleted"), titleBlocks, current);
    const imageRows = reconcileRows(previousImages.filter((row) => row.chapterBoundaryState !== "deleted"), imageBlocks, current)
      .map((row) => applyChangeState(row, changes));
    const lines = current.replace(/\r\n?/g, "\n").split("\n");
    for (const entry of changes.filter((candidate) => candidate.state === "deleted")) {
      const raw = entry.baselineText ?? "";
      const imageLineType = detectImageLineType(raw);
      const deleted = attachLineIdentity({
        id: `chapter-deleted-${candidateHash(`${uri.fsPath}\0${raw}`)}`,
        kind: "regex",
        label: raw.trim() || `L${entry.line + 1}`,
        raw,
        preview: raw,
        range: { line: Math.min(entry.line, Math.max(0, lines.length - 1)), start: 0, end: 0 },
        typeLabel: imageLineType ? "图片" : "章节标题",
        lineType: imageLineType ?? "非标题",
        chapterBoundaryState: "deleted",
        baselinePreview: raw,
        workingCopyPath: uri.fsPath,
        sourcePath,
        sourceLabel: workspace ? path.relative(workspace.uri.fsPath, sourcePath) : path.basename(sourcePath),
        status: "候选",
      }, current, { moduleName: imageLineType ? "图片" : "章节标题", sourcePath });
      (imageLineType ? imageRows : titleRows).push(deleted);
    }
    this.rows = [
      ...this.rows.filter((row) => row.typeLabel !== "章节标题"
        && !(row.typeLabel === "图片" && rowBelongsToChapter(row, originalPath, uri.fsPath))),
      ...titleRows,
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
    await this.reloadSidecar({ silent: true });
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
      `{**/.ocr2md/**,**/node_modules/**,**/out/**,**/output/**,**/output_chapters/**,**/${CHAPTER_BOUNDARY_WORKING_FILE}}`,
    );
    const files = await Promise.all(uris.map(async (uri): Promise<FileEntry> => {
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
      .map((row) => ({ line: row.range.line, chapterFile: outputFileName(row.chapterFile!) }));
    if (!starts.length) {
      void vscode.window.showWarningMessage("请先为至少一个一级标题设置章节文件。");
      return;
    }
    const text = Buffer.from(await vscode.workspace.fs.readFile(working)).toString("utf8");
    const lines = text.replace(/\r\n?/g, "\n").split("\n");
    const segments = buildChapterBoundarySegments(starts, lines.length);
    const chapterDirectory = vscode.Uri.joinPath(workspace.uri, "chapters");
    await vscode.workspace.fs.createDirectory(chapterDirectory);
    for (const segment of segments) {
      const body = lines.slice(segment.startLine, segment.endLine).join("\n");
      const output = withChapterFrontmatter(body, segment.chapterFile, path.basename(working.fsPath));
      const uri = vscode.Uri.joinPath(chapterDirectory, segment.chapterFile);
      await vscode.workspace.fs.writeFile(uri, Buffer.from(output, "utf8"));
    }
    await this.refreshFiles();
    void vscode.window.showInformationMessage(`已导出 ${segments.length} 个章节文件到 chapters/。`);
  }

  private async reloadSidecar(options: { silent?: boolean } = {}) {
    const file = this.selectedFile;
    const workspace = file ? vscode.workspace.getWorkspaceFolder(vscode.Uri.file(file.path)) ?? vscode.workspace.workspaceFolders?.[0] : undefined;
    if (!file || !workspace) return;
    const globalUri = vscode.Uri.joinPath(workspace.uri, ".ocr2md", "annotations.json");
    const localUri = vscode.Uri.file(`${file.path}.ocr2md.json`);
    const uri = await exists(globalUri) ? globalUri : localUri;
    if (!(await exists(uri))) return;
    try {
      const sidecar = JSON.parse(Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8")) as AnnotationSidecar;
      const loaded = (sidecar.rows ?? []).map(fromSidecarRow).filter((row) =>
        isModuleName(row.typeLabel) && rowBelongsToChapter(row, file.path, this.chapterWorkingUri?.fsPath ?? file.path)
      );
      this.rows = loaded.sort(compareRows);
      this.annotationPairs = (sidecar.annotationPairs ?? []).filter((pair) => pair.sourcePath === file.path);
      this.rebuildAnnotationPairs();
      if (!options.silent) void vscode.window.showInformationMessage(`已恢复 ${loaded.length} 条标定。`);
      this.update();
    } catch (error) {
      void vscode.window.showErrorMessage(`标定恢复失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async saveSidecar() {
    const file = this.selectedFile;
    const workspace = file ? vscode.workspace.getWorkspaceFolder(vscode.Uri.file(file.path)) ?? vscode.workspace.workspaceFolders?.[0] : undefined;
    if (!file || !workspace) return;
    const globalUri = vscode.Uri.joinPath(workspace.uri, ".ocr2md", "annotations.json");
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(workspace.uri, ".ocr2md"));
    let previous: AnnotationSidecar = { schemaVersion: 3, sourceFile: file.path, savedAt: "", rows: [], annotationPairs: [] };
    if (await exists(globalUri)) {
      try {
        previous = JSON.parse(Buffer.from(await vscode.workspace.fs.readFile(globalUri)).toString("utf8")) as AnnotationSidecar;
      } catch {
        // A valid new sidecar will replace an unreadable previous file.
      }
    }
    const currentPaths = new Set(this.rows.flatMap((row) => [row.sourcePath, row.workingCopyPath]).filter(Boolean));
    const preserved = (previous.rows ?? []).filter((raw) => {
      const row = fromSidecarRow(raw);
      return isModuleName(row.typeLabel) && !currentPaths.has(row.sourcePath) && !currentPaths.has(row.workingCopyPath);
    });
    const sidecar: AnnotationSidecar = {
      schemaVersion: 3,
      sourceFile: file.path,
      savedAt: new Date().toISOString(),
      rows: [...preserved.map(fromSidecarRow), ...this.rows].map(toSidecarRow),
      annotationPairs: [
        ...(previous.annotationPairs ?? []).filter((pair) => !currentPaths.has(pair.sourcePath)),
        ...this.annotationPairs,
      ],
    };
    const bytes = Buffer.from(JSON.stringify(sidecar, null, 2), "utf8");
    await vscode.workspace.fs.writeFile(globalUri, bytes);
    await vscode.workspace.fs.writeFile(vscode.Uri.file(`${file.path}.ocr2md.json`), bytes);
    void vscode.window.showInformationMessage(`已保存 ${this.rows.length} 条标定。`);
  }

  private update() {
    this.sidebarProvider.update();
  }
}

class SidebarProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;

  constructor(
    private readonly state: () => SidebarState,
    private readonly onMessage: (message: WebviewMessage) => Promise<void>,
  ) {}

  resolveWebviewView(view: vscode.WebviewView) {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.onDidReceiveMessage((message: WebviewMessage) => this.onMessage(message));
    this.update();
  }

  update() {
    if (this.view) this.view.webview.html = renderSidebar(this.state());
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

type DirectoryNodeKind = "workspace" | "ocr-group" | "chapters-group" | "ocr-file" | "chapter-file" | "chapter-module";

class DirectoryProvider implements vscode.TreeDataProvider<DirectoryItem> {
  private readonly emitter = new vscode.EventEmitter<DirectoryItem | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(
    private readonly workspace: () => vscode.WorkspaceFolder | undefined,
    private readonly files: () => FileEntry[],
    private readonly selectedPath: () => string | undefined,
    private readonly activeModule: () => ModuleName,
  ) {}

  refresh() {
    this.emitter.fire(undefined);
  }

  getTreeItem(item: DirectoryItem) {
    return item;
  }

  getChildren(item?: DirectoryItem): DirectoryItem[] {
    const workspace = this.workspace();
    if (!workspace) return [];
    if (!item) {
      return [DirectoryItem.workspace(workspace.uri.fsPath)];
    }
    if (item.nodeKind === "workspace") {
      return [DirectoryItem.group("ocr", "ocr-group"), DirectoryItem.group("chapters", "chapters-group")];
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
      return ([
        ["标题", "章节标题"],
        ["注释", "注释"],
        ["图片", "图片"],
      ] as const).map(([label, moduleName]) => DirectoryItem.chapterModule(
        label,
        moduleName,
        item.file!,
        item.file!.path === this.selectedPath() && moduleName === this.activeModule(),
      ));
    }
    return [];
  }
}

class DirectoryItem extends vscode.TreeItem {
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

  static chapterModule(label: string, moduleName: Exclude<ModuleName, "章节定界">, file: FileEntry, selected: boolean) {
    const item = new DirectoryItem(label, "chapter-module", vscode.TreeItemCollapsibleState.None, file);
    item.description = selected ? "当前" : undefined;
    item.tooltip = `${file.path} · ${label}`;
    item.command = { command: "ocr2md.openChapterModule", title: `打开${label}模块`, arguments: [file.path, moduleName] };
    item.iconPath = new vscode.ThemeIcon(moduleName === "章节标题" ? "symbol-key" : moduleName === "注释" ? "references" : "file-media");
    return item;
  }
}

function isMarkdownPreviewTab(tab: vscode.Tab): boolean {
  return tab.input instanceof vscode.TabInputWebview
    && tab.input.viewType.toLowerCase().includes("markdown.preview");
}

function markdownPreviewGroup(): vscode.TabGroup | undefined {
  return vscode.window.tabGroups.all.find((group) => group.tabs.some(isMarkdownPreviewTab));
}

function sourceViewColumn(uri: vscode.Uri): vscode.ViewColumn | undefined {
  return vscode.window.tabGroups.all.find((group) =>
    group.tabs.some((tab) => tab.input instanceof vscode.TabInputText && tab.input.uri.fsPath === uri.fsPath)
  )?.viewColumn;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chapterTreeLabel(workspacePath: string, file: FileEntry): string {
  const chaptersPath = path.resolve(workspacePath, "chapters") + path.sep;
  const resolved = path.resolve(file.path);
  return resolved.startsWith(chaptersPath) ? path.relative(chaptersPath, resolved) : file.label;
}

interface WebviewMessage {
  command: string;
  moduleName?: string;
  pattern?: string;
  ids?: string[];
  id?: string;
  lineType?: string;
  chapterFile?: string;
  annotationNumber?: string;
}

interface AnnotationSidecar {
  schemaVersion: number;
  sourceFile: string;
  savedAt: string;
  rows: SidecarRow[];
  annotationPairs: AnnotationPair[];
}

interface SidecarRow extends Omit<Candidate, "range"> {
  range?: SourceRange;
  line?: number;
  start?: number;
  endLine?: number;
  end?: number;
}

function fromSidecarRow(row: SidecarRow): Candidate {
  return {
    ...row,
    kind: row.kind ?? "regex",
    label: row.label ?? row.raw ?? "",
    raw: row.raw ?? "",
    preview: row.preview ?? row.raw ?? "",
    range: row.range ?? {
      line: row.line ?? 0,
      start: row.start ?? 0,
      endLine: row.endLine,
      end: row.end ?? 0,
    },
  };
}

function toSidecarRow(row: Candidate): SidecarRow {
  const { range, ...rest } = row;
  return { ...rest, line: range.line, start: range.start, endLine: range.endLine, end: range.end };
}

function scanChapterBlocks(text: string, workingPath: string, workspaceRoot?: string, sourcePath?: string): Candidate[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const identityPath = sourcePath ?? workingPath;
  const rows: Candidate[] = [];
  let start = 0;
  while (start < lines.length) {
    while (start < lines.length && !lines[start].trim()) start += 1;
    if (start >= lines.length) break;
    let end = start;
    while (end + 1 < lines.length && lines[end + 1].trim()) end += 1;
    const raw = lines.slice(start, end + 1).join("\n");
    const match = /^ {0,3}(#{1,6})(?:\s+|$)/.exec(lines[start]);
    const lineType = match ? `${match[1].length} 级标题` : "非标题";
    const id = `chapter-block-${candidateHash(`${identityPath}\0${start}\0${raw}`)}`;
    rows.push({
      id,
      rowId: id,
      kind: "regex",
      label: lines[start].trim(),
      raw,
      preview: raw.slice(0, 255),
      range: { line: start, start: 0, endLine: end, end: lines[end].length },
      typeLabel: "章节标题",
      lineType,
      workingCopyPath: workingPath,
      sourcePath: identityPath,
      sourceLabel: workspaceRoot ? path.relative(workspaceRoot, identityPath) : path.basename(identityPath),
      status: "候选",
    });
    start = end + 1;
  }
  return rows;
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

function dedupeImageRows(rows: Candidate[]): Candidate[] {
  const deleted = rows.filter((row) => row.chapterBoundaryState === "deleted");
  const live = rows
    .filter((row) => row.chapterBoundaryState !== "deleted")
    .sort((left, right) => left.range.line - right.range.line || left.raw.length - right.raw.length);
  const kept: Candidate[] = [];
  for (const row of live) {
    const duplicate = kept.some((other) =>
      other.range.line === row.range.line
      && (other.raw === row.raw || other.raw.includes(row.raw) || row.raw.includes(other.raw)));
    if (!duplicate) kept.push(row);
  }
  return [...deleted, ...kept];
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
  return detectImageLineType(raw) ?? "图片文本";
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

function outputFileName(value: string): string {
  const name = value.trim().replace(/\.md$/i, "").replace(/[\\/:*?\"<>|]/g, " ").replace(/\s+/g, " ").trim();
  return `${name || "chapter"}.md`;
}

function withChapterFrontmatter(markdown: string, chapterFile: string, source: string): string {
  const body = markdown.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, "").replace(/^\s+/, "");
  return `---\nocr2md_chapter_split: true\nocr2md_chapter_split_at: ${new Date().toISOString()}\nocr2md_chapter_file: ${JSON.stringify(chapterFile)}\nocr2md_chapter_source: ${JSON.stringify(source)}\n${CHAPTER_CHANGED_PROPERTY}: false\n---\n\n${body}`;
}

function extractImageUrl(value: string): string | undefined {
  return /!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/i.exec(value)?.[1] ?? /https?:\/\/[^\s)]+/i.exec(value)?.[0];
}

function safeImageName(url: string, row: Candidate): string {
  let name = "";
  try { name = path.posix.basename(new URL(url).pathname); } catch { /* use fallback */ }
  return (name || `image-${row.range.line + 1}.jpg`).replace(/[<>:\"/\\|?*\u0000-\u001f]/g, "_");
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
