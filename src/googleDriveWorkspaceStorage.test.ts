import * as assert from "assert";
import {
  GOOGLE_DRIVE_FOLDER_MIME_TYPE,
  GoogleDriveWorkspaceError,
  GoogleDriveWorkspaceStorage,
  type GoogleDriveFileGateway,
  type GoogleDriveItem,
} from "./googleDriveWorkspaceStorage";
import { readText, writeText } from "./workspaceStorage";

class MemoryGoogleDriveGateway implements GoogleDriveFileGateway {
  readonly items = new Map<string, GoogleDriveItem>();
  readonly data = new Map<string, Uint8Array>();
  readonly trashed = new Set<string>();
  readonly createdFileIds: string[] = [];
  readonly updatedFileIds: string[] = [];
  private nextId = 1;
  private revisionSequence = 1;

  constructor(readonly rootId = "drive-root") {
    this.items.set(rootId, {
      id: rootId,
      name: "ocr2md",
      mimeType: GOOGLE_DRIVE_FOLDER_MIME_TYPE,
      createdTime: "2026-08-29T00:00:00.000Z",
      modifiedTime: "2026-08-29T00:00:00.000Z",
      size: "0",
    });
  }

  async listChildren(parentId: string): Promise<GoogleDriveItem[]> {
    return [...this.items.values()]
      .filter((item) => !this.trashed.has(item.id) && item.parents?.includes(parentId))
      .map(cloneItem);
  }

  async downloadFile(fileId: string): Promise<Uint8Array> {
    const value = this.data.get(fileId);
    if (!value || this.trashed.has(fileId)) throw new Error(`Drive file not found: ${fileId}`);
    return Uint8Array.from(value);
  }

  async createFolder(name: string, parentId: string): Promise<GoogleDriveItem> {
    return this.createItem(name, parentId, GOOGLE_DRIVE_FOLDER_MIME_TYPE);
  }

  async createFile(name: string, parentId: string, data: Uint8Array, mimeType: string): Promise<GoogleDriveItem> {
    const item = this.createItem(name, parentId, mimeType, data);
    this.createdFileIds.push(item.id);
    return item;
  }

  async updateFile(fileId: string, data: Uint8Array, mimeType: string): Promise<GoogleDriveItem> {
    const item = this.requireItem(fileId);
    item.mimeType = mimeType;
    item.modifiedTime = "2026-08-29T01:00:00.000Z";
    item.size = String(data.byteLength);
    item.headRevisionId = `rev-${this.revisionSequence++}`;
    item.md5Checksum = `fake-${item.headRevisionId}-${data.byteLength}`;
    this.data.set(fileId, Uint8Array.from(data));
    this.updatedFileIds.push(fileId);
    return cloneItem(item);
  }

  async copyFile(fileId: string, name: string, parentId: string): Promise<GoogleDriveItem> {
    const source = this.requireItem(fileId);
    const data = this.data.get(fileId);
    if (!data) throw new Error(`Drive file has no data: ${fileId}`);
    return this.createItem(name, parentId, source.mimeType, data);
  }

  async moveItem(fileId: string, name: string, parentId: string, previousParentId: string): Promise<GoogleDriveItem> {
    const item = this.requireItem(fileId);
    item.name = name;
    item.parents = [...(item.parents ?? []).filter((id) => id !== previousParentId), parentId];
    item.modifiedTime = "2026-08-29T02:00:00.000Z";
    return cloneItem(item);
  }

  async trashItem(fileId: string): Promise<void> {
    this.requireItem(fileId);
    this.trashed.add(fileId);
  }

  findActiveFileId(name: string): string | undefined {
    return [...this.items.values()].find((item) => item.name === name && !this.trashed.has(item.id))?.id;
  }

  externalUpdate(fileId: string, text: string, modifiedTime: string): void {
    const item = this.requireItem(fileId);
    const data = new TextEncoder().encode(text);
    item.modifiedTime = modifiedTime;
    item.size = String(data.byteLength);
    item.headRevisionId = `external-${modifiedTime}`;
    item.md5Checksum = `external-${data.byteLength}-${modifiedTime}`;
    this.data.set(fileId, data);
  }

  private createItem(name: string, parentId: string, mimeType: string, data?: Uint8Array): GoogleDriveItem {
    this.requireItem(parentId);
    const id = `drive-${this.nextId++}`;
    const item: GoogleDriveItem = {
      id,
      name,
      mimeType,
      parents: [parentId],
      createdTime: "2026-08-29T00:00:00.000Z",
      modifiedTime: "2026-08-29T00:00:00.000Z",
      size: String(data?.byteLength ?? 0),
    };
    if (data) {
      item.headRevisionId = `rev-${this.revisionSequence++}`;
      item.md5Checksum = `fake-${item.headRevisionId}-${data.byteLength}`;
    }
    this.items.set(id, item);
    if (data) this.data.set(id, Uint8Array.from(data));
    return cloneItem(item);
  }

  private requireItem(fileId: string): GoogleDriveItem {
    const item = this.items.get(fileId);
    if (!item || this.trashed.has(fileId)) throw new Error(`Drive item not found: ${fileId}`);
    return item;
  }
}

function cloneItem(item: GoogleDriveItem): GoogleDriveItem {
  return { ...item, parents: item.parents ? [...item.parents] : undefined };
}

async function rejectsWithCode(run: () => Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(run, (error: unknown) => error instanceof GoogleDriveWorkspaceError && error.code === code);
}

void (async () => {
  const gateway = new MemoryGoogleDriveGateway();
  const storage = new GoogleDriveWorkspaceStorage(gateway, gateway.rootId, "/vault");

  await storage.createDirectory("/vault/chapters/01");
  await writeText(storage, "/vault/chapters/01/source.md", "# 第一章\n");
  assert.strictEqual(gateway.createdFileIds.length, 1, "first write must create one Drive file");

  const originalId = gateway.findActiveFileId("source.md");
  assert.ok(originalId, "created Drive file must keep a stable ID");
  assert.strictEqual(await readText(storage, "/vault/chapters/01/source.md"), "# 第一章\n");

  await writeText(storage, "/vault/chapters/01/source.md", "# 第一章\n\n已修改。\n");
  assert.deepStrictEqual(gateway.updatedFileIds, [originalId], "second write must update the existing Drive file ID");
  assert.strictEqual(gateway.findActiveFileId("source.md"), originalId);
  assert.strictEqual(await readText(storage, "/vault/chapters/01/source.md"), "# 第一章\n\n已修改。\n");

  // A browser page that read an older Drive revision must never silently overwrite
  // a newer edit made by Obsidian/Drive/Desktop or another browser session.
  gateway.externalUpdate(originalId, "# 第一章\n\n远端新版本。\n", "2026-08-29T03:00:00.000Z");
  await rejectsWithCode(
    () => writeText(storage, "/vault/chapters/01/source.md", "# 第一章\n\n旧页面保存。\n"),
    "ESTALE",
  );
  assert.strictEqual(
    new TextDecoder().decode(gateway.data.get(originalId)!),
    "# 第一章\n\n远端新版本。\n",
    "stale browser save must not modify the newer Drive content",
  );

  // Re-reading establishes a fresh baseline, after which an explicit save is safe.
  assert.strictEqual(await readText(storage, "/vault/chapters/01/source.md"), "# 第一章\n\n远端新版本。\n");
  await writeText(storage, "/vault/chapters/01/source.md", "# 第一章\n\n重新读取后保存。\n");
  assert.strictEqual(await readText(storage, "/vault/chapters/01/source.md"), "# 第一章\n\n重新读取后保存。\n");

  assert.deepStrictEqual(await storage.readDirectory("/vault/chapters/01"), [
    { name: "source.md", type: "file" },
  ]);
  const stat = await storage.stat("/vault/chapters/01/source.md");
  assert.strictEqual(stat.type, "file");
  assert.strictEqual(stat.size, Buffer.byteLength("# 第一章\n\n重新读取后保存。\n"));
  assert.strictEqual(stat.mtime, Date.parse("2026-08-29T01:00:00.000Z"));

  await storage.copy("/vault/chapters/01/source.md", "/vault/chapters/01/copied.md");
  assert.strictEqual(await readText(storage, "/vault/chapters/01/copied.md"), "# 第一章\n\n重新读取后保存。\n");

  await storage.rename("/vault/chapters/01/copied.md", "/vault/chapters/01/moved.md");
  assert.strictEqual(await storage.exists("/vault/chapters/01/copied.md"), false);
  assert.strictEqual(await storage.exists("/vault/chapters/01/moved.md"), true);

  await storage.delete("/vault/chapters/01/moved.md");
  assert.strictEqual(await storage.exists("/vault/chapters/01/moved.md"), false);

  await rejectsWithCode(() => storage.readFile("/outside.md"), "EXDEV");
  await rejectsWithCode(() => storage.delete("/vault/chapters"), "ENOTEMPTY");

  console.log("googleDriveWorkspaceStorage tests passed");
})();
