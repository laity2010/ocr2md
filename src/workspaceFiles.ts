import * as path from "path";

export type MarkdownFileKind = "ocr" | "chapter" | "working";

export const CHAPTER_SPLIT_PROPERTY = "ocr2md_chapter_split";
export const CHAPTER_BOUNDARY_WORKING_FILE = ".ocr2md-merged.working.md";
export const CHAPTER_OUTPUT_DIRECTORY = "chapters";
export const CHAPTER_WORKING_DIRECTORY = path.join(".ocr2md", "chapter-working");
export const CHAPTER_OUTPUT_BASELINE_DIRECTORY = path.join(".ocr2md", "chapter-output-baselines");

export type ChapterWorkingCopyInitPlan =
  | { action: "keep-working" }
  | { action: "create"; workingText: string; restoreOriginal?: string };

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

export function isChapterOutputPath(workspaceRoot: string, filePath: string): boolean {
  const directory = path.resolve(workspaceRoot, CHAPTER_OUTPUT_DIRECTORY) + path.sep;
  return path.resolve(filePath).startsWith(directory);
}

export function chapterWorkingCopyPath(workspaceRoot: string, originalPath: string): string {
  const relative = path.relative(workspaceRoot, originalPath).replace(/[\\/]/g, "__");
  return path.join(workspaceRoot, CHAPTER_WORKING_DIRECTORY, `${relative}.chapter.working.md`);
}

export function chapterOutputBaselinePath(workspaceRoot: string, originalPath: string): string {
  const relative = path.relative(workspaceRoot, originalPath).replace(/[\\/]/g, "__");
  return path.join(workspaceRoot, CHAPTER_OUTPUT_BASELINE_DIRECTORY, `${relative}.baseline.md`);
}

/**
 * First open of a chapter working copy. If the live chapters/ file was previously
 * edited in place, restore that file from the export snapshot and keep the edits
 * in the working copy.
 */
export function planChapterWorkingCopyInit(input: {
  workingExists: boolean;
  originalText: string;
  baselineText?: string;
}): ChapterWorkingCopyInitPlan {
  if (input.workingExists) return { action: "keep-working" };
  const originalText = input.originalText.replace(/\r\n?/g, "\n");
  const baselineText = input.baselineText?.replace(/\r\n?/g, "\n");
  if (baselineText !== undefined && baselineText !== originalText) {
    return { action: "create", workingText: originalText, restoreOriginal: baselineText };
  }
  return { action: "create", workingText: originalText };
}
