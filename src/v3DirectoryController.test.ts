import * as assert from "assert";
import { FixtureWorkspaceRegistry } from "./v3FixtureWorkspaceFs";
import { V3DirectoryController } from "./v3DirectoryController";
import { WorkspaceV3Error, location } from "./workspaceFsV3";

let checks = 0;
async function rejected(f: () => Promise<unknown>, code: string) {
  checks++;
  await assert.rejects(f, e => e instanceof WorkspaceV3Error && e.code === code);
}
const utf8 = new TextEncoder();
const registry = new FixtureWorkspaceRegistry([
  { workspaceId: "books", label: "Originals" },
  { workspaceId: "notes", label: "Notes" },
]);
let counter = 0;
let activity = { dirty: false, saving: false, inFlightOperation: false };
const controller = new V3DirectoryController(registry, "books", () => "t-" + ++counter, () => activity);
const captured: string[] = [];
const release = controller.subscribe(s => captured.push(s.workspaceId + ":" + s.directory));

async function run() {
  await controller.initialize(); checks++;
  assert.deepStrictEqual(controller.snapshot().entries, []);
  await controller.createDirectory("chapters"); checks++;
  await controller.createDirectory("assets"); checks++;
  await controller.createFile("README.md", utf8.encode("# ocr2md")); checks++;
  assert.strictEqual(controller.snapshot().entries.length, 3);
  const readme = controller.snapshot().entries.find(n => n.path === "/README.md")!;
  const firstId = readme.nodeId;
  await controller.rename(readme, "INTRO.md"); checks++;
  const renamed = controller.snapshot().entries.find(n => n.path === "/INTRO.md")!;
  assert.strictEqual(renamed.nodeId, firstId, "rename preserves identity");
  await controller.copyFile(renamed, "COPY.md"); checks++;
  const copied = controller.snapshot().entries.find(n => n.path === "/COPY.md")!;
  assert.notStrictEqual(copied.nodeId, firstId, "copy allocates independent identity");
  await controller.move(renamed, "/chapters"); checks++;
  await controller.browse("/chapters"); checks++;
  const moved = controller.snapshot().entries.find(n => n.path === "/chapters/INTRO.md")!;
  assert.strictEqual(moved.nodeId, firstId, "move preserves identity");
  await controller.remove(moved); checks++;
  assert.deepStrictEqual(controller.snapshot().entries, []);
  await controller.browse("/"); checks++;
  const chapters = controller.snapshot().entries.find(n => n.path === "/chapters")!;
  await controller.createFile("temporary.txt"); checks++;
  const file = controller.snapshot().entries.find(n => n.path === "/temporary.txt")!;
  await rejected(() => controller.rename(file, "COPY.md"), "EEXIST");
  assert.ok(controller.snapshot().entries.some(n => n.nodeId === file.nodeId), "failed operation cannot partially delete source");
  await rejected(() => controller.createFile("COPY.md"), "EEXIST");
  await rejected(() => controller.rename(chapters, "../outside"), "EINVAL");
  await rejected(() => controller.createDirectory("../../outside"), "EINVAL");
  await rejected(() => controller.createFile("a/b.txt"), "EINVAL");
  await rejected(() => controller.remove(chapters, { recursive: true, confirmation: "DELETE nope" }), "EACCES");
  await controller.browse("/chapters"); checks++;
  await controller.createFile("nested.pdf", utf8.encode("pdf")); checks++;
  await controller.browse("/"); checks++;
  const busyChapters = controller.snapshot().entries.find(n => n.nodeId === chapters.nodeId)!;
  await rejected(() => controller.remove(busyChapters), "ENOTEMPTY");
  await controller.remove(busyChapters, { recursive: true, confirmation: "DELETE /chapters" }); checks++;
  assert.ok(!controller.snapshot().entries.some(n => n.path === "/chapters"));

  // CAS stale revision and rename by identity (two concurrent readers).
  const another = await registry.open("books");
  const copyRef = await another.stat(location("books", "/COPY.md"));
  await controller.rename(copyRef, "COPIED.md"); checks++;
  await rejected(() => another.commit({ workspaceId: "books", requestId: "external-stale",
    operations: [{ type: "remove", target: copyRef, expectedRevision: copyRef.revision }] }), "ENOENT");
  const latest = await another.stat(location("books", "/COPIED.md"));
  const read = await another.readRange(latest, { offset: 1, length: 2, expectedRevision: latest.revision });
  assert.strictEqual(new TextDecoder().decode(read.bytes), " o"); checks++;
  await rejected(() => another.readRange(latest, { offset: 0, length: 1, expectedRevision: "r-old" }), "ESTALE");
  await rejected(() => another.readRange(latest, { offset: -1, length: 1 }), "EINVAL");

  // Atomic batch: second op fails, first must NOT persist.
  const before = (await another.stat(location("books", "/assets"))).revision;
  await rejected(() => another.commit({ workspaceId: "books", requestId: "failed-batch",
    operations: [
      { type: "create-directory", at: location("books", "/was-not-created"), ifAbsent: true },
      { type: "create-directory", at: location("books", "/assets"), ifAbsent: true },
    ] }), "EEXIST");
  await rejected(() => another.stat(location("books", "/was-not-created")), "ENOENT");
  assert.strictEqual((await another.stat(location("books", "/assets"))).revision, before); checks++;
  // Same request after failed attempt can succeed if request corrected; no receipt was committed.
  const valid = { workspaceId: "books", requestId: "idempotent",
    operations: [{ type: "create-directory" as const, at: location("books", "/stable"), ifAbsent: true as const }] };
  const receipt1 = await another.commit(valid);
  const receipt2 = await another.commit(valid);
  assert.deepStrictEqual(receipt1, receipt2); checks++;
  await rejected(() => another.commit({ ...valid, operations: [{ type: "create-directory",
    at: location("books", "/different"), ifAbsent: true }] }), "ECONFLICT");
  const marker = controller.snapshot();
  assert.ok(marker.stale, "external commit invalidates other handle"); checks++;
  await controller.refresh();
  assert.ok(controller.snapshot().entries.some(n => n.path === "/stable")); checks++;

  // Page cursor bound to snapshot generation: unrelated external changes invalidate.
  const pagedFs = await registry.open("books");
  const page1 = await pagedFs.list(location("books", "/"));
  assert.ok(page1.entries.length >= 3); checks++;
  await another.commit({ workspaceId: "books", requestId: "external-new-dir",
    operations: [{ type: "create-directory", at: location("books", "/external"), ifAbsent: true }] });
  if (page1.nextCursor) await rejected(() => pagedFs.list(location("books", "/"), page1.nextCursor), "ESTALE");

  // Real pagination, cursor invalidation, and refresh after external edits.
  const pageRegistry = new FixtureWorkspaceRegistry([{ workspaceId: "paged", label: "Paged" }], 2);
  const seedPage = await pageRegistry.open("paged");
  assert.strictEqual((await seedPage.getCapabilities()).durableLocal, false);
  await seedPage.commit({ workspaceId: "paged", requestId: "seed-page", operations:
    ["a", "b", "c", "d", "e"].map(name => ({ type: "create-directory" as const,
      at: location("paged", "/" + name), ifAbsent: true as const })) });
  const pager = new V3DirectoryController(pageRegistry, "paged", () => "page-" + ++counter);
  await pager.initialize();
  assert.strictEqual(pager.snapshot().entries.length, 2); checks++;
  await pager.loadMore(); assert.strictEqual(pager.snapshot().entries.length, 4); checks++;
  await pager.loadMore(); assert.strictEqual(pager.snapshot().entries.length, 5); checks++;
  await pager.refresh();
  await seedPage.commit({ workspaceId: "paged", requestId: "external-page",
    operations: [{ type: "create-directory", at: location("paged", "/f"), ifAbsent: true }] });
  assert.strictEqual(pager.snapshot().stale, true);
  await rejected(() => pager.loadMore(), "ESTALE");
  await pager.refresh(); await pager.loadMore(); await pager.loadMore();
  assert.strictEqual(pager.snapshot().entries.length, 6); checks++;
  await seedPage.close(); await pager.close();

  // Workspace switch must never silently lose a dirty draft; no reload or partial switch.
  activity = { dirty: true, saving: false, inFlightOperation: false };
  assert.deepStrictEqual(await controller.switchWorkspace("notes"), { kind: "resolve-draft" }); checks++;
  assert.strictEqual(controller.snapshot().workspaceId, "books");
  activity = { dirty: false, saving: true, inFlightOperation: false };
  assert.deepStrictEqual(await controller.switchWorkspace("notes"), { kind: "blocked", reason: "saving" }); checks++;
  activity = { dirty: false, saving: false, inFlightOperation: true };
  assert.deepStrictEqual(await controller.switchWorkspace("notes"), { kind: "blocked", reason: "operation" }); checks++;
  activity = { dirty: false, saving: false, inFlightOperation: false };
  registry.block("notes");
  await rejected(() => controller.switchWorkspace("notes"), "EOFFLINE");
  assert.strictEqual(controller.snapshot().workspaceId, "books"); checks++;
  registry.block("notes", false);
  assert.deepStrictEqual(await controller.switchWorkspace("notes"), { kind: "proceed" }); checks++;
  assert.strictEqual(controller.snapshot().workspaceId, "notes");
  await controller.createDirectory("my-notes"); checks++;
  assert.ok(controller.snapshot().entries.some(n => n.path === "/my-notes"));
  assert.deepStrictEqual(await controller.switchWorkspace("books"), { kind: "proceed" }); checks++;
  assert.ok(controller.snapshot().entries.some(n => n.path === "/stable"));
  assert.deepStrictEqual(await controller.switchWorkspace("books"), { kind: "no-op" }); checks++;
  assert.ok(captured.includes("notes:/") && captured.includes("books:/"), "selector publishes snapshots");
  await rejected(() => controller.browse("/my-notes"), "ENOENT");
  // Default book-home uses an explicitly scoped initial path WITHOUT
  // changing the underlying Mac Vault root or other controller consumers.
  const homeRegistry = new FixtureWorkspaceRegistry([{ workspaceId: "home", label: "Home" }]);
  const seedHome = await homeRegistry.open("home");
  await seedHome.commit({ workspaceId:"home", requestId:"seed-home",
    operations:[
      {type:"create-directory",at:location("home","/ocr2md"),ifAbsent:true},
      {type:"create-directory",at:location("home","/ocr2md/Book"),ifAbsent:true},
    ] });
  const home = new V3DirectoryController(homeRegistry,"home",()=>"home-" + ++counter,
    undefined,"/ocr2md");
  const beforeInit = home.snapshot();
  assert.strictEqual(beforeInit.directory,"/ocr2md"); checks++;
  await home.initialize();
  assert.strictEqual(home.snapshot().directory,"/ocr2md");
  assert.deepStrictEqual(home.snapshot().entries.map(n=>n.path),["/ocr2md/Book"]); checks++;
  await home.browse("/ocr2md/Book");
  await home.refresh();
  assert.strictEqual(home.snapshot().directory,"/ocr2md/Book"); checks++;
  await home.close();await seedHome.close();

  await another.close(); await pagedFs.close();
  release(); await controller.close();
  await rejected(() => controller.createDirectory("z"), "EBUSY");
  console.log("v3DirectoryController tests passed (" + checks + " scenarios)");
}
void run().catch(err => { console.error(err); process.exitCode = 1; });
