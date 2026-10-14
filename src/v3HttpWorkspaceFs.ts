/** v3 shared Workspace FS over the existing Mac service.
 * Both Mac localhost Safari and external iPad Safari use the SAME relative API.
 * No IndexedDB/OPFS file replica or extra sync engine.
 */
import { WORKSPACE_FS_PROTOCOL_VERSION, WorkspaceV3Error,
  type WorkspaceCapabilities, type WorkspaceChangeEvent, type WorkspaceCommitRequest,
  type WorkspaceCommitResult, type WorkspaceFSV3, type WorkspaceLocation,
  type WorkspaceMountDescriptor, type WorkspaceMountRegistry, type WorkspaceNode,
  type WorkspaceNodeRef, type WorkspacePage, type WorkspaceReadRange,
  type WorkspaceReadResult } from "./workspaceFsV3";

const KEY_STORAGE = "ocr2md-v3-mac-vault-key";
const WORKSPACE_ID = "obsidian-ocr2md";
export class MacVaultAccessError extends Error {
  constructor(public readonly status: number, public readonly detail: string) {
    super(detail);
  }
}
function bodyToBase64(bytes: Uint8Array): string {
  let output = "";
  for (let i = 0; i < bytes.byteLength; i += 16384) {
    output += String.fromCharCode(...bytes.subarray(i, i + 16384));
  }
  return btoa(output);
}
function base64ToBody(encoded: string): Uint8Array {
  const raw = atob(encoded);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
export class MacVaultHttpRegistry implements WorkspaceMountRegistry {
  private bootstrap?: { mounts: WorkspaceMountDescriptor[]; root: WorkspaceNode; page: WorkspacePage };
  private readonly opened = new Set<MacVaultHttpFS>();
  private key = sessionStorage.getItem(KEY_STORAGE) ?? localStorage.getItem(KEY_STORAGE) ?? "";

  setKey(key: string, remember = false): void {
    this.key = key.trim();
    this.bootstrap = undefined;
    if (this.key) {
      sessionStorage.setItem(KEY_STORAGE, this.key);
      if (remember) localStorage.setItem(KEY_STORAGE, this.key);
      else localStorage.removeItem(KEY_STORAGE);
    } else {
      sessionStorage.removeItem(KEY_STORAGE);
      localStorage.removeItem(KEY_STORAGE);
    }
  }
  async fetchJson<T>(endpoint: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers ?? {});
    if (this.key) headers.set("X-OCR2MD-V3-Key", this.key);
    if (init.method === "POST") headers.set("Content-Type", "application/json");
    // Cloudflare can intermittently return an HTML 530/502 even though the
    // authorized Mac Vault FS expects JSON. Retry ONLY idempotent GETs; never
    // replay commits, and never retry auth/CAS/semantic errors.
    const mayRetry = !init.method || init.method.toUpperCase() === "GET";
    const attempts = mayRetry ? 3 : 1;
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (attempt > 0) await new Promise(resolve => setTimeout(resolve, attempt * 320));
      let response: Response;
      try {
        response = await fetch(endpoint, { ...init, headers, cache: "no-store" });
      } catch (error) {
        lastError = new WorkspaceV3Error("EOFFLINE", "Mac 文件服务暂时无法访问：" + String(error));
        if (attempt + 1 < attempts) continue;
        throw lastError;
      }
      // Do not include arbitrary HTML response bodies in UI errors or logs.
      // A 530 response often contains a Cloudflare-generated HTML error page.
      let data: Record<string, unknown> | undefined;
      try {
        data = await response.json() as Record<string, unknown>;
      } catch {
        const contentType = (response.headers.get("content-type") ?? "unknown").split(";")[0];
        lastError = new WorkspaceV3Error("EOFFLINE",
          `文件读取网关返回非 JSON (HTTP ${response.status}, ${contentType})`);
        if (mayRetry && attempt + 1 < attempts && (response.ok || response.status >= 500 || response.status === 429)) continue;
        throw lastError;
      }
      if (response.status === 401 || response.status === 403) {
        throw new MacVaultAccessError(response.status, String(data.error ?? "Access required"));
      }
      if (!response.ok) {
        const rawCode=String(data.code ?? "EOFFLINE");
        const allowed=["EINVAL","ENOENT","EEXIST","EISDIR","ENOTDIR","ENOTEMPTY",
          "EAMBIGUOUS","ESTALE","EACCES","EQUOTA","EOFFLINE","ECONFLICT","EUNSUPPORTED","EBUSY"] as const;
        const code=allowed.find(item=>item===rawCode)??"EOFFLINE";
        lastError = new WorkspaceV3Error(code, String(data.error ?? `HTTP ${response.status}`));
        if (mayRetry && attempt + 1 < attempts && (response.status >= 500 || response.status === 429)) continue;
        throw lastError;
      }
      return data as T;
    }
    throw lastError ?? new WorkspaceV3Error("EOFFLINE", "Mac 文件服务暂无响应");
  }
  status(): Promise<{ authorized: boolean; backend: string; canPairLocally: boolean; rootLabel: string }> {
    return this.fetchJson("/__v3/fs?op=status");
  }
  pairOnMac(): Promise<{ accessKey: string }> { return this.fetchJson("/__v3/fs?op=pair"); }
  async listMounts(): Promise<readonly WorkspaceMountDescriptor[]> {
    this.bootstrap = await this.fetchJson("/__v3/fs?op=bootstrap");
    return this.bootstrap!.mounts;
  }
  async open(id: string): Promise<WorkspaceFSV3> {
    if (id !== WORKSPACE_ID) throw new WorkspaceV3Error("ENOENT", "Only real Mac Obsidian Vault is mounted");
    if (!this.bootstrap) await this.listMounts();
    const fs = new MacVaultHttpFS(this, id, this.bootstrap);
    this.opened.add(fs);
    return fs;
  }
  dispose(fs: MacVaultHttpFS): void { this.opened.delete(fs); }
}
export class MacVaultHttpFS implements WorkspaceFSV3 {
  readonly protocolVersion = WORKSPACE_FS_PROTOCOL_VERSION;
  private closed = false;
  private rootCache?: WorkspaceNode;
  private pageCache?: WorkspacePage;
  private readonly listeners = new Set<(ev: WorkspaceChangeEvent) => void>();
  constructor(private readonly registry: MacVaultHttpRegistry, readonly workspaceId: string,
    bootstrap?: { root: WorkspaceNode; page: WorkspacePage }) {
    this.rootCache = bootstrap?.root;
    this.pageCache = bootstrap?.page;
  }
  private ensureOpen(): void {
    if (this.closed) throw new WorkspaceV3Error("EBUSY", "Mac Vault handle is closed");
  }
  async getCapabilities(): Promise<WorkspaceCapabilities> {
    this.ensureOpen();
    return this.registry.fetchJson<WorkspaceCapabilities>("/__v3/fs?op=capabilities");
  }
  private url(op: string, path: string, extra: Record<string,string> = {}): string {
    const q = new URLSearchParams({ op, path, ...extra });
    return "/__v3/fs?" + q.toString();
  }
  async stat(loc: WorkspaceLocation): Promise<WorkspaceNode> {
    this.ensureOpen();
    if (loc.workspaceId !== this.workspaceId) throw new WorkspaceV3Error("EINVAL", "Wrong workspace");
    if (loc.path === "/" && this.rootCache) {
      const value = this.rootCache; this.rootCache = undefined; return value;
    }
    return this.registry.fetchJson(this.url("stat", loc.path));
  }
  async list(loc: WorkspaceLocation, cursor?: string): Promise<WorkspacePage> {
    this.ensureOpen();
    if (loc.workspaceId !== this.workspaceId) throw new WorkspaceV3Error("EINVAL", "Wrong workspace");
    if (loc.path === "/" && !cursor && this.pageCache) {
      const page = this.pageCache; this.pageCache = undefined; return page;
    }
    return this.registry.fetchJson(this.url("list", loc.path, cursor ? {cursor} : {}));
  }
  async readRange(ref: WorkspaceNodeRef, range: WorkspaceReadRange): Promise<WorkspaceReadResult> {
    this.ensureOpen();
    if (ref.workspaceId !== this.workspaceId) throw new WorkspaceV3Error("EINVAL", "Wrong workspace");
    const data = await this.registry.fetchJson<{base64:string;revision:string;totalBytes:number}>(
      this.url("read", ref.path, {nodeId:ref.nodeId,
        revision:range.expectedRevision ?? "",offset:String(range.offset), length:String(range.length)}));
    return {bytes:base64ToBody(data.base64), revision:data.revision, totalBytes:data.totalBytes};
  }
  /** IR-WP7 dedicated transaction; never generic WorkspaceFS multi-op commit. */
  async loadIrSnapshot(book:string):Promise<{
    exists:boolean;generation:string|null;parentGeneration?:string|null;
    pointerRevision?:string;sourcesCurrent?:boolean;irBase64?:string;generatedVersionPath?:string;
    markings?:{segments:{startBlockId:string;endBlockId:string;fileName:string}[]}|{layout:unknown[];chapterNames:unknown[];operations:unknown[]}|null;markingsRevision?:string
  }>{
    this.ensureOpen();
    const query=new URLSearchParams({book});
    return this.registry.fetchJson("/__v3/ir?"+query.toString());
  }
  async saveIrSnapshot(book:string,archive:Uint8Array,expectedGeneration:string|null,
    requestId:string,expectedMarkingsRevision=''):Promise<{committed:true;generation:string;alreadyCurrent:boolean;pointerRevision:string;generatedVersionPath:string}>{
    this.ensureOpen();
    return this.registry.fetchJson("/__v3/ir/commit",{
      method:"POST",body:JSON.stringify({book,expectedGeneration,requestId,expectedMarkingsRevision,
        archiveBase64:bodyToBase64(archive)})
    });
  }
  /** Small CAS sidecar for file boundary markings; no OCR/ZIP is uploaded. */
  async saveIrMarkings(book:string,expectedGeneration:string,expectedRevision:string,
    requestId:string,markings:{segments:{startBlockId:string;endBlockId:string;fileName:string}[]}|{layout:unknown[];chapterNames:unknown[];operations:unknown[]},overwrite=false):Promise<{
      committed:true;generation:string;revision:string;bytesWritten:number;generatedVersionPath:string
    }>{
    this.ensureOpen();
    return this.registry.fetchJson('/__v3/ir/markings/commit',{
      method:'POST',body:JSON.stringify({book,expectedGeneration,expectedRevision,requestId,markings,overwrite})
    });
  }
  async loadIrMarkings(book:string):Promise<{
    exists:boolean;generation:string|null;revision:string;
    markings:{segments:{startBlockId:string;endBlockId:string;fileName:string}[]}|{layout:unknown[];chapterNames:unknown[];operations:unknown[]}|null
  }>{
    this.ensureOpen();
    return this.registry.fetchJson('/__v3/ir/markings?'+new URLSearchParams({book}));
  }
  /** Publish the current saved DIRjson as canonical Obsidian chapters.
   * Explicitly overwrites a PREVIOUS OCR2MD publication; server retains
   * the whole previous chapter tree in a timestamped recovery backup. */
  async publishIrChapters(book:string,expectedGeneration:string,
    expectedIrSha256:string,expectedMarkingsRevision=''):Promise<{
    published:true;alreadyPublished:boolean;overwritten:boolean;backupPath:string|null;
    count:number;path:string;generation:string;
    projectionUpgraded:boolean;previousGeneration?:string
  }>{
    this.ensureOpen();
    // Never upload a multi-megabyte base64 ZIP from Safari. The authenticated
    // Mac service derives it from the validated immutable saved DIRjson.
    return this.registry.fetchJson("/__v3/ir/publish-chapters",{
      method:"POST",body:JSON.stringify({book,expectedGeneration,expectedIrSha256,expectedMarkingsRevision})
    });
  }
  /** Explicit, V2-security-equivalent, one-image download into chapters/imgs.
   * The Mac verifies media URL, current published chapter, CAS, MIME and size. */
  async downloadCleanedChapterImage(book:string,filename:string,target:WorkspaceNode,
    sourceUrl:string):Promise<{saved:true;file:WorkspaceNode;sha256:string;path:string;
      workingText:string;localPath:string;fileName:string;mediaSizeBytes:number;mimeType:string}>{
    this.ensureOpen();
    return this.registry.fetchJson("/__v3/chapters/media/download",{
      method:"POST",body:JSON.stringify({book,filename,nodeId:target.nodeId,
        expectedRevision:target.revision,sourceUrl})
    });
  }
  /** Explicit CAS commit scoped to a previously published chapters/*.md. */
  async saveCleanedChapter(book:string,filename:string,target:WorkspaceNode,bytes:Uint8Array):Promise<{
    saved:true;file:WorkspaceNode;sha256:string;path:string
  }>{
    this.ensureOpen();
    return this.registry.fetchJson("/__v3/chapters/commit",{
      method:"POST",body:JSON.stringify({book,filename,nodeId:target.nodeId,
        expectedRevision:target.revision,base64:bodyToBase64(bytes)})
    });
  }
  async commit(request: WorkspaceCommitRequest): Promise<WorkspaceCommitResult> {
    this.ensureOpen();
    if (request.workspaceId !== this.workspaceId || request.operations.length !== 1) {
      throw new WorkspaceV3Error("EUNSUPPORTED", "Mac Vault currently supports only single-operation commits");
    }
    const operations = request.operations.map(operation => {
      if (operation.type === "create-file") {
        return {...operation, bytes:undefined,base64:bodyToBase64(operation.bytes)};
      }
      if (operation.type === "replace-file") {
        return {...operation,bytes:undefined,base64:bodyToBase64(operation.bytes)};
      }
      return operation;
    });
    const result = await this.registry.fetchJson<WorkspaceCommitResult>("/__v3/fs/commit", {
      method: "POST", body:JSON.stringify({...request,operations}) });
    const event: WorkspaceChangeEvent = { type:"entries-changed", workspaceId:this.workspaceId,
      changedNodeIds:result.updated.map(x => x.nodeId).concat(result.removedIds),generation:"external" };
    for (const listener of this.listeners) listener(event);
    return result;
  }
  subscribe(listener:(ev:WorkspaceChangeEvent)=>void):()=>void {
    this.ensureOpen(); this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  async close():Promise<void> {
    this.closed = true; this.listeners.clear(); this.registry.dispose(this);
  }
}
