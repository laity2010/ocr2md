/** In-memory v3 storage fixture. No device filesystem or cloud permissions. */
import {
  WORKSPACE_FS_PROTOCOL_VERSION, WorkspaceV3Error, assertWorkspaceId,
  location, normalizeLogicalPath, validateCommit, validateReadRange,
  type WorkspaceCapabilities, type WorkspaceChangeEvent, type WorkspaceCommitRequest,
  type WorkspaceCommitResult, type WorkspaceFSV3, type WorkspaceLocation,
  type WorkspaceMountDescriptor, type WorkspaceMountRegistry, type WorkspaceNode,
  type WorkspaceNodeRef, type WorkspacePage, type WorkspaceReadRange,
  type WorkspaceReadResult,
} from "./workspaceFsV3";

type RecordNode = WorkspaceNode & { bytes: Uint8Array };
type StoredCommit = { fingerprint: string; result: WorkspaceCommitResult };
type SharedState = {
  id: string;
  nodes: Map<string, RecordNode>;
  version: number;
  serial: number;
  generation: number;
  receipts: Map<string, StoredCommit>;
  listeners: Set<(event: WorkspaceChangeEvent) => void>;
};
const fixtureCapabilities: WorkspaceCapabilities = {
  casWrites: true, atomicBatch: true, rangeRead: true, notifications: true,
  durableLocal: false, fileCoordination: false,
};

function fail(code: WorkspaceV3Error["code"], message: string): never {
  throw new WorkspaceV3Error(code, message);
}
function parentOf(p: string): string {
  if (p === "/") return "/";
  const last = p.lastIndexOf("/");
  return last === 0 ? "/" : p.slice(0, last);
}
function checkLoc(id: string, loc: WorkspaceLocation): string {
  if (!loc || loc.workspaceId !== id) fail("EINVAL", "Wrong workspace");
  const canonical = normalizeLogicalPath(loc.path);
  if (canonical !== loc.path) fail("EINVAL", "Noncanonical path");
  return canonical;
}
function toPublic(node: RecordNode): WorkspaceNode {
  const { bytes: _unused, ...meta } = node;
  void _unused;
  return { ...meta };
}
function copyResult(value: WorkspaceCommitResult): WorkspaceCommitResult {
  return { ...value, updated: value.updated.map(item => ({ ...item })), removedIds: [...value.removedIds] };
}
function fingerprint(request: WorkspaceCommitRequest): string {
  return JSON.stringify(request, (_, value: unknown) => value instanceof Uint8Array ? Array.from(value) : value);
}

/** Snapshot used only as an internal bridge to the IndexedDB adapter. */
export interface FixtureWorkspaceSnapshot {
  readonly nodes: readonly RecordNode[];
  readonly receipts: readonly (readonly [string, StoredCommit])[];
  readonly version: number;
  readonly serial: number;
  readonly generation: number;
}

/** Registry shares data between open leases, but each lease has its own close lifecycle. */
export class FixtureWorkspaceRegistry implements WorkspaceMountRegistry {
  private readonly data = new Map<string, SharedState>();
  private readonly descriptors: WorkspaceMountDescriptor[] = [];
  private blocked = new Set<string>();

  constructor(workspaces: readonly { workspaceId: string; label: string }[],
              private readonly pageSize = 25) {
    for (const descriptor of workspaces) {
      const id = assertWorkspaceId(descriptor.workspaceId);
      if (this.data.has(id)) fail("EEXIST", "Duplicate workspace ID");
      const root: RecordNode = {
        ...location(id, "/"), nodeId: "root-" + id, kind: "directory",
        size: 0, revision: "r1", bytes: new Uint8Array(),
      };
      this.data.set(id, { id, nodes: new Map([["/", root]]), version: 1,
        serial: 1, generation: 1, receipts: new Map(), listeners: new Set() });
      this.descriptors.push({ workspaceId: id, label: descriptor.label, backendId: "memory-fixture" });
    }
  }
  listMounts(): Promise<readonly WorkspaceMountDescriptor[]> {
    return Promise.resolve(this.descriptors.map(d => ({ ...d })));
  }
  open(id: string): Promise<WorkspaceFSV3> {
    assertWorkspaceId(id);
    if (this.blocked.has(id)) return Promise.reject(new WorkspaceV3Error("EOFFLINE", "Fixture mount inaccessible"));
    const state = this.data.get(id);
    if (!state) return Promise.reject(new WorkspaceV3Error("ENOENT", "Workspace not registered"));
    return Promise.resolve(new FixtureWorkspaceFS(state, this.pageSize));
  }
  /** Do not expose mutable maps; snapshots survive structured cloning in IndexedDB. */
  exportSnapshot(id: string): FixtureWorkspaceSnapshot {
    const state = this.data.get(assertWorkspaceId(id));
    if (!state) fail("ENOENT", "Workspace not registered");
    return {
      nodes: [...state.nodes.values()].map(n => ({ ...n, bytes: n.bytes.slice() })),
      receipts: [...state.receipts.entries()].map(([key, receipt]) =>
        [key, { fingerprint: receipt.fingerprint, result: copyResult(receipt.result) }] as const),
      version: state.version, serial: state.serial, generation: state.generation,
    };
  }
  /** Must only hydrate an unopened, isolated registry; not for production live mounts. */
  importSnapshot(id: string, snapshot: FixtureWorkspaceSnapshot): void {
    const state = this.data.get(assertWorkspaceId(id));
    if (!state) fail("ENOENT", "Workspace not registered");
    if (state.listeners.size) fail("EBUSY", "Cannot hydrate an open fixture with listeners");
    if (!snapshot || !Array.isArray(snapshot.nodes) || !Array.isArray(snapshot.receipts) ||
      !Number.isSafeInteger(snapshot.version) || !Number.isSafeInteger(snapshot.serial) ||
      !Number.isSafeInteger(snapshot.generation)) fail("EINVAL", "Invalid fixture snapshot");
    const nodes = new Map<string, RecordNode>();
    for (const node of snapshot.nodes) {
      if (node.workspaceId !== id || normalizeLogicalPath(node.path) !== node.path ||
          !(node.bytes instanceof Uint8Array) || nodes.has(node.path)) {
        fail("EINVAL", "Invalid node in fixture snapshot");
      }
      nodes.set(node.path, { ...node, bytes: node.bytes.slice() });
    }
    if (!nodes.has("/")) fail("EINVAL", "Fixture snapshot lacks root");
    state.nodes = nodes;
    state.receipts = new Map(snapshot.receipts.map(([key, value]) =>
      [key, { fingerprint: value.fingerprint, result: copyResult(value.result) }]));
    state.version = snapshot.version;
    state.serial = snapshot.serial;
    state.generation = snapshot.generation;
  }

  /** Simulate an unavailable backend without deleting its data. */
  block(id: string, blocked = true): void {
    if (blocked) this.blocked.add(id);
    else this.blocked.delete(id);
  }
}

/** Implements v3 semantics only against shared memory; never describe as durable. */
export class FixtureWorkspaceFS implements WorkspaceFSV3 {
  readonly protocolVersion = WORKSPACE_FS_PROTOCOL_VERSION;
  readonly workspaceId: string;
  private closed = false;
  private owned = new Set<(event: WorkspaceChangeEvent) => void>();
  constructor(private readonly state: SharedState, private readonly pageSize = 25) {
    this.workspaceId = state.id;
    if (!Number.isSafeInteger(pageSize) || pageSize < 1) fail("EINVAL", "Invalid page size");
  }
  private ensureOpen(): void { if (this.closed) fail("EBUSY", "Workspace handle already closed"); }
  getCapabilities(): Promise<WorkspaceCapabilities> {
    this.ensureOpen(); return Promise.resolve({ ...fixtureCapabilities });
  }
  async list(loc: WorkspaceLocation, cursor?: string): Promise<WorkspacePage> {
    this.ensureOpen();
    const path = checkLoc(this.workspaceId, loc);
    const current = this.require(path);
    if (current.kind !== "directory") fail("ENOTDIR", "Not a directory");
    const generation = "g" + this.state.generation;
    let offset = 0;
    if (cursor !== undefined) {
      const match = /^g([0-9]+):([0-9]+)$/.exec(cursor);
      if (!match) fail("EINVAL", "Invalid cursor");
      if ("g" + match[1] !== generation) fail("ESTALE", "Directory generation changed");
      offset = Number(match[2]);
      if (!Number.isSafeInteger(offset)) fail("EINVAL", "Invalid cursor offset");
    }
    const children = [...this.state.nodes.values()].filter(item =>
      item.path !== path && parentOf(item.path) === path)
      .sort((a,b) => a.path.localeCompare(b.path, "en"));
    if (offset > children.length) fail("EINVAL", "Cursor exceeds directory length");
    const next = offset + this.pageSize;
    return { generation, entries: children.slice(offset, next).map(toPublic),
      nextCursor: next < children.length ? generation + ":" + next : undefined };
  }
  async stat(loc: WorkspaceLocation): Promise<WorkspaceNode> {
    this.ensureOpen(); return toPublic(this.require(checkLoc(this.workspaceId, loc)));
  }
  async readRange(ref: WorkspaceNodeRef, range: WorkspaceReadRange): Promise<WorkspaceReadResult> {
    this.ensureOpen(); validateReadRange(range);
    const node = this.requireRef(ref);
    if (node.kind !== "file") fail("EISDIR", "Cannot read a directory");
    if (range.expectedRevision && range.expectedRevision !== node.revision) fail("ESTALE", "Changed since read");
    return { bytes: node.bytes.slice(range.offset, range.offset + range.length),
      revision: node.revision, totalBytes: node.bytes.length };
  }
  private require(path: string, nodes = this.state.nodes): RecordNode {
    const node = nodes.get(path);
    if (!node) fail("ENOENT", "Workspace item not found");
    return node;
  }
  private requireRef(ref: WorkspaceNodeRef, nodes = this.state.nodes): RecordNode {
    const path = checkLoc(this.workspaceId, ref);
    const node = this.require(path, nodes);
    if (node.nodeId !== ref.nodeId) fail("ESTALE", "Resource identity changed");
    return node;
  }
  async commit(request: WorkspaceCommitRequest): Promise<WorkspaceCommitResult> {
    this.ensureOpen();
    validateCommit(request, fixtureCapabilities);
    if (request.workspaceId !== this.workspaceId) fail("EINVAL", "Wrong workspace commit");
    const signature = fingerprint(request);
    const receipt = this.state.receipts.get(request.requestId);
    if (receipt) {
      if (receipt.fingerprint !== signature) fail("ECONFLICT", "Idempotency key reused for different operation");
      return copyResult(receipt.result);
    }
    const nodes: Map<string, RecordNode> = new Map([...this.state.nodes].map(([key, node]) =>
      [key, { ...node, bytes: node.bytes.slice() }]));
    let version = this.state.version;
    let serial = this.state.serial;
    const affected = new Set<string>();
    const removedIds: string[] = [];
    const bump = (node: RecordNode) => {
      node.revision = "r" + ++version;
      affected.add(node.nodeId);
    };
    const ancestors = (path: string) => {
      let parent = parentOf(path);
      while (true) {
        const ancestor = this.require(parent, nodes);
        bump(ancestor);
        if (parent === "/") break;
        parent = parentOf(parent);
      }
    };
    const requireParent = (path: string) => {
      const parent = this.require(parentOf(path), nodes);
      if (parent.kind !== "directory") fail("ENOTDIR", "Parent is not a directory");
    };
    const insert = (path: string, kind: "file" | "directory", data: Uint8Array = new Uint8Array()) => {
      if (nodes.has(path)) fail("EEXIST", "Destination exists");
      requireParent(path);
      const node: RecordNode = { ...location(this.workspaceId, path), nodeId: "node-" + ++serial,
        revision: "r" + ++version, kind, size: data.length, bytes: data.slice() };
      nodes.set(path, node);
      affected.add(node.nodeId);
      ancestors(path);
    };
    for (const op of request.operations) {
      if (op.type === "create-file" || op.type === "create-directory") {
        insert(op.at.path, op.type === "create-file" ? "file" : "directory",
          op.type === "create-file" ? op.bytes : undefined);
        continue;
      }
      const original = this.requireRef(op.target, nodes);
      if (original.revision !== op.expectedRevision) fail("ESTALE", "Revision no longer current");
      const path = original.path;
      if (op.type === "replace-file") {
        if (original.kind !== "file") fail("EISDIR", "Cannot write a directory");
        original.bytes = op.bytes.slice(); original.size = op.bytes.length;
        bump(original); ancestors(path);
      } else if (op.type === "move") {
        requireParent(op.to.path);
        if (nodes.has(op.to.path)) fail("EEXIST", "Destination exists");
        const moved = [...nodes.values()].filter(node =>
          node.path === path || node.path.startsWith(path + "/"));
        for (const node of moved) nodes.delete(node.path);
        for (const node of moved) {
          const suffix = node.path.slice(path.length);
          node.path = op.to.path + suffix;
          bump(node);
          nodes.set(node.path, node);
        }
        ancestors(path); ancestors(op.to.path);
      } else if (op.type === "copy") {
        if (original.kind !== "file") fail("EUNSUPPORTED", "Directory tree copy is not supported");
        insert(op.to.path, "file", original.bytes);
      } else if (op.type === "remove" || op.type === "remove-tree") {
        const descendants = [...nodes.values()].filter(node => node.path.startsWith(path + "/"));
        if (descendants.length && op.type === "remove") fail("ENOTEMPTY", "Directory not empty");
        if (op.type === "remove-tree" && (original.kind !== "directory" ||
          op.expectedTreeRevision !== original.revision)) fail("ESTALE", "Directory tree changed");
        for (const node of [original, ...descendants]) {
          nodes.delete(node.path);
          removedIds.push(node.nodeId);
          affected.add(node.nodeId);
        }
        ancestors(path);
      }
    }
    this.state.nodes = nodes;
    this.state.version = version;
    this.state.serial = serial;
    this.state.generation++;
    const result: WorkspaceCommitResult = { committed: true, workspaceId: this.workspaceId,
      requestId: request.requestId, updated: [...nodes.values()].filter(node => affected.has(node.nodeId)).map(toPublic),
      removedIds };
    this.state.receipts.set(request.requestId, { fingerprint: signature, result: copyResult(result) });
    const event: WorkspaceChangeEvent = { type: "entries-changed", workspaceId: this.workspaceId,
      changedNodeIds: [...affected], generation: "g" + this.state.generation };
    for (const listener of [...this.state.listeners]) {
      try { listener(event); } catch { /* Subscriber bugs cannot undo a completed commit. */ }
    }
    return copyResult(result);
  }
  subscribe(listener: (event: WorkspaceChangeEvent) => void): () => void {
    this.ensureOpen(); this.state.listeners.add(listener); this.owned.add(listener);
    return () => { this.state.listeners.delete(listener); this.owned.delete(listener); };
  }
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    for (const listener of this.owned) this.state.listeners.delete(listener);
    this.owned.clear();
  }
}
