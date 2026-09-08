import DOMPurify from "dompurify";
import katex from "katex";
import MarkdownIt from "markdown-it";
// markdown-it-texmath does not ship TypeScript declarations.
// @ts-expect-error untyped third-party plugin
import texmath from "markdown-it-texmath";
import "katex/dist/katex.min.css";

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
});

md.use(texmath, {
  engine: katex,
  delimiters: "dollars",
  katexOptions: {
    throwOnError: false,
    strict: "ignore",
  },
});

const defaultHtmlBlock =
  md.renderer.rules.html_block ?? ((tokens, idx) => tokens[idx].content);

md.renderer.rules.html_block = (tokens, idx, options, env, self) => {
  const rendered = defaultHtmlBlock(tokens, idx, options, env, self);
  const line = tokens[idx].map?.[0];
  return line == null
    ? rendered
    : `<div class="md-source-block md-html-block" data-source-line="${line + 1}">${rendered}</div>`;
};

function maskLeadingYamlFrontmatter(text: string): string {
  const opening = /^(?:\uFEFF)?---[ \t]*(?:\r\n|\n|\r)/.exec(text);
  if (!opening) return text;

  const closing = /^(?:---|\.\.\.)[ \t]*(?:\r\n|\n|\r|$)/gm;
  closing.lastIndex = opening[0].length;
  const match = closing.exec(text);
  if (!match) return text;

  const end = match.index + match[0].length;
  return text.slice(0, end).replace(/[^\r\n]/g, " ") + text.slice(end);
}

export class BasicMarkdownPreview {
  private lastText = "";

  constructor(private readonly root: HTMLElement) {}

  render(text: string): void {
    if (text === this.lastText) return;
    this.lastText = text;

    if (!text) {
      this.root.innerHTML =
        '<div class="preview-empty">打开章节后显示 Markdown 预览</div>';
      return;
    }

    const env = {};
    const tokens = md.parse(maskLeadingYamlFrontmatter(text), env);

    for (const token of tokens) {
      if (
        token.type === "html_block"
        || token.nesting !== 1
        || !token.map?.length
      ) {
        continue;
      }
      token.attrJoin("class", "md-source-block");
      token.attrSet("data-source-line", String(token.map[0] + 1));
    }

    const raw = md.renderer.render(tokens, md.options, env);
    this.root.innerHTML = DOMPurify.sanitize(raw, {
      ALLOW_DATA_ATTR: true,
      USE_PROFILES: {
        html: true,
        mathMl: true,
      },
    });
  }
}
