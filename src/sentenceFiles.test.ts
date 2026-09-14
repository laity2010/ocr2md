import * as assert from "assert";
import {
  buildSentenceSourceFile,
  parseSentenceTranslationFile,
  sentenceCandidatesFromFiles,
} from "./sentenceFiles";

const markdown = [
  "# Title",
  "<br>",
  "Alpha $R_t$ rose.[^1] Next sentence.",
  "<br>",
  "$$",
  "E = mc^2",
  "$$",
  "<br>",
  ">",
  "![image](imgs/a.png)",
  "><embed id=01></embed>",
  "<br>",
  "[^1]: note",
].join("\n");

const source = buildSentenceSourceFile(markdown, "/vault/chapter/trans/chapter.working.md");
assert.ok(source.entries.length >= 3);
assert.ok(source.entries.every((entry) => !entry.sourceText.includes("E = mc^2")));
assert.ok(source.entries.every((entry) => !entry.sourceText.includes("imgs/a.png")));
const alpha = source.entries.find((entry) => entry.sourceText.includes("Alpha"));
assert.ok(alpha);
assert.ok(alpha!.translationText.includes("<ocr2md-protected"));
assert.ok(!alpha!.translationText.includes("$R_t$"));
assert.ok(!alpha!.translationText.includes("[^1]"));

const deepl = parseSentenceTranslationFile({
  version: 1,
  provider: "deepl",
  sourceFile: "original.json",
  entries: {
    [alpha!.id]: {
      sentenceId: alpha!.id,
      sourceFingerprint: alpha!.sourceFingerprint,
      contextFingerprint: alpha!.contextFingerprint,
      translatedText: "Alpha 译文",
      status: "translated",
    },
  },
});
assert.ok(deepl);
const chatgpt = parseSentenceTranslationFile({
  version: 1,
  provider: "chatgpt",
  sourceFile: "original.json",
  entries: {},
});
assert.ok(chatgpt);

const rows = sentenceCandidatesFromFiles(source, [deepl!, chatgpt!]);
const alphaRow = rows.find((row) => row.id === alpha!.id);
assert.strictEqual(alphaRow?.translationResults?.deepl.translatedText, "Alpha 译文");
assert.strictEqual(alphaRow?.translationResults?.deepl.status, "已翻译");
assert.strictEqual(alphaRow?.translationResults?.chatgpt.status, "待翻译");

console.log("sentenceFiles tests passed");
