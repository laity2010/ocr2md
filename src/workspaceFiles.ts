import * as path from "path";

export type MarkdownFileKind = "ocr" | "chapter" | "working";

export const CHAPTER_SPLIT_PROPERTY = "ocr2md_chapter_split";
export const CHAPTER_CHANGED_PROPERTY = "ocr2md_chapter_changed";
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
const FRONTMATTER_RE = /^(\uFEFF)?(---[ \t]*\r?\n)([\s\S]*?)(\r?\n---(?:[ \t]*\r?\n|[ \t]*$))/;

function parseLeadingFrontmatter(markdown: string): {
  bom: string;
  open: string;
  yaml: string;
  close: string;
  body: string;
  eol: string;
} | undefined {
  const match = FRONTMATTER_RE.exec(markdown);
  if (!match) return undefined;
  return {
    bom: match[1] ?? "",
    open: match[2],
    yaml: match[3],
    close: match[4],
    body: markdown.slice(match[0].length),
    eol: markdown.includes("\r\n") ? "\r\n" : "\n",
  };
}

function yamlPropertyIsTrue(yaml: string, name: string): boolean {
  return new RegExp(`^${name}[ \\t]*:[ \\t]*true(?:[ \\t]*(?:#.*)?)?$`, "im").test(yaml);
}

export function hasChapterSplitFrontmatter(markdown: string): boolean {
  const frontmatter = parseLeadingFrontmatter(markdown);
  if (!frontmatter) return false;
  return yamlPropertyIsTrue(frontmatter.yaml, CHAPTER_SPLIT_PROPERTY);
}

export function hasChapterChangedFrontmatter(markdown: string): boolean {
  const frontmatter = parseLeadingFrontmatter(markdown);
  if (!frontmatter) return false;
  return yamlPropertyIsTrue(frontmatter.yaml, CHAPTER_CHANGED_PROPERTY);
}

export function withChapterChangedFrontmatter(markdown: string, changed: boolean): string {
  const frontmatter = parseLeadingFrontmatter(markdown);
  if (!frontmatter) return markdown;
  const line = `${CHAPTER_CHANGED_PROPERTY}: ${changed ? "true" : "false"}`;
  const key = new RegExp(`^${CHAPTER_CHANGED_PROPERTY}[ \\t]*:[ \\t]*.+$`, "im");
  const yaml = key.test(frontmatter.yaml)
    ? frontmatter.yaml.replace(key, line)
    : `${frontmatter.yaml.replace(/[ \t]*$/, "")}${frontmatter.yaml.trim() ? frontmatter.eol : ""}${line}`;
  return `${frontmatter.bom}${frontmatter.open}${yaml}${frontmatter.close}${frontmatter.body}`;
}

export function stripChapterChangedFrontmatter(markdown: string): string {
  const frontmatter = parseLeadingFrontmatter(markdown);
  if (!frontmatter) return markdown;
  const yaml = frontmatter.yaml
    .split(/\r?\n/)
    .filter((line) => !new RegExp(`^${CHAPTER_CHANGED_PROPERTY}[ \\t]*:`).test(line))
    .join(frontmatter.eol);
  return `${frontmatter.bom}${frontmatter.open}${yaml}${frontmatter.close}${frontmatter.body}`;
}

export function chapterContentsDiffer(original: string, working: string): boolean {
  return stripChapterChangedFrontmatter(original).replace(/\r\n?/g, "\n")
    !== stripChapterChangedFrontmatter(working).replace(/\r\n?/g, "\n");
}

/**
 * In-memory original text for table diffs. The changed flag on chapters/ must
 * not appear as an added or modified YAML line.
 */
export function chapterDiffBaseline(original: string, working: string): string {
  const workingFrontmatter = parseLeadingFrontmatter(working);
  const workingHasKey = Boolean(
    workingFrontmatter && new RegExp(`^${CHAPTER_CHANGED_PROPERTY}[ \\t]*:`, "im").test(workingFrontmatter.yaml),
  );
  if (!workingHasKey) return stripChapterChangedFrontmatter(original);
  return withChapterChangedFrontmatter(original, hasChapterChangedFrontmatter(working));
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
  if (baselineText !== undefined && chapterContentsDiffer(originalText, baselineText)) {
    return { action: "create", workingText: originalText, restoreOriginal: baselineText };
  }
  return { action: "create", workingText: originalText };
}
