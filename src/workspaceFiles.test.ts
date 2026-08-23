import * as assert from "assert";
import * as path from "path";
import {
  chapterOutputBaselinePath,
  chapterWorkingCopyPath,
  hasChapterSplitFrontmatter,
  isChapterOutputPath,
  markdownFileKind,
  planChapterWorkingCopyInit,
} from "./workspaceFiles";

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

assert.strictEqual(isChapterOutputPath("/ws", path.join("/ws", "chapters", "11.md")), true);
assert.strictEqual(isChapterOutputPath("/ws", path.join("/ws", "ocr", "11.md")), false);
assert.strictEqual(isChapterOutputPath("/ws", path.join("/ws", "chapters-extra", "11.md")), false);

assert.strictEqual(
  chapterWorkingCopyPath("/ws", path.join("/ws", "chapters", "11 Chapter.md")),
  path.join("/ws", ".ocr2md", "chapter-working", "chapters__11 Chapter.md.chapter.working.md"),
);
assert.strictEqual(
  chapterOutputBaselinePath("/ws", path.join("/ws", "chapters", "11.md")),
  path.join("/ws", ".ocr2md", "chapter-output-baselines", "chapters__11.md.baseline.md"),
);

assert.deepStrictEqual(
  planChapterWorkingCopyInit({ workingExists: true, originalText: "edited", baselineText: "frozen" }),
  { action: "keep-working" },
);
assert.deepStrictEqual(
  planChapterWorkingCopyInit({ workingExists: false, originalText: "edited", baselineText: "frozen" }),
  { action: "create", workingText: "edited", restoreOriginal: "frozen" },
);
assert.deepStrictEqual(
  planChapterWorkingCopyInit({ workingExists: false, originalText: "same", baselineText: "same" }),
  { action: "create", workingText: "same" },
);
assert.deepStrictEqual(
  planChapterWorkingCopyInit({ workingExists: false, originalText: "copy me" }),
  { action: "create", workingText: "copy me" },
);

console.log("workspaceFiles tests passed");
