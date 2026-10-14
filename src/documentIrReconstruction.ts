/** IR-WP3: conservative page-to-logical block reconstruction.
 * No official Markdown inputs, no unauthorized page order inference, no file IO.
 * Hypotheses remain unverified; structural operations require explicit calls.
 */
import {createHash} from "crypto";
import {validateDocumentIrV1, type DocumentIrV1,type IrSourceElement,
  type IrLogicalBlock,type IrSourceSlice,type IrReconstructionCandidate,
  type IrReconstructionOperation,type IrReconstructionState} from "./documentIrV1";

function sha(label:string):string{return createHash("sha256").update(label).digest("hex");}
function candidateId(kind:string,sourceIds:readonly string[]):string{
  return "ir3:"+sha(kind+"\0"+sourceIds.join("\0")).slice(0,24);
}
const prose=(s:IrSourceElement)=>s.type==="text";
const originalText=(s:IrSourceElement)=>s.segments.map(seg=>seg.content??"").join("");
const terminal=/[.!?。？！;；:：][\s\u201d\u2019\)\]]*$/u;
/** Propose only: geometric text continuity does NOT override MinerU merge_prev=false. */
function crossPageCandidate(a:IrSourceElement,b:IrSourceElement):IrReconstructionCandidate|undefined{
  if(!prose(a)||!prose(b)||b.pageIndex!==a.pageIndex+1)return undefined;
  const tail=originalText(a).trim(),head=originalText(b).trim();
  if(tail.length<18||head.length<20||terminal.test(tail)||!/^\p{Ll}/u.test(head))return undefined;
  const aBottom=a.bbox[3]/a.pageSize[1],bTop=b.bbox[1]/b.pageSize[1];
  if(aBottom<.78||bTop>.22)return undefined;
  return {
    candidateId:candidateId("cross-page-continuation",[a.id,b.id]),
    kind:"cross-page-continuation",sourceElementIds:[a.id,b.id],
    reason:"页末与次页页首文字可能连续；仅提出审核候选，绝不直接合并。",
    evidence:{lastPage:a.pdfPageNumber,nextPage:b.pdfPageNumber,lastBottomRatio:aBottom,
      nextTopRatio:bTop,firstCharacter:head[0],lastCharacter:tail.slice(-1),
      mineruMergePrev:b.rawBlock.merge_prev===true?true:b.rawBlock.merge_prev===false?false:null},
    status:"needs-review",
  };
}
function mergeHintCandidate(a:IrSourceElement,b:IrSourceElement):IrReconstructionCandidate|undefined{
  if(!prose(a)||!prose(b)||a.pageIndex!==b.pageIndex||b.rawBlock.merge_prev!==true)return;
  return {candidateId:candidateId("merge-prev-hint",[a.id,b.id]),kind:"merge-prev-hint",
    sourceElementIds:[a.id,b.id],reason:"MinerU 明确 merge_prev=true，但是否属于一个自然段仍需审核。",
    evidence:{page:a.pdfPageNumber,explicitMineruHint:true},status:"needs-review"};
}
/** Multi-column reading order cannot safely be inferred by sorting bbox.y. */
function multiColumnCandidate(elements:IrSourceElement[],width:number,page:number):IrReconstructionCandidate|undefined{
  if(elements.length<4)return;
  const text=elements.filter(x=>x.type==="text"||x.type==="title"||x.type==="ref_text");
  const mid=width/2;
  const left=text.filter(s=>s.bbox[2]<=mid-8);
  const right=text.filter(s=>s.bbox[0]>=mid-8);
  if(left.length<2||right.length<2)return;
  // In narrow columns an element spans less than roughly half the page.
  if(Math.min(left.length,right.length)<2)return;
  return {candidateId:candidateId("multi-column-order",text.map(e=>e.id)),
    kind:"multi-column-order",sourceElementIds:text.map(e=>e.id),
    reason:"同页存在左右两个正文栏。需对照 PDF 确认跨栏阅读顺序，不按 y 坐标自动排序。",
    evidence:{page,leftCount:left.length,rightCount:right.length,midX:mid,
      inputOrder:text.map(e=>e.collectionPosition)},status:"needs-review"};
}
export function proposeIrReconstruction(input:DocumentIrV1):DocumentIrV1{
  validateDocumentIrV1(input);
  if(input.importState!=="page-import-provisional")
    throw Error("IR-WP3 may only initialize from the original unreviewed WP2 snapshot");
  const elements=new Map(input.sourceElements.map(e=>[e.id,e]));
  const candidates:IrReconstructionCandidate[]=[];
  for(const pg of input.pages){
    const body=pg.bodyElementIds.map(id=>elements.get(id)!);
    for(let i=1;i<body.length;i++){
      const hint=mergeHintCandidate(body[i-1],body[i]);if(hint)candidates.push(hint);
    }
    const column=multiColumnCandidate(body,pg.pageSize[0],pg.pdfPageNumber);if(column)candidates.push(column);
    for(const el of body){
      if(el.type==="text"&&!originalText(el).trim())candidates.push({
        candidateId:candidateId("empty-ocr-text",[el.id]),kind:"empty-ocr-text",
        sourceElementIds:[el.id],reason:"OCR 标记为正文文本但未提取到 content，需核对 PDF 或其他原始字段。",
        evidence:{page:el.pdfPageNumber,segmentCount:el.segments.length},status:"needs-review"});
    }
    const next=input.pages[pg.pageIndex+1];
    if(next&&body.length&&next.bodyElementIds.length){
      const a=body[body.length-1],b=elements.get(next.bodyElementIds[0])!;
      const cross=crossPageCandidate(a,b);if(cross)candidates.push(cross);
    }
  }
  const reconstruction:IrReconstructionState={schemaVersion:1,orderBasis:"mineru-array-provisional",
    candidates,appliedOperations:[]};
  const output:DocumentIrV1={...input,importState:"logical-review",
    blocks:input.blocks.map((block,index)=>({...block,readingOrder:index})),
    reconstruction};
  validateDocumentIrV1(output);return output;
}
function requireReview(doc:DocumentIrV1):IrReconstructionState{
  validateDocumentIrV1(doc);
  if(doc.importState!=="logical-review"||!doc.reconstruction)
    throw Error("Explicit IR-WP3 edit requires a reviewed-mode IR snapshot");
  return doc.reconstruction;
}
function update(doc:DocumentIrV1,blocks:readonly IrLogicalBlock[],operation:IrReconstructionOperation,
  orderBasis:IrReconstructionState["orderBasis"]):DocumentIrV1{
  const reconstruction=requireReview(doc);
  const next:DocumentIrV1={...doc,blocks:blocks.map((b,i)=>({...b,readingOrder:i})),
    summary:{...doc.summary,provisionalBlocks:blocks.filter(b=>b.status==="provisional").length},
    reconstruction:{...reconstruction,orderBasis,appliedOperations:[...reconstruction.appliedOperations,operation]}};
  validateDocumentIrV1(next);return next;
}
function operationId(doc:DocumentIrV1,kind:string,ids:readonly string[]):string{
  return "op_"+sha(kind+"\0"+ids.join("\0")+"\0"+doc.reconstruction!.appliedOperations.length).slice(0,24);
}
export function explicitMergeAdjacentTextBlocks(doc:DocumentIrV1,leftId:string,rightId:string,
  detail:string):DocumentIrV1{
  requireReview(doc);
  const blocks=[...doc.blocks].sort((a,b)=>a.readingOrder!-b.readingOrder!);
  const index=blocks.findIndex(b=>b.blockId===leftId);
  if(!detail.trim()||index<0||index>=blocks.length-1||blocks[index+1].blockId!==rightId||
     blocks[index].type!=="text"||blocks[index+1].type!=="text")
    throw Error("Merge requires explicitly selected adjacent text blocks and a review reason");
  const left=blocks[index],right=blocks[index+1];
  // Concatenation is exact; there is no automatic word repair, dehyphenation, or loss.
  const merged:IrLogicalBlock={...left,text:left.text+right.text,
    sources:[...left.sources,...right.sources],status:"structured",audit:"unreviewed"};
  blocks.splice(index,2,merged);
  return update(doc,blocks,{operationId:operationId(doc,"merge",[leftId,rightId]),kind:"merge",
    originalBlockIds:[leftId,rightId],resultBlockIds:[merged.blockId],detail,mode:"explicit"},
    doc.reconstruction!.orderBasis);
}
interface TextSegmentPiece{value:string;reference:IrSourceSlice;}
function expandSourceText(doc:DocumentIrV1,block:IrLogicalBlock):TextSegmentPiece[]{
  const elements=new Map(doc.sourceElements.map(e=>[e.id,e]));
  const pieces:TextSegmentPiece[]=[];
  for(const ref of block.sources){
    const e=elements.get(ref.elementId)!;
    if(!["text","title","ref_text"].includes(e.type)||
       e.segments.some(s=>s.html!==undefined||s.imagePath!==undefined))
      throw Error("Cannot split source containing table, image, formula, or other rich payloads");
    const segments=ref.segmentPointer?e.segments.filter(s=>s.jsonPointer===ref.segmentPointer):e.segments;
    for(const seg of segments){
      if(typeof seg.content!=="string"||seg.content.length===0)continue;
      const [from,to]=ref.utf16Range??[0,seg.content.length];
      pieces.push({value:seg.content.slice(from,to),reference:{elementId:e.id,
        segmentPointer:seg.jsonPointer,utf16Range:[from,to]}});
    }
  }
  if(pieces.map(p=>p.value).join("")!==block.text)
    throw Error("Block text diverged from raw OCR content; review correction before source slicing");
  return pieces;
}
/** Split at a UTF-16 offset while retaining exact per-segment provenance and text coverage. */
export function explicitSplitBlockAtUtf16(doc:DocumentIrV1,blockId:string,offset:number,
  detail:string):DocumentIrV1{
  requireReview(doc);
  const blocks=[...doc.blocks].sort((a,b)=>a.readingOrder!-b.readingOrder!);
  const i=blocks.findIndex(b=>b.blockId===blockId),block=blocks[i];
  if(!block||!detail.trim()||!Number.isSafeInteger(offset)||offset<=0||offset>=block.text.length||
     (block.text.charCodeAt(offset-1)>=0xd800&&block.text.charCodeAt(offset-1)<=0xdbff&&
      block.text.charCodeAt(offset)>=0xdc00&&block.text.charCodeAt(offset)<=0xdfff))
    throw Error("Split requires valid non-surrogate UTF-16 offset and explicit review reason");
  const pieces=expandSourceText(doc,block);
  const before:IrSourceSlice[]=[],after:IrSourceSlice[]=[];
  let total=0;
  for(const piece of pieces){
    const len=piece.value.length;
    const cut=Math.min(len,Math.max(0,offset-total));
    const [baseStart]=piece.reference.utf16Range!;
    if(cut>0)before.push({...piece.reference,utf16Range:[baseStart,baseStart+cut]});
    if(cut<len)after.push({...piece.reference,utf16Range:[baseStart+cut,baseStart+len]});
    total+=len;
  }
  if(!before.length||!after.length)throw Error("Split cannot produce empty source attribution");
  const rightId="blk_"+sha("ir3:split\0"+blockId+"\0"+offset+"\0"+
    doc.reconstruction!.appliedOperations.length).slice(0,24);
  if(blocks.some(b=>b.blockId===rightId))throw Error("Split identity collision");
  const left:IrLogicalBlock={...block,text:block.text.slice(0,offset),sources:before,
    status:"structured",audit:"unreviewed"};
  const right:IrLogicalBlock={...block,blockId:rightId,text:block.text.slice(offset),sources:after,
    status:"structured",audit:"unreviewed"};
  blocks.splice(i,1,left,right);
  return update(doc,blocks,{operationId:operationId(doc,"split",[blockId]),kind:"split",
    originalBlockIds:[blockId],resultBlockIds:[left.blockId,right.blockId],detail,mode:"explicit"},
    doc.reconstruction!.orderBasis);
}
/** Explicit order is a total permutation. Never silently sort by bbox.y in multicolumn PDFs. */
export function explicitReorderBlocks(doc:DocumentIrV1,blockIds:readonly string[],detail:string):DocumentIrV1{
  requireReview(doc);
  if(!detail.trim()||blockIds.length!==doc.blocks.length||
     new Set(blockIds).size!==blockIds.length||
     blockIds.some(id=>!doc.blocks.some(block=>block.blockId===id)))
    throw Error("Reading order must be an exact block ID permutation with a review reason");
  const lookup=new Map(doc.blocks.map(b=>[b.blockId,b]));
  return update(doc,blockIds.map(id=>lookup.get(id)!),{
    operationId:operationId(doc,"reorder",blockIds),kind:"reorder",
    originalBlockIds:doc.blocks.map(b=>b.blockId),resultBlockIds:[...blockIds],detail,mode:"explicit"},
    "explicit-reordered");
}

/** IR-WP5: text correction is staged in IR only; immutable raw OCR remains accessible.
 * Every user edit carries an operation-log reason and remains unreviewed.
 */
export function explicitReplaceBlockText(doc:DocumentIrV1,blockId:string,text:string,
  detail:string):DocumentIrV1{
  requireReview(doc);
  const blocks=[...doc.blocks].sort((a,b)=>a.readingOrder!-b.readingOrder!);
  const index=blocks.findIndex(b=>b.blockId===blockId);
  if(index<0||!detail.trim()||typeof text!=="string"||text.includes("\u0000")||
     text.length>250000)throw Error("Invalid block text correction or missing reason");
  const original=blocks[index];
  if(original.text===text)return doc;
  blocks[index]={...original,text,audit:"unreviewed",status:"structured"};
  return update(doc,blocks,{operationId:operationId(doc,"edit-text",[blockId]),
    kind:"edit-text",originalBlockIds:[blockId],resultBlockIds:[blockId],
    detail,mode:"explicit"},doc.reconstruction!.orderBasis);
}
