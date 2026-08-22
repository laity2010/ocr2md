import * as assert from "assert";
import { buildChapterBoundarySegments, mergeSequenceMarkdown, scanChapterBoundaryLines } from "./chapterBoundary";

assert.strictEqual(
  mergeSequenceMarkdown([
    { path: "00010.md", text: "ten" },
    { path: "00002.md", text: "two" },
  ]),
  "twoten",
);

const rows = scanChapterBoundaryLines(
  "# One\nbody\n# Two\nold\nremoved\n",
  "# One\nbody changed\n# Two\nnew\n",
);
assert.deepStrictEqual(
  rows.map((row) => [row.line, row.state, row.text]),
  [
    [0, "heading", "# One"],
    [1, "modified", "body changed"],
    [2, "heading", "# Two"],
    [3, "modified", "new"],
    [4, "deleted", "removed"],
  ],
);

const addedHeading = scanChapterBoundaryLines("body\n", "# Added\nbody\n");
assert.deepStrictEqual(addedHeading.map((row) => [row.state, row.text]), [["added", "# Added"]]);

const unchangedHeadingLevels = [
  "# Level 1",
  "## Level 2",
  "### Level 3",
  "#### Level 4",
  "##### Level 5",
  "###### Level 6",
  "body",
].join("\n");
assert.deepStrictEqual(
  scanChapterBoundaryLines(unchangedHeadingLevels, unchangedHeadingLevels)
    .map((row) => [row.state, row.text]),
  [["heading", "# Level 1"]],
);

assert.deepStrictEqual(
  buildChapterBoundarySegments([
    { line: 4, chapterFile: "01 First.md" },
    { line: 10, chapterFile: "02 Second.md" },
  ], 16),
  [
    { chapterFile: "01 First.md", startLine: 0, endLine: 10 },
    { chapterFile: "02 Second.md", startLine: 10, endLine: 16 },
  ],
);
assert.throws(
  () => buildChapterBoundarySegments([
    { line: 1, chapterFile: "01 First.md" },
    { line: 5, chapterFile: "02 Second.md" },
    { line: 9, chapterFile: "01 First.md" },
  ], 12),
  /不连续/,
);

console.log("chapterBoundary tests passed");
