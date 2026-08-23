import * as assert from "assert";
import {
  attachLineIdentity,
  attachScanIdentities,
  FILE_END_ANCHOR,
  FILE_START_ANCHOR,
  hashText,
  locateCandidate,
  reconcileRows,
  relocateRows,
} from "./rowIdentity";
import type { Candidate, ModuleName } from "./types";

const context = { moduleName: "注释" as ModuleName, sourcePath: "/work/chapter.md" };

function candidate(raw: string, line: number, extra: Partial<Candidate> = {}): Candidate {
  return {
    id: "temp",
    kind: "regex",
    label: raw,
    raw,
    preview: raw,
    range: { line, start: extra.range?.start ?? 0, end: extra.range?.end ?? raw.length, endLine: extra.range?.endLine },
    typeLabel: extra.typeLabel ?? "注释",
    ...extra,
  };
}

function scan(doc: string, rows: Array<[string, number]>, moduleName: ModuleName = "注释"): Candidate[] {
  return attachScanIdentities(
    rows.map(([raw, line]) => candidate(raw, line, { typeLabel: moduleName })),
    doc,
    { moduleName, sourcePath: context.sourcePath },
  );
}

const original = ["# Chapter", "alpha", "beta", "gamma"].join("\n");
const originalRows = scan(original, [["alpha", 1], ["beta", 2], ["gamma", 3]]);
assert.strictEqual(originalRows.length, 3);
assert.ok(originalRows[1].rowId?.startsWith("row-"));
assert.ok(originalRows[1].atomId?.startsWith("atom-"));
assert.ok(originalRows[1].anchorPreviousHash);
assert.ok(originalRows[1].anchorNextHash);
assert.strictEqual(originalRows[1].anchorTextHash, hashText("beta"));

const withBlank = ["# Chapter", "alpha", "", "beta", "gamma"].join("\n");
const blankRows = scan(withBlank, [["alpha", 1], ["beta", 3], ["gamma", 4]]);
assert.strictEqual(blankRows[1].rowId, originalRows[1].rowId, "blank lines must not change neighbor fingerprints");
assert.strictEqual(blankRows[1].atomId, originalRows[1].atomId);

const inserted = ["INTRO", "# Chapter", "alpha", "beta", "gamma"].join("\n");
const insertedRows = scan(inserted, [["alpha", 2], ["beta", 3], ["gamma", 4]]);
const afterInsert = reconcileRows(originalRows, insertedRows);
assert.deepStrictEqual(afterInsert.map((row) => row.id), originalRows.map((row) => row.id));
assert.strictEqual(afterInsert.find((row) => row.raw === "beta")?.range.line, 3);
assert.strictEqual(afterInsert.find((row) => row.raw === "beta")?.lineType, originalRows[1].lineType);

const marked = originalRows.map((row) => row.raw === "beta" ? { ...row, lineType: "注释正文" } : row);
const deletedAlpha = ["# Chapter", "beta", "gamma"].join("\n");
const afterDelete = reconcileRows(marked, scan(deletedAlpha, [["beta", 1], ["gamma", 2]]));
assert.strictEqual(afterDelete.find((row) => row.raw === "beta")?.id, marked[1].id);
assert.strictEqual(afterDelete.find((row) => row.raw === "beta")?.lineType, "注释正文");
assert.strictEqual(afterDelete.find((row) => row.raw === "beta")?.range.line, 1);

const moved = ["beta", "# Chapter", "alpha", "gamma"].join("\n");
const afterMove = reconcileRows(originalRows, scan(moved, [["beta", 0], ["alpha", 2], ["gamma", 3]]));
assert.strictEqual(afterMove.find((row) => row.raw === "beta")?.id, originalRows[1].id);
assert.strictEqual(afterMove.find((row) => row.raw === "beta")?.range.line, 0);

const duplicatesDoc = ["head", "same", "same", "tail"].join("\n");
const duplicateRows = scan(duplicatesDoc, [["same", 1], ["same", 2]]);
assert.notStrictEqual(duplicateRows[0].id, duplicateRows[1].id);
assert.notStrictEqual(duplicateRows[0].anchorNextHash, duplicateRows[1].anchorNextHash);
const duplicatesShifted = ["NEW", "head", "same", "same", "tail"].join("\n");
const afterDuplicateShift = reconcileRows(duplicateRows, scan(duplicatesShifted, [["same", 2], ["same", 3]]));
assert.strictEqual(afterDuplicateShift[0].id, duplicateRows[0].id);
assert.strictEqual(afterDuplicateShift[1].id, duplicateRows[1].id);
assert.strictEqual(afterDuplicateShift[0].range.line, 2);
assert.strictEqual(afterDuplicateShift[1].range.line, 3);

const headingDoc = ["# Title", "body"].join("\n");
const headingRows = attachScanIdentities(
  [candidate("# Title", 0, { typeLabel: "章节标题", lineType: "1 级标题" })],
  headingDoc,
  { moduleName: "章节标题", sourcePath: context.sourcePath },
);
headingRows[0].lineType = "2 级标题";
const promotedDoc = ["## Title", "body"].join("\n");
const promotedRows = attachScanIdentities(
  [candidate("## Title", 0, { typeLabel: "章节标题", lineType: "2 级标题" })],
  promotedDoc,
  { moduleName: "章节标题", sourcePath: context.sourcePath },
);
const afterPromote = reconcileRows(headingRows, promotedRows);
assert.strictEqual(afterPromote[0].id, headingRows[0].id);
assert.strictEqual(afterPromote[0].raw, "## Title");
assert.strictEqual(afterPromote[0].lineType, "2 级标题");

const legacy: Candidate[] = [{
  id: "legacy-line-2",
  kind: "regex",
  label: "beta",
  raw: "beta",
  preview: "beta",
  range: { line: 2, start: 0, end: 4 },
  typeLabel: "注释",
  lineType: "注释引用",
}];
const afterLegacy = reconcileRows(legacy, originalRows);
assert.strictEqual(afterLegacy.find((row) => row.raw === "beta")?.id, "legacy-line-2");
assert.ok(afterLegacy.find((row) => row.raw === "beta")?.anchorPreviousHash);

const locatedAfterInsert = locateCandidate(inserted, originalRows[1]);
assert.ok(locatedAfterInsert);
assert.strictEqual(locatedAfterInsert?.line, 3);
assert.strictEqual(locatedAfterInsert?.start, 0);

const relocated = relocateRows(originalRows, inserted);
assert.deepStrictEqual(relocated.map((row) => [row.raw, row.range.line]), [["alpha", 2], ["beta", 3], ["gamma", 4]]);

const firstSame = locateCandidate(duplicatesShifted, duplicateRows[0]);
const secondSame = locateCandidate(duplicatesShifted, duplicateRows[1]);
assert.strictEqual(firstSame?.line, 2);
assert.strictEqual(secondSame?.line, 3);

const locatedHeading = locateCandidate(promotedDoc, headingRows[0]);
assert.strictEqual(locatedHeading?.line, 0);

const gtDoc = ["<table>", ">", "<tr><td>x</td></tr>", "</table>"].join("\n");
const gtRow = candidate(">", 1, { typeLabel: "嵌入块", lineType: "嵌入块首" });
assert.strictEqual(locateCandidate(gtDoc, gtRow)?.line, 1, "embed block start must locate the > line, not a tag");

const fileStart = attachLineIdentity(candidate("# Chapter", 0), original, context);
assert.strictEqual(fileStart.anchorPreviousHash, hashText(FILE_START_ANCHOR));
const fileEnd = attachLineIdentity(candidate("gamma", 3), original, context);
assert.strictEqual(fileEnd.anchorNextHash, hashText(FILE_END_ANCHOR));

const imageDoc = "![image](https://example.com/a.jpg)";
const scannedImage = scan(imageDoc, [["![image](https://example.com/a.jpg)", 0]], "嵌入块");
scannedImage[0].chapterBoundaryState = "heading";
const manualImage = {
  ...scannedImage[0],
  id: "manual-288",
  isWorkingCorrection: true,
  chapterBoundaryState: "added" as const,
};
const afterManualAdd = reconcileRows([manualImage], scannedImage, imageDoc);
assert.strictEqual(afterManualAdd[0].id, "manual-288");
assert.strictEqual(afterManualAdd[0].isWorkingCorrection, true);
assert.strictEqual(
  afterManualAdd[0].chapterBoundaryState,
  "added",
  "right-click add from original must keep 新增 coloring after rescan",
);

const working = originalRows[1];
assert.ok(!working.rowId?.includes("\0"));
assert.notStrictEqual(working.rowId, `row-${working.range.line}`);

console.log("rowIdentity tests passed");
