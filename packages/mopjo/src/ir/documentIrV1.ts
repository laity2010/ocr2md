/** Document IR v1 — source-anchored logical document contract.
 * IR-WP1: schema/validation only. No file system access and no Markdown dependency.
 */
import { createHash } from "crypto";
import type { MineruBBox, MineruPageSize, MineruSourceElement } from "./mineruElementExtractor";

export const DOCUMENT_IR_FILENAME = "document-ir.v1.json";
export const DOCUMENT_IR_KIND = "ocr2md/document-ir" as const;
export const DOCUMENT_IR_VERSION = 1 as const;
export type IrCollection = "para_blocks" | "discarded_blocks";
export type IrHashRef = {readonly path: string; readonly sha256: string};
export type IrJsonObject = Readonly<Record<string, unknown>>;
export interface IrPhysicalPage {
  readonly pageIndex: number;
  readonly pdfPageNumber: number;
  readonly pageSize: MineruPageSize;
  /** Root JSON's other page keys, except the three original block collections. */
  readonly pageMetadata: IrJsonObject;
  /** PREPROCESSING EVIDENCE ONLY: do not count again as body logical blocks. */
  readonly preprocBlocks: readonly unknown[];
  readonly bodyElementIds: readonly string[];
  readonly discardedElementIds: readonly string[];
}
export interface IrSourceElement extends MineruSourceElement {}
/** No pointer: entire OCR element; with pointer: a fine-grained original segment.
 * Range indexes UTF-16 code units of that segment's content (future IR-WP3).
 */
export interface IrSourceSlice {
  readonly elementId: string;
  readonly segmentPointer?: string;
  readonly utf16Range?: readonly [number,number];
}
export interface IrChapter {
  readonly chapterId: string;
  readonly parentChapterId: string|null;
  readonly name: string;
  readonly order: number;
  /** Stable source block marking the beginning of this section. */
  readonly anchorBlockId?: string;
  readonly depth?: number;
  /** Automatic outline recognition never implies a human-approved chapter. */
  readonly status?: "provisional";
  /** Explicit user-assigned filename for root chapter projection, not original MD. */
  readonly fileName?: string;
}
export type IrAuditStatus = "unreviewed" | "verified" | "needs-correction";
export type IrBlockStatus = "provisional" | "structured";
/** Human transcription of a missing PDF heading: page evidence is honest but
 * there is no OCR source element and no invented PDF bbox. */
export interface IrManualHeading {
  readonly blockId:string;
  readonly afterBlockId:string;
  readonly pdfPageNumber:number;
  readonly method:"manual-pdf-page";
  readonly detail:string;
}
export interface IrManualText {
  readonly blockId:string;
  readonly afterBlockId:string;
  readonly pdfPageNumber:number;
  readonly method:"manual-pdf-page";
  readonly detail:string;
}
export interface IrLogicalBlock {
  /** Persisted independent identity: text edits/reordering NEVER change blockId. */
  readonly blockId: string;
  readonly type: string;
  readonly text: string;
  readonly chapterId: string|null;
  /** Not yet inferred from physical PDF order. */
  readonly readingOrder: number|null;
  readonly status: IrBlockStatus;
  readonly audit: IrAuditStatus;
  readonly sources: readonly IrSourceSlice[];
}
/** WP3 candidates are hypotheses only, not decisions. They refer to immutable OCR source IDs,
 * so a later block split/merge cannot make their evidence disappear. */
export type IrReconstructionCandidateKind = "cross-page-continuation"|"merge-prev-hint"|"multi-column-order"|"empty-ocr-text";
export interface IrReconstructionCandidate {
  readonly candidateId:string;
  readonly kind:IrReconstructionCandidateKind;
  readonly sourceElementIds:readonly string[];
  readonly reason:string;
  readonly evidence:IrJsonObject;
  readonly status:"needs-review";
}
export type IrReconstructionOperationKind = "split"|"merge"|"reorder"|"edit-text";
export interface IrReconstructionOperation {
  readonly operationId:string;
  readonly kind:IrReconstructionOperationKind;
  readonly originalBlockIds:readonly string[];
  readonly resultBlockIds:readonly string[];
  readonly detail:string;
  readonly mode:"explicit";
}
export interface IrReconstructionState {
  readonly schemaVersion:1;
  /** Tentative reading order, NOT proof of reading sequence correctness. */
  readonly orderBasis:"mineru-array-provisional"|"explicit-reordered";
  readonly candidates:readonly IrReconstructionCandidate[];
  readonly appliedOperations:readonly IrReconstructionOperation[];
}
export interface IrChapterBoundaryCandidate {
  readonly candidateId:string;
  readonly headingBlockId:string;
  readonly sourceElementIds:readonly string[];
  readonly pageNumber:number;
  readonly proposedRole:"root"|"section"|"uncertain";
  readonly reason:string;
  readonly status:"needs-review"|"confirmed";
  readonly reviewReason?:string;
}
export interface IrChapterEditOperation {
  readonly operationId:string;
  readonly kind:"move-boundary"|"promote-heading"|"demote-section"|"rename"|"classify-heading"|"assign-file"|"assign-sequence"|"insert-manual-title"|"delete-manual-title"|"demote-ocr-title";
  readonly chapterIds:readonly string[];
  readonly detail:string;
  readonly mode:"explicit";
}
export interface IrChapterStructureState {
  readonly schemaVersion:1;
  readonly method:"ocr-title-provisional";
  readonly candidates:readonly IrChapterBoundaryCandidate[];
  readonly operations:readonly IrChapterEditOperation[];
}
export interface DocumentIrV1 {
  readonly kind: typeof DOCUMENT_IR_KIND;
  readonly schemaVersion: typeof DOCUMENT_IR_VERSION;
  readonly workspaceId: string;
  readonly pdf: IrHashRef;
  readonly ocr: IrHashRef;
  /** All root keys other than pdf_info, including MinerU version/backend flags. */
  readonly sourceMetadata: IrJsonObject;
  readonly importState: "page-import-provisional" | "logical-review";
  readonly pages: readonly IrPhysicalPage[];
  /** Includes EVERY para_blocks and discarded_blocks source element. */
  readonly sourceElements: readonly IrSourceElement[];
  readonly chapters: readonly IrChapter[];
  readonly blocks: readonly IrLogicalBlock[];
  /** Optional v1 extension. Does not modify/reconstruct any original OCR JSON. */
  readonly manualHeadings?: readonly IrManualHeading[];
  readonly manualTexts?: readonly IrManualText[];
  /** File cuts independent of chapter depths; entries override the legacy root defaults. */
  readonly chapterFileLayout?: readonly {
    readonly blockId:string;
    readonly standalone:boolean;
    readonly fileName?:string;
  }[];
  /** Present only after IR-WP3; never populated with fictitious human decisions. */
  readonly reconstruction?: IrReconstructionState;
  /** WP4 chapter tree; not present until OCR-only chapter proposal is run. */
  readonly chapterStructure?: IrChapterStructureState;
  /** No output MD or fake MD offsets in IR-WP2. */
  readonly outputMarkdown: readonly {readonly chapterId:string;readonly path:string;readonly sha256:string}[];
  readonly summary: {readonly pages:number;readonly bodyElements:number;readonly discardedElements:number;readonly provisionalBlocks:number};
}
/** Only basename of a chapter Markdown file, never arbitrary paths. */
export function validIrChapterFileName(value:string):boolean {
  return typeof value==="string"&&value.length>=4&&value.length<=120&&
    value.endsWith(".md")&&!/[\x00-\x1f\/\\:*?"<>|]/u.test(value)&&
    !value.startsWith(".")&&!value.endsWith(" ")&&!value.includes("..")&&
    value.slice(0,-3).trim().length>0;
}
export class DocumentIrValidationError extends Error {
  constructor(readonly pointer:string,message:string){
    super(`Document IR ${pointer}: ${message}`);this.name="DocumentIrValidationError";
  }
}
function fail(pointer:string,message:string):never {throw new DocumentIrValidationError(pointer,message);}
function obj(value:unknown,pointer:string):Record<string,unknown>{
  if(!value||typeof value!=="object"||Array.isArray(value))fail(pointer,"must be an object");
  return value as Record<string,unknown>;
}
function isHash(hash:unknown):hash is string{return typeof hash==="string"&&/^[0-9a-f]{64}$/.test(hash);}
function validFile(r:unknown,p:string):asserts r is IrHashRef{
  const ref=obj(r,p);
  if(typeof ref.path!=="string"||!ref.path.startsWith("/")||
     ref.path==="/"||ref.path.split("/").some(x=>x===".."||x===".")||
     !isHash(ref.sha256))fail(p,"must have a canonical absolute logical file path and SHA-256");
}
function bbox(b:unknown,size:MineruPageSize,p:string):asserts b is MineruBBox{
  if(!Array.isArray(b)||b.length!==4||b.some(v=>typeof v!=="number"||!Number.isFinite(v))||
     b[0]<0||b[1]<0||b[2]<b[0]||b[3]<b[1]||b[2]>size[0]||b[3]>size[1])
    fail(p,"invalid visual-page bbox");
}
function pageSize(v:unknown,p:string):asserts v is MineruPageSize{
  if(!Array.isArray(v)||v.length!==2||v.some(x=>typeof x!=="number"||!Number.isFinite(x)||x<=0))
    fail(p,"invalid pageSize");
}
/** Validate strict provenance, collection coverage, references, and provisional discipline. */
export function validateDocumentIrV1(v:unknown):asserts v is DocumentIrV1{
  const doc=obj(v,"/");
  if(doc.kind!==DOCUMENT_IR_KIND||doc.schemaVersion!==DOCUMENT_IR_VERSION||
     typeof doc.workspaceId!=="string"||!doc.workspaceId.trim()||
     !["page-import-provisional","logical-review"].includes(String(doc.importState)))
    fail("/","unsupported IR version or workspace");
  validFile(doc.pdf,"/pdf");validFile(doc.ocr,"/ocr");
  const source=obj(doc.sourceMetadata,"/sourceMetadata");
  if("pdf_info" in source)fail("/sourceMetadata/pdf_info","must be represented by pages/sourceElements");
  if(!Array.isArray(doc.pages)||doc.pages.length===0||!Array.isArray(doc.sourceElements)||
     !Array.isArray(doc.blocks)||!Array.isArray(doc.chapters)||!Array.isArray(doc.outputMarkdown))
    fail("/","missing pages, elements, blocks, chapters or outputMarkdown");
  const pages=doc.pages as IrPhysicalPage[];
  const pageIds=new Set<string>();
  pages.forEach((page,i)=>{
    if(!page||page.pageIndex!==i||page.pdfPageNumber!==i+1)
      fail(`/pages/${i}`,"page index must be consecutive, one-based PDF number must agree");
    pageSize(page.pageSize,`/pages/${i}/pageSize`);
    const meta=obj(page.pageMetadata,`/pages/${i}/pageMetadata`);
    for(const reserved of ["page_idx","page_size","para_blocks","discarded_blocks","preproc_blocks"])
      if(reserved in meta)fail(`/pages/${i}/pageMetadata`,"reserved MinerU key must not be duplicated");
    if(!Array.isArray(page.preprocBlocks)||!Array.isArray(page.bodyElementIds)||
       !Array.isArray(page.discardedElementIds))fail(`/pages/${i}`,"missing original source arrays");
    for(const id of [...page.bodyElementIds,...page.discardedElementIds]){
      if(typeof id!=="string"||pageIds.has(id))fail(`/pages/${i}`,"missing or repeated element ID");
      pageIds.add(id);
    }
  });
  const sourceElements=doc.sourceElements as IrSourceElement[];
  const elements=new Map<string,IrSourceElement>();
  let body=0,discarded=0;
  for(let i=0;i<sourceElements.length;i++){
    const e=sourceElements[i],p=`/sourceElements/${i}`;
    if(!e||!Number.isSafeInteger(e.pageIndex)||e.pageIndex<0||e.pageIndex>=pages.length||
       e.pdfPageNumber!==e.pageIndex+1||
       !["para_blocks","discarded_blocks"].includes(e.collection)||
       !Number.isSafeInteger(e.collectionPosition)||e.collectionPosition<0||
       e.sourceSha256!==doc.ocr.sha256||
       e.jsonPointer!==`/pdf_info/${e.pageIndex}/${e.collection}/${e.collectionPosition}`||
       e.id!==`mineru:${doc.ocr.sha256}:p${e.pageIndex}:${e.collection}:${e.collectionPosition}`||
       elements.has(e.id)||!pageIds.has(e.id))fail(p,"invalid/duplicate provenance identity");
    const pg=pages[e.pageIndex],ids=e.collection==="para_blocks"?pg.bodyElementIds:pg.discardedElementIds;
    if(ids[e.collectionPosition]!==e.id||e.pageSize[0]!==pg.pageSize[0]||e.pageSize[1]!==pg.pageSize[1])
      fail(p,"physical page collection or page size mismatch");
    bbox(e.bbox,pg.pageSize,p+"/bbox");
    if(!Array.isArray(e.normalizedBBox)||e.normalizedBBox.length!==4||
       e.normalizedBBox.some((v,j)=>Math.abs(v-e.bbox[j]/pg.pageSize[j%2])>1e-12))
      fail(p+"/normalizedBBox","invalid normalized visual coordinates");
    if(!Array.isArray(e.segments)||!isHash(e.normalizedContentSha256))
      fail(p,"invalid OCR segment index or fingerprint");
    const raw=obj(e.rawBlock,p+"/rawBlock");
    if(raw.type!==e.type||JSON.stringify(raw.bbox)!==JSON.stringify(e.bbox))
      fail(p,"raw OCR evidence must agree with indexed type and bbox");
    for(const [j,segment] of e.segments.entries()){
      if(!segment||typeof segment.jsonPointer!=="string"||
         !segment.jsonPointer.startsWith(e.jsonPointer+"/")||
         ![segment.content,segment.html,segment.imagePath].some(v=>typeof v==="string"))
        fail(`${p}/segments/${j}`,"invalid segment provenance");
    }
    elements.set(e.id,e);if(e.collection==="para_blocks")body++;else discarded++;
  }
  if(elements.size!==pageIds.size)fail("/sourceElements","some source element not indexed");
  const chapters=new Map<string,IrChapter>();
  for(const [i,ch] of (doc.chapters as IrChapter[]).entries()){
    if(!ch||!ch.chapterId||typeof ch.name!=="string"||
       !Number.isSafeInteger(ch.order)||chapters.has(ch.chapterId))fail(`/chapters/${i}`,"invalid chapter");
    chapters.set(ch.chapterId,ch);
  }
  for(const ch of chapters.values()){
    if(ch.parentChapterId!==null&&!chapters.has(ch.parentChapterId))
      fail("/chapters","unknown parent chapter");
  }
  const manualHeadings=doc.manualHeadings===undefined?[]:doc.manualHeadings;
  if(!Array.isArray(manualHeadings))fail("/manualHeadings","must be an array");
  const manual=new Map<string,IrManualHeading>();
  for(const [i,m] of (manualHeadings as IrManualHeading[]).entries()){
    if(!m||typeof m.blockId!=="string"||!/^blk_[0-9a-f]{24}$/.test(m.blockId)||
       manual.has(m.blockId)||m.method!=="manual-pdf-page"||
       typeof m.afterBlockId!=="string"||m.afterBlockId===m.blockId||
       !Number.isSafeInteger(m.pdfPageNumber)||m.pdfPageNumber<1||m.pdfPageNumber>pages.length||
       typeof m.detail!=="string"||!m.detail.trim())
      fail(`/manualHeadings/${i}`,"invalid manual PDF page source");
    manual.set(m.blockId,m);
  }
  if(doc.importState!=="logical-review"&&manual.size)fail("/manualHeadings","requires logical review");
  const manualTexts=doc.manualTexts===undefined?[]:doc.manualTexts;
  if(!Array.isArray(manualTexts))fail("/manualTexts","must be an array");
  const transcribed=new Map<string,IrManualText>();
  for(const [i,m] of (manualTexts as IrManualText[]).entries()){
    if(!m||typeof m.blockId!=="string"||!/^blk_[0-9a-f]{24}$/.test(m.blockId)||
       transcribed.has(m.blockId)||manual.has(m.blockId)||m.method!=="manual-pdf-page"||
       typeof m.afterBlockId!=="string"||m.afterBlockId===m.blockId||
       !Number.isSafeInteger(m.pdfPageNumber)||m.pdfPageNumber<1||m.pdfPageNumber>pages.length||
       typeof m.detail!=="string"||!m.detail.trim())
      fail(`/manualTexts/${i}`,"invalid manually transcribed PDF body");
    transcribed.set(m.blockId,m);
  }

  const fileLayout=doc.chapterFileLayout??[];
  if(!Array.isArray(fileLayout))fail("/chapterFileLayout","must be an array");
  const seenLayout=new Set<string>();
  for(const [i,entry] of fileLayout.entries()){
    if(!entry||typeof entry.blockId!=="string"||seenLayout.has(entry.blockId)||
      typeof entry.standalone!=="boolean"||
      (entry.fileName!==undefined&&!validIrChapterFileName(entry.fileName)))
      fail(`/chapterFileLayout/${i}`,"invalid file-only boundary or file name");
    seenLayout.add(entry.blockId);
  }
  const blocks=doc.blocks as IrLogicalBlock[],blockIds=new Set<string>();
  const sourceUse=new Map<string,number>();let provisional=0;
  for(const [i,block] of blocks.entries()){
    const p=`/blocks/${i}`;
    if(!block||typeof block.blockId!=="string"||!/^blk_[0-9a-f]{24}$/.test(block.blockId)||
       blockIds.has(block.blockId)||typeof block.type!=="string"||!block.type||
       typeof block.text!=="string"||
       (block.chapterId!==null&&!chapters.has(block.chapterId))||
       (block.readingOrder!==null&&(!Number.isSafeInteger(block.readingOrder)||block.readingOrder<0))||
       !["provisional","structured"].includes(block.status)||
       !["unreviewed","verified","needs-correction"].includes(block.audit)||
       !Array.isArray(block.sources)||
       (block.sources.length===0&&!(manual.has(block.blockId)&&block.type==="title")&&
         !(transcribed.has(block.blockId)&&block.type==="text"))||
       (block.sources.length>0&&(manual.has(block.blockId)||transcribed.has(block.blockId))))
      fail(p,"invalid logical block, chapter or audit state");
    blockIds.add(block.blockId);
    if(block.status==="provisional")provisional++;
    for(const [j,ref] of block.sources.entries()){
      const source=elements.get(ref?.elementId),rp=`${p}/sources/${j}`;
      if(!source||source.collection!=="para_blocks")fail(rp,"block must cite a body OCR source");
      sourceUse.set(source.id,(sourceUse.get(source.id)||0)+1);
      if(ref.segmentPointer!==undefined){
        const seg=source.segments.find(s=>s.jsonPointer===ref.segmentPointer);
        if(!seg)fail(rp,"unknown segment pointer");
        if(ref.utf16Range){
          const field=seg.content??seg.html;
          const [from,to]=ref.utf16Range;
          if(typeof field!=="string"||!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||
             from<0||to<=from||to>field.length)fail(rp,"invalid segment UTF-16 range");
        }
      }else if(ref.utf16Range!==undefined)fail(rp,"range needs a segmentPointer");
    }
  }
  for(const [i,entry] of fileLayout.entries()){
    if(!blocks.some(b=>b.blockId===entry.blockId&&b.type==="title"))
      fail(`/chapterFileLayout/${i}`,"file boundary requires an existing title");
  }
  if(manual.size||transcribed.size){
    const positions=new Map(blocks.map(b=>[b.blockId,b.readingOrder]));
    for(const [id,entry] of [...manual,...transcribed]){
      if(!positions.has(id)||!positions.has(entry.afterBlockId)||
        positions.get(entry.afterBlockId)!>=positions.get(id)!)
        fail("/manualHeadings","manual insertion must follow an existing source-anchored block");
    }
  }
  if(doc.importState==="logical-review"){
    const rec=obj(doc.reconstruction,"/reconstruction");
    if(rec.schemaVersion!==1||!["mineru-array-provisional","explicit-reordered"].includes(String(rec.orderBasis))||
       !Array.isArray(rec.candidates)||!Array.isArray(rec.appliedOperations))
      fail("/reconstruction","invalid WP3 reconstruction metadata");
    const candidateIds=new Set<string>();
    (rec.candidates as IrReconstructionCandidate[]).forEach((c,i)=>{
      if(!c||typeof c.candidateId!=="string"||candidateIds.has(c.candidateId)||
         !["cross-page-continuation","merge-prev-hint","multi-column-order","empty-ocr-text"].includes(c.kind)||
         c.status!=="needs-review"||typeof c.reason!=="string"||!c.reason||
         !Array.isArray(c.sourceElementIds)||!c.sourceElementIds.length||
         c.sourceElementIds.some(id=>!elements.has(id)))fail(`/reconstruction/candidates/${i}`,"invalid proposal");
      obj(c.evidence,`/reconstruction/candidates/${i}/evidence`);
      candidateIds.add(c.candidateId);
    });
    const operationIds=new Set<string>();
    (rec.appliedOperations as IrReconstructionOperation[]).forEach((op,i)=>{
      if(!op||typeof op.operationId!=="string"||operationIds.has(op.operationId)||
         !["split","merge","reorder","edit-text"].includes(op.kind)||op.mode!=="explicit"||
         !Array.isArray(op.originalBlockIds)||!op.originalBlockIds.length||
         !Array.isArray(op.resultBlockIds)||!op.resultBlockIds.length||typeof op.detail!=="string")
        fail(`/reconstruction/appliedOperations/${i}`,"invalid operation log");
      operationIds.add(op.operationId);
    });
    const assigned=new Set<number>();
    blocks.forEach((block,i)=>{
      if(block.readingOrder===null||assigned.has(block.readingOrder))
        fail(`/blocks/${i}/readingOrder`,"WP3 must record a unique provisional reading order");
      assigned.add(block.readingOrder);
    });
    if(blocks.some(b=>b.readingOrder===null||b.readingOrder>=blocks.length)||
       blocks.some(b=>b.audit!=="unreviewed")||doc.outputMarkdown.length!==0||
       (doc.chapterStructure===undefined&&doc.chapters.length!==0))
      fail("/blocks","WP3 cannot mint human verification, chapters, or Markdown files");
    // Every body element must survive exactly once, or be covered by non-overlapping,
    // gap-free UTF-16 text segment slices after an explicit split.
    for(const element of sourceElements.filter(e=>e.collection==="para_blocks")){
      const refs=blocks.flatMap(b=>b.sources.filter(ref=>ref.elementId===element.id));
      if(!refs.length)fail("/blocks","lost source element "+element.id);
      if(refs.length===1&&!refs[0].segmentPointer)continue;
      if(refs.some(ref=>!ref.segmentPointer||!ref.utf16Range))
        fail("/blocks","mixed full and partial source coverage");
      const sourceSegments=element.segments.filter(s=>typeof s.content==="string"&&s.content.length>0);
      if(sourceSegments.length===0||element.segments.some(s=>s.html!==undefined||s.imagePath!==undefined))
        fail("/blocks","cannot split source containing rich non-text content");
      for(const seg of sourceSegments){
        const slices=refs.filter(r=>r.segmentPointer===seg.jsonPointer)
          .map(r=>r.utf16Range!)
          .sort((a,b)=>a[0]-b[0]);
        let position=0;
        for(const [from,to] of slices){
          if(from!==position)fail("/blocks","split has a gap or overlap");
          position=to;
        }
        if(position!==seg.content!.length)fail("/blocks","missing OCR content after split");
      }
      if(refs.some(r=>!sourceSegments.some(seg=>seg.jsonPointer===r.segmentPointer)))
        fail("/blocks","partial source points outside actual text segments");
    }
  }
  if(doc.chapterStructure!==undefined){
    if(doc.importState!=="logical-review")fail("/chapterStructure","requires WP3 logical review mode");
    const structure=obj(doc.chapterStructure,"/chapterStructure");
    if(structure.schemaVersion!==1||structure.method!=="ocr-title-provisional"||
       !Array.isArray(structure.candidates)||!Array.isArray(structure.operations)||!chapters.size)
      fail("/chapterStructure","invalid chapter tree metadata");
    const positions=new Map(blocks.map(b=>[b.blockId,b.readingOrder!]));
    const anchors=new Map<number,IrChapter>();
    const chapterOrders=new Set<number>();
    const fileNames=new Set<string>();
    for(const [i,ch] of (doc.chapters as IrChapter[]).entries()){
      if(typeof ch.anchorBlockId!=="string"||!positions.has(ch.anchorBlockId)||
         !Number.isSafeInteger(ch.depth)||ch.depth!<1||ch.depth!>6||
         ch.status!=="provisional"||
         chapterOrders.has(ch.order))fail(`/chapters/${i}`,"invalid chapter boundary/level/order");
      chapterOrders.add(ch.order);
      if(ch.fileName!==undefined){
        if(ch.depth!==1||!validIrChapterFileName(ch.fileName)||
           fileNames.has(ch.fileName.toLocaleLowerCase()))
          fail(`/chapters/${i}/fileName`,"unsafe, duplicated or non-root MD filename");
        fileNames.add(ch.fileName.toLocaleLowerCase());
      }
      const pos=positions.get(ch.anchorBlockId)!;
      if(anchors.has(pos))fail(`/chapters/${i}`,"repeated chapter boundary");
      anchors.set(pos,ch);
      if(ch.parentChapterId===null&&ch.depth!==1 || ch.parentChapterId!==null&&
         chapters.get(ch.parentChapterId)!.depth!==ch.depth!-1)
        fail(`/chapters/${i}`,"parent and child depth mismatch");
    }
    if(!anchors.has(0))fail("/chapters","every block requires a starting root section");
    const ordered=[...anchors.entries()].sort((a,b)=>a[0]-b[0]);
    if(ordered.some(([_,chapter],index)=>chapter.order!==index))
      fail("/chapters","chapter order must match source block boundaries");
    const active=new Map<number,IrChapter>();
    let ix=0;
    for(const b of [...blocks].sort((a,b)=>a.readingOrder!-b.readingOrder!)){
      while(ix<ordered.length&&ordered[ix][0]===b.readingOrder){
        const ch=ordered[ix][1];
        if(ch.depth!>1 && active.get(ch.depth!-1)?.chapterId!==ch.parentChapterId)
          fail("/chapters","chapter child outside parent boundary");
        for(const depth of [...active.keys()])if(depth>=ch.depth!)active.delete(depth);
        active.set(ch.depth!,ch);ix++;
      }
      const assigned=active.get(Math.max(...active.keys()));
      if(!assigned||b.chapterId!==assigned.chapterId)
        fail("/blocks","chapter membership must follow contiguous source block boundaries");
    }
    if(ix!==ordered.length)fail("/chapters","unused chapter boundary");
    for(const [i,c] of (structure.candidates as IrChapterBoundaryCandidate[]).entries()){
      if(!c||typeof c.candidateId!=="string"||typeof c.headingBlockId!=="string"||
         !positions.has(c.headingBlockId)||!Array.isArray(c.sourceElementIds)||
         (c.sourceElementIds.length===0&&!manual.has(c.headingBlockId))||
         (c.sourceElementIds.length>0&&manual.has(c.headingBlockId))||
         c.sourceElementIds.some(id=>!elements.has(id))||
         !["root","section","uncertain"].includes(c.proposedRole)||
         !Number.isSafeInteger(c.pageNumber)||c.pageNumber<1||c.pageNumber>pages.length||
         !["needs-review","confirmed"].includes(c.status)||
         (c.status==="confirmed"?typeof c.reviewReason!=="string"||!c.reviewReason.trim():c.reviewReason!==undefined)||
         typeof c.reason!=="string"||!c.reason||
         (manual.has(c.headingBlockId)?
           manual.get(c.headingBlockId)!.pdfPageNumber!==c.pageNumber:
           elements.get(c.sourceElementIds[0])?.pdfPageNumber!==c.pageNumber)||
         c.sourceElementIds.some(id=>!blocks.find(b=>b.blockId===c.headingBlockId)?.sources.some(r=>r.elementId===id)))
        fail(`/chapterStructure/candidates/${i}`,"invalid chapter boundary candidate");
    }
    const proposalIds=(structure.candidates as IrChapterBoundaryCandidate[]).map(c=>c.candidateId);
    if(new Set(proposalIds).size!==proposalIds.length)fail("/chapterStructure/candidates","duplicate candidate ID");
    for(const [i,op] of (structure.operations as IrChapterEditOperation[]).entries()){
      if(!op||typeof op.operationId!=="string"||!["move-boundary","promote-heading","demote-section","rename","classify-heading","assign-file","assign-sequence","insert-manual-title","delete-manual-title","demote-ocr-title"].includes(op.kind)||
         !Array.isArray(op.chapterIds)||!op.chapterIds.length||typeof op.detail!=="string"||!op.detail||op.mode!=="explicit")
        fail(`/chapterStructure/operations/${i}`,"invalid chapter edit log");
    }
  }else if(doc.chapters.length!==0)fail("/chapters","chapters require chapterStructure metadata");
  if(doc.importState==="page-import-provisional"){
    if(doc.reconstruction!==undefined||doc.chapterStructure!==undefined)
      fail("/reconstruction","import cannot predeclare review metadata");
    if(doc.chapters.length!==0||doc.outputMarkdown.length!==0||blocks.length!==body||provisional!==body||
       blocks.some(b=>b.chapterId!==null||b.readingOrder!==null||b.audit!=="unreviewed")||
       [...sourceUse.values()].some(count=>count!==1)||sourceUse.size!==body||
       blocks.some(b=>b.sources.length!==1||b.sources[0].segmentPointer!==undefined))
      fail("/blocks","provisional import may not infer chapter/order/review or merge/split");
  }
  const sum=obj(doc.summary,"/summary");
  if(sum.pages!==pages.length||sum.bodyElements!==body||sum.discardedElements!==discarded||
     sum.provisionalBlocks!==provisional)
    fail("/summary","import counts inconsistent with elements and blocks");
}
export function encodeDocumentIrV1(doc:DocumentIrV1):Uint8Array{
  validateDocumentIrV1(doc);
  return new TextEncoder().encode(JSON.stringify(doc,null,2)+"\n");
}
/** Stable seed for first import only; later block edits persist the same ID. */
export function initialBlockId(sourceId:string):string{
  return "blk_"+createHash("sha256").update("ocr2md:initial-ir-block:v1\0"+sourceId).digest("hex").slice(0,24);
}
