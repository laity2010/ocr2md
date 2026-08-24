import * as path from "path";

export type MarkdownFileKind = "ocr" | "chapter" | "working";

export const CHAPTER_SPLIT_PROPERTY = "ocr2md_chapter_split";
export const CHAPTER_CHANGED_PROPERTY = "ocr2md_chapter_changed";
export const FORMAT_CALIBRATED_PROPERTY = "ocr2md_format_calibrated";
export const CHAPTER_BOUNDARY_WORKING_FILE = ".ocr2md-merged.working.md";
export const CHAPTER_OUTPUT_DIRECTORY = "chapters";
export const TRANS_OUTPUT_DIRECTORY = "trans";
export const CHAPTER_IMAGE_DIRECTORY = "imgs";
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

export function hasFormatCalibratedFrontmatter(markdown: string): boolean {
  const frontmatter = parseLeadingFrontmatter(markdown);
  if (!frontmatter) return false;
  return yamlPropertyIsTrue(frontmatter.yaml, FORMAT_CALIBRATED_PROPERTY);
}

export function withFormatCalibratedFrontmatter(markdown: string): string {
  const frontmatter = parseLeadingFrontmatter(markdown);
  if (!frontmatter) {
    const eol = markdown.includes("\r\n") ? "\r\n" : "\n";
    return `---${eol}${FORMAT_CALIBRATED_PROPERTY}: true${eol}---${eol}${eol}${markdown.replace(/^\s+/, "")}`;
  }
  const line = `${FORMAT_CALIBRATED_PROPERTY}: true`;
  const key = new RegExp(`^${FORMAT_CALIBRATED_PROPERTY}[ \\t]*:[ \\t]*.+$`, "im");
  const yaml = key.test(frontmatter.yaml)
    ? frontmatter.yaml.replace(key, line)
    : `${frontmatter.yaml.replace(/[ \t]*$/, "")}${frontmatter.yaml.trim() ? frontmatter.eol : ""}${line}`;
  return `${frontmatter.bom}${frontmatter.open}${yaml}${frontmatter.close}${frontmatter.body}`;
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

export function chapterStem(chapterFile: string): string {
  const name = chapterFile.trim().replace(/\.md$/i, "").replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
  return name || "chapter";
}

export function chapterOriginalFileName(chapterFile: string): string {
  return `${chapterStem(chapterFile)}.md`;
}

export function chapterDirectoryPath(workspaceRoot: string, chapterFile: string): string {
  return path.join(workspaceRoot, CHAPTER_OUTPUT_DIRECTORY, chapterStem(chapterFile));
}

export function chapterOriginalPath(workspaceRoot: string, chapterFile: string): string {
  const stem = chapterStem(chapterFile);
  return path.join(workspaceRoot, CHAPTER_OUTPUT_DIRECTORY, stem, `${stem}.md`);
}

export function isChapterDerivedMarkdown(filePath: string): boolean {
  return /\.(?:annotation\.)?working\.md$/i.test(filePath) || /\.baseline\.md$/i.test(filePath);
}

/** Original chapter file: chapters/<name>/<name>.md, plus legacy chapters/<name>.md. */
export function isCanonicalChapterOriginal(workspaceRoot: string, filePath: string): boolean {
  if (!isChapterOutputPath(workspaceRoot, filePath) || isChapterDerivedMarkdown(filePath)) return false;
  const relative = path.relative(path.resolve(workspaceRoot, CHAPTER_OUTPUT_DIRECTORY), path.resolve(filePath));
  const parts = relative.split(path.sep);
  if (parts.length === 1) return /\.md$/i.test(parts[0]);
  if (parts.length === 2) return /\.md$/i.test(parts[1]) && path.parse(parts[1]).name === parts[0];
  return false;
}

export function chapterDisplayName(workspaceRoot: string, filePath: string): string {
  const relative = path.relative(path.resolve(workspaceRoot, CHAPTER_OUTPUT_DIRECTORY), path.resolve(filePath));
  if (relative.startsWith("..") || path.isAbsolute(relative)) return path.basename(filePath);
  const parts = relative.split(path.sep);
  return parts.length >= 2 ? parts[0] : path.parse(parts[0] ?? filePath).name;
}

export function chapterWorkingCopyPath(workspaceRoot: string, originalPath: string): string {
  void workspaceRoot;
  const parsed = path.parse(originalPath);
  return path.join(parsed.dir, `${parsed.name}.working.md`);
}

export function chapterSidecarPath(originalPath: string): string {
  const parsed = path.parse(originalPath);
  return path.join(parsed.dir, `${parsed.name}.ocr2md.json`);
}

export function chapterImageDirectory(originalPath: string): string {
  return path.join(path.dirname(originalPath), CHAPTER_IMAGE_DIRECTORY);
}

export function chapterCalibrationOutputDirectory(originalPath: string): string {
  return path.join(path.dirname(originalPath), "output");
}

export function chapterTransOutputPath(workspaceRoot: string, originalPath: string): string {
  const chapterDirectory = chapterDisplayName(workspaceRoot, originalPath) || path.parse(originalPath).name;
  return path.join(workspaceRoot, TRANS_OUTPUT_DIRECTORY, chapterDirectory, path.basename(originalPath));
}

export function chapterAnnotationWorkingPath(originalPath: string): string {
  const parsed = path.parse(originalPath);
  return path.join(parsed.dir, `${parsed.name}.annotation.working.md`);
}

export function chapterOutputBaselinePath(workspaceRoot: string, originalPath: string): string {
  void workspaceRoot;
  const parsed = path.parse(originalPath);
  return path.join(parsed.dir, `${parsed.name}.baseline.md`);
}

export function legacyChapterWorkingCopyPath(workspaceRoot: string, originalPath: string): string {
  const relative = path.relative(workspaceRoot, originalPath).replace(/[\\/]/g, "__");
  return path.join(workspaceRoot, CHAPTER_WORKING_DIRECTORY, `${relative}.chapter.working.md`);
}

export function legacyChapterOutputBaselinePath(workspaceRoot: string, originalPath: string): string {
  const relative = path.relative(workspaceRoot, originalPath).replace(/[\\/]/g, "__");
  return path.join(workspaceRoot, CHAPTER_OUTPUT_BASELINE_DIRECTORY, `${relative}.baseline.md`);
}

export function legacyChapterSidecarPaths(workspaceRoot: string, originalPath: string): string[] {
  return [
    `${originalPath}.ocr2md.json`,
    path.join(workspaceRoot, ".ocr2md", "annotations.json"),
  ];
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
