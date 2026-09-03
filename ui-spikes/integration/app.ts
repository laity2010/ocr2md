import { EditorState, RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import { EditorView, Decoration, DecorationSet, WidgetType, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
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
import { scanChapterBoundaryLines } from "../../src/chapterBoundary";
import { chapterDiffBaseline } from "../../src/chapterReviewText";
import { MODULE_REGEX_DEFAULTS } from "../../src/regexPresets";
import { candidatesFromSidecar } from "../../src/sidecar";
import type { AnnotationPair, Candidate } from "../../src/types";

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
const gridFilter = requiredElement<HTMLInputElement>("#grid-filter");
const gridStatus = requiredElement<HTMLElement>("#grid-status");
const gridSelected = requiredElement<HTMLElement>("#grid-selected");
const moduleTags = Array.from(document.querySelectorAll<HTMLButtonElement>(".module-tag"));
if (moduleTags.length !== 4) throw new Error("missing module tags");
const workspace = requiredElement<HTMLElement>(".workspace");
const editorPane = requiredElement<HTMLElement>(".editor-pane");
const verticalSplitter = requiredElement<HTMLElement>("#splitter-vertical");
const horizontalSplitter = requiredElement<HTMLElement>("#splitter-horizontal");
const lineInput = requiredElement<HTMLInputElement>("#line");
const jumpButton = requiredElement<HTMLButtonElement>("#jump");
const syncToggle = requiredElement<HTMLInputElement>("#sync-scroll");
const eolToggle = requiredElement<HTMLInputElement>("#show-eol");
const regexInput = requiredElement<HTMLInputElement>("#regex-search");
const searchTarget = requiredElement<HTMLSelectElement>("#search-target");
const caseToggle = requiredElement<HTMLInputElement>("#search-case");
const prevMatchButton = requiredElement<HTMLButtonElement>("#search-prev");
const nextMatchButton = requiredElement<HTMLButtonElement>("#search-next");
const searchStatus = requiredElement<HTMLElement>("#search-status");
const status = requiredElement<HTMLElement>("#status");

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

const [sourceText, initialWorkingText, sidecarRaw] = await Promise.all([
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

const virtualSourcePath = "/demo/chapters/01 Buffett’s Alpha/01 Buffett’s Alpha.md";
const virtualWorkingPath = "/demo/chapters/01 Buffett’s Alpha/01 Buffett’s Alpha.working.md";
const sourceLabel = "chapters/01 Buffett’s Alpha/01 Buffett’s Alpha.md";
const loadedSidecar = candidatesFromSidecar(JSON.parse(sidecarRaw));
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

function refreshReviewFromWorkingText(workingText: string): void {
  liveDiffChanges = scanChapterBoundaryLines(chapterDiffBaseline(sourceText, workingText), workingText);
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

const sourceLineSeparator = sample.includes("\r\n") ? "\r\n" : sample.includes("\r") ? "\r" : "\n";
lineEndingGlyph = sourceLineSeparator === "\r\n" ? "␍␊" : sourceLineSeparator === "\r" ? "␍" : "␊";

let gridApi: ReturnType<typeof createGrid<ReviewRow>> | undefined;
type ReviewModule = "章节标题" | "注释" | "嵌入块" | "非法断行";
let activeModule: ReviewModule = "章节标题";

function activeRows(): ReviewRow[] {
  return reviewRows.filter((row) => {
    if (row.typeLabel !== activeModule) return false;
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

const view = new EditorView({
  parent: editorHost,
  state: EditorState.create({
    doc: sample,
    extensions: [
      lineNumbers(),
      history(),
      markdown(),
      syntaxHighlighting(obsidianSyntaxHighlight),
      EditorState.lineSeparator.of(sourceLineSeparator),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      sourceHeadingField,
      latexHighlightField,
      lineEndingField,
      sourceSearchField,
      targetLineField,
      EditorView.lineWrapping,
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;
        const workingText = update.state.doc.toString();
        render(workingText);
        refreshReviewFromWorkingText(workingText);
        gridApi?.setGridOption("rowData", activeRows());
        status.textContent = `工作稿已编辑 · ${update.state.doc.lines} 行 · 数据表已同步`;
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

const CHAPTER_TITLE_LINE_TYPES = [
  "1 级标题",
  "2 级标题",
  "3 级标题",
  "4 级标题",
  "5 级标题",
  "6 级标题",
  "已忽略",
] as const;

function lineTypesForRow(row: ReviewRow | undefined): readonly string[] {
  if (row?.typeLabel === "章节标题") return CHAPTER_TITLE_LINE_TYPES;
  return Array.from(new Set(
    reviewRows
      .filter((candidate) => !row || candidate.typeLabel === row.typeLabel)
      .map((candidate) => candidate.lineType)
      .filter((value): value is string => Boolean(value)),
  )).sort((a, b) => a.localeCompare(b, "zh-CN"));
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
  select.value = allowedLineTypes.includes(current) ? current : "已忽略";
  select.addEventListener("click", (event) => event.stopPropagation());
  select.addEventListener("change", () => {
    if (!params.data) return;
    if (params.data.typeLabel === "章节标题" && /^[1-6]\s*级标题$/.test(select.value)) {
      const edits = planHeadingLineTypeEdits(view.state.doc.toString(), [params.data], select.value);
      if (!edits.length) {
        gridStatus.textContent = "标题层级没有变化";
        jumpToReviewRow(params.data);
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
      gridStatus.textContent = `工作稿标题已改为 ${select.value}`;
      requestAnimationFrame(() => {
        const refreshed = reviewRows.find((row) =>
          row.typeLabel === "章节标题"
          && row.range.line === targetLine
          && row.chapterBoundaryState !== "deleted");
        jumpToReviewRow(refreshed ?? params.data!);
      });
      return;
    }
    const next = application.setRowsLineType({
      ids: [params.data.id],
      lineType: select.value,
      text: view.state.doc.toString(),
      sourcePath: virtualSourcePath,
      workingPath: virtualWorkingPath,
    });
    reviewRows = next.rows;
    annotationPairs = next.annotationPairs;
    gridApi?.setGridOption("rowData", activeRows());
    gridStatus.textContent = `行类型已标定为 ${select.value}`;
    requestAnimationFrame(() => {
      const refreshed = reviewRows.find((row) => row.id === params.data!.id);
      jumpToReviewRow(refreshed ?? params.data!);
    });
  });
  return select;
}

function reviewPreviewRenderer(params: ICellRendererParams<ReviewRow, string>): HTMLElement {
  const node = document.createElement("div");
  node.className = "grid-preview-cell";
  node.textContent = String(params.value ?? "");
  const heading = params.data?.lineType?.match(/^([1-6])\s*级标题$/);
  if (heading) node.classList.add(`is-h${heading[1]}`);
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

function columnDefsForModule(module: ReviewModule): ColDef<ReviewRow>[] {
  return module === "注释" ? annotationColumnDefs : standardColumnDefs;
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
  defaultColDef: { sortable: true, resizable: true, filter: true },
  rowHeight: 42,
  headerHeight: 38,
  animateRows: false,
  getRowId: (params) => params.data.rowId ?? params.data.id,
  rowClassRules: {
    "row-changed": (params) => currentRowDiffState(params.data) !== undefined,
  },
  onRowClicked: (event: RowClickedEvent<ReviewRow>) => { if (event.data) jumpToReviewRow(event.data); },
  onSelectionChanged: updateGridCounters,
  onFilterChanged: updateGridCounters,
  onGridReady: updateGridCounters,
});

gridFilter.addEventListener("input", () => {
  gridApi?.setGridOption("quickFilterText", gridFilter.value);
  updateGridCounters();
});

function selectModule(module: ReviewModule): void {
  activeModule = module;
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

selectModule("章节标题");

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
  if (!syncToggle.checked || syncOrigin === "preview") return;
  const block = previewBlockForLine(editorTopLine());
  if (!block) return;
  const previewRect = preview.getBoundingClientRect();
  const blockRect = block.getBoundingClientRect();
  syncOrigin = "editor";
  preview.scrollTop += blockRect.top - previewRect.top - 16;
  requestAnimationFrame(() => { syncOrigin = undefined; });
}

function syncEditorFromPreview(): void {
  if (!syncToggle.checked || syncOrigin === "editor") return;
  const line = previewTopLine();
  if (!line) return;
  const clamped = Math.max(1, Math.min(line, view.state.doc.lines));
  const info = view.state.doc.line(clamped);
  syncOrigin = "preview";
  view.dispatch({ effects: EditorView.scrollIntoView(info.from, { y: "start", yMargin: 18 }) });
  requestAnimationFrame(() => { syncOrigin = undefined; });
}

view.scrollDOM.addEventListener("scroll", () => {
  if (!syncToggle.checked || syncOrigin === "preview") return;
  cancelAnimationFrame(editorFrame);
  editorFrame = requestAnimationFrame(syncPreviewFromEditor);
}, { passive: true });

preview.addEventListener("scroll", () => {
  if (!syncToggle.checked || syncOrigin === "editor") return;
  cancelAnimationFrame(previewFrame);
  previewFrame = requestAnimationFrame(syncEditorFromPreview);
}, { passive: true });

function jumpToLine(): void {
  const requested = Number.parseInt(lineInput.value, 10);
  const line = Number.isFinite(requested) ? Math.max(1, Math.min(requested, view.state.doc.lines)) : 1;
  const info = view.state.doc.line(line);
  view.dispatch({
    selection: { anchor: info.from },
    effects: [
      setTargetLine.of(line),
      EditorView.scrollIntoView(info.from, { y: "center" }),
    ],
  });
  view.focus();
  status.textContent = `已定位第 ${line} 行 · offset ${info.from}`;
  requestAnimationFrame(syncPreviewFromEditor);
}

jumpButton.addEventListener("click", jumpToLine);
lineInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") jumpToLine();
});
syncToggle.addEventListener("change", () => {
  status.textContent = syncToggle.checked ? "双向滚动联动：开" : "双向滚动联动：关";
  if (syncToggle.checked) requestAnimationFrame(syncPreviewFromEditor);
});
eolToggle.addEventListener("change", () => {
  view.dispatch({ effects: setLineEndingsVisible.of(eolToggle.checked) });
  status.textContent = eolToggle.checked ? `行尾符号：开 · ${lineEndingGlyph}` : "行尾符号：关";
});
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

function applySplitState(): void {
  workspace.style.setProperty("--left-pane-width", `${splitState.leftPercent}%`);
  editorPane.style.setProperty("--editor-top-height", `${splitState.editorTopPercent}%`);
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
  horizontalSplitter.setPointerCapture(event.pointerId);
  horizontalSplitter.classList.add("is-dragging");
  document.body.classList.add("is-resizing");
});
horizontalSplitter.addEventListener("pointermove", (event) => {
  if (!horizontalSplitter.hasPointerCapture(event.pointerId)) return;
  const rect = editorPane.getBoundingClientRect();
  const top = Math.max(160, Math.min(event.clientY - rect.top, rect.height - 166));
  splitState.editorTopPercent = (top / rect.height) * 100;
  applySplitState();
});
horizontalSplitter.addEventListener("pointerup", (event) => {
  if (horizontalSplitter.hasPointerCapture(event.pointerId)) horizontalSplitter.releasePointerCapture(event.pointerId);
  finishResize(horizontalSplitter);
});
horizontalSplitter.addEventListener("pointercancel", () => finishResize(horizontalSplitter));

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

applySplitState();
