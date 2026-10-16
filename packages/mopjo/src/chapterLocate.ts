/** WP4.4/5 evidence and bidirectional hit testing, independent of PDF.js/CodeMirror.
 * Returned mappings are source-backed or explicitly unbound, never guessed. */
import type {OpenChapter} from './chapters';
import {sha256} from './core';
import {chapterSegmentIndex} from './chapterSegments';
import type {NoteReview} from './chapterV4Ops';
export interface ChapterHit {readonly blockId:string|null;readonly elementId:string|null;
  readonly evidenceKind:'ocr'|'discarded-unverified'|'manual-page';
  readonly page:number;readonly bbox:readonly number[]|null;
  readonly markdownRange:{from:number;to:number}|null;
  readonly precision:'original-element-bbox'|'original-segment-bbox'|'coarse-original-block'|'page-only'|'source-only';
  readonly segmentPointer?:string;}
const contains=(b:readonly number[],x:number,y:number)=>
  b.length===4&&x>=b[0]&&x<=b[2]&&y>=b[1]&&y<=b[3];
const mdRange=(doc:OpenChapter,id:string)=>{
  const r=doc.markdown.ranges.find(r=>r.blockId===id);
  return r?{from:r.contentFrom,to:r.contentTo}:null;
};
export function chapterPdfPoint(doc:OpenChapter,page:number,x:number,y:number):
  {kind:'unmatched'|'unique'|'ambiguous';matches:ChapterHit[]}{
  if(!Number.isSafeInteger(page)||page<1||!Number.isFinite(x)||!Number.isFinite(y)||
    x<0||x>1||y<0||y>1)throw Error('MOPJO INVALID_PDF_POINT');
  const matches:ChapterHit[]=[];
  const segmentMatches=chapterSegmentIndex(doc).filter(s=>s.page===page&&
    contains(s.normalizedBBox,x,y));
  const seen=new Set<string>();
  for(const s of segmentMatches){
    const key=s.blockId+'\0'+s.elementId+'\0'+s.segmentPointer;
    if(seen.has(key))continue;seen.add(key);
    const b=doc.blocks.find(b=>b.block.blockId===s.blockId)!;
    matches.push({blockId:s.blockId,elementId:s.elementId,evidenceKind:'ocr',
      page,bbox:s.bbox,markdownRange:b.hidden?null:mdRange(doc,s.blockId),
      precision:(b as {mappingPrecision?:'coarse-original-block'}).mappingPrecision??
        (s.hasSegmentBBox?'original-segment-bbox':'coarse-original-block'),
      segmentPointer:s.segmentPointer});
  }
  for(const block of doc.blocks)for(const e of block.evidence){
    if(e.pdfPageNumber===page&&contains(e.normalizedBBox,x,y)&&
      !segmentMatches.some(s=>s.blockId===block.block.blockId&&s.elementId===e.elementId)){
      const key=block.block.blockId+'\0'+e.elementId+'\0coarse';
      if(seen.has(key))continue;seen.add(key);
      matches.push({blockId:block.block.blockId,elementId:e.elementId,
        evidenceKind:'ocr',page,bbox:e.bbox,markdownRange:block.hidden?null:mdRange(doc,block.block.blockId),
        precision:(block as {mappingPrecision?:'coarse-original-block'}).mappingPrecision??'original-element-bbox'});
    }
  }
  for(const record of doc.original.supplementalEvidence??[]){
    const s=record.source;
    if(s.pdfPageNumber===page&&contains(s.normalizedBBox,x,y))
      matches.push({blockId:null,elementId:s.id,evidenceKind:'discarded-unverified',
        page,bbox:s.bbox,markdownRange:null,precision:'source-only'});
  }
  return {kind:!matches.length?'unmatched':matches.length===1?'unique':'ambiguous',matches};
}
export function chapterMarkdownOffset(doc:OpenChapter,offset:number):
  {kind:'unmatched'|'unique';hit?:ChapterHit}{
  if(!Number.isSafeInteger(offset)||offset<0||offset>doc.markdown.content.length)
    throw Error('MOPJO INVALID_MARKDOWN_OFFSET');
  const r=doc.markdown.ranges.find(r=>offset>=r.contentFrom&&offset<r.contentTo);
  if(!r)return {kind:'unmatched'};
  const b=doc.blocks.find(b=>b.block.blockId===r.blockId)!;
  const exact=chapterSegmentIndex(doc).filter(s=>s.blockId===r.blockId&&s.markdownRange&&
    offset>=s.markdownRange.from&&offset<s.markdownRange.to);
  const segment=exact.length===1?exact[0]:undefined;
  const e=b.evidence[0];
  return {kind:'unique',hit:{blockId:r.blockId,elementId:segment?.elementId??e?.elementId??null,
    evidenceKind:e?'ocr':'manual-page',page:e?.pdfPageNumber??b.manualPdfPage??0,
    bbox:segment?.bbox??e?.bbox??null,markdownRange:segment?.markdownRange??mdRange(doc,r.blockId),
    precision:e?(b as {mappingPrecision?:'coarse-original-block'}).mappingPrecision??
      (segment?.hasSegmentBBox?'original-segment-bbox':'coarse-original-block'):'page-only',
    ...(segment?{segmentPointer:segment.segmentPointer}:{})}};
}
export function chapterSourceEvidence(doc:OpenChapter){
  const owned=new Set(doc.original.sourceElements.map(x=>x.id));
  return [...doc.original.sourceElements.map(source=>({source,role:'logical-source' as const})),
    ...(doc.original.supplementalEvidence??[]).map(x=>({source:x.source,role:x.assignment}))]
    .map(({source,role})=>({elementId:source.id,type:source.type,page:source.pdfPageNumber,
      jsonPointer:source.jsonPointer,bbox:source.bbox,normalizedBBox:source.normalizedBBox,
      role,referencedBy:role==='logical-source'?
        doc.blocks.filter(b=>b.block.sources.some(x=>x.elementId===source.id))
          .map(b=>b.block.blockId):[],
      segments:source.segments.map(x=>({type:x.type,jsonPointer:x.jsonPointer,
        content:x.content??null,html:x.html??null,imagePath:x.imagePath??null}))}));
}
/** Physical OCR page_footnote is *evidence*, not a confirmed reference/body pair. */
export function chapterAnnotationAudit(doc:OpenChapter){
  const notes=(doc.original.supplementalEvidence??[]).filter(e=>e.source.type==='page_footnote');
  const info=notes.map(e=>{
    const rawText=e.source.segments.map(s=>s.content??'').join('\n');
    const m=/^\s*(?:<sup>\s*(\d+)\s*<\/sup>|\[\^(\d+)\]|(\d+)[.．、)]\s*)/u.exec(rawText);
    return {source:e.source,rawText,detectedNumber:m?Number(m[1]??m[2]??m[3]):null};
  });
  return info.map(({source,rawText,detectedNumber})=>{
    const reviews=doc.blocks.flatMap(b=>(b as {noteReviews?:readonly NoteReview[]}).noteReviews??[])
      .filter(x=>x.noteElementId===source.id);
    const candidates=detectedNumber===null?[]:doc.blocks.filter(b=>b.pdfPages.includes(source.pdfPageNumber)&&
      (b.block.text.includes(`<sup>${detectedNumber}</sup>`)||
       b.block.text.includes(`[^${detectedNumber}]`))).map(b=>b.block.blockId);
    const duplicate=detectedNumber!==null&&info.filter(x=>x.source.pdfPageNumber===source.pdfPageNumber&&
      x.detectedNumber===detectedNumber).length>1;
    return {noteElementId:source.id,pdfPage:source.pdfPageNumber,bbox:source.bbox,rawText,
      detectedNumber,candidateReferenceBlockIds:candidates,
      assignment:'page-proximity-unverified' as const,
      reviews,status:reviews.length?'reviewed' as const:
        duplicate?'ambiguous' as const:'needs-review' as const};
  });
}
/** Derive a reviewable tree from the current block order; original tree remains immutable. */
export function effectiveChapterTree(doc:OpenChapter){
  const original=new Map(doc.original.chapterTree.map(x=>[x.anchorBlockId,x]));
  const output:typeof doc.original.chapterTree[number][]=[];
  for(let i=0;i<doc.blocks.length;i++){
    const block=doc.blocks[i] as typeof doc.blocks[number]&{headingLevel?:number};
    if(block.hidden||block.block.type!=='title')continue;
    const prior=original.get(block.block.blockId);
    const level=block.headingLevel??(/^#+/u.exec(block.content)?.[0].length??2);
    const root=[...output].reverse().find(x=>x.depth===1)||doc.original.chapterTree.find(x=>x.depth===1);
    let parent=prior?.parentChapterId??root?.chapterId??null;
    if(level===3){
      const preceding=output.slice().reverse().find(x=>x.depth===2);
      if(preceding)parent=preceding.chapterId;
    }
    if(level===2&&root)parent=root.chapterId;
    output.push(prior?{...prior,name:block.block.text,depth:level,parentChapterId:parent}:
      {chapterId:'mch_'+sha256(block.block.blockId).slice(0,24),
        anchorBlockId:block.block.blockId,parentChapterId:parent,
        name:block.block.text,depth:level,order:i,status:'provisional'});
  }
  return output;
}
