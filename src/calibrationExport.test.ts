import * as assert from "assert";
import { buildIllegalMergeSpans, exportByCalibration, formatEmbed, groupEmbeds, obsidianImage } from "./calibrationExport";
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

const rowOrderedEmbed = [
  row({ id: "order-image", raw: "![image](https://cdn.example/order.jpg)", typeLabel: "嵌入块", lineType: "嵌入链接", embedNumber: 6, localPath: "imgs/order.jpg", range: { line: 30, start: 0, end: 44 } }),
  row({ id: "order-title", raw: "FIGURE 6 | Ordered", typeLabel: "嵌入块", lineType: "内嵌标题", embedNumber: 6, range: { line: 20, start: 0, end: 18 } }),
  row({ id: "order-text", raw: "Source text appears first.", typeLabel: "嵌入块", lineType: "嵌入文本", embedNumber: 6, range: { line: 10, start: 0, end: 26 } }),
  row({ id: "order-marker", raw: ">", typeLabel: "嵌入块", lineType: "嵌入块首", embedNumber: 6, range: { line: 5, start: 0, end: 1 } }),
];
const rowOrderedBlock = formatEmbed(groupEmbeds(rowOrderedEmbed)[0]);
assert.ok(
  rowOrderedBlock.indexOf("Source text appears first.") < rowOrderedBlock.indexOf("FIGURE 6 | Ordered")
    && rowOrderedBlock.indexOf("FIGURE 6 | Ordered") < rowOrderedBlock.indexOf("内嵌图片链接: ![[imgs/order.jpg]]"),
  "embed export order must follow source line numbers rather than input array order or line type",
);

const htmlBeforeImage = [
  row({ id: "order2-marker", raw: ">", typeLabel: "嵌入块", lineType: "嵌入块首", embedNumber: 7, range: { line: 0, start: 0, end: 1 } }),
  row({ id: "order2-table", raw: "<table><tr><td>A</td></tr></table>", typeLabel: "嵌入块", lineType: "HTML表", embedNumber: 7, range: { line: 1, start: 0, end: 34 } }),
  row({ id: "order2-image", raw: "![image](https://cdn.example/order2.jpg)", typeLabel: "嵌入块", lineType: "嵌入链接", embedNumber: 7, localPath: "imgs/order2.jpg", range: { line: 2, start: 0, end: 45 } }),
];
const htmlBeforeImageBlock = formatEmbed(groupEmbeds(htmlBeforeImage)[0]);
assert.ok(
  htmlBeforeImageBlock.indexOf(">><table><tr><td>A</td></tr></table>") < htmlBeforeImageBlock.indexOf("![[imgs/order2.jpg]]"),
  "HTML/image output must preserve source line order even when HTML appears before the image",
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
assert.ok(exported.includes("## (001) Heading\n<br>\n\n"));
assert.ok(exported.includes("See[^1] here.\n<br>\n\n"));
assert.ok(exported.includes("Keep this paragraph.\n<br>\n\n[^1]: Footnote body\n<br>"));
assert.ok(!exported.includes("1. Footnote body"));
assert.ok(exported.endsWith("[^1]: Footnote body\n<br>\n"));
assert.ok(exported.includes("内嵌图片链接: ![[imgs/a.jpg]]"));
assert.ok(exported.includes("><embed id=01></embed>"));
assert.ok(!exported.includes("![image](https://cdn.example/a.jpg)"));

const ignoredEmbedSource = [
  ">",
  "FIGURE 9.9 | Title",
  "This prose was wrongly captured as embed text.",
  "![image](https://cdn.example/ignored-test.jpg)",
].join("\n");
const ignoredEmbedExport = exportByCalibration(ignoredEmbedSource, [
  row({ id: "ie-marker", raw: ">", typeLabel: "嵌入块", lineType: "嵌入块首", embedNumber: 9, range: { line: 0, start: 0, end: 1 } }),
  row({ id: "ie-title", raw: "FIGURE 9.9 | Title", typeLabel: "嵌入块", lineType: "内嵌标题", embedNumber: 9, range: { line: 1, start: 0, end: 18 } }),
  row({ id: "ie-ignore", raw: "This prose was wrongly captured as embed text.", typeLabel: "嵌入块", lineType: "已忽略", range: { line: 2, start: 0, end: 45 } }),
  row({ id: "ie-image", raw: "![image](https://cdn.example/ignored-test.jpg)", typeLabel: "嵌入块", lineType: "嵌入链接", embedNumber: 9, range: { line: 3, start: 0, end: 47 } }),
]);
assert.ok(ignoredEmbedExport.includes("FIGURE 9.9 | Title"), "active embed rows must still export");
assert.ok(ignoredEmbedExport.includes("This prose was wrongly captured as embed text.\n<br>"), "已忽略 embed rows must return to normal prose output");
assert.ok(!ignoredEmbedExport.includes(">\nThis prose was wrongly captured as embed text."), "已忽略 text must not remain inside the embed block");

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
    "## (001) Original heading",
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

const numberedHeadingSource = [
  "# Top",
  "",
  "### Deep",
  "",
  "## Middle",
].join("\n");
const numberedHeadingExport = exportByCalibration(numberedHeadingSource, [
  row({ id: "nh-3", raw: "## Middle", typeLabel: "章节标题", lineType: "2 级标题", range: { line: 4, start: 0, end: 9 } }),
  row({ id: "nh-1", raw: "# Top", typeLabel: "章节标题", lineType: "1 级标题", range: { line: 0, start: 0, end: 5 } }),
  row({ id: "nh-2", raw: "### Deep", typeLabel: "章节标题", lineType: "3 级标题", range: { line: 2, start: 0, end: 8 } }),
]);
assert.ok(numberedHeadingExport.includes("# (001) Top\n<br>"));
assert.ok(numberedHeadingExport.includes("### (002) Deep\n<br>"));
assert.ok(numberedHeadingExport.includes("## (003) Middle\n<br>"));
const unnumberedHeadingExport = exportByCalibration(numberedHeadingSource, [
  row({ id: "nh-3", raw: "## Middle", typeLabel: "章节标题", lineType: "2 级标题", range: { line: 4, start: 0, end: 9 } }),
  row({ id: "nh-1", raw: "# Top", typeLabel: "章节标题", lineType: "1 级标题", range: { line: 0, start: 0, end: 5 } }),
  row({ id: "nh-2", raw: "### Deep", typeLabel: "章节标题", lineType: "3 级标题", range: { line: 2, start: 0, end: 8 } }),
], { numberHeadings: false });
assert.ok(unnumberedHeadingExport.includes("# Top\n<br>"));
assert.ok(unnumberedHeadingExport.includes("### Deep\n<br>"));
assert.ok(!unnumberedHeadingExport.includes("(001)"));
assert.ok(
  numberedHeadingExport.indexOf("(001)") < numberedHeadingExport.indexOf("(002)")
    && numberedHeadingExport.indexOf("(002)") < numberedHeadingExport.indexOf("(003)"),
  "heading sequence must follow chapter position rather than calibration row order or heading level",
);


const illegalBreakSource = [
  "First part of one sentence",
  "continues on the next physical line.",
  "",
  "Another paragraph was broken in the",
  "",
  "middle by OCR.",
  "",
  "A hyphenated exam-",
  "ple continues here.",
  "",
  "This break stays.",
  "And this line stays separate.",
].join("\n");
const illegalBreakRows = [
  row({ id: "lb-1", raw: "First part of one sentence\ncontinues on the next physical line.", typeLabel: "非法断行", lineType: "合并", range: { line: 0, start: 0, endLine: 1, end: 36 } }),
  row({ id: "lb-2", raw: "Another paragraph was broken in the\n\nmiddle by OCR.", typeLabel: "非法断行", lineType: "合并", range: { line: 3, start: 0, endLine: 5, end: 14 } }),
  row({ id: "lb-3", raw: "A hyphenated exam-\nple continues here.", typeLabel: "非法断行", lineType: "合并", range: { line: 7, start: 0, endLine: 8, end: 19 } }),
  row({ id: "lb-ignore", raw: "This break stays.\nAnd this line stays separate.", typeLabel: "非法断行", lineType: "已忽略", range: { line: 10, start: 0, endLine: 11, end: 29 } }),
];
const illegalBreakExport = exportByCalibration(illegalBreakSource, illegalBreakRows);
assert.ok(illegalBreakExport.includes("First part of one sentence continues on the next physical line.\n<br>"), "calibrated illegal adjacent break must merge on export");
assert.ok(illegalBreakExport.includes("Another paragraph was broken in the middle by OCR.\n<br>"), "calibrated illegal blank-line break must remove blank lines on export");
assert.ok(illegalBreakExport.includes("A hyphenated example continues here.\n<br>"), "hyphenated OCR split word must join without a space");
assert.ok(illegalBreakExport.includes("This break stays.\nAnd this line stays separate.\n<br>"), "已忽略 illegal break must remain unchanged");

const chainedSpans = buildIllegalMergeSpans([
  row({ id: "chain-1", raw: "a\nb", typeLabel: "非法断行", lineType: "合并", range: { line: 20, start: 0, endLine: 21, end: 4 } }),
  row({ id: "chain-2", raw: "b\nc", typeLabel: "非法断行", lineType: "合并", range: { line: 21, start: 0, endLine: 22, end: 4 } }),
  row({ id: "chain-3", raw: "d\n\ne", typeLabel: "非法断行", lineType: "合并", range: { line: 30, start: 0, endLine: 32, end: 4 } }),
]);
assert.deepStrictEqual(chainedSpans, [{ start: 20, end: 22 }, { start: 30, end: 32 }], "connected illegal-break decisions must export as one merged span");

console.log("calibrationExport tests passed");
