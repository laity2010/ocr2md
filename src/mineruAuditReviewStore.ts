import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { auditMineruAnnotations, type MineruAuditEvidence } from "./mineruAnnotationAudit";
import { loadMineruProjectAnnotationSourceMap } from "./mineruAnnotationSourceMap";

export type MineruAuditDecision = "已核查" | "疑似误报";
export type MineruAuditReviewState = "待审核" | MineruAuditDecision | "需复核";

interface StoredReview {
  decision: MineruAuditDecision;
  note: string;
  fingerprint: string;
  reviewedAt: string;
}

interface ReviewFile {
  schemaVersion: 1;
  projectRoot: string;
  revision: number;
  reviews: Record<string, StoredReview>;
}

export interface MineruAuditRow extends MineruAuditEvidence {
  /** Validated original (whole-book) PDF page, assigned only by the native server. */
  pdfPageNumber?: number;
  state: MineruAuditReviewState;
  reviewNote: string;
  reviewedAt?: string;
  previousDecision?: MineruAuditDecision;
}

export interface MineruAuditPayload {
  /** Original PDF is optional. PDF page offsets are never inferred without verification. */
  pdfAttachment?: {
    available: boolean;
    pageCount?: number;
    name?: string;
    reason: string;
  };
  available: boolean;
  projectId: string;
  sourceFingerprint: string;
  revision: number;
  entries: MineruAuditRow[];
  counts: Record<MineruAuditReviewState, number>;
  kinds: Record<string, number>;
}

export interface MineruAuditChange {
  id: string;
  expectedProjectId: string;
  sourceFingerprint: string;
  expectedRevision: number;
  decision: MineruAuditDecision | "待审核";
  note: string;
}

export interface MineruReviewOptions {
  reviewDirectory?: string;
  sourceMapCacheDirectory?: string;
}

function projectPath(root: string): string {
  return fs.realpathSync(path.resolve(root));
}

export function mineruAuditReviewPath(
  root: string,
  directory = path.join(os.homedir(), ".ocr2md-private", "mineru-audit-reviews"),
): string {
  return path.join(
    path.resolve(directory),
    crypto.createHash("sha256").update(projectPath(root)).digest("hex") + ".json",
  );
}

function readReviews(root: string, file: string): ReviewFile {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const data = parsed as Partial<ReviewFile>;
      if (data.schemaVersion === 1 && data.projectRoot === root &&
        Number.isSafeInteger(data.revision) && (data.revision ?? -1) >= 0 &&
        data.reviews && typeof data.reviews === "object" &&
        !Array.isArray(data.reviews)) {
        return data as ReviewFile;
      }
    }
    throw new Error("审计审核文件结构异常，请人工检查备份后处理");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return { schemaVersion: 1, projectRoot: root, revision: 0, reviews: {} };
  }
}

function mergedAudit(
  root: string, file: ReviewFile, sourceMapCacheDirectory?: string,
): MineruAuditPayload {
  const map = loadMineruProjectAnnotationSourceMap(root, {
    cacheDirectory: sourceMapCacheDirectory,
  }).sourceMap;
  const audit = auditMineruAnnotations(map);
  const counts: MineruAuditPayload["counts"] = {
    "待审核": 0, "已核查": 0, "疑似误报": 0, "需复核": 0,
  };
  const entries = audit.entries.map((issue): MineruAuditRow => {
    const saved = file.reviews[issue.id];
    const state: MineruAuditReviewState = !saved ? "待审核"
      : saved.fingerprint === audit.sourceFingerprint ? saved.decision : "需复核";
    counts[state] += 1;
    return {
      ...issue, state,
      reviewNote: saved?.note ?? "",
      reviewedAt: saved?.reviewedAt,
      previousDecision: state === "需复核" ? saved?.decision : undefined,
    };
  });
  return {
    projectId: crypto.createHash("sha256").update(root).digest("hex"),
    available: map.discovery.files.jsonPaths.length > 0,
    sourceFingerprint: audit.sourceFingerprint,
    revision: file.revision,
    entries, counts, kinds: audit.counts,
  };
}

export function readMineruAuditReviews(
  root: string,
  options: MineruReviewOptions = {},
): MineruAuditPayload {
  const resolved = projectPath(root);
  const reviewPath = mineruAuditReviewPath(resolved, options.reviewDirectory);
  return mergedAudit(
    resolved, readReviews(resolved, reviewPath), options.sourceMapCacheDirectory,
  );
}

/**
 * CAS + exclusive writer, private derivative state; never touches the vault
 * or changes whether source evidence still exists.
 */
export function updateMineruAuditReview(
  root: string,
  change: MineruAuditChange,
  options: MineruReviewOptions = {},
): MineruAuditPayload {
  const resolved = projectPath(root);
  if (!change || typeof change.id !== "string" ||
    change.expectedProjectId !==
      crypto.createHash("sha256").update(resolved).digest("hex") ||
    typeof change.sourceFingerprint !== "string" ||
    !Number.isSafeInteger(change.expectedRevision) ||
    change.expectedRevision < 0 ||
    !["待审核", "已核查", "疑似误报"].includes(change.decision) ||
    typeof change.note !== "string" || change.note.length > 1000) {
    throw new TypeError("无效审核请求，备注不得超过1000字");
  }
  const filePath = mineruAuditReviewPath(resolved, options.reviewDirectory);
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dir, 0o700);
  const lockFile = filePath + ".lock";
  let fd: number;
  try {
    fd = fs.openSync(lockFile, "wx", 0o600);
  } catch {
    throw new Error("审计审核正在更新，请稍后重试");
  }
  try {
    const reviews = readReviews(resolved, filePath);
    if (change.expectedRevision !== reviews.revision) {
      throw new Error("审核版本已变化，请刷新后重试");
    }
    const current = mergedAudit(resolved, reviews, options.sourceMapCacheDirectory);
    if (current.sourceFingerprint !== change.sourceFingerprint) {
      throw new Error("原始证据已变化，请刷新后重新审核");
    }
    if (!current.entries.some((item) => item.id === change.id)) {
      throw new Error("审核证据编号不存在或已消失");
    }
    const next: ReviewFile = {
      ...reviews,
      revision: reviews.revision + 1,
      reviews: { ...reviews.reviews },
    };
    if (change.decision === "待审核") {
      delete next.reviews[change.id];
    } else {
      next.reviews[change.id] = {
        decision: change.decision,
        note: change.note.trim(),
        fingerprint: change.sourceFingerprint,
        reviewedAt: new Date().toISOString(),
      };
    }
    const temporary = filePath + "." + crypto.randomBytes(8).toString("hex") + ".tmp";
    try {
      fs.writeFileSync(temporary, JSON.stringify(next, null, 2), {
        mode: 0o600, flag: "wx",
      });
      fs.renameSync(temporary, filePath);
      fs.chmodSync(filePath, 0o600);
    } finally {
      try { fs.unlinkSync(temporary); } catch { /* renamed */ }
    }
    return mergedAudit(resolved, next, options.sourceMapCacheDirectory);
  } finally {
    fs.closeSync(fd!);
    fs.unlinkSync(lockFile);
  }
}
