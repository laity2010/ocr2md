import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";

const root = path.resolve(__dirname, "..");
const extensionSource = fs.readFileSync(path.join(root, "src", "extension.ts"), "utf8");
const applicationSource = fs.readFileSync(path.join(root, "src", "chapterReviewApplication.ts"), "utf8");
const adapterSource = fs.readFileSync(path.join(root, "src", "vscodeWorkspaceStorage.ts"), "utf8");

assert.ok(!extensionSource.includes("vscode.workspace.fs"), "extension orchestration must use WorkspaceStorage instead of VS Code FS directly");
assert.ok(!applicationSource.includes('from "vscode"'), "chapter review application must remain platform independent");
assert.ok(!applicationSource.includes("vscode.workspace.fs"), "chapter review application must not access VS Code storage");
assert.ok(adapterSource.includes("vscode.workspace.fs"), "VS Code filesystem access must stay isolated in the storage adapter");
assert.ok(extensionSource.includes("new VsCodeWorkspaceStorage()"), "VS Code host must inject its storage adapter through the shared contract");

console.log("workspaceStorageBoundary tests passed");
