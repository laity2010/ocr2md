import * as assert from "assert";
import * as path from "path";
import {
  chapterAnnotationWorkingPath,
  chapterContentsDiffer,
  chapterDiffBaseline,
  chapterDirectoryPath,
  chapterDisplayName,
  chapterImageDirectory,
  chapterOriginalFileName,
  chapterOriginalPath,
  chapterOutputBaselinePath,
  chapterSidecarPath,
  chapterStem,
  chapterWorkingCopyPath,
  hasChapterChangedFrontmatter,
  hasChapterSplitFrontmatter,
  isCanonicalChapterOriginal,
  isChapterDerivedMarkdown,
  isChapterOutputPath,
  markdownFileKind,
  planChapterWorkingCopyInit,
  withChapterChangedFrontmatter,
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

assert.strictEqual(chapterStem("12 Valuation.md"), "12 Valuation");
assert.strictEqual(chapterOriginalFileName("12 Valuation"), "12 Valuation.md");
assert.strictEqual(
  chapterDirectoryPath("/ws", "12 Valuation.md"),
  path.join("/ws", "chapters", "12 Valuation"),
);
assert.strictEqual(
  chapterOriginalPath("/ws", "12 Valuation.md"),
  path.join("/ws", "chapters", "12 Valuation", "12 Valuation.md"),
);

const nestedOriginal = path.join("/ws", "chapters", "11 Chapter", "11 Chapter.md");
assert.strictEqual(isCanonicalChapterOriginal("/ws", nestedOriginal), true);
assert.strictEqual(isCanonicalChapterOriginal("/ws", path.join("/ws", "chapters", "11.md")), true);
assert.strictEqual(isCanonicalChapterOriginal("/ws", path.join("/ws", "chapters", "11 Chapter", "11 Chapter.working.md")), false);
assert.strictEqual(isCanonicalChapterOriginal("/ws", path.join("/ws", "chapters", "11 Chapter", "notes.md")), false);
assert.strictEqual(isChapterDerivedMarkdown(path.join("/ws", "chapters", "11 Chapter", "11 Chapter.working.md")), true);
assert.strictEqual(chapterDisplayName("/ws", nestedOriginal), "11 Chapter");
assert.strictEqual(
  chapterWorkingCopyPath("/ws", nestedOriginal),
  path.join("/ws", "chapters", "11 Chapter", "11 Chapter.working.md"),
);
assert.strictEqual(
  chapterSidecarPath(nestedOriginal),
  path.join("/ws", "chapters", "11 Chapter", "11 Chapter.ocr2md.json"),
);
assert.strictEqual(
  chapterImageDirectory(nestedOriginal),
  path.join("/ws", "chapters", "11 Chapter", "imgs"),
);
assert.strictEqual(
  chapterAnnotationWorkingPath(nestedOriginal),
  path.join("/ws", "chapters", "11 Chapter", "11 Chapter.annotation.working.md"),
);
assert.strictEqual(
  chapterOutputBaselinePath("/ws", nestedOriginal),
  path.join("/ws", "chapters", "11 Chapter", "11 Chapter.baseline.md"),
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

const exported = [
  "---",
  "ocr2md_chapter_split: true",
  "ocr2md_chapter_file: \"11.md\"",
  "---",
  "",
  "# Chapter 11",
].join("\n");
const markedChanged = withChapterChangedFrontmatter(exported, true);
assert.strictEqual(hasChapterChangedFrontmatter(exported), false);
assert.strictEqual(hasChapterChangedFrontmatter(markedChanged), true);
assert.ok(markedChanged.includes("ocr2md_chapter_changed: true"));
assert.ok(markedChanged.includes("# Chapter 11"));
assert.strictEqual(hasChapterChangedFrontmatter(withChapterChangedFrontmatter(markedChanged, false)), false);
assert.strictEqual(chapterContentsDiffer(exported, markedChanged), false);
assert.strictEqual(chapterContentsDiffer(exported, exported.replace("# Chapter 11", "# Chapter 11 edited")), true);

const workingUnmarked = exported.replace("# Chapter 11", "# Chapter 11 edited");
const diffBaseline = chapterDiffBaseline(markedChanged, workingUnmarked);
assert.strictEqual(hasChapterChangedFrontmatter(diffBaseline), false);
assert.ok(diffBaseline.includes("# Chapter 11"));
assert.ok(!diffBaseline.includes("ocr2md_chapter_changed"));

console.log("workspaceFiles tests passed");
