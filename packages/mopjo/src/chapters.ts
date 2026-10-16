/** MOPJO WP3 isolated chapter IR: only relevant OCR elements and original PDF locations.
 * Not an ocr2md/document-ir v1: that schema requires the complete book by design.
 * The immutable chapter IR is independently reopenable without the original book IR.
 */
import {generateIrMarkdownBundle,type IrMarkdownChapterFile,type IrMarkdownEvidence,
  type IrMarkdownRenderKind} from './ir/documentIrMarkdown';
import {validateDocumentIrV1,encodeDocumentIrV1,type DocumentIrV1,
  type IrLogicalBlock,type IrSourceElement,type IrSourceSlice,type IrChapter} from './ir/documentIrV1';
import {sha256} from './core';
import {evolveV4,type V4Request,type NoteReview,type V4WorkingBlock} from './chapterV4Ops';
export const CHAPTER_KIND='mopjo/chapter-original' as const;
export const CHAPTER_DELTA_KIND='mopjo/chapter-operations' as const;
export type ChapterSegment={readonly startBlockId:string;readonly endBlockId:string;readonly fileName:string};
export type ChapterMapV1={readonly kind:'ocr2md/chapters-map';readonly schemaVersion:1;
  readonly baseGeneration:string;readonly markings:{readonly segments:readonly ChapterSegment[]}};
export interface ChapterSourceBlock {
  readonly block:IrLogicalBlock;readonly content:string;readonly mode:IrMarkdownRenderKind;
  readonly pdfPages:readonly number[];readonly evidence:readonly IrMarkdownEvidence[];
  readonly manualPdfPage?:number;
}
export interface ChapterOriginal {
  readonly kind:typeof CHAPTER_KIND;readonly schemaVersion:1;
  readonly sourceBookIrSha256:string;readonly chapterMapSha256:string;
  readonly baseGeneration:string;readonly pdf:DocumentIrV1['pdf'];readonly ocr:DocumentIrV1['ocr'];
  readonly chapterId:string;readonly label:string;readonly filename:string;
  readonly startBlockId:string;readonly endBlockId:string;
  readonly prefix:string;readonly blocks:readonly ChapterSourceBlock[];
  readonly sourceElements:readonly IrSourceElement[];
  /** Source evidence excluded by MinerU from its logical body, but never discarded by MOPJO.
   * Page-proximity attribution is an indexing convenience, NOT a verified chapter relation. */
  readonly supplementalEvidence?:readonly {source:IrSourceElement;assignment:'page-proximity-unverified'}[];
  readonly chapterTree:readonly IrChapter[];
}
export type ChapterOperation = {
  readonly id:string;readonly kind:'replace-text'|'suppress'|'restore'|'insert-manual-text'|
    V4Request['kind'];
  readonly beforeSha256:string;readonly afterSha256:string;
  readonly blockId:string;readonly before?:string;readonly after?:string;
  readonly text?:string;readonly page?:number;readonly insertedId?:string;
  readonly offset?:number;readonly otherBlockId?:string;readonly direction?:'up'|'down';
  readonly separator?:''|' '|'\n';readonly level?:2|3;
  readonly elementId?:string;readonly segmentPointer?:string;readonly from?:number;
  readonly noteElementId?:string;readonly decision?:'confirmed'|'ocr-error'|'unmatched';
  readonly noteNumber?:number|null;readonly detail?:string;
  readonly mode?:'table-html'|'equation'|'image-link';readonly content?:string;
};
export interface ChapterDelta {
  readonly kind:typeof CHAPTER_DELTA_KIND;readonly schemaVersion:1;
  readonly originalSha256:string;readonly pdfSha256:string;
  readonly operations:readonly ChapterOperation[];
}
export interface WorkingBlock extends ChapterSourceBlock {readonly hidden?:boolean;}
export interface OpenChapter {
  readonly original:ChapterOriginal;readonly delta:ChapterDelta;
  readonly blocks:readonly WorkingBlock[];readonly markdown:IrMarkdownChapterFile;
  readonly stateSha256:string;
}
const marker=(id:string)=>`<!-- ocr2md-ir:block=${id} -->\n`;
const sha=(value:string|Uint8Array)=>sha256(value);
const idrx=/^blk_[0-9a-f]{24}$/u;
const fileSafe=(name:string)=>name.length>=4&&name.length<=120&&name.endsWith('.md')&&
  !/[\\/:*?"<>|\x00-\x1f]/u.test(name)&&!name.includes('..')&&!name.startsWith('.')&&!name.endsWith(' ');
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
/** Deterministic coverage and output projection; no IO. */
export function splitBook(doc:DocumentIrV1,map:ChapterMapV1,baseGeneration:string,
  chapterMapSha256:string):ChapterOriginal[]{
  validateDocumentIrV1(doc);
  if(map.kind!=='ocr2md/chapters-map'||map.schemaVersion!==1||
    map.baseGeneration!==baseGeneration||!map.markings||
    !Array.isArray(map.markings.segments)||!map.markings.segments.length||
    !/^[a-f0-9]{64}$/u.test(chapterMapSha256))throw Error('MOPJO MAP_BASE_MISMATCH');
  const blocks=[...doc.blocks].sort((a,b)=>a.readingOrder!-b.readingOrder!);
  const byId=new Map(blocks.map((b,i)=>[b.blockId,i]));
  const usedFiles=new Set<string>(),usedIds=new Set<string>(),groups:IrLogicalBlock[][]=[];
  let next=0;
  for(const entry of map.markings.segments){
    const start=byId.get(entry.startBlockId),end=byId.get(entry.endBlockId);
    if(start!==next||end===undefined||end<start||!fileSafe(entry.fileName)||
      usedFiles.has(entry.fileName.toLocaleLowerCase()))throw Error('MOPJO MAP_NOT_PARTITION');
    usedFiles.add(entry.fileName.toLocaleLowerCase());
    const part=blocks.slice(start,end+1);
    for(const b of part){if(usedIds.has(b.blockId))throw Error('MOPJO DUPLICATE_BLOCK');usedIds.add(b.blockId);}
    groups.push(part);next=end+1;
  }
  if(next!==blocks.length||usedIds.size!==blocks.length)throw Error('MOPJO MAP_INCOMPLETE');
  const projected=generateIrMarkdownBundle(doc,{obCompatible:true});
  const byFilename=new Map(projected.files.map(file=>[file.path.split('/').at(-1)!,file]));
  const sourceMap=new Map(doc.sourceElements.map(e=>[e.id,e]));
  const logicalReferences=new Set(blocks.flatMap(b=>b.sources.map(r=>r.elementId)));
  const extras=doc.sourceElements.filter(s=>!logicalReferences.has(s.id));
  const candidates=groups.map(group=>group.flatMap(b=>b.sources.map(ref=>sourceMap.get(ref.elementId)!)
    .filter(Boolean)));
  const supplemental=groups.map(()=>[] as {source:IrSourceElement;assignment:'page-proximity-unverified'}[]);
  for(const source of extras){
    const cy=(source.normalizedBBox[1]+source.normalizedBBox[3])/2;
    const scored=candidates.map((elements,i)=>{
      const samePage=elements.filter(e=>e.pdfPageNumber===source.pdfPageNumber);
      const pageDistance=elements.length?Math.min(...elements.map(e=>Math.abs(e.pdfPageNumber-source.pdfPageNumber))):1e9;
      const yDistance=samePage.length?Math.min(...samePage.map(e=>Math.abs((e.normalizedBBox[1]+e.normalizedBBox[3])/2-cy))):0;
      return {i,pageDistance,yDistance};
    }).sort((a,b)=>a.pageDistance-b.pageDistance||a.yDistance-b.yDistance||a.i-b.i);
    supplemental[scored[0].i].push({source,assignment:'page-proximity-unverified'});
  }
  if(supplemental.reduce((n,x)=>n+x.length,0)!==extras.length)
    throw Error('MOPJO EXTRA_EVIDENCE_LOST');
  return map.markings.segments.map((entry,i)=>{
    const projectedFile=byFilename.get(entry.fileName);
    const part=groups[i];
    if(!projectedFile||projectedFile.ranges.length!==part.length||
      projectedFile.ranges.some((r,j)=>r.blockId!==part[j].blockId))
      throw Error('MOPJO MAP_PROJECTION_DISAGREEMENT: '+entry.fileName);
    const seenSources=new Set<string>();
    const sources:IrSourceElement[]=[];
    const chapterBlocks:ChapterSourceBlock[]=part.map((block,j)=>{
      const r=projectedFile.ranges[j];
      for(const ref of block.sources){
        const src=sourceMap.get(ref.elementId);
        if(!src)throw Error('MOPJO SOURCE_MISSING');
        if(!seenSources.has(src.id)){sources.push(src);seenSources.add(src.id);}
      }
      return {block,content:projectedFile.content.slice(r.contentFrom,r.contentTo),
        mode:r.mode,pdfPages:r.pdfPages,evidence:r.evidence,
        ...(r.manualPdfPage?{manualPdfPage:r.manualPdfPage}:{})};
    });
    const blockIds=new Set(part.map(b=>b.blockId));
    const original:ChapterOriginal={kind:CHAPTER_KIND,schemaVersion:1,
      sourceBookIrSha256:sha(encodeDocumentIrV1(doc)),chapterMapSha256,baseGeneration,
      pdf:doc.pdf,ocr:doc.ocr,chapterId:projectedFile.chapterId,
      label:projectedFile.label,filename:entry.fileName,
      startBlockId:entry.startBlockId,endBlockId:entry.endBlockId,
      prefix:projectedFile.content.slice(0,projectedFile.ranges[0].from),
      blocks:chapterBlocks,sourceElements:sources,supplementalEvidence:supplemental[i],
      chapterTree:doc.chapters.filter(c=>blockIds.has(c.anchorBlockId??''))};
    validateChapter(original);
    const chapter=openChapter(original,emptyChapterDelta(original));
    if(chapter.markdown.content!==projectedFile.content)
      throw Error('MOPJO CHAPTER_PROJECTION_NOT_LOSSLESS');
    return original;
  });
}
/** All saved provenance is checked, not merely counted; preserve global page/element IDs. */
export function validateChapter(value:unknown):asserts value is ChapterOriginal {
  if(!value||typeof value!=='object')throw Error('MOPJO CHAPTER_INVALID');
  const ch=value as ChapterOriginal;
  if(ch.kind!==CHAPTER_KIND||ch.schemaVersion!==1||!fileSafe(ch.filename)||
    ![ch.sourceBookIrSha256,ch.chapterMapSha256,ch.baseGeneration,ch.pdf?.sha256,ch.ocr?.sha256]
      .every(x=>typeof x==='string'&&/^[a-f0-9]{64}$/u.test(x))||
    !Array.isArray(ch.blocks)||!ch.blocks.length||!Array.isArray(ch.sourceElements)||
    !Array.isArray(ch.chapterTree)||typeof ch.prefix!=='string'||
    !ch.chapterId||typeof ch.label!=='string')throw Error('MOPJO CHAPTER_INVALID');
  const sourceMap=new Map<string,IrSourceElement>();
  for(const s of ch.sourceElements){
    if(!s||sourceMap.has(s.id)||s.sourceSha256!==ch.ocr.sha256||
      s.pdfPageNumber!==s.pageIndex+1||
      s.id!==`mineru:${ch.ocr.sha256}:p${s.pageIndex}:${s.collection}:${s.collectionPosition}`||
      s.jsonPointer!==`/pdf_info/${s.pageIndex}/${s.collection}/${s.collectionPosition}`||
      s.bbox.length!==4||s.normalizedBBox.length!==4||
      s.bbox.some((n:number,j:number)=>!Number.isFinite(n)||
        Math.abs(s.normalizedBBox[j]-n/s.pageSize[j%2])>1e-12))
      throw Error('MOPJO CHAPTER_SOURCE_INVALID');
    sourceMap.set(s.id,s);
  }
  if(ch.supplementalEvidence!==undefined){
    if(!Array.isArray(ch.supplementalEvidence))throw Error('MOPJO SUPPLEMENTAL_INVALID');
    for(const entry of ch.supplementalEvidence){
      const x=entry?.source;
      if(entry.assignment!=='page-proximity-unverified'||!x||sourceMap.has(x.id)||
        x.sourceSha256!==ch.ocr.sha256||x.pdfPageNumber!==x.pageIndex+1||
        x.id!==`mineru:${ch.ocr.sha256}:p${x.pageIndex}:${x.collection}:${x.collectionPosition}`||
        x.jsonPointer!==`/pdf_info/${x.pageIndex}/${x.collection}/${x.collectionPosition}`||
        x.bbox.length!==4||x.normalizedBBox.length!==4||
        x.bbox.some((n:number,i:number)=>!Number.isFinite(n)||
          Math.abs(x.normalizedBBox[i]-n/x.pageSize[i%2])>1e-12))
        throw Error('MOPJO SUPPLEMENTAL_INVALID');
      sourceMap.set(x.id,x);
    }
  }
  const used=new Set<string>(),ids=new Set<string>();
  for(let i=0;i<ch.blocks.length;i++){
    const row=ch.blocks[i],b=row?.block;
    if(!b||!idrx.test(b.blockId)||ids.has(b.blockId)||typeof b.text!=='string'||
      typeof row.content!=='string'||typeof row.mode!=='string'||
      !Array.isArray(row.evidence)||!Array.isArray(row.pdfPages)||
      b.sources.length!==row.evidence.length||!Number.isInteger(b.readingOrder)||
      (i>0&&b.readingOrder!<=ch.blocks[i-1].block.readingOrder!)||
      b.sources.some((ref:IrSourceSlice,j:number)=>{
        const s=sourceMap.get(ref.elementId),e=row.evidence[j];
        return !s||!e||ref.elementId!==e.elementId||s.pdfPageNumber!==e.pdfPageNumber||
          s.jsonPointer!==e.jsonPointer||!same(s.bbox,e.bbox)||
          !same(s.normalizedBBox,e.normalizedBBox)||
          e.segmentPointer!==ref.segmentPointer||!same(e.utf16Range,ref.utf16Range);
      }))throw Error('MOPJO CHAPTER_BLOCK_INVALID');
    ids.add(b.blockId);for(const src of b.sources)used.add(src.elementId);
    const pages=[...new Set([...row.evidence.map((e:IrMarkdownEvidence)=>e.pdfPageNumber),
      ...(row.manualPdfPage?[row.manualPdfPage]:[])])].sort((a,b)=>a-b);
    if(!same(pages,row.pdfPages))throw Error('MOPJO CHAPTER_PAGES_INVALID');
    if(b.sources.length===0&&!row.manualPdfPage)throw Error('MOPJO CHAPTER_UNANCHORED');
  }
  if(ch.blocks[0].block.blockId!==ch.startBlockId||
    ch.blocks.at(-1)!.block.blockId!==ch.endBlockId||
    used.size!==ch.sourceElements.length||ch.sourceElements.some(x=>!used.has(x.id)))
    throw Error('MOPJO CHAPTER_COVERAGE_INVALID');
}
export function encodeChapter(ch:ChapterOriginal):Uint8Array {
  validateChapter(ch);return new TextEncoder().encode(JSON.stringify(ch,null,2)+'\n');
}
export function emptyChapterDelta(ch:ChapterOriginal):ChapterDelta {
  return {kind:CHAPTER_DELTA_KIND,schemaVersion:1,originalSha256:sha(encodeChapter(ch)),
    pdfSha256:ch.pdf.sha256,operations:[]};
}
function currentHash(blocks:readonly WorkingBlock[]):string {
  return sha(JSON.stringify(blocks.map((b:V4WorkingBlock)=>({id:b.block.blockId,type:b.block.type,
    content:b.content,text:b.block.text,hidden:b.hidden===true,pages:b.pdfPages,
    sources:b.block.sources,manual:b.manualPdfPage??null,
    precision:b.mappingPrecision??null,headingLevel:b.headingLevel??null,
    reviews:b.noteReviews??[]}))));
}
function renderChapter(ch:ChapterOriginal,blocks:readonly WorkingBlock[]):IrMarkdownChapterFile {
  let content=ch.prefix;const ranges:IrMarkdownChapterFile['ranges'][number][]=[];
  for(const b of blocks){if(b.hidden)continue;
    const from=content.length;content+=marker(b.block.blockId);
    const contentFrom=content.length;content+=b.content;
    const contentTo=content.length;content+='\n\n';
    ranges.push({blockId:b.block.blockId,chapterId:b.block.chapterId??ch.chapterId,
      pdfPages:b.pdfPages,from,to:content.length,contentFrom,contentTo,
      mode:b.mode,audit:'unreviewed',evidence:b.evidence,
      ...(b.manualPdfPage?{manualPdfPage:b.manualPdfPage}:{})});
  }
  if(!ranges.length)throw Error('MOPJO CHAPTER_EMPTY');
  return {chapterId:ch.chapterId,path:ch.filename,label:ch.label,content,
    sha256:sha(content),ranges,status:'provisional'};
}
function checkDelta(d:ChapterDelta,ch:ChapterOriginal):void {
  if(!d||d.kind!==CHAPTER_DELTA_KIND||d.schemaVersion!==1||
    d.originalSha256!==sha(encodeChapter(ch))||d.pdfSha256!==ch.pdf.sha256||
    !Array.isArray(d.operations)||d.operations.length>10000)
    throw Error('MOPJO CHAPTER_DELTA_MISMATCH');
  const ids=new Set<string>();
  for(const op of d.operations){
    if(!op||!/^op_[a-f0-9]{24}$/u.test(op.id)||ids.has(op.id)||
      !/^[a-f0-9]{64}$/u.test(op.beforeSha256)||
      !/^[a-f0-9]{64}$/u.test(op.afterSha256)||!idrx.test(op.blockId)||
      !['replace-text','suppress','restore','insert-manual-text','insert-manual-heading','insert-manual-rich','replace-inline-formula','split-text','merge-text',
        'move-text','join-soft-break','heading-level','replace-rich','review-note'].includes(op.kind))
      throw Error('MOPJO CHAPTER_OP_INVALID');
    ids.add(op.id);
  }
}
const escapeText=(v:string)=>v.replace(/\r\n?/gu,'\n')
  .replace(/&/gu,'&amp;').replace(/</gu,'&lt;').replace(/>/gu,'&gt;')
  .replace(/^(?=[#>|])([#>|])/gmu,'\\$1');
const escapeHeading=(v:string)=>escapeText(v.replace(/\r?\n/gu,' ').trim())
  .replace(/(^|\s)([#`*_[\]\\])/gu,'$1\\$2');
const unescapeText=(v:string)=>v.replace(/\\([#>|`*_[\]\\])/gu,'$1')
  .replace(/&lt;/gu,'<').replace(/&gt;/gu,'>').replace(/&amp;/gu,'&');
function parsedEdit(b:WorkingBlock,source:string):{content:string;text:string} {
  if(!['text','title','ref_text'].includes(b.block.type)||source.length>250000||source.includes('\0'))
    throw Error('MOPJO CHAPTER_RICH_EDIT_UNSUPPORTED');
  const originalHeading=/^(#{1,3}) /u.exec(b.content);
  if(b.block.type==='title'){
    if(!originalHeading||!source.startsWith(originalHeading[0])||source.includes('\n'))
      throw Error('MOPJO CHAPTER_HEADING_STRUCTURE_CHANGED');
    const plain=unescapeText(source.slice(originalHeading[0].length));
    if(!plain.trim()||originalHeading[0]+escapeHeading(plain)!==source)
      throw Error('MOPJO CHAPTER_NONCANONICAL_MD');
    return {content:source,text:plain};
  }
  if(/^#{1,6} /mu.test(source)||source.includes('\n# '))throw Error('MOPJO CHAPTER_HEADING_STRUCTURE_CHANGED');
  const plain=unescapeText(source);
  if(escapeText(plain)!==source)throw Error('MOPJO CHAPTER_NONCANONICAL_MD');
  return {content:source,text:plain};
}
function evolve(ch:ChapterOriginal,blocks:readonly WorkingBlock[],op:ChapterOperation):WorkingBlock[]{
  const next=[...blocks],pos=next.findIndex(b=>b.block.blockId===op.blockId);
  if(pos<0)throw Error('MOPJO CHAPTER_BLOCK_MISSING');
  const found=next[pos];
  if(op.kind==='replace-text'){
    if(found.hidden||found.content!==op.before||typeof op.after!=='string')
      throw Error('MOPJO CHAPTER_TEXT_STALE');
    const edit=parsedEdit(found,op.after);
    if(edit.content===found.content)throw Error('MOPJO CHAPTER_NO_CHANGE');
    next[pos]={...found,block:{...found.block,text:edit.text},content:edit.content};
  }else if(op.kind==='suppress'){
    if(found.hidden||found.block.type==='title'||pos===0||
      found.block.sources.length===0&&found.mode==='heading')
      throw Error('MOPJO CHAPTER_ANCHOR_PROTECTED');
    if(next.filter(b=>!b.hidden).length<=1)throw Error('MOPJO CHAPTER_LAST_BLOCK');
    next[pos]={...found,hidden:true};
  }else if(op.kind==='restore'){
    if(!found.hidden)throw Error('MOPJO CHAPTER_NOT_SUPPRESSED');
    next[pos]={...found,hidden:false};
  }else if(op.kind==='insert-manual-text'){
    if(found.hidden||typeof op.text!=='string'||!op.text.trim()||
      op.text.length>250000||op.text.includes('\0')||
      !Number.isSafeInteger(op.page)||!found.pdfPages.includes(op.page!)||
      typeof op.insertedId!=='string'||!idrx.test(op.insertedId)||
      next.some(b=>b.block.blockId===op.insertedId))throw Error('MOPJO CHAPTER_MANUAL_INVALID');
    const id=op.insertedId;
    const block:IrLogicalBlock={blockId:id,type:'text',text:op.text,chapterId:found.block.chapterId,
      readingOrder:found.block.readingOrder,status:'structured',audit:'unreviewed',sources:[]};
    next.splice(pos+1,0,{block,mode:'text',content:escapeText(op.text),pdfPages:[op.page!],
      evidence:[],manualPdfPage:op.page!});
  }else return evolveV4(ch,next,op);
  return next;
}
export function openChapter(ch:ChapterOriginal,delta:ChapterDelta,pdf?:Uint8Array):OpenChapter {
  validateChapter(ch);checkDelta(delta,ch);
  if(pdf&&sha(pdf)!==ch.pdf.sha256)throw Error('MOPJO CHAPTER_PDF_CHANGED');
  let blocks:WorkingBlock[]=[...ch.blocks];
  for(const op of delta.operations){
    if(currentHash(blocks)!==op.beforeSha256)throw Error('MOPJO CHAPTER_OP_STALE');
    blocks=evolve(ch,blocks,op);
    if(currentHash(blocks)!==op.afterSha256)throw Error('MOPJO CHAPTER_OP_RESULT_MISMATCH');
  }
  return {original:ch,delta,blocks,stateSha256:currentHash(blocks),
    markdown:renderChapter(ch,blocks)};
}
export function chapterMarkdown(doc:OpenChapter):string {
  return `<!-- mopjo:chapter-state-sha256=${doc.stateSha256} -->\n`+doc.markdown.content;
}
function append(doc:OpenChapter,op:Omit<ChapterOperation,'id'|'beforeSha256'|'afterSha256'>):OpenChapter {
  const payload=JSON.stringify(op);
  const withId=['insert-manual-heading','insert-manual-rich'].includes(op.kind)?
    {...op,insertedId:'blk_'+sha('mopjo-chapter-manual\0'+doc.stateSha256+'\0'+payload).slice(0,24)}:
    op.kind==='split-text'?
    {...op,insertedId:'blk_'+sha('mopjo-chapter-split\0'+doc.stateSha256+'\0'+payload).slice(0,24)}:
    op.kind==='insert-manual-text'?
    {...op,insertedId:'blk_'+sha('mopjo-chapter-insert\0'+doc.stateSha256+'\0'+payload).slice(0,24)}:op;
  const prev:ChapterOperation={...withId,id:'op_'+sha(doc.delta.operations.length+'\0'+doc.stateSha256+'\0'+payload).slice(0,24),
    beforeSha256:doc.stateSha256,afterSha256:''};
  const after=evolve(doc.original,doc.blocks,prev),next:ChapterOperation={...prev,afterSha256:currentHash(after)};
  return openChapter(doc.original,{...doc.delta,operations:[...doc.delta.operations,next]});
}
export function applyChapterOp(doc:OpenChapter,op:
  |{kind:'suppress'|'restore';blockId:string}
  |{kind:'insert-manual-text';blockId:string;text:string;page:number}
  |V4Request):OpenChapter {
  return append(doc,op);
}
export function editChapterMarkdown(doc:OpenChapter,edited:string):OpenChapter {
  const head=/^<!-- mopjo:chapter-state-sha256=([a-f0-9]{64}) -->\n/u.exec(edited);
  if(!head||head[1]!==doc.stateSha256)throw Error('MOPJO CHAPTER_STALE_MARKDOWN');
  const content=edited.slice(head[0].length),file=doc.markdown;
  // Reject ambiguous edits, changed markers, added/removed blocks and reordered anchors.
  const matches=[...content.matchAll(/^<!-- ocr2md-ir:block=(blk_[a-f0-9]{24}) -->\n/gmu)];
  if(matches.length!==file.ranges.length||content.slice(0,matches[0]?.index)!==doc.original.prefix)
    throw Error('MOPJO CHAPTER_ANCHORS_CHANGED');
  const changes:{id:string;before:string;after:string}[]=[];
  for(let i=0;i<matches.length;i++){
    const row=file.ranges[i],m=matches[i];
    if(m[1]!==row.blockId)throw Error('MOPJO CHAPTER_ANCHORS_CHANGED');
    const from=m.index!+m[0].length;
    const tail=content.slice(from,i+1<matches.length?matches[i+1].index:content.length);
    if(!tail.endsWith('\n\n'))throw Error('MOPJO CHAPTER_SEPARATOR_CHANGED');
    const after=tail.slice(0,-2),before=file.content.slice(row.contentFrom,row.contentTo);
    if(before!==after)changes.push({id:row.blockId,before,after});
  }
  if(changes.length!==1)throw Error('MOPJO CHAPTER_EDIT_ONE_BLOCK_ONLY');
  const one=changes[0];
  return append(doc,{kind:'replace-text',blockId:one.id,before:one.before,after:one.after});
}
export function chapterElements(doc:OpenChapter){
  return doc.blocks.map(b=>({blockId:b.block.blockId,type:b.block.type,text:b.block.text,
    hidden:Boolean(b.hidden),chapterId:b.block.chapterId,pdfPages:b.pdfPages,
    currentMarkdownContent:b.content,
    mappingPrecision:(b as V4WorkingBlock).mappingPrecision??'original-element-bbox',
    headingLevel:(b as V4WorkingBlock).headingLevel??null,
    noteReviews:(b as V4WorkingBlock).noteReviews??[],
    pdfRegions:b.evidence.map(e=>({elementId:e.elementId,page:e.pdfPageNumber,
      bbox:e.bbox,normalizedBBox:e.normalizedBBox})),
    media:[...doc.original.sourceElements.filter(s=>b.block.sources.some(x=>x.elementId===s.id))
      .flatMap(s=>s.segments.flatMap(seg=>[
        ...(seg.imagePath?[{kind:'image',elementId:s.id,value:seg.imagePath}]:[]),
        ...(seg.html?[{kind:'html',elementId:s.id,value:seg.html}]:[]),
        ...((seg.type==='inline_equation'||seg.type==='interline_equation')&&seg.content?
          [{kind:'formula',elementId:s.id,value:seg.content}]:[])])),
      ...(b.block.sources.length===0&&b.mode==='image-link'?
        [{kind:'image',elementId:null,value:b.content}]:
        b.block.sources.length===0&&b.mode==='table-html'?
        [{kind:'html',elementId:null,value:b.content}]:
        b.block.sources.length===0&&b.mode==='equation'?
        [{kind:'formula',elementId:null,value:b.content}]:[])],
    markdownRange:doc.markdown.ranges.find(r=>r.blockId===b.block.blockId)
      ?{from:doc.markdown.ranges.find(r=>r.blockId===b.block.blockId)!.contentFrom,
        to:doc.markdown.ranges.find(r=>r.blockId===b.block.blockId)!.contentTo}:null,
    originalElementIds:[...new Set(b.block.sources.map(x=>x.elementId))],
    manualPage:b.manualPdfPage??null}));
}
export function encodeChapterDelta(delta:ChapterDelta):Uint8Array {
  if(delta.kind!==CHAPTER_DELTA_KIND||delta.schemaVersion!==1)throw Error('MOPJO CHAPTER_DELTA_INVALID');
  return new TextEncoder().encode(JSON.stringify(delta,null,2)+'\n');
}
