import * as assert from "assert";
import {
  activeCandidates,
  isIgnoredEmbedCandidate,
  DELETED_LINE_TYPE,
  findReusableManualRow,
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
    typeLabel: "嵌入块",
    lineType: "内嵌标题",
    isWorkingCorrection: true,
  },
  {
    id: "new-row",
    kind: "regex",
    label: "new",
    raw: "FIGURE 11.3 | Valuation Challenges—Growth Companies",
    preview: "FIGURE 11.3 | Valuation Challenges—Growth Companies",
    range: { line: 61, start: 0, end: 51 },
    typeLabel: "嵌入块",
    lineType: "内嵌标题",
    isWorkingCorrection: true,
  },
];

const marked = markCandidatesDeleted(rows, new Set(["old-row"]));
assert.strictEqual(marked[0].lineType, DELETED_LINE_TYPE);
assert.strictEqual(marked[0].raw, rows[0].raw);
assert.strictEqual(marked[1].lineType, "内嵌标题");
assert.strictEqual(isDeletedCandidate(marked[0]), true);
assert.deepStrictEqual(activeCandidates(marked).map((row) => row.id), ["new-row"]);

const firstMarker: Candidate = {
  id: "gt-1",
  kind: "regex",
  label: ">",
  raw: ">",
  preview: ">",
  range: { line: 2, start: 0, end: 1 },
  typeLabel: "嵌入块",
  lineType: "嵌入块首",
};
const secondMarker = { ...firstMarker, id: "gt-2", range: { line: 10, start: 0, end: 1 } };
const belongs = () => true;
assert.strictEqual(
  findReusableManualRow([firstMarker], { typeLabel: "嵌入块", raw: ">", line: 2, belongs })?.id,
  "gt-1",
);
assert.strictEqual(
  findReusableManualRow([firstMarker], { typeLabel: "嵌入块", raw: ">", line: 10, belongs }),
  undefined,
  "a second > line must add a new 嵌入块首, not reuse the first",
);
assert.strictEqual(
  findReusableManualRow([firstMarker, secondMarker], { typeLabel: "嵌入块", raw: ">", line: 10, belongs })?.id,
  "gt-2",
);

console.log("candidateLifecycle tests passed");

const ignoredEmbed = { ...rows[0], typeLabel: "嵌入块" as const, lineType: "已忽略" };
assert.strictEqual(isIgnoredEmbedCandidate(ignoredEmbed), true);
assert.strictEqual(activeCandidates([ignoredEmbed]).length, 1, "已忽略 must remain auditable rather than soft-deleted");
