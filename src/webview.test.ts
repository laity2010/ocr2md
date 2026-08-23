import * as assert from "assert";
import { ANNOTATION_EXTRA_COLUMNS, CHAPTER_BOUNDARY_EXTRA_COLUMNS, EMBED_EXTRA_COLUMNS, renderSidebar, TABLE_COLUMNS } from "./webview";
import type { SidebarState } from "./types";

const state: SidebarState = {
  workspaceLabel: "/workspace",
  selectedFile: { label: "chapter.md", path: "/workspace/chapter.md", kind: "chapter" },
  files: [],
  activeModule: "章节定界",
  rows: [],
  annotationPairs: [],
  moduleRegexPatterns: { "注释": "", "嵌入块": "" },
  moduleRegexPresets: { "注释": [], "嵌入块": [] },
};

const html = renderSidebar(state);
for (const moduleName of ["章节定界", "章节标题", "注释", "嵌入块"]) {
  assert.ok(html.includes(moduleName), `missing module: ${moduleName}`);
}
for (const removedModule of ["未分类", "非法断行", "拼写检查", "文本块", "分句", "翻译设置"]) {
  assert.ok(!html.includes(removedModule), `removed module leaked into UI: ${removedModule}`);
}
assert.deepStrictEqual(TABLE_COLUMNS, ["多选", "行号", "行类型", "预览"]);
assert.ok(!TABLE_COLUMNS.includes("注释号" as typeof TABLE_COLUMNS[number]), "annotation number is not a shared table column");
assert.ok(!TABLE_COLUMNS.includes("章节文件" as typeof TABLE_COLUMNS[number]), "chapter file is not a shared table column");
assert.deepStrictEqual(ANNOTATION_EXTRA_COLUMNS, ["注释号"]);
assert.deepStrictEqual(CHAPTER_BOUNDARY_EXTRA_COLUMNS, ["章节文件"]);
assert.ok(!TABLE_COLUMNS.includes("序号" as typeof TABLE_COLUMNS[number]), "embed index is not a shared table column");
assert.deepStrictEqual(EMBED_EXTRA_COLUMNS, ["序号"]);
for (const column of TABLE_COLUMNS) {
  assert.ok(html.includes(column), `missing table column: ${column}`);
}
assert.ok(html.includes("event.shiftKey"), "multi-column sorting gesture is missing");
assert.ok(html.includes("Shift+单击可追加多列排序"), "multi-column sorting guidance is missing");
assert.ok(
  html.includes('return DEFAULT_SORT_RULES[moduleName] || [{ key: "line", direction: "asc" }]'),
  "default line ascending sort is missing",
);
assert.ok(
  html.includes('"注释": [{ key: "number", direction: "asc" }, { key: "line", direction: "asc" }]'),
  "annotation module default sort must be number then line",
);
assert.ok(
  html.includes('if (state.activeModule === "注释" && ANNOTATION_EXTRA_COLUMNS.includes("注释号"))'),
  "annotation number column must be gated to the annotation module",
);
assert.ok(
  html.includes('if (state.activeModule === "章节定界" && CHAPTER_BOUNDARY_EXTRA_COLUMNS.includes("章节文件"))'),
  "chapter file column must be gated to the chapter boundary module",
);
assert.ok(html.includes("设置章节文件"), "chapter boundary must expose the chapter-file dialog");
assert.ok(html.includes("统一序号"), "chapter-file dialog must support same-number assignment");
assert.ok(html.includes("从起始序号依次递增"), "chapter-file dialog must support sequential assignment");
assert.ok(html.includes("整体偏移"), "chapter-file dialog must support number offset");
assert.ok(html.includes("function setSelectedChapterBoundaryFile()"), "chapter-file dialog must run from selected level-one headings");
assert.ok(html.includes("tr.missing-chapter-file"), "unassigned level-one headings must be highlighted");
assert.ok(html.includes('postKeepView("assignChapterFiles"'), "chapter-file dialog must assign generated filenames");
assert.ok(html.includes('"嵌入块": ["内嵌标题", "嵌入链接", "嵌入HTML", "嵌入文本"'), "embed module line types");
assert.ok(
  html.includes('if (state.activeModule === "嵌入块" && EMBED_EXTRA_COLUMNS.includes("序号"))'),
  "embed number column must be gated to the embed module",
);
assert.ok(
  html.includes('"嵌入块": [{ key: "embedNumber", direction: "asc" }, { key: "line", direction: "asc" }]'),
  "embed module default sort must be block number then line",
);
for (const defaultFilter of ["层级标题行+增删改行", "注释及引用+增删改行", "嵌入相关+增删改行"]) {
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
assert.ok(html.includes("匹配注释对"), "annotation matching action is missing");
assert.ok(
  html.includes('moduleName === "注释" && state.annotationMatchSummary')
    && html.includes("state.annotationMatchSummary.calibrated"),
  "annotation tab count must use calibrated rows, not ignored regex hits",
);
assert.ok(!html.includes("确认所选 Pair"), "old pair confirmation label must be removed");
assert.ok(html.includes("手工输入注释号"), "missing annotation number must prompt for manual input");
assert.ok(html.includes("tr.missing-number"), "rows without annotation numbers must be highlighted");
assert.ok(html.includes("function restoreScroll()"), "table scroll must be restored after rerender");
assert.ok(html.includes("function restoreFocus()"), "row focus must be restored after rerender");
assert.ok(html.includes("if (!focusTarget || !webviewIsActive) return;"), "table must not steal focus from the source editor");
assert.ok(html.includes('data.command !== "setState"'), "host updates must reuse the webview instead of rewriting html");
assert.ok(html.includes("persisted.selectedIds"), "multi-select must survive host webview reloads");
assert.ok(html.includes("clearSelection"), "batch line-type changes must clear multi-select without dropping scroll");
assert.ok(html.includes("syncSelectionChrome()"), "checkbox toggles must not rebuild the table");
assert.ok(!html.includes("selected.add(candidate.id); else selected.delete(candidate.id);\n        render();"), "checkbox change must not call render()");
assert.ok(
  html.includes('["added", "modified", "deleted"].includes(row.chapterBoundaryState)'),
  "add/modify/delete coloring is a shared table filter, not module-specific",
);
assert.ok(html.includes('if (candidate.chapterBoundaryState === "added") row.classList.add("added");'), "added rows must be colored");
assert.ok(html.includes('if (candidate.chapterBoundaryState === "modified") row.classList.add("modified");'), "modified rows must be colored");
assert.ok(html.includes('if (candidate.chapterBoundaryState === "deleted") row.classList.add("removed");'), "deleted rows must be colored");

console.log("webview tests passed");
