/** Internal Sentence Lab AI exchange: ONE translatable sentence/block table.
 * No new public sentence API; neither CMD nor sentence-review sidecar changes.
 * Every row maps into existing CMD UTF-16 offsets. Protected markup is omitted
 * using the same lossless clean projection all three engines already share.
 */
import {extractTextBlocks} from './cmd-sentences.js';
import {parseCMDBlockTag} from './cmd-block-chains.js';

export const TRANSLATION_TABLE_SCHEMA='ocr2md-translation-units/v1';

function chunk(segments,from,to){
  const ranges=[],texts=[];
  for(const seg of segments){
    const a=Math.max(seg.from,from),b=Math.min(seg.to,to);
    if(a>=b)continue;
    const clean=seg.clean.slice(a-seg.from,b-seg.from).trim();
    if(!clean)continue;
    ranges.push({from:a,to:b});
    texts.push(clean);
  }
  const original=texts.join(' ').replace(/\s+/gu,' ').trim();
  return {original,sourceRanges:ranges};
}
/** Human-approved CMD B.lb=m is a logical *sentence* continuation, not
 * a request to renumber or physically concatenate two PBS source blocks.
 * The block-scoped sentence arbitrator cannot own this boundary: it has a
 * separate inventory row for each child. Rejoin ONLY explicitly reviewed
 * seams after preserving each atom's accepted interior boundaries. */
function mergeReviewedLinebreakRows(md,rows,review){
  const tags=[];let offset=0;
  for(const line of md.split('\n')){
    const tag=parseCMDBlockTag(line);
    if(tag)tags.push({id:tag.id,lb:tag.lb,at:offset});
    offset+=line.length+1;
  }
  let merged=0;
  for(let i=1;i<tags.length;i++){
    const next=tags[i],prior=tags[i-1];
    if(next.lb!=='m')continue;
    // The final row of A and first row of B are the only units touching
    // the reviewed seam; all other accepted sentence cuts stay untouched.
    const leftCandidates=rows.map((row,index)=>({row,index})).filter(({row})=>
      (row.blockIds||[row.blockId]).includes(prior.id)&&row.to<=next.at);
    const rightCandidates=rows.map((row,index)=>({row,index})).filter(({row})=>
      row.blockId===next.id&&row.from>next.at);
    const left=leftCandidates.at(-1),right=rightCandidates[0];
    if(!left||!right||right.index!==left.index+1||
        left.row.to>=right.row.from)
      throw Error('Reviewed CMD merge cannot map adjacent AI units: '+
        prior.id+' → '+next.id);
    if(review.manualGold?.[String(left.row.to)]?.break===true||
        review.manualGold?.[String(right.row.from)]?.break===true)
      throw Error('Reviewed CMD merge conflicts with explicit Gold break: '+next.id);
    const allBlockIds=[...new Set([...(left.row.blockIds||[left.row.blockId]),
      ...(right.row.blockIds||[right.row.blockId])])];
    const sentence=left.row.type==='sentence'&&right.row.type==='sentence';
    const joined={...left.row,
      type:sentence?'sentence':'text_block',
      decision:sentence?(left.row.decision==='arbitrated'||
        right.row.decision==='arbitrated'?'arbitrated':'auto'):'whole_block',
      to:right.row.to,
      sourceRanges:[...left.row.sourceRanges,...right.row.sourceRanges],
      blockIds:allBlockIds,
      original:(left.row.original+' '+right.row.original).replace(/\s+/gu,' ').trim()};
    rows.splice(left.index,2,joined);
    merged++;
  }
  // Keep all positions in the unmodified CMD, never silently create a gap
  // or overlap in the AI row sequence after joining reviewed seams.
  for(let i=0;i<rows.length;i++){
    const row=rows[i],parts=row.sourceRanges;
    if(parts[0]?.from!==row.from||parts.at(-1)?.to!==row.to||
      parts.some((part,j)=>part.from>=part.to||
        (j>0&&parts[j-1].to>part.from))||
      (i>0&&rows[i-1].to>row.from))
      throw Error('Reviewed merge damaged CMD source coordinates: '+row.id);
  }
  return merged;
}
/** Source-only fallback for translatable blocks omitted by the NLP splitter.
 * Headings, note bodies and hard-break prose are still valid whole-block AI
 * units. HTML/media/equations/fenced code/MinerU evidence never travel.
 */
function nonSegmentedTextBlocks(md,inventory){
  const tags=[];
  let from=0;
  for(const line of md.split('\n')){
    const tag=parseCMDBlockTag(line);
    if(tag)tags.push({id:tag.id,from,bodyFrom:from+line.length});
    from+=line.length+1;
  }
  const blocks=[];
  for(let i=0;i<tags.length;i++){
    const tag=tags[i];
    if(inventory.has(tag.id))continue;
    const end=tags[i+1]?.from??md.length;
    const body=md.slice(tag.bodyFrom,end);
    if(/<!--\s*ocr2md:latex\b/u.test(body))continue;
    const masked=body.replace(/<!--[\s\S]*?-->/gu,match=>' '.repeat(match.length));
    if(/^(?:\s|>)*(?:<table\b|!\[[^\]]*\]\(|\x60{3}|~{3})/mu.test(masked.trim()))continue;
    let offset=0,inFence=false;
    const segments=[];
    for(const line of masked.split('\n')){
      const lineFrom=tag.bodyFrom+offset;
      offset+=line.length+1;
      if(/^\s*(?:\x60{3,}|~{3,})/u.test(line)){inFence=!inFence;continue;}
      if(inFence)continue;
      // Each text range remains aligned to the exact CMD source, while
      // leading Markdown heading/note/quote syntax stays behind.
      let start=/^[ \t]*(?:>[ \t]?){0,3}/u.exec(line)?.[0].length??0;
      const rest=line.slice(start);
      if(/^\[![^\]]+\]/u.test(rest))continue;
      if(/^#{1,6}[ \t]+/u.test(rest))start+=/^#{1,6}[ \t]+/u.exec(rest)[0].length;
      else if(/^\[\^[^\]]+\]:[ \t]*/u.test(rest))
        start+=/^\[\^[^\]]+\]:[ \t]*/u.exec(rest)[0].length;
      else if(/^(?:!\[|<|\||\$|\\\[|\\begin\b|[-=]{3,}\s*$)/u.test(rest))
        continue;
      const untrimmed=line.slice(start).trimEnd();
      const leading=untrimmed.length-untrimmed.trimStart().length;
      const text=untrimmed.trim();
      if(!/[\p{L}\p{N}]/u.test(text))continue;
      const sourceFrom=lineFrom+start+leading;
      const sourceTo=sourceFrom+text.length;
      if(md.slice(sourceFrom,sourceTo)!==text)
        throw Error('Fallback source mapping mismatch: '+tag.id);
      segments.push({from:sourceFrom,to:sourceTo,clean:text});
    }
    if(segments.length)blocks.push({id:tag.id,segments,
      elementType:/^\s*#{1,6}\s/mu.test(masked)?'heading':
        /<!--\s*ocr2md:note-body\b/u.test(body)?'note_body':'paragraph'});
  }
  return blocks;
}
/** Build, never persist, one complete AI-ready table. Unarbitrated blocks
 * are valid whole-block rows, not exceptions or "pending" errors.
 * The output has a single rows[] collection—no separate pending/whole table.
 */
export function buildTranslationTable(md,review,inventory){
  if(typeof md!=='string'||!inventory?.values||
    !review||typeof review.sourceSha256!=='string')
    throw TypeError('Saved CMD, its review and PBS inventory are required');
  const perBlock=new Map();
  const projection=extractTextBlocks(md);
  for(const run of projection.runs){
    for(const seg of run.segments){
      if(!inventory.has(seg.blockId))continue;
      const clean=run.clean.slice(seg.start,seg.end);
      if(clean.length!==seg.sourceTo-seg.sourceFrom||
          md.slice(seg.sourceFrom,seg.sourceTo)!==seg.raw)
        throw Error('Translation source mapping mismatch: '+seg.blockId);
      if(!perBlock.has(seg.blockId))perBlock.set(seg.blockId,[]);
      perBlock.get(seg.blockId).push({
        from:seg.sourceFrom,to:seg.sourceTo,clean
      });
    }
  }
  const rows=[],manualGold=review.manualGold||{};
  for(const block of inventory.values()){
    const segments=(perBlock.get(block.id)||[]).sort((a,b)=>a.from-b.from);
    if(!segments.length)throw Error('Text PBS block has no projected text: '+block.id);
    const from=segments[0].from,to=segments.at(-1).to;
    const chosen=review.blocks?.[block.id];
    const segmented=chosen?.status==='auto'||chosen?.status==='arbitrated';
    let boundaries=[];
    if(segmented){
      const selected=new Set(chosen.boundaries||[]);
      // Gold is authoritative, but only when its position touches a real
      // text projection for this particular PBS block.
      for(const [offset,decision] of Object.entries(manualGold)){
        const pos=Number(offset);
        if(!segments.some(s=>pos>s.from&&pos<=s.to))continue;
        if(decision?.break)selected.add(pos);
        else selected.delete(pos);
      }
      boundaries=[...selected].filter(pos=>Number.isInteger(pos)&&pos>from&&pos<=to&&
        segments.some(s=>pos>s.from&&pos<=s.to)).sort((a,b)=>a-b);
    }
    const ends=segmented?[...boundaries,to]:[to];
    let cursor=from,ordinal=0;
    for(const end of ends){
      if(end<cursor)throw Error('Non-monotone sentence boundary');
      const sliced=chunk(segments,cursor,end);
      cursor=end;
      if(!sliced.original)continue;
      ordinal++;
      rows.push({
        id:block.id+(segmented?'-s':'-b')+String(ordinal).padStart(3,'0'),
        blockId:block.id,
        type:segmented?'sentence':'text_block',
        elementType:'paragraph',
        decision:segmented?chosen.status:'whole_block',
        from:sliced.sourceRanges[0].from,
        to:sliced.sourceRanges.at(-1).to,
        sourceRanges:sliced.sourceRanges,
        original:sliced.original,
        corrected:null,
        translation:null
      });
    }
    if(cursor!==to||ordinal===0)
      throw Error('Untranslated prose block lost during table assembly: '+block.id);
    // Every *translatable character* from the protected NLP text projection
    // must occur in output exactly once (whitespace is normalized for AI).
    const cleanSource=segments.map(s=>s.clean).join('').replace(/\s+/gu,'');
    const inRows=rows.filter(r=>r.blockId===block.id)
      .map(r=>r.original).join('').replace(/\s+/gu,'');
    if(cleanSource!==inRows)
      throw Error('Translatable characters lost or duplicated: '+block.id);
  }
  for(const fallback of nonSegmentedTextBlocks(md,inventory)){
    const segments=fallback.segments;
    const piece=chunk(segments,segments[0].from,segments.at(-1).to);
    if(!piece.original)continue;
    rows.push({
      id:fallback.id+'-b001',blockId:fallback.id,
      type:'text_block',elementType:fallback.elementType,
      decision:'whole_block',
      from:piece.sourceRanges[0].from,to:piece.sourceRanges.at(-1).to,
      sourceRanges:piece.sourceRanges,
      original:piece.original,corrected:null,translation:null
    });
  }
  rows.sort((a,b)=>a.from-b.from||a.to-b.to);
  mergeReviewedLinebreakRows(md,rows,review);
  return {
    schema:TRANSLATION_TABLE_SCHEMA,
    sourceSha256:review.sourceSha256,
    coordinate:'UTF-16 source offsets in unchanged CMD',
    rows
  };
}
