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

const scriptStart = html.indexOf("<script>") + "<script>".length;
const scriptEnd = html.lastIndexOf("</script>");
assert.doesNotThrow(() => new Function(html.slice(scriptStart, scriptEnd)), "browser-hosted shared UI JavaScript must be syntactically valid");

console.log("reviewUi tests passed");
