import * as assert from "assert";
import { createHash } from "crypto";
import { extractMineruElements, MineruElementExtractionError } from "./mineruElementExtractor";

const size = [594, 783];
const first = {
  type: "text", index: 4, bbox: [10, 20, 120, 50], merge_prev: false,
  lines: [{ bbox: [10, 20, 120, 50], spans: [
    { bbox: [10, 20, 80, 50], type: "text", content: "表現 😀" },
  ] }],
};
const composite = {
  type: "table", index: 4, bbox: [100, 140, 300, 240],
  blocks: [
    { type: "table_caption", bbox: [100, 120, 300, 135],
      lines: [{ bbox: [100, 120, 300, 135],
        spans: [{ type: "text", bbox: [100, 120, 300, 135], content: "Table 1" }] }] },
    { type: "table_body", bbox: [100, 140, 300, 240],
      lines: [{ bbox: [100, 140, 300, 240],
        spans: [{ type: "table", bbox: [100, 140, 300, 240], html: "<table><tr><td>A</td></tr></table>" }] }] },
  ],
};
const formula = {
  type: "interline_equation", bbox: [0, 0, 100, 150],
  lines: [{ spans: [{ type: "interline_equation", content: "x=\\frac{1}{2}", image_path: "https://example.test/formula.jpg" }] }],
};
const raw = {
  _backend: "hybrid", _version_name: "3.4.4",
  pdf_info: [
    { page_idx: 0, page_size: size, preproc_blocks: [first, composite],
      para_blocks: [first, composite], discarded_blocks: [{ type: "header", index: 0,
        bbox: [0, 0, 20, 20], lines: [{ spans: [{ type: "text", content: "HEADER" }] }] }] },
    { page_idx: 1, page_size: [783, 594], preproc_blocks: [],
      para_blocks: [formula], discarded_blocks: [] },
  ],
};
const bytes = new TextEncoder().encode(JSON.stringify(raw));
const originalBytes = Buffer.from(bytes);
const extracted = extractMineruElements(bytes);
assert.deepStrictEqual(Buffer.from(bytes), originalBytes, "input bytes must not be changed");
assert.strictEqual(extracted.schemaVersion, 1);
assert.strictEqual(extracted.pageCount, 2);
assert.strictEqual(extracted.bodyElements.length, 3, "preproc blocks must not be counted");
assert.strictEqual(extracted.discardedElements.length, 1);
assert.strictEqual(extracted.sourceSha256, createHash("sha256").update(bytes).digest("hex"));
const ids = [...extracted.bodyElements, ...extracted.discardedElements].map(e => e.id);
assert.strictEqual(new Set(ids).size, ids.length, "IDs must be unique");
assert.deepStrictEqual(extractMineruElements(bytes).bodyElements.map(e => e.id),
  extracted.bodyElements.map(e => e.id), "same original bytes => same source IDs");

const [text, table, equation] = extracted.bodyElements;
assert.strictEqual(text.id, `mineru:${extracted.sourceSha256}:p0:para_blocks:0`);
assert.strictEqual(text.jsonPointer, "/pdf_info/0/para_blocks/0");
assert.strictEqual(text.pageIndex, 0);
assert.strictEqual(text.pdfPageNumber, 1);
assert.strictEqual(text.mineruIndex, 4);
assert.strictEqual(table.mineruIndex, 4, "duplicate raw index is allowed");
assert.notStrictEqual(text.id, table.id, "arrayPosition is identity, not MinerU index");
assert.deepStrictEqual(text.normalizedBBox, [10/594, 20/783, 120/594, 50/783]);
assert.strictEqual(text.segments[0].content, "表現 😀");
assert.strictEqual(text.rawBlock.lines?.[0].spans?.[0].content, "表現 😀");
assert.strictEqual(table.rawBlock.blocks?.length, 2);
assert.strictEqual(table.segments.length, 2);
assert.strictEqual(table.segments[0].content, "Table 1");
assert.strictEqual(table.segments[1].html, "<table><tr><td>A</td></tr></table>");
assert.ok(table.segments[1].jsonPointer.endsWith("/blocks/1/lines/0/spans/0"));
assert.strictEqual(equation.pageIndex, 1);
assert.strictEqual(equation.pdfPageNumber, 2);
assert.deepStrictEqual(equation.pageSize, [783, 594]);
assert.strictEqual(equation.segments[0].content, "x=\\frac{1}{2}");
assert.strictEqual(equation.segments[0].imagePath, "https://example.test/formula.jpg");
assert.strictEqual(extracted.discardedElements[0].collection, "discarded_blocks");
assert.strictEqual(extracted.discardedElements[0].segments[0].content, "HEADER");
const another = new TextEncoder().encode(JSON.stringify(raw, null, 2));
assert.notStrictEqual(extractMineruElements(another).bodyElements[0].id, text.id,
  "even whitespace-only changes create new source fingerprint");
assert.strictEqual(extractMineruElements(another).bodyElements[0].normalizedContentSha256,
  text.normalizedContentSha256, "unchanged OCR content hashes are stable");
const edited = JSON.parse(JSON.stringify(raw));
edited.pdf_info[0].para_blocks[0].lines[0].spans[0].content = "另一个版本";
assert.notStrictEqual(extractMineruElements(new TextEncoder().encode(JSON.stringify(edited))).bodyElements[0].id,
  text.id, "re-OCR must never silently reuse source identity");

let rejected = 0;
function invalidCase(change: (copy: any) => void, expectedPointer: string): void {
  const cloned: any = JSON.parse(JSON.stringify(raw));
  change(cloned);
  assert.throws(() => extractMineruElements(new TextEncoder().encode(JSON.stringify(cloned))),
    (error: unknown) => error instanceof MineruElementExtractionError
      && error.jsonPointer === expectedPointer,
    "invalid coordinates/structure must report the JSON pointer");
  rejected++;
}
invalidCase(d => d.pdf_info[0].page_idx = 2, "/pdf_info/0/page_idx");
invalidCase(d => d.pdf_info[0].page_size = [0, 783], "/pdf_info/0/page_size");
invalidCase(d => d.pdf_info[0].para_blocks[0].bbox = [100, 20, 5, 30],
  "/pdf_info/0/para_blocks/0/bbox");
invalidCase(d => d.pdf_info[0].para_blocks[0].bbox = [10, 20, 999, 30],
  "/pdf_info/0/para_blocks/0/bbox");
invalidCase(d => d.pdf_info[0].para_blocks[0].lines[0].spans[0].bbox = [-1, 10, 20, 20],
  "/pdf_info/0/para_blocks/0/lines/0/spans/0/bbox");
invalidCase(d => delete d.pdf_info[1].discarded_blocks, "/pdf_info/1/discarded_blocks");
invalidCase(d => d.pdf_info[0].para_blocks[0].index = 1.5, "/pdf_info/0/para_blocks/0/index");
invalidCase(d => d.pdf_info[0].para_blocks[0].lines = {}, "/pdf_info/0/para_blocks/0/lines");
assert.throws(() => extractMineruElements(new Uint8Array([255])), MineruElementExtractionError);
console.log("WP1_MINERU_ELEMENT_UNIT_OK", JSON.stringify({
  pages:extracted.pageCount,body:extracted.bodyElements.length,
  discarded:extracted.discardedElements.length,invalidCases:rejected+1,
}));
