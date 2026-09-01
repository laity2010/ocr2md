import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import * as esbuild from "esbuild";

const require = createRequire(import.meta.url);
const root = process.cwd();
const out = path.join(root, "out");
const fixtureDir = path.join(root, "test-fixtures", "buffetts-alpha");
const publicDir = path.join(root, "cloud-smoke-dist");

const { renderReviewUi } = require(path.join(out, "reviewUi.js"));
const { candidatesFromSidecar } = require(path.join(out, "sidecar.js"));
const { annotationMatchSummary } = require(path.join(out, "annotation.js"));
const { ChapterReviewApplication } = require(path.join(out, "chapterReviewApplication.js"));
const { MODULE_REGEX_DEFAULTS, MODULE_REGEX_PRESETS } = require(path.join(out, "regexPresets.js"));

const [sourceText, workingText, goldenText, sidecarRaw] = await Promise.all([
  fs.readFile(path.join(fixtureDir, "source.md"), "utf8"),
  fs.readFile(path.join(fixtureDir, "working.md"), "utf8"),
  fs.readFile(path.join(fixtureDir, "expected-calibrated.md"), "utf8"),
  fs.readFile(path.join(fixtureDir, "sidecar.json"), "utf8"),
]);

const virtualSourcePath = "/demo/chapters/01 Buffett’s Alpha/01 Buffett’s Alpha.md";
const virtualWorkingPath = "/demo/chapters/01 Buffett’s Alpha/01 Buffett’s Alpha.working.md";
const sourceLabel = "chapters/01 Buffett’s Alpha/01 Buffett’s Alpha.md";
const loaded = candidatesFromSidecar(JSON.parse(sidecarRaw));
const rows = loaded.rows.map((row) => ({
  ...row,
  sourcePath: virtualSourcePath,
  workingCopyPath: row.workingCopyPath ? virtualWorkingPath : row.workingCopyPath,
  sourceLabel,
}));
const annotationPairs = loaded.annotationPairs.map((pair) => ({ ...pair, sourcePath: virtualSourcePath }));
const splitPatterns = (value) => value.split(/^\s*---\s*$/m).map((item) => item.trim()).filter(Boolean);
const review = new ChapterReviewApplication({ rows, annotationPairs });
review.refreshChapterTitle({
  baselineText: sourceText, workingText, sourcePath: virtualSourcePath, workingPath: virtualWorkingPath, sourceLabel,
  embedPatterns: splitPatterns(MODULE_REGEX_DEFAULTS["嵌入块"] ?? ""),
});
review.refreshAnnotation({
  baselineText: sourceText, workingText, sourcePath: virtualSourcePath, workingPath: virtualWorkingPath, sourceLabel,
  patterns: splitPatterns(MODULE_REGEX_DEFAULTS["注释"] ?? ""),
});
review.refreshEmbed({
  baselineText: sourceText, workingText, sourcePath: virtualSourcePath, workingPath: virtualWorkingPath, sourceLabel,
  patterns: splitPatterns(MODULE_REGEX_DEFAULTS["嵌入块"] ?? ""),
});
review.refreshIllegalLineBreak({ workingText, sourcePath: virtualSourcePath, workingPath: virtualWorkingPath });
const finalReview = review.snapshot();

const initialState = {
  workspaceLabel: "Cloud Smoke · Buffett’s Alpha",
  selectedFile: { label: sourceLabel, path: virtualSourcePath, kind: "chapter" },
  files: [{ label: sourceLabel, path: virtualSourcePath, kind: "chapter" }],
  activeModule: "章节标题",
  headingNumberingEnabled: true,
  rows: finalReview.rows,
  annotationPairs: finalReview.annotationPairs,
  moduleRegexPatterns: { ...MODULE_REGEX_DEFAULTS },
  moduleRegexPresets: MODULE_REGEX_PRESETS,
  viewMode: "table",
  annotationMatchSummary: annotationMatchSummary(finalReview.rows, finalReview.annotationPairs),
};

const bundleResult = await esbuild.build({
  entryPoints: [path.join(root, "web", "cloudSmokeRuntime.ts")],
  bundle: true,
  write: false,
  platform: "browser",
  format: "iife",
  globalName: "Ocr2mdCloudSmoke",
  target: ["es2022"],
  alias: {
    crypto: path.join(root, "web", "nodeCryptoShim.ts"),
    path: path.join(root, "node_modules", "path-browserify", "index.js"),
  },
  minify: false,
});
const runtimeBundle = bundleResult.outputFiles[0].text;

const googleDriveClientId = process.env.OCR2MD_GOOGLE_CLIENT_ID?.trim();
const googleDriveRootFolderId = process.env.OCR2MD_GOOGLE_ROOT_FOLDER_ID?.trim();
const googleDrive = googleDriveClientId
  ? { clientId: googleDriveClientId, ...(googleDriveRootFolderId ? { rootFolderId: googleDriveRootFolderId } : {}) }
  : undefined;

const payload = {
  initialState,
  sourceText,
  workingText,
  goldenText,
  sourcePath: virtualSourcePath,
  workingPath: virtualWorkingPath,
  sourceLabel,
  ...(googleDrive ? { googleDrive } : {}),
};
const payloadJson = JSON.stringify(payload).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
const bootstrap = `${runtimeBundle}\nOcr2mdCloudSmoke.install(${payloadJson});`;
const theme = `
  body { background: var(--ocr-background); }
  #cloud-smoke-status {
    position: fixed; z-index: 300; right: 14px; top: 10px;
    max-width: min(520px, calc(100vw - 28px)); padding: 7px 10px;
    border: 1px solid var(--ocr-border); border-radius: 999px;
    background: color-mix(in srgb, var(--ocr-background) 94%, transparent);
    box-shadow: 0 2px 12px rgba(0,0,0,.16); font: 600 12px/1.2 var(--ocr-font-family);
  }
  #cloud-smoke-status[data-kind="pass"] { border-color: var(--ocr-passed); color: var(--ocr-passed); }
  #cloud-smoke-status[data-kind="fail"] { border-color: var(--ocr-failed); color: var(--ocr-failed); }
  #cloud-smoke-source {
    position: fixed; z-index: 290; right: 14px; bottom: 14px; width: min(680px, calc(100vw - 28px));
    max-height: 180px; overflow: auto; margin: 0; padding: 12px;
    border: 1px solid var(--ocr-focus-border); border-radius: 6px;
    color: var(--ocr-foreground); background: var(--ocr-background);
    box-shadow: 0 6px 24px rgba(0,0,0,.25); white-space: pre-wrap;
    font: 12px/1.55 var(--ocr-editor-font-family); cursor: pointer;
  }
  .cloud-smoke-drive {
    position: fixed; z-index: 280; right: 14px; top: 48px;
    width: min(360px, calc(100vw - 28px)); padding: 14px;
    border: 1px solid var(--ocr-border); border-radius: 10px;
    color: var(--ocr-foreground); background: color-mix(in srgb, var(--ocr-background) 97%, transparent);
    box-shadow: 0 8px 28px rgba(0,0,0,.24); font: 13px/1.4 var(--ocr-font-family);
  }
  .cloud-smoke-drive[data-collapsed="true"] {
    width: auto; min-width: min(220px, calc(100vw - 28px)); padding: 9px 11px;
  }
  .cloud-smoke-drive__header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .cloud-smoke-drive__header-actions { display: flex; align-items: center; gap: 7px; }
  .cloud-smoke-drive__connection {
    padding: 2px 7px; border: 1px solid var(--ocr-border); border-radius: 999px;
    color: var(--ocr-description-foreground); font-size: 11px;
  }
  .cloud-smoke-drive__connection[data-connected="true"] { border-color: var(--ocr-passed); color: var(--ocr-passed); }
  .cloud-smoke-drive__collapse {
    padding: 3px 6px; border: 1px solid var(--ocr-border); border-radius: 5px;
    color: var(--ocr-foreground); background: var(--ocr-input-background); cursor: pointer;
    font-size: 11px;
  }
  .cloud-smoke-drive[data-collapsed="true"] .cloud-smoke-drive__body { display: none; }
  .cloud-smoke-drive__note { margin: 8px 0; color: var(--ocr-description-foreground); font-size: 12px; }
  .cloud-smoke-drive__actions { display: flex; flex-wrap: wrap; gap: 6px; }
  .cloud-smoke-drive__actions button {
    padding: 5px 8px; border: 1px solid var(--ocr-border); border-radius: 5px;
    color: var(--ocr-foreground); background: var(--ocr-input-background); cursor: pointer;
  }
  .cloud-smoke-drive__actions button:disabled { cursor: default; opacity: .5; }
  .cloud-smoke-drive__path {
    margin-top: 8px; color: var(--ocr-description-foreground); font: 11px/1.35 var(--ocr-editor-font-family);
    overflow-wrap: anywhere;
  }
  .cloud-smoke-drive__list {
    max-height: min(260px, 34vh); overflow: auto; margin: 10px 0 0; padding: 0;
    border-top: 1px solid var(--ocr-border); list-style: none;
  }
  .cloud-smoke-drive__item, .cloud-smoke-drive__message {
    display: flex; gap: 7px; padding: 7px 2px; border-bottom: 1px solid var(--ocr-border);
    overflow-wrap: anywhere;
  }
  .cloud-smoke-drive__message { color: var(--ocr-description-foreground); }
  .cloud-smoke-drive__icon { flex: none; }
  .cloud-smoke-drive__file {
    flex: 1; min-width: 0; padding: 0; border: 0; text-align: left;
    color: var(--ocr-text-link); background: transparent; cursor: pointer; font: inherit;
    overflow-wrap: anywhere;
  }
  .cloud-smoke-drive__file:hover { text-decoration: underline; }
  .cloud-smoke-drive__conflict {
    margin-top: 10px; padding: 10px; border: 1px solid color-mix(in srgb, var(--ocr-warning, #d29922) 70%, var(--ocr-border));
    border-radius: 7px; background: color-mix(in srgb, var(--ocr-warning, #d29922) 8%, var(--ocr-background));
  }
  .cloud-smoke-drive__conflict[hidden] { display: none; }
  .cloud-smoke-drive__conflict-message { margin: 6px 0 8px; color: var(--ocr-description-foreground); font-size: 12px; }
  .cloud-smoke-drive__preview { margin-top: 10px; border-top: 1px solid var(--ocr-border); }
  .cloud-smoke-drive__preview[hidden] { display: none; }
  .cloud-smoke-drive__preview-header {
    display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 0;
  }
  .cloud-smoke-drive__preview-header strong { min-width: 0; overflow-wrap: anywhere; }
  .cloud-smoke-drive__preview-header button {
    flex: none; padding: 3px 6px; border: 1px solid var(--ocr-border); border-radius: 5px;
    color: var(--ocr-foreground); background: var(--ocr-input-background); cursor: pointer;
  }
  .cloud-smoke-drive__preview-content {
    max-height: min(320px, 42vh); overflow: auto; margin: 0; padding: 9px;
    border: 1px solid var(--ocr-border); border-radius: 6px; white-space: pre-wrap; overflow-wrap: anywhere;
    color: var(--ocr-foreground); background: var(--ocr-editor-background, var(--ocr-background));
    font: 12px/1.55 var(--ocr-editor-font-family);
  }
`;

const html = renderReviewUi(initialState, bootstrap, theme);
await fs.rm(publicDir, { recursive: true, force: true });
await fs.mkdir(publicDir, { recursive: true });
await fs.writeFile(path.join(publicDir, "index.html"), html, "utf8");
await fs.writeFile(path.join(publicDir, ".nojekyll"), "", "utf8");
console.log(`cloud smoke built: ${path.relative(root, path.join(publicDir, "index.html"))}`);
console.log(`html bytes: ${Buffer.byteLength(html).toLocaleString()}`);
console.log(`golden bytes: ${Buffer.byteLength(goldenText).toLocaleString()}`);
console.log(`google drive panel: ${googleDrive ? "enabled" : "disabled"}`);
