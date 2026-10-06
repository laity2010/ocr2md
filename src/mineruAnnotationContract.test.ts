import * as assert from "assert";
import {
  mineruAnnotationReferenceKey,
  mineruPageAnnotationKey,
  type MineruAnnotationSourceMap,
  type MineruAnnotationTableRow,
  type MineruPageAnnotation,
} from "./mineruAnnotationContract";

const page8Note1 = mineruPageAnnotationKey("confessions", 8, 1);
const page9Note1 = mineruPageAnnotationKey("confessions", 9, 1);
assert.notStrictEqual(
  page8Note1,
  page9Note1,
  "the same footnote number on different physical pages must never share identity",
);
assert.strictEqual(
  mineruAnnotationReferenceKey("confessions", 151, 1, 2),
  "mineru-note:confessions:p151:n1:r2",
);

const shared: MineruPageAnnotation = {
  documentKey: "confessions",
  sourceJsonPath: "json/01 MinerU_confessions.json",
  sourceMarkdownPath: "00001 MinerU_markdown_confessions.md",
  pageIndex: 151,
  annotationNumber: 1,
  status: "共享注释",
  references: [
    {
      occurrence: 1,
      marker: "①",
      context: "第一个引用①",
      json: {
        pageIndex: 151,
        collection: "preproc_blocks",
        blockIndex: 2,
        bbox: [35, 104, 535, 528],
      },
    },
    {
      occurrence: 2,
      marker: "①",
      context: "第二个引用①",
      json: {
        pageIndex: 151,
        collection: "preproc_blocks",
        blockIndex: 2,
        bbox: [35, 104, 535, 528],
      },
    },
  ],
  body: {
    marker: "①",
    content: "见《哥林多前书》4章7节。",
    blockType: "page_footnote",
    raw: "① 见《哥林多前书》4章7节。",
    json: {
      pageIndex: 151,
      collection: "discarded_blocks",
      blockIndex: 4,
      bbox: [64, 711, 250, 732],
    },
  },
};
assert.strictEqual(shared.references.length, 2);
assert.strictEqual(shared.body?.json.pageIndex, shared.pageIndex);

const missingMarkdown: MineruPageAnnotation = {
  documentKey: "confessions",
  sourceJsonPath: "json/01 MinerU_confessions.json",
  sourceMarkdownPath: "00001 MinerU_markdown_confessions.md",
  pageIndex: 10,
  annotationNumber: 1,
  status: "MD引用缺失",
  references: [{
    occurrence: 1,
    marker: "①",
    context: "JSON 中存在但 Markdown 未定位的引用①",
    json: {
      pageIndex: 10,
      collection: "preproc_blocks",
      blockIndex: 2,
      bbox: [61, 88, 560, 204],
    },
  }],
  body: {
    marker: "①",
    content: "见《旧约·耶利米书》23章24节。",
    blockType: "page_footnote",
    raw: "① 见《旧约·耶利米书》23章24节。",
    json: {
      pageIndex: 10,
      collection: "discarded_blocks",
      blockIndex: 8,
      bbox: [87, 799, 310, 818],
    },
  },
};
assert.strictEqual(
  missingMarkdown.references[0].markdown,
  undefined,
  "an unresolved Markdown location remains explicit data instead of being guessed or dropped",
);

const sourceMap: MineruAnnotationSourceMap = {
  schemaVersion: 1,
  documentKey: "confessions",
  sourceJsonPath: "json/01 MinerU_confessions.json",
  sourceMarkdownPath: "00001 MinerU_markdown_confessions.md",
  annotations: [shared, missingMarkdown],
};
assert.deepStrictEqual(
  sourceMap.annotations.map((item) => [item.pageIndex, item.annotationNumber, item.status]),
  [[151, 1, "共享注释"], [10, 1, "MD引用缺失"]],
);

const bodyRow: MineruAnnotationTableRow = {
  annotationKey: page8Note1,
  pageIndex: 8,
  pageNumber: 9,
  annotationNumber: 1,
  lineType: "注释正文",
  preview: "① 见《旧约·诗篇》144首3节。",
  status: "自动匹配",
  navigationTarget: {
    chapterId: "01 卷一",
    chapterPath: "chapters/01 卷一/01 卷一.md",
    lineIndex: 17,
    start: 31,
    end: 32,
    anchorText: "“主，你是伟大的……无限的智慧。”①",
  },
};
assert.strictEqual(
  bodyRow.navigationTarget?.lineIndex,
  17,
  "a footnote-body row navigates to its matched Markdown reference",
);

console.log("MinerU annotation contract tests passed");
