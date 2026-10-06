import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  loadMineruPageFootnotes,
  normalizeMineruAnnotationNumber,
  parseMineruPageFootnotes,
} from "./mineruPageFootnotes";
import { mineruPageAnnotationKey } from "./mineruAnnotationContract";

const input = {
  documentKey: "confessions:source-01",
  sourceJsonPath: "json/source-01.json",
  sourceMarkdownPath: "00001 MinerU_markdown.md",
};

function block(type: string, index: number, content: string, bbox = [10, 20, 100, 200]) {
  return {
    type, index, bbox,
    lines: [
      { bbox, spans: [{ type: "text", content, bbox }] },
    ],
  };
}

const data = {
  pdf_info: [
    {
      page_idx: 0,
      preproc_blocks: [
        block("text", 0, "“主，你是伟大的”① 以及“无限的智慧”①；另有注释②。"),
        block("text", 1, "无注释页没有进入这里。"),
        {
          type: "text", index: 2, bbox: [10, 20, 100, 200],
          lines: [{
            bbox: [10, 20, 100, 200],
            spans: [
              { type: "text", content: "某段引用", bbox: [10, 20, 40, 40] },
              { type: "inline_equation", content: "^{④}", bbox: [40, 20, 50, 40] },
            ],
          }],
        },
        block("text", 3, "后续上下文用于短块定位。"),
      ],
      discarded_blocks: [
        block("page_footnote", 7, "① 见《旧约·诗篇》。"),
        block("page_footnote", 8, "③ 缺失引用。"),
        block("page_footnote", 12, "④ 引用在公式 span 内。"),
        block("page_footnote", 9, "①"), // misclassified stray marker, not a duplicate body
        block("page_footnote", 10, "2016.11"), // unrelated footer
        block("page_footnote", 11, "1. 2020年1月1日"), // weak numeric, no 1. reference
      ],
    },
    {
      page_idx: 1,
      // CIP/front matter can contain circled symbols without any footnote.
      preproc_blocks: [block("text", 0, "CIP I. ①忏 ... II. ①奥 ... ②周")],
      discarded_blocks: [block("page_number", 1, "5")],
    },
    {
      page_idx: 2,
      preproc_blocks: [
        block("text", 0, "注释⑩与另一处编号⑪、⑫；十次修订。"),
      ],
      discarded_blocks: [
        block("page_footnote", 1, "⑩ first"),
        block("page_footnote", 2, "⑩ second"), // truly duplicated body, preserve both
        block("page_footnote", 3, "⑪ 本页唯一对应正文。"),
      ],
    },
    {
      page_idx: 3,
      preproc_blocks: [block("text", 0, "“这是一处带上标的引用”<sup>7</sup>")],
      discarded_blocks: [block("page_footnote", 1, "[^7] Markdown-style body")],
    },
  ],
};

for (const [marker, number] of [
  ["①", 1], ["⑩", 10], ["⑳", 20], ["㉑", 21], ["㊿", 50],
  ["¹", 1], ["¹²", 12], ["<sup>13</sup>", 13], ["[^14]", 14], ["15.", 15],
  ["0", undefined], ["①②", undefined], ["ABC", undefined], ["", undefined],
] as Array<[string, number | undefined]>) {
  assert.strictEqual(normalizeMineruAnnotationNumber(marker), number, marker);
}

const facts = parseMineruPageFootnotes(data, input);
assert.strictEqual(facts.pageCount, 4);
assert.deepStrictEqual(facts.annotations.map((note) =>
  [note.pageIndex, note.annotationNumber, note.status, note.references.length, note.bodies.length]),
[
  [0, 1, "shared", 2, 1],
  [0, 2, "missing-body", 1, 0],
  [0, 3, "missing-reference", 0, 1],
  [0, 4, "matched", 1, 1],
  [2, 10, "duplicate-body", 1, 2],
  [2, 11, "matched", 1, 1],
  [2, 12, "missing-body", 1, 0],
  [3, 7, "matched", 1, 1],
]);

const shared = facts.annotations[0];
assert.strictEqual(shared.references[0].occurrence, 1);
assert.strictEqual(shared.references[1].occurrence, 2);
assert.ok(shared.references[0].spanStart! < shared.references[1].spanStart!);
assert.strictEqual(shared.references[0].json.collection, "preproc_blocks");
assert.strictEqual(shared.references[1].json.pageIndex, 0);
assert.strictEqual(shared.bodies[0].json.collection, "discarded_blocks");
assert.strictEqual(shared.bodies[0].json.blockIndex, 7);
assert.strictEqual(shared.bodies[0].content, "见《旧约·诗篇》。");
const inlineEquationReference = facts.annotations.find((note) =>
  note.pageIndex === 0 && note.annotationNumber === 4)?.references[0];
assert.ok(inlineEquationReference?.context.includes("某段引用"));
assert.ok(inlineEquationReference?.context.includes("^{④}"));
assert.ok(inlineEquationReference?.context.includes("后续上下文用于短块定位"));
assert.strictEqual(facts.unidentifiedFootnotes.length, 3);
assert.deepStrictEqual(facts.unidentifiedFootnotes.map((b) => b.reason), [
  "empty-body", "unrecognized-marker", "unsupported-numeric-marker",
]);
assert.deepStrictEqual(facts.unverifiedReferences.map((item) =>
  [item.pageIndex, item.annotationNumber, item.references.length]),
[[1, 1, 2], [1, 2, 1]]);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ocr2md-mineru-footnotes-"));
try {
  const jsonPath = path.join(tmp, "source.json");
  fs.writeFileSync(jsonPath, JSON.stringify(data), "utf8");
  const loaded = loadMineruPageFootnotes({ ...input, sourceJsonPath: jsonPath });
  assert.deepStrictEqual(loaded.annotations, facts.annotations);
  assert.strictEqual(loaded.sourceJsonPath, jsonPath);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

assert.notStrictEqual(
  mineruPageAnnotationKey("json01", 0, 1),
  mineruPageAnnotationKey("json02", 0, 1),
  "a repeated physical page index in two MinerU JSON parts is not the same note",
);
assert.throws(() => parseMineruPageFootnotes(data, { ...input, documentKey: "" }), /documentKey/);
assert.throws(() => parseMineruPageFootnotes({}, input), /pdf_info/);
assert.throws(() => parseMineruPageFootnotes({
  pdf_info: [{ ...data.pdf_info[0], page_idx: 5 }],
}, input), /page_idx/);

console.log("MinerU page footnote parser tests passed");
