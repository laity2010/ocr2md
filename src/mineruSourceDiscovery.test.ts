import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  discoverMineruSourceFiles,
  discoverMineruSourcePairs,
  matchMineruJsonForMarkdown,
  normalizeMineruText,
} from "./mineruSourceDiscovery";

function makeProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ocr2md-mineru-discovery-"));
  fs.mkdirSync(path.join(root, "json"));
  return root;
}

function writeMarkdown(root: string, name: string, chunks: string[]): string {
  const filePath = path.join(root, name);
  fs.writeFileSync(filePath, ["# Sample", ...chunks].join("\n\n"), "utf8");
  return filePath;
}

function writeJson(root: string, name: string, chunks: string[]): string {
  const filePath = path.join(root, "json", name);
  const pdfInfo = chunks.map((content, pageIndex) => ({
    page_idx: pageIndex,
    para_blocks: [{
      type: "text",
      index: 0,
      bbox: [10, 10, 100, 100],
      lines: [{
        bbox: [10, 10, 100, 100],
        spans: [{ type: "text", bbox: [10, 10, 100, 100], content }],
      }],
    }],
  }));
  fs.writeFileSync(filePath, JSON.stringify({
    pdf_info: pdfInfo,
    _version_name: "3.4.4",
    _backend: "hybrid",
  }), "utf8");
  return filePath;
}

const sourceA = [
  "Alpha source paragraph has enough unique content to identify the first MinerU document safely.",
  "Alpha second paragraph provides another independent signature for reliable content matching.",
  "Alpha third paragraph makes filename numbering irrelevant to the discovery decision.",
  "Alpha final paragraph closes this synthetic MinerU source with a unique textual fingerprint.",
];

const sourceB = [
  "Beta source paragraph belongs to a completely different MinerU document and should not cross match.",
  "Beta second paragraph supplies enough separate evidence for a deterministic source association.",
  "Beta third paragraph is intentionally unrelated to Alpha even when filenames suggest otherwise.",
  "Beta final paragraph verifies the discovery algorithm uses content instead of directory order.",
];

const root = makeProject();
try {
  const mdA = writeMarkdown(root, "00002 MinerU_markdown_alpha.md", sourceA);
  const mdB = writeMarkdown(root, "00001 MinerU_markdown_beta.md", sourceB);
  const jsonA = writeJson(root, "99 MinerU_alpha.json", sourceA);
  const jsonB = writeJson(root, "01 MinerU_beta.json", sourceB);
  fs.writeFileSync(path.join(root, "notes.md"), "# unrelated", "utf8");

  const files = discoverMineruSourceFiles(root);
  assert.deepStrictEqual(
    files.markdownPaths.map((item) => path.basename(item)),
    ["00001 MinerU_markdown_beta.md", "00002 MinerU_markdown_alpha.md"],
  );
  assert.deepStrictEqual(
    files.jsonPaths.map((item) => path.basename(item)),
    ["01 MinerU_beta.json", "99 MinerU_alpha.json"],
  );

  const matchA = matchMineruJsonForMarkdown(mdA, files.jsonPaths);
  assert.strictEqual(matchA.status, "matched");
  assert.strictEqual(matchA.jsonPath, jsonA);
  assert.strictEqual(matchA.candidates.find((item) => item.jsonPath === jsonA)?.score, 1);

  const matchB = matchMineruJsonForMarkdown(mdB, files.jsonPaths);
  assert.strictEqual(matchB.status, "matched");
  assert.strictEqual(matchB.jsonPath, jsonB);
  assert.strictEqual(matchB.candidates.find((item) => item.jsonPath === jsonB)?.score, 1);

  const pairs = discoverMineruSourcePairs(root);
  assert.strictEqual(pairs.matches.length, 2);
  assert.deepStrictEqual(
    pairs.matches.map((item) => [
      path.basename(item.markdownPath),
      item.status,
      item.jsonPath ? path.basename(item.jsonPath) : undefined,
    ]),
    [
      ["00001 MinerU_markdown_beta.md", "matched", "01 MinerU_beta.json"],
      ["00002 MinerU_markdown_alpha.md", "matched", "99 MinerU_alpha.json"],
    ],
  );
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

const ambiguousRoot = makeProject();
try {
  const markdown = writeMarkdown(
    ambiguousRoot,
    "00001 MinerU_markdown_same.md",
    sourceA,
  );
  writeJson(ambiguousRoot, "01 MinerU_same.json", sourceA);
  writeJson(ambiguousRoot, "02 MinerU_duplicate.json", sourceA);
  const files = discoverMineruSourceFiles(ambiguousRoot);
  const result = matchMineruJsonForMarkdown(markdown, files.jsonPaths);
  assert.strictEqual(result.status, "ambiguous");
  assert.strictEqual(result.jsonPath, undefined);
} finally {
  fs.rmSync(ambiguousRoot, { recursive: true, force: true });
}

const missingJsonRoot = makeProject();
try {
  const markdown = writeMarkdown(
    missingJsonRoot,
    "00001 MinerU_markdown_missing.md",
    sourceA,
  );
  const result = matchMineruJsonForMarkdown(markdown, []);
  assert.strictEqual(result.status, "missing-json");
} finally {
  fs.rmSync(missingJsonRoot, { recursive: true, force: true });
}

const invalidJsonRoot = makeProject();
try {
  const markdown = writeMarkdown(
    invalidJsonRoot,
    "00001 MinerU_markdown_invalid.md",
    sourceA,
  );
  const invalid = path.join(invalidJsonRoot, "json", "01 invalid.json");
  fs.writeFileSync(invalid, "{not-json", "utf8");
  const result = matchMineruJsonForMarkdown(markdown, [invalid]);
  assert.strictEqual(result.status, "invalid-json");
  assert.strictEqual(result.candidates[0].valid, false);
} finally {
  fs.rmSync(invalidJsonRoot, { recursive: true, force: true });
}

const unmatchedRoot = makeProject();
try {
  const markdown = writeMarkdown(
    unmatchedRoot,
    "00001 MinerU_markdown_unmatched.md",
    sourceA,
  );
  const json = writeJson(unmatchedRoot, "01 other.json", sourceB);
  const result = matchMineruJsonForMarkdown(markdown, [json]);
  assert.strictEqual(result.status, "unmatched");
  assert.strictEqual(result.jsonPath, undefined);
} finally {
  fs.rmSync(unmatchedRoot, { recursive: true, force: true });
}

const absent = matchMineruJsonForMarkdown(
  path.join(os.tmpdir(), "definitely-not-present-mineru.md"),
  [],
);
assert.strictEqual(absent.status, "missing-markdown");

assert.strictEqual(
  normalizeMineruText("# 标题\n\n正文　带有 空格"),
  "标题正文带有空格",
);

console.log("MinerU source discovery tests passed");
