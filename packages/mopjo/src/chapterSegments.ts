/** WP4.5 precise OCR segment sources + best-effort MD span.
 * Never guesses an offset where multiple identical occurrences exist. */
import type {OpenChapter} from './chapters';
export interface ChapterSegmentView {
  readonly elementId:string;readonly segmentPointer:string;readonly blockId:string;
  readonly kind:string;readonly page:number;readonly bbox:readonly number[];
  readonly normalizedBBox:readonly number[];readonly hasSegmentBBox:boolean;
  readonly markdownRange:{from:number;to:number}|null;
  readonly resolution:'unique-source-text'|'ambiguous-text'|'not-present-in-projection'|'hidden';
}
export function chapterSegmentIndex(doc:OpenChapter):ChapterSegmentView[]{
  const sources=new Map(doc.original.sourceElements.map(e=>[e.id,e]));
  const ranges=new Map(doc.markdown.ranges.map(r=>[r.blockId,r]));
  const rows:ChapterSegmentView[]=[];
  for(const b of doc.blocks){
    const range=ranges.get(b.block.blockId);
    for(const ref of b.block.sources){
      const src=sources.get(ref.elementId);
      if(!src)throw Error('MOPJO SEGMENT_SOURCE_MISSING');
      const candidates=ref.segmentPointer?
        src.segments.filter(s=>s.jsonPointer===ref.segmentPointer):src.segments;
      for(const seg of candidates){
        const raw=seg.content??seg.html??seg.imagePath??'';
        const probes=[raw,raw.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')];
        const unique=new Map<number,number>();
        for(const candidate of probes){
          if(!candidate)continue;
          let from=b.content.indexOf(candidate);
          while(from>=0){unique.set(from,candidate.length);from=b.content.indexOf(candidate,from+1);}
        }
        const starts=[...unique.keys()];
        const pos=starts.length===1?starts[0]:-1;
        const bbox=seg.bbox??src.bbox;
        const normalized=bbox.map((n,i)=>n/src.pageSize[i%2]);
        rows.push({elementId:src.id,segmentPointer:seg.jsonPointer,
          blockId:b.block.blockId,kind:seg.type,page:src.pdfPageNumber,bbox,
          normalizedBBox:normalized,hasSegmentBBox:Boolean(seg.bbox),
          markdownRange:range&&pos>=0?{from:range.contentFrom+pos,to:range.contentFrom+pos+unique.get(pos)!}:null,
          resolution:!range?'hidden':starts.length>1?'ambiguous-text':
            pos<0?'not-present-in-projection':'unique-source-text'});
      }
    }
  }
  return rows;
}
