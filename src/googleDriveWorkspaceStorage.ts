import * as path from "path";
import type {
  WorkspaceDirectoryEntry,
  WorkspaceEntryType,
  WorkspaceFileStat,
  WorkspaceStorage,
} from "./workspaceStorage";

export const GOOGLE_DRIVE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
export const GOOGLE_DRIVE_BINARY_MIME_TYPE = "application/octet-stream";

export interface GoogleDriveItem {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  createdTime?: string;
  modifiedTime?: string;
  size?: string;
}

export interface GoogleDriveFileGateway {
  listChildren(parentId: string): Promise<GoogleDriveItem[]>;
  downloadFile(fileId: string): Promise<Uint8Array>;
  createFolder(name: string, parentId: string): Promise<GoogleDriveItem>;
  createFile(name: string, parentId: string, data: Uint8Array, mimeType: string): Promise<GoogleDriveItem>;
  updateFile(fileId: string, data: Uint8Array, mimeType: string): Promise<GoogleDriveItem>;
  copyFile(fileId: string, name: string, parentId: string): Promise<GoogleDriveItem>;
  moveItem(fileId: string, name: string, parentId: string, previousParentId: string): Promise<GoogleDriveItem>;
  trashItem(fileId: string): Promise<void>;
}

export type GoogleDriveWorkspaceErrorCode =
  | "EAMBIGUOUS"
  | "EEXIST"
  | "EISDIR"
  | "ENOENT"
  | "ENOTDIR"
  | "ENOTEMPTY"
  | "EXDEV";

export class GoogleDriveWorkspaceError extends Error {
  constructor(
    readonly code: GoogleDriveWorkspaceErrorCode,
    readonly targetPath: string,
    message = `${code}: ${targetPath}`,
  ) {
    super(message);
    this.name = "GoogleDriveWorkspaceError";
  }
}

/**
 * Platform-independent Google Drive implementation of WorkspaceStorage.
 *
 * OAuth and HTTP stay outside this class. Browser hosts inject a gateway backed
 * by the Drive API, while tests inject an in-memory gateway.
 */
export class GoogleDriveWorkspaceStorage implements WorkspaceStorage {
  readonly rootPath: string;

  constructor(
    private readonly gateway: GoogleDriveFileGateway,
    private readonly rootFolderId: string,
    rootPath = "/",
  ) {
    if (!rootFolderId.trim()) throw new Error("Google Drive root folder ID is required");
    this.rootPath = normalizeRootPath(rootPath);
  }

  async readFile(filePath: string): Promise<Uint8Array> {
    const item = await this.resolveItem(filePath);
    if (isFolder(item)) throw new GoogleDriveWorkspaceError("EISDIR", filePath);
    return this.gateway.downloadFile(item.id);
  }

  async writeFile(filePath: string, data: Uint8Array): Promise<void> {
    const { parent, name, normalizedPath } = await this.resolveParent(filePath);
    const existing = await this.findChild(parent.id, name, normalizedPath);
    const mimeType = markdownMimeType(name);
    if (existing) {
      if (isFolder(existing)) throw new GoogleDriveWorkspaceError("EISDIR", normalizedPath);
      await this.gateway.updateFile(existing.id, Uint8Array.from(data), mimeType);
      return;
    }
    await this.gateway.createFile(name, parent.id, Uint8Array.from(data), mimeType);
  }

  async exists(targetPath: string): Promise<boolean> {
    try {
      await this.resolveItem(targetPath);
      return true;
    } catch (error) {
      if (error instanceof GoogleDriveWorkspaceError && error.code === "ENOENT") return false;
      throw error;
    }
  }

  async readDirectory(directoryPath: string): Promise<WorkspaceDirectoryEntry[]> {
    const directory = await this.resolveItem(directoryPath);
    if (!isFolder(directory)) throw new GoogleDriveWorkspaceError("ENOTDIR", directoryPath);
    const children = await this.gateway.listChildren(directory.id);
    return children
      .map((item) => ({ name: item.name, type: itemType(item) }))
      .sort((left, right) => left.name.localeCompare(right.name, "zh-CN", { numeric: true }));
  }

  async createDirectory(directoryPath: string): Promise<void> {
    const normalizedPath = this.normalizeTarget(directoryPath);
    const parts = this.relativeParts(normalizedPath);
    let parent = this.rootItem();
    let currentPath = this.rootPath;

    for (const part of parts) {
      currentPath = path.posix.join(currentPath, part);
      const existing = await this.findChild(parent.id, part, currentPath);
      if (existing) {
        if (!isFolder(existing)) throw new GoogleDriveWorkspaceError("ENOTDIR", currentPath);
        parent = existing;
        continue;
      }
      parent = await this.gateway.createFolder(part, parent.id);
    }
  }

  async copy(sourcePath: string, targetPath: string, options: { overwrite?: boolean } = {}): Promise<void> {
    const source = await this.resolveItem(sourcePath);
    if (isFolder(source)) throw new GoogleDriveWorkspaceError("EISDIR", sourcePath, `Directory copy is not supported: ${sourcePath}`);
    const { parent, name, normalizedPath } = await this.resolveParent(targetPath);
    const existing = await this.findChild(parent.id, name, normalizedPath);
    if (existing) {
      if (!options.overwrite) throw new GoogleDriveWorkspaceError("EEXIST", normalizedPath);
      await this.gateway.trashItem(existing.id);
    }
    await this.gateway.copyFile(source.id, name, parent.id);
  }

  async rename(sourcePath: string, targetPath: string, options: { overwrite?: boolean } = {}): Promise<void> {
    const sourceNormalized = this.normalizeTarget(sourcePath);
    const source = await this.resolveItem(sourceNormalized);
    if (source.id === this.rootFolderId) throw new GoogleDriveWorkspaceError("EXDEV", sourcePath, "Cannot rename the Drive workspace root");

    const sourceParentPath = path.posix.dirname(sourceNormalized);
    const sourceParent = await this.resolveItem(sourceParentPath);
    const { parent: targetParent, name, normalizedPath } = await this.resolveParent(targetPath);
    const existing = await this.findChild(targetParent.id, name, normalizedPath);
    if (existing && existing.id !== source.id) {
      if (!options.overwrite) throw new GoogleDriveWorkspaceError("EEXIST", normalizedPath);
      await this.gateway.trashItem(existing.id);
    }
    if (existing?.id === source.id && source.name === name && sourceParent.id === targetParent.id) return;
    await this.gateway.moveItem(source.id, name, targetParent.id, sourceParent.id);
  }

  async delete(targetPath: string, options: { recursive?: boolean } = {}): Promise<void> {
    const item = await this.resolveItem(targetPath);
    if (item.id === this.rootFolderId) throw new GoogleDriveWorkspaceError("EXDEV", targetPath, "Cannot delete the Drive workspace root");
    if (isFolder(item) && !options.recursive) {
      const children = await this.gateway.listChildren(item.id);
      if (children.length > 0) throw new GoogleDriveWorkspaceError("ENOTEMPTY", targetPath);
    }
    await this.gateway.trashItem(item.id);
  }

  async stat(targetPath: string): Promise<WorkspaceFileStat> {
    const item = await this.resolveItem(targetPath);
    return {
      type: itemType(item),
      ctime: parseDriveTime(item.createdTime),
      mtime: parseDriveTime(item.modifiedTime),
      size: Number(item.size ?? 0),
    };
  }

  private rootItem(): GoogleDriveItem {
    return {
      id: this.rootFolderId,
      name: path.posix.basename(this.rootPath) || "/",
      mimeType: GOOGLE_DRIVE_FOLDER_MIME_TYPE,
    };
  }

  private normalizeTarget(targetPath: string): string {
    const absolute = path.posix.isAbsolute(targetPath)
      ? path.posix.normalize(targetPath)
      : path.posix.resolve(this.rootPath, targetPath);
    const relative = path.posix.relative(this.rootPath, absolute);
    if (relative === ".." || relative.startsWith("../") || path.posix.isAbsolute(relative)) {
      throw new GoogleDriveWorkspaceError("EXDEV", targetPath, `Path is outside the Google Drive workspace: ${targetPath}`);
    }
    return absolute;
  }

  private relativeParts(normalizedPath: string): string[] {
    const relative = path.posix.relative(this.rootPath, normalizedPath);
    return relative && relative !== "." ? relative.split("/").filter(Boolean) : [];
  }

  private async resolveItem(targetPath: string): Promise<GoogleDriveItem> {
    const normalizedPath = this.normalizeTarget(targetPath);
    const parts = this.relativeParts(normalizedPath);
    let current = this.rootItem();
    let currentPath = this.rootPath;

    for (const part of parts) {
      if (!isFolder(current)) throw new GoogleDriveWorkspaceError("ENOTDIR", currentPath);
      currentPath = path.posix.join(currentPath, part);
      const child = await this.findChild(current.id, part, currentPath);
      if (!child) throw new GoogleDriveWorkspaceError("ENOENT", currentPath);
      current = child;
    }
    return current;
  }

  private async resolveParent(targetPath: string): Promise<{
    parent: GoogleDriveItem;
    name: string;
    normalizedPath: string;
  }> {
    const normalizedPath = this.normalizeTarget(targetPath);
    if (normalizedPath === this.rootPath) throw new GoogleDriveWorkspaceError("EISDIR", normalizedPath);
    const name = path.posix.basename(normalizedPath);
    const parentPath = path.posix.dirname(normalizedPath);
    const parent = await this.resolveItem(parentPath);
    if (!isFolder(parent)) throw new GoogleDriveWorkspaceError("ENOTDIR", parentPath);
    return { parent, name, normalizedPath };
  }

  private async findChild(parentId: string, name: string, targetPath: string): Promise<GoogleDriveItem | undefined> {
    const matches = (await this.gateway.listChildren(parentId)).filter((item) => item.name === name);
    if (matches.length > 1) {
      throw new GoogleDriveWorkspaceError("EAMBIGUOUS", targetPath, `Multiple Google Drive items have the same path: ${targetPath}`);
    }
    return matches[0];
  }
}

function normalizeRootPath(rootPath: string): string {
  const normalized = path.posix.resolve("/", rootPath);
  return normalized === "/" ? "/" : normalized.replace(/\/$/, "");
}

function isFolder(item: GoogleDriveItem): boolean {
  return item.mimeType === GOOGLE_DRIVE_FOLDER_MIME_TYPE;
}

function itemType(item: GoogleDriveItem): WorkspaceEntryType {
  return isFolder(item) ? "directory" : "file";
}

function markdownMimeType(name: string): string {
  return /\.md$/i.test(name) ? "text/markdown" : GOOGLE_DRIVE_BINARY_MIME_TYPE;
}

function parseDriveTime(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
