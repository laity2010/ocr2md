import { SentenceSplitterSyntax, split as splitSentences } from "sentence-splitter";

export interface OcrSentenceSegment {
  raw: string;
  range: [number, number];
}

export function splitOcrSentenceSegments(text: string): OcrSentenceSegment[] {
  const baseSegments = splitSentences(text)
    .filter((node) => node.type === SentenceSplitterSyntax.Sentence)
    .map((node) => ({
      raw: node.raw,
      range: [node.range[0], node.range[1]] as [number, number],
    }));
  const merged: OcrSentenceSegment[] = [];

  for (const segment of baseSegments) {
    const previous = merged.at(-1);
    if (previous && shouldMergeSectionMarker(previous, segment, text)) {
      previous.range[1] = segment.range[1];
      previous.raw = text.slice(previous.range[0], previous.range[1]);
      continue;
    }
    merged.push(segment);
  }

  return merged;
}

function shouldMergeSectionMarker(
  previous: OcrSentenceSegment,
  current: OcrSentenceSegment,
  source: string,
): boolean {
  if (!/^(?:>\s*)*[A-Z]\.$/.test(previous.raw.trim())) {
    return false;
  }
  const separator = source.slice(previous.range[1], current.range[0]);
  return separator.trim() === "" && !/\n\s*\n/.test(separator);
}
