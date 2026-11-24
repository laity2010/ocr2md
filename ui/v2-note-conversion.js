/** V1 note pair/group conversion plans, adapted to one V2 revision.
 * No conversion writes until all selected line changes have been checked.
 */
import {planNotePairConversion,planNotePairGroupConversion} from './lab-ocr/note-pair-conversion.js';
import {makeNoteReview} from './v2-note-session.js';

export function planV2NoteConversion(session,index){
  const scan=session.project(index),groups=new Map(),failures=[];
  for(const row of scan.rows){
    if(row.kind!=='注引'||row.match_state!=='已匹配')continue;
    const bodyId=row.selected_body_id??(row.body_choices.length===1?row.body_choices[0].id:null);
    const item={row,bodyId};
    const list=groups.get(row.line_id)??[];list.push(item);groups.set(row.line_id,list);
  }
  const plans=[];
  for(const items of groups.values()){
    try{
      const pairs=items.map(({row,bodyId})=>({
        referenceId:row.reference_id,bodyId,
        review:makeNoteReview(scan,row.reference_id,bodyId,'待转换')}));
      const input={mdRows:scan.mdRows,blockRows:scan.blockRows,configuration:scan.index.configuration};
      const plan=pairs.length===1?planNotePairConversion({...input,...pairs[0]}):
        planNotePairGroupConversion({...input,pairs});
      plans.push({items,updates:plan.updates});
    }catch(error){for(const item of items)failures.push({...item,reason:error.message});}
  }
  // Shared body updates may be identical. If two independently planned
  // groups conflict on any physical line, reject BOTH groups, not last-wins.
  const lineOwners=new Map(),conflicts=new Set();
  for(const plan of plans){
    for(const update of plan.updates){
      const prior=lineOwners.get(update.lineId)??[];
      for(const other of prior){
        if(other.update.beforeText!==update.beforeText||other.update.afterText!==update.afterText){
          conflicts.add(other.plan);conflicts.add(plan);
        }
      }
      prior.push({plan,update});lineOwners.set(update.lineId,prior);
    }
  }
  const updates=new Map();let converted=0;
  for(const plan of plans){
    if(conflicts.has(plan)){
      for(const item of plan.items)failures.push({...item,reason:'不同配对组对同一源码行提出不一致修改，请人工核对'});
      continue;
    }
    const mapped=plan.updates.map(u=>{
      const ref=index.makeRef(u.lineNo),line=index.resolve(ref);
      if(!line||line.logical_id!==u.blockId||line.md_line!==u.beforeText)
        throw Error('注释转换的公共行证据已变化');
      return [u.lineId,Object.freeze({ref,beforeText:u.beforeText,afterText:u.afterText})];
    });
    for(const [key,update] of mapped)updates.set(key,update);
    converted+=plan.items.length;
  }
  return Object.freeze({updates:Object.freeze([...updates.values()]),converted,failures:Object.freeze(failures)});
}
