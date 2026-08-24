import { resolvedAnnotationNumber } from "./annotation";
import { activeCandidates } from "./candidateLifecycle";
import type { Candidate } from "./types";

export interface EmbedExportGroup {
  number: number;
  start: number;
  end: number;
  rows: Candidate[];
}

export function exportByCalibration(text: string, rows: Candidate[]): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const live = activeCandidates(rows);
  const embeds = groupEmbeds(live);
  const embedAt = new Map<number, EmbedExportGroup>();
  for (const group of embeds) embedAt.set(group.start, group);
  const bodyLines = new Set<number>();
  for (const row of live.filter((item) => item.typeLabel === "注释" && item.lineType === "注释正文")) {
    const end = row.range.endLine ?? row.range.line;
    for (let line = row.range.line; line <= end; line += 1) bodyLines.add(line);
  }
  const headingStarts = new Map<number, Candidate>();
  for (const row of live.filter((item) => item.typeLabel === "章节标题" && /^[1-6] 级标题$/.test(item.lineType ?? ""))) {
    headingStarts.set(row.range.line, row);
  }
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
      index = embed.end + 1;
      continue;
    }
    if (bodyLines.has(index)) {
      flushPlainText();
      index += 1;
      continue;
    }
    if (coveredByEmbed(embeds, index)) {
      flushPlainText();
      index += 1;
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
      blocks.push(formatHeading(line, heading.lineType ?? ""));
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

function leadingFrontmatterEnd(lines: string[]): number {
  if (lines[0]?.replace(/^\uFEFF/, "").trim() !== "---") return 0;
  for (let index = 1; index < lines.length; index += 1) {
    if (/^---[ \t]*$/.test(lines[index])) return index + 1;
  }
  return 0;
}

export function groupEmbeds(rows: Candidate[]): EmbedExportGroup[] {
  const groups = new Map<number, Candidate[]>();
  for (const row of rows.filter((item) => item.typeLabel === "嵌入块" && item.embedNumber)) {
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
  const title = embedTitle(group.rows);
  const images = group.rows.filter((row) => row.lineType === "嵌入链接").map(obsidianImage);
  const texts = group.rows
    .filter((row) => row.lineType === "嵌入文本")
    .map((row) => row.raw.trim())
    .filter(Boolean);
  const table = group.rows.find((row) => row.lineType === "HTML表");
  const html = group.rows.find((row) => row.lineType === "嵌入HTML");
  const tableSrc = table ? compactHtml(table.raw) : undefined;
  const extraHtml = !table && html ? compactHtml(html.raw) : undefined;
  const lines = [">"];
  if (title) lines.push(title);
  if (images.length && !tableSrc && !extraHtml) {
    for (const image of images) lines.push(`内嵌图片链接: ${image}`);
  } else {
    for (const image of images) lines.push(image);
  }
  if (tableSrc && images.length) {
    lines.push(">>[! ]- HTML");
    lines.push(`>>${tableSrc}`);
  } else if (tableSrc) {
    lines.push(`>${tableSrc}`);
  } else if (extraHtml) {
    lines.push(`>${extraHtml}`);
  }
  for (const text of texts) {
    lines.push(">");
    lines.push(text);
  }
  lines.push(`><embed id=${id}></embed>`);
  lines.push("<br>");
  return lines.join("\n");
}

function coveredByEmbed(embeds: EmbedExportGroup[], line: number): boolean {
  return embeds.some((group) => line >= group.start && line <= group.end);
}

function embedTitle(rows: Candidate[]): string | undefined {
  const title = rows.find((row) => row.lineType === "内嵌标题");
  if (!title) return undefined;
  const text = title.raw.split("\n")[0]?.replace(/^\s*>\s*/, "").trim();
  return text || undefined;
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

function formatHeading(line: string, lineType: string): string {
  const match = /^([1-6]) 级标题$/.exec(lineType);
  if (!match) return line;
  const level = Number(match[1]);
  const content = line.replace(/^ {0,3}#{1,6}(?:\s+|$)/, "").trim();
  const heading = content ? `${"#".repeat(level)} ${content}` : "#".repeat(level);
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
