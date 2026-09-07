import { EditorState, RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import { EditorView, Decoration, DecorationSet, WidgetType, highlightActiveLineGutter, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { css } from "@codemirror/lang-css";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";
// markdown-it-texmath does not ship TypeScript declarations.
// @ts-expect-error untyped third-party plugin
import texmath from "markdown-it-texmath";
import katex from "katex";
import {
  AllCommunityModule,
  ColDef,
  ICellRendererParams,
  ModuleRegistry,
  RowClickedEvent,
  RowSelectionOptions,
  createGrid,
  themeQuartz,
} from "ag-grid-community";
import { ChapterReviewApplication } from "../../src/chapterReviewApplication";
import { planHeadingLineTypeEdits } from "../../src/chapterReviewActions";
import { IGNORED_LINE_TYPE } from "../../src/candidateLifecycle";
import { scanChapterBoundaryLines } from "../../src/chapterBoundary";
import { chapterDiffBaseline } from "../../src/chapterReviewText";
import { MODULE_REGEX_DEFAULTS } from "../../src/regexPresets";
import { candidatesFromSidecar } from "../../src/sidecar";
import { WorkbenchHistory, type WorkbenchHistorySnapshot } from "../../src/workbenchHistory";
import type { AnnotationPair, Candidate, ModuleName } from "../../src/types";
import {
  installGoogleDriveWorkspace,
  type GoogleDriveWorkspaceOpenedChapter,
  type GoogleDriveWorkspaceOpenedFile,
} from "./googleDriveWorkspace";
import { installGoogleDriveFileExplorerSpike } from "./googleDriveFileExplorerSpike";
import { FeatureDebugRunner, requireFeatureDebug, type FeatureDebugStep } from "./featureDebugRunner";

ModuleRegistry.registerModules([AllCommunityModule]);

type ReviewRow = Candidate;
let reviewRows: ReviewRow[] = [];
let annotationPairs: AnnotationPair[] = [];

const obsidianSyntaxHighlight = HighlightStyle.define([
  { tag: tags.comment, color: "var(--obsidian-code-comment)" },
  { tag: tags.link, color: "var(--obsidian-code-link)", textDecoration: "underline" },
  { tag: tags.url, color: "var(--obsidian-code-url)", textDecoration: "underline" },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: "var(--obsidian-code-function)" },
  { tag: [tags.keyword, tags.controlKeyword, tags.moduleKeyword], color: "var(--obsidian-code-keyword)" },
  { tag: [tags.operator, tags.logicOperator, tags.arithmeticOperator, tags.compareOperator], color: "var(--obsidian-code-operator)" },
  { tag: [tags.propertyName, tags.attributeName], color: "var(--obsidian-code-property)" },
  { tag: [tags.string, tags.special(tags.string)], color: "var(--obsidian-code-string)" },
  { tag: [tags.tagName, tags.typeName], color: "var(--obsidian-code-tag)" },
  { tag: [tags.number, tags.bool, tags.null], color: "var(--obsidian-code-value)" },
  { tag: [tags.punctuation, tags.bracket, tags.angleBracket], color: "var(--obsidian-code-punctuation)" },
]);

function requiredElement<T extends Element>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`missing spike DOM: ${selector}`);
  return node;
}

const editorHost = requiredElement<HTMLElement>("#editor");
const preview = requiredElement<HTMLElement>("#preview");
const gridHost = requiredElement<HTMLElement>("#review-grid");
const gridStatus = requiredElement<HTMLElement>("#grid-status");
const gridSelected = requiredElement<HTMLElement>("#grid-selected");
const saveCalibrationButton = requiredElement<HTMLButtonElement>("#save-calibration");
const cleaningWorkspace = requiredElement<HTMLElement>("#cleaning-workspace");
const gdWorkspace = requiredElement<HTMLElement>("#gd-workspace");
const gdJsfeWorkspace = requiredElement<HTMLElement>("#gd-jsfe-workspace");
const workspaceDocument = requiredElement<HTMLElement>("#workspace-document");
const workspaceTabs = Array.from(document.querySelectorAll<HTMLButtonElement>(".workspace-tab"));
const uiDebugPicker = requiredElement<HTMLElement>("#ui-debug-picker");
const uiDebugToggle = requiredElement<HTMLButtonElement>("#ui-debug-toggle");
const uiDebugMenu = requiredElement<HTMLElement>("#ui-debug-menu");
const uiDebugInitialize = requiredElement<HTMLButtonElement>("#ui-debug-initialize");
const uiDebugMoveSourceBlock = requiredElement<HTMLButtonElement>("#ui-debug-move-source-block");
const uiDebugLineMenu = requiredElement<HTMLButtonElement>("#ui-debug-line-menu");
const uiDebugEditTextLine = requiredElement<HTMLButtonElement>("#ui-debug-edit-text-line");
const uiDebugIgnoreLineType = requiredElement<HTMLButtonElement>("#ui-debug-ignore-line-type");
const uiDebugUndoRedo = requiredElement<HTMLButtonElement>("#ui-debug-undo-redo");
const uiDebugSaveReenter = requiredElement<HTMLButtonElement>("#ui-debug-save-reenter");
const undoWorkbenchButton = requiredElement<HTMLButtonElement>("#undo-workbench");
const redoWorkbenchButton = requiredElement<HTMLButtonElement>("#redo-workbench");
const featureDebugProgress = requiredElement<HTMLElement>("#feature-debug-progress");
const featureDebugProgressTitle = requiredElement<HTMLElement>("#feature-debug-progress-title");
const featureDebugProgressList = requiredElement<HTMLElement>("#feature-debug-progress-list");
const sourceLineContextMenu = requiredElement<HTMLElement>("#source-line-context-menu");
const sourceLineContextTitle = requiredElement<HTMLElement>("#source-line-context-title");
const sourceLineAddCurrent = requiredElement<HTMLButtonElement>("#source-line-add-current");
const moduleTags = Array.from(document.querySelectorAll<HTMLButtonElement>(".module-tag"));
const changedLinesTag = requiredElement<HTMLButtonElement>('.module-tag[data-module="变动行"]');
const changedLinesBadge = requiredElement<HTMLElement>("#changed-lines-badge");
const expectedModuleTags = ["章节定界", "章节标题", "注释", "嵌入块", "非法断行", "变动行"];
if (expectedModuleTags.some((name) => !moduleTags.some((tag) => tag.dataset.module === name))) {
  throw new Error("missing module tags");
}
const workspace = requiredElement<HTMLElement>(".workspace");
const editorPane = requiredElement<HTMLElement>(".editor-pane");
const editorMenu = requiredElement<HTMLElement>(".editor-menu");
const editorStatusbar = requiredElement<HTMLElement>(".editor-statusbar");
const verticalSplitter = requiredElement<HTMLElement>("#splitter-vertical");
const horizontalSplitter = requiredElement<HTMLElement>("#splitter-horizontal");
const regexInput = requiredElement<HTMLInputElement>("#regex-search");
const searchTarget = requiredElement<HTMLSelectElement>("#search-target");
const caseToggle = requiredElement<HTMLInputElement>("#search-case");
const prevMatchButton = requiredElement<HTMLButtonElement>("#search-prev");
const nextMatchButton = requiredElement<HTMLButtonElement>("#search-next");
const searchStatus = requiredElement<HTMLElement>("#search-status");
const status = requiredElement<HTMLElement>("#status");
const sourceEditorTab = requiredElement<HTMLButtonElement>("#editor-tab-source");
const cssEditorTab = requiredElement<HTMLButtonElement>("#editor-tab-css");
const regexSearchControls = requiredElement<HTMLElement>(".regex-search");
const cssControls = requiredElement<HTMLElement>("#css-controls");
const cssSaveButton = requiredElement<HTMLButtonElement>("#css-save");
const cssResetButton = requiredElement<HTMLButtonElement>("#css-reset");
const customCssWrap = requiredElement<HTMLElement>("#custom-css-wrap");
const customCssEditorHost = requiredElement<HTMLElement>("#custom-css-editor");

const CUSTOM_CSS_STORAGE_KEY = "ocr2md.integration.custom-css.v2";
const CUSTOM_CSS_DEFAULT = `/* 自定义 CSS：只允许修改下列三个字体变量，窗格比例和分割条不会受影响。 */
:root[data-device-profile="ipad"] { /* iPad：以下设置只作用于 iPad。 */
  --ui-font-size: 12px; /* iPad：顶部工作区导航栏、窗格顶栏、窗格状态底栏和其他控件字体大小。 */
  --grid-font-size: 10px; /* iPad：数据表字体大小。 */
  --right-font-size: 12px; /* iPad：源码窗和预览窗正文基础字体大小。 */
} /* iPad：设备样式设置结束。 */
/* Mac：下面开始 Mac 设备的字体设置。 */
:root[data-device-profile="mac"] { /* Mac：以下设置只作用于 Mac。 */
  --ui-font-size: 14px; /* Mac：顶部工作区导航栏、窗格顶栏、窗格状态底栏和其他控件字体大小。 */
  --grid-font-size: 14px; /* Mac：数据表字体大小。 */
  --right-font-size: 16px; /* Mac：源码窗和预览窗正文基础字体大小。 */
} /* Mac：设备样式设置结束。 */
`;

const ALLOWED_CUSTOM_CSS_VARS = new Set([
  "--ui-font-size",
  "--grid-font-size",
  "--right-font-size",
]);

let customCssStyle = document.querySelector<HTMLStyleElement>("#ocr2md-custom-css");
if (!customCssStyle) {
  customCssStyle = document.createElement("style");
  customCssStyle.id = "ocr2md-custom-css";
  document.head.append(customCssStyle);
}

function sanitizedCustomCss(source: string): string {
  const blocks: string[] = [];
  const blockPattern = /:root\[data-device-profile="(ipad|mac)"\]\s*\{([\s\S]*?)\}/g;
  let match: RegExpExecArray | null;
  while ((match = blockPattern.exec(source))) {
    const selector = `:root[data-device-profile="${match[1]}"]`;
    const declarations = Array.from(match[2].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;{}]+)\s*;?/gi))
      .filter((entry) => ALLOWED_CUSTOM_CSS_VARS.has(entry[1]))
      .map((entry) => `  ${entry[1]}: ${entry[2].trim()};`);
    if (declarations.length) blocks.push(`${selector} {\n${declarations.join("\n")}\n}`);
  }
  return blocks.join("\n\n");
}

function applyCustomCss(source: string): void {
  if (customCssStyle) customCssStyle.textContent = sanitizedCustomCss(source);
}

function storedCustomCss(): string {
  try {
    return localStorage.getItem(CUSTOM_CSS_STORAGE_KEY) ?? CUSTOM_CSS_DEFAULT;
  } catch {
    return CUSTOM_CSS_DEFAULT;
  }
}

const initialCustomCss = storedCustomCss();
applyCustomCss(initialCustomCss);

let customCssTimer = 0;
const customCssView = new EditorView({
  parent: customCssEditorHost,
  state: EditorState.create({
    doc: initialCustomCss,
    extensions: [
      lineNumbers(),
      history(),
      css(),
      syntaxHighlighting(obsidianSyntaxHighlight),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      EditorView.lineWrapping,
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;
        window.clearTimeout(customCssTimer);
        customCssTimer = window.setTimeout(() => {
          applyCustomCss(update.state.doc.toString());
          status.textContent = "自定义 CSS · 实时预览（未保存）";
        }, 150);
      }),
    ],
  }),
});

cssSaveButton.addEventListener("click", () => {
  const source = customCssView.state.doc.toString();
  applyCustomCss(source);
  try {
    localStorage.setItem(CUSTOM_CSS_STORAGE_KEY, source);
    status.textContent = "自定义 CSS 已保存";
  } catch {
    status.textContent = "自定义 CSS 已应用，但浏览器保存失败";
  }
});

cssResetButton.addEventListener("click", () => {
  customCssView.dispatch({
    changes: { from: 0, to: customCssView.state.doc.length, insert: CUSTOM_CSS_DEFAULT },
  });
  applyCustomCss(CUSTOM_CSS_DEFAULT);
  try { localStorage.removeItem(CUSTOM_CSS_STORAGE_KEY); } catch { /* noop */ }
  status.textContent = "自定义 CSS 已恢复默认";
});

type EditorPaneMode = "source" | "css";
let editorPaneMode: EditorPaneMode = "source";

function setEditorPaneMode(mode: EditorPaneMode): void {
  editorPaneMode = mode;
  const cssMode = mode === "css";
  sourceEditorTab.classList.toggle("is-active", !cssMode);
  cssEditorTab.classList.toggle("is-active", cssMode);
  sourceEditorTab.setAttribute("aria-selected", cssMode ? "false" : "true");
  cssEditorTab.setAttribute("aria-selected", cssMode ? "true" : "false");
  editorHost.hidden = cssMode;
  customCssWrap.hidden = !cssMode;
  regexSearchControls.classList.toggle("is-mode-hidden", cssMode);
  cssControls.classList.toggle("is-mode-hidden", !cssMode);
  regexSearchControls.setAttribute("aria-hidden", cssMode ? "true" : "false");
  cssControls.setAttribute("aria-hidden", cssMode ? "false" : "true");
  horizontalSplitter.setAttribute("aria-label", cssMode ? "调整自定义 CSS 与预览高度" : "调整源码与预览高度");
  if (cssMode) {
    status.textContent = "自定义 CSS · 修改后实时预览";
    requestAnimationFrame(() => {
      customCssView.requestMeasure();
      customCssView.focus();
    });
  } else {
    status.textContent = `工作稿 · ${view.state.doc.lines} 行 · 原稿只读基线 · 数据表已同步`;
    requestAnimationFrame(() => view.requestMeasure());
  }
}

sourceEditorTab.addEventListener("click", () => setEditorPaneMode("source"));
cssEditorTab.addEventListener("click", () => setEditorPaneMode("css"));

const md = new MarkdownIt({ html: true, linkify: true, typographer: true });
md.use(texmath, {
  engine: katex,
  delimiters: "dollars",
  katexOptions: { throwOnError: false, strict: "ignore" },
});
const defaultHtmlBlock = md.renderer.rules.html_block ?? ((tokens, idx) => tokens[idx].content);
md.renderer.rules.html_block = (tokens, idx, options, env, self) => {
  const rendered = defaultHtmlBlock(tokens, idx, options, env, self);
  const line = tokens[idx].map?.[0];
  return line == null
    ? rendered
    : `<div class="md-source-block md-html-block" data-source-line="${line + 1}">${rendered}</div>`;
};

const sourceHeadingField = StateField.define<DecorationSet>({
  create(state) { return sourceHeadingDecorations(state.doc); },
  update(value, transaction) {
    return transaction.docChanged ? sourceHeadingDecorations(transaction.state.doc) : value;
  },
  provide: (field) => EditorView.decorations.from(field),
});

function sourceHeadingDecorations(doc: EditorState["doc"]): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (let lineNumber = 1; lineNumber <= doc.lines; lineNumber += 1) {
    const line = doc.line(lineNumber);
    const match = /^ {0,3}(#{1,6})(?:\s+|$)/.exec(line.text);
    if (!match) continue;
    builder.add(line.from, line.from, Decoration.line({ class: `cm-obsidian-h${match[1].length}` }));
  }
  return builder.finish();
}

type StyledRange = { from: number; to: number; className: string };

function latexDecorations(doc: EditorState["doc"]): DecorationSet {
  const text = doc.toString();
  const styled: StyledRange[] = [];
  const mathPattern = /\$\$[\s\S]*?\$\$|(?<!\\)\$(?!\$)[^\n]*?(?<!\\)\$/g;
  let mathMatch: RegExpExecArray | null;
  while ((mathMatch = mathPattern.exec(text))) {
    const full = mathMatch[0];
    const delimiterLength = full.startsWith("$$") ? 2 : 1;
    const from = mathMatch.index;
    const to = from + full.length;
    const contentFrom = from + delimiterLength;
    const contentTo = to - delimiterLength;
    styled.push(
      { from, to: contentFrom, className: "cm-obsidian-latex-punctuation" },
      { from: contentTo, to, className: "cm-obsidian-latex-punctuation" },
    );

    const content = text.slice(contentFrom, contentTo);
    const tokenPattern = /\\[A-Za-z]+|\\.|\d+(?:\.\d+)?|[_^&=+\-*/<>]|[{}\[\](),:;.]/g;
    let token: RegExpExecArray | null;
    while ((token = tokenPattern.exec(content))) {
      const tokenFrom = contentFrom + token.index;
      const tokenTo = tokenFrom + token[0].length;
      let className = "cm-obsidian-latex-punctuation";
      if (token[0].startsWith("\\")) className = "cm-obsidian-latex-function";
      else if (/^\d/.test(token[0])) className = "cm-obsidian-latex-value";
      else if (/^[_^&=+\-*/<>]$/.test(token[0])) className = "cm-obsidian-latex-operator";
      styled.push({ from: tokenFrom, to: tokenTo, className });
    }
  }

  styled.sort((a, b) => a.from - b.from || a.to - b.to);
  const builder = new RangeSetBuilder<Decoration>();
  for (const range of styled) {
    if (range.to <= range.from) continue;
    builder.add(range.from, range.to, Decoration.mark({ class: range.className }));
  }
  return builder.finish();
}

const latexHighlightField = StateField.define<DecorationSet>({
  create(state) { return latexDecorations(state.doc); },
  update(value, transaction) {
    return transaction.docChanged ? latexDecorations(transaction.state.doc) : value;
  },
  provide: (field) => EditorView.decorations.from(field),
});

let lineEndingGlyph = "␊";
const setLineEndingsVisible = StateEffect.define<boolean>();

class LineEndingWidget extends WidgetType {
  constructor(private readonly glyph: string) { super(); }
  eq(other: LineEndingWidget): boolean { return other.glyph === this.glyph; }
  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-ocr-eol";
    span.textContent = this.glyph;
    span.setAttribute("aria-hidden", "true");
    return span;
  }
  ignoreEvent(): boolean { return true; }
}

function lineEndingDecorations(doc: EditorState["doc"], visible: boolean): DecorationSet {
  if (!visible) return Decoration.none;
  const builder = new RangeSetBuilder<Decoration>();
  for (let lineNumber = 1; lineNumber < doc.lines; lineNumber += 1) {
    const line = doc.line(lineNumber);
    builder.add(
      line.to,
      line.to,
      Decoration.widget({ widget: new LineEndingWidget(lineEndingGlyph), side: 1 }),
    );
  }
  return builder.finish();
}

const lineEndingField = StateField.define<{ visible: boolean; decorations: DecorationSet }>({
  create(state) {
    return { visible: true, decorations: lineEndingDecorations(state.doc, true) };
  },
  update(value, transaction) {
    let visible = value.visible;
    for (const effect of transaction.effects) {
      if (effect.is(setLineEndingsVisible)) visible = effect.value;
    }
    if (transaction.docChanged || visible !== value.visible) {
      return { visible, decorations: lineEndingDecorations(transaction.state.doc, visible) };
    }
    return value;
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
});

type SourceMatch = { from: number; to: number };
const setSourceSearch = StateEffect.define<{ matches: SourceMatch[]; active: number }>();
const sourceSearchField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    value = value.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (!effect.is(setSourceSearch)) continue;
      const ranges = effect.value.matches
        .filter((match) => match.to > match.from)
        .map((match, index) => Decoration.mark({
          class: index === effect.value.active ? "cm-ocr-regex-match is-active" : "cm-ocr-regex-match",
        }).range(match.from, match.to));
      return Decoration.set(ranges, true);
    }
    return value;
  },
  provide: (field) => EditorView.decorations.from(field),
});

const setTargetLine = StateEffect.define<number>();
const targetLineField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    value = value.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (!effect.is(setTargetLine)) continue;
      const line = Math.max(1, Math.min(effect.value, transaction.state.doc.lines));
      const info = transaction.state.doc.line(line);
      value = Decoration.set([Decoration.line({ class: "cm-ocr-target-line" }).range(info.from)]);
    }
    return value;
  },
  provide: (field) => EditorView.decorations.from(field),
});

function render(text: string): void {
  const env = {};
  const tokens = md.parse(text, env);
  for (const token of tokens) {
    if (token.type === "html_block" || token.nesting !== 1 || !token.map?.length) continue;
    token.attrJoin("class", "md-source-block");
    token.attrSet("data-source-line", String(token.map[0] + 1));
  }
  const raw = md.renderer.render(tokens, md.options, env);
  preview.innerHTML = DOMPurify.sanitize(raw, {
    ALLOW_DATA_ATTR: true,
    USE_PROFILES: { html: true, mathMl: true },
  });
}

const uiTestMode = new URLSearchParams(window.location.search).get("ui-test") === "1";
const featureDebugRunner = new FeatureDebugRunner({
  progress: featureDebugProgress,
  progressTitle: featureDebugProgressTitle,
  progressList: featureDebugProgressList,
  delayMs: () => uiTestMode ? 80 : 650,
  completionHideDelayMs: () => uiTestMode ? 120 : 900,
});
const [initialSourceText, fixtureWorkingText, sidecarRaw] = await Promise.all([
  fetch("./source.md").then((response) => {
    if (!response.ok) throw new Error(`source load failed: ${response.status}`);
    return response.text();
  }),
  fetch("./working.md").then((response) => {
    if (!response.ok) throw new Error(`working copy load failed: ${response.status}`);
    return response.text();
  }),
  fetch("./sidecar.json").then((response) => {
    if (!response.ok) throw new Error(`sidecar load failed: ${response.status}`);
    return response.text();
  }),
]);
const initialWorkingText = uiTestMode ? initialSourceText : fixtureWorkingText;

let sourceText = initialSourceText;
let virtualSourcePath = "/demo/chapters/01 Buffett’s Alpha/01 Buffett’s Alpha.md";
let virtualWorkingPath = "/demo/chapters/01 Buffett’s Alpha/01 Buffett’s Alpha.working.md";
let sourceLabel = "chapters/01 Buffett’s Alpha/01 Buffett’s Alpha.md";
const loadedSidecar = uiTestMode
  ? { rows: [] as Candidate[], annotationPairs: [] as AnnotationPair[] }
  : candidatesFromSidecar(JSON.parse(sidecarRaw));
reviewRows = loadedSidecar.rows.map((row) => ({
  ...row,
  sourcePath: virtualSourcePath,
  workingCopyPath: virtualWorkingPath,
  sourceLabel,
}));
annotationPairs = loadedSidecar.annotationPairs.map((pair) => ({ ...pair, sourcePath: virtualSourcePath }));

const splitPatterns = (value: string): string[] => value
  .split(/^\s*---\s*$/m)
  .map((item) => item.trim())
  .filter(Boolean);
const annotationPatterns = splitPatterns(MODULE_REGEX_DEFAULTS["注释"] ?? "");
const embedPatterns = splitPatterns(MODULE_REGEX_DEFAULTS["嵌入块"] ?? "");
let application = new ChapterReviewApplication({ rows: reviewRows, annotationPairs });
let liveDiffChanges: ReturnType<typeof scanChapterBoundaryLines> = [];
type WorkbenchReviewMode = "chapter" | "boundary";
let workbenchReviewMode: WorkbenchReviewMode = "chapter";
let activeDriveChapter: { filePath: string; workingPath: string } | undefined;

function refreshReviewFromWorkingText(workingText: string): void {
  liveDiffChanges = scanChapterBoundaryLines(chapterDiffBaseline(sourceText, workingText), workingText);
  if (workbenchReviewMode === "boundary") {
    const snapshot = application.refreshChapterBoundary({
      baselineText: sourceText,
      workingText,
      workingPath: virtualWorkingPath,
      sourceLabel,
    });
    reviewRows = snapshot.rows;
    annotationPairs = snapshot.annotationPairs;
    return;
  }
  application.refreshChapterTitle({
    baselineText: sourceText,
    workingText,
    sourcePath: virtualSourcePath,
    workingPath: virtualWorkingPath,
    sourceLabel,
    embedPatterns,
  });
  application.refreshAnnotation({
    baselineText: sourceText,
    workingText,
    sourcePath: virtualSourcePath,
    workingPath: virtualWorkingPath,
    sourceLabel,
    patterns: annotationPatterns,
  });
  application.refreshEmbed({
    baselineText: sourceText,
    workingText,
    sourcePath: virtualSourcePath,
    workingPath: virtualWorkingPath,
    sourceLabel,
    patterns: embedPatterns,
  });
  application.refreshIllegalLineBreak({
    workingText,
    sourcePath: virtualSourcePath,
    workingPath: virtualWorkingPath,
  });
  const snapshot = application.applyWorkingCopyDiff({
    baselineText: sourceText,
    currentText: workingText,
    sourcePath: virtualSourcePath,
    workingPath: virtualWorkingPath,
  });
  reviewRows = snapshot.rows;
  annotationPairs = snapshot.annotationPairs;
}

refreshReviewFromWorkingText(initialWorkingText);
const sample = initialWorkingText;

const workbenchHistory = new WorkbenchHistory(100);
let suppressWorkbenchHistoryCapture = false;
let restoringWorkbenchSnapshot = false;

function workbenchSnapshot(workingText: string): WorkbenchHistorySnapshot {
  return {
    workingText,
    rows: reviewRows,
    annotationPairs,
  };
}

function updateWorkbenchHistoryControls(): void {
  undoWorkbenchButton.disabled = !workbenchHistory.canUndo;
  redoWorkbenchButton.disabled = !workbenchHistory.canRedo;
  undoWorkbenchButton.setAttribute("aria-disabled", undoWorkbenchButton.disabled ? "true" : "false");
  redoWorkbenchButton.setAttribute("aria-disabled", redoWorkbenchButton.disabled ? "true" : "false");
}

function clearWorkbenchHistory(): void {
  workbenchHistory.clear();
  updateWorkbenchHistoryControls();
}

function recordWorkbenchSnapshot(snapshot: WorkbenchHistorySnapshot): void {
  workbenchHistory.record(snapshot);
  updateWorkbenchHistoryControls();
}

function recordWorkbenchHistory(workingTextBefore: string): void {
  recordWorkbenchSnapshot(workbenchSnapshot(workingTextBefore));
}

const sourceLineSeparator = sample.includes("\r\n") ? "\r\n" : sample.includes("\r") ? "\r" : "\n";
lineEndingGlyph = sourceLineSeparator === "\r\n" ? "␍␊" : sourceLineSeparator === "\r" ? "␍" : "␊";

let gridApi: ReturnType<typeof createGrid<ReviewRow>> | undefined;
type ReviewModule = "章节定界" | "章节标题" | "注释" | "嵌入块" | "非法断行" | "变动行";
let activeModule: ReviewModule = "章节标题";
let suppressChangedLinesNoticeOnce = false;

function moduleTagFor(module: ReviewModule): HTMLButtonElement | undefined {
  return moduleTags.find((tag) => tag.dataset.module === module);
}

function ensureModuleNoticeBadge(tag: HTMLButtonElement): HTMLElement {
  const existing = tag.querySelector<HTMLElement>(".module-tag-badge");
  if (existing) return existing;
  const badge = document.createElement("span");
  badge.className = "module-tag-badge";
  badge.hidden = true;
  tag.append(badge);
  return badge;
}

function clearModuleNotice(module: ReviewModule): void {
  const tag = moduleTagFor(module);
  if (!tag) return;
  const badge = ensureModuleNoticeBadge(tag);
  badge.hidden = true;
  badge.textContent = "";
  tag.classList.remove("has-change-notice");
}

function showModuleNotice(module: ReviewModule, count: number): void {
  if (count <= 0) return;
  const tag = moduleTagFor(module);
  if (!tag) return;
  const badge = ensureModuleNoticeBadge(tag);
  badge.textContent = `+${count}`;
  badge.hidden = false;
  tag.classList.remove("has-change-notice");
  void tag.offsetWidth;
  tag.classList.add("has-change-notice");
}

function clearChangedLinesNotice(): void {
  clearModuleNotice("变动行");
}

function showChangedLinesNotice(count: number): void {
  showModuleNotice("变动行", count);
}

function activeRows(): ReviewRow[] {
  if (activeModule === "变动行") return uncoveredChangedRows();
  return reviewRows.filter((row) => {
    if (row.typeLabel !== activeModule) return false;
    if (row.lineType === "已忽略") return false;
    if (activeModule !== "章节标题") return true;
    return /^[1-6]\s*级标题$/.test(row.lineType ?? "");
  });
}

function annotationPairForRow(row: ReviewRow | undefined): AnnotationPair | undefined {
  if (!row || row.typeLabel !== "注释") return undefined;
  return annotationPairs.find((pair) => pair.refCandidateId === row.id || pair.bodyCandidateId === row.id);
}

function annotationPairStatusForRow(row: ReviewRow | undefined): string {
  if (!row || row.typeLabel !== "注释") return "";
  if (row.lineType !== "注释引用" && row.lineType !== "注释正文") return "";
  if (!String(row.annotationNumber ?? "").trim()) return "待补注释号";
  const pair = annotationPairForRow(row);
  if (pair) return pair.status;
  return row.lineType === "注释引用" ? "待补正文" : "待补引用";
}

function currentRowDiffState(row: ReviewRow | undefined): "added" | "modified" | "deleted" | undefined {
  if (!row) return undefined;
  if (row.chapterBoundaryState === "deleted") {
    const baselineText = row.baselinePreview ?? row.raw;
    const deleted = liveDiffChanges.find((change) => change.state === "deleted" && change.text === baselineText);
    return deleted ? "deleted" : undefined;
  }
  const startLine = row.range.line;
  const endLine = row.typeLabel === "章节标题" ? startLine : (row.range.endLine ?? startLine);
  const changed = liveDiffChanges.find((change) =>
    change.state !== "deleted" && change.line >= startLine && change.line <= endLine,
  );
  return changed?.state === "added" || changed?.state === "modified" ? changed.state : undefined;
}

function modifiedCharacterSpan(
  change: ReturnType<typeof scanChapterBoundaryLines>[number],
): { start: number; end: number } | undefined {
  if (change.state !== "modified" || change.baselineText === undefined) return undefined;
  const before = change.baselineText;
  const after = change.text;
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start += 1;

  let beforeEnd = before.length;
  let afterEnd = after.length;
  while (
    beforeEnd > start
    && afterEnd > start
    && before[beforeEnd - 1] === after[afterEnd - 1]
  ) {
    beforeEnd -= 1;
    afterEnd -= 1;
  }
  return { start, end: afterEnd };
}

function rowOverlapsModifiedCharacters(
  row: ReviewRow,
  change: ReturnType<typeof scanChapterBoundaryLines>[number],
): boolean {
  const span = modifiedCharacterSpan(change);
  if (!span) return true;

  const rowStartLine = row.range.line;
  const rowEndLine = row.range.endLine ?? row.range.line;
  if (change.line < rowStartLine || change.line > rowEndLine) return false;

  const start = change.line === rowStartLine ? row.range.start : 0;
  const end = change.line === rowEndLine ? row.range.end : Number.POSITIVE_INFINITY;
  if (span.start === span.end) return span.start >= start && span.start <= end;
  return span.start < end && span.end > start;
}

function rowCoversChangedLine(
  row: ReviewRow,
  change: ReturnType<typeof scanChapterBoundaryLines>[number],
): boolean {
  if (row.lineType === "已忽略") return false;

  if (row.typeLabel === "章节标题") {
    if (!/^[1-6]\s*级标题$/.test(row.lineType ?? "")) return false;
    if (change.state === "deleted") {
      const baseline = row.baselinePreview ?? row.raw;
      return row.chapterBoundaryState === "deleted" && baseline === change.text;
    }
    return row.range.line === change.line;
  }

  if (row.typeLabel !== "注释" && row.typeLabel !== "嵌入块" && row.typeLabel !== "非法断行") {
    return false;
  }
  if (row.typeLabel === "非法断行" && !row.isWorkingCorrection) {
    return false;
  }

  if (change.state === "deleted") {
    const baseline = row.baselinePreview ?? row.raw;
    return row.chapterBoundaryState === "deleted" && baseline === change.text;
  }

  const startLine = row.range.line;
  const endLine = row.range.endLine ?? startLine;
  if (change.line < startLine || change.line > endLine) return false;
  if (change.state === "modified") return rowOverlapsModifiedCharacters(row, change);
  return true;
}

type ChangedLineReviewRow = ReviewRow & { changeOwner?: string };

function changeOwnerFor(
  change: ReturnType<typeof scanChapterBoundaryLines>[number],
): string {
  const owners = ["章节标题", "注释", "嵌入块", "非法断行"] as const;
  for (const owner of owners) {
    if (reviewRows.some((row) => row.typeLabel === owner && rowCoversChangedLine(row, change))) return owner;
  }
  return "未归类";
}

function uncoveredChangedRows(): ChangedLineReviewRow[] {
  const stateLabel = {
    heading: "未变",
    added: "新增",
    modified: "修改",
    deleted: "删除",
  } as const;

  return liveDiffChanges
    .filter((change) => change.state !== "heading")
    .map((change) => ({
      id: `change-audit-${change.id}`,
      kind: "regex" as const,
      label: `${stateLabel[change.state]} · L${change.line + 1}`,
      raw: change.text,
      preview: change.text,
      range: {
        line: Math.max(0, change.line),
        start: 0,
        end: change.text.length,
      },
      lineType: stateLabel[change.state],
      chapterBoundaryState: change.state,
      baselinePreview: change.baselineText ?? (change.state === "deleted" ? change.text : undefined),
      workingCopyPath: virtualWorkingPath,
      sourcePath: virtualSourcePath,
      sourceLabel,
      status: "候选" as const,
      changeOwner: changeOwnerFor(change),
    }));
}

const view = new EditorView({
  parent: editorHost,
  state: EditorState.create({
    doc: sample,
    extensions: [
      lineNumbers(),
      highlightActiveLineGutter(),
      markdown(),
      syntaxHighlighting(obsidianSyntaxHighlight),
      EditorState.lineSeparator.of(sourceLineSeparator),
      keymap.of(defaultKeymap),
      sourceHeadingField,
      latexHighlightField,
      lineEndingField,
      sourceSearchField,
      targetLineField,
      EditorView.lineWrapping,
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;
        if (restoringWorkbenchSnapshot) return;
        if (!suppressWorkbenchHistoryCapture) {
          recordWorkbenchHistory(update.startState.doc.toString());
        }
        const previousDiffIds = new Set(
          liveDiffChanges.filter((change) => change.state !== "heading").map((change) => change.id),
        );
        const workingText = update.state.doc.toString();
        render(workingText);
        refreshReviewFromWorkingText(workingText);
        const newDiffCount = liveDiffChanges.filter(
          (change) => change.state !== "heading" && !previousDiffIds.has(change.id),
        ).length;
        if (!suppressChangedLinesNoticeOnce && newDiffCount > 0) showChangedLinesNotice(newDiffCount);
        suppressChangedLinesNoticeOnce = false;
        gridApi?.setGridOption("rowData", activeRows());
        featureDebugRunner.refreshControls();
        if (editorPaneMode === "source") {
          status.textContent = `工作稿已编辑 · ${update.state.doc.lines} 行 · 数据表已同步`;
        }
        requestAnimationFrame(() => {
          syncPreviewFromEditor();
          runRegexSearch(false);
          gridApi?.refreshCells({ force: true });
          gridApi?.redrawRows();
          updateGridCounters();
        });
      }),
    ],
  }),
});
render(sample);
status.textContent = `工作稿 · ${view.state.doc.lines} 行 · 原稿只读基线 · 数据表已同步`;
updateWorkbenchHistoryControls();

function refreshWorkbenchUiAfterHistoryRestore(workingText: string): void {
  liveDiffChanges = scanChapterBoundaryLines(chapterDiffBaseline(sourceText, workingText), workingText);
  render(workingText);
  gridApi?.setGridOption("rowData", activeRows());
  gridApi?.refreshCells({ force: true });
  gridApi?.redrawRows();
  updateGridCounters();
  featureDebugRunner.refreshControls();
  requestAnimationFrame(() => {
    syncPreviewFromEditor();
    runRegexSearch(false);
    gridApi?.refreshCells({ force: true });
    gridApi?.redrawRows();
    updateGridCounters();
  });
}

function applyWorkbenchHistorySnapshot(snapshot: WorkbenchHistorySnapshot): void {
  restoringWorkbenchSnapshot = true;
  suppressWorkbenchHistoryCapture = true;
  try {
    reviewRows = snapshot.rows;
    annotationPairs = snapshot.annotationPairs;
    application = new ChapterReviewApplication({ rows: reviewRows, annotationPairs });
    if (view.state.doc.toString() !== snapshot.workingText) {
      const currentLine = Math.min(view.state.doc.lineAt(view.state.selection.main.head).number, snapshot.workingText.split(/\r\n?|\n/).length);
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: snapshot.workingText },
        selection: { anchor: 0 },
        effects: [setTargetLine.of(Math.max(1, currentLine)), EditorView.scrollIntoView(0, { y: "start" })],
      });
    }
    refreshWorkbenchUiAfterHistoryRestore(snapshot.workingText);
  } finally {
    restoringWorkbenchSnapshot = false;
    suppressWorkbenchHistoryCapture = false;
  }
}

function performWorkbenchUndo(): boolean {
  const target = workbenchHistory.undo(workbenchSnapshot(view.state.doc.toString()));
  if (!target) {
    updateWorkbenchHistoryControls();
    status.textContent = "没有可撤销的操作";
    return false;
  }
  applyWorkbenchHistorySnapshot(target);
  updateWorkbenchHistoryControls();
  status.textContent = `已撤销 · 可撤销 ${workbenchHistory.undoDepth} · 可重做 ${workbenchHistory.redoDepth}`;
  return true;
}

function performWorkbenchRedo(): boolean {
  const target = workbenchHistory.redo(workbenchSnapshot(view.state.doc.toString()));
  if (!target) {
    updateWorkbenchHistoryControls();
    status.textContent = "没有可重做的操作";
    return false;
  }
  applyWorkbenchHistorySnapshot(target);
  updateWorkbenchHistoryControls();
  status.textContent = `已重做 · 可撤销 ${workbenchHistory.undoDepth} · 可重做 ${workbenchHistory.redoDepth}`;
  return true;
}

undoWorkbenchButton.addEventListener("click", () => {
  performWorkbenchUndo();
});

redoWorkbenchButton.addEventListener("click", () => {
  performWorkbenchRedo();
});

document.addEventListener("keydown", (event) => {
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
  if (customCssEditorHost.contains(target as Node)) return;

  const modifier = event.metaKey || event.ctrlKey;
  if (!modifier) return;
  const key = event.key.toLowerCase();
  if (key === "z") {
    event.preventDefault();
    event.stopPropagation();
    if (event.shiftKey) performWorkbenchRedo();
    else performWorkbenchUndo();
    return;
  }
  if (key === "y" && event.ctrlKey && !event.metaKey) {
    event.preventDefault();
    event.stopPropagation();
    performWorkbenchRedo();
  }
}, true);

function setWorkbenchReviewMode(mode: WorkbenchReviewMode): void {
  workbenchReviewMode = mode;
  for (const tag of moduleTags) {
    const module = tag.dataset.module as ReviewModule | undefined;
    if (!module) continue;
    tag.hidden = mode === "boundary" ? module !== "章节定界" : module === "章节定界";
  }
}

function loadDriveDocument(file: GoogleDriveWorkspaceOpenedFile): void {
  activeDriveChapter = undefined;
  saveCalibrationButton.disabled = true;
  setWorkbenchReviewMode("chapter");
  sourceText = file.text;
  virtualSourcePath = `/gd${file.path}`;
  virtualWorkingPath = `/gd${file.path}.working`;
  sourceLabel = file.path.replace(/^\//, "");
  reviewRows = [];
  annotationPairs = [];
  liveDiffChanges = [];
  application = new ChapterReviewApplication({ rows: [], annotationPairs: [] });

  const lineSeparator = file.text.includes("\r\n") ? "\r\n" : file.text.includes("\r") ? "\r" : "\n";
  lineEndingGlyph = lineSeparator === "\r\n" ? "␍␊" : lineSeparator === "\r" ? "␍" : "␊";

  clearWorkbenchHistory();
  suppressWorkbenchHistoryCapture = true;
  try {
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: file.text },
      selection: { anchor: 0 },
      effects: [setTargetLine.of(1), EditorView.scrollIntoView(0, { y: "start" })],
    });
  } finally {
    suppressWorkbenchHistoryCapture = false;
  }
  workspaceDocument.textContent = `GD · ${file.path}`;
  status.textContent = `GD 工作稿 · ${file.name} · ${view.state.doc.lines} 行 · 远端打开版本为只读基线`;
  selectModule("章节标题");
  gridApi?.setGridOption("rowData", activeRows());
  gridApi?.refreshCells({ force: true });
  updateGridCounters();
  requestAnimationFrame(() => {
    syncPreviewFromEditor();
    runRegexSearch(false);
  });
}

function loadDriveChapter(chapter: GoogleDriveWorkspaceOpenedChapter): void {
  activeDriveChapter = { filePath: chapter.path, workingPath: chapter.workingPath };
  saveCalibrationButton.disabled = false;
  setWorkbenchReviewMode("chapter");
  sourceText = chapter.originalText;
  virtualSourcePath = chapter.path;
  virtualWorkingPath = chapter.workingPath;
  sourceLabel = chapter.path.replace(/^\//, "");
  reviewRows = chapter.sidecar.rows.map((row) => ({
    ...row,
    sourcePath: virtualSourcePath,
    workingCopyPath: virtualWorkingPath,
    sourceLabel,
  }));
  annotationPairs = chapter.sidecar.annotationPairs.map((pair) => ({
    ...pair,
    sourcePath: virtualSourcePath,
  }));
  liveDiffChanges = [];
  application = new ChapterReviewApplication({ rows: reviewRows, annotationPairs });

  const lineSeparator = chapter.workingText.includes("\r\n") ? "\r\n" : chapter.workingText.includes("\r") ? "\r" : "\n";
  lineEndingGlyph = lineSeparator === "\r\n" ? "␍␊" : lineSeparator === "\r" ? "␍" : "␊";
  refreshReviewFromWorkingText(chapter.workingText);

  clearWorkbenchHistory();
  suppressWorkbenchHistoryCapture = true;
  try {
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: chapter.workingText },
      selection: { anchor: 0 },
      effects: [setTargetLine.of(1), EditorView.scrollIntoView(0, { y: "start" })],
    });
  } finally {
    suppressWorkbenchHistoryCapture = false;
  }
  workspaceDocument.textContent = `GD · ${chapter.path}`;
  const loadedCalibration = Boolean(chapter.sidecar.sidecarPath || chapter.sidecar.rows.length || chapter.sidecar.annotationPairs.length);
  status.textContent = loadedCalibration
    ? `章节工作稿 · ${chapter.name} · 已自动加载标定 ${reviewRows.length} 行`
    : `章节工作稿 · ${chapter.name} · 暂无已保存标定`;
  selectModule("章节标题");
  gridApi?.setGridOption("rowData", activeRows());
  gridApi?.refreshCells({ force: true });
  updateGridCounters();
  requestAnimationFrame(() => {
    syncPreviewFromEditor();
    runRegexSearch(false);
  });
}

function loadDriveBoundaryDocument(file: GoogleDriveWorkspaceOpenedFile): void {
  activeDriveChapter = undefined;
  saveCalibrationButton.disabled = true;
  setWorkbenchReviewMode("boundary");
  sourceText = file.text;
  virtualSourcePath = `/gd${file.path}`;
  virtualWorkingPath = `/gd${file.path}`;
  sourceLabel = file.path.replace(/^\//, "");
  reviewRows = [];
  annotationPairs = [];
  liveDiffChanges = [];
  application = new ChapterReviewApplication({ rows: [], annotationPairs: [] });

  const lineSeparator = file.text.includes("\r\n") ? "\r\n" : file.text.includes("\r") ? "\r" : "\n";
  lineEndingGlyph = lineSeparator === "\r\n" ? "␍␊" : lineSeparator === "\r" ? "␍" : "␊";
  clearWorkbenchHistory();
  suppressWorkbenchHistoryCapture = true;
  try {
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: file.text },
      selection: { anchor: 0 },
      effects: [setTargetLine.of(1), EditorView.scrollIntoView(0, { y: "start" })],
    });
  } finally {
    suppressWorkbenchHistoryCapture = false;
  }
  refreshReviewFromWorkingText(file.text);
  workspaceDocument.textContent = `GD · 章节定界 · ${file.path}`;
  status.textContent = `章节定界工作稿 · ${view.state.doc.lines} 行 · OCR 序列已自然序合并`;
  selectModule("章节定界");
  gridApi?.setGridOption("rowData", activeRows());
  gridApi?.refreshCells({ force: true });
  updateGridCounters();
  requestAnimationFrame(() => {
    syncPreviewFromEditor();
    runRegexSearch(false);
  });
}

const CHAPTER_TITLE_LINE_TYPES = [
  "1 级标题",
  "2 级标题",
  "3 级标题",
  "4 级标题",
  "5 级标题",
  "6 级标题",
  IGNORED_LINE_TYPE,
] as const;
const CHAPTER_BOUNDARY_LINE_TYPES = ["1 级标题", "新增", "修改", "删除", IGNORED_LINE_TYPE, "已删除"] as const;

function lineTypesForRow(row: ReviewRow | undefined): readonly string[] {
  if (row?.typeLabel === "章节定界") return CHAPTER_BOUNDARY_LINE_TYPES;
  if (row?.typeLabel === "章节标题") return CHAPTER_TITLE_LINE_TYPES;

  const moduleLineTypes = reviewRows
    .filter((candidate) => !row || candidate.typeLabel === row.typeLabel)
    .map((candidate) => candidate.lineType)
    .filter((value): value is string => Boolean(value));
  return Array.from(new Set([...moduleLineTypes, IGNORED_LINE_TYPE]))
    .sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function locateReviewRow(row: ReviewRow): { offset: number; line: number } | undefined {
  const text = view.state.doc.toString();
  if (row.chapterBoundaryState !== "deleted" && row.range.line >= 0 && row.range.line < view.state.doc.lines) {
    const line = view.state.doc.line(row.range.line + 1);
    return { offset: Math.min(line.from + Math.max(0, row.range.start), line.to), line: row.range.line + 1 };
  }
  const candidates = [row.raw, row.preview, row.baselinePreview].filter((value): value is string => Boolean(value?.trim()));
  for (const candidate of candidates) {
    const exact = text.indexOf(candidate);
    if (exact >= 0) return { offset: exact, line: view.state.doc.lineAt(exact).number };
  }
  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    if (trimmed.length < 16) continue;
    const pattern = escapeRegex(trimmed).replace(/\s+/g, "\\s+");
    try {
      const match = new RegExp(pattern, "u").exec(text);
      if (match?.index != null) return { offset: match.index, line: view.state.doc.lineAt(match.index).number };
    } catch {
      // Ignore malformed fallback patterns and report the row as unlocatable.
    }
  }
  return undefined;
}

function jumpToReviewRow(row: ReviewRow): void {
  if (activeModule === "变动行" && row.chapterBoundaryState === "deleted") {
    gridStatus.textContent = "该行已删除，无法定位到工作稿";
    return;
  }
  const located = locateReviewRow(row);
  if (!located) {
    gridStatus.textContent = `当前源码无法定位 · ${row.typeLabel} / ${row.lineType}`;
    return;
  }
  const info = view.state.doc.line(located.line);
  view.dispatch({
    selection: { anchor: located.offset },
    effects: [
      setTargetLine.of(located.line),
      EditorView.scrollIntoView(info.from, { y: "center" }),
    ],
  });
  view.focus();
  gridStatus.textContent = `已定位源码第 ${located.line} 行 · ${row.typeLabel} / ${row.lineType}`;
  requestAnimationFrame(syncPreviewFromEditor);
}

function applyReviewRowLineType(row: ReviewRow, lineType: string): void {
  if (row.lineType === lineType) {
    gridStatus.textContent = `行类型已经是 ${lineType}`;
    return;
  }

  if (row.typeLabel === "章节标题" && /^[1-6]\s*级标题$/.test(lineType)) {
    const edits = planHeadingLineTypeEdits(view.state.doc.toString(), [row], lineType);
    if (!edits.length) {
      gridStatus.textContent = "标题层级没有变化";
      jumpToReviewRow(row);
      return;
    }
    const targetLine = edits[0].line;
    view.dispatch({
      changes: edits
        .map((edit) => {
          const line = view.state.doc.line(edit.line + 1);
          return { from: line.from, to: line.to, insert: edit.replacement };
        })
        .sort((left, right) => right.from - left.from),
    });
    gridStatus.textContent = `工作稿标题已改为 ${lineType}`;
    requestAnimationFrame(() => {
      const refreshed = reviewRows.find((candidate) =>
        candidate.typeLabel === "章节标题"
        && candidate.range.line === targetLine
        && candidate.chapterBoundaryState !== "deleted");
      jumpToReviewRow(refreshed ?? row);
    });
    return;
  }

  recordWorkbenchHistory(view.state.doc.toString());
  const next = application.setRowsLineType({
    ids: [row.id],
    lineType,
    text: view.state.doc.toString(),
    sourcePath: virtualSourcePath,
    workingPath: virtualWorkingPath,
  });
  reviewRows = next.rows;
  annotationPairs = next.annotationPairs;
  gridApi?.setGridOption("rowData", activeRows());
  gridStatus.textContent = `行类型已标定为 ${lineType}`;
  requestAnimationFrame(() => {
    const refreshed = reviewRows.find((candidate) => candidate.id === row.id);
    if (lineType !== IGNORED_LINE_TYPE) jumpToReviewRow(refreshed ?? row);
  });
}

function lineTypeRenderer(params: ICellRendererParams<ReviewRow, string>): HTMLElement {
  const select = document.createElement("select");
  select.className = "line-type-select";
  const allowedLineTypes = lineTypesForRow(params.data);
  for (const value of allowedLineTypes) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.append(option);
  }
  const current = String(params.value ?? "");
  if (current && !allowedLineTypes.includes(current)) {
    const currentOption = document.createElement("option");
    currentOption.value = current;
    currentOption.textContent = current;
    currentOption.disabled = true;
    select.prepend(currentOption);
  }
  select.value = current || IGNORED_LINE_TYPE;
  select.addEventListener("click", (event) => event.stopPropagation());
  select.addEventListener("change", () => {
    if (params.data) applyReviewRowLineType(params.data, select.value);
  });
  return select;
}

function reviewPreviewRenderer(params: ICellRendererParams<ReviewRow, string>): HTMLElement {
  const node = document.createElement("div");
  node.className = "grid-preview-cell";
  node.textContent = String(params.value ?? "");
  const heading = params.data?.lineType?.match(/^([1-6])\s*级标题$/);
  if (heading) node.classList.add(`is-h${heading[1]}`);
  if (activeModule === "变动行" && params.data?.chapterBoundaryState === "deleted") {
    node.classList.add("is-deleted");
    node.title = "该行已删除，无法定位到工作稿";
  }
  return node;
}

function firstCodePoints(text: string, count: number): string {
  return Array.from(text).slice(0, count).join("");
}

function lastCodePoints(text: string, count: number): string {
  return Array.from(text).slice(-count).join("");
}

function illegalLineBreakPreview(row: ReviewRow | undefined): string {
  if (!row) return "";
  const previous = String(row.previousLineText ?? "").trimEnd();
  const next = String(row.nextLineText ?? "").trimStart();
  if (!previous && !next) return String(row.preview ?? "");
  return `${lastCodePoints(previous, 10)} ⏎ ${firstCodePoints(next, 10)}`;
}

function jumpToIllegalLineBreak(row: ReviewRow): void {
  const previousLineNumber = row.range.line + 1;
  const nextLineNumber = (row.range.endLine ?? row.range.line + 1) + 1;
  if (previousLineNumber < 1 || nextLineNumber > view.state.doc.lines || previousLineNumber >= nextLineNumber) {
    jumpToReviewRow(row);
    return;
  }

  const previousLine = view.state.doc.line(previousLineNumber);
  const nextLine = view.state.doc.line(nextLineNumber);
  const previousContent = previousLine.text.trimEnd();
  const nextContent = nextLine.text.trimStart();
  const previousTail = lastCodePoints(previousContent, 10);
  const nextHead = firstCodePoints(nextContent, 10);
  const nextLeadingWhitespace = nextLine.text.length - nextContent.length;
  const from = previousLine.from + previousContent.length - previousTail.length;
  const to = nextLine.from + nextLeadingWhitespace + nextHead.length;

  view.dispatch({
    selection: { anchor: from, head: Math.max(from, to) },
    effects: [
      setTargetLine.of(previousLineNumber),
      EditorView.scrollIntoView(from, { y: "center" }),
    ],
  });
  view.focus();
  gridStatus.textContent = `已定位断行 · 第 ${previousLineNumber} → ${nextLineNumber} 行 · 前后各 10 字`;
  requestAnimationFrame(syncPreviewFromEditor);
}

function illegalLineBreakPreviewRenderer(params: ICellRendererParams<ReviewRow, string>): HTMLElement {
  const node = document.createElement("div");
  node.className = "grid-preview-cell illegal-line-break-preview";
  node.textContent = illegalLineBreakPreview(params.data);
  node.title = "点击定位并选中断点前后各 10 个字符";
  node.addEventListener("click", (event) => {
    event.stopPropagation();
    if (params.data) jumpToIllegalLineBreak(params.data);
  });
  return node;
}

function annotationNumberRenderer(params: ICellRendererParams<ReviewRow, string>): HTMLElement {
  const input = document.createElement("input");
  input.className = "annotation-number-input";
  input.type = "text";
  input.spellcheck = false;
  input.value = String(params.value ?? "");
  input.setAttribute("aria-label", "注释号");
  input.addEventListener("click", (event) => event.stopPropagation());
  input.addEventListener("change", () => {
    if (!params.data) return;
    const nextValue = input.value.trim();
    const currentValue = String(params.data.annotationNumber ?? "").trim();
    if (nextValue === currentValue) return;
    recordWorkbenchHistory(view.state.doc.toString());
    const next = application.setAnnotationNumber(params.data.id, input.value);
    reviewRows = next.rows;
    annotationPairs = next.annotationPairs;
    gridApi?.setGridOption("rowData", activeRows());
    gridApi?.refreshCells({ force: true });
    gridApi?.redrawRows();
    gridStatus.textContent = `注释号已改为 ${input.value.trim() || "空"} · 配对已重算`;
    updateGridCounters();
  });
  return input;
}

function chapterFileRenderer(params: ICellRendererParams<ReviewRow, string>): HTMLElement {
  const input = document.createElement("input");
  input.className = "annotation-number-input";
  input.type = "text";
  input.spellcheck = false;
  input.value = String(params.value ?? "");
  input.placeholder = params.data?.lineType === "1 级标题" ? "例如 01 章节名.md" : "";
  input.disabled = params.data?.lineType !== "1 级标题";
  input.setAttribute("aria-label", "章节文件");
  input.addEventListener("click", (event) => event.stopPropagation());
  input.addEventListener("change", () => {
    if (!params.data || params.data.lineType !== "1 级标题") return;
    const nextValue = input.value.trim();
    if (nextValue === String(params.data.chapterFile ?? "").trim()) return;
    recordWorkbenchHistory(view.state.doc.toString());
    const next = application.setChapterFile([params.data.id], nextValue);
    reviewRows = next.rows;
    annotationPairs = next.annotationPairs;
    gridApi?.setGridOption("rowData", activeRows());
    gridApi?.refreshCells({ force: true });
    gridStatus.textContent = `章节文件已设为 ${input.value.trim() || "空"}`;
    updateGridCounters();
  });
  return input;
}

const rowSelection: RowSelectionOptions = {
  mode: "multiRow",
  checkboxes: true,
  headerCheckbox: true,
  enableClickSelection: false,
};

const standardColumnDefs: ColDef<ReviewRow>[] = [
  {
    colId: "sourceLine",
    headerName: "行号",
    width: 84,
    minWidth: 72,
    pinned: "left",
    sortable: true,
    sort: "asc",
    sortIndex: 0,
    valueGetter: (params) => params.data ? params.data.range.line + 1 : null,
  },
  { field: "lineType", headerName: "行类型", width: 150, filter: true, cellRenderer: lineTypeRenderer },
  { field: "preview", headerName: "预览", minWidth: 360, flex: 1, cellRenderer: reviewPreviewRenderer },
  { field: "status", headerName: "状态", width: 95, filter: true },
  {
    colId: "currentDiff",
    headerName: "变更",
    width: 120,
    filter: true,
    valueGetter: (params) => currentRowDiffState(params.data) ? "与原稿不同" : "",
  },
];

const changedLineColumnDefs: ColDef<ReviewRow>[] = [
  {
    colId: "sourceLine",
    headerName: "行号",
    width: 84,
    minWidth: 72,
    pinned: "left",
    sortable: true,
    sort: "asc",
    sortIndex: 0,
    valueGetter: (params) => params.data ? params.data.range.line + 1 : null,
  },
  { field: "lineType", headerName: "变动", width: 100, filter: true },
  {
    colId: "changeOwner",
    headerName: "归属模块",
    width: 120,
    filter: true,
    valueGetter: (params) => (params.data as ChangedLineReviewRow | undefined)?.changeOwner ?? "未归类",
  },
  { field: "preview", headerName: "变动内容", minWidth: 360, flex: 1, cellRenderer: reviewPreviewRenderer },
  { field: "baselinePreview", headerName: "原稿内容", minWidth: 300, flex: 1 },
];

const chapterBoundaryColumnDefs: ColDef<ReviewRow>[] = [
  {
    colId: "sourceLine",
    headerName: "行号",
    width: 84,
    minWidth: 72,
    pinned: "left",
    sortable: true,
    sort: "asc",
    sortIndex: 0,
    valueGetter: (params) => params.data ? params.data.range.line + 1 : null,
  },
  { field: "lineType", headerName: "行类型", width: 130, filter: true, cellRenderer: lineTypeRenderer },
  { field: "preview", headerName: "预览", minWidth: 320, flex: 1, cellRenderer: reviewPreviewRenderer },
  {
    field: "chapterFile",
    colId: "chapterFile",
    headerName: "章节文件",
    minWidth: 210,
    width: 260,
    cellRenderer: chapterFileRenderer,
  },
  {
    colId: "currentDiff",
    headerName: "变更",
    width: 120,
    filter: true,
    valueGetter: (params) => currentRowDiffState(params.data) ? "与原稿不同" : "",
  },
];

const annotationColumnDefs: ColDef<ReviewRow>[] = [
  {
    colId: "sourceLine",
    headerName: "行号",
    width: 84,
    minWidth: 72,
    pinned: "left",
    sortable: true,
    sort: "asc",
    sortIndex: 1,
    valueGetter: (params) => params.data ? params.data.range.line + 1 : null,
  },
  { field: "lineType", headerName: "行类型", width: 130, filter: true, cellRenderer: lineTypeRenderer },
  {
    field: "annotationNumber",
    colId: "annotationNumber",
    headerName: "注释号",
    width: 92,
    minWidth: 82,
    sortable: true,
    sort: "asc",
    sortIndex: 0,
    comparator: (left, right) => {
      const leftNumber = String(left ?? "").trim();
      const rightNumber = String(right ?? "").trim();
      if (!leftNumber && rightNumber) return 1;
      if (leftNumber && !rightNumber) return -1;
      return leftNumber.localeCompare(rightNumber, "zh-CN", { numeric: true });
    },
    cellRenderer: annotationNumberRenderer,
  },
  { field: "preview", headerName: "预览", minWidth: 320, flex: 1, cellRenderer: reviewPreviewRenderer },
  {
    colId: "annotationPairStatus",
    headerName: "配对状态",
    width: 112,
    filter: true,
    valueGetter: (params) => annotationPairStatusForRow(params.data),
  },
  {
    colId: "currentDiff",
    headerName: "变更",
    width: 120,
    filter: true,
    valueGetter: (params) => currentRowDiffState(params.data) ? "与原稿不同" : "",
  },
];

const embedColumnDefs: ColDef<ReviewRow>[] = [
  {
    field: "embedNumber",
    colId: "embedNumber",
    headerName: "组号",
    width: 78,
    minWidth: 68,
    pinned: "left",
    sortable: true,
    sort: "asc",
    sortIndex: 0,
    comparator: (left, right) => {
      const leftNumber = typeof left === "number" ? left : Number.POSITIVE_INFINITY;
      const rightNumber = typeof right === "number" ? right : Number.POSITIVE_INFINITY;
      return leftNumber - rightNumber;
    },
  },
  {
    colId: "sourceLine",
    headerName: "行号",
    width: 84,
    minWidth: 72,
    sortable: true,
    sort: "asc",
    sortIndex: 1,
    valueGetter: (params) => params.data ? params.data.range.line + 1 : null,
  },
  { field: "lineType", headerName: "行类型", width: 150, filter: true, cellRenderer: lineTypeRenderer },
  { field: "preview", headerName: "预览", minWidth: 360, flex: 1, cellRenderer: reviewPreviewRenderer },
  { field: "status", headerName: "状态", width: 95, filter: true },
  {
    colId: "currentDiff",
    headerName: "变更",
    width: 120,
    filter: true,
    valueGetter: (params) => currentRowDiffState(params.data) ? "与原稿不同" : "",
  },
];

const illegalLineBreakColumnDefs: ColDef<ReviewRow>[] = [
  {
    colId: "sourceLine",
    headerName: "断行处",
    width: 92,
    minWidth: 80,
    pinned: "left",
    sortable: true,
    sort: "asc",
    sortIndex: 0,
    valueGetter: (params) => params.data ? params.data.range.line + 1 : null,
  },
  { field: "lineType", headerName: "行类型", width: 130, filter: true, cellRenderer: lineTypeRenderer },
  {
    colId: "illegalBreakPreview",
    headerName: "预览（前10 + 后10）",
    minWidth: 300,
    flex: 1,
    valueGetter: (params) => illegalLineBreakPreview(params.data),
    cellRenderer: illegalLineBreakPreviewRenderer,
  },
  { field: "breakReason", headerName: "判断", minWidth: 220, flex: 1, filter: true },
  {
    colId: "currentDiff",
    headerName: "变更",
    width: 120,
    filter: true,
    valueGetter: (params) => currentRowDiffState(params.data) ? "与原稿不同" : "",
  },
];

function columnDefsForModule(module: ReviewModule): ColDef<ReviewRow>[] {
  if (module === "章节定界") return chapterBoundaryColumnDefs;
  if (module === "变动行") return changedLineColumnDefs;
  if (module === "注释") return annotationColumnDefs;
  if (module === "嵌入块") return embedColumnDefs;
  if (module === "非法断行") return illegalLineBreakColumnDefs;
  return standardColumnDefs;
}

const gridTheme = themeQuartz.withParams({
  fontFamily: '"Sarasa Fixed SC", ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 14,
  backgroundColor: "#2f383e",
  foregroundColor: "#d3c6aa",
  headerBackgroundColor: "#272f34",
  headerTextColor: "#d3c6aa",
  borderColor: "#475258",
  rowHoverColor: "transparent",
  selectedRowBackgroundColor: "transparent",
  accentColor: "#569d79",
});

function updateGridCounters(): void {
  if (!gridApi) return;
  const total = activeRows().length;
  gridStatus.textContent = `${activeModule} · ${gridApi.getDisplayedRowCount()} / ${total} 行`;
  gridSelected.textContent = `已选 ${gridApi.getSelectedRows().length}`;
}

gridApi = createGrid<ReviewRow>(gridHost, {
  theme: gridTheme,
  rowData: activeRows(),
  columnDefs: columnDefsForModule(activeModule),
  rowSelection,
  defaultColDef: { sortable: true, resizable: true, filter: true, suppressMovable: true },
  suppressMovableColumns: true,
  rowHeight: 42,
  headerHeight: 38,
  animateRows: false,
  getRowId: (params) => params.data.rowId ?? params.data.id,
  rowClassRules: {
    "row-changed": (params) => currentRowDiffState(params.data) !== undefined,
    "row-deleted-change": (params) =>
      activeModule === "变动行" && params.data?.chapterBoundaryState === "deleted",
  },
  onRowClicked: (event: RowClickedEvent<ReviewRow>) => { if (event.data) jumpToReviewRow(event.data); },
  onSelectionChanged: updateGridCounters,
  onFilterChanged: updateGridCounters,
  onGridReady: updateGridCounters,
});

function selectModule(module: ReviewModule): void {
  activeModule = module;
  clearModuleNotice(module);
  for (const tag of moduleTags) {
    const active = tag.dataset.module === module;
    tag.classList.toggle("is-active", active);
    tag.setAttribute("aria-selected", active ? "true" : "false");
  }
  gridApi?.setGridOption("columnDefs", columnDefsForModule(module));
  gridApi?.setGridOption("rowData", activeRows());
  gridApi?.deselectAll();
  gridApi?.applyColumnState({
    state: module === "注释"
      ? [
          { colId: "annotationNumber", sort: "asc", sortIndex: 0 },
          { colId: "sourceLine", sort: "asc", sortIndex: 1 },
        ]
      : module === "嵌入块"
        ? [
            { colId: "embedNumber", sort: "asc", sortIndex: 0 },
            { colId: "sourceLine", sort: "asc", sortIndex: 1 },
          ]
        : [{ colId: "sourceLine", sort: "asc", sortIndex: 0 }],
    defaultState: { sort: null },
  });
  updateGridCounters();
}

for (const tag of moduleTags) {
  tag.addEventListener("click", () => {
    const module = tag.dataset.module as ReviewModule | undefined;
    if (module) selectModule(module);
  });
}

type SourceLineContextTarget = {
  line: number;
  lineText: string;
};

let sourceLineContextTarget: SourceLineContextTarget | undefined;

function sourceLineFromGutterTarget(target: EventTarget | null): number | undefined {
  if (!(target instanceof Element)) return undefined;
  const gutter = target.closest(".cm-gutterElement");
  if (!gutter || !gutter.closest(".cm-lineNumbers")) return undefined;
  const line = Number(gutter.textContent?.trim());
  return Number.isInteger(line) && line >= 1 && line <= view.state.doc.lines ? line : undefined;
}

function lineAlreadyInReviewModule(module: ModuleName, line: number, lineText: string): boolean {
  const lineIndex = line - 1;
  return reviewRows.some((row) =>
    row.typeLabel === module
    && row.range.line === lineIndex
    && row.raw === lineText
    && row.lineType !== "已忽略"
    && row.chapterBoundaryState !== "deleted");
}

function closeSourceLineContextMenu(): void {
  sourceLineContextMenu.hidden = true;
  sourceLineContextTarget = undefined;
}

function currentManualReviewModule(): "章节标题" | "注释" | "嵌入块" | "非法断行" | undefined {
  if (activeModule === "章节标题" || activeModule === "注释" || activeModule === "嵌入块" || activeModule === "非法断行") {
    return activeModule;
  }
  return undefined;
}

function openSourceLineContextMenu(line: number, clientX: number, clientY: number): void {
  if (workbenchReviewMode !== "chapter") return;
  const info = view.state.doc.line(line);
  const lineText = view.state.doc.sliceString(info.from, info.to);
  sourceLineContextTarget = { line, lineText };

  view.dispatch({
    selection: { anchor: info.from },
    effects: [setTargetLine.of(line), EditorView.scrollIntoView(info.from, { y: "center" })],
  });

  const module = currentManualReviewModule();
  sourceLineContextTitle.textContent = module
    ? `第 ${line} 行 · 当前数据表：${module}`
    : `第 ${line} 行 · 当前数据表不可人工加入`;

  if (!module) {
    sourceLineAddCurrent.disabled = true;
    sourceLineAddCurrent.textContent = activeModule === "变动行"
      ? "变动行为系统派生表，不能人工加入"
      : "当前数据表不支持人工加入";
  } else if (module === "章节标题" && !/^ {0,3}#{1,6}(?:\s+|$)/.test(lineText)) {
    sourceLineAddCurrent.disabled = true;
    sourceLineAddCurrent.textContent = "当前行不是 Markdown 标题";
  } else if (lineAlreadyInReviewModule(module, line, lineText)) {
    sourceLineAddCurrent.disabled = true;
    sourceLineAddCurrent.textContent = `已在当前数据表 · ${module}`;
  } else {
    sourceLineAddCurrent.disabled = false;
    sourceLineAddCurrent.textContent = `加入当前数据表 · ${module}`;
  }

  sourceLineContextMenu.hidden = false;
  const menuWidth = 230;
  const estimatedHeight = 92;
  sourceLineContextMenu.style.left = `${Math.max(10, Math.min(clientX, window.innerWidth - menuWidth - 10))}px`;
  sourceLineContextMenu.style.top = `${Math.max(10, Math.min(clientY, window.innerHeight - estimatedHeight - 10))}px`;
}

function applySourceLineToModule(module: "章节标题" | "注释" | "嵌入块" | "非法断行"): void {
  const target = sourceLineContextTarget;
  if (!target) return;
  const workingText = view.state.doc.toString();
  const before = workbenchSnapshot(workingText);
  let added = false;

  if (module === "非法断行") {
    const result = application.markIllegalLineBreak({
      workingText,
      sourcePath: virtualSourcePath,
      workingPath: virtualWorkingPath,
      cursorLine: target.line - 1,
    });
    if (!result) {
      gridStatus.textContent = `第 ${target.line} 行附近没有可加入的非法断行边界`;
      closeSourceLineContextMenu();
      return;
    }
    added = !reviewRows.some((row) => row.id === result.row.id && row.lineType !== "已忽略");
    reviewRows = result.rows;
    annotationPairs = result.annotationPairs;
  } else {
    const existed = lineAlreadyInReviewModule(module, target.line, target.lineText);
    const result = application.addManualReviewLine({
      moduleName: module,
      documentText: workingText,
      lineText: target.lineText,
      hintLine: target.line - 1,
      sourcePath: virtualSourcePath,
      workingPath: virtualWorkingPath,
    });
    reviewRows = result.rows;
    annotationPairs = result.annotationPairs;
    added = !existed;
  }

  if (added) {
    recordWorkbenchSnapshot(before);
    showModuleNotice(module, 1);
  }
  if (activeModule === module) {
    gridApi?.setGridOption("rowData", activeRows());
    gridApi?.refreshCells({ force: true });
  }
  gridStatus.textContent = added
    ? `第 ${target.line} 行已加入${module}`
    : `第 ${target.line} 行已经在${module}中`;
  closeSourceLineContextMenu();
}

sourceLineAddCurrent.addEventListener("click", () => {
  const module = currentManualReviewModule();
  if (!module || sourceLineAddCurrent.disabled) return;
  applySourceLineToModule(module);
});

editorHost.addEventListener("click", (event) => {
  const line = sourceLineFromGutterTarget(event.target);
  if (!line) return;
  event.preventDefault();
  openSourceLineContextMenu(line, event.clientX, event.clientY);
});

editorHost.addEventListener("contextmenu", (event) => {
  const line = sourceLineFromGutterTarget(event.target);
  if (!line) return;
  event.preventDefault();
  openSourceLineContextMenu(line, event.clientX, event.clientY);
});

document.addEventListener("pointerdown", (event) => {
  if (!sourceLineContextMenu.hidden && !sourceLineContextMenu.contains(event.target as Node)) {
    closeSourceLineContextMenu();
  }
});

selectModule("章节标题");

type Ocr2mdUiTestWindow = Window & {
  __ocr2mdTest?: {
    getSourceText(): string;
    getWorkingText(): string;
    setWorkingText(text: string): void;
    ensureReviewRowVisible(text: string, line: number): boolean;
    reviewRowState(text: string, line: number, module?: string): { lineType?: string; owner?: string } | undefined;
  };
};

if (uiTestMode) {
  (window as Ocr2mdUiTestWindow).__ocr2mdTest = {
    getSourceText: () => sourceText,
    getWorkingText: () => view.state.doc.toString(),
    setWorkingText: (text: string) => {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
        selection: { anchor: 0 },
        effects: [setTargetLine.of(1), EditorView.scrollIntoView(0, { y: "start" })],
      });
    },
    ensureReviewRowVisible: (text: string, line: number) => {
      const index = activeRows().findIndex((row) =>
        row.range.line + 1 === line && (row.raw.includes(text) || row.preview.includes(text)));
      if (index < 0 || !gridApi) return false;
      gridApi.ensureIndexVisible(index, "middle");
      return true;
    },
    reviewRowState: (text: string, line: number, module?: string) => {
      const textMatches = (candidate: ReviewRow) =>
        candidate.range.line + 1 === line
        && (candidate.raw.includes(text) || candidate.preview.includes(text));
      const row = module === "变动行"
        ? uncoveredChangedRows().find(textMatches)
        : activeRows().find((candidate) => (!module || candidate.typeLabel === module) && textMatches(candidate))
          ?? reviewRows.find((candidate) => (!module || candidate.typeLabel === module) && textMatches(candidate));
      if (!row) return undefined;
      return {
        lineType: row.lineType,
        owner: (row as ChangedLineReviewRow).changeOwner,
      };
    },
  };
  document.documentElement.dataset.uiTestReady = "true";
}

type SearchMode = "source" | "preview" | "both";
let sourceMatches: SourceMatch[] = [];
let previewMatchCount = 0;
let searchIndex = -1;

function compileRegex(): RegExp {
  return new RegExp(regexInput.value, `gm${caseToggle.checked ? "" : "i"}u`);
}

function regexMatches(text: string, regex: RegExp): SourceMatch[] {
  const matches: SourceMatch[] = [];
  regex.lastIndex = 0;
  for (;;) {
    const match = regex.exec(text);
    if (!match) break;
    if (match[0].length > 0) {
      matches.push({ from: match.index, to: match.index + match[0].length });
    } else {
      regex.lastIndex += 1;
    }
  }
  return matches;
}

function clearPreviewHighlights(): void {
  for (const mark of Array.from(preview.querySelectorAll<HTMLElement>("mark.ocr-regex-match"))) {
    mark.replaceWith(document.createTextNode(mark.textContent ?? ""));
  }
  preview.normalize();
}

function highlightPreview(regex: RegExp): number {
  clearPreviewHighlights();
  const walker = document.createTreeWalker(preview, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || !node.textContent) return NodeFilter.FILTER_REJECT;
      if (parent.closest("script, style, .katex-mathml")) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const segments: Array<{ node: Text; start: number; end: number }> = [];
  let flat = "";
  let current: Node | null;
  while ((current = walker.nextNode())) {
    const textNode = current as Text;
    if (segments.length) flat += "\n";
    const start = flat.length;
    flat += textNode.data;
    segments.push({ node: textNode, start, end: flat.length });
  }
  const matches = regexMatches(flat, regex);
  for (const segment of segments) {
    const overlaps = matches
      .map((match, index) => ({ ...match, index }))
      .filter((match) => match.to > segment.start && match.from < segment.end)
      .sort((a, b) => b.from - a.from);
    let prefix = segment.node;
    for (const match of overlaps) {
      const localStart = Math.max(0, match.from - segment.start);
      const localEnd = Math.min(prefix.data.length, match.to - segment.start);
      if (localEnd <= localStart) continue;
      prefix.splitText(localEnd);
      const matchedText = prefix.splitText(localStart);
      const mark = document.createElement("mark");
      mark.className = "ocr-regex-match";
      mark.dataset.regexIndex = String(match.index);
      matchedText.replaceWith(mark);
      mark.append(matchedText);
    }
  }
  return matches.length;
}

function currentSearchCount(mode: SearchMode): number {
  if (mode === "source") return sourceMatches.length;
  if (mode === "preview") return previewMatchCount;
  return Math.max(sourceMatches.length, previewMatchCount);
}

function activateSearchMatch(scroll = true): void {
  const mode = searchTarget.value as SearchMode;
  const sourceActive = mode !== "preview" && searchIndex >= 0 && searchIndex < sourceMatches.length ? searchIndex : -1;
  view.dispatch({ effects: setSourceSearch.of({ matches: sourceMatches, active: sourceActive }) });

  for (const mark of Array.from(preview.querySelectorAll<HTMLElement>("mark.ocr-regex-match"))) {
    mark.classList.toggle("is-active", Number(mark.dataset.regexIndex) === searchIndex && mode !== "source");
  }
  if (!scroll || searchIndex < 0) return;

  if (sourceActive >= 0) {
    const match = sourceMatches[sourceActive];
    view.dispatch({
      selection: { anchor: match.from, head: match.to },
      effects: EditorView.scrollIntoView(match.from, { y: "center" }),
    });
  }
  if (mode !== "source" && searchIndex < previewMatchCount) {
    preview.querySelector<HTMLElement>(`mark.ocr-regex-match[data-regex-index="${searchIndex}"]`)
      ?.scrollIntoView({ block: "center" });
  }
}

function runRegexSearch(resetIndex = true): void {
  const pattern = regexInput.value;
  const mode = searchTarget.value as SearchMode;
  if (!pattern) {
    sourceMatches = [];
    previewMatchCount = 0;
    searchIndex = -1;
    clearPreviewHighlights();
    view.dispatch({ effects: setSourceSearch.of({ matches: [], active: -1 }) });
    searchStatus.textContent = "";
    regexInput.removeAttribute("aria-invalid");
    return;
  }
  try {
    const regex = compileRegex();
    sourceMatches = mode === "preview" ? [] : regexMatches(view.state.doc.toString(), new RegExp(regex.source, regex.flags));
    previewMatchCount = mode === "source" ? (clearPreviewHighlights(), 0) : highlightPreview(new RegExp(regex.source, regex.flags));
    const count = currentSearchCount(mode);
    if (resetIndex) searchIndex = count ? 0 : -1;
    else if (searchIndex >= count) searchIndex = count ? count - 1 : -1;
    regexInput.removeAttribute("aria-invalid");
    searchStatus.textContent = mode === "both"
      ? `源码 ${sourceMatches.length} · 预览 ${previewMatchCount}${count ? ` · ${searchIndex + 1}` : ""}`
      : `${count} 个匹配${count ? ` · ${searchIndex + 1}/${count}` : ""}`;
    activateSearchMatch(false);
  } catch (error) {
    sourceMatches = [];
    previewMatchCount = 0;
    searchIndex = -1;
    clearPreviewHighlights();
    view.dispatch({ effects: setSourceSearch.of({ matches: [], active: -1 }) });
    regexInput.setAttribute("aria-invalid", "true");
    searchStatus.textContent = `正则错误：${error instanceof Error ? error.message : String(error)}`;
  }
}

function moveSearchMatch(direction: 1 | -1): void {
  const mode = searchTarget.value as SearchMode;
  const count = currentSearchCount(mode);
  if (!count) return;
  searchIndex = (searchIndex + direction + count) % count;
  runRegexSearch(false);
  activateSearchMatch(true);
  if (mode === "both") {
    searchStatus.textContent = `源码 ${sourceMatches.length} · 预览 ${previewMatchCount} · ${searchIndex + 1}/${count}`;
  } else {
    searchStatus.textContent = `${count} 个匹配 · ${searchIndex + 1}/${count}`;
  }
}

let syncOrigin: "editor" | "preview" | undefined;
let editorFrame = 0;
let previewFrame = 0;

function sourceBlocks(): HTMLElement[] {
  return Array.from(preview.querySelectorAll<HTMLElement>("[data-source-line]"))
    .filter((node) => Number.isFinite(Number(node.dataset.sourceLine)));
}

function previewBlockForLine(line: number): HTMLElement | undefined {
  const blocks = sourceBlocks();
  let candidate = blocks[0];
  for (const block of blocks) {
    const sourceLine = Number(block.dataset.sourceLine);
    if (sourceLine > line) break;
    candidate = block;
  }
  return candidate;
}

function editorTopLine(): number {
  const block = view.lineBlockAtHeight(view.scrollDOM.scrollTop + 4);
  return view.state.doc.lineAt(block.from).number;
}

function previewTopLine(): number | undefined {
  const blocks = sourceBlocks();
  if (!blocks.length) return undefined;
  const previewTop = preview.getBoundingClientRect().top + 20;
  let candidate = blocks[0];
  for (const block of blocks) {
    if (block.getBoundingClientRect().top > previewTop) break;
    candidate = block;
  }
  return Number(candidate.dataset.sourceLine);
}

function syncPreviewFromEditor(): void {
  if (syncOrigin === "preview") return;
  const block = previewBlockForLine(editorTopLine());
  if (!block) return;
  const previewRect = preview.getBoundingClientRect();
  const blockRect = block.getBoundingClientRect();
  syncOrigin = "editor";
  preview.scrollTop += blockRect.top - previewRect.top - 16;
  requestAnimationFrame(() => { syncOrigin = undefined; });
}

function syncEditorFromPreview(): void {
  if (syncOrigin === "editor") return;
  const line = previewTopLine();
  if (!line) return;
  const clamped = Math.max(1, Math.min(line, view.state.doc.lines));
  const info = view.state.doc.line(clamped);
  syncOrigin = "preview";
  view.dispatch({ effects: EditorView.scrollIntoView(info.from, { y: "start", yMargin: 18 }) });
  requestAnimationFrame(() => { syncOrigin = undefined; });
}

view.scrollDOM.addEventListener("scroll", () => {
  if (syncOrigin === "preview") return;
  cancelAnimationFrame(editorFrame);
  editorFrame = requestAnimationFrame(syncPreviewFromEditor);
}, { passive: true });

preview.addEventListener("scroll", () => {
  if (syncOrigin === "editor") return;
  cancelAnimationFrame(previewFrame);
  previewFrame = requestAnimationFrame(syncEditorFromPreview);
}, { passive: true });

regexInput.addEventListener("input", () => runRegexSearch(true));
regexInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    moveSearchMatch(event.shiftKey ? -1 : 1);
  }
});
searchTarget.addEventListener("change", () => runRegexSearch(true));
caseToggle.addEventListener("change", () => runRegexSearch(true));
prevMatchButton.addEventListener("click", () => moveSearchMatch(-1));
nextMatchButton.addEventListener("click", () => moveSearchMatch(1));

const SPLIT_STORAGE_KEY = "ocr2md-integration-split-v1";
type SplitState = { leftPercent: number; editorTopPercent: number };

function loadSplitState(): SplitState {
  try {
    const raw = localStorage.getItem(SPLIT_STORAGE_KEY);
    if (!raw) return { leftPercent: 42, editorTopPercent: 50 };
    const parsed = JSON.parse(raw) as Partial<SplitState>;
    return {
      leftPercent: typeof parsed.leftPercent === "number" ? parsed.leftPercent : 42,
      editorTopPercent: typeof parsed.editorTopPercent === "number" ? parsed.editorTopPercent : 50,
    };
  } catch {
    return { leftPercent: 42, editorTopPercent: 50 };
  }
}

function saveSplitState(state: SplitState): void {
  try {
    localStorage.setItem(SPLIT_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Resizing still works when storage is unavailable.
  }
}

let splitState = loadSplitState();

type HorizontalDragState = { clientY: number; topPx: number };
let horizontalDragState: HorizontalDragState | undefined;

function editorSplitAvailableHeight(): number {
  const menuHeight = editorMenu.getBoundingClientRect().height;
  const splitterHeight = horizontalSplitter.getBoundingClientRect().height;
  const statusbarHeight = editorStatusbar.getBoundingClientRect().height;
  return Math.max(0, editorPane.clientHeight - menuHeight - splitterHeight - statusbarHeight);
}

function clampEditorTopPx(value: number, availableHeight: number): number {
  const minPaneHeight = Math.min(160, availableHeight / 2);
  return Math.max(minPaneHeight, Math.min(value, availableHeight - minPaneHeight));
}

function applySplitState(): void {
  workspace.style.setProperty("--left-pane-width", `${splitState.leftPercent}%`);
  const availableHeight = editorSplitAvailableHeight();
  if (availableHeight > 0) {
    const requestedTop = availableHeight * splitState.editorTopPercent / 100;
    const topPx = clampEditorTopPx(requestedTop, availableHeight);
    splitState.editorTopPercent = topPx / availableHeight * 100;
    editorPane.style.setProperty("--editor-top-height", `${topPx}px`);
  }
  verticalSplitter.setAttribute("aria-valuenow", String(Math.round(splitState.leftPercent)));
  horizontalSplitter.setAttribute("aria-valuenow", String(Math.round(splitState.editorTopPercent)));
  requestAnimationFrame(() => {
    view.requestMeasure();
    gridApi?.refreshCells();
  });
}

function finishResize(splitter: HTMLElement): void {
  splitter.classList.remove("is-dragging");
  document.body.classList.remove("is-resizing");
  saveSplitState(splitState);
  window.dispatchEvent(new Event("resize"));
}

verticalSplitter.addEventListener("pointerdown", (event) => {
  if (window.matchMedia("(max-width: 600px)").matches) return;
  event.preventDefault();
  verticalSplitter.setPointerCapture(event.pointerId);
  verticalSplitter.classList.add("is-dragging");
  document.body.classList.add("is-resizing");
});
verticalSplitter.addEventListener("pointermove", (event) => {
  if (!verticalSplitter.hasPointerCapture(event.pointerId)) return;
  const rect = workspace.getBoundingClientRect();
  const left = Math.max(320, Math.min(event.clientX - rect.left, rect.width - 366));
  splitState.leftPercent = (left / rect.width) * 100;
  applySplitState();
});
verticalSplitter.addEventListener("pointerup", (event) => {
  if (verticalSplitter.hasPointerCapture(event.pointerId)) verticalSplitter.releasePointerCapture(event.pointerId);
  finishResize(verticalSplitter);
});
verticalSplitter.addEventListener("pointercancel", () => finishResize(verticalSplitter));

horizontalSplitter.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  horizontalDragState = {
    clientY: event.clientY,
    topPx: (editorPaneMode === "css" ? customCssWrap : editorHost).getBoundingClientRect().height,
  };
  horizontalSplitter.setPointerCapture(event.pointerId);
  horizontalSplitter.classList.add("is-dragging");
  document.body.classList.add("is-resizing");
});
horizontalSplitter.addEventListener("pointermove", (event) => {
  if (!horizontalSplitter.hasPointerCapture(event.pointerId) || !horizontalDragState) return;
  const availableHeight = editorSplitAvailableHeight();
  if (availableHeight <= 0) return;
  const requestedTop = horizontalDragState.topPx + (event.clientY - horizontalDragState.clientY);
  const topPx = clampEditorTopPx(requestedTop, availableHeight);
  splitState.editorTopPercent = topPx / availableHeight * 100;
  applySplitState();
});
horizontalSplitter.addEventListener("pointerup", (event) => {
  if (horizontalSplitter.hasPointerCapture(event.pointerId)) horizontalSplitter.releasePointerCapture(event.pointerId);
  horizontalDragState = undefined;
  finishResize(horizontalSplitter);
});
horizontalSplitter.addEventListener("pointercancel", () => {
  horizontalDragState = undefined;
  finishResize(horizontalSplitter);
});

verticalSplitter.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  splitState.leftPercent = Math.max(25, Math.min(70, splitState.leftPercent + (event.key === "ArrowRight" ? 2 : -2)));
  applySplitState();
  saveSplitState(splitState);
});
horizontalSplitter.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
  event.preventDefault();
  splitState.editorTopPercent = Math.max(25, Math.min(75, splitState.editorTopPercent + (event.key === "ArrowDown" ? 2 : -2)));
  applySplitState();
  saveSplitState(splitState);
});

window.addEventListener("resize", applySplitState);
applySplitState();

type AppWorkspace = "cleaning" | "gd" | "jsfe";
let activeWorkspace: AppWorkspace = uiTestMode ? "cleaning" : "gd";

function activateWorkspace(nextWorkspace: AppWorkspace): void {
  activeWorkspace = nextWorkspace;
  cleaningWorkspace.hidden = nextWorkspace !== "cleaning";
  gdWorkspace.hidden = nextWorkspace !== "gd";
  gdJsfeWorkspace.hidden = nextWorkspace !== "jsfe";
  for (const tab of workspaceTabs) {
    const active = tab.dataset.workspace === nextWorkspace;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  }
  if (nextWorkspace === "cleaning") {
    requestAnimationFrame(applySplitState);
  }
}

function moveUiDebugLineRange(
  text: string,
  startLine: number,
  endLine: number,
  beforeLine: number,
): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const startIndex = startLine - 1;
  const count = endLine - startLine + 1;
  const beforeIndex = beforeLine - 1;
  if (startIndex < 0 || startIndex + count > lines.length) return text;
  const moved = lines.splice(startIndex, count);
  const insertIndex = beforeIndex > startIndex ? beforeIndex - count : beforeIndex;
  lines.splice(Math.max(0, Math.min(insertIndex, lines.length)), 0, ...moved);
  return lines.join(eol);
}

function restoreUiDebugFixture(): void {
  closeSourceLineContextMenu();
  featureDebugProgress.hidden = true;
  clearWorkbenchHistory();
  activeDriveChapter = undefined;
  saveCalibrationButton.disabled = true;
  setWorkbenchReviewMode("chapter");
  sourceText = initialSourceText;
  virtualSourcePath = "/demo/chapters/01 Buffett’s Alpha/01 Buffett’s Alpha.md";
  virtualWorkingPath = "/demo/chapters/01 Buffett’s Alpha/01 Buffett’s Alpha.working.md";
  sourceLabel = "chapters/01 Buffett’s Alpha/01 Buffett’s Alpha.md";
  reviewRows = [];
  annotationPairs = [];
  liveDiffChanges = [];
  application = new ChapterReviewApplication({ rows: [], annotationPairs: [] });
  lineEndingGlyph = initialSourceText.includes("\r\n") ? "␍␊" : initialSourceText.includes("\r") ? "␍" : "␊";
  for (const module of ["章节标题", "注释", "嵌入块", "非法断行", "变动行"] as ReviewModule[]) {
    clearModuleNotice(module);
  }
  setEditorPaneMode("source");
  regexInput.value = "";
  searchTarget.value = "source";
  caseToggle.checked = false;
  activateWorkspace("cleaning");

  if (view.state.doc.toString() !== initialSourceText) {
    suppressChangedLinesNoticeOnce = true;
    suppressWorkbenchHistoryCapture = true;
    try {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: initialSourceText },
        selection: { anchor: 0 },
        effects: [setTargetLine.of(1), EditorView.scrollIntoView(0, { y: "start" })],
      });
    } finally {
      suppressWorkbenchHistoryCapture = false;
    }
  } else {
    refreshReviewFromWorkingText(initialSourceText);
    render(initialSourceText);
    gridApi?.setGridOption("rowData", activeRows());
  }

  selectModule("章节标题");
  clearChangedLinesNotice();
  workspaceDocument.textContent = "";
  requestAnimationFrame(() => {
    syncPreviewFromEditor();
    runRegexSearch(false);
    gridApi?.refreshCells({ force: true });
    gridApi?.redrawRows();
    updateGridCounters();
  });
}

function resetUiDebugWorkspace(): void {
  restoreUiDebugFixture();
  featureDebugRunner.reset();
  status.textContent = "功能调试已初始化 · 工作稿 " + view.state.doc.lines + " 行";
}

function runUiDebugMoveSourceBlock(): void {
  restoreUiDebugFixture();

  const moved = moveUiDebugLineRange(view.state.doc.toString(), 376, 378, 359);
  activateWorkspace("cleaning");
  selectModule("章节标题");
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: moved },
    selection: { anchor: 0 },
    effects: [setTargetLine.of(359)],
  });
  const movedLine = view.state.doc.line(Math.min(359, view.state.doc.lines)).from;
  view.dispatch({
    selection: { anchor: movedLine },
    effects: EditorView.scrollIntoView(movedLine, { y: "center" }),
  });

  status.textContent = "功能调试 · 已执行移动源文本块：376–378 → 359";
  setUiDebugMenuOpen(false);
}

function runUiDebugLineMenu(): void {
  restoreUiDebugFixture();

  activateWorkspace("cleaning");
  setEditorPaneMode("source");
  selectModule("嵌入块");

  const moved = moveUiDebugLineRange(view.state.doc.toString(), 18, 18, 14);
  if (moved !== view.state.doc.toString()) {
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: moved },
    });
  }

  const targetLine = Math.min(14, view.state.doc.lines);
  const targetOffset = view.state.doc.line(targetLine).from;
  view.dispatch({
    selection: { anchor: targetOffset },
    effects: [setTargetLine.of(targetLine), EditorView.scrollIntoView(targetOffset, { y: "center" })],
  });

  // Execute the full sample through the same line-menu path the user would use:
  // select L14 -> open current-table menu -> add to current embed table.
  openSourceLineContextMenu(targetLine, 16, 96);
  applySourceLineToModule("嵌入块");

  status.textContent = "功能调试 · 已执行行号菜单样例：18→14，并将第 14 行 Top Award 加入嵌入块表";
  setUiDebugMenuOpen(false);
}

function applyFixedOcrCorrection(): boolean {
  const targetLine = Math.min(26, view.state.doc.lines);
  const line = view.state.doc.line(targetLine);
  const lineText = view.state.doc.sliceString(line.from, line.to);
  const original = "M<sup>uch</sup> <sup>has</sup> <sup>been</sup> <sup>said</sup> <sup>and</sup> <sup>writen</sup> <sup>about</sup> <sup>Warren</sup> <sup>Bufet</sup> <sup>and</sup> <sup>his</sup>";
  const replacement = "Much has been said and written about Warren Buffett and his ";
  const localStart = lineText.indexOf(original);
  if (localStart < 0) return false;

  const from = line.from + localStart;
  const to = from + original.length;
  view.dispatch({
    changes: { from, to, insert: replacement },
    selection: { anchor: from + replacement.length },
    effects: [setTargetLine.of(targetLine), EditorView.scrollIntoView(from, { y: "center" })],
  });
  return true;
}

function runUiDebugEditTextLine(): boolean {
  restoreUiDebugFixture();

  activateWorkspace("cleaning");
  setEditorPaneMode("source");
  selectModule("变动行");

  if (!applyFixedOcrCorrection()) {
    status.textContent = "功能调试失败 · 第 26 行未找到预期 OCR 文本";
    setUiDebugMenuOpen(false);
    return false;
  }

  status.textContent = "功能调试 · 已修正第 26 行 OCR 文本 · 变动行显示修改，注释号 <sup>1</sup> 保持不变";
  setUiDebugMenuOpen(false);
  return true;
}

function runUiDebugIgnoreLineType(): boolean {
  restoreUiDebugFixture();

  activateWorkspace("cleaning");
  setEditorPaneMode("source");
  selectModule("注释");

  const target = reviewRows.find((row) =>
    row.typeLabel === "注释"
    && row.lineType === "注释引用"
    && row.annotationNumber === "1");
  if (!target) {
    status.textContent = "功能调试失败 · 未找到第 26 行注释引用 <sup>1</sup>";
    setUiDebugMenuOpen(false);
    return false;
  }

  const workingBefore = view.state.doc.toString();
  applyReviewRowLineType(target, IGNORED_LINE_TYPE);
  if (view.state.doc.toString() !== workingBefore) {
    status.textContent = "功能调试失败 · 已忽略不应修改 working";
    setUiDebugMenuOpen(false);
    return false;
  }

  status.textContent = "功能调试 · 已将第 " + (target.range.line + 1) + " 行注释引用设为已忽略 · 当前表已隐藏该行 · working 未修改";
  setUiDebugMenuOpen(false);
  return true;
}

function annotationOneReviewRow(): ReviewRow | undefined {
  return reviewRows.find((row) =>
    row.typeLabel === "注释"
    && row.range.line + 1 === 26
    && row.annotationNumber === "1");
}

function prepareUndoRedoFeatureDebug(): void {
  restoreUiDebugFixture();
  setUiDebugMenuOpen(false);
  activateWorkspace("cleaning");
  setEditorPaneMode("source");
  selectModule("注释");
}

function createUndoRedoDebugSteps(): readonly FeatureDebugStep[] {
  let baselineWorking = "";

  return [
    {
      label: "1 基线：Undo / Redo 均不可用",
      run: () => {
        requireFeatureDebug(!workbenchHistory.canUndo && !workbenchHistory.canRedo, "基线历史栈必须为空");
        requireFeatureDebug(undoWorkbenchButton.disabled && redoWorkbenchButton.disabled, "基线 Undo / Redo 按钮必须禁用");
        status.textContent = "撤销 / 重做功能调试 · 1/6 · 基线";
      },
    },
    {
      label: "2 注释设为已忽略：Undo 可用",
      run: () => {
        const annotation = annotationOneReviewRow();
        requireFeatureDebug(annotation?.lineType === "注释引用", "第 26 行注释引用基线缺失");
        baselineWorking = view.state.doc.toString();
        applyReviewRowLineType(annotation, IGNORED_LINE_TYPE);
        requireFeatureDebug(annotationOneReviewRow()?.lineType === IGNORED_LINE_TYPE, "已忽略状态没有保存");
        requireFeatureDebug(!activeRows().some((row) => row.id === annotation.id), "已忽略行仍显示在注释表");
        requireFeatureDebug(workbenchHistory.canUndo && !workbenchHistory.canRedo, "已忽略后应只有 Undo 可用");
        requireFeatureDebug(view.state.doc.toString() === baselineWorking, "已忽略不应修改 working");
        status.textContent = "撤销 / 重做功能调试 · 2/6 · 注释已忽略 · Undo 可用";
      },
    },
    {
      label: "3 Undo：注释引用恢复，Redo 可用",
      run: () => {
        requireFeatureDebug(performWorkbenchUndo(), "Undo 执行失败");
        selectModule("注释");
        requireFeatureDebug(annotationOneReviewRow()?.lineType === "注释引用", "Undo 未恢复注释引用");
        requireFeatureDebug(activeRows().some((row) => row.range.line + 1 === 26 && row.typeLabel === "注释"), "Undo 后第 26 行没有重新显示");
        requireFeatureDebug(!workbenchHistory.canUndo && workbenchHistory.canRedo, "Undo 后 Redo 应可用");
        requireFeatureDebug(view.state.doc.toString() === baselineWorking, "标定 Undo 不得修改 working");
        status.textContent = "撤销 / 重做功能调试 · 3/6 · Undo 已恢复注释引用 · Redo 可用";
      },
    },
    {
      label: "4 Redo：再次已忽略，Redo 用完",
      run: () => {
        requireFeatureDebug(performWorkbenchRedo(), "Redo 执行失败");
        selectModule("注释");
        requireFeatureDebug(annotationOneReviewRow()?.lineType === IGNORED_LINE_TYPE, "Redo 未恢复已忽略");
        requireFeatureDebug(!activeRows().some((row) => row.range.line + 1 === 26 && row.typeLabel === "注释"), "Redo 后已忽略行仍显示");
        requireFeatureDebug(workbenchHistory.canUndo && !workbenchHistory.canRedo, "Redo 用完后应只有 Undo 可用");
        status.textContent = "撤销 / 重做功能调试 · 4/6 · Redo 已再次执行已忽略";
      },
    },
    {
      label: "5 Undo 后新文本修改：旧 Redo 清空",
      run: () => {
        requireFeatureDebug(performWorkbenchUndo(), "第二次 Undo 执行失败");
        requireFeatureDebug(workbenchHistory.canRedo, "第二次 Undo 后必须存在旧 Redo");
        selectModule("变动行");
        requireFeatureDebug(applyFixedOcrCorrection(), "第 26 行 OCR 修正执行失败");
        requireFeatureDebug(!workbenchHistory.canRedo, "Undo 后的新操作必须清空旧 Redo 分支");
        requireFeatureDebug(workbenchHistory.canUndo, "新文本修改后 Undo 必须可用");
        requireFeatureDebug(view.state.doc.toString() !== baselineWorking, "新文本修改没有生效");
        requireFeatureDebug(uncoveredChangedRows().some((row) => row.range.line + 1 === 26 && row.lineType === "修改"), "变动行没有记录第 26 行修改");
        status.textContent = "撤销 / 重做功能调试 · 5/6 · 新文本修改已清空旧 Redo";
      },
    },
    {
      label: "6 Undo 文本修改：恢复基线",
      run: () => {
        requireFeatureDebug(performWorkbenchUndo(), "文本 Undo 执行失败");
        selectModule("注释");
        requireFeatureDebug(view.state.doc.toString() === baselineWorking, "文本 Undo 未恢复原 working");
        requireFeatureDebug(annotationOneReviewRow()?.lineType === "注释引用", "文本 Undo 破坏了原注释引用");
        requireFeatureDebug(uncoveredChangedRows().length === 0, "文本 Undo 后变动行没有恢复基线");
        requireFeatureDebug(!workbenchHistory.canUndo && workbenchHistory.canRedo, "最终应可 Redo 新文本修改");
        status.textContent = "撤销 / 重做功能调试 · 6/6 通过 · working 与注释均恢复基线";
      },
    },
  ];
}

function prepareSaveReenterFeatureDebug(): void {
  restoreUiDebugFixture();
  setUiDebugMenuOpen(false);
}

function createSaveReenterDebugSteps(): readonly FeatureDebugStep[] {
  const chapterPath = "/demo/chapters/01 Buffett’s Alpha/01 Buffett’s Alpha.md";
  const workingPath = "/demo/chapters/01 Buffett’s Alpha/01 Buffett’s Alpha.working.md";
  const chapterName = "01 Buffett’s Alpha.md";
  let persistedChapter: GoogleDriveWorkspaceOpenedChapter | undefined;
  let baselineSnapshot: WorkbenchHistorySnapshot | undefined;

  return [
    {
      label: "1 打开固定章节：无本次保存结果",
      run: () => {
        loadDriveChapter({
          path: chapterPath,
          name: chapterName,
          originalText: initialSourceText,
          workingPath,
          workingText: initialSourceText,
          sidecar: { rows: [], annotationPairs: [] },
        });
        activateWorkspace("cleaning");
        selectModule("注释");
        baselineSnapshot = workbenchSnapshot(view.state.doc.toString());
        requireFeatureDebug(saveCalibrationButton.disabled === false, "固定章节打开后保存标定必须可用");
        status.textContent = "保存标定 / 重入加载功能调试 · 1/5 · 固定章节已打开";
      },
    },
    {
      label: "2 修改正文 + 注释设为已忽略",
      run: () => {
        requireFeatureDebug(applyFixedOcrCorrection(), "第 26 行 OCR 修正失败");
        selectModule("注释");
        const annotation = annotationOneReviewRow();
        requireFeatureDebug(annotation?.lineType === "注释引用", "第 26 行注释引用不存在");
        applyReviewRowLineType(annotation, IGNORED_LINE_TYPE);
        requireFeatureDebug(annotationOneReviewRow()?.lineType === IGNORED_LINE_TYPE, "已忽略标定没有生效");
        requireFeatureDebug(view.state.doc.toString().includes("Much has been said and written about Warren Buffett and his "), "正文修改没有生效");
        status.textContent = "保存标定 / 重入加载功能调试 · 2/5 · 正文已修改，注释已忽略";
      },
    },
    {
      label: "3 保存 working + sidecar",
      run: async () => {
        const saved = await saveCurrentCalibration(async (input) => {
          const rows = JSON.parse(JSON.stringify(input.rows)) as Candidate[];
          const pairs = JSON.parse(JSON.stringify(input.annotationPairs)) as AnnotationPair[];
          persistedChapter = {
            path: input.filePath,
            name: chapterName,
            originalText: initialSourceText,
            workingPath: input.workingPath,
            workingText: input.workingText,
            sidecar: {
              rows,
              annotationPairs: pairs,
              sidecarPath: chapterPath.replace(/\.md$/i, ".ocr2md.json"),
            },
          };
          return { sidecarPath: persistedChapter.sidecar.sidecarPath! };
        });
        requireFeatureDebug(saved && persistedChapter, "保存标定没有产生 working + sidecar");
        status.textContent = "保存标定 / 重入加载功能调试 · 3/5 · working 与 sidecar 已保存";
      },
    },
    {
      label: "4 离开章节：当前内存恢复未修改基线",
      run: () => {
        requireFeatureDebug(baselineSnapshot, "缺少离开前基线");
        applyWorkbenchHistorySnapshot(baselineSnapshot);
        clearWorkbenchHistory();
        activeDriveChapter = undefined;
        saveCalibrationButton.disabled = true;
        activateWorkspace("gd");
        requireFeatureDebug(!view.state.doc.toString().includes("Much has been said and written about Warren Buffett and his "), "离开前内存状态没有恢复到基线");
        requireFeatureDebug(annotationOneReviewRow()?.lineType === "注释引用", "离开前基线标定没有恢复");
        status.textContent = "保存标定 / 重入加载功能调试 · 4/5 · 已离开章节，内存恢复未修改基线";
      },
    },
    {
      label: "5 重入章节：自动加载保存后的正文与标定",
      run: () => {
        requireFeatureDebug(persistedChapter, "没有可重入的保存结果");
        loadDriveChapter(persistedChapter);
        activateWorkspace("cleaning");
        selectModule("注释");
        requireFeatureDebug(view.state.doc.toString().includes("Much has been said and written about Warren Buffett and his "), "重入没有自动加载已保存 working");
        requireFeatureDebug(annotationOneReviewRow()?.lineType === IGNORED_LINE_TYPE, "重入没有恢复已保存的已忽略标定");
        requireFeatureDebug(!activeRows().some((row) => row.typeLabel === "注释" && row.range.line + 1 === 26), "重入后已忽略行错误显示在注释表");
        requireFeatureDebug(!workbenchHistory.canUndo && !workbenchHistory.canRedo, "重入新会话必须清空 Undo / Redo 历史");
        requireFeatureDebug(status.textContent?.includes("已自动加载标定"), "重入状态没有明确显示自动加载标定");
        status.textContent = "保存标定 / 重入加载功能调试 · 5/5 通过 · 已自动加载保存后的 working 与 sidecar";
      },
    },
  ];
}

function setUiDebugMenuOpen(open: boolean): void {
  uiDebugMenu.hidden = !open;
  uiDebugToggle.setAttribute("aria-expanded", open ? "true" : "false");
}

uiDebugToggle.addEventListener("click", (event) => {
  event.stopPropagation();
  setUiDebugMenuOpen(uiDebugMenu.hidden);
});

uiDebugInitialize.addEventListener("click", (event) => {
  event.stopPropagation();
  resetUiDebugWorkspace();
});

featureDebugRunner.register({
  id: "move-source-block",
  title: "移动源文本块",
  button: uiDebugMoveSourceBlock,
  run: runUiDebugMoveSourceBlock,
  onFailure: (error) => {
    status.textContent = "功能调试失败 · " + error.message;
  },
});

featureDebugRunner.register({
  id: "line-menu",
  title: "行号菜单",
  button: uiDebugLineMenu,
  run: runUiDebugLineMenu,
  onFailure: (error) => {
    status.textContent = "功能调试失败 · " + error.message;
  },
});

featureDebugRunner.register({
  id: "edit-text-line",
  title: "修改文本行",
  button: uiDebugEditTextLine,
  run: runUiDebugEditTextLine,
  onFailure: (error) => {
    status.textContent = "功能调试失败 · " + error.message;
  },
});

featureDebugRunner.register({
  id: "ignore-line-type",
  title: "行类型：已忽略",
  button: uiDebugIgnoreLineType,
  run: runUiDebugIgnoreLineType,
  onFailure: (error) => {
    status.textContent = "功能调试失败 · " + error.message;
  },
});

featureDebugRunner.register({
  id: "undo-redo",
  title: "撤销 / 重做",
  button: uiDebugUndoRedo,
  beforeRun: prepareUndoRedoFeatureDebug,
  steps: createUndoRedoDebugSteps,
  onFailure: (error) => {
    status.textContent = "撤销 / 重做功能调试失败 · " + error.message;
  },
});

featureDebugRunner.register({
  id: "save-reenter",
  title: "保存标定 / 重入加载",
  button: uiDebugSaveReenter,
  beforeRun: prepareSaveReenterFeatureDebug,
  steps: createSaveReenterDebugSteps,
  onFailure: (error) => {
    status.textContent = "保存标定 / 重入加载功能调试失败 · " + error.message;
  },
});

// Keep the debug dropdown deterministic while the real page is still doing
// asynchronous workspace/Drive initialization. It closes only when the user
// toggles it or when a debug action explicitly closes it.
const googleDriveWorkspace = installGoogleDriveWorkspace(
  {
    clientId: "826904666866-l6upvckiav2to61q6th604jl19m2t9k0.apps.googleusercontent.com",
    rootFolderId: "13qObSp0T0bRXQ-Ev3tK1hWhJU8kqaH4r",
  },
  {
    onOpenFile: loadDriveDocument,
    onOpenChapter: loadDriveChapter,
    onActivateCleaningWorkspace: () => activateWorkspace("cleaning"),
    onActivateGoogleDriveWorkspace: () => activateWorkspace("gd"),
  },
);

type SaveChapterReview = (input: {
  filePath: string;
  workingPath: string;
  workingText: string;
  rows: Candidate[];
  annotationPairs: AnnotationPair[];
}) => Promise<{ sidecarPath: string }>;

async function saveCurrentCalibration(saveReview: SaveChapterReview): Promise<{ sidecarPath: string } | undefined> {
  const chapter = activeDriveChapter;
  if (!chapter || saveCalibrationButton.disabled) return undefined;
  saveCalibrationButton.disabled = true;
  gridStatus.textContent = "正在保存工作稿与标定…";
  try {
    const saved = await saveReview({
      filePath: chapter.filePath,
      workingPath: chapter.workingPath,
      workingText: view.state.doc.toString(),
      rows: reviewRows,
      annotationPairs,
    });
    gridStatus.textContent = `工作稿与标定已保存 · ${saved.sidecarPath}`;
    status.textContent = `保存标定成功 · working ${view.state.doc.lines} 行 · sidecar ${reviewRows.length} 行`;
    return saved;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    gridStatus.textContent = `保存失败 · ${message}`;
    status.textContent = `保存标定失败 · ${message}`;
    return undefined;
  } finally {
    saveCalibrationButton.disabled = !activeDriveChapter;
  }
}

saveCalibrationButton.addEventListener("click", () => {
  void saveCurrentCalibration((input) => googleDriveWorkspace.saveChapterReview(input));
});

const googleDriveFileExplorerSpike = installGoogleDriveFileExplorerSpike(
  {
    clientId: "826904666866-l6upvckiav2to61q6th604jl19m2t9k0.apps.googleusercontent.com",
    rootFolderId: "13qObSp0T0bRXQ-Ev3tK1hWhJU8kqaH4r",
  },
  {
    onOpenFile: loadDriveDocument,
    onOpenBoundary: loadDriveBoundaryDocument,
    onActivateCleaningWorkspace: () => activateWorkspace("cleaning"),
  },
);

for (const tab of workspaceTabs) {
  tab.addEventListener("click", () => {
    const nextWorkspace = tab.dataset.workspace;
    if (nextWorkspace !== "cleaning" && nextWorkspace !== "gd" && nextWorkspace !== "jsfe") return;
    activateWorkspace(nextWorkspace);
    if (nextWorkspace === "jsfe") void googleDriveFileExplorerSpike.activate();
  });
}

activateWorkspace(activeWorkspace);
featureDebugRunner.refreshControls();
if (!uiTestMode) void googleDriveWorkspace.prepare();

document.documentElement.dataset.appReady = "true";
uiDebugToggle.disabled = false;
uiDebugToggle.setAttribute("aria-disabled", "false");
