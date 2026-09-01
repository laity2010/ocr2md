import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { renderReviewUi } from "./reviewUi";
import { CHAPTER_REVIEW_COMMANDS } from "./uiProtocol";
import type { SidebarState } from "./types";

const fixtureRoot = path.join(process.cwd(), "test-fixtures", "buffetts-alpha");
const sidecar = JSON.parse(fs.readFileSync(path.join(fixtureRoot, "sidecar.json"), "utf8")) as {
  annotations?: SidebarState["rows"];
  annotationPairs?: SidebarState["annotationPairs"];
};

const state: SidebarState = {
  workspaceLabel: "/browser-workspace",
  selectedFile: { label: "01 Buffett’s Alpha.md", path: "/browser-workspace/chapters/01 Buffett’s Alpha/01 Buffett’s Alpha.md", kind: "chapter" },
  files: [],
  activeModule: "章节标题",
  headingNumberingEnabled: true,
  rows: sidecar.annotations ?? [],
  annotationPairs: sidecar.annotationPairs ?? [],
  moduleRegexPatterns: { "注释": "", "嵌入块": "" },
  moduleRegexPresets: { "注释": [], "嵌入块": [] },
};

const browserBootstrap = `
    window.ocr2mdHost = {
      postMessage(message) { window.__lastOcr2mdMessage = message; },
      getState() { return window.__ocr2mdState || {}; },
      setState(value) { window.__ocr2mdState = value; },
      onState(listener) { window.__ocr2mdStateListener = listener; },
    };
`;
const html = renderReviewUi(state, browserBootstrap);

assert.ok(!html.includes("acquireVsCodeApi"), "shared review UI must not require the VS Code API");
assert.ok(!html.includes("--vscode-"), "shared review UI must not require VS Code theme variables");
assert.ok(!html.includes("VS Code SecretStorage"), "shared review UI copy must not name a specific host secret store");
assert.ok(html.includes("const host = window.ocr2mdHost"), "shared UI must use the generic host bridge");
for (const hostMethod of ["host.postMessage", "host.getState", "host.setState", "host.onState"]) {
  assert.ok(html.includes(hostMethod), `shared UI is missing host method: ${hostMethod}`);
}
for (const command of CHAPTER_REVIEW_COMMANDS) {
  assert.ok(html.includes(`"${command}"`), `shared chapters UI is missing command: ${command}`);
}
for (const moduleName of ["章节定界", "章节标题", "注释", "嵌入块", "非法断行"]) {
  assert.ok(html.includes(moduleName), `shared chapters UI is missing module: ${moduleName}`);
}
for (const variable of ["--ocr-foreground", "--ocr-border", "--ocr-header-background", "--ocr-focus-border"]) {
  assert.ok(html.includes(variable), `shared UI semantic theme variable missing: ${variable}`);
}
for (const workbenchChrome of ["workbench-header", "workbench-title", "workbench-file"]) {
  assert.ok(html.includes(workbenchChrome), `shared review UI is missing workbench chrome: ${workbenchChrome}`);
}
assert.ok(html.includes(state.workspaceLabel), "shared review UI must expose the active workspace label");
assert.ok(html.includes(state.selectedFile?.label ?? ""), "shared review UI must expose the active Markdown file label");


for (const text of [
  "设置章节文件",
  "创建/打开章节工作稿",
  "为标题编号",
  "匹配注释对",
  "下载图片到本地",
  "候选由正文段落边界自动派生",
  "上一行",
  "下一行",
  "合并预览",
  "开始翻译",
  "继续翻译",
  "导出双向互译",
]) {
  assert.ok(html.includes(text), `shared review UI is missing user-facing behavior: ${text}`);
}
for (const sharedBehavior of [
  "moduleDefinition().bulkEdit",
  "moduleDefinition().regexCard",
  "definition.selectable",
  "definition.editableLineType",
  "definition.extraColumns.includes",
  "definition.previewKind",
  "definition.detailKind",
  "definition.tableKind",
  "definition.typeColumnLabel",
]) {
  assert.ok(html.includes(sharedBehavior), `shared review base renderer is missing definition-driven behavior: ${sharedBehavior}`);
}
assert.ok(html.includes("function restoreScroll()"), "shared review base must preserve table scroll");
assert.ok(html.includes("function restoreFocus()"), "shared review base must preserve row focus");
assert.ok(html.includes("event.shiftKey"), "shared review base must support multi-column sorting");
assert.ok(html.includes("persisted.selectedIds"), "shared review base must preserve multi-select state");
assert.ok(html.includes('previewCell.addEventListener("click", () => post("locateRow", { id: candidate.id }))'), "shared review base must expose source-location navigation");
assert.ok(html.includes('postKeepView("setRowsLineType"'), "shared review base must expose line-type review commands");

const reviewUiSource = fs.readFileSync(path.join(process.cwd(), "src", "reviewUi.ts"), "utf8");
for (const forbiddenBranch of [
  'state.activeModule === "章节定界"',
  'state.activeModule === "章节标题"',
  'state.activeModule === "注释"',
  'state.activeModule === "嵌入块"',
  'state.activeModule === "非法断行"',
]) {
  assert.ok(!reviewUiSource.includes(forbiddenBranch), `shared review base must not hard-code module branch: ${forbiddenBranch}`);
}

const scriptStart = html.indexOf("<script>") + "<script>".length;
const scriptEnd = html.lastIndexOf("</script>");
assert.doesNotThrow(() => new Function(html.slice(scriptStart, scriptEnd)), "browser-hosted shared UI JavaScript must be syntactically valid");

console.log("reviewUi tests passed");
