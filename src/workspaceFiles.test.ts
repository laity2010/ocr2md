import * as assert from "assert";
import { hasChapterSplitFrontmatter, markdownFileKind } from "./workspaceFiles";

const chapter = [
  "---",
  "title: Chapter 11",
  "ocr2md_chapter_split: true",
  "---",
  "",
  "# Chapter 11",
].join("\n");

assert.strictEqual(hasChapterSplitFrontmatter(chapter), true);
assert.strictEqual(markdownFileKind(chapter), "chapter");
assert.strictEqual(markdownFileKind("# OCR page\n\nRaw text"), "ocr");
assert.strictEqual(markdownFileKind("# OCR page\n\nocr2md_chapter_split: true"), "ocr");
assert.strictEqual(markdownFileKind("---\nocr2md_chapter_split: false\n---\n# Draft"), "ocr");
assert.strictEqual(markdownFileKind("\uFEFF---\r\nocr2md_chapter_split: TRUE # exported\r\n---\r\n# Chapter"), "chapter");

console.log("workspaceFiles tests passed");
