import DOMPurify from "dompurify";
import katex from "katex";
import MarkdownIt from "markdown-it";
// markdown-it-texmath does not ship TypeScript declarations.
// @ts-expect-error untyped third-party plugin
import texmath from "markdown-it-texmath";
import "katex/dist/katex.min.css";
import {
  normalizeObsidianEmbedBlocksForPreview,
  scanObsidianCalloutsForPreview,
  type ObsidianCalloutPreview,
} from "./obsidianPreviewCompat";

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
});

type PreviewEnvironment = {
  chapterId?: string;
};

const FOOTNOTE_REFERENCE = /\[\^([^\]\r\n]+)\](?!:)/g;
const FOOTNOTE_DEFINITION = /^\[\^([^\]]+)\]:[ \t]*(.*)$/;
const FOOTNOTE_LONG_PRESS_MS = 450;
const FOOTNOTE_PRESS_MOVE_TOLERANCE = 12;

function footnoteBodies(text: string): Map<string, string> {
  const result = new Map<string, string>();
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const match = FOOTNOTE_DEFINITION.exec(lines[index] ?? "");
    if (!match) continue;
    const number = match[1].trim();
    const bodyLines = [match[2].trim()];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const line = lines[cursor] ?? "";
      if (line.trim() === "<br>" || FOOTNOTE_DEFINITION.test(line)) break;
      if (!/^\s+\S/.test(line)) break;
      bodyLines.push(line.trim());
      index = cursor;
    }
    result.set(number, bodyLines.filter(Boolean).join(" "));
  }
  return result;
}

function decorateFootnoteReferences(
  root: HTMLElement,
  bodies: ReadonlyMap<string, string>,
): void {
  if (!bodies.size) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const parent = node.parentElement;
    if (!parent) continue;
    if (parent.closest("code, pre, script, style, textarea, .ocr2md-footnote-popover")) {
      continue;
    }
    FOOTNOTE_REFERENCE.lastIndex = 0;
    if (FOOTNOTE_REFERENCE.test(node.data)) textNodes.push(node);
  }

  for (const node of textNodes) {
    const source = node.data;
    FOOTNOTE_REFERENCE.lastIndex = 0;
    let cursor = 0;
    let changed = false;
    const fragment = document.createDocumentFragment();
    for (const match of source.matchAll(FOOTNOTE_REFERENCE)) {
      const start = match.index;
      if (start === undefined) continue;
      const number = match[1]?.trim() ?? "";
      if (!number || !bodies.has(number)) continue;
      if (start > cursor) fragment.append(source.slice(cursor, start));
      const reference = document.createElement("sup");
      reference.className = "ocr2md-footnote-ref";
      reference.dataset.footnoteNumber = number;
      reference.setAttribute("role", "button");
      reference.setAttribute("aria-label", `注释 ${number}，长按查看`);
      reference.tabIndex = 0;
      reference.textContent = number;
      fragment.append(reference);
      cursor = start + match[0].length;
      changed = true;
    }
    if (!changed) continue;
    if (cursor < source.length) fragment.append(source.slice(cursor));
    node.replaceWith(fragment);
  }
}

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
  private footnoteBodies = new Map<string, string>();
  private footnotePressTimer: number | undefined;
  private footnotePressTarget: HTMLElement | undefined;
  private footnotePressPointerId: number | undefined;
  private footnotePressStart: { x: number; y: number } | undefined;
  private footnotePressLastY: number | undefined;
  private footnotePopover: HTMLElement | undefined;

  constructor(private readonly root: HTMLElement) {
    this.root.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest<HTMLButtonElement>(
        ".ocr2md-callout__title",
      );
      if (!button) return;
      const callout = button.closest<HTMLElement>(".ocr2md-callout");
      if (!callout) return;

      const collapsed = callout.dataset.collapsed === "true";
      callout.dataset.collapsed = collapsed ? "false" : "true";
      button.setAttribute("aria-expanded", String(collapsed));
    });
    this.root.addEventListener("pointerdown", (event) => {
      const reference = this.footnoteReferenceFromEvent(event);
      if (!reference || !event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) {
        return;
      }
      this.cancelFootnotePress();
      this.footnotePressTarget = reference;
      this.footnotePressPointerId = event.pointerId;
      this.footnotePressStart = { x: event.clientX, y: event.clientY };
      this.footnotePressLastY = event.clientY;
      try {
        reference.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture is a best-effort enhancement for touch drag scrolling.
      }
      this.footnotePressTimer = window.setTimeout(() => {
        if (this.footnotePressTarget !== reference) return;
        this.showFootnotePopover(reference);
      }, FOOTNOTE_LONG_PRESS_MS);
    });
    this.root.addEventListener("pointermove", (event) => {
      if (
        this.footnotePressPointerId !== event.pointerId
        || !this.footnotePressStart
      ) return;
      if (this.footnotePopover) {
        event.preventDefault();
        const lastY = this.footnotePressLastY ?? event.clientY;
        const deltaY = event.clientY - lastY;
        this.footnotePopover.scrollTop -= deltaY;
        this.footnotePressLastY = event.clientY;
        return;
      }
      const distance = Math.hypot(
        event.clientX - this.footnotePressStart.x,
        event.clientY - this.footnotePressStart.y,
      );
      if (distance > FOOTNOTE_PRESS_MOVE_TOLERANCE) this.cancelFootnotePress();
    });
    for (const eventName of ["pointerup", "pointercancel", "pointerleave"] as const) {
      this.root.addEventListener(eventName, (event) => {
        if (eventName === "pointerleave" && this.footnotePopover) return;
        if (
          this.footnotePressPointerId !== undefined
          && event.pointerId !== this.footnotePressPointerId
        ) return;
        this.cancelFootnotePress();
      });
    }
    this.root.addEventListener("contextmenu", (event) => {
      if (this.footnoteReferenceFromEvent(event)) event.preventDefault();
    });
    window.addEventListener("pointerup", (event) => {
      if (
        this.footnotePressPointerId === undefined
        || event.pointerId === this.footnotePressPointerId
      ) this.cancelFootnotePress();
    });
    window.addEventListener("pointercancel", (event) => {
      if (
        this.footnotePressPointerId === undefined
        || event.pointerId === this.footnotePressPointerId
      ) this.cancelFootnotePress();
    });
  }

  private footnoteReferenceFromEvent(event: Event): HTMLElement | undefined {
    const target = event.target;
    if (!(target instanceof Element)) return undefined;
    return target.closest<HTMLElement>(".ocr2md-footnote-ref") ?? undefined;
  }

  private cancelFootnotePress(): void {
    if (this.footnotePressTimer !== undefined) {
      window.clearTimeout(this.footnotePressTimer);
    }
    const pointerId = this.footnotePressPointerId;
    const target = this.footnotePressTarget;
    if (pointerId !== undefined && target?.hasPointerCapture(pointerId)) {
      try {
        target.releasePointerCapture(pointerId);
      } catch {
        // no-op
      }
    }
    this.footnotePressTimer = undefined;
    this.footnotePressTarget = undefined;
    this.footnotePressPointerId = undefined;
    this.footnotePressStart = undefined;
    this.footnotePressLastY = undefined;
    this.footnotePopover?.remove();
    this.footnotePopover = undefined;
  }

  private showFootnotePopover(reference: HTMLElement): void {
    const number = reference.dataset.footnoteNumber ?? "";
    const body = this.footnoteBodies.get(number);
    if (!body) return;

    this.footnotePopover?.remove();
    const popover = document.createElement("div");
    popover.className = "ocr2md-footnote-popover";
    popover.dataset.footnoteNumber = number;
    popover.setAttribute("role", "tooltip");

    const heading = document.createElement("div");
    heading.className = "ocr2md-footnote-popover__title";
    heading.textContent = `注释 ${number}`;
    const content = document.createElement("div");
    content.className = "ocr2md-footnote-popover__body";
    content.textContent = body;
    popover.append(heading, content);
    document.body.append(popover);

    const anchor = reference.getBoundingClientRect();
    const margin = 12;
    const maxLeft = Math.max(margin, window.innerWidth - popover.offsetWidth - margin);
    const left = Math.min(Math.max(anchor.left, margin), maxLeft);
    let top = anchor.bottom + 8;
    if (top + popover.offsetHeight > window.innerHeight - margin) {
      top = Math.max(margin, anchor.top - popover.offsetHeight - 8);
    }
    popover.style.left = `${Math.round(left)}px`;
    popover.style.top = `${Math.round(top)}px`;
    this.footnotePopover = popover;
  }

  private renderCallout(
    blockquote: HTMLElement,
    callout: ObsidianCalloutPreview,
  ): void {
    if (callout.title.trim().toLowerCase() !== "html") return;

    blockquote.classList.add("ocr2md-callout");
    blockquote.dataset.callout = callout.type || "note";
    blockquote.dataset.collapsed = String(callout.collapsed);

    const title = document.createElement("button");
    title.type = "button";
    title.className = "ocr2md-callout__title";
    title.setAttribute("aria-expanded", String(!callout.collapsed));

    const icon = document.createElement("span");
    icon.className = "ocr2md-callout__icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "<>";

    const label = document.createElement("span");
    label.className = "ocr2md-callout__label";
    label.textContent = callout.title;

    const chevron = document.createElement("span");
    chevron.className = "ocr2md-callout__chevron";
    chevron.setAttribute("aria-hidden", "true");
    chevron.textContent = "›";

    title.append(icon, label, chevron);

    const body = document.createElement("div");
    body.className = "ocr2md-callout__body";
    const rendered = document.createElement("div");
    rendered.className = "ocr2md-callout__rendered";
    rendered.innerHTML = DOMPurify.sanitize(callout.bodySource, {
      ALLOW_DATA_ATTR: true,
      USE_PROFILES: {
        html: true,
      },
    });
    body.append(rendered);

    blockquote.replaceChildren(title, body);
  }

  render(text: string, chapterId?: string): void {
    if (
      this.lastMode === "markdown"
      && text === this.lastText
      && chapterId === this.lastChapterId
    ) return;
    this.lastMode = "markdown";
    this.lastText = text;
    this.lastChapterId = chapterId;
    this.cancelFootnotePress();
    this.footnoteBodies = footnoteBodies(text);

    if (!text) {
      this.root.innerHTML =
        '<div class="preview-empty">打开章节后显示 Markdown 预览</div>';
      return;
    }

    const env: PreviewEnvironment = { chapterId };
    const normalized = normalizeObsidianEmbedBlocksForPreview(
      maskLeadingYamlFrontmatter(
        rewriteObsidianImageEmbeds(text, chapterId),
      ),
    );
    const callouts = scanObsidianCalloutsForPreview(normalized.markdown);
    const tokens = md.parse(normalized.markdown, env);

    for (const token of tokens) {
      if (
        token.type === "blockquote_open"
        && token.map?.length
        && normalized.embedStartLines.has(token.map[0])
      ) {
        token.attrJoin("class", "ocr2md-embed-block");
      }
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

    for (const blockquote of Array.from(
      this.root.querySelectorAll<HTMLElement>("blockquote[data-source-line]"),
    )) {
      const sourceLine = Number(blockquote.dataset.sourceLine);
      const callout = callouts.get(sourceLine);
      if (callout) this.renderCallout(blockquote, callout);
    }
    decorateFootnoteReferences(this.root, this.footnoteBodies);
  }

  renderMedia(chapterId: string, relativePath: string, label: string): void {
    this.renderMediaSource(
      chapterImageUrl(chapterId, relativePath) ?? "",
      label,
    );
  }

  renderMediaSource(source: string, label: string): void {
    this.cancelFootnotePress();
    this.footnoteBodies.clear();
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
