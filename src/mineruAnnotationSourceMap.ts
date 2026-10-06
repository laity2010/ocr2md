import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  discoverCanonicalChapterMarkdown,
  mapMineruJsonFootnoteFactsToChapters,
  type MineruJsonFootnoteMarkdownMapResult,
} from "./mineruAnnotationMarkdownMap";
import {
  type MineruAnnotationProjection,
  type MineruProjectedAnnotationRow,
  projectMineruAnnotationRows,
  getChapterMineruAnnotationRows,
} from "./mineruAnnotationProjection";
import {
  discoverMineruSourceFiles,
  discoverMineruSourcePairs,
  invalidateMineruSourceSignatures,
  type MineruSourcePairDiscovery,
} from "./mineruSourceDiscovery";
import { loadMineruPageFootnotes } from "./mineruPageFootnotes";
import { chapterDisplayName } from "./workspaceFiles";

/** Bump when the interpretation or projection algorithm changes. */
const GENERATOR_VERSION = 1;
const SCHEMA_VERSION = 1;

export interface MineruSourceFileFingerprint {
  path: string;
  sha256: string;
  bytes: number;
}

export interface MineruAnnotationDocumentMap extends MineruJsonFootnoteMarkdownMapResult {
  jsonPath: string;
  markdownPath: string;
}

export interface MineruAnnotationSourceIssue {
  type: "pairing" | "unpaired-json" | "load-error" | "unidentified-footnote" | "unverified-reference";
  documentKey?: string;
  sourceJsonPath?: string;
  pageIndex?: number;
  annotationNumber?: number;
  reason: string;
}

export interface MineruAnnotationChapterProjection {
  chapterId: string;
  chapterPath: string;
  rows: MineruProjectedAnnotationRow[];
}

/** Entirely derived data; nothing here is user-confirmed sidecar state. */
export interface MineruProjectAnnotationSourceMap {
  schemaVersion: 1;
  generatorVersion: number;
  projectRoot: string;
  sourceFingerprint: string;
  sources: MineruSourceFileFingerprint[];
  discovery: MineruSourcePairDiscovery;
  documents: MineruAnnotationDocumentMap[];
  chapters: MineruAnnotationChapterProjection[];
  unassignedRows: MineruProjectedAnnotationRow[];
  issues: MineruAnnotationSourceIssue[];
  totalRows: number;
  references: {
    total: number;
    matched: number;
    missing: number;
    ambiguous: number;
  };
}

export interface MineruSourceMapOptions {
  /** Local-only derivative cache; never point this at a chapter sidecar. */
  cacheDirectory?: string;
  forceRebuild?: boolean;
}

export interface MineruSourceMapLoadResult {
  sourceMap: MineruProjectAnnotationSourceMap;
  cache: "hit" | "rebuilt";
  cachePath: string;
}

export function loadMineruProjectAnnotationSourceMap(
  projectRoot: string,
  options: MineruSourceMapOptions = {},
): MineruSourceMapLoadResult {
  const resolvedRoot = fs.realpathSync(path.resolve(projectRoot));
  if (!fs.statSync(resolvedRoot).isDirectory()) {
    throw new Error("MinerU project root must be a directory.");
  }
  const cachePath = mineruSourceMapCachePath(resolvedRoot, options.cacheDirectory);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const source = snapshotSourceFiles(resolvedRoot);
    if (!options.forceRebuild) {
      const cached = readCache(cachePath, source.fingerprint, resolvedRoot);
      if (cached) return { sourceMap: cached, cache: "hit", cachePath };
    }

    const sourceMap = createMineruProjectSourceMap(resolvedRoot, source);
    if (snapshotSourceFiles(resolvedRoot).fingerprint !== source.fingerprint) {
      // A concurrent OCR/chapter edit happened while mapping. Never cache stale offsets.
      continue;
    }
    persistCache(cachePath, sourceMap);
    return { sourceMap, cache: "rebuilt", cachePath };
  }
  throw new Error("MinerU sources changed while building the map; retry when edits finish.");
}

export function mineruSourceMapCachePath(
  projectRoot: string,
  cacheDirectory = path.join(os.homedir(), ".ocr2md-private", "mineru-source-maps"),
): string {
  const key = digest(path.resolve(projectRoot));
  return path.join(path.resolve(cacheDirectory), key + ".json");
}

export function getMineruChapterProjection(
  sourceMap: MineruProjectAnnotationSourceMap,
  chapterIdOrPath: string,
): MineruAnnotationChapterProjection | undefined {
  return sourceMap.chapters.find((chapter) =>
    chapter.chapterId === chapterIdOrPath ||
    chapter.chapterPath === chapterIdOrPath
  );
}

function createMineruProjectSourceMap(
  projectRoot: string,
  source: { fingerprint: string; files: MineruSourceFileFingerprint[] },
): MineruProjectAnnotationSourceMap {
  // WP4 hashes source bytes. Refresh WP1 signatures on rebuild even when a
  // same-size edit deliberately preserved the file mtime.
  invalidateMineruSourceSignatures(discoverMineruSourceFiles(projectRoot).jsonPaths);
  const discovery = discoverMineruSourcePairs(projectRoot);
  const issues: MineruAnnotationSourceIssue[] = [];
  const matched = discovery.matches.filter((entry) =>
    entry.status === "matched" && entry.jsonPath);

  const jsonUseCount = new Map<string, number>();
  for (const entry of matched) {
    const jsonPath = path.resolve(entry.jsonPath!);
    jsonUseCount.set(jsonPath, (jsonUseCount.get(jsonPath) ?? 0) + 1);
  }
  const documents: MineruAnnotationDocumentMap[] = [];
  const usedJson = new Set<string>();
  for (const entry of discovery.matches) {
    if (entry.status !== "matched" || !entry.jsonPath) {
      issues.push({
        type: "pairing",
        reason: entry.reason,
        sourceJsonPath: entry.jsonPath,
      });
      continue;
    }
    const jsonPath = path.resolve(entry.jsonPath);
    if ((jsonUseCount.get(jsonPath) ?? 0) !== 1) {
      issues.push({
        type: "pairing",
        sourceJsonPath: relative(projectRoot, jsonPath),
        reason: "同一份 JSON 被多个 Markdown 匹配，拒绝重复映射。",
      });
      continue;
    }

    // One matched document can own only one physical-page namespace.
    usedJson.add(jsonPath);
    const docKey = relative(projectRoot, jsonPath);
    try {
      const facts = loadMineruPageFootnotes({
        documentKey: docKey,
        sourceJsonPath: jsonPath,
        sourceMarkdownPath: entry.markdownPath,
      });
      const mapped = mapMineruJsonFootnoteFactsToChapters(projectRoot, facts);
      documents.push({
        jsonPath: docKey,
        markdownPath: relative(projectRoot, entry.markdownPath),
        ...mapped,
      });
      for (const unknown of facts.unidentifiedFootnotes) {
        issues.push({
          type: "unidentified-footnote",
          documentKey: docKey,
          sourceJsonPath: docKey,
          pageIndex: unknown.pageIndex,
          reason: unknown.reason + ": " + unknown.raw,
        });
      }
      for (const unverified of facts.unverifiedReferences) {
        issues.push({
          type: "unverified-reference",
          documentKey: docKey,
          sourceJsonPath: docKey,
          pageIndex: unverified.pageIndex,
          annotationNumber: unverified.annotationNumber,
          reason: "没有可靠页注释正文，保留未验证的引用证据。",
        });
      }
    } catch (error) {
      issues.push({
        type: "load-error",
        documentKey: docKey,
        sourceJsonPath: docKey,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  for (const jsonPath of discovery.files.jsonPaths) {
    if (!usedJson.has(path.resolve(jsonPath))) {
      issues.push({
        type: "unpaired-json",
        sourceJsonPath: relative(projectRoot, jsonPath),
        reason: "该 JSON 未形成可验证的一对一 Markdown 来源映射。",
      });
    }
  }

  const projection: MineruAnnotationProjection =
    projectMineruAnnotationRows(projectRoot, documents);
  const chapters = discoverCanonicalChapterMarkdown(projectRoot).map((chapterFile) => {
    const chapterPath = relative(projectRoot, chapterFile);
    return {
      chapterId: chapterDisplayName(projectRoot, chapterFile),
      chapterPath,
      rows: getChapterMineruAnnotationRows(projection, chapterPath),
    };
  });

  return {
    schemaVersion: SCHEMA_VERSION,
    generatorVersion: GENERATOR_VERSION,
    projectRoot,
    sourceFingerprint: source.fingerprint,
    sources: source.files,
    discovery,
    documents,
    chapters,
    unassignedRows: projection.unassigned,
    issues,
    totalRows: projection.totalRows,
    references: documents.reduce((sum, doc) => ({
      total: sum.total + doc.summary.total,
      matched: sum.matched + doc.summary.matched,
      missing: sum.missing + doc.summary.missing,
      ambiguous: sum.ambiguous + doc.summary.ambiguous,
    }), { total: 0, matched: 0, missing: 0, ambiguous: 0 }),
  };
}

function snapshotSourceFiles(root: string): {
  fingerprint: string;
  files: MineruSourceFileFingerprint[];
} {
  const found = discoverMineruSourceFiles(root);
  const chapterPaths = discoverCanonicalChapterMarkdown(root);
  const filePaths = [...new Set([
    ...found.markdownPaths,
    ...found.jsonPaths,
    ...chapterPaths,
  ])].sort();
  const files = filePaths.map((filePath) => {
    const content = fs.readFileSync(filePath);
    return {
      path: relative(root, filePath),
      sha256: crypto.createHash("sha256").update(content).digest("hex"),
      bytes: content.length,
    };
  });
  return { fingerprint: digest(JSON.stringify(files)), files };
}

function readCache(
  cachePath: string,
  fingerprint: string,
  projectRoot: string,
): MineruProjectAnnotationSourceMap | undefined {
  try {
    const candidate: unknown = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    if (!isRecord(candidate) ||
      candidate.schemaVersion !== SCHEMA_VERSION ||
      candidate.generatorVersion !== GENERATOR_VERSION ||
      candidate.projectRoot !== projectRoot ||
      candidate.sourceFingerprint !== fingerprint ||
      !Array.isArray(candidate.sources) ||
      !Array.isArray(candidate.documents) ||
      !Array.isArray(candidate.chapters) ||
      !Array.isArray(candidate.unassignedRows) ||
      !Array.isArray(candidate.issues) ||
      !isRecord(candidate.references) ||
      typeof candidate.totalRows !== "number") {
      return undefined;
    }
    return candidate as unknown as MineruProjectAnnotationSourceMap;
  } catch {
    return undefined;
  }
}

function persistCache(
  cachePath: string,
  sourceMap: MineruProjectAnnotationSourceMap,
): void {
  const cacheDirectory = path.dirname(cachePath);
  fs.mkdirSync(cacheDirectory, { recursive: true, mode: 0o700 });
  fs.chmodSync(cacheDirectory, 0o700);
  const temporaryPath = cachePath + "." + crypto.randomBytes(12).toString("hex") + ".tmp";
  try {
    fs.writeFileSync(temporaryPath, JSON.stringify(sourceMap), {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    fs.renameSync(temporaryPath, cachePath);
    fs.chmodSync(cachePath, 0o600);
  } finally {
    try { fs.unlinkSync(temporaryPath); } catch { /* already renamed */ }
  }
}

function relative(root: string, absolutePath: string): string {
  return path.relative(root, absolutePath);
}

function digest(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
