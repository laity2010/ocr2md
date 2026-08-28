import * as assert from "assert";
import * as path from "path";
import { readText, writeText, type WorkspaceFileStat, type WorkspaceStorage } from "./workspaceStorage";

class MemoryWorkspaceStorage implements WorkspaceStorage {
  readonly files = new Map<string, Uint8Array>();
  readonly directories = new Set<string>();

  async readFile(filePath: string): Promise<Uint8Array> {
    const data = this.files.get(filePath);
    if (!data) throw new Error(`ENOENT: ${filePath}`);
    return data;
  }

  async writeFile(filePath: string, data: Uint8Array): Promise<void> {
    this.files.set(filePath, Uint8Array.from(data));
  }

  async exists(targetPath: string): Promise<boolean> {
    return this.files.has(targetPath) || this.directories.has(targetPath);
  }

  async readDirectory(directoryPath: string) {
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

  async createDirectory(directoryPath: string): Promise<void> {
    this.directories.add(directoryPath);
  }

  async copy(sourcePath: string, targetPath: string, options: { overwrite?: boolean } = {}): Promise<void> {
    const source = this.files.get(sourcePath);
    if (!source) throw new Error(`ENOENT: ${sourcePath}`);
    if (this.files.has(targetPath) && !options.overwrite) throw new Error(`EEXIST: ${targetPath}`);
    this.files.set(targetPath, Uint8Array.from(source));
  }

  async rename(sourcePath: string, targetPath: string, options: { overwrite?: boolean } = {}): Promise<void> {
    const source = this.files.get(sourcePath);
    if (!source) throw new Error(`ENOENT: ${sourcePath}`);
    if (this.files.has(targetPath) && !options.overwrite) throw new Error(`EEXIST: ${targetPath}`);
    this.files.set(targetPath, source);
    this.files.delete(sourcePath);
  }

  async delete(targetPath: string, options: { recursive?: boolean } = {}): Promise<void> {
    if (this.files.delete(targetPath)) return;
    if (this.directories.has(targetPath)) {
      const prefix = `${targetPath}${path.sep}`;
      const children = [...this.files.keys()].some((item) => item.startsWith(prefix));
      if (children && !options.recursive) throw new Error(`ENOTEMPTY: ${targetPath}`);
      for (const item of [...this.files.keys()]) if (item.startsWith(prefix)) this.files.delete(item);
      for (const item of [...this.directories]) if (item === targetPath || item.startsWith(prefix)) this.directories.delete(item);
      return;
    }
    throw new Error(`ENOENT: ${targetPath}`);
  }

  async stat(targetPath: string): Promise<WorkspaceFileStat> {
    const file = this.files.get(targetPath);
    if (file) return { type: "file", ctime: 1, mtime: 2, size: file.byteLength };
    if (this.directories.has(targetPath)) return { type: "directory", ctime: 1, mtime: 2, size: 0 };
    throw new Error(`ENOENT: ${targetPath}`);
  }
}

void (async () => {
  const storage = new MemoryWorkspaceStorage();
  const root = "/workspace/chapters/01";
  const source = path.join(root, "01.md");
  const target = path.join(root, "01.working.md");
  const moved = path.join(root, "01.saved.md");

  await storage.createDirectory(root);
  await writeText(storage, source, "# Chapter 1\n\nBody.\n");
  assert.strictEqual(await storage.exists(source), true);
  assert.strictEqual(await readText(storage, source), "# Chapter 1\n\nBody.\n");
  assert.deepStrictEqual(await storage.readDirectory(root), [{ name: "01.md", type: "file" }]);

  await storage.copy(source, target);
  assert.strictEqual(await readText(storage, target), "# Chapter 1\n\nBody.\n");
  const stat = await storage.stat(target);
  assert.strictEqual(stat.type, "file");
  assert.ok(stat.size > 0);

  await writeText(storage, target, "# Chapter 1\n\nEdited.\n");
  assert.strictEqual(await readText(storage, source), "# Chapter 1\n\nBody.\n", "copy must not alias source bytes");
  await storage.rename(target, moved);
  assert.strictEqual(await storage.exists(target), false);
  assert.strictEqual(await readText(storage, moved), "# Chapter 1\n\nEdited.\n");
  await storage.delete(moved);
  assert.strictEqual(await storage.exists(moved), false);

  console.log("workspaceStorage tests passed");
})();
