/** Internal Sentence Lab review model. Two PUBLIC sentence operations stay
 * split(md,engine) and rebuild(result). Review state is separate from CMD.
 * Source offsets and boundaries are UTF-16 units, matching CM6 + split().
 */
import {extractTextBlocks} from './cmd-sentences.js';
import {parseCMDBlockTag} from './cmd-block-chains.js';

export const REVIEW_SCHEMA='ocr2md-sentence-review/v1';
export const REVIEW_ENGINES=['intl','sentence-splitter','wink-nlp'];
export function reviewInventory(md,runs){
  const pieces=extractTextBlocks(md).sourcePieces.filter(p=>p.kind==='text');
  const tags=[];
  let pos=0;
  for(const line of md.split('\n')){
    const parsed=parseCMDBlockTag(line);
    if(parsed)tags.push({id:parsed.id,from:pos});
    pos+=line.length+1;
  }
  const byId=new Map();
  for(let i=0;i<tags.length;i++){
    const tag=tags[i],to=tags[i+1]?.from??md.length;
    const text=pieces.filter(p=>p.blockId===tag.id&&p.from>=tag.from&&p.to<=to);
    if(!text.length)continue; // no fake "approved" structural/empty blocks
    const entries=REVIEW_ENGINES.map(engine=>{
      const result=runs.get(engine);
      if(!result?.lossless||!result.value?.sentences)return {engine,valid:false,boundaries:[],covered:false};
      const sentences=result.value.sentences;
      const covered=sentences.some(s=>(s.fragments??[]).some(f=>f.blockId===tag.id));
      const boundaries=[...new Set(sentences.filter(s=>s.fragments?.at(-1)?.blockId===tag.id)
        .map(s=>s.fragments.at(-1).to))].sort((a,b)=>a-b);
      return {engine,valid:true,boundaries,covered};
    });
    const eligible=entries.every(e=>e.valid&&e.covered);
    const signature=x=>JSON.stringify(x.boundaries);
    const agreed=eligible&&entries.every(e=>signature(e)===signature(entries[0]));
    byId.set(tag.id,{id:tag.id,from:tag.from,to,textFrom:text[0].from,
      covered:eligible,agreed,disagreed:eligible&&!agreed,engines:entries,
      boundaries:agreed?entries[0].boundaries:[]});
  }
  return byId;
}
export function blockAt(inventory,offset){
  if(!Number.isInteger(offset))return null;
  let closest=null;
  for(const row of inventory.values()){
    if(row.from>offset)break;
    if(offset>=row.from&&offset<row.to)closest=row;
  }
  return closest;
}
export function freshReview(sha){
  return {schema:REVIEW_SCHEMA,sourceSha256:sha,blocks:{},manualGold:{}};
}
export function synchronizeReview(review,inventory){
  const next={...review,blocks:{}};
  for(const row of inventory.values()){
    const previous=review.blocks?.[row.id];
    if(previous?.status==='arbitrated'){
      const chosen=row.engines.find(e=>e.engine===previous.engine&&e.valid&&e.covered);
      if(chosen)next.blocks[row.id]={status:'arbitrated',engine:chosen.engine,
        boundaries:[...chosen.boundaries]};
      continue;
    }
    if(row.agreed)next.blocks[row.id]={status:'auto',boundaries:[...row.boundaries]};
  }
  return next;
}
export function reviewChanged(a,b){
  return JSON.stringify(a.blocks)!==JSON.stringify(b.blocks)||
    JSON.stringify(a.manualGold??{})!==JSON.stringify(b.manualGold??{});
}
export function acceptedBoundaries(review,inventory){
  const positions=new Set();
  for(const [id,record] of Object.entries(review.blocks??{})){
    if(!inventory.has(id))continue;
    for(const offset of record.boundaries??[])positions.add(offset);
  }
  for(const [offset,decision] of Object.entries(review.manualGold??{})){
    if(decision.break)positions.add(Number(offset));
    else positions.delete(Number(offset));
  }
  return [...positions].sort((a,b)=>a-b);
}
