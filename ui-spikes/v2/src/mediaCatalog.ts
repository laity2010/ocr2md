import type { ChapterWorkspaceData } from "./chapterRepository";

export type MediaGroup = "已采用" | "未采用" | "未下载";

export interface MediaCatalogItem {
  id: string;
  group: MediaGroup;
  displayName: string;
  localPath?: string;
  sourceUrl?: string;
  sizeBytes?: number;
  mimeType?: string;
}

const GROUP_ORDER: Record<MediaGroup, number> = {
  已采用: 0,
  未采用: 1,
  未下载: 2,
};

function normalizeLocalImagePath(value: string): string | undefined {
  let normalized = value.trim().replace(/^<|>$/g, "").replace(/\\/g, "/");
  try {
    normalized = decodeURIComponent(normalized);
  } catch {
    // Keep the original path when percent-decoding is not valid.
  }
  normalized = normalized.replace(/^\.\//, "");
  if (!/^imgs\/[^/]+\.(?:png|jpe?g|webp|gif)$/i.test(normalized)) {
    return undefined;
  }
  return normalized;
}

function isExternalImageUrl(value: string): boolean {
  // The caller only supplies Markdown image destinations or <img src> values,
  // so an HTTP(S) target is an external media reference even when a CDN URL
  // has no file extension.
  return /^https?:\/\//i.test(value);
}

function collectMarkdownImageTargets(text: string): string[] {
  const targets: string[] = [];
  const pattern = /!\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+["'][^"']*["'])?\s*\)/gi;
  for (const match of text.matchAll(pattern)) {
    const target = (match[1] ?? match[2] ?? "").trim();
    if (target) targets.push(target);
  }
  return targets;
}

function collectHtmlImageTargets(text: string): string[] {
  const targets: string[] = [];
  const pattern = /<img\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi;
  for (const match of text.matchAll(pattern)) {
    const target = (match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (target) targets.push(target);
  }
  return targets;
}

function collectWikiImageTargets(text: string): string[] {
  const targets: string[] = [];
  const pattern = /!\[\[([^\]|\r\n]+\.(?:png|jpe?g|webp|gif))(?:\|[^\]\r\n]+)?\]\]/gi;
  for (const match of text.matchAll(pattern)) {
    const target = (match[1] ?? "").trim();
    if (target) targets.push(target);
  }
  return targets;
}

function externalDisplayName(url: string, index: number): string {
  try {
    const parsed = new URL(url);
    const base = parsed.pathname.split("/").filter(Boolean).at(-1);
    if (base) {
      try {
        return decodeURIComponent(base);
      } catch {
        return base;
      }
    }
  } catch {
    // Fall through to a stable readable fallback.
  }
  return `外部媒体 ${index + 1}`;
}

export function deriveMediaCatalog(
  chapter: ChapterWorkspaceData | undefined,
): MediaCatalogItem[] {
  if (!chapter || chapter.kind !== "chapter") return [];

  const localReferences = new Set<string>();
  const externalReferences = new Set<string>();
  const availableLocalPaths = new Set(
    (chapter.media ?? []).map((item) => item.relativePath),
  );
  const targets = [
    ...collectWikiImageTargets(chapter.workingText),
    ...collectMarkdownImageTargets(chapter.workingText),
    ...collectHtmlImageTargets(chapter.workingText),
  ];

  for (const target of targets) {
    const local = normalizeLocalImagePath(target);
    if (local) {
      localReferences.add(local);
    } else if (isExternalImageUrl(target)) {
      externalReferences.add(target);
    }
  }

  // Older download flows recorded the adopted imgs path in calibration before
  // rewriting the Markdown source. Treat those rows as adopted local media too,
  // and suppress their original external URL from the "未下载" group.
  const adoptedExternalReferences = new Set<string>();
  for (const row of chapter.rows) {
    const local = row.localPath ? normalizeLocalImagePath(row.localPath) : undefined;
    if (!local || !availableLocalPaths.has(local)) continue;
    localReferences.add(local);
    for (const target of [
      ...collectMarkdownImageTargets(row.raw),
      ...collectHtmlImageTargets(row.raw),
    ]) {
      if (isExternalImageUrl(target)) adoptedExternalReferences.add(target);
    }
  }

  const localRows: MediaCatalogItem[] = (chapter.media ?? []).map((item) => ({
    id: `local:${item.relativePath}`,
    group: localReferences.has(item.relativePath) ? "已采用" : "未采用",
    displayName: item.fileName,
    localPath: item.relativePath,
    sizeBytes: item.sizeBytes,
    mimeType: item.mimeType,
  }));

  const externalRows: MediaCatalogItem[] = [...externalReferences]
    .filter((sourceUrl) => !adoptedExternalReferences.has(sourceUrl))
    .map(
    (sourceUrl, index) => ({
      id: `external:${sourceUrl}`,
      group: "未下载",
      displayName: externalDisplayName(sourceUrl, index),
      sourceUrl,
    }),
  );

  return [...localRows, ...externalRows].sort((left, right) => {
    const groupDelta = GROUP_ORDER[left.group] - GROUP_ORDER[right.group];
    if (groupDelta !== 0) return groupDelta;
    return left.displayName.localeCompare(
      right.displayName,
      "zh-Hans-CN",
      { numeric: true, sensitivity: "base" },
    );
  });
}
