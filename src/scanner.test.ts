import * as assert from "assert";
import { detectImageLineType, imageRowsFromBlock, scanRegexMatches } from "./scanner";
import type { Candidate } from "./types";

const markdown = [
  "Text<sup>1</sup>",
  "",
  "1. Footnote body",
  "",
  "![image](https://example.com/a.jpg)",
].join("\n");

const refs = scanRegexMatches(markdown, "<sup>(\\d+)</sup>");
assert.strictEqual(refs.length, 1);
assert.strictEqual(refs[0].range.line, 0);
assert.strictEqual(refs[0].label, "1");

const bodies = scanRegexMatches(markdown, "^\\s*\\d+\\.\\s+.+");
assert.strictEqual(bodies.length, 1);
assert.strictEqual(bodies[0].range.line, 2);

const images = scanRegexMatches(markdown, "!\\[[^\\]]*\\]\\(https?://[^\\s)]+\\)");
assert.strictEqual(images.length, 1);
assert.strictEqual(images[0].range.line, 4);

assert.strictEqual(detectImageLineType("FIGURE 11.3 | Valuation Challenges"), "图片标题");
assert.strictEqual(detectImageLineType("![image](https://example.com/a.jpg)"), "图片链接");
assert.strictEqual(detectImageLineType('<figure><img src="a.jpg"></figure>'), "图片HTML");
assert.strictEqual(detectImageLineType("Ordinary paragraph"), undefined);

const figureBlock: Candidate = {
  id: "block",
  kind: "regex",
  label: "FIGURE 12.2",
  raw: "FIGURE 12.2 | A Numbers-Driven Valuation Story\n![image](https://example.com/a.jpg)",
  preview: "FIGURE 12.2",
  range: { line: 92, start: 0, endLine: 93, end: 40 },
  typeLabel: "章节标题",
};
const split = imageRowsFromBlock(figureBlock);
assert.deepStrictEqual(split.map((row) => [row.range.line, row.lineType, row.raw.split("\n").length]), [
  [92, "图片标题", 1],
  [93, "图片链接", 1],
]);

console.log("scanner tests passed");
