import * as assert from "assert";
import * as path from "path";
import * as fs from "fs";
import { ChapterWorkspaceApplication } from "./chapterWorkspaceApplication";
import { candidatesFromSidecar, serializeSidecar } from "./sidecar";
import type { AnnotationPair, Candidate, FileEntry } from "./types";
import { readText, writeText, type WorkspaceDirectoryEntry, type WorkspaceFileStat, type WorkspaceStorage } from "./workspaceStorage";
import { chapterOriginalPath, chapterSidecarPath, chapterWorkingCopyPath } from "./workspaceFiles";

class MemoryWorkspaceStorage implements WorkspaceStorage {
  readonly files = new Map<string, Uint8Array>();
  readonly directories = new Set<string>();
  async readFile(filePath: string): Promise<Uint8Array> { const value = this.files.get(filePath); if (!value) throw new Error(`ENOENT: ${filePath}`); return value; }
  async writeFile(filePath: string, data: Uint8Array): Promise<void> { this.files.set(filePath, Uint8Array.from(data)); }
  async exists(targetPath: string): Promise<boolean> { return this.files.has(targetPath) || this.directories.has(targetPath); }
  async readDirectory(directoryPath: string): Promise<WorkspaceDirectoryEntry[]> {
    const prefix = directoryPath.endsWith(path.sep) ? directoryPath : `${directoryPath}${path.sep}`;
    const entries = new Map<string, "file" | "directory">();
    for (const filePath of this.files.keys()) {
      if (!filePath.startsWith(prefix)) continue;
      const rest = filePath.slice(prefix.length);
      const [name, child] = rest.split(path.sep);
      if (name) entries.set(name, child ? "directory" : "file");
    }
    for (const childPath of this.directories) {
      if (!childPath.startsWith(prefix) || childPath === directoryPath) continue;
      const rest = childPath.slice(prefix.length);
      const [name] = rest.split(path.sep);
      if (name) entries.set(name, "directory");
    }
    return [...entries].map(([name, type]) => ({ name, type }));
  }
  async createDirectory(directoryPath: string): Promise<void> { this.directories.add(directoryPath); }
  async copy(sourcePath: string, targetPath: string): Promise<void> { const value = this.files.get(sourcePath); if (!value) throw new Error(`ENOENT: ${sourcePath}`); this.files.set(targetPath, Uint8Array.from(value)); }
  async rename(sourcePath: string, targetPath: string): Promise<void> { const value = this.files.get(sourcePath); if (!value) throw new Error(`ENOENT: ${sourcePath}`); this.files.set(targetPath, value); this.files.delete(sourcePath); }
  async delete(targetPath: string): Promise<void> { if (!this.files.delete(targetPath) && !this.directories.delete(targetPath)) throw new Error(`ENOENT: ${targetPath}`); }
  async stat(targetPath: string): Promise<WorkspaceFileStat> { const value = this.files.get(targetPath); if (value) return { type: "file", ctime: 1, mtime: 2, size: value.byteLength }; if (this.directories.has(targetPath)) return { type: "directory", ctime: 1, mtime: 2, size: 0 }; throw new Error(`ENOENT: ${targetPath}`); }
}

void (async () => {
  const storage = new MemoryWorkspaceStorage();
  const now = new Date("2026-08-28T12:00:00.000Z");
  const app = new ChapterWorkspaceApplication(storage, () => now);
  const workspaceRoot = "/ws";
  const originalPath = chapterOriginalPath(workspaceRoot, "01 Sample.md");
  const workingPath = chapterWorkingCopyPath(workspaceRoot, originalPath);
  const exported = [
    "---",
    "ocr2md_chapter_split: true",
    "ocr2md_chapter_changed: false",
    "---",
    "",
    "# Sample",
    "",
    "Original body.",
  ].join("\n");
  await storage.createDirectory(path.dirname(originalPath));
  await writeText(storage, originalPath, exported);

  const first = await app.ensureChapterWorkingCopy({ workspaceRoot, filePath: originalPath, originalText: exported });
  assert.strictEqual(first.workingPath, workingPath);
  assert.strictEqual(first.workingText, exported);
  assert.strictEqual(await readText(storage, workingPath), exported);

  await writeText(storage, workingPath, exported.replace("Original body.", "Reviewed body."));
  const second = await app.ensureChapterWorkingCopy({ workspaceRoot, filePath: originalPath, originalText: exported });
  assert.ok(second.workingText.includes("Reviewed body."), "existing reviewed working copy must win over original");

  const rows: Candidate[] = [{
    id: "row-1", rowId: "row-1", atomId: "atom-1", kind: "regex", label: "Sample", raw: "# Sample", preview: "# Sample",
    range: { line: 5, start: 0, end: 8 }, typeLabel: "章节标题", lineType: "1 级标题", sourcePath: originalPath,
    workingCopyPath: workingPath, status: "候选",
  }];
  const annotationPairs: AnnotationPair[] = [];
  const savedPath = await app.saveSidecar({ filePath: originalPath, rows, annotationPairs });
  assert.strictEqual(savedPath, chapterSidecarPath(originalPath));
  const savedRaw = JSON.parse(await readText(storage, savedPath));
  assert.strictEqual(candidatesFromSidecar(savedRaw).rows.length, 1);
  const loaded = await app.loadSidecar({ workspaceRoot, filePath: originalPath, workingPath });
  assert.strictEqual(loaded.rows.length, 1);
  assert.strictEqual(loaded.rows[0].lineType, "1 级标题");

  const files: FileEntry[] = [{ label: "01 Sample", path: originalPath, kind: "chapter" }];
  const synced = await app.syncChapterChangeMarkers(workspaceRoot, files);
  assert.strictEqual(synced[0].changed, true);
  assert.ok((await readText(storage, originalPath)).includes("ocr2md_chapter_changed: true"));
  await app.writeChapterChangedMarker(originalPath, false);
  assert.ok((await readText(storage, originalPath)).includes("ocr2md_chapter_changed: false"));

  const rawA = path.join(workspaceRoot, "001.md");
  const rawB = path.join(workspaceRoot, "002.md");
  await writeText(storage, rawA, "# Raw A\n");
  await writeText(storage, rawB, "# Raw B\n");
  await writeText(storage, path.join(workspaceRoot, "trans", "ignored.md"), "# ignored\n");
  await writeText(storage, path.join(path.dirname(originalPath), "01 Sample.working.md"), "# ignored working\n");
  const discovered = await app.discoverWorkspaceFiles(workspaceRoot);
  assert.ok(discovered.some((file) => file.path === rawA && file.kind === "ocr"));
  assert.ok(discovered.some((file) => file.path === originalPath && file.kind === "chapter"));
  assert.ok(!discovered.some((file) => file.path.includes(`${path.sep}trans${path.sep}`)), "trans trees must stay out of workspace source discovery");
  const sequence = await app.readSequenceInputs(workspaceRoot, path.join(workspaceRoot, ".ocr2md-merged.working.md"));
  assert.deepStrictEqual(sequence.map((item) => path.basename(item.path)), ["001.md", "002.md"]);

  const boundaryWorking = path.join(workspaceRoot, ".ocr2md-merged.working.md");
  const mergedText = "# One\n\nBody one.\n\n# Two\n\nBody two.\n";
  const boundary = await app.ensureChapterBoundaryWork({
    workspaceRoot,
    workingPath: boundaryWorking,
    inputs: [{ path: "/ws/001.md", text: mergedText }],
    mergedText,
  });
  assert.ok(boundary);
  assert.strictEqual(boundary?.workingText, mergedText);
  const manifest = JSON.parse(await readText(storage, boundary!.manifestPath));
  assert.strictEqual(manifest.createdAt, now.toISOString());

  const written = await app.writeChapterBoundarySegments({
    workspaceRoot,
    workingPath: boundaryWorking,
    workingText: mergedText,
    segments: [
      { chapterFile: "01 One.md", startLine: 0, endLine: 4 },
      { chapterFile: "02 Two.md", startLine: 4, endLine: 8 },
    ],
  });
  assert.strictEqual(written.length, 2);
  const firstChapter = await readText(storage, written[0].originalPath);
  assert.ok(firstChapter.includes("ocr2md_chapter_split_at: 2026-08-28T12:00:00.000Z"));
  assert.ok(firstChapter.includes("# One"));
  assert.strictEqual(await storage.exists(written[0].workingPath), true);

  // Replay the real Buffett review fixture through the platform-independent storage layer.
  const fixtureRoot = path.resolve(__dirname, "../test-fixtures/buffetts-alpha");
  const realSource = fs.readFileSync(path.join(fixtureRoot, "source.md"), "utf8");
  const realWorking = fs.readFileSync(path.join(fixtureRoot, "working.md"), "utf8");
  const realSidecarRaw = fs.readFileSync(path.join(fixtureRoot, "sidecar.json"), "utf8");
  const realParsed = candidatesFromSidecar(JSON.parse(realSidecarRaw));
  const realOriginalPath = realParsed.sourceFile!;
  const realWorkingPath = realParsed.rows.find((row) => row.workingCopyPath)?.workingCopyPath!;
  assert.ok(realOriginalPath && realWorkingPath);
  await writeText(storage, realOriginalPath, realSource);
  await writeText(storage, realWorkingPath, realWorking);
  await writeText(storage, chapterSidecarPath(realOriginalPath), realSidecarRaw);
  const realLoaded = await app.loadSidecar({
    workspaceRoot: path.resolve(realOriginalPath, "../../.."),
    filePath: realOriginalPath,
    workingPath: realWorkingPath,
  });
  assert.strictEqual(realLoaded.rows.filter((row) => row.typeLabel === "章节标题").length, 117);
  assert.strictEqual(realLoaded.rows.filter((row) => row.typeLabel === "注释").length, 21);
  assert.strictEqual(realLoaded.rows.filter((row) => row.typeLabel === "嵌入块").length, 65);
  assert.strictEqual(realLoaded.rows.filter((row) => row.typeLabel === "非法断行").length, 9);
  assert.strictEqual(
    realLoaded.rows.find((row) => row.typeLabel === "章节标题" && row.raw.includes("Andrea Frazzini, David Kabiller"))?.lineType,
    "非标题",
  );

  // Sidecar serialization remains compatible with the existing schema.
  assert.strictEqual(serializeSidecar(originalPath, rows, annotationPairs).sourceFile, originalPath);
  console.log("chapterWorkspaceApplication tests passed");
})();
