/** WP4: portable PDF ↔ Markdown evidence sidecar. No source text or bytes saved.
 * Sidecar remains a rebuildable derived index, not the user's editable document.
 */
import { createHash } from "crypto";
import { normalizeLogicalPath, WorkspaceV3Error } from "./workspaceFsV3";
import type { MineruElementIndex, MineruBBox, MineruPageSize } from "./mineruElementExtractor";
import type {
  ChapterDocumentAnchor, ChapterLinkStatus, ChapterMappingResult, ChapterPartLink,
} from "./mineruChapterMapping";

export const PDF_MD_MAP_FILENAME = "pdf-md-map.v1.json";
export type MappingMatchStatus = ChapterLinkStatus;
export type Sha256Hex = string;
export interface MappingFileEvidence {readonly path:string;readonly sha256:Sha256Hex;}
export interface MappingPdfRegion {
  readonly pageIndex:number;
  readonly pdfPageNumber:number;
  readonly bbox:MineruBBox;
  readonly pageSize:MineruPageSize;
  readonly normalizedBBox:MineruBBox;
}
export interface MappingPartEvidence {
  readonly partIndex:number;
  readonly partKind:string;
  readonly originalState:string;
  readonly originalMdRangesUtf16:readonly (readonly [number,number])[];
  readonly originalMdFragmentEvidenceUtf16:readonly (readonly [number,number])[];
  readonly chapterAnchors:readonly ChapterDocumentAnchor[];
  readonly workingAnchors:readonly ChapterDocumentAnchor[];
}
export interface MappingRelationV1 {
  readonly elementId:string;
  readonly type:string;
  readonly pdfRegions:readonly MappingPdfRegion[];
  readonly originalMdState:string;
  readonly matchStatus:MappingMatchStatus;
  readonly chapters:readonly string[];
  readonly parts:readonly MappingPartEvidence[];
  readonly manuallyVerified:false;
}
export interface PdfMdMappingSidecarV1 {
  readonly kind:"ocr2md/pdf-md-map";
  readonly schemaVersion:1;
  readonly workspaceId:string;
  readonly pdf:MappingFileEvidence;
  readonly ocr:MappingFileEvidence;
  readonly originalMd:MappingFileEvidence;
  readonly chapterVersions:readonly {
    readonly chapterId:string;
    readonly source:MappingFileEvidence;
    readonly working:MappingFileEvidence;
  }[];
  readonly ocrSourceSha256:string;
  readonly ignoredDiscardedCount:number;
  readonly relations:readonly MappingRelationV1[];
  readonly summary:Readonly<Record<MappingMatchStatus,number>>;
}

export function sha256(bytes:Uint8Array|string):string{
  return createHash("sha256").update(bytes).digest("hex");
}
function validFile(file:MappingFileEvidence):void{
  const path=normalizeLogicalPath(file.path);
  if(path!==file.path||!path.startsWith("/")||path==="/")throw new WorkspaceV3Error("EINVAL","Noncanonical source file path");
  if(!/^[a-f0-9]{64}$/u.test(file.sha256))throw new WorkspaceV3Error("EINVAL","Invalid source file SHA-256");
}
export function mappingFilePath(workDirectory:string):string{
  const path=normalizeLogicalPath(workDirectory);
  if(path==="/")throw new WorkspaceV3Error("EINVAL","Root cannot be a book work directory");
  return normalizeLogicalPath(path+"/.ocr2md/"+PDF_MD_MAP_FILENAME);
}
export function buildPdfMdSidecar(
  workspaceId:string,
  pdf:MappingFileEvidence,
  ocr:MappingFileEvidence,
  elements:MineruElementIndex,
  chapterMapping:ChapterMappingResult,
):PdfMdMappingSidecarV1{
  validFile(pdf);validFile(ocr);validFile(chapterMapping.originalMd);
  if(!workspaceId.trim()||ocr.sha256!==elements.sourceSha256||
     chapterMapping.sourceJsonSha256!==elements.sourceSha256||
     elements.bodyElements.length!==chapterMapping.elements.length){
    throw new WorkspaceV3Error("ESTALE","PDF–MD inputs or source mapping version differ");
  }
  const locations=new Set<string>();
  const relations:MappingRelationV1[]=chapterMapping.elements.map((link,i)=>{
    const from=elements.bodyElements[i];
    if(!from||from.id!==link.elementId||from.pdfPageNumber!==link.pdfPageNumber||
       from.pageIndex!==link.pageIndex||JSON.stringify(from.bbox)!==JSON.stringify(link.bbox)){
      throw new WorkspaceV3Error("ESTALE",`Mapping element position mismatch at ${i}`);
    }
    if(locations.has(from.id))throw new WorkspaceV3Error("ECONFLICT","Repeated source element ID");
    locations.add(from.id);
    return {
      elementId:from.id,type:from.type,
      pdfRegions:[{pageIndex:from.pageIndex,pdfPageNumber:from.pdfPageNumber,
        bbox:from.bbox,pageSize:from.pageSize,normalizedBBox:from.normalizedBBox}],
      originalMdState:link.originalMdState,matchStatus:link.status,
      chapters:[...link.chapters],parts:link.parts.map((p:ChapterPartLink)=>({
        partIndex:p.partIndex,partKind:p.partKind,originalState:p.originalState,
        originalMdRangesUtf16:p.originalMdRangesUtf16,
        originalMdFragmentEvidenceUtf16:p.originalMdFragmentEvidenceUtf16,
        chapterAnchors:p.chapterAnchors,workingAnchors:p.workingAnchors,
      })),manuallyVerified:false as const,
    };
  });
  const summary={
    "candidate-complete":0,"candidate-partial":0,"ambiguous":0,
    "unmatched":0,"unavailable":0,
  };
  relations.forEach(r=>summary[r.matchStatus]++);
  const chapterVersions=chapterMapping.chapterVersions.map(c=>{
    validFile(c.source);validFile(c.working);
    return {chapterId:c.chapterId,
      source:{path:c.source.path,sha256:c.source.sha256},
      working:{path:c.working.path,sha256:c.working.sha256}};
  });
  const result:PdfMdMappingSidecarV1={
    kind:"ocr2md/pdf-md-map",schemaVersion:1,workspaceId,
    pdf,ocr,originalMd:chapterMapping.originalMd,
    chapterVersions,ocrSourceSha256:elements.sourceSha256,
    ignoredDiscardedCount:chapterMapping.ignoredDiscardedCount,relations,summary,
  };
  validatePdfMdSidecar(result);
  return result;
}
/** Reject truncated/malicious/wrong-version sidecars; never silently repair evidence. */
export function validatePdfMdSidecar(value:unknown):asserts value is PdfMdMappingSidecarV1{
  if(!value||typeof value!=="object")throw new WorkspaceV3Error("EINVAL","Invalid sidecar payload");
  const doc=value as PdfMdMappingSidecarV1;
  if(doc.kind!=="ocr2md/pdf-md-map"||doc.schemaVersion!==1||
     typeof doc.workspaceId!=="string"||!doc.workspaceId||
     !Array.isArray(doc.chapterVersions)||!Array.isArray(doc.relations)||
     typeof doc.ignoredDiscardedCount!=="number"){
    throw new WorkspaceV3Error("EINVAL","Unsupported/invalid PDF–MD sidecar");
  }
  validFile(doc.pdf);validFile(doc.ocr);validFile(doc.originalMd);
  if(doc.ocr.sha256!==doc.ocrSourceSha256)throw new WorkspaceV3Error("ESTALE","OCR source hash mismatch");
  for(const ch of doc.chapterVersions){
    if(!ch||typeof ch.chapterId!=="string"||!ch.chapterId)throw new WorkspaceV3Error("EINVAL","Invalid chapter key");
    validFile(ch.source);validFile(ch.working);
  }
  const seen=new Set<string>();
  const counts={ "candidate-complete":0,"candidate-partial":0,
    ambiguous:0,unmatched:0,unavailable:0 };
  for(const relation of doc.relations){
    if(typeof relation.elementId!=="string"||seen.has(relation.elementId)||
       !relation.elementId.startsWith("mineru:"+doc.ocrSourceSha256+":")||
       !Object.prototype.hasOwnProperty.call(counts,relation.matchStatus)||
       !Array.isArray(relation.pdfRegions)||relation.pdfRegions.length<1||
       !Array.isArray(relation.parts)||!Array.isArray(relation.chapters)||
       relation.manuallyVerified!==false){
      throw new WorkspaceV3Error("EINVAL","Malformed PDF–MD mapping relation");
    }
    seen.add(relation.elementId);
    counts[relation.matchStatus as MappingMatchStatus]++;
    for(const region of relation.pdfRegions){
      if(!region||!Array.isArray(region.pageSize)||!Array.isArray(region.bbox)||
         !Array.isArray(region.normalizedBBox)||
         !Number.isSafeInteger(region.pageIndex)||region.pageIndex<0||
         region.pdfPageNumber!==region.pageIndex+1||region.pageSize.length!==2||
         region.bbox.length!==4||!region.pageSize.every(Number.isFinite)||
         !region.bbox.every(Number.isFinite)||region.normalizedBBox.length!==4||
         !region.normalizedBBox.every(Number.isFinite)||
         region.normalizedBBox.some((n:number)=>n<0||n>1)){
        throw new WorkspaceV3Error("EINVAL","Malformed PDF region");
      }
      const [w,h]=region.pageSize,[x0,y0,x1,y1]=region.bbox;
      if(w<=0||h<=0||x0<0||y0<0||x0>x1||y0>y1||x1>w||y1>h)
        throw new WorkspaceV3Error("EINVAL","PDF region outside page");
    }
    for(const part of relation.parts){
      if(!part||!Number.isSafeInteger(part.partIndex)||part.partIndex<0||
         !Array.isArray(part.originalMdRangesUtf16)||
         !Array.isArray(part.originalMdFragmentEvidenceUtf16)||
         !Array.isArray(part.chapterAnchors)||!Array.isArray(part.workingAnchors))
        throw new WorkspaceV3Error("EINVAL","Invalid mapping part");
      const anchors=[...part.chapterAnchors,...part.workingAnchors];
      for(const anchor of anchors){
        if(!anchor||typeof anchor.chapterId!=="string"||
           !["unique","ambiguous","partial-evidence","not-found"].includes(anchor.state)||
           !Array.isArray(anchor.rangesUtf16)||!Array.isArray(anchor.fragmentEvidenceUtf16))
          throw new WorkspaceV3Error("EINVAL","Invalid file anchor");
        validFile(anchor);
      }
      const ranges=[...part.originalMdRangesUtf16,...part.originalMdFragmentEvidenceUtf16,
        ...anchors.flatMap(a=>[...a.rangesUtf16,...a.fragmentEvidenceUtf16])];
      if(ranges.some(range=>!Array.isArray(range)||range.length!==2||
         !Number.isSafeInteger(range[0])||!Number.isSafeInteger(range[1])||
         range[0]<0||range[1]<=range[0]))
        throw new WorkspaceV3Error("EINVAL","Invalid UTF-16 evidence range");
    }
  }
  if(!doc.summary||Object.keys(counts).some(k=>
    doc.summary[k as MappingMatchStatus]!==counts[k as MappingMatchStatus])){
    throw new WorkspaceV3Error("EINVAL","Sidecar status summary mismatch");
  }
}
export function encodePdfMdSidecar(value:PdfMdMappingSidecarV1):Uint8Array{
  validatePdfMdSidecar(value);
  // Compact JSON: real Mac Vault create-file has a 512 KiB limit.
  return new TextEncoder().encode(JSON.stringify(value));
}
export function decodePdfMdSidecar(bytes:Uint8Array):PdfMdMappingSidecarV1{
  let json:unknown;
  try{json=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));}
  catch{throw new WorkspaceV3Error("EINVAL","Invalid sidecar UTF-8/JSON");}
  validatePdfMdSidecar(json);
  return json;
}
export function sidecarSourceFiles(value:PdfMdMappingSidecarV1):MappingFileEvidence[]{
  validatePdfMdSidecar(value);
  const files=[value.pdf,value.ocr,value.originalMd,
    ...value.chapterVersions.flatMap(c=>[c.source,c.working])];
  const seen=new Map<string,string>();
  files.forEach(file=>{
    if(seen.has(file.path)&&seen.get(file.path)!==file.sha256)
      throw new WorkspaceV3Error("ECONFLICT","Contradictory source hash for "+file.path);
    seen.set(file.path,file.sha256);
  });
  return [...seen].map(([path,sha256])=>({path,sha256}));
}
