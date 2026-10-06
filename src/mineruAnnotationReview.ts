import type { MineruProjectedAnnotationRow } from "./mineruAnnotationProjection";
import type { Candidate } from "./types";

/** Ephemeral presentation rows; never feed these into sidecar save or undo. */
export interface MineruReviewCandidate extends Candidate {
  mineruAnnotation: MineruProjectedAnnotationRow;
}

export function mineruReviewCandidates(
  rows: readonly MineruProjectedAnnotationRow[],
): MineruReviewCandidate[] {
  return rows.map((item) => {
    const target = item.navigationTarget;
    return {
      id: item.rowId,
      rowId: item.rowId,
      kind: item.lineType === "注释正文" ? "body" : "ref",
      label: item.lineType,
      raw: item.preview,
      preview: item.preview,
      annotationNumber: String(item.annotationNumber),
      annotationNumberSource: "extracted",
      range: {
        line: target?.lineIndex ?? -1,
        start: target?.start ?? 0,
        end: target?.end ?? 0,
      },
      typeLabel: "注释",
      lineType: item.lineType,
      mineruAnnotation: item,
    };
  });
}

export function mineruAnnotationFromCandidate(
  candidate: Candidate | undefined,
): MineruProjectedAnnotationRow | undefined {
  return (candidate as MineruReviewCandidate | undefined)?.mineruAnnotation;
}
