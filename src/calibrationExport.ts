import { resolvedAnnotationNumber } from "./annotation";
import { activeCandidates, isIgnoredEmbedCandidate } from "./candidateLifecycle";
import type { Candidate } from "./types";

export interface CalibrationExportOptions {
  numberHeadings?: boolean;
}

export interface EmbedExportGroup {
  number: number;
  start: number;
  end: number;
  rows: Candidate[];
}

export function exportByCalibration(text: string, rows: Candidate[], options: CalibrationExportOptions = {}): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const numberHeadings = options.numberHeadings !== false;
  const live = activeCandidates(rows);
  const illegalMergeSpans = buildIllegalMergeSpans(live);
  const illegalMergeAt = new Map(illegalMergeSpans.map((span) => [span.start, span]));
  const embeds = groupEmbeds(live.filter((row) => !isIgnoredEmbedCandidate(row)));
  const embedAt = new Map<number, EmbedExportGroup>();
  const embedCoveredLines = new Set<number>();
  for (const group of embeds) {
    embedAt.set(group.start, group);
    for (const row of group.rows) {
      const end = row.range.endLine ?? row.range.line;
      for (let line = row.range.line; line <= end; line += 1) embedCoveredLines.add(line);
    }
  }
  const bodyLines = new Set<number>();
  for (const row of live.filter((item) => item.typeLabel === "注释" && item.lineType === "注释正文")) {
    const end = row.range.endLine ?? row.range.line;
    for (let line = row.range.line; line <= end; line += 1) bodyLines.add(line);
  }
  const headingStarts = new Map<number, { row: Candidate; ordinal: number }>();
  const headings = live
    .filter((item) => item.typeLabel === "章节标题" && /^[1-6] 级标题$/.test(item.lineType ?? ""))
    .sort((left, right) => left.range.line - right.range.line || left.range.start - right.range.start);
  headings.forEach((row, index) => headingStarts.set(row.range.line, { row, ordinal: index + 1 }));
  const refsByLine = new Map<number, Candidate[]>();
  for (const row of live.filter((item) => item.typeLabel === "注释" && item.lineType === "注释引用")) {
    const list = refsByLine.get(row.range.line) ?? [];
    list.push(row);
    refsByLine.set(row.range.line, list);
  }

  const blocks: string[] = [];
  const plainLines: string[] = [];
  const flushPlainText = () => {
    while (plainLines.length && !plainLines[plainLines.length - 1].trim()) plainLines.pop();
    if (!plainLines.length) return;
    blocks.push(`${plainLines.join("\n")}\n<br>`);
    plainLines.length = 0;
  };

  let index = 0;
  const frontmatterEnd = leadingFrontmatterEnd(lines);
  if (frontmatterEnd > 0) {
    blocks.push(lines.slice(0, frontmatterEnd).join("\n"));
    index = frontmatterEnd;
  }

  while (index < lines.length) {
    const embed = embedAt.get(index);
    if (embed) {
      flushPlainText();
      blocks.push(formatEmbed(embed));
      index += 1;
      continue;
    }
    if (bodyLines.has(index)) {
      flushPlainText();
      index += 1;
      continue;
    }
    if (embedCoveredLines.has(index)) {
      flushPlainText();
      index += 1;
      continue;
    }
    const illegalMerge = illegalMergeAt.get(index);
    if (illegalMerge) {
      const mergedParts: string[] = [];
      for (let lineIndex = illegalMerge.start; lineIndex <= illegalMerge.end; lineIndex += 1) {
        if (!lines[lineIndex]?.trim()) continue;
        mergedParts.push(replaceAnnotationRefs(lines[lineIndex], refsByLine.get(lineIndex) ?? []));
      }
      if (mergedParts.length) plainLines.push(mergeExportProseParts(mergedParts));
      index = illegalMerge.end + 1;
      continue;
    }
    if (!lines[index].trim()) {
      flushPlainText();
      index += 1;
      continue;
    }
    const heading = headingStarts.get(index);
    let line = replaceAnnotationRefs(lines[index], refsByLine.get(index) ?? []);
    if (heading) {
      flushPlainText();
      blocks.push(formatHeading(line, heading.row.lineType ?? "", heading.ordinal, numberHeadings));
    } else {
      plainLines.push(line);
    }
    index += 1;
  }
  flushPlainText();

  const footnotes = collectFootnotes(live);
  if (footnotes.length) blocks.push(footnotes.join("\n\n"));
  return blocks.join("\n\n").replace(/[ \t]+\n/g, "\n").replace(/\s+$/, "") + "\n";
}


export interface IllegalMergeSpan {
  start: number;
  end: number;
}

/** Build connected source-line spans from calibrated illegal-line-break merge decisions. */
export function buildIllegalMergeSpans(rows: Candidate[]): IllegalMergeSpan[] {
  const ranges = rows
    .filter((row) => row.typeLabel === "非法断行" && row.lineType === "合并")
    .map((row) => ({ start: row.range.line, end: row.range.endLine ?? row.range.line }))
    .filter((span) => span.end > span.start)
    .sort((left, right) => left.start - right.start || left.end - right.end);
  const merged: IllegalMergeSpan[] = [];
  for (const span of ranges) {
    const previous = merged[merged.length - 1];
    if (previous && span.start <= previous.end) {
      previous.end = Math.max(previous.end, span.end);
    } else {
      merged.push({ ...span });
    }
  }
  return merged;
}

function mergeExportProseParts(parts: string[]): string {
  return parts.reduce((left, right) => {
    const a = left.trimEnd();
    const b = right.trimStart();
    if (/\p{L}[-‐‑]$/u.test(a) && /^\p{L}/u.test(b)) return `${a.slice(0, -1)}${b}`;
    return `${a} ${b}`;
  });
}

function leadingFrontmatterEnd(lines: string[]): number {
  if (lines[0]?.replace(/^\uFEFF/, "").trim() !== "---") return 0;
  for (let index = 1; index < lines.length; index += 1) {
    if (/^---[ \t]*$/.test(lines[index])) return index + 1;
  }
  return 0;
}

export function groupEmbeds(rows: Candidate[]): EmbedExportGroup[] {
  const groups = new Map<number, Candidate[]>();
  for (const row of rows.filter((item) => item.typeLabel === "嵌入块" && item.lineType !== "已忽略" && item.embedNumber)) {
    const number = row.embedNumber!;
    groups.set(number, [...(groups.get(number) ?? []), row]);
  }
  return [...groups.entries()].map(([number, items]) => {
    const start = Math.min(...items.map((row) => row.range.line));
    const end = Math.max(...items.map((row) => row.range.endLine ?? row.range.line));
    return {
      number,
      start,
      end,
      rows: [...items].sort((left, right) => left.range.line - right.range.line || left.range.start - right.range.start),
    };
  }).sort((left, right) => left.start - right.start);
}

export function formatEmbed(group: EmbedExportGroup): string {
  const id = String(group.number).padStart(2, "0");
  const orderedRows = [...group.rows]
    .sort((left, right) => left.range.line - right.range.line || left.range.start - right.range.start);
  const hasImage = orderedRows.some((row) => row.lineType === "嵌入链接");
  const hasHtml = orderedRows.some((row) => row.lineType === "HTML表" || row.lineType === "嵌入HTML");
  const lines: string[] = [];
  let started = false;
  let htmlCalloutStarted = false;

  for (const row of orderedRows) {
    if (row.lineType === "嵌入块首") {
      if (!started) lines.push(">");
      started = true;
      continue;
    }
    if (!started) {
      lines.push(">");
      started = true;
    }

    if (row.lineType === "内嵌标题") {
      const title = row.raw.split("\n")[0]?.replace(/^\s*>\s*/, "").trim();
      if (title) lines.push(title);
      continue;
    }
    if (row.lineType === "嵌入链接") {
      const image = obsidianImage(row);
      lines.push(hasHtml ? image : `内嵌图片链接: ${image}`);
      continue;
    }
    if (row.lineType === "HTML表" || row.lineType === "嵌入HTML") {
      const html = compactHtml(row.raw);
      if (hasImage) {
        if (!htmlCalloutStarted) {
          lines.push(">>[! ]- HTML");
          htmlCalloutStarted = true;
        }
        lines.push(`>>${html}`);
      } else {
        lines.push(`>${html}`);
      }
      continue;
    }
    if (row.lineType === "嵌入文本") {
      const text = row.raw.trim();
      if (text) {
        lines.push(">");
        lines.push(text);
      }
    }
  }

  if (!started) lines.push(">");
  lines.push(`><embed id=${id}></embed>`);
  lines.push("<br>");
  return lines.join("\n");
}


export function obsidianImage(row: Candidate): string {
  const local = row.localPath?.replace(/\\/g, "/").replace(/^\.\//, "");
  if (local) return `![[${local}]]`;
  const wiki = /!\[\[[^\]]+\]\]/.exec(row.raw);
  if (wiki) return wiki[0];
  const markdown = /!\[[^\]]*\]\([^)]+\)/.exec(row.raw);
  return markdown?.[0] ?? row.raw.trim();
}

function compactHtml(raw: string): string {
  const trimmed = raw.trim();
  const table = /<table[\s\S]*<\/table>/i.exec(trimmed);
  const html = table?.[0] ?? /<([a-zA-Z][\w:-]*)[\s\S]*<\/\1>/i.exec(trimmed)?.[0] ?? trimmed;
  return html.replace(/\s*\n\s*/g, "");
}

function formatHeading(line: string, lineType: string, ordinal: number, includeOrdinal: boolean): string {
  const match = /^([1-6]) 级标题$/.exec(lineType);
  if (!match) return line;
  const level = Number(match[1]);
  const content = line.replace(/^ {0,3}#{1,6}(?:\s+|$)/, "").trim();
  const prefix = includeOrdinal ? `(${String(ordinal).padStart(3, "0")}) ` : "";
  const heading = content ? `${"#".repeat(level)} ${prefix}${content}` : `${"#".repeat(level)}${prefix ? ` ${prefix.trimEnd()}` : ""}`;
  return `${heading}\n<br>`;
}

function replaceAnnotationRefs(line: string, refs: Candidate[]): string {
  let next = line;
  for (const ref of refs) {
    const number = resolvedAnnotationNumber(ref);
    if (!number) continue;
    const escaped = escapeRegex(number);
    const pattern = new RegExp(
      `<sup>\\s*\\(?\\s*${escaped}\\s*\\)?\\s*</sup>|\\[\\*${escaped}\\]|\\[\\^${escaped}\\](?!:)`,
      "gi",
    );
    next = next.replace(pattern, `[^${number}]`);
  }
  return next;
}

function collectFootnotes(rows: Candidate[]): string[] {
  const byNumber = new Map<string, string>();
  for (const row of rows.filter((item) => item.typeLabel === "注释" && item.lineType === "注释正文")) {
    const number = resolvedAnnotationNumber(row);
    if (!number || byNumber.has(number)) continue;
    const body = row.raw.replace(/^\s*(?:\[\^[^\]]+\]:|\d+\.|\*\d+)\s+/, "").trim();
    byNumber.set(number, `[^${number}]: ${body}\n<br>`);
  }
  return [...byNumber.entries()]
    .sort((left, right) => left[0].localeCompare(right[0], "zh-CN", { numeric: true }))
    .map((entry) => entry[1]);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
