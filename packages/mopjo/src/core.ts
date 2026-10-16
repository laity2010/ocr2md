/** MOPJO WP2: original readonly DIRjson + append-only operation JSON + Markdown projection.
 * All persistence belongs to the external CLI. PDF is immutable evidence.
 */
import {createHash} from 'node:crypto';
import {importMineruDocumentIrFromBytes} from './ir/documentIrImport';
import {proposeIrReconstruction} from './ir/documentIrReconstruction';
import {proposeIrChapters} from './ir/documentIrChapters';
import {encodeDocumentIrV1,validateDocumentIrV1,type DocumentIrV1} from './ir/documentIrV1';
import {generateIrWholeBookMarkdown,type IrMarkdownChapterFile} from './ir/documentIrMarkdown';
import {applyDirSourceChange,parseDirSourceChange} from './ir/dirSourceEditing';
import {applyStructural,type EditRequest} from './operations';
import {indexElements,type ElementView} from './elements';
export type {EditRequest,ElementView};

export const sha256=(data:string|Uint8Array):string=>createHash('sha256').update(data).digest('hex');
export const MOPJO_DELTA_KIND='mopjo/operations' as const;
type Versioned={readonly id:string;readonly beforeStateSha256:string;readonly afterStateSha256:string};
export type MarkdownOperation=Versioned&{
  readonly kind:'replace-block-markdown';readonly blockId:string;
  readonly beforeMarkdown:string;readonly afterMarkdown:string;
};
export type StructuralOperation=Versioned&EditRequest&{readonly insertedId?:string};
export type Operation=MarkdownOperation|StructuralOperation;
export interface DeltaV1 {
  readonly kind:typeof MOPJO_DELTA_KIND;readonly schemaVersion:1;
  readonly originalDirSha256:string;readonly pdfSha256:string;
  readonly operations:readonly Operation[];
}
export type OpenedDocument={
  readonly original:DocumentIrV1;readonly delta:DeltaV1;
  readonly current:DocumentIrV1;readonly markdown:IrMarkdownChapterFile;
  readonly suppressedBlockIds:readonly string[];
};
const docSha=(doc:DocumentIrV1)=>sha256(encodeDocumentIrV1(doc));
const hex64=/^[a-f0-9]{64}$/u;
const stateSha=(doc:DocumentIrV1,suppressed:readonly string[])=>
  suppressed.length?sha256(docSha(doc)+'\0hidden\0'+[...suppressed].sort().join('\0')):docSha(doc);

/** The original imported baseline remains immutable. */
export function importOriginal(mineruBytes:Uint8Array,pdfBytes:Uint8Array,
  logicalPdfPath:string,logicalMineruPath:string):DocumentIrV1 {
  const imported=importMineruDocumentIrFromBytes('mopjo',logicalPdfPath,pdfBytes,logicalMineruPath,mineruBytes);
  return proposeIrChapters(proposeIrReconstruction(imported));
}
export function emptyDelta(original:DocumentIrV1):DeltaV1 {
  validateDocumentIrV1(original);
  return {kind:MOPJO_DELTA_KIND,schemaVersion:1,originalDirSha256:docSha(original),
    pdfSha256:original.pdf.sha256,operations:[]};
}
function assertDelta(value:unknown):asserts value is DeltaV1 {
  if(!value||typeof value!=='object')throw Error('MOPJO DELTA_INVALID');
  const d=value as DeltaV1;
  if(d.kind!==MOPJO_DELTA_KIND||d.schemaVersion!==1||!hex64.test(d.originalDirSha256)||
    !hex64.test(d.pdfSha256)||!Array.isArray(d.operations)||d.operations.length>10000)
    throw Error('MOPJO DELTA_INVALID');
  const ids=new Set<string>();
  for(const op of d.operations){
    if(!op||!['replace-block-markdown','suppress-block','restore-block','insert-manual-text',
      'split-text','merge-text'].includes(op.kind)||typeof op.id!=='string'||!/^op_[0-9a-f]{24}$/u.test(op.id)||
      ids.has(op.id)||!hex64.test(op.beforeStateSha256)||!hex64.test(op.afterStateSha256))
      throw Error('MOPJO OP_INVALID');
    ids.add(op.id);
    if(op.kind==='replace-block-markdown'&&(
      typeof op.blockId!=='string'||typeof op.beforeMarkdown!=='string'||
      typeof op.afterMarkdown!=='string'))throw Error('MOPJO OP_INVALID');
    if(op.kind!=='replace-block-markdown'){
      const e=op as StructuralOperation;
      if((e.kind==='suppress-block'||e.kind==='restore-block'||e.kind==='split-text')&&
         typeof e.blockId!=='string')throw Error('MOPJO OP_INVALID');
      if(e.kind==='insert-manual-text'&&(
        typeof e.afterBlockId!=='string'||typeof e.text!=='string'||
        !Number.isSafeInteger(e.pdfPageNumber)||typeof e.detail!=='string'||
        typeof e.insertedId!=='string'))throw Error('MOPJO OP_INVALID');
      if(e.kind==='merge-text'&&(typeof e.leftBlockId!=='string'||
        typeof e.rightBlockId!=='string'||typeof e.detail!=='string'))throw Error('MOPJO OP_INVALID');
      if(e.kind==='split-text'&&(!Number.isSafeInteger(e.offset)||typeof e.detail!=='string'))
        throw Error('MOPJO OP_INVALID');
    }
  }
}
function projection(doc:DocumentIrV1,suppressed:readonly string[]):IrMarkdownChapterFile {
  const file=generateIrWholeBookMarkdown(doc);
  if(!suppressed.length)return file;
  const hidden=new Set(suppressed);
  const ranges:typeof file.ranges[number][]=[];
  let content='';
  for(const range of file.ranges){
    if(hidden.has(range.blockId))continue;
    const from=content.length;
    content+=file.content.slice(range.from,range.to);
    const shift=from-range.from;
    ranges.push({...range,from,to:content.length,
      contentFrom:range.contentFrom+shift,contentTo:range.contentTo+shift});
  }
  if(!ranges.length)throw Error('MOPJO EMPTY_VISIBLE_DOCUMENT');
  return {...file,content,ranges,sha256:sha256(content)};
}
function blockContent(file:IrMarkdownChapterFile,blockId:string):string {
  const range=file.ranges.find(r=>r.blockId===blockId);
  if(!range)throw Error('MOPJO BLOCK_NOT_VISIBLE: '+blockId);
  return file.content.slice(range.contentFrom,range.contentTo);
}
function replaceOne(doc:DocumentIrV1,file:IrMarkdownChapterFile,
  blockId:string,beforeMarkdown:string,afterMarkdown:string):DocumentIrV1 {
  const range=file.ranges.find(r=>r.blockId===blockId);
  if(!range||blockContent(file,blockId)!==beforeMarkdown)
    throw Error('MOPJO STALE_BLOCK: '+blockId);
  const changed=file.content.slice(0,range.contentFrom)+afterMarkdown+file.content.slice(range.contentTo);
  return applyDirSourceChange(doc,file,changed);
}
function newOpId(opened:OpenedDocument,kind:string,payload:string):string {
  return 'op_'+sha256(opened.delta.operations.length+'\0'+stateSha(opened.current,opened.suppressedBlockIds)+
    '\0'+kind+'\0'+payload).slice(0,24);
}
function assemble(original:DocumentIrV1,delta:DeltaV1,current:DocumentIrV1,
  hidden:readonly string[]):OpenedDocument {
  return {original,delta,current,suppressedBlockIds:[...hidden],markdown:projection(current,hidden)};
}
/** Re-opening validates the PDF and replays every operation with pre-/post-hashes. */
export function open(original:DocumentIrV1,delta:unknown,pdfBytes:Uint8Array):OpenedDocument {
  validateDocumentIrV1(original);assertDelta(delta);
  if(docSha(original)!==delta.originalDirSha256)throw Error('MOPJO BASELINE_CHANGED');
  if(delta.pdfSha256!==original.pdf.sha256||sha256(pdfBytes)!==original.pdf.sha256)
    throw Error('MOPJO PDF_CHANGED');
  let current=original,hidden:readonly string[]=[];
  for(const op of delta.operations){
    if(stateSha(current,hidden)!==op.beforeStateSha256)throw Error('MOPJO OP_STALE: '+op.id);
    if(op.kind==='replace-block-markdown')current=replaceOne(current,
      projection(current,hidden),op.blockId,op.beforeMarkdown,op.afterMarkdown);
    else{
      const output=applyStructural(current,hidden,op,op.kind==='insert-manual-text'?op.insertedId:undefined);
      if(op.kind==='insert-manual-text'&&output.insertedId!==op.insertedId)
        throw Error('MOPJO INSERT_ID_MISMATCH');
      current=output.current;hidden=output.hidden;
    }
    if(stateSha(current,hidden)!==op.afterStateSha256)
      throw Error('MOPJO OP_RESULT_MISMATCH: '+op.id);
  }
  return assemble(original,delta,current,hidden);
}
/** WP1-compatible Markdown editing: one unambiguous anchored block per operation. */
export function applyMarkdownEdit(opened:OpenedDocument,changedMarkdown:string):OpenedDocument {
  const {markdown,current}=opened;
  if(changedMarkdown===markdown.content)return opened;
  const parsed=parseDirSourceChange(markdown,changedMarkdown);
  const changed=parsed.filter((item,i)=>item.source!==markdown.content.slice(
    markdown.ranges[i].contentFrom,markdown.ranges[i].contentTo));
  if(changed.length!==1)throw Error('MOPJO EDIT_REQUIRES_ONE_ANCHORED_BLOCK');
  const {blockId,source}=changed[0],before=blockContent(markdown,blockId);
  const next=replaceOne(current,markdown,blockId,before,source);
  const afterSha=stateSha(next,opened.suppressedBlockIds);
  if(afterSha===stateSha(current,opened.suppressedBlockIds))throw Error('MOPJO EDIT_HAS_NO_EFFECT');
  const op:MarkdownOperation={kind:'replace-block-markdown',
    id:newOpId(opened,'replace-block-markdown',blockId+'\0'+source),
    blockId,beforeMarkdown:before,afterMarkdown:source,
    beforeStateSha256:stateSha(current,opened.suppressedBlockIds),afterStateSha256:afterSha};
  return assemble(opened.original,{...opened.delta,operations:[...opened.delta.operations,op]},
    next,opened.suppressedBlockIds);
}
/** All element changes go through the same transaction endpoint. */
export function applyElementOperation(opened:OpenedDocument,request:EditRequest):OpenedDocument {
  const output=applyStructural(opened.current,opened.suppressedBlockIds,request);
  const before=stateSha(opened.current,opened.suppressedBlockIds);
  const after=stateSha(output.current,output.hidden);
  if(before===after)throw Error('MOPJO OP_HAS_NO_EFFECT');
  const operation:StructuralOperation={...request,
    ...(output.insertedId?{insertedId:output.insertedId}:{}),
    id:newOpId(opened,request.kind,JSON.stringify(request)),
    beforeStateSha256:before,afterStateSha256:after};
  return assemble(opened.original,{...opened.delta,operations:[...opened.delta.operations,operation]},
    output.current,output.hidden);
}
/** Version header is evidence of which delta state the human edited. */
export function exportMarkdown(opened:OpenedDocument):string {
  return `<!-- mopjo:state-sha256=${stateSha(opened.current,opened.suppressedBlockIds)} -->\n`+opened.markdown.content;
}
export function importEditedMarkdown(opened:OpenedDocument,submitted:string):OpenedDocument {
  const head=/^<!-- mopjo:state-sha256=([a-f0-9]{64}) -->\n/u.exec(submitted);
  if(!head||head[1]!==stateSha(opened.current,opened.suppressedBlockIds))
    throw Error('MOPJO STALE_MARKDOWN_VIEW');
  return applyMarkdownEdit(opened,submitted.slice(head[0].length));
}
export function queryElements(opened:OpenedDocument,
  filter:{type?:string;suppressed?:boolean;origin?:ElementView['origin']}={}):ElementView[]{
  return indexElements(opened.current,opened.markdown,opened.suppressedBlockIds).filter(e=>
    (filter.type===undefined||e.type===filter.type)&&
    (filter.suppressed===undefined||e.suppressed===filter.suppressed)&&
    (filter.origin===undefined||e.origin===filter.origin));
}
export function locatePdf(opened:OpenedDocument,blockId:string){
  const element=queryElements(opened).find(x=>x.blockId===blockId);
  if(!element)throw Error('MOPJO BLOCK_NOT_FOUND');
  return {blockId,pages:element.pdfPages,
    regions:element.pdfRegions.map(r=>({page:r.page,bbox:r.bbox,
      normalizedBBox:r.normalizedBBox,elementId:r.elementId})),
    ...(element.origin==='manual'?{manualPage:element.pdfPages[0]}:{})};
}
export function locateMarkdown(opened:OpenedDocument,blockId:string){
  const element=queryElements(opened).find(x=>x.blockId===blockId);
  if(!element)throw Error('MOPJO BLOCK_NOT_FOUND');
  if(!element.markdownRange)throw Error('MOPJO BLOCK_NOT_VISIBLE');
  return {blockId,from:element.markdownRange.from,to:element.markdownRange.to};
}
export function locatePdfPoint(opened:OpenedDocument,page:number,x:number,y:number){
  if(!Number.isSafeInteger(page)||page<1||!Number.isFinite(x)||!Number.isFinite(y)||
    x<0||x>1||y<0||y>1)return {kind:'unmatched' as const};
  const matched=queryElements(opened).filter(e=>e.pdfRegions.some(r=>r.page===page&&
    x>=r.normalizedBBox[0]&&x<=r.normalizedBBox[2]&&
    y>=r.normalizedBBox[1]&&y<=r.normalizedBBox[3]));
  return matched.length===1?{kind:'unique' as const,blockId:matched[0].blockId}:
    matched.length?{kind:'ambiguous' as const,count:matched.length}:{kind:'unmatched' as const};
}
export function encodeDelta(delta:DeltaV1):Uint8Array {
  assertDelta(delta);
  return new TextEncoder().encode(JSON.stringify(delta,null,2)+'\n');
}
