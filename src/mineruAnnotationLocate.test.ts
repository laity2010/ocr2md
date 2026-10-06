import * as assert from "assert";
import { FILE_END_ANCHOR, FILE_START_ANCHOR, hashText } from "./rowIdentity";
import { locateMineruMarkdownReference } from "./mineruAnnotationLocate";
import type { MineruMarkdownLocator } from "./mineruAnnotationContract";

const original = [
  "# 卷一",
  "",
  "主，你是伟大的，拥有无限智慧。①",
  "",
  "继续阅读后文。②",
].join("\n");

const locator: MineruMarkdownLocator = {
  chapterId: "01 卷一",
  chapterPath: "chapters/01 卷一/01 卷一.md",
  lineIndex: 2,
  start: "主，你是伟大的，拥有无限智慧。".length,
  end: "主，你是伟大的，拥有无限智慧。①".length,
  anchorText: "主，你是伟大的，拥有无限智慧。①",
  anchorTextHash: hashText("主，你是伟大的，拥有无限智慧。①"),
  anchorPreviousHash: hashText("# 卷一"),
  anchorNextHash: hashText("继续阅读后文。②"),
};

assert.deepStrictEqual(locateMineruMarkdownReference(original, locator), {
  line: 2, start: locator.start, end: locator.end,
});

const shifted = "新序言\n\n" + original;
assert.deepStrictEqual(locateMineruMarkdownReference(shifted, locator), {
  line: 4, start: locator.start, end: locator.end,
});

const inlineEdit = original.replace(
  "主，你是伟大的，拥有无限智慧。①",
  "说明：主，你是伟大的，拥有无限智慧。①",
);
assert.deepStrictEqual(locateMineruMarkdownReference(inlineEdit, locator), {
  line: 2, start: locator.start + 3, end: locator.end + 3,
});

assert.strictEqual(locateMineruMarkdownReference(
  original.replace("①", "②"), locator,
), undefined, "deleted/changed marker must not jump to another note");

const ambiguous = original
  + "\n\n"
  + locator.anchorText + "\n\n"
  + locator.anchorText;
assert.deepStrictEqual(locateMineruMarkdownReference(ambiguous, locator), {
  line: 2, start: locator.start, end: locator.end,
}, "duplicate anchor is safe only when neighboring context uniquely distinguishes it");

const unresolvable = original.replace("继续阅读后文。②", "重复段落。")
  + "\n\n"
  + "主，你是伟大的，拥有无限智慧。①";
assert.strictEqual(
  locateMineruMarkdownReference(unresolvable, {
    ...locator,
    anchorPreviousHash: undefined,
    anchorNextHash: undefined,
  }),
  undefined,
  "repeated identical lines without unique anchors must fail closed",
);

// File boundary anchors use the same rowIdentity semantics as WP3.
const single: MineruMarkdownLocator = {
  ...locator,
  lineIndex: 0,
  start: locator.start,
  end: locator.end,
  anchorPreviousHash: hashText(FILE_START_ANCHOR),
  anchorNextHash: hashText(FILE_END_ANCHOR),
};
assert.deepStrictEqual(
  locateMineruMarkdownReference(locator.anchorText, single),
  { line: 0, start: single.start, end: single.end },
);

console.log("MinerU annotation preview navigation tests passed");
