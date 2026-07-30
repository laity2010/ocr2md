import * as assert from "assert";
import { splitOcrSentenceSegments } from "./sentenceSegmentation";

const source = ">>A. Berkshire Hathaway’s Public Stocks and Buffett-Style Portfolio March 1980 = $1";
const segments = splitOcrSentenceSegments(source);

assert.strictEqual(segments.length, 1);
assert.strictEqual(segments[0].raw, source);
assert.deepStrictEqual(segments[0].range, [0, source.length]);

const ordinary = splitOcrSentenceSegments("First sentence. Second sentence.");
assert.deepStrictEqual(ordinary.map((segment) => segment.raw), ["First sentence.", "Second sentence."]);

const softLine = ">>A.\nBerkshire Hathaway’s Public Stocks";
assert.deepStrictEqual(splitOcrSentenceSegments(softLine).map((segment) => segment.raw), [softLine]);

const separateParagraphs = splitOcrSentenceSegments(">>A.\n\nBerkshire Hathaway’s Public Stocks");
assert.strictEqual(separateParagraphs.length, 2);

console.log("sentenceSegmentation tests passed");
