import fs from "node:fs";
import path from "node:path";

export function ensureFeatureDebugCopy(): void {
  const projectDir = path.resolve(
    process.env.OCR2MD_V2_TEST_PROJECT_DIR ?? ".tmp/persistent-project",
  );
  const chaptersDir = path.join(projectDir, "chapters");
  const source = path.join(chaptersDir, "01 Buffett’s Alpha");
  const target = path.join(chaptersDir, "01 Buffett’s Alpha 副本");

  if (!fs.existsSync(source)) {
    throw new Error("feature-debug source chapter is missing: " + source);
  }
  if (fs.existsSync(target)) return;
  fs.cpSync(source, target, { recursive: true });
}
