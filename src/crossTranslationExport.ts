import * as path from "path";
import { containsProtectionPlaceholder } from "./markdownProtection";
import { findMultilineLatexRanges } from "./sentences";
import { scanTextBlocks } from "./textBlocks";
import { translationEntryForUnit, type TranslationStateFile } from "./translationState";
import { scanTranslationUnits } from "./translationUnits";
import type { Candidate } from "./types";

export interface CrossTranslationExportInput {
  sourceMarkdown: string;
  sourcePath: string;
  chapterFileName: string;
  outputVaultRelativePath: string;
  translationState: TranslationStateFile;
}

export interface CrossTranslationExportResult {
  orgFileName: string;
  transFileName: string;
  pureTransFileName: string;
  orgMarkdown: string;
  transMarkdown: string;
  pureTransMarkdown: string;
  anchors: string[];
  outputVaultRelativePath: string;
}

interface RenderContext {
  state: TranslationStateFile;
  orgTarget: string;
  transTarget: string;
}

export function exportCrossTranslation(input: CrossTranslationExportInput): CrossTranslationExportResult {
  const source = input.sourceMarkdown.replace(/\r\n?/g, "\n");
  const outputPath = normalizeVaultRelativePath(input.outputVaultRelativePath);
  const chapterFileName = normalizeChapterFileName(input.chapterFileName);
  const stem = chapterFileName.replace(/\.md$/i, "");
  const orgFileName = `org2trans ${stem}.md`;
  const transFileName = `trans2org ${stem}.md`;
  const pureTransFileName = `trans ${stem}.md`;
  const orgLinkName = `org2trans ${stem}`;
  const transLinkName = `trans2org ${stem}`;
  const orgTarget = vaultJoin(outputPath, orgLinkName);
  const transTarget = vaultJoin(outputPath, transLinkName);

  const units = scanTranslationUnits(source, input.sourcePath);
  const missing = units.filter((unit) => {
    const entry = translationEntryForUnit(unit, input.translationState);
    return entry?.status !== "translated" || !entry.translatedText;
  });
  if (missing.length) {
    const first = missing.slice(0, 5).map(unitLabel).join("、");
    throw new Error(`尚有 ${missing.length} 个翻译单元未完成，不能导出${first ? `：${first}` : ""}。`);
  }

  const context: RenderContext = {
    state: input.translationState,
    orgTarget,
    transTarget,
  };
  const blocks = scanTextBlocks(source, input.sourcePath);
  const unitsByBlock = groupUnitsByBlock(units);
  const lines = source.split("\n");
  const blockAtLine = new Map(blocks.map((block) => [block.range.line, block]));
  const orgLines: string[] = [];
  const transLines: string[] = [];
  const pureTransLines: string[] = [];
  const anchors: string[] = [];

  let line = 0;
  let compactNextBreak = false;
  while (line < lines.length) {
    const block = blockAtLine.get(line);
    if (!block) {
      if (compactNextBreak && !lines[line].trim()) {
        line += 1;
        continue;
      }
      if (/^\s*<br>\s*$/i.test(lines[line])) {
        if (compactNextBreak) {
          appendCompactBreak(orgLines);
          appendCompactBreak(transLines);
          appendCompactBreak(pureTransLines);
        } else {
          appendSeparatedBreak(orgLines);
          appendSeparatedBreak(transLines);
          appendSeparatedBreak(pureTransLines);
        }
        compactNextBreak = false;
        line += 1;
        while (line < lines.length && !lines[line].trim()) line += 1;
        continue;
      }
      compactNextBreak = false;
      orgLines.push(lines[line]);
      transLines.push(lines[line]);
      pureTransLines.push(lines[line]);
      line += 1;
      continue;
    }
    const blockUnits = unitsByBlock.get(block.id) ?? [];
    if (block.lineType === "内嵌") {
      const rendered = renderCompositeBlock(block, blockUnits, context);
      orgLines.push(...rendered.org.split("\n"));
      transLines.push(...rendered.trans.split("\n"));
      pureTransLines.push(...rendered.pure.split("\n"));
    } else {
      const rendered = renderOrdinaryBlock(block, blockUnits, context);
      orgLines.push(...rendered.org.split("\n"));
      transLines.push(...rendered.trans.split("\n"));
      pureTransLines.push(...rendered.pure.split("\n"));
      anchors.push(...rendered.anchors);
    }
    compactNextBreak = block.lineType === "注释正文";
    line = (block.range.endLine ?? block.range.line) + 1;
  }

  const result: CrossTranslationExportResult = {
    orgFileName,
    transFileName,
    pureTransFileName,
    orgMarkdown: ensureTrailingNewline(orgLines.join("\n")),
    transMarkdown: ensureTrailingNewline(transLines.join("\n")),
    pureTransMarkdown: ensureTrailingNewline(pureTransLines.join("\n")),
    anchors,
    outputVaultRelativePath: outputPath,
  };
  validateCrossTranslationExport(result, source, context, blocks, unitsByBlock);
  return result;
}

export function normalizeVaultRelativePath(value: string): string {
  const normalized = value.trim().replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
  if (!normalized || normalized === ".") return "";
  if (normalized.startsWith("/") || /^[a-zA-Z]:\//.test(normalized)) {
    throw new Error("输出目录必须是 Obsidian Vault 相对路径，不能使用绝对路径。");
  }
  const parts = normalized.split("/").filter(Boolean);
  if (parts.some((part) => part === ".." || part === ".")) {
    throw new Error("输出目录不能包含 . 或 .. 路径段。");
  }
  return parts.join("/");
}

function renderOrdinaryBlock(
  block: Candidate,
  blockUnits: Candidate[],
  context: RenderContext,
): { org: string; trans: string; pure: string; anchors: string[] } {
  const sentenceUnits = blockUnits
    .filter((unit) => unit.translationUnitKind !== "composite")
    .sort(compareUnits);
  if (!sentenceUnits.length) {
    return { org: block.raw, trans: block.raw, pure: block.raw, anchors: [] };
  }
  if (block.lineType === "注释正文") {
    return renderFootnoteBody(block, sentenceUnits, context);
  }
  const pure = renderPureOrdinaryBlock(block, sentenceUnits, context.state);
  if (isListParagraph(block.raw)) {
    return { ...renderListParagraph(sentenceUnits, context), pure };
  }

  const orgParts: string[] = [];
  const transParts: string[] = [];
  const anchors: string[] = [];
  let cursor = 0;
  for (const unit of sentenceUnits) {
    const index = block.raw.indexOf(unit.raw, cursor);
    if (index < 0) throw new Error(`无法在文本块中定位翻译单元：${unitLabel(unit)}`);
    appendGap(orgParts, block.raw.slice(cursor, index));
    appendGap(transParts, block.raw.slice(cursor, index));

    const entry = requireTranslation(unit, context.state);
    const anchor = sentenceAnchor(unit);
    anchors.push(anchor);
    const titleSpacing = block.lineType === "标题";
    orgParts.push(renderCrossLinkedSentence(
      normalizeInternalBlankLines(unit.raw),
      anchor,
      context.transTarget,
      titleSpacing,
    ));
    transParts.push(renderCrossLinkedSentence(
      normalizeInternalBlankLines(entry.translatedText!),
      anchor,
      context.orgTarget,
      titleSpacing,
    ));
    cursor = index + unit.raw.length;
  }
  appendGap(orgParts, block.raw.slice(cursor));
  appendGap(transParts, block.raw.slice(cursor));
  return {
    org: joinRenderedParts(orgParts),
    trans: joinRenderedParts(transParts),
    pure,
    anchors,
  };
}

function renderPureOrdinaryBlock(
  block: Candidate,
  sentenceUnits: Candidate[],
  state: TranslationStateFile,
): string {
  let output = "";
  let cursor = 0;
  for (const unit of sentenceUnits) {
    const index = block.raw.indexOf(unit.raw, cursor);
    if (index < 0) throw new Error(`无法在文本块中定位纯译文单元：${unitLabel(unit)}`);
    output += block.raw.slice(cursor, index);
    output += requireTranslation(unit, state).translatedText!;
    cursor = index + unit.raw.length;
  }
  output += block.raw.slice(cursor);
  return output;
}

function renderFootnoteBody(
  block: Candidate,
  sentenceUnits: Candidate[],
  context: RenderContext,
): { org: string; trans: string; pure: string; anchors: string[] } {
  const prefixMatch = /^([ \t]*\[\^[^\]\r\n]+\]:[ \t]*)/.exec(block.raw);
  if (!prefixMatch) throw new Error(`注释正文缺少脚注前缀：${block.id}`);
  const prefix = prefixMatch[1];

  const originalParts: string[] = [];
  const translatedParts: string[] = [];
  sentenceUnits.forEach((unit, index) => {
    const entry = requireTranslation(unit, context.state);
    let original = collapseFootnoteText(unit.raw);
    let translated = collapseFootnoteText(entry.translatedText!);
    if (index === 0) {
      original = stripFootnotePrefix(original);
      translated = stripFootnotePrefix(translated);
    }
    if (original) originalParts.push(original);
    if (translated) translatedParts.push(translated);
  });

  const trans = `${prefix}${translatedParts.join(" ")}`;
  return {
    org: `${prefix}${originalParts.join(" ")}`,
    trans,
    pure: trans,
    anchors: [],
  };
}

function collapseFootnoteText(value: string): string {
  return value.replace(/[ \t]*\n[ \t]*/g, " ").trim();
}

function stripFootnotePrefix(value: string): string {
  return value.replace(/^[ \t]*\[\^[^\]\r\n]+\]:[ \t]*/, "");
}

function renderListParagraph(
  sentenceUnits: Candidate[],
  context: RenderContext,
): { org: string; trans: string; anchors: string[] } {
  const orgLines: string[] = [];
  const transLines: string[] = [];
  const anchors: string[] = [];
  sentenceUnits.forEach((unit, index) => {
    const entry = requireTranslation(unit, context.state);
    const anchor = sentenceAnchor(unit);
    anchors.push(anchor);
    if (index > 0) {
      orgLines.push(">>");
      transLines.push(">>");
    }
    appendListSentence(
      orgLines,
      normalizeInternalBlankLines(unit.raw),
      anchor,
      context.transTarget,
      index === 0 ? ">" : ">>",
    );
    appendListSentence(
      transLines,
      normalizeInternalBlankLines(entry.translatedText!),
      anchor,
      context.orgTarget,
      index === 0 ? ">" : ">>",
    );
  });
  return { org: orgLines.join("\n"), trans: transLines.join("\n"), anchors };
}

function appendListSentence(
  lines: string[],
  text: string,
  anchor: string,
  target: string,
  calloutPrefix: ">" | ">>",
) {
  lines.push(
    text,
    `^${anchor}`,
    "",
    `${calloutPrefix}[! ds]-`,
    `![[${target}#^${anchor}]]`,
    "",
  );
}

function isListParagraph(raw: string): boolean {
  return /^[ \t]*(?:[-+*]|\d+[.)])[ \t]+/.test(raw);
}

function renderCompositeBlock(
  block: Candidate,
  blockUnits: Candidate[],
  context: RenderContext,
): { org: string; trans: string; pure: string } {
  const units = blockUnits
    .filter((unit) => unit.translationUnitKind === "composite")
    .sort(compareUnits);
  if (!units.length) return { org: block.raw, trans: block.raw, pure: block.raw };

  const sourceLines = block.raw.replace(/\r\n?/g, "\n").split("\n");
  const byRelativeStart = new Map<number, Candidate>();
  for (const unit of units) byRelativeStart.set(unit.range.line - block.range.line, unit);
  const orgLines: string[] = [];
  const transLines: string[] = [];
  const pureLines: string[] = [];

  let index = 0;
  while (index < sourceLines.length) {
    const unit = byRelativeStart.get(index);
    if (!unit) {
      appendCompositeStructuralLine(orgLines, sourceLines[index]);
      appendCompositeStructuralLine(transLines, sourceLines[index]);
      appendCompositeStructuralLine(pureLines, sourceLines[index]);
      index += 1;
      continue;
    }
    const entry = requireTranslation(unit, context.state);
    const original = normalizeInternalBlankLines(unit.raw);
    const translated = normalizeInternalBlankLines(entry.translatedText!);
    appendCompositeTranslatedContent(orgLines, original, translated);
    appendCompositeTranslatedContent(transLines, translated, original);
    pureLines.push(...translated.split("\n"));
    const relativeEnd = (unit.range.endLine ?? unit.range.line) - block.range.line;
    index = relativeEnd + 1;
  }

  const org = orgLines.join("\n");
  const trans = transLines.join("\n");
  const pure = pureLines.join("\n");
  assertCompositeHasNoCrossLinks(org);
  assertCompositeHasNoCrossLinks(trans);
  assertCompositeHasNoCrossLinks(pure);
  return { org, trans, pure };
}

function appendCompositeTranslatedContent(lines: string[], main: string, counterpart: string) {
  lines.push(...main.split("\n"));
  lines.push(">>[! ds]-");
  for (const line of counterpart.split("\n")) lines.push(`>>${line}`);
  if (lines[lines.length - 1] !== ">") lines.push(">");
}

function appendCompositeStructuralLine(lines: string[], line: string) {
  if (line.trim() === ">" && lines[lines.length - 1] === ">") return;
  lines.push(line);
}

function renderCrossLinkedSentence(
  text: string,
  anchor: string,
  target: string,
  blankBeforeCallout = false,
): string {
  return [
    text,
    `^${anchor}`,
    ...(blankBeforeCallout ? [""] : []),
    ">[! ds]-",
    `>![[${target}#^${anchor}]]`,
    "",
  ].join("\n");
}

function appendCompactBreak(lines: string[]) {
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  lines.push("<br>", "");
}

function appendSeparatedBreak(lines: string[]) {
  while (lines.length > 1 && lines[lines.length - 1] === "" && lines[lines.length - 2] === "") lines.pop();
  if (lines.length && lines[lines.length - 1] !== "") lines.push("");
  lines.push("<br>", "");
}

function appendGap(parts: string[], gap: string) {
  if (!gap) return;
  if (!gap.trim()) {
    if (/\n[ \t]*\n/.test(gap)) parts.push("<br>");
    return;
  }
  const normalized = normalizeInternalBlankLines(gap).trim();
  if (normalized) parts.push(normalized);
}

function joinRenderedParts(parts: string[]): string {
  return parts.filter(Boolean).join("\n");
}

function normalizeInternalBlankLines(value: string): string {
  const formulas = findMultilineLatexRanges(value);
  if (!formulas.length) return value.replace(/\n[ \t]*\n+/g, "\n<br>\n");
  const replacements: string[] = [];
  let protectedText = "";
  let cursor = 0;
  for (const formula of formulas) {
    protectedText += value.slice(cursor, formula.start);
    const token = `\u0000OCR2MD_FORMULA_${replacements.length}\u0000`;
    replacements.push(value.slice(formula.start, formula.end));
    protectedText += token;
    cursor = formula.end;
  }
  protectedText += value.slice(cursor);
  protectedText = protectedText.replace(/\n[ \t]*\n+/g, "\n<br>\n");
  replacements.forEach((formula, index) => {
    protectedText = protectedText.split(`\u0000OCR2MD_FORMULA_${index}\u0000`).join(formula);
  });
  return protectedText;
}

function sentenceAnchor(unit: Candidate): string {
  if (unit.parentBlockIndex == null || unit.sentenceIndex == null) {
    throw new Error(`翻译单元缺少稳定块/句序号：${unit.id}`);
  }
  return `sid-${unit.parentBlockIndex}-${unit.sentenceIndex}`;
}

function requireTranslation(unit: Candidate, state: TranslationStateFile) {
  const entry = translationEntryForUnit(unit, state);
  if (!entry || entry.status !== "translated" || !entry.translatedText) {
    throw new Error(`翻译单元尚未完成：${unitLabel(unit)}`);
  }
  return entry;
}

function groupUnitsByBlock(units: Candidate[]): Map<string, Candidate[]> {
  const result = new Map<string, Candidate[]>();
  for (const unit of units) {
    if (!unit.parentBlockId) continue;
    result.set(unit.parentBlockId, [...(result.get(unit.parentBlockId) ?? []), unit]);
  }
  return result;
}

function compareUnits(left: Candidate, right: Candidate): number {
  return left.range.line - right.range.line || left.range.start - right.range.start;
}

function unitLabel(unit: Candidate): string {
  const block = unit.parentBlockIndex == null ? "?" : String(unit.parentBlockIndex);
  const index = unit.sentenceIndex == null ? "?" : String(unit.sentenceIndex);
  return `${unit.translationUnitKind === "composite" ? "C" : "S"}${block}-${index}`;
}

function normalizeChapterFileName(value: string): string {
  const base = path.basename(value.trim());
  if (!base) throw new Error("章节文件名不能为空。");
  return /\.md$/i.test(base) ? base : `${base}.md`;
}

function vaultJoin(directory: string, fileNameWithoutExtension: string): string {
  return directory ? `${directory}/${fileNameWithoutExtension}` : fileNameWithoutExtension;
}

function ensureTrailingNewline(value: string): string {
  return value.replace(/\s+$/, "") + "\n";
}

function validateCrossTranslationExport(
  result: CrossTranslationExportResult,
  source: string,
  context: RenderContext,
  blocks: Candidate[],
  unitsByBlock: Map<string, Candidate[]>,
) {
  const orgAnchors = collectAnchors(result.orgMarkdown);
  const transAnchors = collectAnchors(result.transMarkdown);
  assertSameStringSet(orgAnchors, transAnchors, "双向文件普通文本锚点不一致");
  assertSameStringSet(orgAnchors, result.anchors, "导出的锚点集合与句子底账不一致");
  assertSameStringArray(orgAnchors, result.anchors, "org2trans 普通文本锚点顺序与原文不一致");
  assertSameStringArray(transAnchors, result.anchors, "trans2org 普通文本锚点顺序与原文不一致");
  if (new Set(orgAnchors).size !== orgAnchors.length || new Set(transAnchors).size !== transAnchors.length) {
    throw new Error("普通文本锚点存在重复。\n");
  }

  for (const anchor of result.anchors) {
    if (countCrossLink(result.orgMarkdown, context.transTarget, anchor) !== 1) {
      throw new Error(`org2trans 引用路径异常：${anchor}`);
    }
    if (countCrossLink(result.transMarkdown, context.orgTarget, anchor) !== 1) {
      throw new Error(`trans2org 引用路径异常：${anchor}`);
    }
  }
  if (/!\[\[[^\]\n]+\.md#\^sid-/i.test(result.orgMarkdown + result.transMarkdown)) {
    throw new Error("Obsidian 交叉互译链接中不应包含 .md 扩展名。");
  }

  for (const block of blocks.filter((item) => item.lineType === "内嵌")) {
    const blockUnits = unitsByBlock.get(block.id) ?? [];
    const rendered = renderCompositeBlock(block, blockUnits, context);
    assertCompositeHasNoCrossLinks(rendered.org);
    assertCompositeHasNoCrossLinks(rendered.trans);
  }

  assertLatexBlocksClean(result.orgMarkdown);
  assertLatexBlocksClean(result.transMarkdown);
  if (containsProtectionPlaceholderSafe(result.orgMarkdown) || containsProtectionPlaceholderSafe(result.transMarkdown)) {
    throw new Error("最终文件中仍存在未恢复的 Markdown 保护占位符。");
  }
  if (/__OCR2MD_LATEX_\d{4}__/.test(result.orgMarkdown + result.transMarkdown)) {
    throw new Error("最终文件中仍存在未恢复的 LaTeX 占位符。");
  }

  if (/^\^(?:sid|bid)-/m.test(result.pureTransMarkdown) || /#\^(?:sid|bid)-/.test(result.pureTransMarkdown)) {
    throw new Error("纯译文中不应包含交叉互译锚点或锚点链接。");
  }
  if (/^>+\[!\s*ds\]-?\s*$/im.test(result.pureTransMarkdown)) {
    throw new Error("纯译文中不应包含交叉互译 ds callout。");
  }
  if (containsProtectionPlaceholderSafe(result.pureTransMarkdown) || /__OCR2MD_LATEX_\d{4}__/.test(result.pureTransMarkdown)) {
    throw new Error("纯译文中仍存在未恢复的保护占位符。");
  }
  assertLatexBlocksClean(result.pureTransMarkdown);

  assertStructuralTokensPreserved(source, result.orgMarkdown, "org2trans");
  assertStructuralTokensPreserved(source, result.transMarkdown, "trans2org");
  assertStructuralTokensPreserved(source, result.pureTransMarkdown, "trans");
}

function assertCompositeHasNoCrossLinks(value: string) {
  if (/\^(?:sid|bid)-/m.test(value) || /!\[[^\]]*#\^(?:sid|bid)-/m.test(value)) {
    throw new Error("合成块内部不得包含跨文件锚点或嵌入链接。");
  }
}

function assertLatexBlocksClean(markdown: string) {
  for (const range of findMultilineLatexRanges(markdown)) {
    const block = markdown.slice(range.start, range.end);
    if (/\^(?:sid|bid)-|\[!\s*ds\]|#\^(?:sid|bid)-/.test(block)) {
      throw new Error("多行 LaTeX 块中检测到锚点或 callout。");
    }
  }
}

function assertStructuralTokensPreserved(source: string, output: string, label: string) {
  const patterns = [
    /!\[[^\]]*\]\([^)]+\)|!\[\[[^\]]+\]\]/g,
    /(?<!!)\[\[[^\]\n]+\]\]/g,
    /\]\([^)\n]+\)/g,
    /<[^>\n]+>/g,
    /\[\^[^\]\n]+\](?::)?/g,
    /`+[^`\n]*`+/g,
    /\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|(?<!\\)\$(?!\$)(?:\\.|[^$\n])*?(?<!\\)\$/g,
    /\bhttps?:\/\/[^\s<>{}\[\]"']+/g,
    /^(?:#{1,6}[ \t]+|[-*+][ \t]+|\d+[.)][ \t]+)/gm,
  ];
  for (const pattern of patterns) {
    assertMatchedTokenCountsPreserved(source, output, pattern, label);
  }
  for (const range of findMultilineLatexRanges(source)) {
    const formula = source.slice(range.start, range.end);
    if (countSubstring(output, formula) < countSubstring(source, formula)) {
      throw new Error(`${label} 丢失多行 LaTeX 块。`);
    }
  }
}

function assertMatchedTokenCountsPreserved(source: string, output: string, pattern: RegExp, label: string) {
  const counts = new Map<string, number>();
  for (const token of source.match(pattern) ?? []) counts.set(token, (counts.get(token) ?? 0) + 1);
  for (const [token, expected] of counts) {
    if (countSubstring(output, token) < expected) {
      throw new Error(`${label} 丢失 Markdown 结构：${token.slice(0, 80)}`);
    }
  }
}

function countSubstring(value: string, token: string): number {
  if (!token) return 0;
  let count = 0;
  let cursor = 0;
  while (cursor <= value.length - token.length) {
    const found = value.indexOf(token, cursor);
    if (found < 0) break;
    count += 1;
    cursor = found + token.length;
  }
  return count;
}

function collectAnchors(markdown: string): string[] {
  return [...markdown.matchAll(/^\^(sid-\d+-\d+)\s*$/gm)].map((match) => match[1]);
}

function assertSameStringSet(left: string[], right: string[], message: string) {
  const a = [...new Set(left)].sort();
  const b = [...new Set(right)].sort();
  if (a.length !== b.length || a.some((value, index) => value !== b[index])) throw new Error(message);
}

function assertSameStringArray(left: string[], right: string[], message: string) {
  if (left.length !== right.length || left.some((value, index) => value !== right[index])) throw new Error(message);
}

function countCrossLink(markdown: string, target: string, anchor: string): number {
  const expected = `![[${target}#^${anchor}]]`;
  return markdown.split("\n").filter((line) => line.replace(/^>+/, "") === expected).length;
}

function containsProtectionPlaceholderSafe(value: string): boolean {
  // containsProtectionPlaceholder intentionally owns the placeholder syntax;
  // the wrapper avoids relying on RegExp lastIndex if its implementation changes.
  return containsProtectionPlaceholder(value);
}
