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

const payload = {
  initialState,
  sourceText,
  workingText,
  goldenText,
  sourcePath: virtualSourcePath,
  workingPath: virtualWorkingPath,
  sourceLabel,
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
`;

const html = renderReviewUi(initialState, bootstrap, theme);
await fs.rm(publicDir, { recursive: true, force: true });
await fs.mkdir(publicDir, { recursive: true });
await fs.writeFile(path.join(publicDir, "index.html"), html, "utf8");
await fs.writeFile(path.join(publicDir, ".nojekyll"), "", "utf8");
console.log(`cloud smoke built: ${path.relative(root, path.join(publicDir, "index.html"))}`);
console.log(`html bytes: ${Buffer.byteLength(html).toLocaleString()}`);
console.log(`golden bytes: ${Buffer.byteLength(goldenText).toLocaleString()}`);
