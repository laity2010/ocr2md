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
import {
  adoptedMediaLocalPath,
  type AdoptedMediaRoutes,
} from "./mediaCatalog";

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
});

type PreviewEnvironment = {
  chapterId?: string;
  mediaRoutes?: AdoptedMediaRoutes;
};

const FOOTNOTE_REFERENCE = /\[\^([^\]\r\n]+)\](?!:)/g;
const FOOTNOTE_DEFINITION = /^\[\^([^\]]+)\]:[ \t]*(.*)$/;
const FOOTNOTE_LONG_PRESS_MS = 450;
const FOOTNOTE_PRESS_MOVE_TOLERANCE = 12;
const TRANSLATION_POPOVER_DEFAULT_TAPS = 4;
const TRANSLATION_POPOVER_MAX_TAPS = 6;
const TRANSLATION_POPOVER_TAP_GAP_MS = 1800;

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

function routedChapterImageUrl(
  chapterId: string | undefined,
  source: string,
  mediaRoutes?: AdoptedMediaRoutes,
): string | undefined {
  const direct = chapterImageUrl(chapterId, source);
  if (direct) return direct;
  const adopted = adoptedMediaLocalPath(source, mediaRoutes);
  return adopted ? chapterImageUrl(chapterId, adopted) : undefined;
}

function mediaRouteSignature(routes: AdoptedMediaRoutes | undefined): string {
  if (!routes) return "";
  return JSON.stringify([
    [...routes.exact.entries()].sort(([a], [b]) => a.localeCompare(b)),
    [...routes.basename.entries()].sort(([a], [b]) => a.localeCompare(b)),
  ]);
}

function rewriteObsidianImageEmbeds(
  text: string,
  chapterId: string | undefined,
  mediaRoutes?: AdoptedMediaRoutes,
): string {
  if (!chapterId) return text;
  return text.replace(
    /!\[\[([^\]|\r\n]+\.(?:png|jpe?g|webp|gif))(?:\|[^\]\r\n]+)?\]\]/gi,
    (whole, source: string) => {
      const url = routedChapterImageUrl(chapterId, source.trim(), mediaRoutes);
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
    const previewEnv = env as PreviewEnvironment;
    const routed = routedChapterImageUrl(
      previewEnv.chapterId,
      String(source),
      previewEnv.mediaRoutes,
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


function stripQuoteDepth(line: string, depth: number): string {
  let rest = line;
  for (let index = 0; index < depth; index += 1) {
    const match = /^\s*>[ \t]?/.exec(rest);
    if (!match) break;
    rest = rest.slice(match[0].length);
  }
  return rest;
}

function calloutTrailingSource(
  markdown: string,
  callout: ObsidianCalloutPreview,
  parsedEndSourceLine: number,
): { markdown: string; sourceLineOffset: number } | undefined {
  if (callout.quoteDepth <= 1 || parsedEndSourceLine <= callout.endSourceLine) {
    return undefined;
  }
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const startIndex = callout.endSourceLine;
  const endIndex = Math.min(parsedEndSourceLine, lines.length);
  if (startIndex >= endIndex) return undefined;
  const parentDepth = callout.quoteDepth - 1;
  const trailing = lines
    .slice(startIndex, endIndex)
    .map((line) => stripQuoteDepth(line, parentDepth))
    .join("\n")
    .replace(/\s+$/, "");
  if (!trailing) return undefined;
  return {
    markdown: trailing,
    sourceLineOffset: startIndex,
  };
}

function renderMarkdownFragment(
  markdown: string,
  env: PreviewEnvironment,
  sourceLineOffset: number,
): string {
  const tokens = md.parse(markdown, env);
  for (const token of tokens) {
    if (token.map?.length) {
      token.map = [
        token.map[0] + sourceLineOffset,
        token.map[1] + sourceLineOffset,
      ];
    }
    if (
      token.type === "blockquote_open"
      && token.map?.length
    ) {
      token.attrSet("data-source-end-line", String(token.map[1]));
    }
    if (
      token.type === "html_block"
      || token.nesting !== 1
      || !token.map?.length
    ) continue;
    token.attrJoin("class", "md-source-block");
    token.attrSet("data-source-line", String(token.map[0] + 1));
  }
  return md.renderer.render(tokens, md.options, env);
}

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

type TranslationSentenceMarker = {
  id: string;
  sourceText: string;
  translatedText?: string;
  range: { line: number; start: number; end: number; endLine?: number };
  domOnly?: boolean;
};

function translationSentenceContentStart(sourceText: string): number {
  let offset = 0;
  let rest = sourceText;
  while (rest) {
    const match = /^(?:#{1,6}[ \t]+|>+[ \t]*|[-*+][ \t]+|\d+[.)][ \t]+|\[\^[^\]]+\]:[ \t]*)/.exec(rest);
    if (!match) break;
    offset += match[0].length;
    rest = rest.slice(match[0].length);
  }
  return offset;
}

function escapeHtmlAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function translationSentenceMarkup(
  sourceText: string,
  sentenceId: string,
): string {
  const contentStart = translationSentenceContentStart(sourceText);
  if (contentStart >= sourceText.length) return sourceText;

  const prefix = sourceText.slice(0, contentStart);
  const body = sourceText.slice(contentStart);
  const id = escapeHtmlAttribute(sentenceId);
  const open = `<span class="ocr2md-translation-sentence" data-sentence-id="${id}">`;
  const close = "</span>";

  // Footnote references keep their own interaction target. Never nest a
  // rendered footnote control inside the sentence translation hit area: on
  // iPad Safari the outer hit area otherwise wins pointer targeting.
  FOOTNOTE_REFERENCE.lastIndex = 0;
  let cursor = 0;
  let marked = prefix;
  let foundFootnote = false;
  for (const match of body.matchAll(FOOTNOTE_REFERENCE)) {
    const start = match.index;
    if (start === undefined) continue;
    foundFootnote = true;
    if (start > cursor) marked += open + body.slice(cursor, start) + close;
    marked += match[0];
    cursor = start + match[0].length;
  }
  if (!foundFootnote) return prefix + open + body + close;
  if (cursor < body.length) marked += open + body.slice(cursor) + close;
  return marked;
}


function decodedRenderedText(sourceText: string): string {
  if (!sourceText.includes("&")) return sourceText;
  const holder = document.createElement("textarea");
  holder.innerHTML = sourceText;
  return holder.value;
}

function decorateRenderedTranslationSentences(
  root: HTMLElement,
  pairs: readonly TranslationSentenceMarker[],
): void {
  for (const pair of pairs) {
    const expected = decodedRenderedText(pair.sourceText);
    if (!expected) continue;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let matched: Text | undefined;
    let index = -1;
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const parent = node.parentElement;
      if (!parent) continue;
      if (parent.closest(".ocr2md-translation-sentence, script, style, textarea")) continue;
      index = node.data.indexOf(expected);
      if (index >= 0) {
        matched = node;
        break;
      }
    }
    if (!matched || index < 0) continue;
    const fragment = document.createDocumentFragment();
    if (index > 0) fragment.append(matched.data.slice(0, index));
    const marker = document.createElement("span");
    marker.className = "ocr2md-translation-sentence";
    marker.dataset.sentenceId = pair.id;
    marker.textContent = expected;
    fragment.append(marker);
    const end = index + expected.length;
    if (end < matched.data.length) fragment.append(matched.data.slice(end));
    matched.replaceWith(fragment);
  }
}

function markdownLineStarts(markdown: string): number[] {
  const starts = [0];
  for (let index = 0; index < markdown.length; index += 1) {
    if (markdown[index] === "\n") starts.push(index + 1);
  }
  return starts;
}

function translatedDocumentMarkdown(
  markdown: string,
  pairs: readonly TranslationSentenceMarker[],
  annotateSentences: boolean,
): string {
  const normalized = markdown.replace(/\r\n?/g, "\n");
  const lineStarts = markdownLineStarts(normalized);
  const replacements: Array<{ start: number; end: number; value: string }> = [];
  for (const pair of pairs) {
    if (pair.domOnly || !pair.translatedText?.trim()) continue;
    const endLine = pair.range.endLine ?? pair.range.line;
    const lineStart = lineStarts[pair.range.line];
    const endLineStart = lineStarts[endLine];
    if (lineStart === undefined || endLineStart === undefined) continue;
    const start = lineStart + pair.range.start;
    const end = endLineStart + pair.range.end;
    if (start < 0 || end <= start || end > normalized.length) continue;
    if (normalized.slice(start, end) !== pair.sourceText) continue;
    replacements.push({
      start,
      end,
      value: annotateSentences
        ? translationSentenceMarkup(pair.translatedText, pair.id)
        : pair.translatedText,
    });
  }
  let output = normalized;
  for (const replacement of replacements.sort((left, right) => right.start - left.start)) {
    output = output.slice(0, replacement.start) + replacement.value + output.slice(replacement.end);
  }
  return output;
}

function decorateRenderedTranslatedSentences(
  root: HTMLElement,
  pairs: readonly TranslationSentenceMarker[],
): void {
  for (const pair of pairs) {
    if (!pair.translatedText?.trim()) continue;
    const expected = decodedRenderedText(pair.sourceText);
    if (!expected) continue;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let matched: Text | undefined;
    let index = -1;
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const parent = node.parentElement;
      if (!parent) continue;
      if (parent.closest(".ocr2md-translation-sentence, script, style, textarea")) continue;
      index = node.data.indexOf(expected);
      if (index >= 0) {
        matched = node;
        break;
      }
    }
    if (!matched || index < 0) continue;
    const fragment = document.createDocumentFragment();
    if (index > 0) fragment.append(matched.data.slice(0, index));
    const marker = document.createElement("span");
    marker.className = "ocr2md-translation-sentence";
    marker.dataset.sentenceId = pair.id;
    marker.textContent = pair.translatedText;
    fragment.append(marker);
    const end = index + expected.length;
    if (end < matched.data.length) fragment.append(matched.data.slice(end));
    matched.replaceWith(fragment);
  }
}

function annotateTranslationSentences(
  markdown: string,
  pairs: readonly TranslationSentenceMarker[],
): string {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const byLine = new Map<number, TranslationSentenceMarker[]>();
  for (const pair of pairs) {
    if (pair.domOnly) continue;
    const list = byLine.get(pair.range.line) ?? [];
    list.push(pair);
    byLine.set(pair.range.line, list);
  }
  for (const [lineIndex, linePairs] of byLine) {
    let line = lines[lineIndex];
    if (line === undefined) continue;
    for (const pair of [...linePairs].sort((a, b) => b.range.start - a.range.start)) {
      const { start, end } = pair.range;
      if (start < 0 || end > line.length || end <= start) continue;
      if (line.slice(start, end) !== pair.sourceText) continue;
      const marked = translationSentenceMarkup(pair.sourceText, pair.id);
      line = line.slice(0, start) + marked + line.slice(end);
    }
    lines[lineIndex] = line;
  }
  return lines.join("\n");
}

export class BasicMarkdownPreview {
  private lastText = "";
  private lastChapterId: string | undefined;
  private lastMediaRouteSignature = "";
  private lastMode: "markdown" | "media" | "translation-document" | "translated-document" = "markdown";
  private footnoteBodies = new Map<string, string>();
  private footnotePressTimer: number | undefined;
  private footnotePressTarget: HTMLElement | undefined;
  private footnotePressPointerId: number | undefined;
  private footnotePressStart: { x: number; y: number } | undefined;
  private footnotePressLastY: number | undefined;
  private footnotePopover: HTMLElement | undefined;
  private footnotePinnedNumber: string | undefined;
  private footnoteLongPressTriggered = false;
  private translationPopover: HTMLElement | undefined;
  private translationBySentenceId = new Map<string, { text?: string; title: string }>();
  private translationPopoverTapCount = TRANSLATION_POPOVER_DEFAULT_TAPS;
  private translationTapSentenceId = "";
  private translationTapProgress = 0;
  private translationLastTapAt = 0;
  private readingLineTargets = new Map<number, HTMLElement>();
  private readingLineLayoutFrame = 0;
  private readingScrollFrame = 0;
  private readingAnchorSourceLineValue: number | undefined;
  private readingProgrammaticScrollActive = false;

  constructor(private readonly root: HTMLElement) {
    this.root.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const footnote = target.closest<HTMLElement>(".ocr2md-footnote-ref");
      if (footnote) {
        event.preventDefault();
        // A real long press already displayed the transient popover. Ignore the
        // synthetic click Safari may emit after release so it does not reopen.
        if (this.footnoteLongPressTriggered) {
          this.footnoteLongPressTriggered = false;
          return;
        }
        const number = footnote.dataset.footnoteNumber ?? "";
        const closingPinned = Boolean(number && this.footnotePinnedNumber === number);
        this.footnotePopover?.remove();
        this.footnotePopover = undefined;
        this.footnotePinnedNumber = undefined;
        if (!closingPinned) {
          this.showFootnotePopover(footnote);
          if (this.footnotePopover) this.footnotePinnedNumber = number;
        }
        return;
      }

      if (!target.closest("a, button")) {
        const sentence = target.closest<HTMLElement>(".ocr2md-translation-sentence");
        if (sentence) {
          if (sentence.classList.contains("is-open")) {
            this.toggleTranslationPopover(sentence);
            return;
          }
          if (this.translationTapThresholdReached(sentence)) {
            this.toggleTranslationPopover(sentence);
          }
          return;
        }
      }
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
      const pointerTarget = event.target instanceof Element ? event.target : undefined;
      if (!pointerTarget?.closest(".ocr2md-reading-line-button")) {
        this.readingProgrammaticScrollActive = false;
      }
      const reference = this.footnoteReferenceFromEvent(event);
      if (!reference || !event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) {
        return;
      }
      this.cancelFootnotePress();
      this.footnoteLongPressTriggered = false;
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
        this.footnoteLongPressTriggered = true;
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
    document.addEventListener("pointerdown", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest(".ocr2md-footnote-ref, .ocr2md-footnote-popover")) {
        this.footnotePinnedNumber = undefined;
        this.footnotePopover?.remove();
        this.footnotePopover = undefined;
      }
      if (target.closest(".ocr2md-translation-sentence, .ocr2md-translation-popover")) return;
      this.closeTranslationPopover();
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
    this.root.addEventListener("scroll", () => {
      if (!this.isReadingMode()) return;
      cancelAnimationFrame(this.readingScrollFrame);
      this.readingScrollFrame = requestAnimationFrame(() => {
        if (this.readingProgrammaticScrollActive && this.readingAnchorSourceLineValue) {
          this.root.dataset.readingSourceLine = String(this.readingAnchorSourceLineValue);
          return;
        }
        const line = this.readingTopSourceLine();
        if (!line) return;
        this.readingAnchorSourceLineValue = line;
        this.root.dataset.readingSourceLine = String(line);
      });
    }, { passive: true });
    this.root.addEventListener("wheel", () => {
      this.readingProgrammaticScrollActive = false;
    }, { passive: true });
    this.root.addEventListener("load", () => {
      if (!this.isReadingMode()) return;
      this.queueReadingLineLayout();
      if (this.readingProgrammaticScrollActive && this.readingAnchorSourceLineValue) {
        this.scrollReadingToSourceLine(this.readingAnchorSourceLineValue);
      }
    }, true);
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

  setTranslationPopoverTapCount(value: number): void {
    const normalized = Number.isFinite(value)
      ? Math.min(TRANSLATION_POPOVER_MAX_TAPS, Math.max(1, Math.round(value)))
      : TRANSLATION_POPOVER_DEFAULT_TAPS;
    this.translationPopoverTapCount = normalized;
    this.resetTranslationTapProgress();
  }

  private resetTranslationTapProgress(): void {
    this.translationTapSentenceId = "";
    this.translationTapProgress = 0;
    this.translationLastTapAt = 0;
  }

  private translationTapThresholdReached(sentence: HTMLElement): boolean {
    const sentenceId = sentence.dataset.sentenceId ?? "";
    if (!sentenceId) return false;
    const now = Date.now();
    const continuesSequence =
      this.translationTapSentenceId === sentenceId
      && now - this.translationLastTapAt <= TRANSLATION_POPOVER_TAP_GAP_MS;
    this.translationTapSentenceId = sentenceId;
    this.translationTapProgress = continuesSequence ? this.translationTapProgress + 1 : 1;
    this.translationLastTapAt = now;
    if (this.translationTapProgress < this.translationPopoverTapCount) return false;
    this.resetTranslationTapProgress();
    return true;
  }

  private closeTranslationPopover(): void {
    this.translationPopover?.remove();
    this.translationPopover = undefined;
    this.resetTranslationTapProgress();
    for (const sentence of Array.from(
      this.root.querySelectorAll<HTMLElement>(".ocr2md-translation-sentence.is-open"),
    )) sentence.classList.remove("is-open");
  }

  private toggleTranslationPopover(sentence: HTMLElement): void {
    const sentenceId = sentence.dataset.sentenceId ?? "";
    const translation = this.translationBySentenceId.get(sentenceId);
    if (!sentenceId || !translation) return;
    const alreadyOpen = sentence.classList.contains("is-open");
    this.closeTranslationPopover();
    if (alreadyOpen) return;

    const popover = document.createElement("div");
    popover.className = "ocr2md-translation-popover";
    popover.dataset.sentenceId = sentenceId;
    popover.setAttribute("role", "dialog");
    popover.setAttribute("aria-label", translation.title);
    const title = document.createElement("div");
    title.className = "ocr2md-translation-popover__title";
    title.textContent = translation.title;
    const body = document.createElement("div");
    body.className = "ocr2md-translation-popover__body";
    body.textContent = translation.text?.trim() || "待翻译";
    popover.append(title, body);
    document.body.append(popover);

    const anchor = sentence.getBoundingClientRect();
    const margin = 12;
    const maxLeft = Math.max(margin, window.innerWidth - popover.offsetWidth - margin);
    const left = Math.min(Math.max(anchor.left, margin), maxLeft);
    let top = anchor.bottom + 7;
    if (top + popover.offsetHeight > window.innerHeight - margin) {
      top = Math.max(margin, anchor.top - popover.offsetHeight - 7);
    }
    popover.style.left = `${Math.round(left)}px`;
    popover.style.top = `${Math.round(top)}px`;
    sentence.classList.add("is-open");
    this.translationPopover = popover;
  }

  private isReadingMode(): boolean {
    return this.lastMode === "translation-document" || this.lastMode === "translated-document";
  }

  private clearReadingLineButtons(): void {
    cancelAnimationFrame(this.readingLineLayoutFrame);
    this.readingLineLayoutFrame = 0;
    this.readingLineTargets.clear();
    this.readingAnchorSourceLineValue = undefined;
    this.readingProgrammaticScrollActive = false;
    this.root.classList.remove("ocr2md-reading-preview");
    delete this.root.dataset.readingSourceLine;
    for (const button of Array.from(
      this.root.querySelectorAll<HTMLElement>(".ocr2md-reading-line-button"),
    )) button.remove();
  }

  private readingTextTarget(sourceText: string): HTMLElement | undefined {
    const body = sourceText.slice(translationSentenceContentStart(sourceText));
    FOOTNOTE_REFERENCE.lastIndex = 0;
    const expected = decodedRenderedText(
      body.replace(FOOTNOTE_REFERENCE, "").replace(/[*_`~]/g, "").trim(),
    );
    if (!expected) return undefined;

    const walker = document.createTreeWalker(this.root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const parent = node.parentElement;
      if (!parent) continue;
      if (parent.closest(
        ".ocr2md-reading-line-button, .ocr2md-footnote-popover, .ocr2md-translation-popover, script, style, textarea",
      )) continue;
      if (node.data.includes(expected)) return parent;
    }
    return undefined;
  }

  private installReadingLineButtons(
    pairs: readonly { id: string; line: number; sourceText: string }[],
  ): void {
    this.clearReadingLineButtons();
    this.root.classList.add("ocr2md-reading-preview");

    const uniqueLines = [...new Set(
      pairs.map((pair) => pair.line).filter((line) => Number.isFinite(line) && line > 0),
    )].sort((left, right) => left - right);

    for (const line of uniqueLines) {
      const linePairs = pairs.filter((pair) => pair.line === line);
      let target: HTMLElement | undefined;
      for (const pair of linePairs) {
        target = Array.from(
          this.root.querySelectorAll<HTMLElement>(".ocr2md-translation-sentence"),
        ).find((node) => node.dataset.sentenceId === pair.id);
        if (target) break;
      }
      target ??= Array.from(
        this.root.querySelectorAll<HTMLElement>("[data-source-line]"),
      ).find((node) => Number(node.dataset.sourceLine) === line);
      if (!target) {
        for (const pair of linePairs) {
          target = this.readingTextTarget(pair.sourceText);
          if (target) break;
        }
      }
      if (!target) continue;

      target.dataset.readingSourceLine = String(line);
      this.readingLineTargets.set(line, target);

      const button = document.createElement("button");
      button.type = "button";
      button.className = "ocr2md-reading-line-button";
      button.dataset.readingSourceLine = String(line);
      button.title = `定位到源码第 ${line} 行`;
      button.setAttribute("aria-label", `源码第 ${line} 行`);
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.scrollReadingToSourceLine(line);
      });
      this.root.append(button);
    }

    const firstLine = this.readingTopSourceLine() ?? uniqueLines[0];
    if (firstLine) {
      this.readingAnchorSourceLineValue = firstLine;
      this.root.dataset.readingSourceLine = String(firstLine);
    }
    this.queueReadingLineLayout();
  }

  private queueReadingLineLayout(): void {
    cancelAnimationFrame(this.readingLineLayoutFrame);
    this.readingLineLayoutFrame = requestAnimationFrame(() => {
      this.readingLineLayoutFrame = 0;
      const rootRect = this.root.getBoundingClientRect();
      for (const button of Array.from(
        this.root.querySelectorAll<HTMLButtonElement>(".ocr2md-reading-line-button"),
      )) {
        const line = Number(button.dataset.readingSourceLine);
        const target = this.readingLineTargets.get(line);
        if (!target) continue;
        const targetRect = target.getBoundingClientRect();
        const top = targetRect.top - rootRect.top + this.root.scrollTop;
        button.style.top = `${Math.max(4, Math.round(top))}px`;
      }
    });
  }

  readingTopSourceLine(): number | undefined {
    if (!this.readingLineTargets.size) return undefined;
    const previewTop = this.root.getBoundingClientRect().top + 20;
    const ordered = [...this.readingLineTargets.entries()]
      .sort((left, right) => left[0] - right[0]);
    let candidate = ordered[0]?.[0];
    for (const [line, target] of ordered) {
      if (target.getBoundingClientRect().top > previewTop) break;
      candidate = line;
    }
    return candidate;
  }

  readingAnchorSourceLine(): number | undefined {
    return this.readingAnchorSourceLineValue ?? this.readingTopSourceLine();
  }

  scrollReadingToSourceLine(line: number): boolean {
    if (!this.readingLineTargets.size || !Number.isFinite(line)) return false;
    const ordered = [...this.readingLineTargets.entries()]
      .sort((left, right) => left[0] - right[0]);
    let match = ordered[0];
    for (const entry of ordered) {
      if (entry[0] > line) break;
      match = entry;
    }
    if (!match) return false;
    const [matchedLine, target] = match;
    const rootRect = this.root.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    this.readingAnchorSourceLineValue = matchedLine;
    this.readingProgrammaticScrollActive = true;
    this.root.scrollTop += targetRect.top - rootRect.top - 16;
    this.root.dataset.readingSourceLine = String(matchedLine);
    return true;
  }

  private renderCallout(
    blockquote: HTMLElement,
    callout: ObsidianCalloutPreview,
    normalizedMarkdown: string,
    chapterId: string | undefined,
  ): void {
    if (callout.title.trim().toLowerCase() !== "html") return;

    const parsedEndSourceLine = Number(blockquote.dataset.sourceEndLine || callout.endSourceLine);
    const trailing = calloutTrailingSource(
      normalizedMarkdown,
      callout,
      parsedEndSourceLine,
    );

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

    // markdown-it permits lazy blockquote continuation. For a nested callout,
    // this can make lower-depth lines that belong to the parent embed appear
    // inside the callout token. Re-render only that swallowed tail as siblings
    // after the callout, preserving the original source-line map.
    if (trailing) {
      const holder = document.createElement("div");
      holder.innerHTML = DOMPurify.sanitize(
        renderMarkdownFragment(
          trailing.markdown,
          { chapterId },
          trailing.sourceLineOffset,
        ),
        {
          ALLOW_DATA_ATTR: true,
          USE_PROFILES: { html: true, mathMl: true },
        },
      );
      const fragment = document.createDocumentFragment();
      while (holder.firstChild) fragment.append(holder.firstChild);
      blockquote.after(fragment);
    }
  }

  render(
    text: string,
    chapterId?: string,
    footnoteText: string = text,
    mediaRoutes?: AdoptedMediaRoutes,
  ): void {
    if (this.isReadingMode()) this.clearReadingLineButtons();
    const routeSignature = mediaRouteSignature(mediaRoutes);
    if (
      this.lastMode === "markdown"
      && text === this.lastText
      && chapterId === this.lastChapterId
      && routeSignature === this.lastMediaRouteSignature
    ) return;
    this.lastMode = "markdown";
    this.lastText = text;
    this.lastChapterId = chapterId;
    this.lastMediaRouteSignature = routeSignature;
    this.cancelFootnotePress();
    this.footnotePinnedNumber = undefined;
    this.footnoteLongPressTriggered = false;
    this.closeTranslationPopover();
    this.translationBySentenceId.clear();
    this.footnoteBodies = footnoteBodies(footnoteText);

    if (!text) {
      this.root.innerHTML =
        '<div class="preview-empty">打开章节后显示 Markdown 预览</div>';
      return;
    }

    const env: PreviewEnvironment = { chapterId, mediaRoutes };
    const normalized = normalizeObsidianEmbedBlocksForPreview(
      maskLeadingYamlFrontmatter(
        rewriteObsidianImageEmbeds(text, chapterId, mediaRoutes),
      ),
    );
    const callouts = scanObsidianCalloutsForPreview(normalized.markdown);
    const tokens = md.parse(normalized.markdown, env);

    for (const token of tokens) {
      if (token.type === "blockquote_open" && token.map?.length) {
        token.attrSet("data-source-end-line", String(token.map[1]));
        if (normalized.embedStartLines.has(token.map[0])) {
          token.attrJoin("class", "ocr2md-embed-block");
        }
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
      if (callout) {
        this.renderCallout(
          blockquote,
          callout,
          normalized.markdown,
          chapterId,
        );
      }
    }
    decorateFootnoteReferences(this.root, this.footnoteBodies);
  }

  private renderReadingDocument(
    mode: "translation-document" | "translated-document",
    signature: string,
    displayMarkdown: string,
    annotatedMarkdown: string,
    chapterId: string | undefined,
    readingLines: readonly { id: string; line: number; sourceText: string }[],
    decorateDomOnly: () => void,
    popovers: ReadonlyMap<string, { text?: string; title: string }>,
  ): void {
    if (this.lastMode === mode && this.lastText === signature) return;
    const preservedSourceLine = this.isReadingMode()
      ? this.readingAnchorSourceLine()
      : undefined;

    // Reading in either direction uses exactly the same Markdown/Obsidian
    // renderer. Interactive sentence spans belong only to the rendered input;
    // footnote semantics always come from the clean display document.
    this.render(annotatedMarkdown, chapterId, displayMarkdown);
    decorateDomOnly();
    this.installReadingLineButtons(readingLines);
    if (preservedSourceLine) {
      this.scrollReadingToSourceLine(preservedSourceLine);
    }
    this.translationBySentenceId = new Map(popovers);
    this.closeTranslationPopover();
    this.lastMode = mode;
    this.lastText = signature;
    this.lastChapterId = chapterId;
  }

  renderTranslationDocument(
    text: string,
    chapterId: string | undefined,
    pairs: readonly {
      id: string;
      sourceText: string;
      translatedText?: string;
      providerLabel: string;
      range: { line: number; start: number; end: number };
      domOnly?: boolean;
    }[],
  ): void {
    const signature = JSON.stringify([
      text,
      chapterId ?? "",
      pairs.map((pair) => [pair.id, pair.translatedText ?? "", pair.providerLabel, pair.range.line, pair.range.start, pair.range.end, Boolean(pair.domOnly)]),
    ]);
    const annotated = annotateTranslationSentences(text, pairs);
    this.renderReadingDocument(
      "translation-document",
      signature,
      text,
      annotated,
      chapterId,
      pairs.map((pair) => ({
        id: pair.id,
        line: pair.range.line + 1,
        sourceText: pair.sourceText,
      })),
      () => decorateRenderedTranslationSentences(
        this.root,
        pairs.filter((pair) => pair.domOnly),
      ),
      new Map(pairs.map((pair) => [
        pair.id,
        { text: pair.translatedText, title: `${pair.providerLabel} 译文` },
      ])),
    );
  }

  renderTranslatedDocument(
    text: string,
    chapterId: string | undefined,
    pairs: readonly {
      id: string;
      sourceText: string;
      translatedText?: string;
      range: { line: number; start: number; end: number; endLine?: number };
      domOnly?: boolean;
    }[],
  ): void {
    const signature = JSON.stringify([
      text,
      chapterId ?? "",
      pairs.map((pair) => [pair.id, pair.translatedText ?? "", pair.range.line, pair.range.start, pair.range.end, pair.range.endLine ?? null, Boolean(pair.domOnly)]),
    ]);
    const displayMarkdown = translatedDocumentMarkdown(text, pairs, false);
    const annotatedMarkdown = translatedDocumentMarkdown(text, pairs, true);
    this.renderReadingDocument(
      "translated-document",
      signature,
      displayMarkdown,
      annotatedMarkdown,
      chapterId,
      pairs.map((pair) => ({
        id: pair.id,
        line: pair.range.line + 1,
        sourceText: pair.sourceText,
      })),
      () => decorateRenderedTranslatedSentences(
        this.root,
        pairs.filter((pair) => pair.domOnly),
      ),
      new Map(pairs.map((pair) => [
        pair.id,
        { text: pair.sourceText, title: "原文" },
      ])),
    );
  }

  renderMedia(chapterId: string, relativePath: string, label: string): void {
    this.renderMediaSource(
      chapterImageUrl(chapterId, relativePath) ?? "",
      label,
    );
  }

  renderMediaSource(source: string, label: string): void {
    this.cancelFootnotePress();
    this.footnotePinnedNumber = undefined;
    this.footnoteLongPressTriggered = false;
    this.closeTranslationPopover();
    this.translationBySentenceId.clear();
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
