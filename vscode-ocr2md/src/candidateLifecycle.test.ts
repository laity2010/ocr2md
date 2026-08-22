import * as assert from "assert";
import {
  activeCandidates,
  DELETED_LINE_TYPE,
  isDeletedCandidate,
  markCandidatesDeleted,
} from "./candidateLifecycle";
import type { Candidate } from "./types";

const rows: Candidate[] = [
  {
    id: "old-row",
    kind: "regex",
    label: "old",
    raw: "FIGURE 11.3 |",
    preview: "FIGURE 11.3 |",
    range: { line: 61, start: 0, end: 13 },
    typeLabel: "图片",
    lineType: "图片标题",
    isWorkingCorrection: true,
  },
  {
    id: "new-row",
    kind: "regex",
    label: "new",
    raw: "FIGURE 11.3 | Valuation Challenges—Growth Companies",
    preview: "FIGURE 11.3 | Valuation Challenges—Growth Companies",
    range: { line: 61, start: 0, end: 51 },
    typeLabel: "图片",
    lineType: "图片标题",
    isWorkingCorrection: true,
  },
];

const marked = markCandidatesDeleted(rows, new Set(["old-row"]));
assert.strictEqual(marked[0].lineType, DELETED_LINE_TYPE);
assert.strictEqual(marked[0].raw, rows[0].raw);
assert.strictEqual(marked[1].lineType, "图片标题");
assert.strictEqual(isDeletedCandidate(marked[0]), true);
assert.deepStrictEqual(activeCandidates(marked).map((row) => row.id), ["new-row"]);

console.log("candidateLifecycle tests passed");
