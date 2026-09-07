import { defaultKeymap } from "@codemirror/commands";
import { css } from "@codemirror/lang-css";
import { syntaxHighlighting } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { obsidianSyntaxHighlight } from "./workingEditor";

export const CUSTOM_CSS_STORAGE_KEY = "ocr2md.v2.custom-css.v1";

export const CUSTOM_CSS_DEFAULT = `/* 自定义 CSS：只允许修改下面三个字体变量。 */
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

const ALLOWED_CUSTOM_CSS_VARS = new Set([
  "--ui-font-size",
  "--grid-font-size",
  "--right-font-size",
]);

function sanitizedCustomCss(source: string): string {
  const blocks: string[] = [];
  const blockPattern =
    /:root\[data-device-profile="(ipad|mac)"\]\s*\{([\s\S]*?)\}/g;
  let match: RegExpExecArray | null;

  while ((match = blockPattern.exec(source))) {
    const selector = `:root[data-device-profile="${match[1]}"]`;
    const declarations = Array.from(
      match[2].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;{}]+)\s*;?/gi),
    )
      .filter((entry) => ALLOWED_CUSTOM_CSS_VARS.has(entry[1]))
      .map((entry) => `  ${entry[1]}: ${entry[2].trim()};`);

    if (declarations.length) {
      blocks.push(`${selector} {\n${declarations.join("\n")}\n}`);
    }
  }

  return blocks.join("\n\n");
}

function storedCustomCss(): string {
  try {
    return localStorage.getItem(CUSTOM_CSS_STORAGE_KEY) ?? CUSTOM_CSS_DEFAULT;
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
