/** Book-local, volatile review metadata. The CM6 document remains the
 * only editable source. No implicit new table or settings/file store.
 */
import {projectV2NoteMatch} from './v2-note-match.js';
import {DEFAULT_NOTE_MATCH_CONFIG,validateNoteMatchConfig} from './lab-ocr/note-match-index.js';
import {projectReviewedNoteRows} from './lab-ocr/note-pair-review.js';
const byId=(rows,id)=>rows.find(r=>r.candidate_id===id);
const blockText=(base,id)=>base.mdRows.filter(r=>r.block_id===id).map(r=>r.text+'\n').join('');
export function makeNoteReview(base,referenceId,bodyId,decision){
  const ref=byId(base.index.references,referenceId);
  const pair=base.index.pairs.find(r=>r.reference_id===referenceId);
  const body=bodyId?byId(base.index.bodies,bodyId):null;
  if(!ref||!pair||!['待转换','待定','忽略'].includes(decision)||
     decision==='待转换'&&(!body||!pair.candidate_body_ids.includes(bodyId)))
    throw Error('注释候选已过期或没有确定注文');
  const refLine=base.mdRows.find(r=>r.line_id===ref.line_id);
  const bodyLine=body?base.mdRows.find(r=>r.line_id===body.line_id):null;
  const ids=new Set([ref.block_id,...(body?.body_block_ids??[])]);
  return Object.freeze({decision,body_id:bodyId??null,valid:true,
    ref_line_id:ref.line_id,ref_block_id:ref.block_id,ref_from:ref.from,ref_to:ref.to,
    ref_raw:ref.raw,ref_source_text:refLine.text,
    body_line_id:body?.line_id,body_block_id:body?.block_id,body_from:body?.from,body_to:body?.to,
    body_raw:body?.raw,body_source_text:bodyLine?.text,
    scope:ref.evidence.scope,blockEvidence:Object.freeze([...ids].map(id=>Object.freeze([id,blockText(base,id)])))});
}
export function createV2NoteSession(){
  let config=DEFAULT_NOTE_MATCH_CONFIG,index=null,base=null,projection=null,projectedDirty=null;
  const reviews=new Map();
  const clear=()=>{index=null;base=null;projection=null;projectedDirty=null;reviews.clear();};
  const reset=()=>{clear();config=DEFAULT_NOTE_MATCH_CONFIG;};
  const configure=next=>{config=validateNoteMatchConfig(next);clear();};
  const getBase=current=>{
    if(current!==index){
      base=projectV2NoteMatch(current,config);index=current;projection=null;
      for(const [id,review] of reviews){
        const ref=byId(base.index.references,id);
        if(!ref||ref.evidence.scope!==review.scope||review.blockEvidence.some(([bid,text])=>blockText(base,bid)!==text))
          reviews.delete(id);
      }
    }
    return base;
  };
  const project=(current,dirty=false)=>{
    const scan=getBase(current);
    if(projection&&projectedDirty===dirty)return projection;
    const decorated=projectReviewedNoteRows(scan,reviews,scan.mdRows,{showIgnored:true,dirty});
    const canonical=new Set(scan.index.pairs.filter(pair=>{
      if(pair.candidate_body_ids.length!==1)return false;
      const r=byId(scan.index.references,pair.reference_id),b=byId(scan.index.bodies,pair.candidate_body_ids[0]);
      return r?.evidence.rule_id==='ref.md-footnote'&&b?.evidence.rule_id==='body.md-footnote';
    }).map(pair=>pair.reference_id));
    projection=Object.freeze({...scan,rows:Object.freeze(decorated.map(row=>{
      if(canonical.has(row.reference_id))return Object.freeze({...row,
        review:'已转换',match_state:'已转换',status:'已转换',
        review_note:'当前正文已是标准 Obsidian 脚注；不依赖额外转换回执'});
      const saved=reviews.get(row.reference_id);
      if(saved?.decision==='待定'&&saved.valid)return Object.freeze({...row,match_state:'待核实',status:'待核实'});
      return row;
    }))});
    projectedDirty=dirty;return projection;
  };
  const choose=(current,row,choice,bodyId,dirty=false)=>{
    if(!project(current,dirty).rows.includes(row)||!row.reference_id||row.review==='已转换')throw Error('注释端点已经变化');
    const decision=choice==='待核实'?'待定':choice;
    reviews.set(row.reference_id,makeNoteReview(getBase(current),row.reference_id,bodyId,decision));
    projection=null;return true;
  };
  const recordIssue=(current,referenceId,bodyId,reason)=>{
    const review=makeNoteReview(getBase(current),referenceId,bodyId,'待转换');
    reviews.set(referenceId,Object.freeze({...review,issue:{reason}}));projection=null;
  };
  return Object.freeze({reset,configure,getConfig:()=>config,project,choose,getBase,recordIssue});
}
