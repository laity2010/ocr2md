import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";

const sourceRoot = path.resolve(__dirname, "../src");
const application = fs.readFileSync(path.join(sourceRoot, "chapterWorkspaceApplication.ts"), "utf8");
const extension = fs.readFileSync(path.join(sourceRoot, "extension.ts"), "utf8");

assert.ok(!application.includes('from "vscode"'), "chapter workspace application must stay platform-independent");
assert.ok(!application.includes("vscode."), "chapter workspace application must not call VS Code APIs");
for (const implementationDetail of [
  "planChapterWorkingCopyInit",
  "serializeSidecar",
  "candidatesFromSidecar",
  "withChapterFrontmatter",
  "vscode.workspace.findFiles",
]) {
  assert.ok(!extension.includes(implementationDetail), `workspace workflow leaked back into extension: ${implementationDetail}`);
}
for (const delegation of [
  "chapterWorkspace.ensureChapterWorkingCopy",
  "chapterWorkspace.loadSidecar",
  "chapterWorkspace.saveSidecar",
  "chapterWorkspace.syncChapterChangeMarkers",
  "chapterWorkspace.ensureChapterBoundaryWork",
  "chapterWorkspace.writeChapterBoundarySegments",
  "chapterWorkspace.discoverWorkspaceFiles",
]) {
  assert.ok(extension.includes(delegation), `VS Code host must delegate workspace workflow: ${delegation}`);
}

console.log("chapterWorkspaceApplicationBoundary tests passed");
