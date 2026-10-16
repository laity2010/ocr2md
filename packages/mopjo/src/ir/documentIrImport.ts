/** IR-WP2: lossless structured MinerU page JSON -> provisional Document IR.
 * Pure conversion — no file IO, no MinerU Markdown import, no chapter guesses.
 */
import { extractMineruElements,type MineruSourceElement,type MineruRawBlock } from "./mineruElementExtractor";
import { createHash } from "crypto";
import { DOCUMENT_IR_KIND,DOCUMENT_IR_VERSION,initialBlockId,validateDocumentIrV1,
  type DocumentIrV1,type IrPhysicalPage,type IrSourceElement,type IrJsonObject } from "./documentIrV1";

function hash(bytes:Uint8Array):string{return createHash("sha256").update(bytes).digest("hex");}
function sourceFile(path:string,sha256:string){return {path,sha256};}
function object(x:unknown):x is Record<string,unknown>{return Boolean(x)&&typeof x==="object"&&!Array.isArray(x);}
function cleanPath(path:string,name:string):string{
  if(typeof path!=="string"||!path.startsWith("/")||path==="/"||
     path.split("/").some(x=>x===".."||x===".")||path.includes("\\"))
    throw new Error(name+" must be a vault-rooted canonical file path");
  return path;
}
export interface IrMineruImportInput {
  readonly workspaceId:string;
  readonly pdf:{readonly path:string;readonly sha256:string};
  readonly ocrPath:string;
  /** Exact untouched original UTF-8 source bytes, not JSON.stringify(parsed). */
  readonly ocrBytes:Uint8Array;
}
export function importMineruDocumentIr(input:IrMineruImportInput):DocumentIrV1{
  const {workspaceId,pdf,ocrPath,ocrBytes}=input;
  if(!workspaceId.trim()||!/^[a-f0-9]{64}$/.test(pdf.sha256))throw Error("Invalid IR source identity");
  cleanPath(pdf.path,"PDF");cleanPath(ocrPath,"OCR JSON");
  if(pdf.path===ocrPath)throw Error("PDF and OCR must have different paths");
  const index=extractMineruElements(ocrBytes);
  const raw=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(ocrBytes)) as Record<string,unknown>;
  if(!object(raw)||!Array.isArray(raw.pdf_info))throw Error("Invalid MinerU root");
  const sourceMetadata:Record<string,unknown>={};
  for(const [key,val] of Object.entries(raw))if(key!=="pdf_info")sourceMetadata[key]=val;
  const sourceElements:IrSourceElement[]=[...index.bodyElements,...index.discardedElements];
  const pages:IrPhysicalPage[]=raw.pdf_info.map((p:unknown,pageIndex:number)=>{
    if(!object(p))throw Error("Invalid MinerU page " + pageIndex);
    const metadata:Record<string,unknown>={};
    for(const [key,value] of Object.entries(p)){
      if(!["page_idx","page_size","para_blocks","discarded_blocks","preproc_blocks"].includes(key))
        metadata[key]=value;
    }
    return {pageIndex,pdfPageNumber:pageIndex+1,
      pageSize:index.bodyElements.find(e=>e.pageIndex===pageIndex)?.pageSize??
        index.discardedElements.find(e=>e.pageIndex===pageIndex)?.pageSize??p.page_size as [number,number],
      pageMetadata:metadata,preprocBlocks:((p.preproc_blocks??[]) as unknown[]),
      bodyElementIds:index.bodyElements.filter(e=>e.pageIndex===pageIndex).map(e=>e.id),
      discardedElementIds:index.discardedElements.filter(e=>e.pageIndex===pageIndex).map(e=>e.id)};
  });
  const blocks=index.bodyElements.map((element:MineruSourceElement)=>({
    blockId:initialBlockId(element.id),
    type:element.type,
    /** Plain original OCR text, not yet normalized as final Markdown. */
    text:element.segments.map(s=>s.content??"").join(""),
    chapterId:null,readingOrder:null,status:"provisional" as const,audit:"unreviewed" as const,
    sources:[{elementId:element.id}],
  }));
  const doc:DocumentIrV1={kind:DOCUMENT_IR_KIND,schemaVersion:DOCUMENT_IR_VERSION,
    workspaceId,pdf:sourceFile(pdf.path,pdf.sha256),
    ocr:sourceFile(ocrPath,index.sourceSha256),sourceMetadata,
    importState:"page-import-provisional",pages,sourceElements,chapters:[],
    blocks,outputMarkdown:[],
    summary:{pages:pages.length,bodyElements:index.bodyElements.length,
      discardedElements:index.discardedElements.length,provisionalBlocks:blocks.length}};
  validateDocumentIrV1(doc);
  return doc;
}
/** Reassemble every MinerU JSON key and every raw source block.
 * Useful for proving a non-dropping transformation. Order/whitespace is not promised.
 */
export function reconstructMineruJsonFromIr(ir:DocumentIrV1):IrJsonObject{
  validateDocumentIrV1(ir);
  const elements=new Map(ir.sourceElements.map(e=>[e.id,e]));
  const pages=ir.pages.map(p=>({
    ...p.pageMetadata,
    preproc_blocks:p.preprocBlocks,
    discarded_blocks:p.discardedElementIds.map(id=>elements.get(id)!.rawBlock as MineruRawBlock),
    page_size:p.pageSize,page_idx:p.pageIndex,
    para_blocks:p.bodyElementIds.map(id=>elements.get(id)!.rawBlock as MineruRawBlock),
  }));
  return {...ir.sourceMetadata,pdf_info:pages};
}
/** PDF may be supplied as raw bytes to make the binding verifiable and MD-independent. */
export function importMineruDocumentIrFromBytes(workspaceId:string,pdfPath:string,pdfBytes:Uint8Array,
  ocrPath:string,ocrBytes:Uint8Array):DocumentIrV1{
  return importMineruDocumentIr({workspaceId,pdf:{path:pdfPath,sha256:hash(pdfBytes)},ocrPath,ocrBytes});
}
