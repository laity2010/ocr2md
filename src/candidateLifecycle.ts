import type { Candidate } from "./types";

/** Soft-deleted table rows remain auditable but must not affect processing. */
export const DELETED_LINE_TYPE = "已删除";

export function isDeletedCandidate(candidate: Candidate): boolean {
  return candidate.lineType === DELETED_LINE_TYPE;
}

export function markCandidatesDeleted(rows: Candidate[], ids: ReadonlySet<string>): Candidate[] {
  return rows.map((candidate) => ids.has(candidate.id)
    ? { ...candidate, lineType: DELETED_LINE_TYPE }
    : candidate);
}

export function activeCandidates(rows: Candidate[]): Candidate[] {
  return rows.filter((candidate) => !isDeletedCandidate(candidate));
}

/** Reuse a manual-add row only when it is already the same source line. */
export function findReusableManualRow(
  rows: Candidate[],
  spec: { typeLabel: string; raw: string; line: number; belongs: (row: Candidate) => boolean },
): Candidate | undefined {
  return rows.find((row) =>
    row.typeLabel === spec.typeLabel
    && !isDeletedCandidate(row)
    && row.raw === spec.raw
    && row.range.line === spec.line
    && spec.belongs(row));
}
