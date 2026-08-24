export interface LatexReplacement {
  token: string;
  latex: string;
}

export interface MaskedLatexText {
  text: string;
  replacements: LatexReplacement[];
}

interface DelimitedLatex {
  start: string;
  end: string;
}

const DELIMITERS: DelimitedLatex[] = [
  { start: "$$", end: "$$" },
  { start: "\\[", end: "\\]" },
  { start: "\\(", end: "\\)" },
  { start: "$", end: "$" },
];

export function maskLatexForTranslation(input: string): MaskedLatexText {
  const replacements: LatexReplacement[] = [];
  let output = "";
  let cursor = 0;

  while (cursor < input.length) {
    const delimiter = matchingDelimiter(input, cursor);
    if (!delimiter) {
      output += input[cursor];
      cursor += 1;
      continue;
    }

    const end = findClosingDelimiter(input, cursor + delimiter.start.length, delimiter);
    if (end < 0) {
      output += delimiter.start;
      cursor += delimiter.start.length;
      continue;
    }

    const latexEnd = end + delimiter.end.length;
    const latex = input.slice(cursor, latexEnd);
    const token = latexToken(replacements.length + 1);
    replacements.push({ token, latex });
    output += token;
    cursor = latexEnd;
  }

  return { text: output, replacements };
}

export function restoreLatexAfterTranslation(
  translatedText: string,
  replacements: readonly LatexReplacement[],
): string {
  let restored = translatedText;
  for (const replacement of replacements) {
    restored = restored.split(replacement.token).join(replacement.latex);
  }
  return restored;
}

export function missingLatexTokens(
  translatedText: string,
  replacements: readonly LatexReplacement[],
): string[] {
  return replacements
    .filter((replacement) => !translatedText.includes(replacement.token))
    .map((replacement) => replacement.token);
}

function matchingDelimiter(input: string, index: number): DelimitedLatex | undefined {
  if (isEscaped(input, index)) return undefined;
  for (const delimiter of DELIMITERS) {
    if (!input.startsWith(delimiter.start, index)) continue;
    if (delimiter.start === "$" && input.startsWith("$$", index)) continue;
    return delimiter;
  }
  return undefined;
}

function findClosingDelimiter(input: string, from: number, delimiter: DelimitedLatex): number {
  let cursor = from;
  while (cursor < input.length) {
    const found = input.indexOf(delimiter.end, cursor);
    if (found < 0) return -1;
    if (isEscaped(input, found)) {
      cursor = found + delimiter.end.length;
      continue;
    }
    if (delimiter.end === "$" && input.startsWith("$$", found)) {
      cursor = found + 2;
      continue;
    }
    return found;
  }
  return -1;
}

function isEscaped(input: string, index: number): boolean {
  let backslashes = 0;
  for (let cursor = index - 1; cursor >= 0 && input[cursor] === "\\"; cursor -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
}

function latexToken(index: number): string {
  return `__OCR2MD_LATEX_${String(index).padStart(4, "0")}__`;
}
