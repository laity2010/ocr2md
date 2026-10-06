import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { auditMineruAnnotations } from "./mineruAnnotationAudit";
import type { MineruProjectAnnotationSourceMap } from "./mineruAnnotationSourceMap";
import type {
  MineruAnnotationBody, MineruAnnotationReference,
  MineruJsonAnnotationGroup, MineruPageAnnotation,
} from "./mineruAnnotationContract";
import {
  mineruAuditReviewPath, readMineruAuditReviews,
  updateMineruAuditReview,
} from "./mineruAuditReviewStore";

function body(page: number, number: number, blockIndex: number): MineruAnnotationBody {
  return {
    marker: "①", raw: "① Note " + number,
    content: "Note " + number,
    blockType: "page_footnote",
    json: { pageIndex: page, collection: "discarded_blocks", blockIndex, bbox: [0, 0, 1, 1] },
  };
}

function ref(page: number, number: number): MineruAnnotationReference {
  return {
    occurrence: 1,
    marker: "①",
    context: "Marker " + number + " ① with context",
    json: { pageIndex: page, collection: "preproc_blocks", blockIndex: number, bbox: [0, 0, 1, 1] },
  };
}

function group(
  doc: string, pageIndex: number, annotationNumber: number,
  references: MineruAnnotationReference[],
  bodies: MineruAnnotationBody[],
): MineruJsonAnnotationGroup {
  return {
    documentKey: doc, pageIndex, annotationNumber, references, bodies,
    status: bodies.length > 1 ? "duplicate-body"
      : bodies.length === 0 ? "missing-body"
        : references.length === 0 ? "missing-reference" : "matched",
  };
}

function mapped(g: MineruJsonAnnotationGroup): MineruPageAnnotation {
  return {
    documentKey: g.documentKey, sourceJsonPath: g.documentKey,
    sourceMarkdownPath: "MinerU_markdown_book.md",
    pageIndex: g.pageIndex, annotationNumber: g.annotationNumber,
    references: g.references, body: g.bodies[0],
    status: "自动匹配",
  };
}

const one = "json/first.json";
const two = "json/second.json";
const a = [
  group(one, 0, 1, [ref(0, 1)], [body(0, 1, 1)]),
  group(one, 0, 3, [ref(0, 3)], [body(0, 3, 3)]),
  group(one, 0, 4, [ref(0, 4)], [body(0, 4, 4), body(0, 4, 5)]),
  group(one, 0, 5, [], [body(0, 5, 6)]),
  group(one, 0, 6, [ref(0, 6)], []),
];
const b = [
  group(two, 0, 1, [ref(0, 1)], [body(0, 1, 1)]),
  group(two, 0, 5, [], [body(0, 5, 2)]),
];
const fake = {
  sourceFingerprint: "evidence-01",
  documents: [
    {
      facts: {
        documentKey: one, pageCount: 2, annotations: a,
        unidentifiedFootnotes: [{
          pageIndex: 0, raw: "Orphan page footer", reason: "unrecognized-marker",
          json: { pageIndex: 0, collection: "discarded_blocks", blockIndex: 100, bbox: [0, 0, 1, 1] },
        }],
        unverifiedReferences: [{
          pageIndex: 1, annotationNumber: 2, references: [ref(1, 2)],
        }],
      },
      annotations: a.map(mapped),
      references: [
        { pageIndex: 0, annotationNumber: 1, status: "ambiguous",
          candidates: [
            { chapterPath: "chapters/01/01.md", lineIndex: 5, anchorText: "first" },
            { chapterPath: "chapters/02/02.md", lineIndex: 5, anchorText: "second" },
          ] },
        { pageIndex: 0, annotationNumber: 3, status: "missing", candidates: [] },
      ],
    },
    {
      facts: { documentKey: two, pageCount: 1, annotations: b, unidentifiedFootnotes: [],
        unverifiedReferences: [] },
      annotations: b.map(mapped), references: [],
    },
  ],
  issues: [{ type: "pairing", sourceJsonPath: "json/unpaired.json", reason: "Source ambiguous" }],
} as unknown as MineruProjectAnnotationSourceMap;

const audit = auditMineruAnnotations(fake);
const count = (name: string) => audit.counts[name] ?? 0;
assert.strictEqual(count("序号疑似缺失"), 4);
assert.strictEqual(count("MD引用缺失"), 1);
assert.strictEqual(count("注释正文缺失"), 1);
assert.strictEqual(count("正文引用缺失"), 2);
assert.strictEqual(count("重复注释正文"), 1);
assert.strictEqual(count("匹配歧义"), 1);
assert.strictEqual(count("未识别页脚"), 1);
assert.strictEqual(count("待验证引用"), 1);
assert.strictEqual(count("来源异常"), 1);
assert.strictEqual(audit.entries.length, 13);
const missingNumber = audit.entries.find((r) =>
  r.kind === "序号疑似缺失" && r.documentKey === one);
assert.strictEqual(missingNumber?.pageIndex, 0);
assert.strictEqual(missingNumber?.annotationNumber, 2);
assert.strictEqual(missingNumber?.pageNumber, 1);
assert.ok(missingNumber?.detail.includes("不自动补号"));
const ambiguity = audit.entries.find((r) => r.kind === "匹配歧义");
assert.strictEqual(ambiguity?.candidateLocations.length, 2);
assert.notStrictEqual(
  audit.entries.find((r) => r.documentKey === one &&
    r.annotationNumber === 5 && r.kind === "正文引用缺失")?.id,
  audit.entries.find((r) => r.documentKey === two &&
    r.annotationNumber === 5 && r.kind === "正文引用缺失")?.id,
  "page+number alone may not identify an annotation across JSON sources",
);
const swapped = { ...fake, documents: [...fake.documents].reverse() } as MineruProjectAnnotationSourceMap;
assert.deepStrictEqual(
  auditMineruAnnotations(swapped).entries.map((entry) => entry.id),
  audit.entries.map((entry) => entry.id),
  "source document order must not change stable review IDs",
);

function block(type: string, index: number, content: string) {
  return {
    type, index,
    bbox: [1, 1, 300, 700],
    lines: [{ bbox: [1, 1, 300, 700],
      spans: [{ type: "text", content, bbox: [1, 1, 300, 700] }] }],
  };
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), "ocr2md-wp6-"));
const reviewDirectory = path.join(root, "_private_reviews");
const sourceMapCacheDirectory = path.join(root, "_private_cache");
const options = { reviewDirectory, sourceMapCacheDirectory };
try {
  fs.mkdirSync(path.join(root, "json"));
  const chapter = path.join(root, "chapters", "01 Testing");
  fs.mkdirSync(chapter, { recursive: true });
  const paragraphs = [
    "A long identifiable first paragraph ends with citation① and plenty of unique context for reliable discovery.",
    "Second independent paragraph provides additional fingerprint evidence without any footnote marker.",
    "Third independent paragraph provides another page signature of sufficient length for high confidence.",
    "Final independent paragraph completes the synthetic MinerU document for review persistence tests.",
  ];
  const original = "# Test\n\n" + paragraphs.join("\n\n") + "\n";
  const sourceMd = path.join(root, "00001 MinerU_markdown_book.md");
  const originalMd = path.join(chapter, "01 Testing.md");
  const sidecar = path.join(chapter, "01 Testing.ocr2md.json");
  fs.writeFileSync(sourceMd, original);
  fs.writeFileSync(originalMd, original);
  fs.writeFileSync(sidecar, "USER_SIDECAR_SHOULD_STAY");
  const json = path.join(root, "json", "01 MinerU_book.json");
  fs.writeFileSync(json, JSON.stringify({
    pdf_info: paragraphs.map((para, i) => ({
      page_idx: i,
      preproc_blocks: [block("text", 0, para)],
      para_blocks: [block("text", 0, para)],
      discarded_blocks: i === 0
        ? [block("page_footnote", 1, "① A note."), block("page_footnote", 2, "2016.11")]
        : [],
    })),
  }));

  const initial = readMineruAuditReviews(root, options);
  assert.strictEqual(initial.entries.length, 1);
  assert.strictEqual(initial.entries[0].kind, "未识别页脚");
  assert.strictEqual(initial.counts["待审核"], 1);
  const issueId = initial.entries[0].id;
  const firstChange = {
    id: issueId, expectedRevision: 0,
    expectedProjectId: initial.projectId,
    sourceFingerprint: initial.sourceFingerprint,
    decision: "已核查" as const,
    note: "页面右下角是印刷日期，并非页注释。",
  };
  const approved = updateMineruAuditReview(root, firstChange, options);
  assert.strictEqual(approved.revision, 1);
  assert.strictEqual(approved.counts["已核查"], 1);
  assert.strictEqual(approved.entries[0].reviewNote, firstChange.note);
  assert.strictEqual(
    readMineruAuditReviews(root, options).entries[0].state, "已核查",
  );
  assert.throws(() => updateMineruAuditReview(root, firstChange, options),
    /审核版本已变化/);
  assert.throws(() => updateMineruAuditReview(root, {
    ...firstChange, expectedRevision: 1,
    id: "not-real",
  }, options), /审核证据编号不存在/);
  assert.throws(() => updateMineruAuditReview(root, {
    ...firstChange, expectedRevision: 1,
    note: "A".repeat(1001),
  }, options), /备注/);
  const reviewFile = mineruAuditReviewPath(root, reviewDirectory);
  assert.strictEqual(fs.statSync(reviewFile).mode & 0o777, 0o600);
  assert.strictEqual(fs.statSync(reviewDirectory).mode & 0o777, 0o700);
  assert.strictEqual(fs.readFileSync(sidecar, "utf8"), "USER_SIDECAR_SHOULD_STAY");
  assert.strictEqual(fs.readFileSync(originalMd, "utf8"), original);
  // Changing a canonical source invalidates the review without silently
  // changing the previous decision or erasing the reviewer comment.
  fs.appendFileSync(originalMd, "\n");
  const stale = readMineruAuditReviews(root, options);
  assert.notStrictEqual(stale.sourceFingerprint, initial.sourceFingerprint);
  assert.strictEqual(stale.entries[0].id, issueId);
  assert.strictEqual(stale.entries[0].state, "需复核");
  assert.strictEqual(stale.entries[0].previousDecision, "已核查");
  assert.strictEqual(stale.entries[0].reviewNote, firstChange.note);
  assert.throws(() => updateMineruAuditReview(root, {
    ...firstChange, expectedRevision: stale.revision,
  }, options), /原始证据已变化/);
  const reapproved = updateMineruAuditReview(root, {
    ...firstChange, expectedRevision: stale.revision,
    sourceFingerprint: stale.sourceFingerprint,
    decision: "疑似误报",
  }, options);
  assert.strictEqual(reapproved.entries[0].state, "疑似误报");
  const reset = updateMineruAuditReview(root, {
    id: issueId, expectedRevision: reapproved.revision,
    expectedProjectId: reapproved.projectId,
    sourceFingerprint: reapproved.sourceFingerprint,
    decision: "待审核", note: "",
  }, options);
  assert.strictEqual(reset.counts["待审核"], 1);
  assert.strictEqual(reset.entries[0].reviewNote, "");
  assert.strictEqual(fs.readFileSync(sidecar, "utf8"), "USER_SIDECAR_SHOULD_STAY");
  console.log("MinerU page annotation audit and persistent reviewer tests passed");
} finally {
  // Fixtures are isolated mkdtemp directories, never the active user vault.
  fs.rmSync(root, { recursive: true, force: true });
}
