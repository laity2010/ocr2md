/** Headless directory controller: depends only on WorkspaceFSV3, never GD/PDF/ChapterRepository. */
import {
  WorkspaceV3Error, joinLogicalPath, location, normalizeLogicalPath,
  planWorkspaceSwitch, type WorkspaceFSV3, type WorkspaceMountRegistry,
  type WorkspaceNode, type WorkspaceNodeRef, type WorkspaceSwitchActivity,
  type WorkspaceSwitchDecision,
} from "./workspaceFsV3";

export interface DirectoryViewState {
  workspaceId: string;
  directory: string;
  entries: readonly WorkspaceNode[];
  generation: string;
  nextCursor?: string;
  stale: boolean;
  busy: boolean;
  error?: string;
}
export type DirectoryChangeListener = (state: DirectoryViewState) => void;

export class V3DirectoryController {
  private fs?: WorkspaceFSV3;
  private unsubscribe?: () => void;
  private readonly listeners = new Set<DirectoryChangeListener>();
  private state: DirectoryViewState;
  private sequence = 0;
  private closed = false;

  constructor(
    private readonly registry: WorkspaceMountRegistry,
    initialWorkspaceId: string,
    private readonly newRequestId: () => string,
    private readonly activity: () => WorkspaceSwitchActivity = () =>
      ({ dirty: false, saving: false, inFlightOperation: false }),
    initialDirectory = "/",
  ) {
    this.state = { workspaceId: initialWorkspaceId, directory: normalizeLogicalPath(initialDirectory), entries: [],
      generation: "", stale: true, busy: false };
  }
  snapshot(): DirectoryViewState { return { ...this.state, entries: [...this.state.entries] }; }
  subscribe(listener: DirectoryChangeListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }
  private update(next: Partial<DirectoryViewState>): void {
    this.state = { ...this.state, ...next };
    for (const listener of this.listeners) listener(this.snapshot());
  }
  private requireFs(): WorkspaceFSV3 {
    if (this.closed) throw new WorkspaceV3Error("EBUSY", "Directory controller closed");
    if (!this.fs) throw new WorkspaceV3Error("EBUSY", "Workspace not opened");
    return this.fs;
  }
  private listen(fs: WorkspaceFSV3): () => void {
    return fs.subscribe(event => {
      if (event.type !== "entries-changed" || fs !== this.fs) return;
      this.update({ stale: true });
    });
  }
  /** Optional initial location is a UI preference, not a storage mount change. */
  async initialize(initialDirectory = this.state.directory): Promise<void> {
    if (this.fs || this.closed) throw new WorkspaceV3Error("EBUSY", "Already initialized or closed");
    const fs = await this.registry.open(this.state.workspaceId);
    try {
      const root = await fs.stat(location(fs.workspaceId, "/"));
      if (root.kind !== "directory") throw new WorkspaceV3Error("ENOTDIR", "Workspace root not directory");
      this.fs = fs;
      this.unsubscribe = this.listen(fs);
      await this.browse(normalizeLogicalPath(initialDirectory));
    } catch (err) {
      this.unsubscribe?.(); this.unsubscribe = undefined; this.fs = undefined;
      await fs.close();
      throw err;
    }
  }
  private async readPage(fs: WorkspaceFSV3, path: string, cursor?: string) {
    const result = await fs.list(location(fs.workspaceId, path), cursor);
    return result;
  }
  async browse(path: string): Promise<DirectoryViewState> {
    const fs = this.requireFs();
    if (this.state.busy) throw new WorkspaceV3Error("EBUSY", "Mutation in progress");
    const canonical = normalizeLogicalPath(path);
    const epoch = ++this.sequence;
    try {
      const page = await this.readPage(fs, canonical);
      if (epoch !== this.sequence || fs !== this.fs) return this.snapshot();
      this.update({ directory: canonical, entries: page.entries, generation: page.generation,
        nextCursor: page.nextCursor, stale: false, error: undefined });
    } catch (e) {
      if (epoch === this.sequence) this.update({ error: String(e) });
      throw e;
    }
    return this.snapshot();
  }
  async refresh(): Promise<DirectoryViewState> { return this.browse(this.state.directory); }
  async loadMore(): Promise<DirectoryViewState> {
    const fs = this.requireFs();
    if (this.state.busy) throw new WorkspaceV3Error("EBUSY", "Mutation in progress");
    const cursor = this.state.nextCursor;
    if (!cursor) return this.snapshot();
    const epoch = ++this.sequence;
    try {
      const page = await this.readPage(fs, this.state.directory, cursor);
      if (epoch !== this.sequence || fs !== this.fs) return this.snapshot();
      if (page.generation !== this.state.generation) throw new WorkspaceV3Error("ESTALE", "Pagination generation changed");
      this.update({ entries: [...this.state.entries, ...page.entries], nextCursor: page.nextCursor,
        stale: false, error: undefined });
    } catch (e) {
      if (epoch === this.sequence) this.update({ stale: true, error: String(e) });
      throw e;
    }
    return this.snapshot();
  }
  private nextId(): string {
    const result = this.newRequestId();
    if (!result || !result.trim()) throw new WorkspaceV3Error("EINVAL", "Missing idempotency key");
    return result;
  }
  private async mutate(operations: Parameters<WorkspaceFSV3["commit"]>[0]["operations"]): Promise<void> {
    const fs = this.requireFs();
    if (this.state.busy) throw new WorkspaceV3Error("EBUSY", "Already changing directory");
    const activity = this.activity();
    if (activity.saving || activity.inFlightOperation) throw new WorkspaceV3Error("EBUSY", "Workspace has ongoing work");
    const requestId = this.nextId();
    // A pending browse must never overwrite the result of a newer commit.
    this.sequence++;
    this.update({ busy: true, error: undefined });
    try {
      await fs.commit({ workspaceId: fs.workspaceId, requestId, operations });
      // Updated inventory only; the original state machine or document is untouched.
      const page = await this.readPage(fs, this.state.directory);
      this.update({ entries: page.entries, generation: page.generation,
        nextCursor: page.nextCursor, stale: false });
    } catch (e) {
      this.update({ stale: true, error: String(e) });
      throw e;
    } finally {
      this.update({ busy: false });
    }
  }
  async createDirectory(name: string): Promise<void> {
    const fs = this.requireFs();
    await this.mutate([{ type: "create-directory", at: location(fs.workspaceId,
      joinLogicalPath(this.state.directory, name)), ifAbsent: true }]);
  }
  async createFile(name: string, content = new Uint8Array()): Promise<void> {
    const fs = this.requireFs();
    await this.mutate([{ type: "create-file", at: location(fs.workspaceId,
      joinLogicalPath(this.state.directory, name)), bytes: content, ifAbsent: true }]);
  }
  private ref(node: WorkspaceNode): WorkspaceNodeRef {
    const fs = this.requireFs();
    if (node.workspaceId !== fs.workspaceId) throw new WorkspaceV3Error("EINVAL", "Wrong workspace node");
    return { workspaceId: node.workspaceId, path: normalizeLogicalPath(node.path), nodeId: node.nodeId };
  }
  async rename(node: WorkspaceNode, newName: string): Promise<void> {
    const fs = this.requireFs();
    const parent = node.path === "/" ? "/" : node.path.slice(0, node.path.lastIndexOf("/")) || "/";
    await this.mutate([{ type: "move", target: this.ref(node), expectedRevision: node.revision,
      to: location(fs.workspaceId, joinLogicalPath(parent, newName)), ifAbsent: true }]);
  }
  async move(node: WorkspaceNode, destinationDirectory: string): Promise<void> {
    const fs = this.requireFs();
    const leaf = node.path.slice(node.path.lastIndexOf("/") + 1);
    await this.mutate([{ type: "move", target: this.ref(node), expectedRevision: node.revision,
      to: location(fs.workspaceId, joinLogicalPath(destinationDirectory, leaf)), ifAbsent: true }]);
  }
  /** Read the actual file content from its current storage adapter. */
  async readFile(node: WorkspaceNode): Promise<Uint8Array> {
    const fs = this.requireFs();
    if (node.kind !== "file") throw new WorkspaceV3Error("EISDIR", "Cannot read directory as file");
    const latest = await fs.stat({ workspaceId: fs.workspaceId, path: node.path });
    if (latest.nodeId !== node.nodeId || latest.revision !== node.revision) {
      throw new WorkspaceV3Error("ESTALE", "File changed; refresh the directory first");
    }
    if (!latest.size) return new Uint8Array();
    const result = await fs.readRange(this.ref(node), { offset: 0, length: latest.size,
      expectedRevision: node.revision });
    return result.bytes;
  }
  /** Bounded, read-only source preview; never attempts whole-document loading. */
  async previewFile(node: WorkspaceNode, maxBytes = 256 * 1024): Promise<{
    bytes: Uint8Array; size: number; truncated: boolean;
  }> {
    const fs = this.requireFs();
    if (node.kind !== "file") throw new WorkspaceV3Error("EISDIR", "Cannot preview directory as file");
    const latest = await fs.stat(this.ref(node));
    if (latest.nodeId !== node.nodeId || latest.revision !== node.revision) {
      throw new WorkspaceV3Error("ESTALE", "File changed; refresh the directory first");
    }
    if (!latest.size) return { bytes: new Uint8Array(), size: 0, truncated: false };
    const length = Math.min(latest.size, Math.max(1, Math.min(maxBytes, 512 * 1024)));
    const value = await fs.readRange(this.ref(node), {
      offset: 0, length, expectedRevision: node.revision,
    });
    return { bytes: value.bytes, size: latest.size, truncated: value.bytes.length < latest.size };
  }

  async copyFile(node: WorkspaceNode, newName: string): Promise<void> {
    const fs = this.requireFs();
    if (node.kind !== "file") throw new WorkspaceV3Error("EUNSUPPORTED", "Copy directory tree not implemented");
    await this.mutate([{ type: "copy", target: this.ref(node), expectedRevision: node.revision,
      to: location(fs.workspaceId, joinLogicalPath(this.state.directory, newName)), ifAbsent: true }]);
  }
  async remove(node: WorkspaceNode, opts: { recursive?: boolean; confirmation?: string } = {}): Promise<void> {
    if (opts.recursive) {
      if (node.kind !== "directory" || opts.confirmation !== "DELETE " + node.path) {
        throw new WorkspaceV3Error("EACCES", "Explicit exact directory confirmation required");
      }
      await this.mutate([{ type: "remove-tree", target: this.ref(node), expectedRevision: node.revision,
        expectedTreeRevision: node.revision, recursive: true }]);
    } else {
      await this.mutate([{ type: "remove", target: this.ref(node), expectedRevision: node.revision }]);
    }
  }
  /** Switch is a transactional controller operation, not a window reload. */
  async switchWorkspace(workspaceId: string): Promise<WorkspaceSwitchDecision> {
    this.requireFs();
    if (this.state.busy) return { kind: "blocked", reason: "operation" };
    const decision = planWorkspaceSwitch(this.state.workspaceId, workspaceId, this.activity());
    if (decision.kind !== "proceed") return decision;
    const old = this.requireFs();
    this.update({ busy: true, error: undefined });
    let fresh: WorkspaceFSV3 | undefined;
    try {
      fresh = await this.registry.open(workspaceId);
      const root = await fresh.stat(location(workspaceId, "/"));
      if (root.kind !== "directory") throw new WorkspaceV3Error("ENOTDIR", "Invalid new workspace root");
      const page = await fresh.list(location(workspaceId, "/"));
      this.unsubscribe?.();
      this.fs = fresh;
      this.unsubscribe = this.listen(fresh);
      this.sequence++;
      this.update({ workspaceId, directory: "/", entries: page.entries,
        generation: page.generation, nextCursor: page.nextCursor,
        stale: false, busy: false });
      await old.close();
      return decision;
    } catch (e) {
      if (this.fs !== fresh && fresh) await fresh.close();
      if (this.fs === old) this.update({ error: String(e), busy: false });
      throw e;
    }
  }
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.unsubscribe?.(); this.unsubscribe = undefined;
    this.sequence++;
    const fs = this.fs; this.fs = undefined;
    if (fs) await fs.close();
    this.listeners.clear();
  }
}
