import type { Candidate, FootnotePair, ScanResult } from "./types";

const supPattern = /<sup>(.*?)<\/sup>/g;
const numericSupPattern = /^\d+$/;
const notesHeadingPattern = /^##\s+Notes\s*$/i;
const bodyPattern = /^\s*(\d+)\.\s+(.+)$/;

export function scanMarkdown(text: string): ScanResult {
  const lines = text.split(/\r?\n/);
  const refs = scanFootnoteRefs(text);
  const suspicious = scanSuspiciousSup(text);
  const bodies = scanFootnoteBodies(text);
  const pairs = buildFootnotePairs(refs, bodies);

  return { refs, bodies, suspicious, pairs };
}

export function scanRegexMatches(text: string, pattern: string): Candidate[] {
  if (!pattern.trim()) {
    return [];
  }

  let regex: RegExp;
  try {
    // Multiline mode preserves the existing ^ / $ behavior while also allowing
    // presets to deliberately match a line break (for example OCR continuations).
    regex = new RegExp(pattern, "gm");
  } catch {
    return [];
  }

  const matches: Candidate[] = [];
  const lineStarts = lineStartOffsets(text);
  regex.lastIndex = 0;
  for (const match of text.matchAll(regex)) {
    let raw = match[0];
    if (!raw) {
      continue;
    }

    // A line-anchored pattern beginning with \s* may consume the preceding
    // blank line because \s also matches newlines. Candidates should start at
    // the actual matched content so their line number and preview remain useful.
    const leadingNewlines = /^(?:\r\n|\r|\n)+/.exec(raw)?.[0] ?? "";
    raw = raw.slice(leadingNewlines.length);
    if (!raw) {
      continue;
    }

    const startOffset = (match.index ?? 0) + leadingNewlines.length;
    const start = positionAtOffset(lineStarts, startOffset);
    const end = positionAtOffset(lineStarts, startOffset + raw.length);
    matches.push({
      id: `regex-${start.line}-${start.character}-${matches.length}`,
      kind: "regex",
      label: match[1]?.trim() || raw.replace(/\r?\n/g, " ").trim(),
      raw,
      preview: raw.replace(/\r?\n/g, " ⏎ ").trim(),
      range: {
        line: start.line,
        start: start.character,
        endLine: end.line === start.line ? undefined : end.line,
        end: end.character,
      },
      status: "候选",
    });
  }

  return matches;
}

/**
 * Finds likely OCR line-wrap errors from the relationship between adjacent lines.
 * It intentionally produces review candidates only; it never changes source text.
 */
export function scanIllegalLineBreakCandidates(text: string): Candidate[] {
  const lines = text.split(/\r?\n/);
  const candidates: Candidate[] = [];
  let inCodeBlock = false;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const current = lines[lineIndex];
    if (/^\s*```/.test(current)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock || !current.trim() || isMarkdownStructuralLine(current)) {
      continue;
    }

    // A single blank line sometimes appears inside OCR paragraphs. More than one
    // blank line is treated as a real paragraph separation and is not proposed.
    let nextLineIndex = lineIndex + 1;
    while (nextLineIndex < lines.length && !lines[nextLineIndex].trim()) {
      nextLineIndex += 1;
    }
    if (nextLineIndex >= lines.length || nextLineIndex - lineIndex > 2) {
      continue;
    }

    const next = lines[nextLineIndex];
    if (isMarkdownStructuralLine(next)) {
      continue;
    }

    const score = illegalBreakScore(current, next);
    if (score.value < 7) {
      continue;
    }

    const currentTrimmed = current.trim();
    const nextTrimmed = next.trim();
    const start = current.search(/\S/);
    candidates.push({
      id: `illegal-break-${lineIndex}-${nextLineIndex}`,
      kind: "regex",
      label: `L${lineIndex + 1} -> L${nextLineIndex + 1}`,
      raw: `${currentTrimmed.slice(-96)} ⏎ ${nextTrimmed.slice(0, 96)}`,
      preview: `${currentTrimmed} ⏎ ${nextTrimmed}`,
      range: {
        line: lineIndex,
        start: Math.max(start, 0),
        endLine: nextLineIndex,
        end: next.length,
      },
      typeLabel: "非法断行",
      lineType: "断行候选",
      reason: `候选评分 ${score.value}: ${score.reasons.join("；")}`,
      status: "候选",
    });
  }

  return candidates;
}

function illegalBreakScore(current: string, next: string): { value: number; reasons: string[] } {
  const reasons: string[] = [];
  let value = 0;
  const currentForBoundary = current.trim().replace(/\s*<sup>.*?<\/sup>\s*$/i, "");
  const nextTrimmed = next.trim();

  if (!/[.!?。！？；：]$/.test(currentForBoundary)) {
    value += 3;
    reasons.push("前行未以句末标点结束");
  }
  if (/^(?:[a-z]|\d|[\u4E00-\u9FFF]|[\]\)）〕】])/u.test(nextTrimmed)) {
    value += 2;
    reasons.push("后行像同句续行");
  }
  if (/[A-Za-z]{2,}$/.test(currentForBoundary) || /[\u4E00-\u9FFF]$/.test(currentForBoundary)) {
    value += 2;
    reasons.push("前行以文本词尾结束");
  }
  if (current.trim().length >= 40) {
    value += 1;
    reasons.push("前行长度足够");
  }
  if (/^\d/.test(nextTrimmed)) {
    value += 2;
    reasons.push("后行以数字继续");
  }
  if (/[A-Za-z]-$/.test(currentForBoundary)) {
    value += 4;
    reasons.push("行末连字符断词");
  }

  return { value, reasons };
}

function isMarkdownStructuralLine(line: string): boolean {
  const trimmed = line.trim();
  return /^(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>|\||```|~~~)/.test(trimmed);
}

function lineStartOffsets(text: string): number[] {
  const starts = [0];
  const newlinePattern = /\r\n|\r|\n/g;
  for (const match of text.matchAll(newlinePattern)) {
    starts.push((match.index ?? 0) + match[0].length);
  }
  return starts;
}

function positionAtOffset(lineStarts: number[], offset: number): { line: number; character: number } {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (lineStarts[middle] <= offset) {
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  const line = Math.max(high, 0);
  return { line, character: offset - lineStarts[line] };
}

export function scanFootnoteRefs(text: string): Candidate[] {
  return scanFootnoteRefsWithPattern(text, "<sup>(\\d+)</sup>");
}

export function scanFootnoteRefsWithPattern(text: string, pattern: string): Candidate[] {
  const lines = text.split(/\r?\n/);
  const refs: Candidate[] = [];
  let regex: RegExp;

  try {
    regex = new RegExp(pattern, "g");
  } catch {
    return [];
  }

  lines.forEach((lineText, lineIndex) => {
    regex.lastIndex = 0;
    for (const match of lineText.matchAll(regex)) {
      const raw = match[0];
      const label = (match[1]?.trim() || raw).trim();

      const start = match.index ?? 0;
      refs.push({
        id: `ref-${lineIndex}-${start}-${label}`,
        kind: "ref",
        label,
        raw,
        preview: lineText.trim(),
        range: {
          line: lineIndex,
          start,
          end: start + raw.length,
        },
        status: "候选",
      });
    }
  });

  return refs;
}

export function scanSuspiciousSup(text: string): Candidate[] {
  const lines = text.split(/\r?\n/);
  const suspicious: Candidate[] = [];

  lines.forEach((lineText, lineIndex) => {
    supPattern.lastIndex = 0;
    for (const match of lineText.matchAll(supPattern)) {
      const raw = match[0];
      const label = match[1]?.trim() ?? "";
      if (numericSupPattern.test(label)) {
        continue;
      }

      const start = match.index ?? 0;
      suspicious.push({
        id: `suspicious-${lineIndex}-${start}`,
        kind: "suspicious",
        label,
        raw,
        preview: lineText.trim(),
        range: {
          line: lineIndex,
          start,
          end: start + raw.length,
        },
        reason: "sup 内容不是数字，可能不是注释引用",
        status: "候选",
      });
    }
  });

  return suspicious;
}

export function scanFootnoteBodies(text: string): Candidate[] {
  const lines = text.split(/\r?\n/);
  const notesStart = lines.findIndex((line) => notesHeadingPattern.test(line.trim()));
  if (notesStart === -1) {
    return [];
  }

  const bodies: Candidate[] = [];
  for (let lineIndex = notesStart + 1; lineIndex < lines.length; lineIndex += 1) {
    const lineText = lines[lineIndex];
    const match = lineText.match(bodyPattern);
    if (!match) {
      continue;
    }

    const raw = lineText.trim();
    const label = match[1];
    const markerStart = lineText.indexOf(label);
    bodies.push({
      id: `body-${lineIndex}-${markerStart}-${label}`,
      kind: "body",
      label,
      raw,
      preview: raw,
      range: {
        line: lineIndex,
        start: Math.max(markerStart, 0),
        end: lineText.length,
      },
      status: "候选",
    });
  }

  return bodies;
}

export function buildFootnotePairs(refs: Candidate[], bodies: Candidate[]): FootnotePair[] {
  const labels = new Set<string>();
  refs.forEach((ref) => labels.add(ref.label));
  bodies.forEach((body) => labels.add(body.label));

  return Array.from(labels)
    .sort(compareNumericLabels)
    .map((label) => {
      const ref = refs.find((candidate) => candidate.label === label);
      const body = bodies.find((candidate) => candidate.label === label);
      const normalizedBodyText = body ? body.raw.replace(/^\s*\d+\.\s+/, "") : "";

      return {
        id: `pair-${label}`,
        label,
        ref,
        body,
        normalizedRef: `[^${label}]`,
        normalizedBody: body ? `[^${label}]: ${normalizedBodyText}` : "",
        status: ref && body ? "待确认" : ref ? "缺少 body" : "缺少 ref",
      };
    });
}

function compareNumericLabels(left: string, right: string): number {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }

  return left.localeCompare(right);
}
