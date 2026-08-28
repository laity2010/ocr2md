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

const annotationResult = app.refreshAnnotation({
  baselineText: source,
  workingText: working,
  sourcePath,
  workingPath,
  sourceLabel: sidecar.rows.find((row) => row.sourceLabel)?.sourceLabel ?? "chapters/01 Buffett’s Alpha/01 Buffett’s Alpha.md",
  patterns: splitPatterns(MODULE_REGEX_DEFAULTS["注释"] ?? ""),
});
assert.deepStrictEqual(
  countByType(annotationResult.rows),
  countByType(sidecar.rows),
  "platform-independent annotation refresh must preserve the real reviewed module/line-type counts",
);
assert.strictEqual(
  annotationResult.annotationPairs.length,
  sidecar.annotationPairs.length,
  "annotation refresh must rebuild the same number of reviewed pairs",
);
assert.deepStrictEqual(
  annotationResult.annotationPairs.map((pair) => [pair.pairId, pair.status]),
  sidecar.annotationPairs.map((pair) => [pair.pairId, pair.status]),
  "annotation refresh must preserve pair identities and statuses",
);
const firstRef = annotationResult.rows.find((row) => row.typeLabel === "注释" && row.lineType === "注释引用" && row.annotationNumber === "1");
assert.ok(firstRef, "real fixture must retain annotation reference 1");
const cleared = app.setAnnotationNumber(firstRef!.id, "");
assert.strictEqual(
  cleared.rows.find((row) => row.id === firstRef!.id)?.annotationNumber,
  undefined,
  "application must own manual annotation-number edits",
);
const restored = app.setAnnotationNumber(firstRef!.id, "1");
assert.ok(restored.annotationPairs.some((pair) => pair.number === "1" && pair.refCandidateId === firstRef!.id), "restoring a number must rebuild its pair");
const corrected = app.annotationWorkingText(working);
assert.ok(corrected.includes("[^1]"), "annotation working text must convert reviewed references to Markdown footnotes");
assert.ok(corrected.includes("[^10]:"), "annotation working text must convert reviewed note bodies to Markdown footnotes");

const embedResult = app.refreshEmbed({
  baselineText: source,
  workingText: working,
  sourcePath,
  workingPath,
  sourceLabel: sidecar.rows.find((row) => row.sourceLabel)?.sourceLabel ?? "chapters/01 Buffett’s Alpha/01 Buffett’s Alpha.md",
  patterns: splitPatterns(MODULE_REGEX_DEFAULTS["嵌入块"] ?? ""),
});
assert.deepStrictEqual(
  countByType(embedResult.rows),
  countByType(sidecar.rows),
  "platform-independent embed refresh must preserve the real reviewed module/line-type counts",
);
assert.strictEqual(
  embedResult.rows.filter((row) => row.typeLabel === "嵌入块" && row.lineType === "已忽略").length,
  12,
  "reviewed ignored embed rows must survive refresh",
);
assert.strictEqual(
  embedResult.rows.filter((row) => row.typeLabel === "嵌入块" && row.lineType === "已删除").length,
  2,
  "reviewed deleted embed rows must survive refresh",
);
assert.ok(
  embedResult.rows.filter((row) => row.typeLabel === "嵌入块" && row.lineType === "嵌入块首").every((row) => row.embedNumber != null),
  "live embed block starts must be renumbered in the application layer",
);
assert.ok(
  embedResult.rows.filter((row) => row.typeLabel === "嵌入块" && row.lineType === "已忽略").every((row) => row.embedNumber == null),
  "ignored embed rows must stay outside embed numbering",
);

const breakResult = app.refreshIllegalLineBreak({ workingText: working, sourcePath, workingPath });
assert.deepStrictEqual(
  countByType(breakResult.rows),
  countByType(sidecar.rows),
  "platform-independent illegal-line-break refresh must preserve the real reviewed decisions",
);
assert.strictEqual(breakResult.rows.filter((row) => row.typeLabel === "非法断行" && row.lineType === "合并").length, 6);
assert.strictEqual(breakResult.rows.filter((row) => row.typeLabel === "非法断行" && row.lineType === "已忽略").length, 3);

const manualAddApp = new ChapterReviewApplication({ rows: sidecar.rows, annotationPairs: sidecar.annotationPairs });
const manualAnnotation = manualAddApp.addManualReviewLine({
  moduleName: "注释",
  documentText: "Alpha <sup>99</sup> text.\n99. Added note.",
  lineText: "99. Added note.",
  hintLine: 1,
  sourcePath: "/ws/chapters/01/01.md",
  workingPath: "/ws/chapters/01/01.working.md",
});
assert.strictEqual(manualAnnotation.row.lineType, "注释正文");
assert.strictEqual(manualAnnotation.row.annotationNumber, "99");
assert.strictEqual(manualAnnotation.row.isWorkingCorrection, true);
assert.ok(manualAnnotation.annotationPairs.some((pair) => pair.number === "99" && pair.status === "待补引用"));

const embedText = ">\ncaption\n![](local.png)";
const manualEmbedApp = new ChapterReviewApplication({ rows: [], annotationPairs: [] });
const embedStart = manualEmbedApp.addManualReviewLine({
  moduleName: "嵌入块", documentText: embedText, lineText: ">", hintLine: 0,
  sourcePath: "/ws/chapters/01/01.md", workingPath: "/ws/chapters/01/01.working.md",
});
assert.strictEqual(embedStart.row.lineType, "嵌入块首");
assert.strictEqual(embedStart.row.embedNumber, 1);
const restoredState = new ChapterReviewApplication({
  rows: [{ ...embedStart.row, lineType: "已忽略", embedNumber: undefined }], annotationPairs: [],
});
const restoredEmbed = restoredState.addManualReviewLine({
  moduleName: "嵌入块", documentText: embedText, lineText: ">", hintLine: 0,
  sourcePath: "/ws/chapters/01/01.md", workingPath: "/ws/chapters/01/01.working.md",
});
assert.strictEqual(restoredEmbed.rows.length, 1, "manual add must reuse an existing ignored review row");
assert.strictEqual(restoredEmbed.row.lineType, "嵌入块首");
assert.strictEqual(restoredEmbed.row.embedNumber, 1);

const manualText = "First complete sentence.\n\nSecond complete sentence.";
const manualApp = new ChapterReviewApplication({ rows: [], annotationPairs: [] });
const manual = manualApp.markIllegalLineBreak({
  workingText: manualText,
  sourcePath: "/ws/chapters/01/01.md",
  workingPath: "/ws/chapters/01/01.working.md",
  cursorLine: 0,
});
assert.ok(manual, "application must support a human-added line break even when the automatic scan would not select it");
assert.strictEqual(manual?.row.lineType, "合并");
assert.strictEqual(manual?.row.breakReason, "人工加入");
assert.strictEqual(manual?.row.isWorkingCorrection, true);
const manualAgain = manualApp.markIllegalLineBreak({
  workingText: manualText,
  sourcePath: "/ws/chapters/01/01.md",
  workingPath: "/ws/chapters/01/01.working.md",
  cursorLine: 1,
});
assert.strictEqual(manualAgain?.rows.filter((row) => row.typeLabel === "非法断行").length, 1, "marking the same boundary twice must reuse the review row");

const boundaryBaseline = ["# One", "First body.", "# Two", "Second body."].join("\n");
const boundaryWorking = ["# One", "First body edited.", "# Inserted", "Inserted body.", "# Two", "Second body."].join("\n");
const boundaryApp = new ChapterReviewApplication({ rows: [], annotationPairs: [] });
const boundary = boundaryApp.refreshChapterBoundary({
  baselineText: boundaryBaseline,
  workingText: boundaryWorking,
  workingPath: "/ws/.ocr2md-merged.working.md",
  sourceLabel: ".ocr2md-merged.working.md",
});
const boundaryHeadings = boundary.rows.filter((row) => row.typeLabel === "章节定界" && row.lineType === "1 级标题");
assert.strictEqual(boundaryHeadings.length, 3, "chapter-boundary application must expose every current level-one heading");
assert.ok(boundary.rows.some((row) => row.typeLabel === "章节定界" && row.lineType === "修改"), "chapter-boundary application must expose edited source lines");
const assignedBoundary = boundaryApp.assignChapterFiles(boundaryHeadings.map((row) => row.id), "sequence", "01");
assert.strictEqual(assignedBoundary.ok, true, "chapter-boundary numbering must live in the application layer");
if (assignedBoundary.ok) {
  assert.deepStrictEqual(
    boundaryHeadings.map((row) => assignedBoundary.rows.find((candidate) => candidate.id === row.id)?.chapterFile),
    ["01 One.md", "02 Inserted.md", "03 Two.md"],
  );
}
const boundarySegments = boundaryApp.chapterBoundarySegments(boundaryWorking);
assert.deepStrictEqual(
  boundarySegments.map((segment) => [segment.chapterFile, segment.startLine, segment.endLine]),
  [["01 One.md", 0, 2], ["02 Inserted.md", 2, 4], ["03 Two.md", 4, 6]],
  "host-independent chapter segmentation must follow the reviewed heading assignments",
);

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
