import assert from "node:assert/strict";
import {
  adoptedMediaLocalPath,
  deriveAdoptedMediaRoutes,
  deriveMediaCatalog,
} from "../src/mediaCatalog";
import type { ChapterWorkspaceData } from "../src/chapterRepository";

const chapter: ChapterWorkspaceData = {
  id: "chapter-1",
  kind: "chapter",
  path: "chapters/01 Demo",
  name: "01 Demo",
  originalText: "",
  workingText: [
    "![[imgs/used.png]]",
    "![also used](./imgs/also-used.jpg)",
    '<img src="imgs/html-used.webp">',
    "![remote](https://cdn.example.com/media/remote.png)",
    '<img src="https://cdn.example.com/media/html-remote.jpg">',
    "[ordinary link](https://example.com/not-an-image-page)",
  ].join("\n"),
  rows: [],
  annotationPairs: [],
  media: [
    { fileName: "used.png", relativePath: "imgs/used.png", sizeBytes: 100, mimeType: "image/png" },
    { fileName: "unused.gif", relativePath: "imgs/unused.gif", sizeBytes: 200, mimeType: "image/gif" },
    { fileName: "also-used.jpg", relativePath: "imgs/also-used.jpg", sizeBytes: 300, mimeType: "image/jpeg" },
    { fileName: "html-used.webp", relativePath: "imgs/html-used.webp", sizeBytes: 400, mimeType: "image/webp" },
  ],
};

const catalog = deriveMediaCatalog(chapter);
assert.deepEqual(
  catalog.map((item) => [item.group, item.displayName]),
  [
    ["已采用", "also-used.jpg"],
    ["已采用", "html-used.webp"],
    ["已采用", "used.png"],
    ["未采用", "unused.gif"],
    ["未下载", "html-remote.jpg"],
    ["未下载", "remote.png"],
  ],
);
assert.equal(
  catalog.filter((item) => item.group === "未下载").length,
  2,
  "ordinary HTTPS links must not enter the media catalog",
);
assert.equal(
  catalog.find((item) => item.displayName === "remote.png")?.sourceUrl,
  "https://cdn.example.com/media/remote.png",
);

const sidecarAdopted: ChapterWorkspaceData = {
  ...chapter,
  workingText: "![remote](https://cdn.example.com/media/remote.png)",
  rows: [{
    id: "mapped",
    kind: "regex",
    label: "mapped",
    raw: "![remote](https://cdn.example.com/media/remote.png)",
    preview: "mapped",
    range: { line: 0, start: 0, end: 1 },
    typeLabel: "嵌入块",
    lineType: "嵌入链接",
    localPath: "imgs/used.png",
  }],
  media: [
    { fileName: "used.png", relativePath: "imgs/used.png", sizeBytes: 100, mimeType: "image/png" },
  ],
};
const mappedCatalog = deriveMediaCatalog(sidecarAdopted);
assert.deepEqual(
  mappedCatalog.map((item) => [item.group, item.displayName]),
  [["已采用", "used.png"]],
  "an existing sidecar localPath must adopt the real local media and suppress its old external URL",
);
const adoptedRoutes = deriveAdoptedMediaRoutes(sidecarAdopted);
assert.equal(
  adoptedMediaLocalPath("https://cdn.example.com/media/remote.png", adoptedRoutes),
  "imgs/used.png",
  "preview routing must honor the exact sidecar source target",
);
assert.equal(
  adoptedMediaLocalPath("legacy/path/remote.png", adoptedRoutes),
  "imgs/used.png",
  "preview routing must fall back to a unique source basename for legacy rewritten paths",
);
const preservedLegacyRoutes = deriveAdoptedMediaRoutes({
  ...sidecarAdopted,
  rows: [],
  mediaSourceRoutes: [{ source: "image.png", localPath: "imgs/used.png" }],
});
assert.equal(
  adoptedMediaLocalPath("ocr2md/legacy/chapter/image.png", preservedLegacyRoutes),
  "imgs/used.png",
  "preview routing must preserve sidecar mappings even when refreshed rows no longer carry the old raw target",
);

console.log("mediaCatalog tests passed");
