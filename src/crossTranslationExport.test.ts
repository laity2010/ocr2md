import * as assert from "assert";
import { exportCrossTranslation, normalizeVaultRelativePath } from "./crossTranslationExport";
import { emptyTranslationState, recordTranslation } from "./translationState";
import { scanTranslationUnits } from "./translationUnits";

const source = [
  "---",
  "ocr2md_format_calibrated: true",
  "---",
  "",
  "## Chapter Title",
  "<br>",
  "First sentence. Second $x+1$ sentence.[^1] Read [the source](https://example.com/a.b) and use `code.v1`.",
  "<br>",
  ">",
  "Figure 2. How Berkshire Stacks Up",
  "![[imgs/example.jpg]]",
  ">",
  "Notes: This figure shows the distribution...",
  "><embed id=01></embed>",
  "<br>",
  "$$",
  "E = mc^2",
  "$$",
  "<br>",
  "[^1]: Footnote sentence one. Footnote sentence two.",
  "<br>",
].join("\n");
const sourcePath = "/vault/project/chapters/04/trans/04 Chapter.md";
const units = scanTranslationUnits(source, sourcePath);
const state = emptyTranslationState(sourcePath);
const translations = new Map<string, string>([
  ["## Chapter Title", "## 章节标题"],
  ["First sentence.", "第一句。"],
  ["Second $x+1$ sentence.[^1]", "第二个 $x+1$ 句子。[^1]"],
  ["Read [the source](https://example.com/a.b) and use `code.v1`.", "请阅读[资料来源](https://example.com/a.b)，并使用 `code.v1`。"],
  ["Figure 2. How Berkshire Stacks Up", "图 2：伯克希尔的表现"],
  ["Notes: This figure shows the distribution...", "注：本图显示相关分布……"],
  ["[^1]: Footnote sentence one.", "[^1]: 注释句子1。"],
  ["Footnote sentence two.", "注释句子2。"],
]);
for (const unit of units) {
  const translated = translations.get(unit.raw);
  assert.ok(translated, `missing fixture translation for ${unit.raw}`);
  recordTranslation(state, unit, translated!);
}

const result = exportCrossTranslation({
  sourceMarkdown: source,
  sourcePath,
  chapterFileName: "04 Chapter.md",
  outputVaultRelativePath: "English/weaver/Book",
  translationState: state,
});
assert.strictEqual(result.orgFileName, "org2trans 04 Chapter.md");
assert.strictEqual(result.transFileName, "trans2org 04 Chapter.md");
assert.strictEqual(result.pureTransFileName, "trans 04 Chapter.md");
assert.ok(result.orgMarkdown.startsWith("---\nocr2md_format_calibrated: true\n---\n"));
assert.ok(result.orgMarkdown.includes("First sentence.\n^sid-2-1"));
assert.ok(result.orgMarkdown.includes(">![[English/weaver/Book/trans2org 04 Chapter#^sid-2-1]]"));
assert.ok(result.transMarkdown.includes("第一句。\n^sid-2-1"));
assert.ok(result.transMarkdown.includes(">![[English/weaver/Book/org2trans 04 Chapter#^sid-2-1]]"));
assert.ok(!result.orgMarkdown.includes("trans2org 04 Chapter.md#"));

assert.ok(result.orgMarkdown.includes([
  "## Chapter Title",
  "^sid-1-1",
  "",
  ">[! ds]-",
  ">![[English/weaver/Book/trans2org 04 Chapter#^sid-1-1]]",
  "",
  "<br>",
  "",
].join("\n")), "title spacing must match the requested Obsidian format");
assert.ok(result.orgMarkdown.includes([
  "First sentence.",
  "^sid-2-1",
  ">[! ds]-",
  ">![[English/weaver/Book/trans2org 04 Chapter#^sid-2-1]]",
  "",
  "Second $x+1$ sentence.[^1]",
].join("\n")), "ordinary sentences must have one blank line after each callout");
assert.ok(result.orgMarkdown.includes([
  "Read [the source](https://example.com/a.b) and use `code.v1`.",
  "^sid-2-3",
  ">[! ds]-",
  ">![[English/weaver/Book/trans2org 04 Chapter#^sid-2-3]]",
  "",
  "<br>",
  "",
].join("\n")), "paragraph-final sentence must be followed by a blank-separated <br>");
assert.ok(result.transMarkdown.includes([
  "## 章节标题",
  "^sid-1-1",
  "",
  ">[! ds]-",
  ">![[English/weaver/Book/org2trans 04 Chapter#^sid-1-1]]",
  "",
  "<br>",
  "",
].join("\n")), "translated title spacing must mirror org2trans");
assert.ok(result.transMarkdown.includes([
  "第一句。",
  "^sid-2-1",
  ">[! ds]-",
  ">![[English/weaver/Book/org2trans 04 Chapter#^sid-2-1]]",
  "",
  "第二个 $x+1$ 句子。[^1]",
].join("\n")), "translated ordinary sentence spacing must mirror org2trans");
assert.ok(result.transMarkdown.includes([
  "请阅读[资料来源](https://example.com/a.b)，并使用 `code.v1`。",
  "^sid-2-3",
  ">[! ds]-",
  ">![[English/weaver/Book/org2trans 04 Chapter#^sid-2-3]]",
  "",
  "<br>",
  "",
].join("\n")), "translated paragraph-final spacing must mirror org2trans");
assert.ok(result.orgMarkdown.includes([
  ">",
  "Figure 2. How Berkshire Stacks Up",
  ">>[! ds]-",
  ">>图 2：伯克希尔的表现",
  ">",
  "![[imgs/example.jpg]]",
].join("\n")));
assert.ok(result.transMarkdown.includes([
  ">",
  "图 2：伯克希尔的表现",
  ">>[! ds]-",
  ">>Figure 2. How Berkshire Stacks Up",
  ">",
  "![[imgs/example.jpg]]",
].join("\n")));
const compositeStart = result.orgMarkdown.indexOf("\n>\nFigure 2");
const compositeEnd = result.orgMarkdown.indexOf("$$\nE = mc^2", compositeStart);
const compositeOrg = result.orgMarkdown.slice(compositeStart, compositeEnd);
assert.ok(!/\^sid-|#\^sid-/.test(compositeOrg));
assert.ok(result.orgMarkdown.includes("$$\nE = mc^2\n$$"));
const formulaOrg = result.orgMarkdown.slice(result.orgMarkdown.indexOf("$$\n"), result.orgMarkdown.indexOf("\n$$") + 3);
assert.ok(!/\^sid-|\[! ds\]/.test(formulaOrg));
assert.ok(result.orgMarkdown.includes("[^1]: Footnote sentence one. Footnote sentence two.\n<br>\n"));
assert.ok(result.transMarkdown.includes("[^1]: 注释句子1。 注释句子2。\n<br>\n"));
const footnoteOrgStart = result.orgMarkdown.indexOf("[^1]: Footnote sentence one.");
const footnoteOrgEnd = result.orgMarkdown.indexOf("<br>", footnoteOrgStart);
const footnoteOrg = result.orgMarkdown.slice(footnoteOrgStart, footnoteOrgEnd);
const footnoteTransStart = result.transMarkdown.indexOf("[^1]: 注释句子1。");
const footnoteTransEnd = result.transMarkdown.indexOf("<br>", footnoteTransStart);
const footnoteTrans = result.transMarkdown.slice(footnoteTransStart, footnoteTransEnd);
assert.ok(!/\^sid-|\[! ds\]|!\[\[.*#\^sid-/.test(footnoteOrg), "org2trans footnote body must not contain anchors or callouts");
assert.ok(!/\^sid-|\[! ds\]|!\[\[.*#\^sid-/.test(footnoteTrans), "trans2org footnote body must not contain anchors or callouts");
assert.ok(result.orgMarkdown.includes("Second $x+1$ sentence.[^1]"));
assert.ok(result.transMarkdown.includes("第二个 $x+1$ 句子。[^1]"));
assert.ok(result.transMarkdown.includes("请阅读[资料来源](https://example.com/a.b)，并使用 `code.v1`。"));
assert.ok(result.orgMarkdown.includes("[the source](https://example.com/a.b)"));
assert.ok(result.transMarkdown.includes("[资料来源](https://example.com/a.b)"));
assert.ok(result.transMarkdown.includes("`code.v1`"));

assert.ok(result.pureTransMarkdown.includes("## 章节标题"));
assert.ok(result.pureTransMarkdown.includes("第一句。 第二个 $x+1$ 句子。[^1] 请阅读[资料来源](https://example.com/a.b)，并使用 `code.v1`。"));
assert.ok(result.pureTransMarkdown.includes("图 2：伯克希尔的表现"));
assert.ok(result.pureTransMarkdown.includes("注：本图显示相关分布……"));
assert.ok(result.pureTransMarkdown.includes("![[imgs/example.jpg]]"));
assert.ok(result.pureTransMarkdown.includes("$$\nE = mc^2\n$$"));
assert.ok(result.pureTransMarkdown.includes("[^1]: 注释句子1。 注释句子2。\n<br>\n"));
assert.ok(!result.pureTransMarkdown.includes("Figure 2. How Berkshire Stacks Up"), "pure translation must not keep source composite prose");
assert.ok(!/^\^(?:sid|bid)-/m.test(result.pureTransMarkdown));
assert.ok(!/^>+\[!\s*ds\]/mi.test(result.pureTransMarkdown));
assert.ok(!/#\^(?:sid|bid)-/.test(result.pureTransMarkdown));

assert.strictEqual(normalizeVaultRelativePath("./English\\Book/"), "English/Book");
assert.strictEqual(normalizeVaultRelativePath("."), "");
assert.throws(() => normalizeVaultRelativePath("../outside"), /不能包含/);
assert.throws(() => normalizeVaultRelativePath("/absolute"), /相对路径/);


const numberedSource = [
  "1. Illusory identicalness: For arbitrage, you need two investments that are identical that trade at different prices at the same point in time. In practice, though, many settle for close or very similar, rather than identical, investments, and while the differences between the investments may be small, they can still explain price differences.",
  "<br>",
].join("\n");
const numberedPath = "/vault/project/chapters/14/trans/14 Chapter.md";
const numberedUnits = scanTranslationUnits(numberedSource, numberedPath);
assert.deepStrictEqual(numberedUnits.map((unit) => unit.raw), [
  "1. Illusory identicalness: For arbitrage, you need two investments that are identical that trade at different prices at the same point in time.",
  "In practice, though, many settle for close or very similar, rather than identical, investments, and while the differences between the investments may be small, they can still explain price differences.",
]);
const numberedState = emptyTranslationState(numberedPath);
recordTranslation(numberedState, numberedUnits[0], "1. 虚假的同一性：套利需要两项完全相同、却在同一时间以不同价格交易的投资。");
recordTranslation(numberedState, numberedUnits[1], "但在实践中，许多人接受的是接近或非常相似、而非完全相同的投资，而这些细微差异仍然可能解释价格差异。");
const numberedResult = exportCrossTranslation({
  sourceMarkdown: numberedSource,
  sourcePath: numberedPath,
  chapterFileName: "14 Chapter.md",
  outputVaultRelativePath: "chapters/14/trans",
  translationState: numberedState,
});
assert.ok(numberedResult.orgMarkdown.includes([
  "1. Illusory identicalness: For arbitrage, you need two investments that are identical that trade at different prices at the same point in time.",
  "^sid-1-1",
  "",
  ">[! ds]-",
  "![[chapters/14/trans/trans2org 14 Chapter#^sid-1-1]]",
  "",
  ">>",
  "In practice, though, many settle for close or very similar, rather than identical, investments, and while the differences between the investments may be small, they can still explain price differences.",
  "^sid-1-2",
  "",
  ">>[! ds]-",
  "![[chapters/14/trans/trans2org 14 Chapter#^sid-1-2]]",
  "",
  "<br>",
  "",
].join("\n")), "numbered-list paragraph formatting must match the requested Obsidian layout");
assert.ok(numberedResult.transMarkdown.includes([
  "1. 虚假的同一性：套利需要两项完全相同、却在同一时间以不同价格交易的投资。",
  "^sid-1-1",
  "",
  ">[! ds]-",
  "![[chapters/14/trans/org2trans 14 Chapter#^sid-1-1]]",
  "",
  ">>",
  "但在实践中，许多人接受的是接近或非常相似、而非完全相同的投资，而这些细微差异仍然可能解释价格差异。",
  "^sid-1-2",
  "",
  ">>[! ds]-",
  "![[chapters/14/trans/org2trans 14 Chapter#^sid-1-2]]",
  "",
  "<br>",
  "",
].join("\n")), "translated numbered-list paragraph formatting must mirror org2trans");
assert.ok(numberedResult.pureTransMarkdown.includes(
  "1. 虚假的同一性：套利需要两项完全相同、却在同一时间以不同价格交易的投资。 但在实践中，许多人接受的是接近或非常相似、而非完全相同的投资，而这些细微差异仍然可能解释价格差异。\n\n<br>\n",
), "pure translation must keep the list marker while omitting cross-translation scaffolding");
assert.ok(!numberedResult.pureTransMarkdown.includes("^sid-"));


const incomplete = emptyTranslationState(sourcePath);
assert.throws(() => exportCrossTranslation({
  sourceMarkdown: source,
  sourcePath,
  chapterFileName: "04 Chapter.md",
  outputVaultRelativePath: "English/weaver/Book",
  translationState: incomplete,
}), /未完成/);

console.log("crossTranslationExport tests passed");
