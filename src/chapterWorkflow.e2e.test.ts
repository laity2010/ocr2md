import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { exportByCalibration } from "./calibrationExport";
import { ChapterReviewApplication } from "./chapterReviewApplication";
import { ChapterWorkspaceApplication } from "./chapterWorkspaceApplication";
import { MODULE_REGEX_DEFAULTS } from "./regexPresets";
import { candidatesFromSidecar } from "./sidecar";
import { readText, writeText, type WorkspaceDirectoryEntry, type WorkspaceFileStat, type WorkspaceStorage } from "./workspaceStorage";
import { chapterSidecarPath } from "./workspaceFiles";

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

function splitPatterns(value: string): string[] {
  return value.split(/^\s*---\s*$/m).map((item) => item.trim()).filter(Boolean);
}

void (async () => {
  const fixtureRoot = path.resolve(__dirname, "../test-fixtures/buffetts-alpha");
  const source = fs.readFileSync(path.join(fixtureRoot, "source.md"), "utf8");
  const working = fs.readFileSync(path.join(fixtureRoot, "working.md"), "utf8");
  const sidecarRaw = fs.readFileSync(path.join(fixtureRoot, "sidecar.json"), "utf8");
  const sidecar = candidatesFromSidecar(JSON.parse(sidecarRaw));
  const sourcePath = sidecar.sourceFile!;
  const workingPath = sidecar.rows.find((row) => row.workingCopyPath)?.workingCopyPath!;
  assert.ok(sourcePath && workingPath, "real fixture must carry source and working paths");
  const workspaceRoot = path.dirname(path.dirname(path.dirname(sourcePath)));
  const sourceLabel = path.relative(workspaceRoot, sourcePath);

  const storage = new MemoryWorkspaceStorage();
  await writeText(storage, sourcePath, source);
  await writeText(storage, workingPath, working);
  await writeText(storage, chapterSidecarPath(sourcePath), sidecarRaw);

  const workspace = new ChapterWorkspaceApplication(storage, () => new Date("2026-08-28T12:00:00.000Z"));
  const loaded = await workspace.loadSidecar({ workspaceRoot, filePath: sourcePath, workingPath });
  const review = new ChapterReviewApplication({ rows: loaded.rows, annotationPairs: loaded.annotationPairs });

  review.refreshChapterTitle({
    baselineText: source,
    workingText: working,
    sourcePath,
    workingPath,
    sourceLabel,
    embedPatterns: splitPatterns(MODULE_REGEX_DEFAULTS["嵌入块"] ?? ""),
  });
  review.refreshAnnotation({
    baselineText: source,
    workingText: working,
    sourcePath,
    workingPath,
    sourceLabel,
    patterns: splitPatterns(MODULE_REGEX_DEFAULTS["注释"] ?? ""),
  });
  review.refreshEmbed({
    baselineText: source,
    workingText: working,
    sourcePath,
    workingPath,
    sourceLabel,
    patterns: splitPatterns(MODULE_REGEX_DEFAULTS["嵌入块"] ?? ""),
  });
  review.refreshIllegalLineBreak({ workingText: working, sourcePath, workingPath });

  const finalState = review.snapshot();
  assert.strictEqual(finalState.rows.filter((row) => row.typeLabel === "章节标题").length, 117);
  assert.strictEqual(finalState.rows.filter((row) => row.typeLabel === "注释").length, 21);
  assert.strictEqual(finalState.rows.filter((row) => row.typeLabel === "嵌入块").length, 65);
  assert.strictEqual(finalState.rows.filter((row) => row.typeLabel === "非法断行").length, 9);
  assert.strictEqual(
    finalState.rows.find((row) => row.typeLabel === "章节标题" && row.raw.includes("Andrea Frazzini, David Kabiller"))?.lineType,
    "非标题",
  );
  assert.strictEqual(finalState.rows.filter((row) => row.typeLabel === "非法断行" && row.lineType === "合并").length, 6);

  const exported = exportByCalibration(working, finalState.rows, { numberHeadings: true });
  const expectedPath = path.join(fixtureRoot, "expected-calibrated.md");
  if (process.env.UPDATE_CHAPTER_GOLDEN === "1") {
    fs.writeFileSync(expectedPath, exported, "utf8");
  } else {
    assert.strictEqual(exported, fs.readFileSync(expectedPath, "utf8"), "real chapter calibrated Markdown changed unexpectedly");
  }

  const outputPath = await workspace.writeCalibrationOutput(sourcePath, exported);
  assert.strictEqual(await readText(storage, outputPath), exported, "platform-independent storage must persist the exact golden output");

  console.log("chapterWorkflow e2e tests passed");
})();
