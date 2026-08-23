import { createHash } from "crypto";
import { isDeletedCandidate } from "./candidateLifecycle";
import type { Candidate, ModuleName, SourceRange } from "./types";

export const FILE_START_ANCHOR = "anchor:file-start";
export const FILE_END_ANCHOR = "anchor:file-end";

export function splitDocumentLines(text: string): string[] {
  return text.replace(/\r\n?/g, "\n").split("\n");
}

export function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 20);
}

export function attachLineIdentity(
  candidate: Candidate,
  documentText: string,
  context: { moduleName: ModuleName; sourcePath: string },
): Candidate {
  const textHash = hashText(candidate.raw);
  if (candidate.chapterBoundaryState === "deleted") {
    const rowId = `row-${hashText(`${context.moduleName}\0${context.sourcePath}\0deleted\0${textHash}`)}`;
    const atomId = `atom-${hashText(`${context.sourcePath}\0deleted\0${textHash}`)}`;
    return { ...candidate, id: rowId, rowId, atomId, anchorTextHash: textHash };
  }

  const lines = splitDocumentLines(documentText);
  const last = Math.max(0, lines.length - 1);
  const startLine = clamp(candidate.range.line, 0, last);
  const endLine = clamp(candidate.range.endLine ?? candidate.range.line, startLine, last);
  const lineText = lines.slice(startLine, endLine + 1).join("\n");
  const anchors = anchorsAt(lines, startLine, endLine);
  const atomId = `atom-${hashText(`${context.sourcePath}\0${hashText(lineText)}\0${anchors.previousHash}\0${anchors.nextHash}`)}`;
  const rowId = `row-${hashText(`${context.moduleName}\0${context.sourcePath}\0${textHash}\0${candidate.range.start}\0${anchors.previousHash}\0${anchors.nextHash}`)}`;
  return {
    ...candidate,
    id: rowId,
    rowId,
    atomId,
    anchorTextHash: textHash,
    anchorPreviousHash: anchors.previousHash,
    anchorNextHash: anchors.nextHash,
  };
}

export function attachScanIdentities(
  candidates: Candidate[],
  documentText: string,
  context: { moduleName: ModuleName; sourcePath: string },
): Candidate[] {
  const attached = candidates.map((row) => attachLineIdentity(row, documentText, context));
  const rowCounts = new Map<string, number>();
  const atomCounts = new Map<string, number>();
  return attached.map((row) => {
    const rowBase = row.rowId ?? row.id;
    const atomBase = row.atomId ?? rowBase;
    const rowCount = rowCounts.get(rowBase) ?? 0;
    rowCounts.set(rowBase, rowCount + 1);
    const atomCount = atomCounts.get(atomBase) ?? 0;
    atomCounts.set(atomBase, atomCount + 1);
    const rowId = rowCount === 0 ? rowBase : `${rowBase}:${rowCount}`;
    const atomId = atomCount === 0 ? atomBase : `${atomBase}:${atomCount}`;
    return { ...row, id: rowId, rowId, atomId };
  });
}

export function reconcileRows(previous: Candidate[], scanned: Candidate[]): Candidate[] {
  const prev = previous.map(ensureTextHash);
  const scan = scanned.map(ensureTextHash);
  const usedPrev = new Set<number>();
  const usedScan = new Set<number>();
  const merged: Array<Candidate | undefined> = new Array(scan.length);

  const take = (prevIndex: number, scanIndex: number) => {
    if (usedPrev.has(prevIndex) || usedScan.has(scanIndex)) return;
    usedPrev.add(prevIndex);
    usedScan.add(scanIndex);
    merged[scanIndex] = mergeMatched(prev[prevIndex], scan[scanIndex]);
  };

  const assignGroups = (keyFn: (row: Candidate) => string | undefined) => {
    const prevGroups = groupRows(prev, usedPrev, keyFn);
    const scanGroups = groupRows(scan, usedScan, keyFn);
    for (const [key, scanItems] of scanGroups) {
      const prevItems = prevGroups.get(key);
      if (!prevItems?.length) continue;
      for (const [left, right] of zipNearest(prevItems, scanItems)) take(left.index, right.index);
    }
  };

  assignGroups(fullFingerprintKey);
  assignGroups(textPreviousKey);
  assignGroups(textNextKey);

  const prevByText = groupRows(prev, usedPrev, (row) => row.anchorTextHash);
  const scanByText = groupRows(scan, usedScan, (row) => row.anchorTextHash);
  for (const [key, scanItems] of scanByText) {
    const prevItems = prevByText.get(key);
    if (scanItems.length === 1 && prevItems?.length === 1) take(prevItems[0].index, scanItems[0].index);
  }

  assignGroups(neighborKey);
  assignGroups((row) => `raw:${row.raw}`);
  assignGroups(legacyPositionKey);

  const result = scan.map((row, index) => merged[index] ?? row);
  prev.forEach((old, index) => {
    if (usedPrev.has(index)) return;
    if (isDeletedCandidate(old)
      || old.isWorkingCorrection
      || ["added", "modified", "deleted"].includes(old.chapterBoundaryState ?? "")) {
      result.push(old);
    }
  });
  return result.sort((left, right) =>
    left.range.line - right.range.line
    || left.range.start - right.range.start
    || left.raw.localeCompare(right.raw));
}

export function locateCandidate(documentText: string, candidate: Candidate): SourceRange | undefined {
  const lines = splitDocumentLines(documentText);
  const hits = candidate.raw ? findRawHits(documentText, candidate.raw) : [];
  if (hits.length) {
    hits.sort((left, right) => {
      const score = scoreHit(lines, candidate, right) - scoreHit(lines, candidate, left);
      if (score) return score;
      return Math.abs(left.line - candidate.range.line) - Math.abs(right.line - candidate.range.line);
    });
    return hits[0];
  }

  const slot = findNeighborSlot(lines, candidate);
  if (slot) return slot;

  if (candidate.range.line >= 0 && candidate.range.line < lines.length) {
    const line = lines[candidate.range.line];
    if (candidate.raw && line.includes(candidate.raw)) {
      const start = Math.max(0, line.indexOf(candidate.raw));
      return { line: candidate.range.line, start, end: start + candidate.raw.length };
    }
    if (line === candidate.raw) {
      return { line: candidate.range.line, start: 0, end: line.length };
    }
  }
  return undefined;
}

function anchorsAt(lines: string[], startLine: number, endLine: number): {
  previousText: string;
  nextText: string;
  previousHash: string;
  nextHash: string;
} {
  const previousText = neighborText(lines, startLine - 1, -1);
  const nextText = neighborText(lines, endLine + 1, 1);
  return {
    previousText,
    nextText,
    previousHash: hashText(previousText),
    nextHash: hashText(nextText),
  };
}

function neighborText(lines: string[], from: number, direction: -1 | 1): string {
  for (let index = from; index >= 0 && index < lines.length; index += direction) {
    if (lines[index].trim()) return lines[index];
  }
  return direction < 0 ? FILE_START_ANCHOR : FILE_END_ANCHOR;
}

function findRawHits(documentText: string, raw: string): SourceRange[] {
  if (!raw) return [];
  const normalized = documentText.replace(/\r\n?/g, "\n");
  const hits: SourceRange[] = [];
  let from = 0;
  while (from <= normalized.length) {
    const index = normalized.indexOf(raw, from);
    if (index < 0) break;
    hits.push(rangeFromOffsets(normalized, index, index + raw.length));
    from = index + Math.max(raw.length, 1);
  }
  return hits;
}

function rangeFromOffsets(text: string, startOffset: number, endOffset: number): SourceRange {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\n") starts.push(index + 1);
  }
  const position = (offset: number) => {
    let low = 0;
    let high = starts.length - 1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (starts[middle] <= offset) low = middle + 1;
      else high = middle - 1;
    }
    const line = Math.max(high, 0);
    return { line, character: offset - starts[line] };
  };
  const start = position(startOffset);
  const end = position(endOffset);
  return {
    line: start.line,
    start: start.character,
    endLine: end.line === start.line ? undefined : end.line,
    end: end.character,
  };
}

function scoreHit(lines: string[], candidate: Candidate, hit: SourceRange): number {
  const endLine = hit.endLine ?? hit.line;
  const anchors = anchorsAt(lines, hit.line, endLine);
  let score = 10;
  if (candidate.anchorPreviousHash && candidate.anchorPreviousHash === anchors.previousHash) score += 40;
  if (candidate.anchorNextHash && candidate.anchorNextHash === anchors.nextHash) score += 40;
  score += Math.max(0, 15 - Math.abs(hit.line - candidate.range.line));
  if (hit.start === candidate.range.start) score += 5;
  return score;
}

function findNeighborSlot(lines: string[], candidate: Candidate): SourceRange | undefined {
  if (!candidate.anchorPreviousHash || !candidate.anchorNextHash) return undefined;
  const span = Math.max(0, (candidate.range.endLine ?? candidate.range.line) - candidate.range.line);
  const matches: number[] = [];
  for (let start = 0; start + span < lines.length; start += 1) {
    const anchors = anchorsAt(lines, start, start + span);
    if (anchors.previousHash === candidate.anchorPreviousHash && anchors.nextHash === candidate.anchorNextHash) {
      matches.push(start);
    }
  }
  if (!matches.length) return undefined;
  matches.sort((left, right) => Math.abs(left - candidate.range.line) - Math.abs(right - candidate.range.line));
  const line = matches[0];
  const endLine = line + span;
  return {
    line,
    start: 0,
    endLine: span ? endLine : undefined,
    end: (lines[endLine] ?? "").length,
  };
}

function ensureTextHash(row: Candidate): Candidate {
  return row.anchorTextHash ? row : { ...row, anchorTextHash: hashText(row.raw) };
}

function mergeMatched(previous: Candidate, scanned: Candidate): Candidate {
  return {
    ...scanned,
    id: previous.id,
    rowId: previous.rowId ?? previous.id,
    atomId: previous.atomId ?? scanned.atomId,
    lineType: previous.lineType ?? scanned.lineType,
    chapterFile: previous.chapterFile ?? scanned.chapterFile,
    localPath: previous.localPath ?? scanned.localPath,
    isWorkingCorrection: previous.isWorkingCorrection,
    annotationNumber: previous.annotationNumberSource === "manual"
      ? previous.annotationNumber
      : scanned.annotationNumber ?? previous.annotationNumber,
    annotationNumberSource: previous.annotationNumberSource === "manual"
      ? "manual"
      : scanned.annotationNumberSource ?? previous.annotationNumberSource,
  };
}

function fullFingerprintKey(row: Candidate): string | undefined {
  if (!row.anchorTextHash || !row.anchorPreviousHash || !row.anchorNextHash) return undefined;
  return `${row.anchorTextHash}\0${row.anchorPreviousHash}\0${row.anchorNextHash}`;
}

function textPreviousKey(row: Candidate): string | undefined {
  if (!row.anchorTextHash || !row.anchorPreviousHash) return undefined;
  return `${row.anchorTextHash}\0prev:${row.anchorPreviousHash}`;
}

function textNextKey(row: Candidate): string | undefined {
  if (!row.anchorTextHash || !row.anchorNextHash) return undefined;
  return `${row.anchorTextHash}\0next:${row.anchorNextHash}`;
}

function neighborKey(row: Candidate): string | undefined {
  if (!row.anchorPreviousHash || !row.anchorNextHash) return undefined;
  return `slot:${row.anchorPreviousHash}\0${row.anchorNextHash}\0${row.range.start}`;
}

function legacyPositionKey(row: Candidate): string {
  return `legacy:${row.range.line}\0${row.range.start}\0${row.raw}`;
}

function groupRows(
  rows: Candidate[],
  used: ReadonlySet<number>,
  keyFn: (row: Candidate) => string | undefined,
): Map<string, Array<{ row: Candidate; index: number }>> {
  const groups = new Map<string, Array<{ row: Candidate; index: number }>>();
  rows.forEach((row, index) => {
    if (used.has(index)) return;
    const key = keyFn(row);
    if (key === undefined) return;
    const list = groups.get(key) ?? [];
    list.push({ row, index });
    groups.set(key, list);
  });
  return groups;
}

function zipNearest(
  previous: Array<{ row: Candidate; index: number }>,
  scanned: Array<{ row: Candidate; index: number }>,
): Array<[{ row: Candidate; index: number }, { row: Candidate; index: number }]> {
  const edges: Array<{
    previous: { row: Candidate; index: number };
    scanned: { row: Candidate; index: number };
    distance: number;
  }> = [];
  for (const left of previous) {
    for (const right of scanned) {
      edges.push({
        previous: left,
        scanned: right,
        distance: Math.abs(left.row.range.line - right.row.range.line) * 1000
          + Math.abs(left.row.range.start - right.row.range.start),
      });
    }
  }
  edges.sort((left, right) => left.distance - right.distance);
  const usedPrev = new Set<number>();
  const usedScan = new Set<number>();
  const pairs: Array<[{ row: Candidate; index: number }, { row: Candidate; index: number }]> = [];
  for (const edge of edges) {
    if (usedPrev.has(edge.previous.index) || usedScan.has(edge.scanned.index)) continue;
    usedPrev.add(edge.previous.index);
    usedScan.add(edge.scanned.index);
    pairs.push([edge.previous, edge.scanned]);
  }
  return pairs;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
