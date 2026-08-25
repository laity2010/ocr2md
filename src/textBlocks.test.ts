import * as assert from "assert";
import { classifyTextBlock, scanTextBlocks } from "./textBlocks";

const markdown = [
  "---",
  "ocr2md_format_calibrated: true",
  "---",
  "",
  "## Chapter title",
  "<br>",
  "",
  "First paragraph line one.",
  "First paragraph line two.",
  "<br>",
  "",
  ">",
  "FIGURE 1.1 | Demo",
  "内嵌图片链接: ![[imgs/demo.png]]",
  "><embed id=01></embed>",
  "<br>",
  "",
  "[^1]: Footnote body",
  "<br>",
  "",
  "Trailing text without delimiter.",
].join("\n");

const rows = scanTextBlocks(markdown, "/ws/chapters/01/trans/01.md");
assert.deepStrictEqual(rows.map((row) => [row.range.line + 1, row.lineType]), [
  [5, "标题"],
  [8, "文本"],
  [12, "内嵌"],
  [18, "注释正文"],
  [21, "文本"],
]);
assert.strictEqual(rows[0].raw, "## Chapter title");
assert.strictEqual(rows[1].raw, "First paragraph line one.\nFirst paragraph line two.");
assert.ok(rows[2].raw.includes("><embed id=01></embed>"));
assert.strictEqual(rows[3].raw, "[^1]: Footnote body");
assert.strictEqual(rows[4].raw, "Trailing text without delimiter.");
assert.ok(rows.every((row) => !row.raw.includes("ocr2md_format_calibrated")), "YAML frontmatter must not become a text block");

assert.strictEqual(classifyTextBlock("### Heading"), "标题");
assert.strictEqual(classifyTextBlock("[^12]: note"), "注释正文");
assert.strictEqual(classifyTextBlock(">\nTable\n><embed id=02></embed>"), "内嵌");
assert.strictEqual(classifyTextBlock("plain text"), "文本");

console.log("textBlocks tests passed");
