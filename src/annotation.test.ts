import * as assert from "assert";
import {
  annotationMatchSummary,
  buildAnnotationPairs,
  extractAnnotationNumber,
  resolvedAnnotationNumber,
} from "./annotation";
import type { Candidate } from "./types";

assert.strictEqual(extractAnnotationNumber("Text<sup>12</sup> more"), "12");
assert.strictEqual(extractAnnotationNumber("see [^3] here"), "3");
assert.strictEqual(extractAnnotationNumber("[*4]"), "4");
assert.strictEqual(extractAnnotationNumber("5. Footnote body"), "5");
assert.strictEqual(extractAnnotationNumber("*8 Body"), "8");
assert.strictEqual(extractAnnotationNumber("[^9]: body"), "9");
assert.strictEqual(extractAnnotationNumber("注 7 对应说明"), "7");
assert.strictEqual(extractAnnotationNumber("注释11"), "11");
assert.strictEqual(extractAnnotationNumber("see ¹ here"), "1");
assert.strictEqual(extractAnnotationNumber("plain paragraph"), undefined);

function row(partial: Partial<Candidate> & Pick<Candidate, "id" | "raw" | "lineType">): Candidate {
  return {
    kind: "regex",
    label: partial.raw,
    preview: partial.raw,
    range: partial.range ?? { line: 0, start: 0, end: partial.raw.length },
    typeLabel: "注释",
    ...partial,
  };
}

const ref = row({ id: "ref-1", raw: "See<sup>1</sup>", lineType: "注释引用", annotationNumber: "1", range: { line: 2, start: 3, end: 16 } });
const body = row({ id: "body-1", raw: "1. Note body", lineType: "注释正文", annotationNumber: "1", range: { line: 20, start: 0, end: 12 } });
const lonelyRef = row({ id: "ref-2", raw: "Also<sup>2</sup>", lineType: "注释引用", annotationNumber: "2", range: { line: 4, start: 0, end: 12 } });
const noNumber = row({ id: "ref-x", raw: "a mark here", lineType: "注释引用", range: { line: 6, start: 0, end: 12 } });

const pairs = buildAnnotationPairs([ref, body, lonelyRef, noNumber]);
assert.deepStrictEqual(pairs.map((pair) => [pair.number, pair.status, pair.refCandidateId, pair.bodyCandidateId]), [
  ["1", "自动匹配", "ref-1", "body-1"],
  ["2", "待补正文", "ref-2", undefined],
]);

const summary = annotationMatchSummary([ref, body, lonelyRef, noNumber], pairs);
assert.deepStrictEqual(summary, { paired: 1, missingRef: 0, missingBody: 1, missingNumber: 1 });

const missingRef = buildAnnotationPairs([
  row({ id: "body-9", raw: "9. Only body", lineType: "注释正文", annotationNumber: "9", range: { line: 1, start: 0, end: 12 } }),
]);
assert.strictEqual(missingRef[0].status, "待补引用");

assert.strictEqual(resolvedAnnotationNumber(row({ id: "m", raw: "plain", lineType: "注释引用", annotationNumber: "15", annotationNumberSource: "manual" })), "15");
assert.strictEqual(resolvedAnnotationNumber(row({ id: "e", raw: "plain", lineType: "注释引用", annotationNumberSource: "manual" })), undefined);

console.log("annotation tests passed");
