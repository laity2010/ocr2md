/// <reference lib="dom" />
/**
 * Browser-persistent WorkspaceFSV3 proof using one IndexedDB transaction per
 * mutation. Not the iPad Files.app or the iCloud Obsidian Vault mount.
 *
 * The snapshot layout is intentionally simple and suitable for the WP2
 * persistence gate (small files). WP6 must benchmark large PDFs separately.
 */
import { FixtureWorkspaceRegistry, type FixtureWorkspaceSnapshot } from "./v3FixtureWorkspaceFs";
import {
  WORKSPACE_FS_PROTOCOL_VERSION, WorkspaceV3Error, assertWorkspaceId,
  type WorkspaceCapabilities, type WorkspaceChangeEvent, type WorkspaceCommitRequest,
  type WorkspaceCommitResult, type WorkspaceFSV3, type WorkspaceLocation,
  type WorkspaceMountDescriptor, type WorkspaceMountRegistry, type WorkspaceNode,
  type WorkspaceNodeRef, type WorkspacePage, type WorkspaceReadRange,
  type WorkspaceReadResult,
} from "./workspaceFsV3";

const STORE_NAME = "vaults";
export const REVIEW_STORAGE_NAME = "ocr2md-v3-local-vault-review-v1";

export interface BrowserVaultSeed {
  readonly workspaceId: string;
  readonly label: string;
  readonly directories: readonly string[];
  readonly files?: readonly { path: string; text: string }[];
}
interface StoredVault { id: string; data: FixtureWorkspaceSnapshot }

function storageFailure(e: unknown): WorkspaceV3Error {
  if (e instanceof WorkspaceV3Error) return e;
  const candidate = e as { name?: string; message?: string } | undefined;
  const errorCode = candidate?.name === "QuotaExceededError" ? "EQUOTA" : "EOFFLINE";
  return new WorkspaceV3Error(errorCode, `Browser storage unavailable: ${candidate?.message || String(e)}`);
}
function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}
function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
    tx.onerror = () => { /* onabort carries the complete failure */ };
  });
}
function openDb(name: string): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new WorkspaceV3Error("EUNSUPPORTED", "IndexedDB is not available"));
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Cannot open IndexedDB"));
    req.onblocked = () => reject(new WorkspaceV3Error("EBUSY", "Database upgrade blocked by another tab"));
  });
}

async function fixtureFor(seed: BrowserVaultSeed, saved?: StoredVault): Promise<{
  registry: FixtureWorkspaceRegistry;
  fs: WorkspaceFSV3;
}> {
  const registry = new FixtureWorkspaceRegistry([{ workspaceId: seed.workspaceId, label: seed.label }]);
  if (saved) registry.importSnapshot(seed.workspaceId, saved.data);
  const fs = await registry.open(seed.workspaceId);
  return { registry, fs };
}

/** Root and sample dirs are inserted only when the database record first appears. */
async function initialState(seed: BrowserVaultSeed): Promise<StoredVault> {
  const { registry, fs } = await fixtureFor(seed);
  try {
    const encoder = new TextEncoder();
    const operations: WorkspaceCommitRequest["operations"] = [
      ...seed.directories.map(path => ({ type: "create-directory" as const,
        at: { workspaceId: seed.workspaceId, path }, ifAbsent: true as const })),
      ...(seed.files ?? []).map(file => ({ type: "create-file" as const,
        at: { workspaceId: seed.workspaceId, path: file.path },
        bytes: encoder.encode(file.text), ifAbsent: true as const })),
    ];
    if (operations.length) await fs.commit({ workspaceId: seed.workspaceId,
      requestId: "seed-vault-v1", operations });
    return { id: seed.workspaceId, data: registry.exportSnapshot(seed.workspaceId) };
  } finally {
    await fs.close();
  }
}

export class IndexedDbWorkspaceRegistry implements WorkspaceMountRegistry {
  private readonly seedById = new Map<string, BrowserVaultSeed>();
  private dbPromise?: Promise<IDBDatabase>;
  private readonly instances = new Set<IndexedDbWorkspaceFS>();
  constructor(seeds: readonly BrowserVaultSeed[], readonly dbName = REVIEW_STORAGE_NAME) {
    for (const seed of seeds) {
      const id = assertWorkspaceId(seed.workspaceId);
      if (this.seedById.has(id)) throw new WorkspaceV3Error("EEXIST", "Duplicate vault ID");
      this.seedById.set(id, seed);
    }
  }
  getDb(): Promise<IDBDatabase> {
    if (!this.dbPromise) this.dbPromise = openDb(this.dbName);
    return this.dbPromise;
  }
  listMounts(): Promise<readonly WorkspaceMountDescriptor[]> {
    return Promise.resolve([...this.seedById.values()].map(seed =>
      ({ workspaceId: seed.workspaceId, label: seed.label, backendId: "browser-indexeddb" })));
  }
  async open(id: string): Promise<WorkspaceFSV3> {
    const seed = this.seedById.get(assertWorkspaceId(id));
    if (!seed) throw new WorkspaceV3Error("ENOENT", "Vault mount does not exist");
    await this.ensureInitialized(seed);
    const instance = new IndexedDbWorkspaceFS(this, seed);
    this.instances.add(instance);
    return instance;
  }
  private async ensureInitialized(seed: BrowserVaultSeed): Promise<void> {
    const db = await this.getDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const done = transactionDone(tx);
    try {
      const store = tx.objectStore(STORE_NAME);
      const existing = await idbRequest(store.get(seed.workspaceId) as IDBRequest<StoredVault | undefined>);
      if (!existing) store.put(await initialState(seed));
      await done;
    } catch (e) {
      try { tx.abort(); } catch { /* transaction already finished */ }
      void done.catch(() => {});
      throw storageFailure(e);
    }
  }
  async read<T>(seed: BrowserVaultSeed, reader: (fs: WorkspaceFSV3) => Promise<T>): Promise<T> {
    const db = await this.getDb();
    const tx = db.transaction(STORE_NAME, "readonly");
    const done = transactionDone(tx);
    try {
      const stored = await idbRequest(tx.objectStore(STORE_NAME).get(seed.workspaceId) as IDBRequest<StoredVault | undefined>);
      if (!stored) throw new WorkspaceV3Error("ENOENT", "Workspace storage record missing");
      const { fs } = await fixtureFor(seed, stored);
      try {
        const result = await reader(fs);
        await done;
        return result;
      } finally {
        await fs.close();
      }
    } catch (e) {
      void done.catch(() => {});
      throw storageFailure(e);
    }
  }
  /** Single IndexedDB readwrite transaction serializes CAS across tabs. */
  async write(seed: BrowserVaultSeed, request: WorkspaceCommitRequest): Promise<WorkspaceCommitResult> {
    const db = await this.getDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const done = transactionDone(tx);
    try {
      const store = tx.objectStore(STORE_NAME);
      const stored = await idbRequest(store.get(seed.workspaceId) as IDBRequest<StoredVault | undefined>);
      if (!stored) throw new WorkspaceV3Error("ENOENT", "Workspace storage record missing");
      const { fs, registry } = await fixtureFor(seed, stored);
      try {
        const result = await fs.commit(request);
        store.put({ id: seed.workspaceId, data: registry.exportSnapshot(seed.workspaceId) } satisfies StoredVault);
        await done;
        return result;
      } finally {
        await fs.close();
      }
    } catch (e) {
      try { tx.abort(); } catch { /* transaction already finished */ }
      void done.catch(() => {});
      throw storageFailure(e);
    }
  }
  notify(source: IndexedDbWorkspaceFS, event: WorkspaceChangeEvent): void {
    for (const instance of this.instances) {
      if (instance.workspaceId === source.workspaceId) instance.deliver(event);
    }
  }
  unregister(instance: IndexedDbWorkspaceFS): void { this.instances.delete(instance); }
}

class IndexedDbWorkspaceFS implements WorkspaceFSV3 {
  readonly protocolVersion = WORKSPACE_FS_PROTOCOL_VERSION;
  readonly workspaceId: string;
  private listeners = new Set<(event: WorkspaceChangeEvent) => void>();
  private closed = false;
  constructor(private readonly registry: IndexedDbWorkspaceRegistry, private readonly seed: BrowserVaultSeed) {
    this.workspaceId = seed.workspaceId;
  }
  private ensureOpen(): void { if (this.closed) throw new WorkspaceV3Error("EBUSY", "Mount closed"); }
  async getCapabilities(): Promise<WorkspaceCapabilities> {
    this.ensureOpen();
    return { casWrites: true, atomicBatch: true, rangeRead: true,
      notifications: false, durableLocal: true, fileCoordination: false };
  }
  async list(path: WorkspaceLocation, cursor?: string): Promise<WorkspacePage> {
    this.ensureOpen(); return this.registry.read(this.seed, fs => fs.list(path, cursor));
  }
  async stat(path: WorkspaceLocation): Promise<WorkspaceNode> {
    this.ensureOpen(); return this.registry.read(this.seed, fs => fs.stat(path));
  }
  async readRange(ref: WorkspaceNodeRef, range: WorkspaceReadRange): Promise<WorkspaceReadResult> {
    this.ensureOpen(); return this.registry.read(this.seed, fs => fs.readRange(ref, range));
  }
  async commit(request: WorkspaceCommitRequest): Promise<WorkspaceCommitResult> {
    this.ensureOpen();
    const result = await this.registry.write(this.seed, request);
    this.registry.notify(this, { type: "entries-changed", workspaceId: this.workspaceId,
      changedNodeIds: [...result.updated.map(node => node.nodeId), ...result.removedIds], generation: "changed" });
    return result;
  }
  subscribe(listener: (event: WorkspaceChangeEvent) => void): () => void {
    this.ensureOpen(); this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  deliver(event: WorkspaceChangeEvent): void {
    if (this.closed) return;
    for (const listener of [...this.listeners]) { try { listener(event); } catch { /* consumer error */ } }
  }
  async close(): Promise<void> {
    this.closed = true; this.listeners.clear(); this.registry.unregister(this);
  }
}
