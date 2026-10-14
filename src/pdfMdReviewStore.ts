/** WP7: Human PDF↔MD audit stored separately from the immutable MinerU map.
 * One explicitly requested, CAS-coordinated WorkspaceFS file commit.
 */
import { createHash } from "crypto";
import { location,normalizeLogicalPath,WorkspaceV3Error,
  type WorkspaceFSV3,type WorkspaceNode } from "./workspaceFsV3";
import { loadPdfMdSidecar } from "./mineruMappingSidecarStore";
import type { PdfMdMappingSidecarV1 } from "./mineruMappingSidecar";
import { sidecarMdDocuments } from "./pdfMdBidirectional";

export const REVIEW_FILENAME="pdf-md-review.v1.json";
export const REVIEW_STATUSES=["已核对","OCR错误","关联错误","缺失","待复核","已校正"] as const;
export type ReviewStatus=typeof REVIEW_STATUSES[number];
export interface ReviewAnchor { readonly path:string;readonly sha256:string;readonly from:number;readonly to:number; }
export interface ReviewDecision { readonly elementId:string;readonly status:ReviewStatus;
  readonly note:string;readonly updatedAt:string;readonly correctedAnchor?:ReviewAnchor; }
export interface PdfMdReviewV1 { readonly kind:"ocr2md/pdf-md-review";readonly schemaVersion:1;
  readonly workspaceId:string;readonly mappingSha256:string;readonly decisions:readonly ReviewDecision[]; }
export interface LoadedReview {readonly review:PdfMdReviewV1;readonly node?:WorkspaceNode;}
const MAX_REVIEW_BYTES=512*1024,CHUNK=65536;
function fail(code:WorkspaceV3Error["code"],message:string):never{throw new WorkspaceV3Error(code,message);}
export function reviewFilePath(folder:string):string{
  const path=normalizeLogicalPath(folder);
  if(path==="/")return fail("EINVAL","Review needs an authorized book directory");
  return normalizeLogicalPath(path+"/.ocr2md/"+REVIEW_FILENAME);
}
export function emptyReview(map:PdfMdMappingSidecarV1,sha:string):PdfMdReviewV1{
  if(!/^[a-f0-9]{64}$/.test(sha))fail("EINVAL","Invalid map SHA");
  return {kind:"ocr2md/pdf-md-review",schemaVersion:1,workspaceId:map.workspaceId,
    mappingSha256:sha,decisions:[]};
}
export function validateReview(value:unknown,map:PdfMdMappingSidecarV1,mapSha:string):asserts value is PdfMdReviewV1{
  if(!value||typeof value!=="object")fail("EINVAL","Missing review JSON");
  const review=value as PdfMdReviewV1;
  if(review.kind!=="ocr2md/pdf-md-review"||review.schemaVersion!==1||
    review.workspaceId!==map.workspaceId||review.mappingSha256!==mapSha||
    !Array.isArray(review.decisions)||review.decisions.length>map.relations.length)
    fail("ESTALE","Review is malformed or bound to a different map version");
  const docs=new Map(sidecarMdDocuments(map).map(x=>[x.path,x.sha256]));
  const ids=new Set(map.relations.map(r=>r.elementId)),seen=new Set<string>();
  for(const decision of review.decisions){
    if(!decision||!ids.has(decision.elementId)||seen.has(decision.elementId)||
      !REVIEW_STATUSES.includes(decision.status)||typeof decision.note!=="string"||
      decision.note.length>2000||typeof decision.updatedAt!=="string"||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(decision.updatedAt))
      fail("EINVAL","Invalid or duplicate review decision");
    seen.add(decision.elementId);
    const a=decision.correctedAnchor;
    if((decision.status==="已校正")!==Boolean(a))fail("EINVAL","Corrected review needs exactly one corrected anchor");
    if(a&&(docs.get(a.path)!==a.sha256||!Number.isSafeInteger(a.from)||
      !Number.isSafeInteger(a.to)||a.from<0||a.to<=a.from))
      fail("EINVAL","Corrected MD range must be in a hashed source document");
  }
}
export function encodeReview(review:PdfMdReviewV1,map:PdfMdMappingSidecarV1,mapSha:string):Uint8Array{
  validateReview(review,map,mapSha);
  const stable={...review,decisions:[...review.decisions].sort((a,b)=>a.elementId.localeCompare(b.elementId))};
  const bytes=new TextEncoder().encode(JSON.stringify(stable,null,2)+"\n");
  if(bytes.byteLength>MAX_REVIEW_BYTES)fail("EQUOTA","Review exceeds 512KiB limit");
  return bytes;
}
async function readExact(fs:WorkspaceFSV3,node:WorkspaceNode):Promise<Uint8Array>{
  if(node.kind!=="file"||node.size<1||node.size>MAX_REVIEW_BYTES)fail("EQUOTA","Review size invalid");
  const bytes=new Uint8Array(node.size);let pos=0;
  while(pos<node.size){
    const r=await fs.readRange(node,{offset:pos,length:Math.min(CHUNK,node.size-pos),expectedRevision:node.revision});
    if(r.totalBytes!==node.size||r.revision!==node.revision||r.bytes.length<1)
      fail("ESTALE","Review changed during read");
    bytes.set(r.bytes,pos);pos+=r.bytes.length;
  }
  const after=await fs.stat(location(fs.workspaceId,node.path));
  if(after.nodeId!==node.nodeId||after.revision!==node.revision)fail("ESTALE","Review changed after read");
  return bytes;
}
function notFound(e:unknown):boolean{return e instanceof WorkspaceV3Error&&e.code==="ENOENT";}
export async function loadReview(fs:WorkspaceFSV3,folder:string,map:PdfMdMappingSidecarV1,mapSha:string):Promise<LoadedReview>{
  const path=reviewFilePath(folder);let node:WorkspaceNode;
  try{node=await fs.stat(location(fs.workspaceId,path));}
  catch(e){if(notFound(e))return {review:emptyReview(map,mapSha)};throw e;}
  const bytes=await readExact(fs,node);
  let parsed:unknown;
  try{parsed=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));}
  catch{fail("EINVAL","Invalid review encoding/JSON");}
  validateReview(parsed,map,mapSha);
  return {review:parsed,node};
}
export async function saveReview(fs:WorkspaceFSV3,folder:string,map:PdfMdMappingSidecarV1,mapSha:string,
  review:PdfMdReviewV1,requestId:string,expectedRevision?:string):Promise<LoadedReview>{
  if(!requestId||requestId.length>256)fail("EINVAL","Invalid save requestId");
  if(fs.workspaceId!==map.workspaceId)fail("EACCES","Wrong workspace");
  const path=reviewFilePath(folder),root=normalizeLogicalPath(folder);
  if(!map.pdf.path.startsWith(root+"/"))fail("EACCES","Wrong book");
  const bytes=encodeReview(review,map,mapSha);
  const caps=await fs.getCapabilities();
  if(!caps.casWrites)fail("EUNSUPPORTED","CAS writes unavailable");
  // Re-verify the authoritative map and ALL source hashes immediately before commit.
  const bound=await loadPdfMdSidecar(fs,folder);
  if(!bound.sourcesCurrent||bound.sidecarSha256!==mapSha)
    fail("ESTALE","PDF–MD source/map version has changed; reload before saving");
  const parent=await fs.stat(location(fs.workspaceId,root+"/.ocr2md"));
  if(parent.kind!=="directory")fail("ENOTDIR","Review parent unavailable");
  let existing:WorkspaceNode|undefined;
  try{existing=await fs.stat(location(fs.workspaceId,path));}
  catch(e){if(!notFound(e))throw e;}
  if(existing){
    if(!expectedRevision||existing.revision!==expectedRevision)
      fail("ESTALE","Review was changed by another device; reload and reconcile");
    if(!caps.fileCoordination&&!caps.atomicBatch)fail("EUNSUPPORTED","No coordinated CAS support");
  }else if(expectedRevision){fail("ESTALE","Review file disappeared");}
  const operation=existing?
    {type:"replace-file" as const,target:existing,expectedRevision:existing.revision,bytes}:
    {type:"create-file" as const,at:location(fs.workspaceId,path),ifAbsent:true as const,bytes};
  const committed=await fs.commit({workspaceId:fs.workspaceId,requestId,operations:[operation]});
  if(!committed.committed)fail("ECONFLICT","Review commit not confirmed");
  const result=await loadReview(fs,folder,map,mapSha);
  const persisted=encodeReview(result.review,map,mapSha);
  if(createHash("sha256").update(persisted).digest("hex")!==
     createHash("sha256").update(bytes).digest("hex"))
    fail("ECONFLICT","Review read-back checksum mismatch");
  return result;
}
