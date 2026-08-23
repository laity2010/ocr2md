import * as assert from "assert";
import { detectEmbedLineType, embedRowsFromBlock, scanEmbedLines, scanRegexMatches } from "./scanner";
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

const figureBlock: Candidate = {
  id: "block",
  kind: "regex",
  label: "FIGURE 12.2",
  raw: "FIGURE 12.2 | A Numbers-Driven Valuation Story\n![image](https://example.com/a.jpg)",
  preview: "FIGURE 12.2",
  range: { line: 92, start: 0, endLine: 93, end: 40 },
  typeLabel: "章节标题",
};
const split = embedRowsFromBlock(figureBlock);
assert.deepStrictEqual(split.map((row) => [row.range.line, row.lineType, row.raw.split("\n").length]), [
  [92, "内嵌标题", 1],
  [93, "嵌入链接", 1],
]);
assert.deepStrictEqual(split.map((row) => row.typeLabel), ["嵌入块", "嵌入块"]);

const chapter = [
  "Intro text",
  "FIGURE 1.1 | Title",
  "![image](https://cdn.example/a.jpg)",
  '<iframe src="https://example.com"></iframe>',
  "Plain sentence.",
].join("\n");
assert.deepStrictEqual(
  scanEmbedLines(chapter).map((row) => [row.range.line, row.lineType]),
  [
    [1, "内嵌标题"],
    [2, "嵌入链接"],
    [3, "嵌入HTML"],
  ],
);

const tableDoc = [
  "Before",
  "<table>",
  "<tr><td>A</td></tr>",
  "<tr>",
  "<td>B</td>",
  "</tr>",
  "</table>",
  "After",
  "![image](https://example.com/a.jpg)",
].join("\n");
const tableRows = scanEmbedLines(tableDoc);
assert.strictEqual(tableRows.length, 2, "a multi-line table must stay one embed HTML row");
assert.strictEqual(tableRows[0].lineType, "嵌入HTML");
assert.strictEqual(tableRows[0].range.line, 1);
assert.strictEqual(tableRows[0].range.endLine, 6);
assert.ok(tableRows[0].raw.startsWith("<table>"));
assert.ok(tableRows[0].raw.endsWith("</table>"));
assert.strictEqual(tableRows[1].lineType, "嵌入链接");
assert.strictEqual(tableRows[1].range.line, 8);

const tableThenHeading = [
  "<table>",
  "<tr><td>cell</td></tr>",
  "# Next chapter",
].join("\n");
const unclosed = scanEmbedLines(tableThenHeading);
assert.strictEqual(unclosed.length, 1);
assert.strictEqual(unclosed[0].range.endLine, 1);

console.log("scanner tests passed");
