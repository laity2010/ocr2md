export type MarkdownFileKind = "ocr" | "chapter" | "working";

export const CHAPTER_SPLIT_PROPERTY = "ocr2md_chapter_split";
export const CHAPTER_BOUNDARY_WORKING_FILE = ".ocr2md-merged.working.md";

/**
 * Chapter output status is deliberately read only from the leading YAML
 * frontmatter block. An occurrence in ordinary Markdown content must not move
 * an OCR source file into the chapters branch of the workspace tree.
 */
export function hasChapterSplitFrontmatter(markdown: string): boolean {
  const match = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---(?:[ \t]*\r?\n|[ \t]*$)/.exec(markdown);
  if (!match) return false;
  return new RegExp(`^${CHAPTER_SPLIT_PROPERTY}[ \\t]*:[ \\t]*true(?:[ \\t]*(?:#.*)?)?$`, "im").test(match[1]);
}

export function markdownFileKind(markdown: string): Exclude<MarkdownFileKind, "working"> {
  return hasChapterSplitFrontmatter(markdown) ? "chapter" : "ocr";
}
