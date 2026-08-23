import { createHash } from "crypto";
import { activeCandidates } from "./candidateLifecycle";
import type { AnnotationPair, Candidate } from "./types";

const SUPER_DIGITS: Record<string, string> = {
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
  "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
};

export function extractAnnotationNumber(text: string): string | undefined {
  const fromSup = /<sup>\s*\(?\s*(\d+)\s*\)?\s*<\/sup>/i.exec(text)?.[1];
  if (fromSup) return fromSup;
  const fromFootnoteRef = /\[\^([^\]]+)\](?!:)/.exec(text)?.[1];
  if (fromFootnoteRef) return fromFootnoteRef;
  const fromStar = /\[\*(\d+)\]/.exec(text)?.[1];
  if (fromStar) return fromStar;
  const fromBody = /^\s*(?:\[\^([^\]]+)\]:|(\d+)\.|\*(\d+))\s+/.exec(text);
  const fromBodyNumber = fromBody?.slice(1).find(Boolean);
  if (fromBodyNumber) return fromBodyNumber;
  const fromNote = /注(?:释)?\s*(\d+)/.exec(text)?.[1];
  if (fromNote) return fromNote;
  return unicodeSuperscriptNumber(text);
}

export function resolvedAnnotationNumber(row: Candidate): string | undefined {
  const stored = row.annotationNumber?.trim();
  if (stored) return stored;
  if (row.annotationNumberSource === "manual") return undefined;
  return extractAnnotationNumber(row.raw);
}

export function buildAnnotationPairs(rows: Candidate[], previous: AnnotationPair[] = []): AnnotationPair[] {
  const previousStatus = new Map(previous.map((pair) => [pair.id, pair.status]));
  const groups = new Map<string, { sourcePath: string; number: string; refs: Candidate[]; bodies: Candidate[] }>();
  for (const row of activeCandidates(rows).filter((candidate) => candidate.typeLabel === "注释" && candidate.lineType !== "忽略")) {
    const number = resolvedAnnotationNumber(row);
    if (!number) continue;
    const sourcePath = row.sourcePath ?? "";
    const key = `${sourcePath}\0${number}`;
    const group = groups.get(key) ?? { sourcePath, number, refs: [], bodies: [] };
    if (row.lineType === "注释正文") group.bodies.push(row);
    else if (row.lineType === "注释引用") group.refs.push(row);
    groups.set(key, group);
  }
  const pairs: AnnotationPair[] = [];
  for (const group of groups.values()) {
    group.refs.sort(byLine);
    group.bodies.sort(byLine);
    const length = Math.max(group.refs.length, group.bodies.length);
    for (let index = 0; index < length; index += 1) {
      const ref = group.refs[index];
      const body = group.bodies[index];
      const id = `annotation-${shortHash(`${group.sourcePath}\0${group.number}\0${index}`)}`;
      pairs.push({
        id,
        pairId: `${group.number}-${String(index + 1).padStart(2, "0")}`,
        sourcePath: group.sourcePath,
        number: group.number,
        refCandidateId: ref?.id,
        bodyCandidateId: body?.id,
        status: previousStatus.get(id) === "已确认" && ref && body
          ? "已确认"
          : ref && body ? "自动匹配" : ref ? "待补正文" : "待补引用",
      });
    }
  }
  return pairs.sort((left, right) => left.pairId.localeCompare(right.pairId, "zh-CN", { numeric: true }));
}

export function annotationMatchSummary(rows: Candidate[], pairs: AnnotationPair[]): {
  paired: number;
  missingRef: number;
  missingBody: number;
  missingNumber: number;
} {
  const active = activeCandidates(rows).filter((row) =>
    row.typeLabel === "注释" && (row.lineType === "注释引用" || row.lineType === "注释正文"));
  return {
    paired: pairs.filter((pair) => pair.status === "自动匹配" || pair.status === "已确认").length,
    missingRef: pairs.filter((pair) => pair.status === "待补引用").length,
    missingBody: pairs.filter((pair) => pair.status === "待补正文").length,
    missingNumber: active.filter((row) => !resolvedAnnotationNumber(row)).length,
  };
}

function unicodeSuperscriptNumber(text: string): string | undefined {
  let digits = "";
  for (const character of text) {
    const digit = SUPER_DIGITS[character];
    if (digit === undefined) {
      if (digits) break;
      continue;
    }
    digits += digit;
  }
  return digits || undefined;
}

function byLine(left: Candidate, right: Candidate): number {
  return left.range.line - right.range.line || left.range.start - right.range.start;
}

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 20);
}
