import * as assert from "assert";
import { EMBED_REGEX_PRESETS, MODULE_REGEX_DEFAULTS } from "./regexPresets";
import {
  detectEmbedLineType,
  embedRowsFromBlock,
  findEmbedRegions,
  isHtmlTagFragment,
  mergeEmbedScan,
  scanEmbedLines,
  scanRegexMatches,
} from "./scanner";
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

assert.strictEqual(detectEmbedLineType(">"), "嵌入块首");
assert.strictEqual(detectEmbedLineType("FIGURE 11.3 | Valuation Challenges"), "内嵌标题");
assert.strictEqual(detectEmbedLineType("![image](https://example.com/a.jpg)"), "嵌入链接");
assert.strictEqual(detectEmbedLineType("![[local.png]]"), "嵌入链接");
assert.strictEqual(detectEmbedLineType('<figure><img src="a.jpg"></figure>'), "嵌入HTML");
assert.strictEqual(detectEmbedLineType('<div class="callout">note</div>'), "嵌入HTML");
assert.strictEqual(detectEmbedLineType("<https://example.com/a.jpg>"), undefined);
assert.strictEqual(detectEmbedLineType("Ordinary paragraph"), undefined);

assert.deepStrictEqual(
  scanEmbedLines("FIGURE 1.1 | Title\n![image](https://cdn.example/a.jpg)\n").map((row) => row.lineType),
  ["内嵌标题", "嵌入链接"],
);

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
  [91, "嵌入块首", 1],
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
    [1, "嵌入块首", 1],
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
assert.deepStrictEqual(tableRows.map((row) => [row.lineType, row.embedNumber, row.range.line]), [
  ["嵌入块首", 1, 1],
  ["嵌入HTML", 1, 2],
  ["嵌入链接", undefined, 10],
]);
assert.strictEqual(tableRows[1].range.endLine, 7);
assert.ok(tableRows[1].raw.startsWith("<table>"));
assert.ok(tableRows[1].raw.endsWith("</table>"));

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
  findEmbedRegions(numbered.split("\n")).map((region) => [region.number, region.markerLine, region.contentStart, region.contentEnd]),
  [[1, 0, 1, 1], [2, 3, 4, 5]],
);
assert.deepStrictEqual(
  scanEmbedLines(numbered).map((row) => [row.embedNumber, row.lineType]),
  [
    [1, "嵌入块首"],
    [1, "嵌入链接"],
    [2, "嵌入块首"],
    [2, "嵌入文本"],
    [2, "嵌入链接"],
  ],
);

assert.ok(isHtmlTagFragment("<td>"));
assert.ok(isHtmlTagFragment("</tr>"));
assert.ok(isHtmlTagFragment("<table>"));
assert.ok(!isHtmlTagFragment("<table>\n<tr><td>A</td></tr>\n</table>"));
assert.ok(!isHtmlTagFragment("![image](https://example.com/a.jpg)"));

const tagFragmentPattern = "<\\s*\\/?\\s*[a-zA-Z][a-zA-Z0-9-]*(?:\\s|\\/|>)";
const wideTable = [
  "Intro",
  ">",
  "<table>",
  ...Array.from({ length: 80 }, (_, index) => `<tr><td>cell-${index}</td><td>more</td></tr>`),
  "</table>",
  "",
  "![image](https://example.com/a.jpg)",
].join("\n");
const exploded = scanRegexMatches(wideTable, tagFragmentPattern);
assert.ok(exploded.length > 200, "legacy html-embed regex matches every tag");
const merged = mergeEmbedScan(wideTable, [tagFragmentPattern, "!\\[[^\\]]*\\]\\([^)]*\\)"]);
assert.deepStrictEqual(merged.map((row) => [row.lineType, row.embedNumber]), [
  ["嵌入块首", 1],
  ["嵌入HTML", 1],
  ["嵌入链接", undefined],
]);
assert.ok(!merged.some((row) => isHtmlTagFragment(row.raw)));

assert.ok(!MODULE_REGEX_DEFAULTS["嵌入块"].includes(tagFragmentPattern));
assert.ok(EMBED_REGEX_PRESETS.some((preset) => preset.id === "html-embed"));
assert.ok(!MODULE_REGEX_DEFAULTS["嵌入块"].includes(EMBED_REGEX_PRESETS.find((preset) => preset.id === "html-embed")!.pattern));

const insertedMarker = [
  "In sum, as can be seen in figure 12.1.",
  "",
  ">",
  "FIGURE 12.1 | Valuation Challenges—Mature Businesses",
  "",
  "![image](https://example.com/a.jpg)",
].join("\n");
assert.deepStrictEqual(
  mergeEmbedScan(insertedMarker, ["!\\[[^\\]]*\\]\\([^)]*\\)"]).map((row) => [row.range.line, row.lineType, row.embedNumber]),
  [
    [2, "嵌入块首", 1],
    [3, "内嵌标题", 1],
    [5, "嵌入链接", undefined],
  ],
);

console.log("scanner tests passed");
