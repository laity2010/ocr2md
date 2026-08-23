import * as assert from "assert";
import { calibrationOf, candidateFromCalibration, splitBlankLineBlocks } from "./atoms";
import { attachScanIdentities, reconcileRows } from "./rowIdentity";
import { candidatesFromSidecar, parseSidecar, serializeSidecar, SIDECAR_SCHEMA_VERSION } from "./sidecar";
import { mergeEmbedScan } from "./scanner";
import type { Candidate, ModuleName } from "./types";

const doc = [
  "# Title",
  "",
  "Paragraph one.",
  "",
  ">",
  "FIGURE 12.1 | Challenges",
  "",
  "![image](https://example.com/a.jpg)",
].join("\n");

assert.deepStrictEqual(
  splitBlankLineBlocks(doc).map((block) => [block.range.line, block.raw.split("\n")[0]]),
  [
    [0, "# Title"],
    [2, "Paragraph one."],
    [4, ">"],
    [7, "![image](https://example.com/a.jpg)"],
  ],
);

const context = { moduleName: "嵌入块" as ModuleName, sourcePath: "/work/chapter.md" };
const scanned = attachScanIdentities(mergeEmbedScan(doc, []), doc, context);
assert.deepStrictEqual(
  scanned.map((row) => [row.range.line, row.lineType, row.embedNumber]),
  [
    [4, "嵌入块首", 1],
    [5, "内嵌标题", 1],
    [7, "嵌入链接", undefined],
  ],
);

const title = scanned.find((row) => row.lineType === "内嵌标题")!;
const saved = serializeSidecar("/work/chapter.md", scanned, []);
assert.strictEqual(saved.schemaVersion, SIDECAR_SCHEMA_VERSION);
assert.ok(saved.annotations.every((item) => item.atomId));
assert.ok(!("line" in saved.annotations[0]));

const loaded = candidatesFromSidecar(saved);
assert.ok(loaded.rows.every((row) => row.rangeUntrusted));
const rejoined = reconcileRows(loaded.rows, scanned, doc);
assert.strictEqual(rejoined.find((row) => row.lineType === "内嵌标题")?.range.line, 5);
assert.strictEqual(rejoined.find((row) => row.lineType === "内嵌标题")?.atomId, title.atomId);
assert.strictEqual(rejoined.find((row) => row.lineType === "嵌入块首")?.range.line, 4);

const v3 = {
  schemaVersion: 3,
  sourceFile: "/work/chapter.md",
  rows: scanned.map((row) => ({
    ...calibrationOf(row),
    id: row.id,
    line: row.range.line,
    start: row.range.start,
    end: row.range.end,
    typeLabel: row.lineType === "嵌入链接" ? "图片" : row.typeLabel,
    lineType: row.lineType === "嵌入链接" ? "图片链接" : row.lineType,
  })),
  annotationPairs: [],
};
const migrated = parseSidecar(v3);
assert.ok(migrated.annotations.some((item) => item.typeLabel === "嵌入块" && item.lineType === "嵌入链接"));
const migratedRows = candidatesFromSidecar(v3).rows;
const migratedJoin = reconcileRows(migratedRows, scanned, doc);
assert.deepStrictEqual(
  migratedJoin.map((row) => [row.range.line, row.lineType]),
  scanned.map((row) => [row.range.line, row.lineType]),
);

const stub = candidateFromCalibration(calibrationOf({
  ...title,
  lineType: "内嵌标题",
  isWorkingCorrection: true,
}));
assert.strictEqual(stub.rangeUntrusted, true);
assert.strictEqual(stub.range.line, 0);
const afterInsert = [
  "INTRO",
  "# Title",
  "",
  "Paragraph one.",
  "",
  ">",
  "FIGURE 12.1 | Challenges",
  "",
  "![image](https://example.com/a.jpg)",
].join("\n");
const scannedAfter = attachScanIdentities(mergeEmbedScan(afterInsert, []), afterInsert, context);
const kept = reconcileRows(
  scanned.map((row) => row.lineType === "内嵌标题" ? { ...row, lineType: "内嵌标题", isWorkingCorrection: true } : row),
  scannedAfter,
  afterInsert,
);
assert.strictEqual(kept.find((row) => row.lineType === "内嵌标题")?.range.line, 6);
assert.strictEqual(kept.find((row) => row.lineType === "内嵌标题")?.isWorkingCorrection, true);
assert.strictEqual(kept.find((row) => row.lineType === "嵌入块首")?.range.line, 5);

const twoMarkers = attachScanIdentities(
  mergeEmbedScan(">\nA\n\n>\nB\n", []),
  ">\nA\n\n>\nB\n",
  context,
);
const starts = twoMarkers.filter((row) => row.lineType === "嵌入块首");
assert.strictEqual(starts.length, 2);
assert.notStrictEqual(starts[0].atomId, starts[1].atomId);

const dummy: Candidate = {
  id: "x",
  kind: "regex",
  label: "x",
  raw: "x",
  preview: "x",
  range: { line: 1, start: 0, end: 1 },
  typeLabel: "章节标题",
};
assert.strictEqual(calibrationOf(dummy).atomId, "x");

console.log("atoms tests passed");
