import { defaultKeymap } from "@codemirror/commands";
import { css } from "@codemirror/lang-css";
import { syntaxHighlighting } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import {
  regexHighlightEffect,
  regexHighlightField,
} from "./regexMatchHighlight";
import type { SourceRegexMatch } from "./sourceRegexSearch";
import { obsidianSyntaxHighlight } from "./workingEditor";

export const CUSTOM_CSS_STORAGE_KEY = "ocr2md.v2.custom-css.v1";

const CUSTOM_CSS_COMMON = `/* 通用：iPad / Mac 共用 */
:root {
  --source-selection-bg: rgba(10, 132, 255, 0.32);
  --regex-match-bg: color-mix(in srgb, var(--accent) 28%, transparent);
  --regex-match-current-bg: color-mix(in srgb, var(--accent) 58%, transparent);
  --regex-match-current-border: var(--accent);
  --footnote-ref-size: 1.25em;
}`;

export const CUSTOM_CSS_DEFAULT = `${CUSTOM_CSS_COMMON}

/* 设备字体 */
:root[data-device-profile="ipad"] {
  --ui-font-size: 13px;
  --grid-font-size: 13px;
  --right-font-size: 14px;
}

:root[data-device-profile="mac"] {
  --ui-font-size: 13px;
  --grid-font-size: 13px;
  --right-font-size: 14px;
}
`;

const ALLOWED_COMMON_CSS_VARS = new Set([
  "--source-selection-bg",
  "--regex-match-bg",
  "--regex-match-current-bg",
  "--regex-match-current-border",
  "--footnote-ref-size",
]);

const ALLOWED_DEVICE_CSS_VARS = new Set([
  "--ui-font-size",
  "--grid-font-size",
  "--right-font-size",
]);

function declarationsFor(
  body: string,
  allowed: ReadonlySet<string>,
): string[] {
  return Array.from(
    body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;{}]+)\s*;?/gi),
  )
    .filter((entry) => allowed.has(entry[1]))
    .map((entry) => `  ${entry[1]}: ${entry[2].trim()};`);
}

function sanitizedCustomCss(source: string): string {
  const blocks: string[] = [];

  const commonMatch = /:root\s*\{([\s\S]*?)\}/.exec(source);
  if (commonMatch) {
    const declarations = declarationsFor(
      commonMatch[1],
      ALLOWED_COMMON_CSS_VARS,
    );
    if (declarations.length) {
      blocks.push(`:root {\n${declarations.join("\n")}\n}`);
    }
  }

  const blockPattern =
    /:root\[data-device-profile="(ipad|mac)"\]\s*\{([\s\S]*?)\}/g;
  let match: RegExpExecArray | null;

  while ((match = blockPattern.exec(source))) {
    const selector = `:root[data-device-profile="${match[1]}"]`;
    const declarations = declarationsFor(
      match[2],
      ALLOWED_DEVICE_CSS_VARS,
    );

    if (declarations.length) {
      blocks.push(`${selector} {\n${declarations.join("\n")}\n}`);
    }
  }

  return blocks.join("\n\n");
}

function storedCustomCss(): string {
  try {
    const stored = localStorage.getItem(CUSTOM_CSS_STORAGE_KEY);
    if (!stored) return CUSTOM_CSS_DEFAULT;
    if (/:root\s*\{/.test(stored)) {
      const common = /:root\s*\{([\s\S]*?)\}/.exec(stored);
      const missing: string[] = [];
      if (common && !/--source-selection-bg\s*:/.test(common[1])) {
        missing.push("  --source-selection-bg: rgba(10, 132, 255, 0.32);");
      }
      if (common && !/--footnote-ref-size\s*:/.test(common[1])) {
        missing.push("  --footnote-ref-size: 1.25em;");
      }
      if (common && missing.length) {
        return stored.replace(
          /(:root\s*\{)([\s\S]*?)(\})/,
          (_whole, open: string, body: string, close: string) => {
            const normalizedBody = body.endsWith("\n") ? body : `${body}\n`;
            return `${open}${normalizedBody}${missing.join("\n")}\n${close}`;
          },
        );
      }
      return stored;
    }
    return `${CUSTOM_CSS_COMMON}\n\n${stored}`;
  } catch {
    return CUSTOM_CSS_DEFAULT;
  }
}

export class CustomCssEditor {
  private readonly style: HTMLStyleElement;
  private readonly view: EditorView;
  private applyTimer = 0;

  constructor(
    host: HTMLElement,
    private readonly onStatus: (text: string) => void,
  ) {
    this.style =
      document.querySelector<HTMLStyleElement>("#ocr2md-custom-css")
      ?? document.head.appendChild(document.createElement("style"));
    this.style.id = "ocr2md-custom-css";

    const initial = storedCustomCss();
    this.apply(initial);

    this.view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: initial,
        extensions: [
          lineNumbers(),
          css(),
          syntaxHighlighting(obsidianSyntaxHighlight),
          regexHighlightField,
          keymap.of(defaultKeymap),
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return;
            window.clearTimeout(this.applyTimer);
            this.applyTimer = window.setTimeout(() => {
              this.apply(update.state.doc.toString());
              this.onStatus("自定义 CSS · 实时预览（未保存）");
            }, 150);
          }),
        ],
      }),
    });
  }

  source(): string {
    return this.view.state.doc.toString();
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

  focus(): void {
    this.view.requestMeasure();
    this.view.focus();
  }

  save(): void {
    const source = this.view.state.doc.toString();
    this.apply(source);
    try {
      localStorage.setItem(CUSTOM_CSS_STORAGE_KEY, source);
      this.onStatus("自定义 CSS 已保存");
    } catch {
      this.onStatus("自定义 CSS 已应用，但浏览器保存失败");
    }
  }

  reset(): void {
    this.view.dispatch({
      changes: {
        from: 0,
        to: this.view.state.doc.length,
        insert: CUSTOM_CSS_DEFAULT,
      },
    });
    this.apply(CUSTOM_CSS_DEFAULT);
    try {
      localStorage.removeItem(CUSTOM_CSS_STORAGE_KEY);
    } catch {
      // no-op
    }
    this.onStatus("自定义 CSS 已恢复默认");
  }

  private apply(source: string): void {
    this.style.textContent = sanitizedCustomCss(source);
  }
}
