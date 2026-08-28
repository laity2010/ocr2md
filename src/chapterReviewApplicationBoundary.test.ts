import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";

const sourceRoot = path.resolve(__dirname, "../src");
const application = fs.readFileSync(path.join(sourceRoot, "chapterReviewApplication.ts"), "utf8");
const extension = fs.readFileSync(path.join(sourceRoot, "extension.ts"), "utf8");

assert.ok(!application.includes('from "vscode"'), "chapter review application must stay platform-independent");
assert.ok(!application.includes("vscode."), "chapter review application must not call VS Code APIs");
assert.ok(extension.includes("application.addManualReviewLine"), "VS Code host must delegate manual row creation to ChapterReviewApplication");
assert.ok(extension.includes("application.setRowsLineType"), "VS Code host must delegate review state transition: application.setRowsLineType");
assert.ok(extension.includes("application.applyWorkingCopyDiff"), "VS Code host must delegate review state transition: application.applyWorkingCopyDiff");
for (const leakedImplementation of [
  "nearestMatchingLine",
  "findReusableManualRow",
  "attachLineIdentity",
  "extractAnnotationNumber",
  "applyEmbedNumbers",
  "defaultLineType(",
  "applyChangeState",
  "scanChapterBoundaryLines",
  "chapterDiffBaseline",
  "applyReviewRowsLineType",
]) {
  assert.ok(!extension.includes(leakedImplementation), `manual review behavior leaked back into extension: ${leakedImplementation}`);
}

console.log("chapterReviewApplicationBoundary tests passed");
