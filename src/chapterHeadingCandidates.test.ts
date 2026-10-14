import {strict as assert} from "node:assert";
import {scanChapterHeadingCandidates} from "./textBlocks";
const sample=["---","title: book","---","# Chapter One","Text","```md","# fake title","```",
  "   ## Section Two ###","~~~","### not a heading","~~~","    # indented code","#### Section Four", "#Nospace"].join("\n");
const rows=scanChapterHeadingCandidates(sample,"/ocr2md/Book/chapters/01.md");
assert.deepEqual(rows.map(r=>r.range.line),[3,8,13]);
assert.deepEqual(rows.map(r=>r.lineType),["1 级标题","2 级标题","4 级标题"]);
assert.equal(rows[0].typeLabel,"章节标题");
assert.ok(rows[0].raw.startsWith("# Chapter"));
assert.deepEqual(scanChapterHeadingCandidates("---\nno closing\n# Not Heading", "foo"),[]);
assert.equal(scanChapterHeadingCandidates("text only", "foo").length,0);
console.log("CHAPTER_HEADING_CANDIDATES_PASS");
