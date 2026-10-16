export type ChapterAssignMode = "same" | "sequence" | "offset";

export interface ChapterAssignRow {
  id: string;
  raw: string;
  chapterFile?: string;
}

export function titleTextForChapterFile(raw: string): string {
  const textValue = String(raw || "")
    .trim()
    .replace(/^#{1,6}\s+/, "")
    .replace(/<sup\b[^>]*>[\s\S]*?<\/sup>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\.md$/i, "")
    .replace(/[/\\:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return textValue || "未命名章节";
}

export function chapterFileParts(chapterFile: string): { number: number; width: number; title: string } | undefined {
  const match = /^(\d+)\s+(.+?)(?:\.md)?$/i.exec(String(chapterFile || "").trim());
  if (!match) return undefined;
  return {
    number: Number.parseInt(match[1], 10),
    width: match[1].length,
    title: match[2].replace(/\.md$/i, "").trim(),
  };
}

export function recommendedChapterStartNumber(chapterFiles: Iterable<string | undefined>): string {
  let highest = -1;
  let width = 2;
  for (const chapterFile of chapterFiles) {
    const match = /^(\d+)\s+/.exec(String(chapterFile || "").trim());
    if (!match) continue;
    highest = Math.max(highest, Number.parseInt(match[1], 10));
    width = Math.max(width, match[1].length);
  }
  if (highest < 0) return "01";
  return String(highest + 1).padStart(width, "0");
}

export function chapterFileName(number: string, title: string): string {
  return `${number} ${title}.md`;
}

export function assignChapterFiles(input: {
  mode: ChapterAssignMode;
  value: string;
  rows: ChapterAssignRow[];
}): { ok: true; files: Record<string, string> } | { ok: false; error: string } {
  const rows = input.rows;
  const value = input.value.trim();
  if (input.mode !== "same" && input.mode !== "sequence" && input.mode !== "offset") {
    return { ok: false, error: "请选择统一序号、依次递增或整体偏移。" };
  }
  if (!rows.length) return { ok: false, error: "请先勾选至少一个 1 级标题行。" };
  if (input.mode === "offset") {
    if (!/^[+-]\d+$/.test(value)) return { ok: false, error: "请输入 +数字 或 -数字，例如 +2、-3。" };
    const offset = Number.parseInt(value, 10);
    const files: Record<string, string> = {};
    for (const row of rows) {
      const current = chapterFileParts(row.chapterFile ?? "");
      if (!current || current.number + offset < 0) {
        return { ok: false, error: "所选行必须已有数字章节序号，且偏移后序号不能小于 0。" };
      }
      files[row.id] = chapterFileName(String(current.number + offset).padStart(current.width, "0"), current.title);
    }
    return { ok: true, files };
  }
  if (!/^\d+$/.test(value)) return { ok: false, error: "请输入数字章节序号。" };
  if (input.mode === "same") {
    const chapterFile = chapterFileName(value, titleTextForChapterFile(rows[0].raw));
    return { ok: true, files: Object.fromEntries(rows.map((row) => [row.id, chapterFile])) };
  }
  const width = value.length;
  const start = Number.parseInt(value, 10);
  const files: Record<string, string> = {};
  rows.forEach((row, index) => {
    files[row.id] = chapterFileName(String(start + index).padStart(width, "0"), titleTextForChapterFile(row.raw));
  });
  return { ok: true, files };
}
