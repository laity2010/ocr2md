import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  getMineruChapterProjection,
  loadMineruProjectAnnotationSourceMap,
  mineruSourceMapCachePath,
} from "./mineruAnnotationSourceMap";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "ocr2md-wp4-project-"));
const cacheDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "ocr2md-wp4-cache-"));
const projectCache = { cacheDirectory };

function block(type: string, index: number, content: string) {
  return {
    type,
    index,
    bbox: [10, 12, 500, 800],
    lines: [{
      bbox: [10, 12, 500, 800],
      spans: [{ type: "text", content, bbox: [10, 12, 500, 800] }],
    }],
  };
}

function page(
  pageIndex: number,
  paragraph: string,
  footnotes: string[] = [],
  preprocText = paragraph,
) {
  return {
    page_idx: pageIndex,
    para_blocks: [block("text", 0, paragraph)],
    preproc_blocks: [block("text", 0, preprocText)],
    discarded_blocks: footnotes.map((text, i) => block("page_footnote", i + 1, text)),
  };
}

const alpha = [
  "Alpha text establishes a unique document identity and starts the first citation① followed by a second citation① within the same physical PDF page.",
  "Alpha text on the second page offers another independent document-content signature without a footnote.",
  "Alpha citation② has no body but a separate citation③ has a valid explanatory note, allowing the incomplete one to survive.",
  "Alpha final page contains an intentionally absent chapter citation④ which must remain unassigned rather than guessed.",
];
const beta = [
  "Beta original text is wholly independent of Alpha and has a reliable first-page citation① at the end.",
  "Beta second page contains plain content without a reference but a page-footnote body was recovered.",
  "Beta source contains a citation② and two competing footnote bodies for exactly the same page and number.",
  "Beta CIP catalog text has circled ① notation with no reliable page footnote; it needs an unverified audit entry.",
];

function writeInputs() {
  fs.mkdirSync(path.join(root, "json"), { recursive: true });
  fs.mkdirSync(path.join(root, "chapters", "01 Alpha"), { recursive: true });
  fs.mkdirSync(path.join(root, "chapters", "02 Beta"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "00001 MinerU_markdown_alpha.md"),
    "# Alpha\n\n" + alpha.join("\n\n") + "\n",
  );
  fs.writeFileSync(
    path.join(root, "00002 MinerU_markdown_beta.md"),
    "# Beta\n\n" + beta.join("\n\n") + "\n",
  );
  fs.writeFileSync(
    path.join(root, "json", "A.json"),
    JSON.stringify({
      _version_name: "3.4.4",
      pdf_info: [
        page(0, alpha[0], ["① Alpha shared body."]),
        page(1, alpha[1]),
        page(2, alpha[2], ["③ Alpha valid body."]),
        page(3, alpha[3], ["④ Alpha unlocated body."]),
      ],
    }),
  );
  fs.writeFileSync(
    path.join(root, "json", "B.json"),
    JSON.stringify({
      _version_name: "3.4.4",
      pdf_info: [
        page(0, beta[0], ["① Beta page-zero note."]),
        page(1, beta[1], ["① Orphan body.", "Unidentified footnote text"]),
        page(2, beta[2], ["② Duplicate first.", "② Duplicate second."]),
        page(3, beta[3]),
      ],
    }),
  );
  fs.writeFileSync(path.join(root, "json", "bad.json"), "{broken-json");
  fs.writeFileSync(
    path.join(root, "chapters", "01 Alpha", "01 Alpha.md"),
    "# Alpha\n\n" + alpha.slice(0, 3).join("\n\n") + "\n",
  );
  fs.writeFileSync(
    path.join(root, "chapters", "02 Beta", "02 Beta.md"),
    "# Beta\n\n" + [beta[0], beta[2]].join("\n\n") + "\n",
  );
  fs.writeFileSync(
    path.join(root, "chapters", "02 Beta", "02 Beta.working.md"),
    "# This working file must never be used for source-map proof\n",
  );
  fs.writeFileSync(
    path.join(root, "chapters", "01 Alpha", "01 Alpha.ocr2md.json"),
    "USER-CONFIRMED-SIDECAR-DO-NOT-EDIT",
  );
}
writeInputs();

try {
  const initial = loadMineruProjectAnnotationSourceMap(root, projectCache);
  assert.strictEqual(initial.cache, "rebuilt");
  assert.strictEqual(initial.cachePath, mineruSourceMapCachePath(root, cacheDirectory));
  assert.strictEqual(initial.sourceMap.documents.length, 2);
  assert.strictEqual(initial.sourceMap.chapters.length, 2);
  assert.deepStrictEqual(initial.sourceMap.references, {
    total: 7, matched: 6, missing: 1, ambiguous: 0,
  });
  assert.strictEqual(initial.sourceMap.totalRows, 14);
  assert.strictEqual(initial.sourceMap.unassignedRows.length, 3);
  assert.strictEqual(initial.sourceMap.issues.filter((item) =>
    item.type === "unpaired-json").length, 1);
  assert.ok(initial.sourceMap.issues.some((item) => item.type === "unverified-reference"));
  assert.ok(initial.sourceMap.issues.some((item) => item.type === "unidentified-footnote"));

  const alphaChapter = getMineruChapterProjection(initial.sourceMap, "01 Alpha");
  const betaChapter = getMineruChapterProjection(
    initial.sourceMap, path.join("chapters", "02 Beta", "02 Beta.md"),
  );
  assert.ok(alphaChapter && betaChapter);
  assert.strictEqual(alphaChapter?.rows.length, 6);
  assert.strictEqual(betaChapter?.rows.length, 5);
  const alphaShared = initial.sourceMap.documents[0].facts.annotations[0];
  assert.strictEqual(alphaShared.status, "shared");
  assert.strictEqual(alphaShared.references.length, 2);

  const sharedBody = alphaChapter?.rows.find((item) =>
    item.lineType === "注释正文" && item.annotationNumber === 1);
  assert.ok(sharedBody);
  assert.strictEqual(sharedBody?.navigationTargets.length, 2);
  assert.ok(sharedBody?.navigationTargets[0].start !== sharedBody?.navigationTargets[1].start);
  assert.ok(sharedBody?.navigationTarget?.anchorText.includes("citation①"));
  const refRow = alphaChapter?.rows.find((item) => item.lineType === "注释引用");
  assert.ok(refRow?.navigationTarget?.anchorTextHash);
  assert.ok(refRow?.navigationTarget?.anchorPreviousHash);
  assert.ok(refRow?.navigationTarget?.anchorNextHash);

  const aKey = alphaChapter?.rows.find((item) => item.lineType === "注释引用")?.annotationKey;
  const bKey = betaChapter?.rows.find((item) =>
    item.lineType === "注释引用" && item.annotationNumber === 1)?.annotationKey;
  assert.notStrictEqual(aKey, bKey, "A:p0:n1 and B:p0:n1 must be different identities");

  const duplicateBody = betaChapter?.rows.filter((item) =>
    item.lineType === "注释正文" && item.annotationNumber === 2);
  assert.strictEqual(duplicateBody?.length, 2, "duplicate JSON bodies must both survive");
  assert.ok(duplicateBody?.every((item) => item.status === "匹配歧义"));
  const missingBody = alphaChapter?.rows.find((item) =>
    item.annotationNumber === 2 && item.lineType === "注释引用");
  assert.strictEqual(missingBody?.status, "注释正文缺失");
  assert.ok(initial.sourceMap.unassignedRows.some((row) =>
    row.annotationNumber === 4 && row.status === "MD引用缺失"));
  assert.ok(initial.sourceMap.unassignedRows.some((row) =>
    row.annotationNumber === 1 && row.lineType === "注释正文"
    && row.status === "MD引用缺失"));
  assert.strictEqual(initial.sourceMap.documents[1].facts.annotations.find(
    (item) => item.pageIndex === 2 && item.annotationNumber === 2,
  )?.bodies.length, 2);
  assert.deepStrictEqual(getMineruChapterProjection(initial.sourceMap, "unknown"), undefined);

  const cacheStatBefore = fs.statSync(initial.cachePath);
  assert.strictEqual(cacheStatBefore.mode & 0o777, 0o600);
  assert.strictEqual(fs.statSync(cacheDirectory).mode & 0o777, 0o700);
  const second = loadMineruProjectAnnotationSourceMap(root, projectCache);
  assert.strictEqual(second.cache, "hit");
  assert.strictEqual(second.sourceMap.sourceFingerprint, initial.sourceMap.sourceFingerprint);
  assert.strictEqual(fs.statSync(second.cachePath).mtimeMs, cacheStatBefore.mtimeMs);

  // A working draft does not alter authoritative chapter originals.
  const working = path.join(root, "chapters", "02 Beta", "02 Beta.working.md");
  fs.appendFileSync(working, "Unrelated temporary editing text.\n");
  assert.strictEqual(loadMineruProjectAnnotationSourceMap(root, projectCache).cache, "hit");

  // Every class of authoritative input invalidates the derivative cache.
  const chapter = path.join(root, "chapters", "01 Alpha", "01 Alpha.md");
  fs.appendFileSync(chapter, "\n");
  assert.strictEqual(loadMineruProjectAnnotationSourceMap(root, projectCache).cache, "rebuilt");
  assert.strictEqual(loadMineruProjectAnnotationSourceMap(root, projectCache).cache, "hit");

  const markdown = path.join(root, "00001 MinerU_markdown_alpha.md");
  fs.appendFileSync(markdown, "\n");
  assert.strictEqual(loadMineruProjectAnnotationSourceMap(root, projectCache).cache, "rebuilt");

  const jsonFile = path.join(root, "json", "A.json");
  const oldTime = fs.statSync(jsonFile).mtime;
  const jsonText = fs.readFileSync(jsonFile, "utf8");
  const modified = jsonText.replace("Alpha shared body.", "Alpha shared bodY.");
  assert.strictEqual(modified.length, jsonText.length);
  fs.writeFileSync(jsonFile, modified);
  fs.utimesSync(jsonFile, oldTime, oldTime);
  const changed = loadMineruProjectAnnotationSourceMap(root, projectCache);
  assert.strictEqual(changed.cache, "rebuilt",
    "content hash must detect same-size edits even when mtime is preserved");
  assert.ok(changed.sourceMap.documents[0].facts.annotations[0].bodies[0].raw.includes("bodY"));

  // Even WP1's size+mtime cached probes must be reset after a hash-only change.
  const previous = fs.readFileSync(jsonFile, "utf8");
  const parsed = JSON.parse(previous);
  parsed.pdf_info[1].para_blocks[0].lines[0].spans[0].content =
    parsed.pdf_info[1].para_blocks[0].lines[0].spans[0].content.replace("second", "sec0nd");
  const probeChanged = JSON.stringify(parsed);
  assert.strictEqual(probeChanged.length, previous.length);
  const beforeProbeMtime = fs.statSync(jsonFile).mtime;
  fs.writeFileSync(jsonFile, probeChanged);
  fs.utimesSync(jsonFile, beforeProbeMtime, beforeProbeMtime);
  const resampled = loadMineruProjectAnnotationSourceMap(root, projectCache);
  assert.strictEqual(resampled.cache, "rebuilt");
  assert.strictEqual(resampled.sourceMap.discovery.matches[0].candidates.find((c) =>
    path.basename(c.jsonPath) === "A.json")?.score, 0.75,
  "stale WP1 probes must not survive a WP4 content-hash invalidation");

  // Broken cache never becomes authority; it is safely recomputed.
  fs.writeFileSync(changed.cachePath, "{not-json");
  assert.strictEqual(loadMineruProjectAnnotationSourceMap(root, projectCache).cache, "rebuilt");
  assert.strictEqual(loadMineruProjectAnnotationSourceMap(root, {
    ...projectCache,
    forceRebuild: true,
  }).cache, "rebuilt");

  // Two identically matching chapter locations are unresolved, never chosen by order.
  for (const name of ["03 Repeat", "04 Repeat"]) {
    const dir = path.join(root, "chapters", name);
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, name + ".md"), "# Repeat\n\n" + alpha[3] + "\n");
  }
  const ambiguous = loadMineruProjectAnnotationSourceMap(root, projectCache);
  assert.strictEqual(ambiguous.sourceMap.references.ambiguous, 1);
  assert.ok(ambiguous.sourceMap.unassignedRows.some((row) =>
    row.status === "匹配歧义" && row.candidates.length === 2));
  assert.strictEqual(fs.readFileSync(
    path.join(root, "chapters", "01 Alpha", "01 Alpha.ocr2md.json"), "utf8",
  ), "USER-CONFIRMED-SIDECAR-DO-NOT-EDIT");

  // Two MDs claiming the same JSON are surfaced as a pairing error, not duplicated.
  fs.copyFileSync(
    markdown,
    path.join(root, "00003 MinerU_markdown_alpha-copy.md"),
  );
  const duplicatePair = loadMineruProjectAnnotationSourceMap(root, projectCache);
  assert.ok(duplicatePair.sourceMap.issues.some((issue) =>
    issue.type === "pairing" && issue.reason.includes("多个 Markdown")));
  assert.strictEqual(duplicatePair.sourceMap.documents.length, 1);
  assert.strictEqual(duplicatePair.sourceMap.references.total, 2);

  console.log("MinerU source-map cache and projection tests passed");
} finally {
  // Clean only the self-created, mkdtemp-isolated test fixtures.
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(cacheDirectory, { recursive: true, force: true });
}
