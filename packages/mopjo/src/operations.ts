/** Pure, reviewed MOPJO WP2 structural operations. No filesystem/UI access.
 * Original OCR source elements remain complete; deletion is a projection tombstone.
 */
import {createHash} from 'node:crypto';
import {validateDocumentIrV1,type DocumentIrV1,type IrLogicalBlock} from './ir/documentIrV1';
import {explicitSplitBlockAtUtf16,explicitMergeAdjacentTextBlocks} from './ir/documentIrReconstruction';

export type EditRequest =
  | {kind:'suppress-block';blockId:string}
  | {kind:'restore-block';blockId:string}
  | {kind:'insert-manual-text';afterBlockId:string;text:string;pdfPageNumber:number;detail:string}
  | {kind:'split-text';blockId:string;offset:number;detail:string}
  | {kind:'merge-text';leftBlockId:string;rightBlockId:string;detail:string};

export function applyStructural(doc:DocumentIrV1,hidden:readonly string[],request:EditRequest,
  forcedInsertedId?:string):{current:DocumentIrV1;hidden:readonly string[];insertedId?:string}{
  validateDocumentIrV1(doc);
  if(!request||typeof request.kind!=='string')throw Error('MOPJO INVALID_OPERATION');
  const byId=new Map(doc.blocks.map(b=>[b.blockId,b]));
  const visible=(id:string)=>{
    const b=byId.get(id);
    if(!b)throw Error('MOPJO BLOCK_NOT_FOUND: '+id);
    if(hidden.includes(id))throw Error('MOPJO BLOCK_SUPPRESSED: '+id);
    return b;
  };
  if(request.kind==='suppress-block'){
    const b=visible(request.blockId);
    if(b.type==='title'||doc.chapters.some(c=>c.anchorBlockId===b.blockId))
      throw Error('MOPJO CHAPTER_ANCHOR_PROTECTED');
    if(!hidden.length && doc.blocks.length<2)throw Error('MOPJO LAST_BLOCK_PROTECTED');
    return {current:doc,hidden:[...hidden,request.blockId].sort()};
  }
  if(request.kind==='restore-block'){
    if(!byId.has(request.blockId)||!hidden.includes(request.blockId))
      throw Error('MOPJO BLOCK_NOT_SUPPRESSED: '+request.blockId);
    return {current:doc,hidden:hidden.filter(id=>id!==request.blockId)};
  }
  if(request.kind==='insert-manual-text'){
    const anchor=visible(request.afterBlockId);
    if(typeof request.text!=='string'||!request.text.trim()||request.text.includes('\0')||
       request.text.length>250000||typeof request.detail!=='string'||!request.detail.trim()||
       !Number.isInteger(request.pdfPageNumber)||request.pdfPageNumber<1||request.pdfPageNumber>doc.pages.length)
      throw Error('MOPJO INVALID_MANUAL_TEXT');
    const sources=new Map(doc.sourceElements.map(e=>[e.id,e]));
    const anchorPage=anchor.sources.length?
      sources.get(anchor.sources[0].elementId)?.pdfPageNumber:
      [...(doc.manualTexts??[]),...(doc.manualHeadings??[])].find(m=>m.blockId===anchor.blockId)?.pdfPageNumber;
    if(anchorPage!==request.pdfPageNumber)
      throw Error('MOPJO MANUAL_PAGE_MUST_MATCH_ANCHOR');
    const blockId=forcedInsertedId??'blk_'+createHash('sha256')
      .update('mopjo-manual-text\0'+doc.pdf.sha256+'\0'+request.afterBlockId+'\0'+
        doc.blocks.length+'\0'+request.text).digest('hex').slice(0,24);
    if(!/^blk_[0-9a-f]{24}$/.test(blockId)||byId.has(blockId))throw Error('MOPJO INSERT_ID_COLLISION');
    const at=anchor.readingOrder!+1;
    const block:IrLogicalBlock={blockId,type:'text',text:request.text,chapterId:anchor.chapterId,
      readingOrder:at,status:'structured',audit:'unreviewed',sources:[]};
    const next:DocumentIrV1={...doc,
      blocks:[...doc.blocks.map(b=>b.readingOrder!>=at?{...b,readingOrder:b.readingOrder!+1}:b),block],
      manualTexts:[...(doc.manualTexts??[]),{blockId,afterBlockId:request.afterBlockId,
        pdfPageNumber:request.pdfPageNumber,method:'manual-pdf-page',detail:request.detail}]};
    validateDocumentIrV1(next);
    return {current:next,hidden,insertedId:blockId};
  }
  if(request.kind==='split-text'){
    const b=visible(request.blockId);
    if(b.type!=='text'||!b.sources.length||!request.detail?.trim())
      throw Error('MOPJO SPLIT_REQUIRES_OCR_TEXT');
    const next=explicitSplitBlockAtUtf16(doc,b.blockId,request.offset,request.detail);
    return {current:next,hidden};
  }
  if(request.kind==='merge-text'){
    const left=visible(request.leftBlockId),right=visible(request.rightBlockId);
    if(left.type!=='text'||right.type!=='text'||!left.sources.length||!right.sources.length||
       left.chapterId!==right.chapterId||!request.detail?.trim()||
       doc.chapters.some(c=>c.anchorBlockId===right.blockId))
      throw Error('MOPJO MERGE_REQUIRES_ADJACENT_SAME_CHAPTER_TEXT');
    const next=explicitMergeAdjacentTextBlocks(doc,left.blockId,right.blockId,request.detail);
    return {current:next,hidden};
  }
  throw Error('MOPJO UNKNOWN_OPERATION');
}
