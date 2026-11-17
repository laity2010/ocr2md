/** WP2: readonly two-ended AG projection of WP1's source-evidence index.
 * One reference always owns its own pair rows. A body may be shared by refs.
 * Never use mutable PBS as identity; never invent a location for missing ends.
 */
import {projectNoteMatchIndex,DEFAULT_NOTE_MATCH_CONFIG} from './note-match-index.js';

export function projectNoteMatchRows(mdRows,blockRows,config=DEFAULT_NOTE_MATCH_CONFIG){
  const index=projectNoteMatchIndex(mdRows,blockRows,config);
  const refById=new Map(index.references.map(item=>[item.candidate_id,item]));
  const bodyById=new Map(index.bodies.map(item=>[item.candidate_id,item]));
  const rows=[];
  for(const pair of index.pairs){
    const ref=refById.get(pair.reference_id);
    if(!ref)continue;
    const candidates=pair.candidate_body_ids.length?pair.candidate_body_ids:[null];
    const base={pair_id:pair.pair_id,number:pair.number,status:pair.status,
      reason:pair.reason,scope:ref.evidence.scope,
      candidate_count:pair.candidate_body_ids.length};
    rows.push(Object.freeze({...base,kind:'注引',note_row_id:`${pair.pair_id}:ref`,
      line_id:ref.line_id,line_no:ref.line_no,block_id:ref.block_id,pbs:ref.pbs,
      from:ref.from,to:ref.to,raw:ref.raw,text:ref.context,
      evidence:ref.evidence.rule_id,strength:ref.evidence.strength,
      page:ref.page}));
    for(const [i,id] of candidates.entries()){
      const body=id?bodyById.get(id):null;
      rows.push(Object.freeze({...base,kind:'注文',
        note_row_id:`${pair.pair_id}:body:${i}`,line_id:body?.line_id??null,
        line_no:body?.line_no??null,block_id:body?.block_id??null,pbs:body?.pbs??'',
        from:body?.from??null,to:body?.to??null,raw:body?.raw??'',
        text:body?.content??'（未找到对应注文）',evidence:body?.evidence.rule_id??'',
        strength:body?.evidence.strength??'',page:body?.page??null,
        body_line_ids:body?.body_line_ids??[],
        body_block_ids:body?.body_block_ids??[],
      }));
    }
  }
  for(const body of index.orphan_bodies){
    rows.push(Object.freeze({pair_id:`orphan:${body.candidate_id}`,number:body.number,
      kind:'注文',status:'缺注引',reason:'此注文在当前匹配范围没有对应注引',
      scope:body.evidence.scope,candidate_count:0,
      note_row_id:`orphan:${body.candidate_id}:body`,
      line_id:body.line_id,line_no:body.line_no,block_id:body.block_id,pbs:body.pbs,
      from:body.from,to:body.to,raw:body.raw,text:body.content,
      evidence:body.evidence.rule_id,strength:body.evidence.strength,
      page:body.page,body_line_ids:body.body_line_ids,
      body_block_ids:body.body_block_ids}));
  }
  return Object.freeze({index,rows:Object.freeze(rows)});
}

/** Explicitly resolve the clicked physical end, not the other end or block start. */
export function resolveNoteMatchFocus(noteRow,mdRows,blockRows){
  if(!noteRow?.line_id||!Number.isInteger(noteRow.from)||
     !Number.isInteger(noteRow.to)||noteRow.to<=noteRow.from)return null;
  const line=mdRows.find(item=>item.line_id===noteRow.line_id);
  if(!line||line.block_id!==noteRow.block_id||
     line.line_no!==noteRow.line_no||
     line.text.slice(noteRow.from,noteRow.to)!==noteRow.raw)return null;
  const block=blockRows.find(item=>item.block_id===line.block_id);
  return Object.freeze({lineId:line.line_id,lineNo:line.line_no,
    blockId:line.block_id,page:Number.isInteger(block?.global_page)?
      block.global_page+1:null,pbs:block?.pbs??null,
    from:noteRow.from,to:noteRow.to,side:noteRow.kind});
}
