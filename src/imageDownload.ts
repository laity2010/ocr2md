import * as path from "path";

export type ImageDownloadStatus = "pending" | "done" | "failed";

export function extractImageUrl(value: string): string | undefined {
  return /!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/i.exec(value)?.[1]
    ?? /src=["']?(https?:\/\/[^\s"'>]+)["']?/i.exec(value)?.[1]
    ?? /https?:\/\/[^\s"'<>)]+/i.exec(value)?.[0];
}

export function safeImageName(url: string, line: number): string {
  let name = "";
  try { name = path.posix.basename(new URL(url).pathname); } catch { /* use fallback */ }
  return (name || `image-${line + 1}.jpg`).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_");
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
