export type WorkspaceEntryType = "file" | "directory" | "unknown";

export interface WorkspaceFileStat {
  type: WorkspaceEntryType;
  ctime: number;
  mtime: number;
  size: number;
}

export interface WorkspaceDirectoryEntry {
  name: string;
  type: WorkspaceEntryType;
}

export interface WorkspaceStorage {
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  exists(path: string): Promise<boolean>;
  readDirectory(path: string): Promise<WorkspaceDirectoryEntry[]>;
  createDirectory(path: string): Promise<void>;
  copy(sourcePath: string, targetPath: string, options?: { overwrite?: boolean }): Promise<void>;
  rename(sourcePath: string, targetPath: string, options?: { overwrite?: boolean }): Promise<void>;
  delete(path: string, options?: { recursive?: boolean }): Promise<void>;
  stat(path: string): Promise<WorkspaceFileStat>;
}

export async function readText(storage: WorkspaceStorage, path: string): Promise<string> {
  return new TextDecoder("utf-8").decode(await storage.readFile(path));
}

export async function writeText(storage: WorkspaceStorage, path: string, text: string): Promise<void> {
  await storage.writeFile(path, new TextEncoder().encode(text));
}

export async function deleteIfExists(storage: WorkspaceStorage, path: string, options: { recursive?: boolean } = {}): Promise<void> {
  try {
    await storage.delete(path, options);
  } catch {
    // Callers use this for cleanup/rollback where absence is expected.
  }
}
