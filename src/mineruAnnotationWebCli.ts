import * as path from "path";
import { loadMineruProjectAnnotationSourceMap } from "./mineruAnnotationSourceMap";
import type { MineruProjectedAnnotationRow } from "./mineruAnnotationProjection";
import { discoverMineruSourceFiles } from "./mineruSourceDiscovery";

export interface MineruWebChapterAnnotations {
  available: boolean;
  chapterId: string;
  rows: MineruProjectedAnnotationRow[];
  unassignedRows: MineruProjectedAnnotationRow[];
  totalRows: number;
  unassignedCount: number;
  issues: Record<string, number>;
  references: {
    total: number;
    matched: number;
    missing: number;
    ambiguous: number;
  };
}

export function readMineruChapterAnnotations(
  projectRoot: string,
  chapterId: string,
): MineruWebChapterAnnotations {
  const empty: MineruWebChapterAnnotations = {
    available: false,
    chapterId,
    rows: [],
    unassignedRows: [],
    totalRows: 0,
    unassignedCount: 0,
    issues: {},
    references: { total: 0, matched: 0, missing: 0, ambiguous: 0 },
  };
  if (!discoverMineruSourceFiles(projectRoot).jsonPaths.length) return empty;
  const map = loadMineruProjectAnnotationSourceMap(projectRoot).sourceMap;
  // No verified JSON ↔ MinerU Markdown pair: don't replace the legacy table.
  if (!map.documents.length) {
    throw new Error(
      "MinerU JSON 存在，但无法唯一配对 Markdown：" +
      map.issues.filter((issue) => issue.type === "pairing" ||
        issue.type === "unpaired-json" || issue.type === "load-error")
        .map((issue) => issue.reason).join("；"),
    );
  }
  const chapter = map.chapters.find((entry) => entry.chapterId === chapterId);
  if (!chapter) {
    throw new Error("MinerU source-map chapter missing: " + chapterId);
  }
  const issues: Record<string, number> = {};
  for (const item of map.issues) {
    issues[item.type] = (issues[item.type] ?? 0) + 1;
  }
  return {
    ...empty,
    available: true,
    rows: chapter.rows,
    unassignedRows: map.unassignedRows,
    totalRows: map.totalRows,
    unassignedCount: map.unassignedRows.length,
    issues,
    references: map.references,
  };
}

// Launched only with server-validated project root and chapter ID.
// Nothing in this entry point can write to the vault or existing sidecars.
if (require.main === module) {
  try {
    const root = process.argv[2];
    const chapterId = process.argv[3];
    if (!root || !chapterId) throw new Error("project root and chapter ID required");
    process.stdout.write(JSON.stringify(readMineruChapterAnnotations(
      path.resolve(root), chapterId,
    )));
  } catch (error) {
    process.stderr.write(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
