import * as path from "path";

export type ImageDownloadStatus = "pending" | "done" | "failed";

export function extractImageUrl(value: string): string | undefined {
  return /!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/i.exec(value)?.[1]
    ?? /src=["']?(https?:\/\/[^\s"'>]+)["']?/i.exec(value)?.[1]
    ?? /https?:\/\/[^\s"'<>)]+/i.exec(value)?.[0];
}

export function extractLocalImagePath(value: string): string | undefined {
  const match = /!\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+["'][^"']*["'])?\s*\)/i.exec(value);
  const raw = (match?.[1] ?? match?.[2])?.trim();
  if (!raw || /^(?:https?:|data:|#)/i.test(raw)) return undefined;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function safeImageName(url: string, line: number): string {
  let name = "";
  try { name = path.posix.basename(new URL(url).pathname); } catch { /* use fallback */ }
  return (name || `image-${line + 1}.jpg`).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_");
}

export function timestampedImageName(sourcePath: string, modifiedTime: number): string {
  const base = path.basename(sourcePath);
  const extension = path.extname(base);
  const stem = (base.slice(0, base.length - extension.length) || "image")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_");
  const safeExtension = extension.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_");
  return `${stem}-${formatLocalTimestamp(modifiedTime)}${safeExtension}`;
}

function formatLocalTimestamp(value: number): string {
  const date = new Date(value);
  const pad = (part: number, width = 2) => String(part).padStart(width, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
    + `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
    + `-${pad(date.getMilliseconds(), 3)}`;
}

export function shouldDownloadImage(
  row: { raw: string; localPath?: string; imageDownloadStatus?: ImageDownloadStatus },
  fileExists: boolean,
): boolean {
  if (!extractImageUrl(row.raw)) return false;
  if (row.imageDownloadStatus === "done" && row.localPath && fileExists) return false;
  if (row.localPath && fileExists && row.imageDownloadStatus !== "failed") return false;
  return true;
}
