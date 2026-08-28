import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { ChapterReviewApplication } from "./chapterReviewApplication";
import { candidatesFromSidecar } from "./sidecar";
import { MODULE_REGEX_DEFAULTS } from "./regexPresets";
import type { Candidate } from "./types";

const fixtureRoot = path.resolve(__dirname, "../test-fixtures/buffetts-alpha");
const source = fs.readFileSync(path.join(fixtureRoot, "source.md"), "utf8");
const working = fs.readFileSync(path.join(fixtureRoot, "working.md"), "utf8");
const saved = JSON.parse(fs.readFileSync(path.join(fixtureRoot, "sidecar.json"), "utf8"));
const sidecar = candidatesFromSidecar(saved);
const sourcePath = sidecar.sourceFile!;
const workingPath = sidecar.rows.find((row) => row.workingCopyPath)?.workingCopyPath!;
assert.ok(sourcePath && workingPath, "fixture must carry original/working paths from real review state");

const app = new ChapterReviewApplication({ rows: sidecar.rows, annotationPairs: sidecar.annotationPairs });
const result = app.refreshChapterTitle({
  baselineText: source,
  workingText: working,
  sourcePath,
  workingPath,
  sourceLabel: sidecar.rows.find((row) => row.sourceLabel)?.sourceLabel ?? "chapters/01 Buffett’s Alpha/01 Buffett’s Alpha.md",
  embedPatterns: splitPatterns(MODULE_REGEX_DEFAULTS["嵌入块"] ?? ""),
});

assert.strictEqual(result.changed, true, "real working copy must remain marked changed from its source");
assert.deepStrictEqual(countByType(result.rows), countByType(sidecar.rows), "chapter-title refresh must preserve the real reviewed module/line-type counts");

const author = result.rows.find((row) => row.typeLabel === "章节标题" && row.raw.includes("Andrea Frazzini, David Kabiller"));
assert.strictEqual(author?.lineType, "非标题", "manual author-line downgrade must survive a platform-independent refresh");
assert.strictEqual(author?.chapterBoundaryState, "modified", "working-copy modification state must survive refresh");

for (const title of ["## Data Sources", "## Bufet’s Track Record", "## Editor’s Note", "## Notes"]) {
  const row = result.rows.find((candidate) => candidate.typeLabel === "章节标题" && candidate.raw === title);
  assert.strictEqual(row?.lineType, "2 级标题", `reviewed heading must survive refresh: ${title}`);
}

assert.strictEqual(
  result.rows.filter((row) => row.typeLabel === "非法断行" && row.lineType === "合并").length,
  sidecar.rows.filter((row) => row.typeLabel === "非法断行" && row.lineType === "合并").length,
  "refreshing chapter titles must not mutate another review module",
);
assert.strictEqual(app.snapshot().rows, result.rows, "application must retain the new review state after refresh");

console.log("chapterReviewApplication tests passed");

function splitPatterns(value: string): string[] {
  return value.split(/^\s*---\s*$/m).map((item) => item.trim()).filter(Boolean);
}

function countByType(rows: Candidate[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const key = `${row.typeLabel ?? ""}::${row.lineType ?? ""}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}
