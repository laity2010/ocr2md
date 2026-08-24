import * as assert from "assert";
import { exportByCalibration, formatEmbed, groupEmbeds, obsidianImage } from "./calibrationExport";
import type { Candidate } from "./types";

function row(partial: Partial<Candidate> & Pick<Candidate, "id" | "raw" | "typeLabel" | "lineType">): Candidate {
  return {
    kind: "regex",
    label: partial.raw,
    preview: partial.raw,
    range: partial.range ?? { line: 0, start: 0, end: partial.raw.length },
    ...partial,
  };
}

assert.strictEqual(
  obsidianImage(row({
    id: "img",
    raw: "![image](https://cdn.example/a.jpg)",
    typeLabel: "嵌入块",
    lineType: "嵌入链接",
    localPath: "imgs/a.jpg",
  })),
  "![[imgs/a.jpg]]",
);

assert.strictEqual(
  obsidianImage(row({
    id: "local-img",
    raw: "![alt text](image.png)",
    typeLabel: "嵌入块",
    lineType: "嵌入链接",
    localPath: "imgs/image-20260823-192853-355.png",
  })),
  "![[imgs/image-20260823-192853-355.png]]",
);

const simple = [
  row({ id: "m", raw: ">", typeLabel: "嵌入块", lineType: "嵌入块首", embedNumber: 1, range: { line: 0, start: 0, end: 1 } }),
  row({ id: "t", raw: "FIGURE 1.1 | Title", typeLabel: "嵌入块", lineType: "内嵌标题", embedNumber: 1, range: { line: 1, start: 0, end: 18 } }),
  row({
    id: "i",
    raw: "![image](https://cdn.example/a.jpg)",
    typeLabel: "嵌入块",
    lineType: "嵌入链接",
    embedNumber: 1,
    localPath: "imgs/a.jpg",
    range: { line: 2, start: 0, end: 34 },
  }),
];
assert.strictEqual(
  formatEmbed(groupEmbeds(simple)[0]),
  [">", "FIGURE 1.1 | Title", "内嵌图片链接: ![[imgs/a.jpg]]", "><embed id=01></embed>", "<br>"].join("\n"),
);

const tableRows = [
  row({ id: "m2", raw: ">", typeLabel: "嵌入块", lineType: "嵌入块首", embedNumber: 2, range: { line: 0, start: 0, end: 1 } }),
  row({ id: "t2", raw: "Table 12.2", typeLabel: "嵌入块", lineType: "内嵌标题", embedNumber: 2, range: { line: 1, start: 0, end: 10 } }),
  row({
    id: "tbl",
    raw: "<table>\n<tr><td>A</td></tr>\n</table>",
    typeLabel: "嵌入块",
    lineType: "HTML表",
    embedNumber: 2,
    range: { line: 2, start: 0, endLine: 4, end: 8 },
  }),
];
assert.strictEqual(
  formatEmbed(groupEmbeds(tableRows)[0]),
  [">", "Table 12.2", "><table><tr><td>A</td></tr></table>", "><embed id=02></embed>", "<br>"].join("\n"),
);

const both = [
  row({ id: "m3", raw: ">", typeLabel: "嵌入块", lineType: "嵌入块首", embedNumber: 3, range: { line: 0, start: 0, end: 1 } }),
  row({ id: "t3", raw: "Table 12.2", typeLabel: "嵌入块", lineType: "内嵌标题", embedNumber: 3, range: { line: 1, start: 0, end: 10 } }),
  row({
    id: "img3",
    raw: "![image](https://cdn.example/a.jpg)",
    typeLabel: "嵌入块",
    lineType: "嵌入链接",
    embedNumber: 3,
    localPath: "imgs/a.jpg",
    range: { line: 2, start: 0, end: 34 },
  }),
  row({
    id: "tbl3",
    raw: "<table>\n<tr><td>A</td></tr>\n</table>",
    typeLabel: "嵌入块",
    lineType: "HTML表",
    embedNumber: 3,
    range: { line: 3, start: 0, endLine: 5, end: 8 },
  }),
];
const bothBlock = formatEmbed(groupEmbeds(both)[0]);
assert.ok(bothBlock.includes(">>[! ]- HTML"));
assert.ok(bothBlock.includes(">><table><tr><td>A</td></tr></table>"));
assert.ok(bothBlock.includes("><embed id=03></embed>"));
assert.ok(bothBlock.includes("![[imgs/a.jpg]]"));
assert.ok(!bothBlock.includes("内嵌图片链接:"), "image+HTML table must keep the bare Obsidian image link");
assert.ok(bothBlock.endsWith("\n<br>"));

const withEmbedText = [
  row({ id: "m5", raw: ">", typeLabel: "嵌入块", lineType: "嵌入块首", embedNumber: 5, range: { line: 0, start: 0, end: 1 } }),
  row({ id: "t5", raw: "FIGURE 14.4 | Excess Returns around Earnings Announcements", typeLabel: "嵌入块", lineType: "内嵌标题", embedNumber: 5, range: { line: 1, start: 0, end: 57 } }),
  row({
    id: "i5",
    raw: "![image](https://cdn.example/a.jpg)",
    typeLabel: "嵌入块",
    lineType: "嵌入链接",
    embedNumber: 5,
    localPath: "imgs/xxx.jpg",
    range: { line: 2, start: 0, end: 34 },
  }),
  row({
    id: "text5",
    raw: "Source: D. Craig Nichols and James Whalen",
    typeLabel: "嵌入块",
    lineType: "嵌入文本",
    embedNumber: 5,
    range: { line: 3, start: 0, end: 40 },
  }),
];
assert.strictEqual(
  formatEmbed(groupEmbeds(withEmbedText)[0]),
  [
    ">",
    "FIGURE 14.4 | Excess Returns around Earnings Announcements",
    "内嵌图片链接: ![[imgs/xxx.jpg]]",
    ">",
    "Source: D. Craig Nichols and James Whalen",
    "><embed id=05></embed>",
    "<br>",
  ].join("\n"),
);

const source = [
  "## Heading",
  "",
  "See<sup>1</sup> here.",
  ">",
  "FIGURE 1.1 | Title",
  "![image](https://cdn.example/a.jpg)",
  "",
  "Keep this paragraph.",
  "1. Footnote body",
].join("\n");
const exported = exportByCalibration(source, [
  row({ id: "h", raw: "## Heading", typeLabel: "章节标题", lineType: "2 级标题", range: { line: 0, start: 0, end: 10 } }),
  row({ id: "r", raw: "See<sup>1</sup> here.", typeLabel: "注释", lineType: "注释引用", annotationNumber: "1", range: { line: 2, start: 0, end: 20 } }),
  ...simple.map((item) => ({
    ...item,
    range: { ...item.range, line: item.range.line + 3, endLine: item.range.endLine === undefined ? undefined : item.range.endLine + 3 },
  })),
  row({ id: "b", raw: "1. Footnote body", typeLabel: "注释", lineType: "注释正文", annotationNumber: "1", range: { line: 8, start: 0, end: 16 } }),
]);
assert.ok(exported.includes("## Heading\n<br>\n\n"));
assert.ok(exported.includes("See[^1] here.\n<br>\n\n"));
assert.ok(exported.includes("Keep this paragraph.\n<br>\n\n[^1]: Footnote body\n<br>"));
assert.ok(!exported.includes("1. Footnote body"));
assert.ok(exported.endsWith("[^1]: Footnote body\n<br>\n"));
assert.ok(exported.includes("内嵌图片链接: ![[imgs/a.jpg]]"));
assert.ok(exported.includes("><embed id=01></embed>"));
assert.ok(!exported.includes("![image](https://cdn.example/a.jpg)"));

const formattedBlocksSource = [
  "---",
  "ocr2md_chapter_split: true",
  "---",
  "",
  "### Original heading",
  "",
  "First paragraph line one.",
  "First paragraph line two.",
  "",
  "Second paragraph.",
].join("\n");
const formattedBlocks = exportByCalibration(formattedBlocksSource, [
  row({ id: "formatted-h", raw: "### Original heading", typeLabel: "章节标题", lineType: "2 级标题", range: { line: 4, start: 0, end: 20 } }),
]);
assert.strictEqual(
  formattedBlocks,
  [
    "---",
    "ocr2md_chapter_split: true",
    "---",
    "",
    "## Original heading",
    "<br>",
    "",
    "First paragraph line one.",
    "First paragraph line two.",
    "<br>",
    "",
    "Second paragraph.",
    "<br>",
    "",
  ].join("\n"),
);

console.log("calibrationExport tests passed");
