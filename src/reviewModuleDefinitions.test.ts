import * as assert from "assert";
import { REVIEW_MODULE_DEFINITIONS, REVIEW_MODULES } from "./reviewModuleDefinitions";

assert.deepStrictEqual(REVIEW_MODULES, ["章节定界", "章节标题", "注释", "嵌入块", "非法断行", "文本块", "分句", "翻译"]);

const title = REVIEW_MODULE_DEFINITIONS["章节标题"];
assert.strictEqual(title.selectable, true);
assert.strictEqual(title.bulkEdit, true);
assert.strictEqual(title.previewKind, "chapterHeading");
assert.strictEqual(title.includeWorkingCorrectionInChanged, false);
assert.ok(title.filter?.primaryLineTypes.includes("6 级标题"));

const annotation = REVIEW_MODULE_DEFINITIONS["注释"];
assert.deepStrictEqual(annotation.extraColumns, ["annotationNumber"]);
assert.strictEqual(annotation.regexCard, true);
assert.strictEqual(annotation.detailKind, "annotationPair");
assert.deepStrictEqual(annotation.defaultSort.map((rule) => rule.key), ["number", "line"]);

const embed = REVIEW_MODULE_DEFINITIONS["嵌入块"];
assert.deepStrictEqual(embed.extraColumns, ["embedNumber"]);
assert.strictEqual(embed.regexCard, true);
assert.strictEqual(embed.detailKind, "embedDownload");
assert.deepStrictEqual(embed.defaultSort.map((rule) => rule.key), ["embedNumber", "line"]);

const illegal = REVIEW_MODULE_DEFINITIONS["非法断行"];
assert.strictEqual(illegal.tableKind, "illegalBreak");
assert.deepStrictEqual(illegal.lineTypes, ["合并", "已忽略"]);

for (const derived of ["文本块", "分句", "翻译"] as const) {
  const definition = REVIEW_MODULE_DEFINITIONS[derived];
  assert.strictEqual(definition.selectable, false);
  assert.strictEqual(definition.bulkEdit, false);
  assert.strictEqual(definition.editableLineType, false);
}

console.log("reviewModuleDefinitions tests passed");
