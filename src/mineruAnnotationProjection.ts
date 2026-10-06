import * as path from "path";
import {
  mineruAnnotationReferenceKey,
  mineruPageAnnotationKey,
  type MineruAnnotationTableRow,
  type MineruJsonFootnoteFacts,
  type MineruJsonLocator,
  type MineruMarkdownLocator,
} from "./mineruAnnotationContract";
import type {
  MineruJsonFootnoteMarkdownMapResult,
  MineruReferenceMarkdownMatch,
} from "./mineruAnnotationMarkdownMap";

export interface MineruProjectedAnnotationRow extends MineruAnnotationTableRow {
  /** Stable across chapter exports; documentKey keeps PDF-local page numbers isolated. */
  rowId: string;
  documentKey: string;
  sourceJsonPath: string;
  sourceMarkdownPath: string;
  json: MineruJsonLocator;
  referenceOccurrence?: number;
  bodyOccurrence?: number;
  /** A shared body can point to more than one reference. */
  navigationTargets: MineruMarkdownLocator[];
  /** Ambiguous Markdown matches remain visible for manual review. */
  candidates: MineruReferenceMarkdownMatch["candidates"];
}

export interface MineruAnnotationProjection {
  byChapter: Record<string, MineruProjectedAnnotationRow[]>;
  unassigned: MineruProjectedAnnotationRow[];
  totalRows: number;
}

/** Project all evidence without assigning a missing or ambiguous locator by guesswork. */
export function projectMineruAnnotationRows(
  root: string,
  mapped: readonly MineruJsonFootnoteMarkdownMapResult[],
): MineruAnnotationProjection {
  const byChapter: Record<string, MineruProjectedAnnotationRow[]> = {};
  const unassigned: MineruProjectedAnnotationRow[] = [];
  let totalRows = 0;
  for (const document of mapped) {
    const facts: MineruJsonFootnoteFacts = document.facts;
    const refMatches = new Map<string, MineruReferenceMarkdownMatch>();
    for (const match of document.references) {
      const key = mineruAnnotationReferenceKey(
        facts.documentKey, match.pageIndex, match.annotationNumber, match.occurrence,
      );
      refMatches.set(key, match);
    }

    for (const [index, group] of facts.annotations.entries()) {
      const annotation = document.annotations[index];
      if (!annotation ||
          annotation.pageIndex !== group.pageIndex ||
          annotation.annotationNumber !== group.annotationNumber) {
        throw new Error("MinerU annotation projection facts/map order mismatch.");
      }
      const annotationKey = mineruPageAnnotationKey(
        facts.documentKey, group.pageIndex, group.annotationNumber,
      );
      const locatedReferences = annotation.references
        .map((ref) => ref.markdown)
        .filter((ref): ref is MineruMarkdownLocator => Boolean(ref));
      const singleChapter = locatedReferences.length === group.references.length
        && locatedReferences.length > 0
        && locatedReferences.every((ref) =>
          ref.chapterPath === locatedReferences[0].chapterPath)
        ? locatedReferences[0].chapterPath
        : undefined;

      for (const ref of annotation.references) {
        const refKey = mineruAnnotationReferenceKey(
          facts.documentKey, group.pageIndex, group.annotationNumber, ref.occurrence,
        );
        const match = refMatches.get(refKey);
        const row: MineruProjectedAnnotationRow = {
          rowId: refKey,
          annotationKey,
          documentKey: facts.documentKey,
          sourceJsonPath: relativeOrOriginal(root, facts.sourceJsonPath),
          sourceMarkdownPath: relativeOrOriginal(root, facts.sourceMarkdownPath),
          pageIndex: group.pageIndex,
          pageNumber: group.pageIndex + 1,
          annotationNumber: group.annotationNumber,
          lineType: "注释引用",
          markdownLineIndex: ref.markdown?.lineIndex,
          preview: ref.markdown?.anchorText ?? ref.context,
          status: annotation.status,
          json: ref.json,
          referenceOccurrence: ref.occurrence,
          navigationTarget: ref.markdown,
          navigationTargets: ref.markdown ? [ref.markdown] : [],
          candidates: match?.candidates ?? [],
        };
        addRow(row, ref.markdown?.chapterPath);
        totalRows += 1;
      }

      for (const [bodyIndex, body] of group.bodies.entries()) {
        const bodyIsLocated = singleChapter !== undefined;
        const targets = bodyIsLocated ? locatedReferences : [];
        const row: MineruProjectedAnnotationRow = {
          rowId: annotationKey + ":b" + (bodyIndex + 1),
          annotationKey,
          documentKey: facts.documentKey,
          sourceJsonPath: relativeOrOriginal(root, facts.sourceJsonPath),
          sourceMarkdownPath: relativeOrOriginal(root, facts.sourceMarkdownPath),
          pageIndex: group.pageIndex,
          pageNumber: group.pageIndex + 1,
          annotationNumber: group.annotationNumber,
          lineType: "注释正文",
          markdownLineIndex: targets[0]?.lineIndex,
          preview: body.raw,
          status: annotation.status,
          json: body.json,
          bodyOccurrence: bodyIndex + 1,
          navigationTarget: targets[0],
          navigationTargets: targets,
          candidates: [],
        };
        addRow(row, singleChapter);
        totalRows += 1;
      }
    }
  }
  for (const rows of Object.values(byChapter)) rows.sort(compareRows);
  unassigned.sort(compareRows);
  return { byChapter, unassigned, totalRows };

  function addRow(row: MineruProjectedAnnotationRow, chapterPath?: string): void {
    if (!chapterPath) {
      unassigned.push(row);
      return;
    }
    (byChapter[chapterPath] ??= []).push(row);
  }
}

export function getChapterMineruAnnotationRows(
  projection: MineruAnnotationProjection,
  chapterPath: string,
): MineruProjectedAnnotationRow[] {
  return projection.byChapter[chapterPath] ?? [];
}

function relativeOrOriginal(root: string, filePath: string): string {
  const relative = path.relative(root, filePath);
  return relative.startsWith("..") || path.isAbsolute(relative)
    ? filePath
    : relative;
}

function compareRows(a: MineruProjectedAnnotationRow, b: MineruProjectedAnnotationRow): number {
  return a.sourceMarkdownPath.localeCompare(b.sourceMarkdownPath, "zh-CN", { numeric: true })
    || a.pageIndex - b.pageIndex
    || a.annotationNumber - b.annotationNumber
    || (a.lineType === "注释引用" ? 0 : 1) - (b.lineType === "注释引用" ? 0 : 1)
    || (a.referenceOccurrence ?? a.bodyOccurrence ?? 0)
      - (b.referenceOccurrence ?? b.bodyOccurrence ?? 0);
}
