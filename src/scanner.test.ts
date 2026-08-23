import * as assert from "assert";
import { detectEmbedLineType, embedRowsFromBlock, findEmbedRegions, scanEmbedLines, scanRegexMatches } from "./scanner";
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

assert.strictEqual(detectEmbedLineType("FIGURE 11.3 | Valuation Challenges"), "内嵌标题");
assert.strictEqual(detectEmbedLineType("![image](https://example.com/a.jpg)"), "嵌入链接");
assert.strictEqual(detectEmbedLineType("![[local.png]]"), "嵌入链接");
assert.strictEqual(detectEmbedLineType('<figure><img src="a.jpg"></figure>'), "嵌入HTML");
assert.strictEqual(detectEmbedLineType('<div class="callout">note</div>'), "嵌入HTML");
assert.strictEqual(detectEmbedLineType("<https://example.com/a.jpg>"), undefined);
assert.strictEqual(detectEmbedLineType("Ordinary paragraph"), undefined);

assert.deepStrictEqual(scanEmbedLines("FIGURE 1.1 | Title\n![image](https://cdn.example/a.jpg)\n").map((row) => row.lineType), []);

const figureBlock: Candidate = {
  id: "block",
  kind: "regex",
  label: "FIGURE 12.2",
  raw: ">\nFIGURE 12.2 | A Numbers-Driven Valuation Story\n![image](https://example.com/a.jpg)",
  preview: "FIGURE 12.2",
  range: { line: 91, start: 0, endLine: 93, end: 40 },
  typeLabel: "章节标题",
};
const split = embedRowsFromBlock(figureBlock);
assert.deepStrictEqual(split.map((row) => [row.range.line, row.lineType, row.embedNumber]), [
  [92, "内嵌标题", 1],
  [93, "嵌入链接", 1],
]);

const chapter = [
  "Intro text",
  ">",
  "FIGURE 1.1 | Title",
  "![image](https://cdn.example/a.jpg)",
  '<iframe src="https://example.com"></iframe>',
  "",
  "Plain sentence.",
].join("\n");
assert.deepStrictEqual(
  scanEmbedLines(chapter).map((row) => [row.range.line, row.lineType, row.embedNumber]),
  [
    [2, "内嵌标题", 1],
    [3, "嵌入链接", 1],
    [4, "嵌入HTML", 1],
  ],
);

const tableDoc = [
  "Before",
  ">",
  "<table>",
  "<tr><td>A</td></tr>",
  "<tr>",
  "<td>B</td>",
  "</tr>",
  "</table>",
  "",
  "After",
  "![image](https://example.com/a.jpg)",
].join("\n");
const tableRows = scanEmbedLines(tableDoc);
assert.strictEqual(tableRows.length, 1, "a table inside a > block is one embed HTML row");
assert.strictEqual(tableRows[0].lineType, "嵌入HTML");
assert.strictEqual(tableRows[0].embedNumber, 1);
assert.strictEqual(tableRows[0].range.line, 2);
assert.strictEqual(tableRows[0].range.endLine, 7);
assert.ok(tableRows[0].raw.startsWith("<table>"));
assert.ok(tableRows[0].raw.endsWith("</table>"));

const numbered = [
  ">",
  "![one](https://example.com/1.jpg)",
  "",
  ">",
  "caption text",
  "![two](https://example.com/2.jpg)",
  "",
].join("\n");
assert.deepStrictEqual(
  findEmbedRegions(numbered.split("\n")).map((region) => [region.number, region.contentStart, region.contentEnd]),
  [[1, 1, 1], [2, 4, 5]],
);
assert.deepStrictEqual(
  scanEmbedLines(numbered).map((row) => [row.embedNumber, row.lineType]),
  [
    [1, "嵌入链接"],
    [2, "嵌入文本"],
    [2, "嵌入链接"],
  ],
);

console.log("scanner tests passed");
