import { shortSha256 } from "./platformHash";
import type { Candidate } from "./types";

export interface IllegalLineBreakCandidate extends Candidate {
  previousLineText: string;
  nextLineText: string;
  mergedPreview: string;
  breakReason: string;
  breakConfidence: "高" | "中";
}

/**
 * Finds suspicious physical/paragraph line breaks in chapter Markdown.
 *
 * OCR chapter files in this project commonly store one paragraph per physical
 * line with one or more blank lines between paragraphs. Therefore this scan
 * checks both:
 *   1. adjacent non-empty prose lines; and
 *   2. prose lines separated only by blank lines.
 *
 * Markdown/figure/table/code/math/source-note structures are excluded. The
 * candidates are derived from source text; the user decision (合并/忽略) may be persisted separately.
 */

export function manualIllegalLineBreakAtLine(
  markdown: string,
  sourcePath: string,
  cursorLine: number,
): IllegalLineBreakCandidate | undefined {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  if (!lines.length || cursorLine < 0 || cursorLine >= lines.length) return undefined;

  let previousIndex: number;
  let nextIndex: number;
  if ((lines[cursorLine] ?? "").trim()) {
    previousIndex = cursorLine;
    nextIndex = cursorLine + 1;
    while (nextIndex < lines.length && !(lines[nextIndex] ?? "").trim()) nextIndex += 1;
  } else {
    previousIndex = cursorLine - 1;
    while (previousIndex >= 0 && !(lines[previousIndex] ?? "").trim()) previousIndex -= 1;
    nextIndex = cursorLine + 1;
    while (nextIndex < lines.length && !(lines[nextIndex] ?? "").trim()) nextIndex += 1;
  }
  if (previousIndex < 0 || nextIndex >= lines.length || previousIndex >= nextIndex) return undefined;

  return illegalLineBreakCandidate(
    lines,
    previousIndex,
    nextIndex,
    sourcePath,
    { reason: "人工加入", confidence: "高" },
  );
}

export function scanIllegalLineBreaks(markdown: string, sourcePath: string): IllegalLineBreakCandidate[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const rows: IllegalLineBreakCandidate[] = [];
  const skipped = structuralLineMask(lines);

  for (let index = 0; index + 1 < lines.length; index += 1) {
    const previous = lines[index] ?? "";
    if (!previous.trim() || skipped[index]) continue;

    let nextIndex = index + 1;
    let blankLines = 0;
    while (nextIndex < lines.length && !lines[nextIndex]?.trim()) {
      blankLines += 1;
      nextIndex += 1;
    }
    if (nextIndex >= lines.length) continue;

    const next = lines[nextIndex] ?? "";
    if (!next.trim() || skipped[nextIndex]) continue;
    if (isIntentionalHardBreak(previous)) continue;

    // Large vertical gaps are usually deliberate layout boundaries. Only keep
    // very strong evidence across them (lowercase continuation / split word).
    const judgement = classifySuspicion(previous, next, blankLines);
    if (!judgement) continue;
    if (blankLines > 2) {
      const strongContinuation = /^[a-zà-öø-ÿ]/u.test(next.trimStart())
        || (/[-‐‑‒–—]$/.test(previous.trimEnd()) && /^[\p{L}\p{N}]/u.test(next.trimStart()));
      if (!strongContinuation) continue;
    }

    rows.push(illegalLineBreakCandidate(lines, index, nextIndex, sourcePath, judgement));
  }
  return rows;
}


function illegalLineBreakCandidate(
  lines: string[],
  previousIndex: number,
  nextIndex: number,
  sourcePath: string,
  judgement: { reason: string; confidence: "高" | "中" },
): IllegalLineBreakCandidate {
  const previous = lines[previousIndex] ?? "";
  const next = lines[nextIndex] ?? "";
  const mergedPreview = mergeProseLines(previous, next);
  const raw = lines.slice(previousIndex, nextIndex + 1).join("\n");
  const hash = shortSha256(`${previousIndex}\0${nextIndex}\0${previous}\0${next}`, 16);
  const id = `illegal-line-break-${previousIndex}-${nextIndex}-${hash}`;
  return {
    id,
    rowId: id,
    kind: "regex",
    label: mergedPreview,
    raw,
    preview: mergedPreview,
    range: {
      line: previousIndex,
      start: 0,
      endLine: nextIndex,
      end: next.length,
    },
    typeLabel: "非法断行",
    lineType: "合并",
    sourcePath,
    sourceLabel: sourcePath.split(/[\\/]/).pop() ?? sourcePath,
    status: "候选",
    previousLineText: previous,
    nextLineText: next,
    mergedPreview,
    breakReason: judgement.reason,
    breakConfidence: judgement.confidence,
  };
}

function classifySuspicion(
  previous: string,
  next: string,
  blankLines: number,
): { reason: string; confidence: "高" | "中" } | undefined {
  const left = previous.trimEnd();
  const right = next.trimStart();
  if (!left || !right) return undefined;

  const boundary = blankLines > 0 ? "空行后的下一段" : "下一行";
  if (/[-‐‑‒–—]$/.test(left) && /^[\p{L}\p{N}]/u.test(right)) {
    return { reason: `${boundary}直接续接行尾连字符，疑似 OCR 拆词`, confidence: "高" };
  }
  if (/^[a-zà-öø-ÿ]/u.test(right)) {
    return { reason: `${boundary}以小写字母开始，疑似同一段被错误断开`, confidence: "高" };
  }
  if (!endsAsNaturalParagraph(left)) {
    return {
      reason: blankLines > 0
        ? "空行前正文没有自然结束，疑似被错误拆成两个段落"
        : "上一行没有句末标点，下一行仍是正文",
      confidence: "高",
    };
  }
  if (blankLines === 0) {
    return { reason: "同一正文段内出现连续物理换行", confidence: "中" };
  }
  return undefined;
}

function endsAsNaturalParagraph(value: string): boolean {
  let text = value.trimEnd();
  // References often trail the actual sentence-ending punctuation, e.g.
  // "computers.[*1]" or "claim.[^3]". Strip those before judging punctuation.
  for (;;) {
    const stripped = text.replace(/(?:\[(?:\^|\*)[^\]\r\n]+\]|<sup\b[^>]*>[\s\S]*?<\/sup>)[ \t]*$/i, "").trimEnd();
    if (stripped === text) break;
    text = stripped;
  }
  return /[.!?。！？:：;；…][\]）)】}"'’”]*$/.test(text);
}

function mergeProseLines(previous: string, next: string): string {
  const left = previous.trimEnd();
  const right = next.trimStart();
  if (/\p{L}[-‐‑]$/u.test(left) && /^\p{L}/u.test(right)) {
    return `${left.slice(0, -1)}${right}`;
  }
  return `${left} ${right}`;
}

function isIntentionalHardBreak(line: string): boolean {
  return / {2,}$/.test(line) || /\\\s*$/.test(line);
}

function structuralLineMask(lines: string[]): boolean[] {
  const mask = new Array<boolean>(lines.length).fill(false);
  let inFrontmatter = false;
  let inFence: string | undefined;
  let inDollarMath = false;
  let htmlBlockDepth = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();

    if (index === 0 && trimmed.replace(/^\uFEFF/, "") === "---") {
      inFrontmatter = true;
      mask[index] = true;
      continue;
    }
    if (inFrontmatter) {
      mask[index] = true;
      if (trimmed === "---") inFrontmatter = false;
      continue;
    }

    const fence = /^\s*(```+|~~~+)/.exec(line)?.[1];
    if (fence) {
      mask[index] = true;
      const marker = fence[0];
      if (!inFence) inFence = marker;
      else if (marker === inFence) inFence = undefined;
      continue;
    }
    if (inFence) {
      mask[index] = true;
      continue;
    }

    if (/^\s*\$\$\s*$/.test(line)) {
      mask[index] = true;
      inDollarMath = !inDollarMath;
      continue;
    }
    if (inDollarMath) {
      mask[index] = true;
      continue;
    }

    if (/<\s*(?:table|div|figure|section|details|pre|script|style)\b/i.test(line)) htmlBlockDepth += 1;
    if (htmlBlockDepth > 0) mask[index] = true;
    if (/<\/\s*(?:table|div|figure|section|details|pre|script|style)\s*>/i.test(line)) {
      htmlBlockDepth = Math.max(0, htmlBlockDepth - 1);
      continue;
    }

    if (isStructuralLine(line)) mask[index] = true;
  }
  return mask;
}

function isStructuralLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (/^(?:source|sources|note|notes)\s*:/i.test(trimmed)) return true;
  if (/^(?:figure|fig\.|table|exhibit)\s*\d/i.test(trimmed)) return true;
  if (/^\*\d+\s+/.test(trimmed)) return true;
  return /^(?:<br\s*\/?>|#{1,6}(?:\s+|$)|>|(?:[-+*]|\d+[.)]|[a-z][.)]|\([a-z]\))\s+|\[\^[^\]]+\]:|!\[\[|!\[[^\]]*\]\(|<embed\b|<[^>]+>|\||[-*_]{3,})/i.test(trimmed)
    || /^\s{2,}\S/.test(line);
}
