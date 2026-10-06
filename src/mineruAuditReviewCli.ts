import * as fs from "fs";
import * as path from "path";
import {
  readMineruAuditReviews,
  updateMineruAuditReview,
  type MineruAuditChange,
} from "./mineruAuditReviewStore";

// Trusted server-only CLI: never accepts an unvalidated project directory
// or chapter selector from an arbitrary client.
if (require.main === module) {
  const action = process.argv[2];
  const projectRoot = process.argv[3];
  if (!projectRoot || !["read", "update"].includes(action)) {
    process.stderr.write("MinerU audit CLI requires action and project root");
    process.exitCode = 1;
  } else {
    try {
      const root = path.resolve(projectRoot);
      const reviewDirectory = process.env.OCR2MD_MINERU_AUDIT_REVIEW_DIR;
      const opts = reviewDirectory ? { reviewDirectory } : {};
      const result = action === "read"
        ? readMineruAuditReviews(root, opts)
        : updateMineruAuditReview(
          root, JSON.parse(fs.readFileSync(0, "utf8")) as MineruAuditChange, opts,
        );
      process.stdout.write(JSON.stringify(result));
    } catch (error) {
      process.stderr.write(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
