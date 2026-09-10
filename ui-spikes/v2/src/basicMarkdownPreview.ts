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

type PreviewEnvironment = {
  chapterId?: string;
};

function chapterImageUrl(
  chapterId: string | undefined,
  source: string,
): string | undefined {
  if (!chapterId) return undefined;
  const normalized = source.replace(/^\.\//, "");
  if (!/^imgs\/[^/]+\.(?:png|jpe?g|webp|gif)$/i.test(normalized)) {
    return undefined;
  }
  return "/__workspace/chapter/image?chapterId="
    + encodeURIComponent(chapterId)
    + "&path="
    + encodeURIComponent(normalized);
}

function rewriteObsidianImageEmbeds(
  text: string,
  chapterId: string | undefined,
): string {
  if (!chapterId) return text;
  return text.replace(
    /!\[\[([^\]|\r\n]+\.(?:png|jpe?g|webp|gif))(?:\|[^\]\r\n]+)?\]\]/gi,
    (whole, source: string) => {
      const url = chapterImageUrl(chapterId, source.trim());
      return url ? `![image](${url})` : whole;
    },
  );
}

const defaultImage =
  md.renderer.rules.image
  ?? ((tokens, idx, options, env, self) =>
    self.renderToken(tokens, idx, options));

md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const source = token.attrGet("src");
  if (source) {
    const routed = chapterImageUrl(
      (env as PreviewEnvironment).chapterId,
      String(source),
    );
    if (routed) token.attrSet("src", routed);
  }
  return defaultImage(tokens, idx, options, env, self);
};

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
  private lastChapterId: string | undefined;
  private lastMode: "markdown" | "media" = "markdown";

  constructor(private readonly root: HTMLElement) {}

  render(text: string, chapterId?: string): void {
    if (
      this.lastMode === "markdown"
      && text === this.lastText
      && chapterId === this.lastChapterId
    ) return;
    this.lastMode = "markdown";
    this.lastText = text;
    this.lastChapterId = chapterId;

    if (!text) {
      this.root.innerHTML =
        '<div class="preview-empty">打开章节后显示 Markdown 预览</div>';
      return;
    }

    const env: PreviewEnvironment = { chapterId };
    const tokens = md.parse(
      maskLeadingYamlFrontmatter(
        rewriteObsidianImageEmbeds(text, chapterId),
      ),
      env,
    );

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

  renderMedia(chapterId: string, relativePath: string, label: string): void {
    this.renderMediaSource(
      chapterImageUrl(chapterId, relativePath) ?? "",
      label,
    );
  }

  renderMediaSource(source: string, label: string): void {
    this.lastMode = "media";
    const image = document.createElement("img");
    image.src = source;
    image.alt = label;
    image.className = "media-preview-image";

    const caption = document.createElement("div");
    caption.className = "media-preview-caption";
    caption.textContent = label;

    const wrap = document.createElement("div");
    wrap.className = "media-preview-wrap";
    wrap.append(image, caption);
    this.root.replaceChildren(wrap);
  }
}
