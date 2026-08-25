import * as assert from "assert";
import { findMultilineLatexRanges, isStandaloneMultilineLatexBlock, scanSentences, segmentSentences } from "./sentences";

assert.deepStrictEqual(
  segmentSentences("Mr. Smith went home. He slept."),
  ["Mr. Smith went home.", "He slept."],
);
assert.deepStrictEqual(
  segmentSentences("Dr. Damodaran discussed Fig. 12.3. It matters."),
  ["Dr. Damodaran discussed Fig. 12.3.", "It matters."],
);
assert.deepStrictEqual(
  segmentSentences("Aswath A. Damodaran wrote this. Next sentence."),
  ["Aswath A. Damodaran wrote this.", "Next sentence."],
);
assert.deepStrictEqual(
  segmentSentences("U.S. markets rose by 3.14%. Growth continued."),
  ["U.S. markets rose by 3.14%.", "Growth continued."],
);
assert.deepStrictEqual(
  segmentSentences("e.g. this remains one sentence. Next."),
  ["e.g. this remains one sentence.", "Next."],
);
assert.deepStrictEqual(
  segmentSentences("This is a claim.[^1] Next sentence."),
  ["This is a claim.[^1]", "Next sentence."],
);
assert.deepStrictEqual(
  segmentSentences("This is a claim. [^注释号] Next sentence."),
  ["This is a claim. [^注释号]", "Next sentence."],
);
assert.deepStrictEqual(
  segmentSentences("This is a claim[^12]. Next sentence."),
  ["This is a claim[^12].", "Next sentence."],
);
assert.deepStrictEqual(
  segmentSentences("Text before [^12] text after. Next sentence."),
  ["Text before [^12] text after.", "Next sentence."],
);
assert.deepStrictEqual(
  segmentSentences("See https://example.com/a.b. Next sentence."),
  ["See https://example.com/a.b.", "Next sentence."],
);
assert.deepStrictEqual(
  segmentSentences("Use `obj.method()` here. Next sentence."),
  ["Use `obj.method()` here.", "Next sentence."],
);
assert.deepStrictEqual(
  segmentSentences("Value $x.y$ is shown. Next sentence."),
  ["Value $x.y$ is shown.", "Next sentence."],
);
assert.deepStrictEqual(
  segmentSentences("See [[Notes.v1]] for details. Next sentence."),
  ["See [[Notes.v1]] for details.", "Next sentence."],
);
assert.deepStrictEqual(
  segmentSentences("Read [Sec. 2](https://example.com/doc) first. Next sentence."),
  ["Read [Sec. 2](https://example.com/doc) first.", "Next sentence."],
);

assert.deepStrictEqual(
  segmentSentences("1. First item continues here. 2. Second item."),
  ["1. First item continues here.", "2. Second item."],
);
assert.deepStrictEqual(
  segmentSentences("10. Tenth item continues here. Next sentence."),
  ["10. Tenth item continues here.", "Next sentence."],
);
assert.deepStrictEqual(
  segmentSentences("The steps are 1. First item."),
  ["The steps are 1.", "First item."],
  "正文中的数字句尾不能因为项目符号规则被无条件合并",
);

const markdown = [
  "---",
  "ocr2md_format_calibrated: true",
  "---",
  "",
  "## Chapter title",
  "<br>",
  "",
  "Mr. Smith went home. He slept.",
  "<br>",
  "",
  ">",
  "FIGURE 1.1 | Demo",
  "内嵌图片链接: ![[imgs/demo.png]]",
  "><embed id=01></embed>",
  "<br>",
  "",
  "[^1]: Dr. Jones wrote this. It matters.",
  "<br>",
  "",
  "A sentence that wraps",
  "across source lines. Then another.",
  "<br>",
].join("\n");

const rows = scanSentences(markdown, "/ws/chapters/01/trans/01.md");
assert.deepStrictEqual(rows.map((row) => [row.range.line + 1, row.lineType, row.preview]), [
  [5, "标题", "## Chapter title"],
  [8, "文本", "Mr. Smith went home."],
  [8, "文本", "He slept."],
  [17, "注释正文", "[^1]: Dr. Jones wrote this."],
  [17, "注释正文", "It matters."],
  [20, "文本", "A sentence that wraps across source lines."],
  [21, "文本", "Then another."],
]);
assert.ok(rows.every((row) => row.typeLabel === "分句"));
assert.ok(rows.every((row) => row.lineType !== "内嵌"), "内嵌文本块必须完全跳过分句");
assert.ok(rows.every((row) => row.parentBlockId), "每个句子必须保留来源文本块 id");
assert.deepStrictEqual(rows.filter((row) => row.range.line === 7).map((row) => row.sentenceIndex), [1, 2]);

const wrapped = rows.find((row) => row.preview === "A sentence that wraps across source lines.");
assert.deepStrictEqual(wrapped?.range, { line: 19, start: 0, endLine: 20, end: "across source lines.".length });


const latexBlockSource = [
  "Before the formula.",
  "$$",
  "E = mc^2",
  "$$",
  "After the formula.",
].join("\n");
const latexRows = scanSentences(latexBlockSource, "/ws/chapters/01/trans/01.md");
assert.deepStrictEqual(latexRows.map((row) => row.raw), ["Before the formula.", "After the formula."]);
assert.deepStrictEqual(
  findMultilineLatexRanges(latexBlockSource).map((range) => latexBlockSource.slice(range.start, range.end)),
  ["$$\nE = mc^2\n$$"],
);
assert.ok(isStandaloneMultilineLatexBlock("$$\nE = mc^2\n$$"));

console.log("sentences tests passed");
