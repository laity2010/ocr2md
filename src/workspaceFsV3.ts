/**
 * ocr2md Workspace FS v3: portable, local-first, versioned protocol.
 *
 * This is a contract, not a production storage implementation. Existing
 * WorkspaceStorage backends remain untouched and must not be presented as
 * CAS-safe without an adapter that implements these guarantees.
 */
import type { WorkspaceStorage } from "./workspaceStorage";

export const WORKSPACE_FS_PROTOCOL_VERSION = 3 as const;
export type WorkspaceNodeKind = "file" | "directory";
export type WorkspaceV3ErrorCode =
  | "EINVAL"
  | "ENOENT"
  | "EEXIST"
  | "EISDIR"
  | "ENOTDIR"
  | "ENOTEMPTY"
  | "EAMBIGUOUS"
  | "ESTALE"
  | "EACCES"
  | "EQUOTA"
  | "EOFFLINE"
  | "ECONFLICT"
  | "EUNSUPPORTED"
  | "EBUSY";

export class WorkspaceV3Error extends Error {
  constructor(readonly code: WorkspaceV3ErrorCode, message: string) {
    super(message);
    this.name = "WorkspaceV3Error";
  }
}

/** Portable workspace identity, never a physical mount path or Drive ID. */
export function assertWorkspaceId(id: string): string {
  if (typeof id !== "string" || id === "." || id === ".." ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(id)) {
    throw new WorkspaceV3Error("EINVAL", "Invalid workspaceId");
  }
  return id;
}

/**
 * Logical paths are absolute within ONE workspace, e.g. /chapters/01/a.md.
 * Reject traversal, repeated separators and platform-specific separators.
 * Mount adapters must separately reject symlinks escaping their root.
 * Percent escapes are literal characters here; HTTP transport decodes ONCE.
 */
export function normalizeLogicalPath(value: string): string {
  if (typeof value !== "string" || value.length > 4096 ||
      !value.startsWith("/") || value.includes("\\") ||
      /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new WorkspaceV3Error("EINVAL", "Invalid logical workspace path");
  }
  if (value === "/") return "/";
  const parts = value.slice(1).split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) {
    throw new WorkspaceV3Error("EINVAL", "Unsafe logical workspace path");
  }
  return "/" + parts.map((part) => part.normalize("NFC")).join("/");
}

export function joinLogicalPath(parent: string, name: string): string {
  const root = normalizeLogicalPath(parent);
  if (typeof name !== "string" || !name || name === "." || name === ".." ||
      name.includes("/") || name.includes("\\")) {
    throw new WorkspaceV3Error("EINVAL", "Invalid entry name");
  }
  return normalizeLogicalPath((root === "/" ? "" : root) + "/" + name);
}

export interface WorkspaceLocation {
  workspaceId: string;
  path: string;
}

export function location(workspaceId: string, path: string): WorkspaceLocation {
  return { workspaceId: assertWorkspaceId(workspaceId), path: normalizeLogicalPath(path) };
}

/**
 * Stable nodeId is assigned at creation and survives moves/renames.
 * The synced identity ledger (specified in WP1) is authoritative for replicas;
 * path, mtime and content hash MUST NOT be used as substitute identities.
 */
export interface WorkspaceNode extends WorkspaceLocation {
  nodeId: string;
  kind: WorkspaceNodeKind;
  revision: string; // opaque compare-and-swap token, not necessarily SHA
  size: number;
  modifiedAt?: string;
}

export interface WorkspaceCapabilities {
  /** Required for committing mutations; false means read-only v3. */
  casWrites: boolean;
  /** Guarantees all-or-nothing durability / crash recovery for multi-op commit. */
  atomicBatch: boolean;
  /** Supports sub-file reads, needed for large original PDFs. */
  rangeRead: boolean;
  /** Adapter can emit external changes; otherwise caller must rescan. */
  notifications: boolean;
  /** Files are durably stored on this device, independent of provider status. */
  durableLocal: boolean;
  /** Native filesystem coordinator is available for iCloud-managed files. */
  fileCoordination: boolean;
}

export interface WorkspacePage {
  entries: readonly WorkspaceNode[];
  nextCursor?: string;
  generation: string; // stable only for this snapshot; not a file revision
}

export interface WorkspaceReadRange {
  offset: number;
  length: number;
  expectedRevision?: string;
}

export function validateReadRange(range: WorkspaceReadRange): void {
  if (!Number.isSafeInteger(range.offset) || range.offset < 0 ||
      !Number.isSafeInteger(range.length) || range.length <= 0 ||
      !Number.isSafeInteger(range.offset + range.length)) {
    throw new WorkspaceV3Error("EINVAL", "Range must be positive safe integers");
  }
  if (range.expectedRevision !== undefined) assertRevision(range.expectedRevision);
}

export interface WorkspaceReadResult {
  bytes: Uint8Array;
  revision: string;
  totalBytes: number;
}

/** On rename/move the nodeId stays fixed; path is a checked hint, not authority. */
export interface WorkspaceNodeRef extends WorkspaceLocation {
  nodeId: string;
}

export type WorkspaceMutation =
  | { type: "create-file"; at: WorkspaceLocation; bytes: Uint8Array; ifAbsent: true }
  | { type: "create-directory"; at: WorkspaceLocation; ifAbsent: true }
  | { type: "replace-file"; target: WorkspaceNodeRef; expectedRevision: string; bytes: Uint8Array }
  | { type: "move"; target: WorkspaceNodeRef; expectedRevision: string; to: WorkspaceLocation; ifAbsent: true }
  /** Copy a file to a new nodeId; directory-tree copy needs its own future contract. */
  | { type: "copy"; target: WorkspaceNodeRef; expectedRevision: string; to: WorkspaceLocation; ifAbsent: true }
  | { type: "remove"; target: WorkspaceNodeRef; expectedRevision: string; recursive?: false }
  | { type: "remove-tree"; target: WorkspaceNodeRef; expectedRevision: string; expectedTreeRevision: string; recursive: true };

export interface WorkspaceCommitRequest {
  workspaceId: string;
  /** Retry-safe idempotency key; an adapter must remember committed results. */
  requestId: string;
  operations: readonly WorkspaceMutation[];
}

export interface WorkspaceCommitResult {
  workspaceId: string;
  requestId: string;
  /** Only return after operations have been durably committed locally. */
  committed: true;
  updated: readonly WorkspaceNode[];
  removedIds: readonly string[];
}

function assertRevision(token: string): void {
  if (typeof token !== "string" || !token.trim()) {
    throw new WorkspaceV3Error("EINVAL", "Expected a nonempty revision");
  }
}

function assertCanonicalLocation(at: WorkspaceLocation): void {
  if (!at || typeof at !== "object") {
    throw new WorkspaceV3Error("EINVAL", "Missing workspace location");
  }
  const canonical = location(at.workspaceId, at.path);
  if (at.path !== canonical.path) {
    throw new WorkspaceV3Error("EINVAL", "Noncanonical logical workspace path");
  }
}

function assertNodeRef(ref: WorkspaceNodeRef): void {
  assertCanonicalLocation(ref);
  if (typeof ref.nodeId !== "string" || !ref.nodeId.trim() || ref.nodeId.length > 256) {
    throw new WorkspaceV3Error("EINVAL", "Invalid nodeId");
  }
}

/**
 * Shared guard for v3 implementations: prevents unsafe writes before a
 * provider is capable of CAS and crash-safe grouped commits.
 * This is validation only; the adapter still MUST enforce CAS atomically.
 */
export function validateCommit(
  request: WorkspaceCommitRequest,
  capabilities: WorkspaceCapabilities,
): void {
  assertWorkspaceId(request.workspaceId);
  if (typeof request.requestId !== "string" || !request.requestId.trim() ||
      request.requestId.length > 256 ||
      !Array.isArray(request.operations) || request.operations.length === 0) {
    throw new WorkspaceV3Error("EINVAL", "Invalid commit request");
  }
  if (!capabilities.casWrites || (request.operations.length > 1 && !capabilities.atomicBatch)) {
    throw new WorkspaceV3Error("EUNSUPPORTED", "Adapter cannot safely perform this commit");
  }

  const touchedIds = new Set<string>();
  const destinationPaths = new Set<string>();
  for (const operation of request.operations) {
    if (!operation || !["create-file", "create-directory", "replace-file", "move",
          "copy", "remove", "remove-tree"].includes(operation.type)) {
      throw new WorkspaceV3Error("EINVAL", "Unknown mutation operation");
    }
    let at: WorkspaceLocation;
    if (operation.type === "create-file" || operation.type === "create-directory") {
      at = operation.at;
      if (operation.ifAbsent !== true) {
        throw new WorkspaceV3Error("EINVAL", "Creation must fail if target exists");
      }
    } else {
      assertNodeRef(operation.target);
      assertRevision(operation.expectedRevision);
      if (touchedIds.has(operation.target.nodeId)) {
        throw new WorkspaceV3Error("EINVAL", "Same node mutated twice in one commit");
      }
      touchedIds.add(operation.target.nodeId);
      at = operation.target;
    }
    if (at.workspaceId !== request.workspaceId) {
      throw new WorkspaceV3Error("EINVAL", "Cross-workspace commit is forbidden");
    }
    assertCanonicalLocation(at);
    const path = normalizeLogicalPath(at.path);
    if (path === "/") {
      throw new WorkspaceV3Error("EINVAL", "Cannot mutate workspace root");
    }

    if (operation.type === "create-file" || operation.type === "replace-file") {
      if (!(operation.bytes instanceof Uint8Array)) {
        throw new WorkspaceV3Error("EINVAL", "Expected file bytes");
      }
    } else if (operation.type === "move" || operation.type === "copy") {
      assertCanonicalLocation(operation.to);
      if (operation.to.workspaceId !== request.workspaceId ||
          normalizeLogicalPath(operation.to.path) === "/" ||
          normalizeLogicalPath(operation.to.path) === path ||
          normalizeLogicalPath(operation.to.path).startsWith(path + "/") ||
          operation.ifAbsent !== true) {
        throw new WorkspaceV3Error("EINVAL", "Invalid or unsafe move target");
      }
    } else if (operation.type === "remove-tree") {
      assertRevision(operation.expectedTreeRevision);
      if (operation.recursive !== true) {
        throw new WorkspaceV3Error("EINVAL", "Recursive removal requires explicit authorization");
      }
    } else if (operation.type === "remove" && operation.recursive === true) {
      throw new WorkspaceV3Error("EINVAL", "Recursive removal requires a tree revision");
    }
    const destination = operation.type === "create-file" || operation.type === "create-directory"
      ? path
      : (operation.type === "move" || operation.type === "copy" ? operation.to.path : undefined);
    if (destination !== undefined) {
      if (destinationPaths.has(destination)) {
        throw new WorkspaceV3Error("EINVAL", "Destination repeated in one commit");
      }
      destinationPaths.add(destination);
    }
  }
}

export type WorkspaceChangeEvent =
  | { type: "entries-changed"; workspaceId: string; changedNodeIds: readonly string[]; generation: string }
  | { type: "conflict"; workspaceId: string; nodeId: string; localRevision: string; remoteRevision: string }
  | { type: "workspace-selected"; previousWorkspaceId: string | null; workspaceId: string };

/**
 * Business-facing port: no legacy writeFile() escape hatch.
 * A Storage Adapter may wrap existing WorkspaceStorage behind this port.
 */
export interface WorkspaceFSV3 {
  readonly protocolVersion: typeof WORKSPACE_FS_PROTOCOL_VERSION;
  readonly workspaceId: string;
  getCapabilities(): Promise<WorkspaceCapabilities>;
  list(directory: WorkspaceLocation, cursor?: string): Promise<WorkspacePage>;
  stat(target: WorkspaceLocation): Promise<WorkspaceNode>;
  readRange(target: WorkspaceNodeRef, request: WorkspaceReadRange): Promise<WorkspaceReadResult>;
  commit(request: WorkspaceCommitRequest): Promise<WorkspaceCommitResult>;
  subscribe(listener: (event: WorkspaceChangeEvent) => void): () => void;
  /** Release a selected mount, listeners and native handles without deleting files. */
  close(): Promise<void>;
}

/** Construction-layer compatibility only: not exported to business callers. */
export interface WorkspaceFSAdapterFactory {
  fromLegacy?(workspaceId: string, storage: WorkspaceStorage): Promise<WorkspaceFSV3>;
}

export interface WorkspaceMountDescriptor {
  workspaceId: string;
  label: string;
  backendId: string; // e.g. local, browser-opfs; never a credential or physical path
}

/** Only the coordinator selects mounts; FS operations cannot silently switch them. */
export interface WorkspaceMountRegistry {
  listMounts(): Promise<readonly WorkspaceMountDescriptor[]>;
  open(workspaceId: string): Promise<WorkspaceFSV3>;
}

export interface WorkspaceSwitchActivity {
  dirty: boolean;
  saving: boolean;
  inFlightOperation: boolean;
}

export type WorkspaceSwitchDecision =
  | { kind: "no-op" }
  | { kind: "blocked"; reason: "saving" | "operation" }
  | { kind: "resolve-draft" }
  | { kind: "proceed" };

/** Pure preflight; successful mount then emits workspace-selected. */
export function planWorkspaceSwitch(
  currentWorkspaceId: string,
  nextWorkspaceId: string,
  activity: WorkspaceSwitchActivity,
): WorkspaceSwitchDecision {
  assertWorkspaceId(currentWorkspaceId);
  assertWorkspaceId(nextWorkspaceId);
  if (activity.saving) return { kind: "blocked", reason: "saving" };
  if (activity.inFlightOperation) return { kind: "blocked", reason: "operation" };
  if (currentWorkspaceId === nextWorkspaceId) return { kind: "no-op" };
  if (activity.dirty) return { kind: "resolve-draft" };
  return { kind: "proceed" };
}

export type SyncStatus =
  | { state: "local-saved"; nodeId: string; localRevision: string }
  | { state: "queued"; nodeId: string; localRevision: string; providerId: string }
  | { state: "provider-observed"; nodeId: string; localRevision: string; providerId: string; observedRevision: string }
  | { state: "conflict"; nodeId: string; localRevision: string; providerId: string; observedRevision: string };
