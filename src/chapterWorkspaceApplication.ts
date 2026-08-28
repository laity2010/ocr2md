import * as path from "path";
import type { ChapterBoundarySegment } from "./chapterBoundary";
import { rowBelongsToScope } from "./chapterReviewActions";
import { candidatesFromSidecar, serializeSidecar } from "./sidecar";
import type { AnnotationPair, Candidate, FileEntry } from "./types";
import { readText, writeText, type WorkspaceStorage } from "./workspaceStorage";
import {
  CHAPTER_BOUNDARY_WORKING_FILE,
  CHAPTER_CHANGED_PROPERTY,
  TRANS_OUTPUT_DIRECTORY,
  chapterContentsDiffer,
  chapterDirectoryPath,
  chapterImageDirectory,
  isCanonicalChapterOriginal,
  chapterOriginalPath,
  chapterOutputBaselinePath,
  chapterSidecarPath,
  chapterWorkingCopyPath,
  isChapterOutputPath,
  markdownFileKind,
  legacyChapterOutputBaselinePath,
  legacyChapterSidecarPaths,
  legacyChapterWorkingCopyPath,
  planChapterWorkingCopyInit,
  withChapterChangedFrontmatter,
} from "./workspaceFiles";

export interface ChapterWorkspaceReviewState {
  rows: Candidate[];
  annotationPairs: AnnotationPair[];
}

export interface EnsureChapterWorkingCopyInput {
  workspaceRoot: string;
  filePath: string;
  originalText: string;
}

export interface LoadedChapterSidecar extends ChapterWorkspaceReviewState {
  sidecarPath?: string;
}

export interface BoundarySequenceInput {
  path: string;
  text: string;
}

export interface EnsureChapterBoundaryWorkInput {
  workspaceRoot: string;
  workingPath: string;
  inputs: readonly BoundarySequenceInput[];
  mergedText: string;
}

export interface EnsureChapterBoundaryWorkResult {
  workingPath: string;
  workingText: string;
  baselinePath: string;
  manifestPath: string;
}

/**
 * Platform-independent file workflow for chapter review.
 * UI hosts provide editor/window UX; storage implementations provide persistence.
 */
export class ChapterWorkspaceApplication {
  constructor(
    private readonly storage: WorkspaceStorage,
    private readonly now: () => Date = () => new Date(),
  ) {}


  async discoverWorkspaceFiles(workspaceRoot: string): Promise<FileEntry[]> {
    const markdownPaths: string[] = [];
    await walkWorkspace(this.storage, workspaceRoot, markdownPaths);
    const files: FileEntry[] = [];
    for (const filePath of markdownPaths) {
      if (isChapterOutputPath(workspaceRoot, filePath) && !isCanonicalChapterOriginal(workspaceRoot, filePath)) continue;
      const text = await readText(this.storage, filePath);
      files.push({
        label: path.relative(workspaceRoot, filePath),
        path: filePath,
        kind: markdownFileKind(text),
      });
    }
    return files.sort((left, right) => left.label.localeCompare(right.label, "zh-CN", { numeric: true }));
  }

  async readSequenceInputs(workspaceRoot: string, workingPath: string): Promise<BoundarySequenceInput[]> {
    const files = (await this.discoverWorkspaceFiles(workspaceRoot))
      .filter((file) => file.kind === "ocr" && file.path !== workingPath)
      .sort((left, right) => left.label.localeCompare(right.label, "zh-CN", { numeric: true }));
    const inputs: BoundarySequenceInput[] = [];
    for (const file of files) inputs.push({ path: file.path, text: await readText(this.storage, file.path) });
    return inputs;
  }

  async ensureChapterWorkingCopy(input: EnsureChapterWorkingCopyInput): Promise<{ workingPath: string; workingText: string }> {
    const workingPath = chapterWorkingCopyPath(input.workspaceRoot, input.filePath);
    await this.storage.createDirectory(path.dirname(workingPath));

    if (!(await this.storage.exists(workingPath))) {
      const legacyWorkingPath = legacyChapterWorkingCopyPath(input.workspaceRoot, input.filePath);
      if (await this.storage.exists(legacyWorkingPath)) {
        await this.storage.copy(legacyWorkingPath, workingPath);
      }
    }

    let baselineText: string | undefined;
    if (isChapterOutputPath(input.workspaceRoot, input.filePath)) {
      for (const baselinePath of [
        chapterOutputBaselinePath(input.workspaceRoot, input.filePath),
        legacyChapterOutputBaselinePath(input.workspaceRoot, input.filePath),
      ]) {
        if (!(await this.storage.exists(baselinePath))) continue;
        baselineText = await readText(this.storage, baselinePath);
        break;
      }
    }

    const plan = planChapterWorkingCopyInit({
      workingExists: await this.storage.exists(workingPath),
      originalText: input.originalText,
      baselineText,
    });
    if (plan.action === "keep-working") {
      return { workingPath, workingText: await readText(this.storage, workingPath) };
    }

    await writeText(this.storage, workingPath, plan.workingText);
    if (plan.restoreOriginal !== undefined) {
      await writeText(this.storage, input.filePath, plan.restoreOriginal);
    }
    return { workingPath, workingText: plan.workingText };
  }

  async loadSidecar(input: {
    workspaceRoot: string;
    filePath: string;
    workingPath?: string;
  }): Promise<LoadedChapterSidecar> {
    let sidecarPath: string | undefined;
    for (const candidate of [chapterSidecarPath(input.filePath), ...legacyChapterSidecarPaths(input.workspaceRoot, input.filePath)]) {
      if (!(await this.storage.exists(candidate))) continue;
      sidecarPath = candidate;
      break;
    }
    if (!sidecarPath) return { rows: [], annotationPairs: [] };

    const parsed = JSON.parse(await readText(this.storage, sidecarPath));
    const loaded = candidatesFromSidecar(parsed);
    const workingPath = input.workingPath ?? input.filePath;
    const rows = loaded.rows
      .filter((row) => row.typeLabel && rowBelongsToScope(row, { sourcePath: input.filePath, workingPath }))
      .sort(compareRows);
    const annotationPairs = (loaded.annotationPairs ?? []).filter((pair) => pair.sourcePath === input.filePath);
    return { rows, annotationPairs, sidecarPath };
  }

  async saveSidecar(input: {
    filePath: string;
    rows: Candidate[];
    annotationPairs: AnnotationPair[];
  }): Promise<string> {
    const sidecarPath = chapterSidecarPath(input.filePath);
    await this.storage.createDirectory(path.dirname(sidecarPath));
    const sidecar = serializeSidecar(input.filePath, input.rows, input.annotationPairs);
    await writeText(this.storage, sidecarPath, JSON.stringify(sidecar, null, 2));
    return sidecarPath;
  }

  async syncChapterChangeMarkers(workspaceRoot: string, files: readonly FileEntry[]): Promise<FileEntry[]> {
    const next: FileEntry[] = [];
    for (const file of files) {
      if (file.kind !== "chapter" || !isChapterOutputPath(workspaceRoot, file.path)) {
        next.push(file);
        continue;
      }
      const originalText = await readText(this.storage, file.path);
      const workingPath = chapterWorkingCopyPath(workspaceRoot, file.path);
      const workingText = (await this.storage.exists(workingPath))
        ? await readText(this.storage, workingPath)
        : undefined;
      const changed = workingText !== undefined && chapterContentsDiffer(originalText, workingText);
      const updated = withChapterChangedFrontmatter(originalText, changed);
      if (updated !== originalText) await writeText(this.storage, file.path, updated);
      next.push({ ...file, changed });
    }
    return next;
  }

  async writeChapterChangedMarker(originalPath: string, changed: boolean): Promise<boolean> {
    if (!(await this.storage.exists(originalPath))) return false;
    const text = await readText(this.storage, originalPath);
    const updated = withChapterChangedFrontmatter(text, changed);
    if (updated === text) return false;
    await writeText(this.storage, originalPath, updated);
    return true;
  }

  async ensureChapterBoundaryWork(input: EnsureChapterBoundaryWorkInput): Promise<EnsureChapterBoundaryWorkResult | undefined> {
    if (!input.inputs.length && !(await this.storage.exists(input.workingPath))) return undefined;
    const boundaryDirectoryPath = path.join(input.workspaceRoot, ".ocr2md", "chapter-boundary");
    const baselinePath = path.join(boundaryDirectoryPath, "baseline.md");
    const manifestPath = path.join(boundaryDirectoryPath, "manifest.json");
    await this.storage.createDirectory(boundaryDirectoryPath);
    if (!(await this.storage.exists(input.workingPath))) {
      await writeText(this.storage, input.workingPath, input.mergedText);
    }
    const workingText = await readText(this.storage, input.workingPath);
    if (!(await this.storage.exists(baselinePath))) await writeText(this.storage, baselinePath, workingText);
    if (!(await this.storage.exists(manifestPath))) {
      await writeText(this.storage, manifestPath, JSON.stringify({
        schemaVersion: 2,
        createdAt: this.now().toISOString(),
        workingFile: input.workingPath,
        sourceFiles: input.inputs.map((item) => item.path),
      }, null, 2));
    }
    return { workingPath: input.workingPath, workingText, baselinePath, manifestPath };
  }

  async writeChapterBoundarySegments(input: {
    workspaceRoot: string;
    workingPath: string;
    workingText: string;
    segments: readonly ChapterBoundarySegment[];
  }): Promise<Array<{ chapterFile: string; originalPath: string; workingPath: string }>> {
    const lines = input.workingText.replace(/\r\n?/g, "\n").split("\n");
    const written: Array<{ chapterFile: string; originalPath: string; workingPath: string }> = [];
    for (const segment of input.segments) {
      const body = lines.slice(segment.startLine, segment.endLine).join("\n");
      const output = withChapterFrontmatter(body, segment.chapterFile, path.basename(input.workingPath), this.now());
      const chapterDir = chapterDirectoryPath(input.workspaceRoot, segment.chapterFile);
      const originalPath = chapterOriginalPath(input.workspaceRoot, segment.chapterFile);
      const workingPath = chapterWorkingCopyPath(input.workspaceRoot, originalPath);
      await this.storage.createDirectory(chapterDir);
      await this.storage.createDirectory(chapterImageDirectory(originalPath));
      await writeText(this.storage, originalPath, output);
      if (!(await this.storage.exists(workingPath))) await writeText(this.storage, workingPath, output);
      written.push({ chapterFile: segment.chapterFile, originalPath, workingPath });
    }
    return written;
  }
}

export function withChapterFrontmatter(markdown: string, chapterFile: string, source: string, now = new Date()): string {
  const body = markdown.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, "").replace(/^\s+/, "");
  return `---\nocr2md_chapter_split: true\nocr2md_chapter_split_at: ${now.toISOString()}\nocr2md_chapter_file: ${JSON.stringify(chapterFile)}\nocr2md_chapter_source: ${JSON.stringify(source)}\n${CHAPTER_CHANGED_PROPERTY}: false\n---\n\n${body}`;
}

function compareRows(left: Candidate, right: Candidate): number {
  return (left.sourceLabel ?? "").localeCompare(right.sourceLabel ?? "", "zh-CN", { numeric: true })
    || left.range.line - right.range.line
    || left.range.start - right.range.start
    || left.raw.localeCompare(right.raw);
}

const SKIPPED_DIRECTORY_NAMES = new Set([".ocr2md", "node_modules", "out", "output", "output_chapters", TRANS_OUTPUT_DIRECTORY]);

async function walkWorkspace(storage: WorkspaceStorage, directoryPath: string, markdownPaths: string[]): Promise<void> {
  let entries;
  try {
    entries = await storage.readDirectory(directoryPath);
  } catch {
    return;
  }
  for (const entry of entries) {
    const targetPath = path.join(directoryPath, entry.name);
    if (entry.type === "directory") {
      if (SKIPPED_DIRECTORY_NAMES.has(entry.name)) continue;
      await walkWorkspace(storage, targetPath, markdownPaths);
      continue;
    }
    if (entry.type !== "file" || !/\.md$/i.test(entry.name)) continue;
    if (entry.name === CHAPTER_BOUNDARY_WORKING_FILE) continue;
    if (/\.(?:annotation\.)?working\.md$/i.test(entry.name) || /\.baseline\.md$/i.test(entry.name)) continue;
    markdownPaths.push(targetPath);
  }
}
