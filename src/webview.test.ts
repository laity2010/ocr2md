import * as assert from "assert";
import { renderSidebar, TABLE_COLUMNS } from "./webview";
import type { SidebarState } from "./types";

const state: SidebarState = {
  workspaceLabel: "/workspace",
  selectedFile: { label: "chapter.md", path: "/workspace/chapter.md", kind: "chapter" },
  files: [],
  activeModule: "章节定界",
  rows: [],
  annotationPairs: [],
  moduleRegexPatterns: { "注释": "", "图片": "" },
  moduleRegexPresets: { "注释": [], "图片": [] },
};

const html = renderSidebar(state);
for (const moduleName of ["章节定界", "章节标题", "注释", "图片"]) {
  assert.ok(html.includes(moduleName), `missing module: ${moduleName}`);
}
for (const removedModule of ["未分类", "非法断行", "拼写检查", "文本块", "分句", "翻译设置"]) {
  assert.ok(!html.includes(removedModule), `removed module leaked into UI: ${removedModule}`);
}
assert.deepStrictEqual(TABLE_COLUMNS, ["多选", "行号", "行类型", "预览"]);
for (const column of TABLE_COLUMNS) {
  assert.ok(html.includes(column), `missing table column: ${column}`);
}
assert.ok(html.includes("event.shiftKey"), "multi-column sorting gesture is missing");
assert.ok(html.includes("Shift+单击可追加多列排序"), "multi-column sorting guidance is missing");
assert.ok(
  html.includes('restoredSortRules.length ? restoredSortRules : [{ key: "line", direction: "asc" }]'),
  "default line ascending sort is missing",
);
for (const defaultFilter of ["层级标题行+增删改行", "注释及引用+增删改行", "图片相关+增删改行"]) {
  assert.ok(html.includes(defaultFilter), `missing default module filter: ${defaultFilter}`);
}
assert.ok(
  html.includes('if (moduleName === "章节标题") return chapterChange;'),
  "chapter title changes must not inherit stale working-correction flags",
);
assert.ok(html.includes("#app { display: flex; flex-direction: column; height: 100%; min-height: 0; }"), "app does not fill the view");
assert.ok(html.includes(".table-wrap { flex: 1 1 auto; min-height: 0; overflow: auto;"), "table does not fill remaining space");
assert.ok(html.includes('Array.from(String(row.preview || row.raw || "")).slice(0, 255).join("")'), "preview is not limited to 255 characters");
assert.ok(
  html.includes('previewCell.addEventListener("click", () => post("locateRow", { id: candidate.id }))'),
  "preview navigation must be attached to the preview cell",
);

console.log("webview tests passed");
