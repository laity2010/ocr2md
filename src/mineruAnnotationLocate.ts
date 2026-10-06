import { FILE_END_ANCHOR, FILE_START_ANCHOR, hashText, splitDocumentLines } from "./rowIdentity";
import type { MineruMarkdownLocator } from "./mineruAnnotationContract";
import type { SourceRange } from "./types";

/**
 * JSON positions describe canonical chapter originals. Never blindly apply a
 * stale original line number to an edited working copy.
 *
 * A unique content anchor may move to another line; ambiguous/stale anchors
 * must fail closed rather than focus an unrelated numbered footnote.
 */
export function locateMineruMarkdownReference(
  workingText: string,
  locator: MineruMarkdownLocator,
): SourceRange | undefined {
  const lines = splitDocumentLines(workingText);
  const marker = locator.anchorText.slice(locator.start, locator.end);
  if (!marker) return undefined;

  const at = (line: number, start: number): SourceRange | undefined => {
    const text = lines[line];
    if (text === undefined || text.slice(start, start + marker.length) !== marker) {
      return undefined;
    }
    return { line, start, end: start + marker.length };
  };
  const exact: SourceRange[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index] !== locator.anchorText ||
      (locator.anchorTextHash && hashText(lines[index]) !== locator.anchorTextHash)) continue;
    const found = at(index, locator.start);
    if (found) exact.push(found);
  }
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    const withNeighbors = exact.filter((hit) => (
      (!locator.anchorPreviousHash || previousHash(lines, hit.line) === locator.anchorPreviousHash)
      && (!locator.anchorNextHash || nextHash(lines, hit.line) === locator.anchorNextHash)
    ));
    return withNeighbors.length === 1 ? withNeighbors[0] : undefined;
  }

  // Inline edits may shift the column. Require a distinctive text window
  // around the marker and exactly one occurrence across the working copy.
  const before = locator.anchorText.slice(Math.max(0, locator.start - 16), locator.start);
  const after = locator.anchorText.slice(locator.end, locator.end + 16);
  const needle = before + marker + after;
  if (needle.length < 12) return undefined;
  const hits: SourceRange[] = [];
  for (let line = 0; line < lines.length; line += 1) {
    let from = 0;
    while (from <= lines[line].length - needle.length) {
      const index = lines[line].indexOf(needle, from);
      if (index < 0) break;
      hits.push({ line, start: index + before.length, end: index + before.length + marker.length });
      from = index + 1;
    }
  }
  return hits.length === 1 ? hits[0] : undefined;
}

function previousHash(lines: readonly string[], line: number): string {
  for (let i = line - 1; i >= 0; i -= 1) {
    if (lines[i].trim()) return hashText(lines[i]);
  }
  return hashText(FILE_START_ANCHOR);
}

function nextHash(lines: readonly string[], line: number): string {
  for (let i = line + 1; i < lines.length; i += 1) {
    if (lines[i].trim()) return hashText(lines[i]);
  }
  return hashText(FILE_END_ANCHOR);
}
