/** WP4 · Versioned single-file sidecar persistence via WorkspaceFSV3.
 * No bypass to the OS filesystem. No silent overwrites or multi-file commits.
 */
import { createHash } from "crypto";
import {
  WorkspaceV3Error, location, normalizeLogicalPath,
  type WorkspaceFSV3, type WorkspaceNode,
} from "./workspaceFsV3";
import {
  decodePdfMdSidecar, encodePdfMdSidecar, mappingFilePath,
  sidecarSourceFiles, type PdfMdMappingSidecarV1,
} from "./mineruMappingSidecar";

const HASH_READ_CHUNK = 64 * 1024;
const MAX_SOURCE_BYTES = 256 * 1024 * 1024;
const MAX_SIDECAR_BYTES = 512 * 1024;

export interface SidecarSaveOptions {
  readonly workDirectory:string;
  /** Unique caller-generated idempotency key, never silently reused for another payload. */
  readonly requestId:string;
  /** Must be provided to REPLACE an existing file. Absence allows creation only. */
  readonly expectedSidecarRevision?:string;
}
export interface SidecarSaveResult {
  readonly status:"created"|"replaced"|"unchanged";
  readonly node:WorkspaceNode;
  readonly sidecarSha256:string;
  /** false means post-write snapshot check failed; callers MUST NOT navigate by stale anchors. */
  readonly sourcesStillCurrent:boolean;
}
export interface SidecarLoaded {
  readonly node:WorkspaceNode;
  readonly sidecar:PdfMdMappingSidecarV1;
  readonly sidecarSha256:string;
  readonly sourcesCurrent:boolean;
}
function ensureRequestId(value:string):void {
  if(!value||typeof value!=="string"||value.length>256)
    throw new WorkspaceV3Error("EINVAL","Missing/invalid sidecar request id");
}
function isNotFound(error:unknown):boolean {
  return error instanceof WorkspaceV3Error&&error.code==="ENOENT";
}
function conflict(error:unknown):never {
  if(error instanceof WorkspaceV3Error)throw error;
  throw new WorkspaceV3Error("ECONFLICT","Sidecar commit not confirmed; reload before retry");
}
/** Stat+revision checked incremental read of an entire file.
 * Atomic snapshot across MULTIPLE source files is not guaranteed by WorkspaceFSV3.
 */
async function verifiedFileDigest(fs:WorkspaceFSV3,path:string,expectedSha256:string):
  Promise<WorkspaceNode> {
  const node=await fs.stat(location(fs.workspaceId,path));
  if(node.kind!=="file")throw new WorkspaceV3Error("EISDIR","Source is not a file: "+path);
  if(node.size<0||!Number.isSafeInteger(node.size)||node.size>MAX_SOURCE_BYTES)
    throw new WorkspaceV3Error("EQUOTA","Source too large for on-save hashing: "+path);
  const hash=createHash("sha256");
  let offset=0;
  while(offset<node.size){
    const chunk=await fs.readRange(node,{offset,length:Math.min(HASH_READ_CHUNK,node.size-offset),
      expectedRevision:node.revision});
    if(chunk.revision!==node.revision||chunk.totalBytes!==node.size||!chunk.bytes.byteLength)
      throw new WorkspaceV3Error("ESTALE","Source changed during read: "+path);
    hash.update(chunk.bytes);
    offset+=chunk.bytes.byteLength;
  }
  const after=await fs.stat(location(fs.workspaceId,path));
  if(after.kind!=="file"||after.nodeId!==node.nodeId||after.revision!==node.revision||
    after.size!==node.size||hash.digest("hex")!==expectedSha256)
    throw new WorkspaceV3Error("ESTALE","Source file revision/hash mismatch: "+path);
  return after;
}
export async function verifySidecarSources(fs:WorkspaceFSV3,
  sidecar:PdfMdMappingSidecarV1):Promise<boolean> {
  const sources=sidecarSourceFiles(sidecar);
  for(const f of sources){
    try {await verifiedFileDigest(fs,f.path,f.sha256);}
    catch(error) {
      if(error instanceof WorkspaceV3Error && (
        error.code==="ESTALE"||error.code==="ENOENT"||error.code==="EISDIR"))return false;
      throw error;
    }
  }
  return true;
}
async function readExact(fs:WorkspaceFSV3,node:WorkspaceNode,maxBytes=MAX_SIDECAR_BYTES):
  Promise<Uint8Array> {
  if(node.kind!=="file"||node.size<1||node.size>maxBytes)
    throw new WorkspaceV3Error("EQUOTA","Sidecar has unexpected size");
  const pieces:Uint8Array[]=[];
  let total=0;
  while(total<node.size){
    const chunk=await fs.readRange(node,{
      offset:total,length:Math.min(HASH_READ_CHUNK,node.size-total),
      expectedRevision:node.revision,
    });
    if(chunk.revision!==node.revision||chunk.totalBytes!==node.size||!chunk.bytes.length)
      throw new WorkspaceV3Error("ESTALE","Sidecar changed during read");
    total+=chunk.bytes.length;
    pieces.push(chunk.bytes);
  }
  const current=await fs.stat(location(fs.workspaceId,node.path));
  if(current.revision!==node.revision||current.nodeId!==node.nodeId)
    throw new WorkspaceV3Error("ESTALE","Sidecar replaced during read");
  const combined=new Uint8Array(total);
  let written=0;
  for(const part of pieces){combined.set(part,written);written+=part.length;}
  return combined;
}
export async function loadPdfMdSidecar(fs:WorkspaceFSV3,workDirectory:string):
  Promise<SidecarLoaded>{
  const path=mappingFilePath(workDirectory);
  const node=await fs.stat(location(fs.workspaceId,path));
  const bytes=await readExact(fs,node);
  const sidecar=decodePdfMdSidecar(bytes);
  if(sidecar.workspaceId!==fs.workspaceId)
    throw new WorkspaceV3Error("EACCES","Sidecar belongs to another workspace");
  const root=normalizeLogicalPath(workDirectory);
  if(sidecarSourceFiles(sidecar).some(f=>!f.path.startsWith(root+"/")||f.path===path))
    throw new WorkspaceV3Error("EACCES","Sidecar references files outside the selected book");
  const sourcesCurrent=await verifySidecarSources(fs,sidecar);
  return {node,sidecar,sidecarSha256:createHash("sha256").update(bytes).digest("hex"),
    sourcesCurrent};
}
/** Only a single atomic file mutation. Sidecar parent must ALREADY exist and be
 * authorized; we never create hidden directories, elevate FS permissions or
 * overwrite a file without the revision the caller previously observed.
 */
export async function savePdfMdSidecar(
  fs:WorkspaceFSV3,
  sidecar:PdfMdMappingSidecarV1,
  options:SidecarSaveOptions,
):Promise<SidecarSaveResult>{
  ensureRequestId(options.requestId);
  if(sidecar.workspaceId!==fs.workspaceId)
    throw new WorkspaceV3Error("EACCES","Sidecar does not belong to this mount");
  const path=mappingFilePath(options.workDirectory);
  const bookRoot=normalizeLogicalPath(options.workDirectory);
  const sources=sidecarSourceFiles(sidecar);
  if(sources.some(f=>f.path===path||!f.path.startsWith(bookRoot+"/")))
    throw new WorkspaceV3Error("EACCES","Sidecar sources must remain inside the selected book");
  const bytes=encodePdfMdSidecar(sidecar);
  if(bytes.byteLength>MAX_SIDECAR_BYTES)
    throw new WorkspaceV3Error("EQUOTA","Sidecar exceeds 512KiB Mac Vault create-file limit");
  const digest=createHash("sha256").update(bytes).digest("hex");
  const caps=await fs.getCapabilities();
  if(!caps.casWrites)throw new WorkspaceV3Error("EUNSUPPORTED","WorkspaceFS has no CAS writes");
  const parent=normalizeLogicalPath(path.slice(0,path.lastIndexOf("/")));
  const parentNode=await fs.stat(location(fs.workspaceId,parent));
  if(parentNode.kind!=="directory")
    throw new WorkspaceV3Error("ENOTDIR","Authorized sidecar directory missing");
  let existing:WorkspaceNode|undefined;
  try{existing=await fs.stat(location(fs.workspaceId,path));}
  catch(error){if(!isNotFound(error))throw error;}
  if(existing){
    if(!options.expectedSidecarRevision)
      throw new WorkspaceV3Error("ECONFLICT","Explicit sidecar revision required to update");
    if(existing.revision!==options.expectedSidecarRevision)
      throw new WorkspaceV3Error("ESTALE","Sidecar modified by another writer");
    const prior=await readExact(fs,existing);
    if(createHash("sha256").update(prior).digest("hex")===digest) {
      const sourcesStillCurrent=await verifySidecarSources(fs,sidecar);
      if(!sourcesStillCurrent)throw new WorkspaceV3Error("ESTALE","Source snapshot is stale");
      return {status:"unchanged",node:existing,sidecarSha256:digest,sourcesStillCurrent};
    }
    if(!caps.fileCoordination && !caps.atomicBatch)
      throw new WorkspaceV3Error("EUNSUPPORTED","Backend lacks coordinated CAS replacement");
  }else if(options.expectedSidecarRevision){
    throw new WorkspaceV3Error("ESTALE","Expected sidecar version disappeared");
  }
  // Verify ALL source SHA-256 + revisions before the non-retryable commit.
  const sourcesCurrent=await verifySidecarSources(fs,sidecar);
  if(!sourcesCurrent)throw new WorkspaceV3Error("ESTALE","Source snapshot stale; rebuild mapping");
  const operation=existing?
    {type:"replace-file" as const,target:{workspaceId:fs.workspaceId,path,nodeId:existing.nodeId},
      expectedRevision:existing.revision,bytes}:
    {type:"create-file" as const,at:location(fs.workspaceId,path),ifAbsent:true as const,bytes};
  let result;
  try {result=await fs.commit({workspaceId:fs.workspaceId,requestId:options.requestId,
      operations:[operation]});}
  catch(error){conflict(error);}
  if(!result.committed)throw new WorkspaceV3Error("ECONFLICT","Sidecar write not confirmed");
  const node=await fs.stat(location(fs.workspaceId,path));
  const persisted=await readExact(fs,node);
  if(createHash("sha256").update(persisted).digest("hex")!==digest)
    throw new WorkspaceV3Error("ECONFLICT","Sidecar read-back checksum mismatch");
  // A simultaneous change to any source after verification creates a STALE
  // sidecar; callers must not enable navigation without a successful reload.
  const sourcesStillCurrent=await verifySidecarSources(fs,sidecar);
  return {status:existing?"replaced":"created",node,sidecarSha256:digest,sourcesStillCurrent};
}
