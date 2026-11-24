/** WP2: readonly two-ended AG projection of WP1's source-evidence index.
 * One reference always owns its own pair rows. A body may be shared by refs.
 * Never use mutable PBS as identity; never invent a location for missing ends.
 */
import {projectNoteMatchIndex,DEFAULT_NOTE_MATCH_CONFIG} from './note-match-index.js';

const SYMBOL_ORDER=new Map([['*',0],['†',1],['‡',2]]);
/** Compare note labels as numbers, not ASCII strings (2 < 10). The letter
 * and symbol groups have stable book-agnostic order after numeric labels.
 */
export function compareNoteNumbers(left,right){
  const a=String(left??''),b=String(right??'');
  const rank=value=>/^\d+$/.test(value)?0:
    /^[a-z]$/i.test(value)?1:SYMBOL_ORDER.has(value)?2:3;
  const ar=rank(a),br=rank(b);
  if(ar!==br)return ar-br;
  if(ar===0)return Number(a)-Number(b);
  if(ar===2)return SYMBOL_ORDER.get(a)-SYMBOL_ORDER.get(b);
  return a.localeCompare(b,'en',{numeric:true,sensitivity:'base'});
}

/** Only gaps BETWEEN observed numeric labels in the same configured scope.
 * Unseen leading/trailing labels and reused numbers in another chapter are
 * unknowable, not evidence. These are prompts to check OCR, not conclusions.
 */
export function findMissingNoteNumbers(index){
  const scoped=new Map();
  for(const candidate of [...index.references,...index.bodies]){
    if(!/^[0-9]{1,3}$/.test(candidate.number))continue;
    const scope=candidate.evidence.scope;
    const values=scoped.get(scope)??new Set();
    values.add(Number(candidate.number));scoped.set(scope,values);
  }
  const missing=[];
  for(const [scope,values] of scoped){
    const ordered=[...values].sort((a,b)=>a-b);
    for(let i=1;i<ordered.length;i++){
      for(let number=ordered[i-1]+1;number<ordered[i];number++){
        missing.push(Object.freeze({number:String(number),scope,
          preceding:String(ordered[i-1]),following:String(ordered[i])}));
      }
    }
  }
  return Object.freeze(missing.sort((a,b)=>compareNoteNumbers(a.number,b.number)||
    a.scope.localeCompare(b.scope)));
}

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
      reason:pair.reason,scope:ref.evidence.scope,reference_id:pair.reference_id,
      candidate_body_ids:pair.candidate_body_ids,
      body_choices:Object.freeze(pair.candidate_body_ids.map(id=>{
        const item=bodyById.get(id);
        return Object.freeze({id,pbs:item?.pbs??'',line_no:item?.line_no??null});
      })),
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
  const missingNoteNumbers=findMissingNoteNumbers(index);
  for(const candidate of missingNoteNumbers){
    rows.push(Object.freeze({pair_id:`gap:${candidate.scope}:${candidate.number}`,
      number:candidate.number,kind:'缺号',status:'疑似缺号',
      reason:`在同一编号范围内发现 ${candidate.preceding}、${candidate.following}，`+
        `未发现注号 ${candidate.number} 的注引或注文；请检查 OCR 与编号规则`,
      scope:candidate.scope,candidate_count:0,
      note_row_id:`gap:${candidate.scope}:${candidate.number}`,
      line_id:null,line_no:null,block_id:null,pbs:'',
      from:null,to:null,raw:'',text:'（未发现该注号的注引和注文）',
      evidence:'',strength:'',page:null,
    }));
  }
  // Initial physical order also groups all occurrences of one number and
  // their corresponding bodies. AG applies the same numeric comparator as
  // its default sort; user-selected PBS/line sorting is never overwritten.
  const groups=new Map(),scopeOrder=new Map();
  for(const item of [...index.references,...index.bodies]){
    const scope=item.evidence.scope;
    scopeOrder.set(scope,Math.min(scopeOrder.get(scope)??Infinity,item.line_no));
  }
  for(const [ordinal,row] of rows.entries()){
    const groupKey=row.scope+'\u001f'+row.pair_id;
    if(!groups.has(groupKey))groups.set(groupKey,ordinal);
  }
  rows.sort((a,b)=>compareNoteNumbers(a.number,b.number)||
    (scopeOrder.get(a.scope)??Infinity)-(scopeOrder.get(b.scope)??Infinity)||
    groups.get(a.scope+'\u001f'+a.pair_id)-groups.get(b.scope+'\u001f'+b.pair_id)||
    (a.kind==='注引'?-1:1));
  return Object.freeze({index,rows:Object.freeze(rows),
    missing_note_numbers:missingNoteNumbers});
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
