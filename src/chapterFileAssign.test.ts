import * as assert from "assert";
import {
  assignChapterFiles,
  chapterFileParts,
  recommendedChapterStartNumber,
  titleTextForChapterFile,
} from "./chapterFileAssign";

assert.strictEqual(titleTextForChapterFile("# 12 Valuation and Pricing"), "12 Valuation and Pricing");
assert.strictEqual(titleTextForChapterFile("## A / B: C.md"), "A B C");
assert.strictEqual(titleTextForChapterFile("# Title<sup>1</sup>"), "Title");
assert.strictEqual(titleTextForChapterFile("   "), "未命名章节");

assert.deepStrictEqual(chapterFileParts("11 Valuation.md"), { number: 11, width: 2, title: "Valuation" });
assert.strictEqual(chapterFileParts("Valuation"), undefined);

assert.strictEqual(recommendedChapterStartNumber(["11 Foo.md", "09 Bar.md"]), "12");
assert.strictEqual(recommendedChapterStartNumber([]), "01");

const same = assignChapterFiles({
  mode: "same",
  value: "12",
  rows: [
    { id: "a", raw: "# Valuation Mature" },
    { id: "b", raw: "# Later heading" },
  ],
});
assert.deepStrictEqual(same, {
  ok: true,
  files: {
    a: "12 Valuation Mature.md",
    b: "12 Valuation Mature.md",
  },
});

const sequence = assignChapterFiles({
  mode: "sequence",
  value: "10",
  rows: [
    { id: "a", raw: "# First Chapter" },
    { id: "b", raw: "# Second Chapter" },
  ],
});
assert.deepStrictEqual(sequence, {
  ok: true,
  files: {
    a: "10 First Chapter.md",
    b: "11 Second Chapter.md",
  },
});

const offset = assignChapterFiles({
  mode: "offset",
  value: "+2",
  rows: [
    { id: "a", raw: "# A", chapterFile: "10 A.md" },
    { id: "b", raw: "# B", chapterFile: "11 B.md" },
  ],
});
assert.deepStrictEqual(offset, {
  ok: true,
  files: {
    a: "12 A.md",
    b: "13 B.md",
  },
});

assert.strictEqual(assignChapterFiles({ mode: "same", value: "", rows: [] }).ok, false);
assert.strictEqual(assignChapterFiles({ mode: "offset", value: "2", rows: [{ id: "a", raw: "# A", chapterFile: "10 A.md" }] }).ok, false);
assert.strictEqual(assignChapterFiles({ mode: "sequence", value: "x", rows: [{ id: "a", raw: "# A" }] }).ok, false);

console.log("chapterFileAssign tests passed");
