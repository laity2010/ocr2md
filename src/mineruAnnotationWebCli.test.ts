import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { readMineruChapterAnnotations } from "./mineruAnnotationWebCli";
import {
  mineruAnnotationFromCandidate,
  mineruReviewCandidates,
} from "./mineruAnnotationReview";
import type { MineruProjectedAnnotationRow } from "./mineruAnnotationProjection";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "ocr2md-wp5-contract-"));
try {
  const absent = readMineruChapterAnnotations(root, "00 Legacy");
  assert.strictEqual(absent.available, false);
  assert.strictEqual(absent.rows.length, 0);
  assert.strictEqual(absent.unassignedRows.length, 0);

  fs.mkdirSync(path.join(root, "json"));
  fs.writeFileSync(path.join(root, "json", "broken.json"), "{broken", "utf8");
  assert.throws(() => readMineruChapterAnnotations(root, "00 Legacy"),
    /无法唯一配对/);

  const projected: MineruProjectedAnnotationRow = {
    rowId: "mineru-note:a:p0:n1:r1",
    annotationKey: "mineru-note:a:p0:n1",
    documentKey: "a",
    sourceJsonPath: "json/a.json",
    sourceMarkdownPath: "00001 MinerU_markdown.md",
    pageIndex: 0,
    pageNumber: 1,
    annotationNumber: 1,
    lineType: "注释引用",
    markdownLineIndex: 2,
    preview: "可定位的注释①",
    status: "自动匹配",
    json: {
      pageIndex: 0,
      collection: "preproc_blocks",
      blockIndex: 1,
      bbox: [1, 2, 3, 4],
    },
    referenceOccurrence: 1,
    navigationTargets: [],
    candidates: [],
  };
  const review = mineruReviewCandidates([projected]);
  assert.strictEqual(review.length, 1);
  assert.strictEqual(review[0].typeLabel, "注释");
  assert.strictEqual(review[0].annotationNumber, "1");
  assert.strictEqual(review[0].lineType, "注释引用");
  assert.strictEqual(review[0].rowId, projected.rowId);
  assert.strictEqual(review[0].range.line, -1);
  assert.strictEqual(mineruAnnotationFromCandidate(review[0]), projected);
  assert.strictEqual(mineruAnnotationFromCandidate(undefined), undefined);
  const plainCandidate = { ...review[0], mineruAnnotation: undefined };
  assert.strictEqual(mineruAnnotationFromCandidate(plainCandidate), undefined);

  console.log("MinerU Web projection and fallback tests passed");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
