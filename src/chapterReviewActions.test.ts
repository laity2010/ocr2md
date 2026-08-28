import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import {
  applyAnnotationNumber,
  applyHeadingLineTypeToText,
  applyRowsLineType,
  rebuildAnnotationReviewState,
} from "./chapterReviewActions";
import { candidatesFromSidecar } from "./sidecar";
import type { Candidate, ModuleName } from "./types";

const fixtureRoot = path.join(process.cwd(), "test-fixtures", "buffetts-alpha");
const source = fs.readFileSync(path.join(fixtureRoot, "source.md"), "utf8");
const working = fs.readFileSync(path.join(fixtureRoot, "working.md"), "utf8");
const sidecar = JSON.parse(fs.readFileSync(path.join(fixtureRoot, "sidecar.json"), "utf8")) as unknown;
const parsed = candidatesFromSidecar(sidecar);
const rows = parsed.rows;

// The fixture is a frozen copy of a chapter that was reviewed manually in the real project.
assert.ok(source.includes("# Andrea Frazzini, David Kabiller, CFA, and Lasse Heje Pedersen"));
assert.ok(working.includes("\nAndrea Frazzini, David Kabiller, CFA, and Lasse Heje Pedersen\n"));
assert.ok(!working.includes("# Andrea Frazzini, David Kabiller, CFA, and Lasse Heje Pedersen"));
assert.ok(source.includes("M<sup>uch</sup> <sup>has</sup> <sup>been</sup>"), "source fixture must retain the OCR corruption");
assert.ok(
  working.includes("Much has been said and written about Warren Buffett and his investment style"),
  "working fixture must retain the human OCR/content correction",
);
assert.ok(source.indexOf("## Notes") < source.indexOf("## Editor’s Note"));
assert.ok(working.indexOf("## Editor’s Note") < working.indexOf("## Notes"), "working fixture must retain the human move/reorder");

const expectedModuleCounts: Partial<Record<ModuleName, number>> = {
  "章节标题": 117,
  "注释": 21,
  "嵌入块": 65,
  "非法断行": 9,
};
for (const [moduleName, expected] of Object.entries(expectedModuleCounts)) {
  assert.strictEqual(rows.filter((row) => row.typeLabel === moduleName).length, expected, `${moduleName} fixture count changed`);
}
const expectedLineTypeCounts: Record<string, number> = {
  "章节标题::1 级标题": 1,
  "章节标题::2 级标题": 9,
  "章节标题::非标题": 106,
  "章节标题::已删除": 1,
  "注释::注释引用": 10,
  "注释::注释正文": 10,
  "注释::已删除": 1,
  "嵌入块::嵌入块首": 11,
  "嵌入块::内嵌标题": 10,
  "嵌入块::嵌入链接": 11,
  "嵌入块::HTML表": 7,
  "嵌入块::嵌入文本": 12,
  "嵌入块::已忽略": 12,
  "嵌入块::已删除": 2,
  "非法断行::合并": 6,
  "非法断行::已忽略": 3,
};
const actualLineTypeCounts: Record<string, number> = {};
for (const row of rows) {
  const key = `${row.typeLabel}::${row.lineType}`;
  actualLineTypeCounts[key] = (actualLineTypeCounts[key] ?? 0) + 1;
}
assert.deepStrictEqual(actualLineTypeCounts, expectedLineTypeCounts, "human-reviewed module decisions changed");

const author = rows.find((row) =>
  row.typeLabel === "章节标题"
  && row.raw === "Andrea Frazzini, David Kabiller, CFA, and Lasse Heje Pedersen");
assert.ok(author, "reviewed author row missing");
assert.strictEqual(author.lineType, "非标题");
assert.strictEqual(author.chapterBoundaryState, "modified");
assert.strictEqual(author.baselinePreview, "# Andrea Frazzini, David Kabiller, CFA, and Lasse Heje Pedersen");

const dataSources = rows.find((row) => row.typeLabel === "章节标题" && row.raw === "## Data Sources");
assert.ok(dataSources, "reviewed Data Sources heading missing");
const promoted = applyHeadingLineTypeToText(working, [dataSources], "3 级标题");
assert.ok(promoted.includes("\n### Data Sources\n"), "heading-level action must be replayable without VS Code APIs");

const ignoredEmbed = rows.find((row) => row.typeLabel === "嵌入块" && row.lineType === "已忽略");
assert.ok(ignoredEmbed, "fixture must contain a manually ignored embed candidate");
const embedBefore: Candidate[] = rows.map((row) => row.id === ignoredEmbed.id ? { ...row, lineType: "嵌入文本" } : row);
const embedAfter = applyRowsLineType(embedBefore, [ignoredEmbed.id], "已忽略", working, {
  sourcePath: ignoredEmbed.sourcePath,
  workingPath: ignoredEmbed.workingCopyPath,
});
assert.strictEqual(embedAfter.find((row) => row.id === ignoredEmbed.id)?.lineType, "已忽略");

const ignoredBreak = rows.find((row) => row.typeLabel === "非法断行" && row.lineType === "已忽略");
assert.ok(ignoredBreak, "fixture must contain a manually ignored illegal-line-break candidate");
const breakBefore = rows.map((row) => row.id === ignoredBreak.id ? { ...row, lineType: "合并" } : row);
const breakAfter = applyRowsLineType(breakBefore, [ignoredBreak.id], "已忽略", working);
assert.strictEqual(breakAfter.find((row) => row.id === ignoredBreak.id)?.lineType, "已忽略");

const annotation = rows.find((row) => row.typeLabel === "注释" && row.lineType === "注释引用" && row.annotationNumber);
assert.ok(annotation?.annotationNumber, "fixture must contain a reviewed annotation number");
const originalNumber = annotation.annotationNumber;
const annotationState = rebuildAnnotationReviewState(rows, parsed.annotationPairs);
const cleared = applyAnnotationNumber(annotationState, annotation.id, "");
assert.strictEqual(cleared.rows.find((row) => row.id === annotation.id)?.annotationNumber, undefined);
const restored = applyAnnotationNumber(cleared, annotation.id, originalNumber);
assert.strictEqual(restored.rows.find((row) => row.id === annotation.id)?.annotationNumber, originalNumber);
assert.strictEqual(restored.rows.find((row) => row.id === annotation.id)?.annotationNumberSource, "manual");

console.log("chapterReviewActions tests passed");
