const CHAPTER_CHANGED_PROPERTY = "ocr2md_chapter_changed";
const FRONTMATTER_RE = /^(\uFEFF)?(---[ \t]*\r?\n)([\s\S]*?)(\r?\n---(?:[ \t]*\r?\n|[ \t]*$))/;

type LeadingFrontmatter = {
  bom: string;
  open: string;
  yaml: string;
  close: string;
  body: string;
  eol: string;
};

function parseLeadingFrontmatter(markdown: string): LeadingFrontmatter | undefined {
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

function hasChapterChangedFrontmatter(markdown: string): boolean {
  const frontmatter = parseLeadingFrontmatter(markdown);
  if (!frontmatter) return false;
  return new RegExp(`^${CHAPTER_CHANGED_PROPERTY}[ \\t]*:[ \\t]*true(?:[ \\t]*(?:#.*)?)?$`, "im")
    .test(frontmatter.yaml);
}

function withChapterChangedFrontmatter(markdown: string, changed: boolean): string {
  const frontmatter = parseLeadingFrontmatter(markdown);
  if (!frontmatter) return markdown;
  const line = `${CHAPTER_CHANGED_PROPERTY}: ${changed ? "true" : "false"}`;
  const key = new RegExp(`^${CHAPTER_CHANGED_PROPERTY}[ \\t]*:[ \\t]*.+$`, "im");
  const yaml = key.test(frontmatter.yaml)
    ? frontmatter.yaml.replace(key, line)
    : `${frontmatter.yaml.replace(/[ \t]*$/, "")}${frontmatter.yaml.trim() ? frontmatter.eol : ""}${line}`;
  return `${frontmatter.bom}${frontmatter.open}${yaml}${frontmatter.close}${frontmatter.body}`;
}

function stripChapterChangedFrontmatter(markdown: string): string {
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

/** Browser-safe baseline used by the review diff engine. */
export function chapterDiffBaseline(original: string, working: string): string {
  const workingFrontmatter = parseLeadingFrontmatter(working);
  const workingHasKey = Boolean(
    workingFrontmatter && new RegExp(`^${CHAPTER_CHANGED_PROPERTY}[ \\t]*:`, "im").test(workingFrontmatter.yaml),
  );
  if (!workingHasKey) return stripChapterChangedFrontmatter(original);
  return withChapterChangedFrontmatter(original, hasChapterChangedFrontmatter(working));
}

function chapterStem(chapterFile: string): string {
  const name = chapterFile.trim().replace(/\.md$/i, "").replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
  return name || "chapter";
}

export function chapterOriginalFileName(chapterFile: string): string {
  return `${chapterStem(chapterFile)}.md`;
}
