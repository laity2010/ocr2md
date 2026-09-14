import { defaultKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import {
  Compartment,
  EditorState,
  RangeSetBuilder,
  StateField,
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  drawSelection,
  EditorView,
  WidgetType,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import type { SourceRange } from "../../../src/types";
import {
  regexHighlightEffect,
  regexHighlightField,
} from "./regexMatchHighlight";
import type { SourceRegexMatch } from "./sourceRegexSearch";

export const obsidianSyntaxHighlight = HighlightStyle.define([
  { tag: tags.comment, color: "var(--obsidian-code-comment)" },
  {
    tag: tags.link,
    color: "var(--obsidian-code-link)",
    textDecoration: "underline",
  },
  {
    tag: tags.url,
    color: "var(--obsidian-code-url)",
    textDecoration: "underline",
  },
  {
    tag: [tags.function(tags.variableName), tags.function(tags.propertyName)],
    color: "var(--obsidian-code-function)",
  },
  {
    tag: [tags.keyword, tags.controlKeyword, tags.moduleKeyword],
    color: "var(--obsidian-code-keyword)",
  },
  {
    tag: [
      tags.operator,
      tags.logicOperator,
      tags.arithmeticOperator,
      tags.compareOperator,
    ],
    color: "var(--obsidian-code-operator)",
  },
  {
    tag: [tags.propertyName, tags.attributeName],
    color: "var(--obsidian-code-property)",
  },
  {
    tag: [tags.string, tags.special(tags.string)],
    color: "var(--obsidian-code-string)",
  },
  {
    tag: [tags.tagName, tags.typeName],
    color: "var(--obsidian-code-tag)",
  },
  {
    tag: [tags.number, tags.bool, tags.null],
    color: "var(--obsidian-code-value)",
  },
  {
    tag: [tags.punctuation, tags.bracket, tags.angleBracket],
    color: "var(--obsidian-code-punctuation)",
  },
]);

const sourceHeadingField = StateField.define<DecorationSet>({
  create(state) {
    return sourceHeadingDecorations(state.doc);
  },
  update(value, transaction) {
    return transaction.docChanged
      ? sourceHeadingDecorations(transaction.state.doc)
      : value;
  },
  provide: (field) => EditorView.decorations.from(field),
});

function sourceHeadingDecorations(doc: EditorState["doc"]): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (let lineNumber = 1; lineNumber <= doc.lines; lineNumber += 1) {
    const line = doc.line(lineNumber);
    const match = /^ {0,3}(#{1,6})(?:\s+|$)/.exec(line.text);
    if (!match) continue;
    builder.add(
      line.from,
      line.from,
      Decoration.line({ class: `cm-obsidian-h${match[1].length}` }),
    );
  }
  return builder.finish();
}

type StyledRange = {
  from: number;
  to: number;
  className: string;
};

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
      {
        from,
        to: contentFrom,
        className: "cm-obsidian-latex-punctuation",
      },
      {
        from: contentTo,
        to,
        className: "cm-obsidian-latex-punctuation",
      },
    );

    const content = text.slice(contentFrom, contentTo);
    const tokenPattern = /\\[A-Za-z]+|\\.|\d+(?:\.\d+)?|[_^&=+\-*/<>]|[{}\[\](),:;.]/g;
    let token: RegExpExecArray | null;

    while ((token = tokenPattern.exec(content))) {
      const tokenFrom = contentFrom + token.index;
      const tokenTo = tokenFrom + token[0].length;
      let className = "cm-obsidian-latex-punctuation";
      if (token[0].startsWith("\\")) {
        className = "cm-obsidian-latex-function";
      } else if (/^\d/.test(token[0])) {
        className = "cm-obsidian-latex-value";
      } else if (/^[_^&=+\-*/<>]$/.test(token[0])) {
        className = "cm-obsidian-latex-operator";
      }
      styled.push({ from: tokenFrom, to: tokenTo, className });
    }
  }

  styled.sort((left, right) => left.from - right.from || left.to - right.to);
  const builder = new RangeSetBuilder<Decoration>();
  for (const range of styled) {
    if (range.to <= range.from) continue;
    builder.add(
      range.from,
      range.to,
      Decoration.mark({ class: range.className }),
    );
  }
  return builder.finish();
}

const latexHighlightField = StateField.define<DecorationSet>({
  create(state) {
    return latexDecorations(state.doc);
  },
  update(value, transaction) {
    return transaction.docChanged
      ? latexDecorations(transaction.state.doc)
      : value;
  },
  provide: (field) => EditorView.decorations.from(field),
});

class HardReturnWidget extends WidgetType {
  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-hard-return-marker";
    span.textContent = "↵";
    span.setAttribute("aria-hidden", "true");
    return span;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

function hardReturnDecorations(doc: EditorState["doc"]): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (let lineNumber = 1; lineNumber < doc.lines; lineNumber += 1) {
    const line = doc.line(lineNumber);
    builder.add(
      line.to,
      line.to,
      Decoration.widget({
        widget: new HardReturnWidget(),
        side: 1,
      }),
    );
  }
  return builder.finish();
}

const hardReturnField = StateField.define<DecorationSet>({
  create(state) {
    return hardReturnDecorations(state.doc);
  },
  update(value, transaction) {
    return transaction.docChanged
      ? hardReturnDecorations(transaction.state.doc)
      : value;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export class WorkingEditor {
  private readonly editableCompartment = new Compartment();
  private readonly hardReturnCompartment = new Compartment();
  private syncing = false;
  private readonly view: EditorView;

  constructor(
    parent: HTMLElement,
    private readonly onDocumentChanged: (text: string) => void,
    private readonly onUndo: () => void,
    private readonly onRedo: () => void,
    private readonly onImagePasted?: (file: File) => Promise<string>,
    private readonly onImagePasteComplete?: (markdown: string) => void,
    private readonly onImagePasteError?: (message: string) => void,
    private readonly onActiveLineNumberClicked?: (
      lineNumber: number,
      anchor: { x: number; y: number },
    ) => void,
  ) {
    this.view = new EditorView({
      parent,
      state: EditorState.create({
        doc: "",
        extensions: [
          lineNumbers({
            domEventHandlers: {
              click: (view, block, event) => {
                if (!this.onActiveLineNumberClicked) return false;
                const lineNumber = view.state.doc.lineAt(block.from).number;
                const activeLine = view.state.doc.lineAt(
                  view.state.selection.main.head,
                ).number;
                if (lineNumber !== activeLine) return false;
                const mouse = event as MouseEvent;
                const target = event.currentTarget instanceof HTMLElement
                  ? event.currentTarget
                  : event.target instanceof HTMLElement
                    ? event.target
                    : undefined;
                const rect = target?.getBoundingClientRect();
                this.onActiveLineNumberClicked(lineNumber, {
                  x: Number.isFinite(mouse.clientX) && mouse.clientX > 0
                    ? mouse.clientX
                    : (rect?.right ?? 0),
                  y: Number.isFinite(mouse.clientY) && mouse.clientY > 0
                    ? mouse.clientY
                    : (rect?.bottom ?? 0),
                });
                event.preventDefault();
                return true;
              },
            },
          }),
          highlightActiveLineGutter(),
          keymap.of([
            {
              key: "Mod-z",
              run: () => {
                this.onUndo();
                return true;
              },
            },
            {
              key: "Mod-Shift-z",
              run: () => {
                this.onRedo();
                return true;
              },
            },
            {
              key: "Mod-y",
              run: () => {
                this.onRedo();
                return true;
              },
            },
            ...defaultKeymap,
          ]),
          markdown(),
          syntaxHighlighting(obsidianSyntaxHighlight),
          drawSelection(),
          sourceHeadingField,
          latexHighlightField,
          regexHighlightField,
          this.hardReturnCompartment.of(hardReturnField),
          EditorView.lineWrapping,
          EditorView.domEventHandlers({
            paste: (event, view) => {
              if (!this.onImagePasted) return false;
              const clipboard = event.clipboardData;
              if (!clipboard) return false;
              const imageFile = Array.from(clipboard.files).find((file) =>
                file.type.startsWith("image/"))
                ?? Array.from(clipboard.items)
                  .find((item) => item.kind === "file" && item.type.startsWith("image/"))
                  ?.getAsFile()
                ?? undefined;
              if (!imageFile) return false;

              event.preventDefault();
              const selection = view.state.selection.main;
              const from = selection.from;
              const to = selection.to;
              void this.onImagePasted(imageFile).then((markdown) => {
                view.dispatch({
                  changes: { from, to, insert: markdown },
                  selection: { anchor: from + markdown.length },
                  scrollIntoView: true,
                });
                view.focus();
                this.onImagePasteComplete?.(markdown);
              }).catch((error: unknown) => {
                const message = error instanceof Error ? error.message : String(error);
                this.onImagePasteError?.(message);
              });
              return true;
            },
          }),
          this.editableCompartment.of(EditorView.editable.of(false)),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged || this.syncing) return;
            this.onDocumentChanged(update.state.doc.toString());
          }),
        ],
      }),
    });
  }

  setDocument(text: string): void {
    if (this.view.state.doc.toString() === text) return;
    this.syncing = true;
    try {
      this.view.dispatch({
        changes: {
          from: 0,
          to: this.view.state.doc.length,
          insert: text,
        },
      });
    } finally {
      this.syncing = false;
    }
  }

  clear(): void {
    this.setDocument("");
  }

  setShowHardReturns(show: boolean): void {
    this.view.dispatch({
      effects: this.hardReturnCompartment.reconfigure(
        show ? hardReturnField : [],
      ),
    });
  }

  setHardReturnColor(color: string): void {
    this.view.dom.style.setProperty(
      "--ocr2md-hard-return-color",
      color,
    );
  }

  setEditable(editable: boolean): void {
    this.view.dispatch({
      effects: this.editableCompartment.reconfigure(
        EditorView.editable.of(editable),
      ),
    });
  }

  getText(): string {
    return this.view.state.doc.toString();
  }

  insertDebugCharacter(character = "※"): void {
    const position = this.view.state.doc.length;
    this.view.dispatch({
      changes: {
        from: position,
        insert: character,
      },
      selection: {
        anchor: position + character.length,
      },
      scrollIntoView: true,
    });
  }

  setRegexMatches(
    matches: readonly SourceRegexMatch[],
    currentIndex: number,
  ): void {
    this.view.dispatch({
      effects: regexHighlightEffect(matches, currentIndex),
    });
  }

  revealOffsets(from: number, to: number, focus = true): void {
    const safeFrom = Math.max(0, Math.min(from, this.view.state.doc.length));
    const safeTo = Math.max(safeFrom, Math.min(to, this.view.state.doc.length));
    this.view.dispatch({
      selection: { anchor: safeFrom, head: safeTo },
      effects: EditorView.scrollIntoView(safeFrom, { y: "center" }),
    });
    if (focus) this.view.focus();
  }

  revealRange(range: SourceRange): number | undefined {
    const lineNumber = range.line + 1;
    if (lineNumber < 1 || lineNumber > this.view.state.doc.lines) return undefined;

    const startLine = this.view.state.doc.line(lineNumber);
    const from = Math.min(
      startLine.to,
      startLine.from + Math.max(0, range.start),
    );

    const endLineNumber = (range.endLine ?? range.line) + 1;
    const endLine = endLineNumber >= 1 && endLineNumber <= this.view.state.doc.lines
      ? this.view.state.doc.line(endLineNumber)
      : startLine;
    const to = Math.max(
      from,
      Math.min(endLine.to, endLine.from + Math.max(0, range.end)),
    );

    this.view.dispatch({
      selection: { anchor: from, head: to },
      effects: EditorView.scrollIntoView(from, { y: "center" }),
    });
    this.view.focus();
    return lineNumber;
  }

  revealIllegalBreakContext(range: SourceRange): number | undefined {
    const previousLineNumber = range.line + 1;
    const nextLineNumber = (range.endLine ?? range.line + 1) + 1;
    if (
      previousLineNumber < 1
      || nextLineNumber > this.view.state.doc.lines
      || previousLineNumber >= nextLineNumber
    ) {
      return this.revealRange(range);
    }

    const previousLine = this.view.state.doc.line(previousLineNumber);
    const nextLine = this.view.state.doc.line(nextLineNumber);
    const previousContent = previousLine.text.trimEnd();
    const nextContent = nextLine.text.trimStart();
    const previousTail = Array.from(previousContent).slice(-10).join("");
    const nextHead = Array.from(nextContent).slice(0, 10).join("");
    const nextLeadingWhitespace = nextLine.text.length - nextContent.length;
    const from = previousLine.from + previousContent.length - previousTail.length;
    const to = nextLine.from + nextLeadingWhitespace + nextHead.length;

    this.view.dispatch({
      selection: { anchor: from, head: Math.max(from, to) },
      effects: EditorView.scrollIntoView(from, { y: "center" }),
    });
    this.view.focus();
    return previousLineNumber;
  }

  selectionLine(): number {
    return this.view.state.doc.lineAt(
      this.view.state.selection.main.head,
    ).number;
  }

  focusLine(lineNumber: number): number {
    const clamped = Math.max(1, Math.min(lineNumber, this.view.state.doc.lines));
    const line = this.view.state.doc.line(clamped);
    this.view.dispatch({
      selection: { anchor: line.from },
      effects: EditorView.scrollIntoView(line.from, { y: "nearest" }),
    });
    this.view.requestMeasure();
    this.view.focus();
    return clamped;
  }

  selectedText(): string {
    const selection = this.view.state.selection.main;
    return this.view.state.doc.sliceString(selection.from, selection.to);
  }

  topVisibleLine(): number {
    const block = this.view.lineBlockAtHeight(this.view.scrollDOM.scrollTop + 4);
    return this.view.state.doc.lineAt(block.from).number;
  }

  scrollLineToTop(line: number): void {
    const clamped = Math.max(1, Math.min(line, this.view.state.doc.lines));
    const info = this.view.state.doc.line(clamped);
    this.view.dispatch({
      effects: EditorView.scrollIntoView(info.from, {
        y: "start",
        yMargin: 18,
      }),
    });
  }

  onScroll(listener: () => void): () => void {
    this.view.scrollDOM.addEventListener("scroll", listener, { passive: true });
    return () => this.view.scrollDOM.removeEventListener("scroll", listener);
  }

  focus(): void {
    this.view.requestMeasure();
    this.view.focus();
  }

  destroy(): void {
    this.view.destroy();
  }
}
