import * as assert from "assert";
import { scanIllegalLineBreaks } from "./illegalLineBreaks";
import { attachScanIdentities, reconcileRows } from "./rowIdentity";

const markdown = [
  "---",
  "title: Demo",
  "---",
  "# Heading",
  "<br>",
  "This paragraph was wrapped by OCR and should",
  "continue on the next physical line.",
  "It can even break after a sentence.",
  "Another sentence remains in the same paragraph.",
  "<br>",
  "A paragraph was incorrectly split in the",
  "",
  "middle of one sentence by an OCR blank line.",
  "<br>",
  "A complete paragraph ends normally.",
  "",
  "Another real paragraph starts normally.",
  "<br>",
  "A complete sentence ends here.[*1]",
  "",
  "Another paragraph must not be flagged just because a reference trails the period.",
  "<br>",
  "Source: D. Craig Nichols and James Wahlen",
  "",
  "The prose after a source line is a new paragraph.",
  "<br>",
  "- A list item",
  "  continued legally as Markdown structure",
  "<br>",
  "a. A lettered list item starts here.",
  "",
  "b. Another lettered list item is intentional.",
  "<br>",
  "*4 Bibliography entry without Markdown footnote syntax",
  "",
  "*5 Another bibliography entry",
  "<br>",
  "> quoted line",
  "> second quoted line",
  "<br>",
  "```text",
  "code line one",
  "code line two",
  "```",
  "<br>",
  "$$",
  "a + b",
  "c + d",
  "$$",
  "<br>",
  "A deliberate Markdown break  ",
  "stays separate.",
].join("\n");

const rows = scanIllegalLineBreaks(markdown, "/ws/chapters/01/01.md");
assert.deepStrictEqual(rows.map((row) => [row.range.line + 1, (row.range.endLine ?? row.range.line) + 1]), [
  [6, 7],
  [7, 8],
  [8, 9],
  [11, 13],
]);
assert.strictEqual(rows[0].previousLineText, "This paragraph was wrapped by OCR and should");
assert.strictEqual(rows[0].nextLineText, "continue on the next physical line.");
assert.strictEqual(rows[0].breakConfidence, "高");
assert.ok(rows[0].breakReason.includes("小写"));
assert.strictEqual(rows[0].mergedPreview, "This paragraph was wrapped by OCR and should continue on the next physical line.");
assert.ok(rows[3].breakReason.includes("空行"), "blank-line paragraph boundary must be inspected");
assert.strictEqual(rows[3].raw, "A paragraph was incorrectly split in the\n\nmiddle of one sentence by an OCR blank line.");
assert.ok(rows.every((row) => row.typeLabel === "非法断行"));
assert.ok(rows.every((row) => row.lineType === "合并"));
assert.ok(!rows.some((row) => row.raw.includes("reference trails")), "footnote suffix after punctuation must not create a false positive");
assert.ok(!rows.some((row) => row.raw.includes("Craig Nichols")), "Source lines must be excluded");
assert.ok(!rows.some((row) => row.raw.includes("list item")));
assert.ok(!rows.some((row) => row.raw.includes("lettered list")));
assert.ok(!rows.some((row) => row.raw.includes("Bibliography entry")));
assert.ok(!rows.some((row) => row.raw.includes("code line")));
assert.ok(!rows.some((row) => row.raw.includes("a + b")));
assert.ok(!rows.some((row) => row.raw.includes("deliberate Markdown break")));

const identified = attachScanIdentities(rows, markdown, { moduleName: "非法断行", sourcePath: "/ws/chapters/01/01.md" });
const decided = identified.map((row, index) => index === 0 ? { ...row, lineType: "忽略" } : row);
const rescanned = attachScanIdentities(
  scanIllegalLineBreaks(markdown, "/ws/chapters/01/01.md"),
  markdown,
  { moduleName: "非法断行", sourcePath: "/ws/chapters/01/01.md" },
);
const reconciled = reconcileRows(decided, rescanned, markdown);
assert.strictEqual(reconciled[0]?.lineType, "忽略", "manual merge/ignore decision must survive a derived rescan");

const lowercaseAfterPeriod = scanIllegalLineBreaks("Sentence ends.\n\ncontinuation starts lowercase.", "/ws/lowercase.md");
assert.strictEqual(lowercaseAfterPeriod.length, 1);
assert.ok(lowercaseAfterPeriod[0].breakReason.includes("小写"));

const hyphen = scanIllegalLineBreaks("inter-\n\nnational", "/ws/hyphen.md");
assert.strictEqual(hyphen.length, 1);
assert.strictEqual(hyphen[0].mergedPreview, "international");
assert.ok(hyphen[0].breakReason.includes("拆词"));

console.log("illegalLineBreaks tests passed");
