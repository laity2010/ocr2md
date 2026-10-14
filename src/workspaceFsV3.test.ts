import * as assert from "assert";
import {
  WORKSPACE_FS_PROTOCOL_VERSION,
  WorkspaceV3Error,
  assertWorkspaceId,
  joinLogicalPath,
  location,
  normalizeLogicalPath,
  planWorkspaceSwitch,
  validateCommit,
  validateReadRange,
  type WorkspaceCapabilities,
  type WorkspaceCommitRequest,
  type WorkspaceFSV3,
  type WorkspaceMutation,
  type WorkspaceNodeRef,
  type SyncStatus,
} from "./workspaceFsV3";

const memoryCaps: WorkspaceCapabilities = {
  casWrites: true,
  atomicBatch: true,
  rangeRead: true,
  notifications: true,
  durableLocal: true,
  fileCoordination: false,
};

function rejection(call: () => unknown, code: string): void {
  assert.throws(call, (err: unknown) =>
    err instanceof WorkspaceV3Error && err.code === code,
  );
}

function commit(operations: readonly WorkspaceMutation[], id = "vault-001"): WorkspaceCommitRequest {
  return { workspaceId: id, requestId: "request-abc123", operations };
}

const working = location("vault-001", "/chapters/01/01.working.md");
const sidecar = location("vault-001", "/chapters/01/01.ocr2md.json");
const source: WorkspaceNodeRef = { ...working, nodeId: "item-a" };
const metadata: WorkspaceNodeRef = { ...sidecar, nodeId: "item-b" };
const bytes = new Uint8Array([35, 32, 65, 10]);

assert.strictEqual(WORKSPACE_FS_PROTOCOL_VERSION, 3);
assert.strictEqual(assertWorkspaceId("vault-001"), "vault-001");
for (const id of ["", ".", "..", "../outside", "foo/bar", " name", "a\\b", "a".repeat(129)]) {
  rejection(() => assertWorkspaceId(id), "EINVAL");
}

assert.strictEqual(normalizeLogicalPath("/"), "/");
assert.strictEqual(normalizeLogicalPath("/chapters/01/file.md"), "/chapters/01/file.md");
assert.strictEqual(normalizeLogicalPath("/书籍/e\u0301.md"), "/书籍/é.md");
assert.strictEqual(joinLogicalPath("/", "原文.pdf"), "/原文.pdf");
assert.strictEqual(joinLogicalPath("/chapters", "A"), "/chapters/A");
assert.deepStrictEqual(location("vault-001", "/书籍/e\u0301.md"), {
  workspaceId: "vault-001",
  path: "/书籍/é.md",
});
for (const p of ["", "relative", "/a/..", "/a/.", "/a//b", "/a/", "//root",
  "/a\\b", "/a\n", "/a\0", "C:/secrets", "/../private"]) {
  rejection(() => normalizeLogicalPath(p), "EINVAL");
}
for (const name of ["../escape", "a/b", ".", "..", "", "a\\b"]) {
  rejection(() => joinLogicalPath("/books", name), "EINVAL");
}
// Percent sequences are opaque segments; HTTP transports must decode once.
assert.strictEqual(normalizeLogicalPath("/%2e%2e"), "/%2e%2e");

validateReadRange({ offset: 0, length: 128 });
validateReadRange({ offset: 20, length: 1, expectedRevision: "sha256:abc" });
for (const range of [
  { offset: -1, length: 20 }, { offset: 0, length: 0 },
  { offset: 0.1, length: 1 }, { offset: Infinity, length: 1 },
  { offset: 0, length: Number.MAX_SAFE_INTEGER + 1 },
  { offset: Number.MAX_SAFE_INTEGER, length: 2 },
  { offset: 0, length: 1, expectedRevision: "" },
]) {
  rejection(() => validateReadRange(range), "EINVAL");
}

validateCommit(commit([{ type: "create-file", at: working, bytes, ifAbsent: true }]), memoryCaps);
validateCommit(commit([{ type: "create-directory",
  at: location("vault-001", "/chapters/New"), ifAbsent: true }]), memoryCaps);
validateCommit(commit([
  { type: "replace-file", target: source, bytes, expectedRevision: "r1" },
  { type: "replace-file", target: metadata, bytes, expectedRevision: "r2" },
]), memoryCaps);
validateCommit(commit([{ type: "move", target: source,
  to: location("vault-001", "/chapters/02/new.md"), expectedRevision: "r1", ifAbsent: true }]), memoryCaps);
validateCommit(commit([{ type: "copy", target: source,
  to: location("vault-001", "/chapters/02/copied.md"), expectedRevision: "r1", ifAbsent: true }]), memoryCaps);
validateCommit(commit([{ type: "remove", target: source, expectedRevision: "r1" }]), memoryCaps);
validateCommit(commit([{ type: "remove-tree", target: {
  ...location("vault-001", "/chapters/old"), nodeId: "item-c" },
  expectedRevision: "r1", expectedTreeRevision: "tree-r1", recursive: true }]), memoryCaps);

rejection(() => validateCommit(commit([{ type: "replace-file",
  target: source, expectedRevision: "r1", bytes }]), { ...memoryCaps, casWrites: false }), "EUNSUPPORTED");
rejection(() => validateCommit(commit([
  { type: "replace-file", target: source, expectedRevision: "r1", bytes },
  { type: "replace-file", target: metadata, expectedRevision: "r2", bytes },
]), { ...memoryCaps, atomicBatch: false }), "EUNSUPPORTED");
rejection(() => validateCommit(commit([]), memoryCaps), "EINVAL");
rejection(() => validateCommit({ ...commit([]), requestId: " " }, memoryCaps), "EINVAL");
rejection(() => validateCommit(commit([{ type: "create-file",
  at: location("another-vault", "/other.md"), bytes, ifAbsent: true }]), memoryCaps), "EINVAL");
rejection(() => validateCommit(commit([{ type: "create-file", at: working,
  bytes, ifAbsent: false } as unknown as WorkspaceMutation]), memoryCaps), "EINVAL");
rejection(() => validateCommit(commit([{ type: "replace-file", target: source,
  bytes, expectedRevision: "" }]), memoryCaps), "EINVAL");
rejection(() => validateCommit(commit([{ type: "replace-file", target: source,
  bytes: "not bytes" as unknown as Uint8Array, expectedRevision: "r1" }]), memoryCaps), "EINVAL");
rejection(() => validateCommit(commit([{ type: "remove", target: source,
  expectedRevision: "r1", recursive: true } as unknown as WorkspaceMutation]), memoryCaps), "EINVAL");
rejection(() => validateCommit(commit([{ type: "remove-tree",
  target: source, expectedRevision: "r1", expectedTreeRevision: "", recursive: true }]), memoryCaps), "EINVAL");
rejection(() => validateCommit(commit([{ type: "move", target: source,
  to: working, expectedRevision: "r1", ifAbsent: true }]), memoryCaps), "EINVAL");
rejection(() => validateCommit(commit([{ type: "move", target: source,
  to: location("another-vault", "/other.md"), expectedRevision: "r1", ifAbsent: true }]), memoryCaps), "EINVAL");
rejection(() => validateCommit(commit([{ type: "move", target: source,
  to: location("vault-001", "/chapters/01/01.working.md/subpath"),
  expectedRevision: "r1", ifAbsent: true }]), memoryCaps), "EINVAL");
rejection(() => validateCommit(commit([{ type: "remove",
  target: { ...source, path: "/" }, expectedRevision: "r1" }]), memoryCaps), "EINVAL");
rejection(() => validateCommit(commit([{ type: "remove",
  target: { ...source, path: "/书籍/e\u0301.md" }, expectedRevision: "r1" }]), memoryCaps), "EINVAL");
rejection(() => validateCommit(commit([
  { type: "remove", target: source, expectedRevision: "r1" },
  { type: "remove", target: source, expectedRevision: "r1" },
]), memoryCaps), "EINVAL");
rejection(() => validateCommit(commit([
  { type: "create-file", at: working, bytes, ifAbsent: true },
  { type: "create-file", at: working, bytes, ifAbsent: true },
]), memoryCaps), "EINVAL");
rejection(() => validateCommit(commit([{ type: "copy", target: source,
  to: location("another-vault", "/copy.md"), expectedRevision: "r1", ifAbsent: true }]), memoryCaps), "EINVAL");
rejection(() => validateCommit(commit([null as unknown as WorkspaceMutation]), memoryCaps), "EINVAL");
rejection(() => validateCommit(commit([
  { type: "bogus", target: source, expectedRevision: "r1" } as unknown as WorkspaceMutation,
]), memoryCaps), "EINVAL");

assert.deepStrictEqual(planWorkspaceSwitch("a", "a",
  { dirty: false, saving: false, inFlightOperation: false }), { kind: "no-op" });
assert.deepStrictEqual(planWorkspaceSwitch("a", "b",
  { dirty: true, saving: false, inFlightOperation: false }), { kind: "resolve-draft" });
assert.deepStrictEqual(planWorkspaceSwitch("a", "b",
  { dirty: false, saving: true, inFlightOperation: false }), { kind: "blocked", reason: "saving" });
assert.deepStrictEqual(planWorkspaceSwitch("a", "b",
  { dirty: true, saving: false, inFlightOperation: true }), { kind: "blocked", reason: "operation" });
assert.deepStrictEqual(planWorkspaceSwitch("a", "b",
  { dirty: false, saving: false, inFlightOperation: false }), { kind: "proceed" });

// Type-level guard: v3 consumers cannot bypass CAS by calling legacy writeFile.
// @ts-expect-error WorkspaceFSV3 intentionally has no unsafe writeFile method
const unsafeLegacyWrite: keyof WorkspaceFSV3 = "writeFile";
void unsafeLegacyWrite;

// Local save is not proof a cloud provider observed it.
const localStatus: SyncStatus = { state: "local-saved", nodeId: "item-a", localRevision: "r2" };
assert.strictEqual(localStatus.state, "local-saved");
const remoteStatus: SyncStatus = { state: "provider-observed", nodeId: "item-a",
  localRevision: "r2", providerId: "gd", observedRevision: "provider-r7" };
assert.strictEqual(remoteStatus.observedRevision, "provider-r7");

console.log("workspaceFsV3 contract tests passed");
