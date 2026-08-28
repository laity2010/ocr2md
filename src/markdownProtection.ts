export interface MarkdownReplacement {
  token: string;
  value: string;
}

export interface ProtectedMarkdownText {
  text: string;
  replacements: MarkdownReplacement[];
}

interface MatchRange {
  start: number;
  end: number;
}

export const MARKDOWN_PROTECTION_TAG = "ocr2md-protected";
const LEGACY_TOKEN_PREFIX = "__OCR2MD_PROTECTED_";
const LEGACY_TOKEN_RE = /__OCR2MD_PROTECTED_\d{4}__/;
const XML_TOKEN_RE = /<ocr2md-protected\b[^>]*\bid\s*=\s*["']p\d{4}["'][^>]*>/i;

/**
 * Protect Markdown syntax and non-translatable inline content before sending
 * prose to a translation service. Replacements are deliberately opaque and
 * restored byte-for-byte after translation.
 */
export function protectMarkdownForTranslation(input: string): ProtectedMarkdownText {
  const ranges = collectProtectedRanges(input);
  if (!ranges.length) return { text: input, replacements: [] };

  const replacements: MarkdownReplacement[] = [];
  let output = "";
  let cursor = 0;
  for (const range of ranges) {
    if (range.start < cursor) continue;
    output += input.slice(cursor, range.start);
    const value = input.slice(range.start, range.end);
    const token = markdownToken(replacements.length + 1);
    replacements.push({ token, value });
    output += token;
    cursor = range.end;
  }
  output += input.slice(cursor);
  return { text: output, replacements };
}

export function restoreProtectedMarkdown(
  translatedText: string,
  replacements: readonly MarkdownReplacement[],
): string {
  let restored = translatedText;
  for (const replacement of replacements) {
    const pattern = replacementPattern(replacement.token);
    restored = pattern ? restored.replace(pattern, replacement.value) : restored.split(replacement.token).join(replacement.value);
  }
  return restored;
}

export function missingProtectedMarkdownTokens(
  translatedText: string,
  replacements: readonly MarkdownReplacement[],
): string[] {
  return replacements
    .filter((replacement) => {
      const pattern = replacementPattern(replacement.token);
      return pattern ? !pattern.test(translatedText) : !translatedText.includes(replacement.token);
    })
    .map((replacement) => replacement.token);
}

export function containsProtectionPlaceholder(text: string): boolean {
  return XML_TOKEN_RE.test(text) || LEGACY_TOKEN_RE.test(text);
}

export function usesXmlProtectionPlaceholders(text: string): boolean {
  return XML_TOKEN_RE.test(text);
}

/**
 * Compare protected Markdown structure after translation. Human-readable text
 * may change, but protected syntax and destinations must remain byte-for-byte
 * and in the same order. Returns a concise issue for legacy/broken results.
 */
export function markdownStructureIssue(source: string, translated: string): string | undefined {
  const expected = protectMarkdownForTranslation(source).replacements.map((item) => item.value);
  const actual = protectMarkdownForTranslation(translated).replacements.map((item) => item.value);

  // DeepL XML tag handling is allowed to move atomic inline LaTeX together with
  // the translated phrase it belongs to. That is not structural corruption:
  // formulas/currency expressions must survive byte-for-byte and with the same
  // multiplicity, but their relative order may legitimately change in Chinese.
  const expectedLatex = expected.filter(isAtomicLatexStructure);
  const actualLatex = actual.filter(isAtomicLatexStructure);
  const latexIssue = structureMultisetIssue(expectedLatex, actualLatex, "LaTeX");
  if (latexIssue) return latexIssue;

  // Markdown syntax, links, footnote prefixes, HTML, URLs, code, etc. remain
  // order-sensitive because reordering those fragments can create malformed Markdown.
  const expectedOrdered = expected.filter((value) => !isAtomicLatexStructure(value));
  const actualOrdered = actual.filter((value) => !isAtomicLatexStructure(value));
  const count = Math.max(expectedOrdered.length, actualOrdered.length);
  for (let index = 0; index < count; index += 1) {
    if (expectedOrdered[index] === actualOrdered[index]) continue;
    if (expectedOrdered[index] === undefined) {
      return `出现额外 Markdown 结构：${formatStructure(actualOrdered[index])}`;
    }
    if (actualOrdered[index] === undefined) {
      return `丢失 Markdown 结构：${formatStructure(expectedOrdered[index])}`;
    }
    return `Markdown 结构发生变化：${formatStructure(expectedOrdered[index])} → ${formatStructure(actualOrdered[index])}`;
  }
  return undefined;
}

function isAtomicLatexStructure(value: string): boolean {
  const trimmed = value.trim();
  return /^\$\$[\s\S]*\$\$$/.test(trimmed)
    || /^\\\[[\s\S]*\\\]$/.test(trimmed)
    || /^\\\([\s\S]*\\\)$/.test(trimmed)
    || /^\$(?!\$)[\s\S]*\$$/.test(trimmed);
}

function structureMultisetIssue(expected: readonly string[], actual: readonly string[], label: string): string | undefined {
  const counts = new Map<string, number>();
  for (const value of actual) counts.set(value, (counts.get(value) ?? 0) + 1);
  for (const value of expected) {
    const count = counts.get(value) ?? 0;
    if (!count) return `丢失 ${label} 结构：${formatStructure(value)}`;
    if (count === 1) counts.delete(value);
    else counts.set(value, count - 1);
  }
  const extra = counts.entries().next().value as [string, number] | undefined;
  if (extra) return `出现额外 ${label} 结构：${formatStructure(extra[0])}`;
  return undefined;
}

function formatStructure(value: string | undefined): string {
  if (value === undefined) return "(无)";
  const compact = value.replace(/\r?\n/g, "\\n");
  return compact.length > 80 ? `${compact.slice(0, 77)}...` : compact;
}

function collectProtectedRanges(input: string): MatchRange[] {
  const ranges: MatchRange[] = [];
  const add = (start: number, end: number) => {
    if (end <= start) return;
    ranges.push({ start, end });
  };

  // Larger constructs first. Later ranges that overlap them are discarded.
  collectRegex(input, /```[\s\S]*?```|~~~[\s\S]*?~~~/g, add);
  collectRegex(input, /`+[^`\n]*`+/g, add);
  collectRegex(input, /\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|(?<!\\)\$(?!\$)(?:\\.|[^$\n])*?(?<!\\)\$/g, add);
  collectRegex(input, /!?\[\[[^\]\r\n]+\]\]/g, add);
  collectRegex(input, /!\[[^\]\r\n]*\]\([^)\r\n]+\)/g, add);
  collectMarkdownLinkSyntax(input, add);
  collectRegex(input, /<[^>\r\n]+>/g, add);
  collectRegex(input, /\[\^[^\]\r\n]+\]/g, add);
  collectRegex(input, /\bhttps?:\/\/[^\s<>{}\[\]"']+/g, add);
  collectRegex(input, /\bwww\.[^\s<>{}\[\]"']+/g, add);

  // Preserve footnote-definition and Markdown structural prefixes while still
  // allowing the human-readable content after the prefix to be translated.
  collectRegex(input, /(^|\n)[ \t]*\[\^[^\]\r\n]+\]:[ \t]*/g, (start, end, match) => {
    const newline = match[1] ? 1 : 0;
    add(start + newline, end);
  });
  collectRegex(input, /(^|\n)[ \t]*(?:#{1,6}[ \t]+|[-*+][ \t]+|\d+[.)][ \t]+|>+[ \t]*)/g, (start, end, match) => {
    const newline = match[1] ? 1 : 0;
    add(start + newline, end);
  });

  ranges.sort((left, right) => left.start - right.start || right.end - left.end);
  const merged: MatchRange[] = [];
  for (const range of ranges) {
    const previous = merged[merged.length - 1];
    if (previous && range.start < previous.end) {
      // Keep the earlier/larger range. Nested syntax will be restored as part
      // of that exact original substring.
      if (range.end > previous.end && range.start <= previous.start) previous.end = range.end;
      continue;
    }
    merged.push({ ...range });
  }
  return merged;
}


function collectMarkdownLinkSyntax(
  input: string,
  add: (start: number, end: number) => void,
) {
  for (const match of input.matchAll(/(?<!!)\[([^\]\r\n]+)\]\(([^)\r\n]+)\)/g)) {
    if (match.index === undefined) continue;
    const label = match[1];
    const openStart = match.index;
    const suffixStart = openStart + 1 + label.length;
    add(openStart, openStart + 1);
    add(suffixStart, openStart + match[0].length);
  }
}

function collectRegex(
  input: string,
  regex: RegExp,
  add: (start: number, end: number, match: RegExpMatchArray) => void,
) {
  for (const match of input.matchAll(regex)) {
    if (match.index === undefined || !match[0]) continue;
    add(match.index, match.index + match[0].length, match);
  }
}

function markdownToken(index: number): string {
  return `<${MARKDOWN_PROTECTION_TAG} id="p${String(index).padStart(4, "0")}"/>`;
}

function replacementPattern(token: string): RegExp | undefined {
  const xmlId = /\bid\s*=\s*["'](p\d{4})["']/i.exec(token)?.[1];
  if (xmlId) {
    const id = escapeRegex(xmlId);
    // DeepL XML handling may normalize quote style, whitespace, or expand a
    // self-closing placeholder into an explicit empty element. Match both.
    return new RegExp(
      `<${MARKDOWN_PROTECTION_TAG}\\b(?=[^>]*\\bid\\s*=\\s*["']${id}["'])[^>]*(?:\\/\\s*>|>\\s*<\\/${MARKDOWN_PROTECTION_TAG}\\s*>)`,
      "gi",
    );
  }
  if (token.startsWith(LEGACY_TOKEN_PREFIX)) return new RegExp(escapeRegex(token), "g");
  return undefined;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
