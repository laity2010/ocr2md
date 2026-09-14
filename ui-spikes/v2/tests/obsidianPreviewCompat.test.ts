import assert from "node:assert/strict";
import {
  normalizeObsidianEmbedBlocksForPreview,
  scanObsidianCalloutsForPreview,
} from "../src/obsidianPreviewCompat";

const source = [
  "before",
  ">",
  "![image](imgs/demo.png)",
  "Top Award",
  "><embed id=01></embed>",
  "<br>",
  "> ordinary quote",
  "after",
].join("\n");

const result = normalizeObsidianEmbedBlocksForPreview(source);
assert.deepStrictEqual([...result.embedStartLines], [1]);
assert.strictEqual(
  result.markdown,
  [
    "before",
    ">",
    "> ![image](imgs/demo.png)",
    "> Top Award",
    ">",
    "<br>",
    "> ordinary quote",
    "after",
  ].join("\n"),
);
assert.strictEqual(
  result.markdown.split("\n").length,
  source.split("\n").length,
  "preview normalization must preserve source line mapping",
);
assert.ok(!result.markdown.includes("<embed id=01>"));
assert.ok(result.markdown.includes("> ordinary quote"));

const noEndMarker = [">", "not an ocr2md embed", "<br>"].join("\n");
assert.strictEqual(
  normalizeObsidianEmbedBlocksForPreview(noEndMarker).markdown,
  noEndMarker,
  "ordinary/block-marker text without embed end marker must remain unchanged",
);

console.log("obsidian preview compatibility tests passed");

const nestedCalloutSource = [
  ">",
  "> Figure title",
  ">> [! ]- HTML",
  ">> <table><tr><td>A</td></tr></table>",
  ">> <table><tr><td>B</td></tr></table>",
  "> Notes after callout",
  ">",
].join("\n");
const nestedCallouts = scanObsidianCalloutsForPreview(nestedCalloutSource);
assert.strictEqual(nestedCallouts.size, 1);
assert.deepStrictEqual(nestedCallouts.get(3), {
  sourceLine: 3,
  endSourceLine: 5,
  quoteDepth: 2,
  type: "",
  title: "HTML",
  foldMarker: "-",
  collapsed: true,
  bodySource: [
    "<table><tr><td>A</td></tr></table>",
    "<table><tr><td>B</td></tr></table>",
  ].join("\n"),
});

const expandedCallout = scanObsidianCalloutsForPreview([
  "> [!note]+ HTML",
  "> <table><tr><td>expanded</td></tr></table>",
].join("\n")).get(1);
assert.equal(expandedCallout?.foldMarker, "+");
assert.equal(expandedCallout?.collapsed, false);
assert.equal(expandedCallout?.quoteDepth, 1);
