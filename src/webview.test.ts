import * as assert from "assert";
import {
  ANNOTATION_EXTRA_COLUMNS,
  CHAPTER_BOUNDARY_EXTRA_COLUMNS,
  EMBED_EXTRA_COLUMNS,
  renderSidebar,
  TABLE_COLUMNS,
  VSCODE_REVIEW_UI_BOOTSTRAP,
  VSCODE_REVIEW_UI_THEME,
} from "./webview";
import type { SidebarState } from "./types";

const state: SidebarState = {
  workspaceLabel: "/workspace",
  selectedFile: { label: "chapter.md", path: "/workspace/chapter.md", kind: "chapter" },
  files: [],
  activeModule: "章节定界",
  headingNumberingEnabled: true,
  rows: [],
  annotationPairs: [],
  moduleRegexPatterns: { "注释": "", "嵌入块": "" },
  moduleRegexPresets: { "注释": [], "嵌入块": [] },
};

const html = renderSidebar(state);
const scriptStart = html.indexOf("<script>") + "<script>".length;
const scriptEnd = html.lastIndexOf("</script>");
assert.doesNotThrow(() => new Function(html.slice(scriptStart, scriptEnd)), "VS Code-hosted review UI JavaScript must be syntactically valid");

assert.ok(VSCODE_REVIEW_UI_BOOTSTRAP.includes("acquireVsCodeApi()"), "VS Code adapter must acquire the VS Code webview API");
assert.ok(VSCODE_REVIEW_UI_BOOTSTRAP.includes("window.ocr2mdHost"), "VS Code adapter must expose the generic ocr2md host bridge");
for (const method of ["postMessage", "getState", "setState", "onState"]) {
  assert.ok(VSCODE_REVIEW_UI_BOOTSTRAP.includes(method), `VS Code host bridge missing method: ${method}`);
}
assert.ok(VSCODE_REVIEW_UI_BOOTSTRAP.includes('data.command !== "setState"'), "VS Code adapter must translate host state messages without rebuilding the webview");

for (const semanticVariable of ["--ocr-foreground", "--ocr-border", "--ocr-header-background", "--ocr-focus-border"]) {
  assert.ok(VSCODE_REVIEW_UI_THEME.includes(semanticVariable), `VS Code theme adapter missing semantic variable: ${semanticVariable}`);
}
for (const vscodeVariable of ["--vscode-foreground", "--vscode-panel-border", "--vscode-sideBarSectionHeader-background"]) {
  assert.ok(VSCODE_REVIEW_UI_THEME.includes(vscodeVariable), `VS Code theme adapter missing host variable: ${vscodeVariable}`);
}
assert.ok(html.includes("const host = window.ocr2mdHost"), "rendered sidebar must consume the generic host bridge");

assert.deepStrictEqual(TABLE_COLUMNS, ["多选", "行号", "行类型", "预览"]);
assert.deepStrictEqual(ANNOTATION_EXTRA_COLUMNS, ["注释号"]);
assert.deepStrictEqual(CHAPTER_BOUNDARY_EXTRA_COLUMNS, ["章节文件"]);
assert.deepStrictEqual(EMBED_EXTRA_COLUMNS, ["序号"]);

console.log("webview tests passed");
