/** WCP54 pure MD row mapping. CM6 holds this value in a StateField.
 * Rows own line IDs and block provenance; line_no is derived 1..N.
 * No localStorage, DOM, network, SQL, or parallel mutable document store.
 */
export const textOfRows=rows=>rows.map(row=>row.text).join('\n');
const fail=reason=>{throw Error('MD 行状态无效：'+reason);};
export function validateMdRows(rows){
  if(!Array.isArray(rows)||!rows.length||rows.length>40000)fail('行数量');
  const ids=new Set();
  rows.forEach((row,index)=>{
    if(!row||typeof row.line_id!=='string'||!row.line_id||
       ids.has(row.line_id)||row.line_no!==index+1||
       typeof row.text!=='string'||/[\r\n]/.test(row.text)||
       (row.block_id!=null&&(!Number.isSafeInteger(row.block_id)||row.block_id<1)))
      fail('第 '+(index+1)+' 行');
    ids.add(row.line_id);
  });
  return rows;
}
const renumber=rows=>rows.map((row,index)=>({...row,line_no:index+1}));
const same=(a,b)=>a.line_id===b.line_id&&a.block_id===b.block_id&&a.text===b.text;
export function reconcileMdText(previous,newText,makeId){
  if(typeof newText!=='string'||typeof makeId!=='function')fail('编辑输入');
  if(newText.includes('\r'))fail('CR 字符需要显式处理');
  validateMdRows(previous);
  const nextText=newText.split('\n');
  if(nextText.length>40000)fail('超过最大行数');
  const oldText=previous.map(row=>row.text);
  let prefix=0;
  while(prefix<oldText.length&&prefix<nextText.length&&
        oldText[prefix]===nextText[prefix])prefix++;
  let suffix=0;
  while(suffix<oldText.length-prefix&&suffix<nextText.length-prefix&&
        oldText[oldText.length-1-suffix]===nextText[nextText.length-1-suffix])suffix++;
  const output=previous.slice(0,prefix).map(row=>({...row}));
  const changedOld=previous.slice(prefix,previous.length-suffix);
  const changedNew=nextText.slice(prefix,nextText.length-suffix);
  // A typed edit keeps its line identity. A split inserts new IDs.
  // An inserted leading blank line can remain unowned (block_id=null).
  const owner=changedOld[0]?.block_id??
    (prefix===0?null:output.at(-1)?.block_id??null);
  changedNew.forEach((text,index)=>{
    const current=changedOld[index];
    output.push({line_id:current?.line_id??makeId(),
      block_id:current?current.block_id:owner,
      line_no:0,text});
  });
  output.push(...(suffix?previous.slice(-suffix).map(row=>({...row})):[]));
  return validateMdRows(renumber(output));
}
export function mdSplice(before,after){
  validateMdRows(before);validateMdRows(after);
  let prefix=0;
  while(prefix<before.length&&prefix<after.length&&same(before[prefix],after[prefix]))prefix++;
  let suffix=0;
  while(suffix<before.length-prefix&&suffix<after.length-prefix&&
        same(before[before.length-suffix-1],after[after.length-suffix-1]))suffix++;
  if(prefix===before.length&&prefix===after.length)return null;
  return {start:prefix+1,deleteCount:before.length-prefix-suffix,
    insert:after.slice(prefix,after.length-suffix).map(({line_id,block_id,text})=>
      ({line_id,block_id,text}))};
}
export function createMdRuntime(rows,revision=0){
  validateMdRows(rows);
  if(!Number.isSafeInteger(revision)||revision<0)fail('SQLite revision');
  return {rows,revision,savedRows:rows,version:0,dirty:false};
}
export function editedMdRuntime(state,newText,makeId){
  if(!state)fail('尚未载入 MD');
  // An explicitly approved legacy migration is one CM6 history transaction.
  // CM6 undo/redo changes the source text; restore the EXACT original LineID
  // and BlockID snapshots instead of trying to infer a mass edit from rows.
  // The snapshots live in the one CM6 StateField, not a second mutable store.
  const migration=state.migration;
  if(migration&&(newText===migration.before||newText===migration.after)){
    const rows=newText===migration.before?migration.beforeRows:migration.afterRows;
    if(!mdSplice(state.rows,rows))return state;
    return {...state,rows,version:state.version+1,
      dirty:Boolean(mdSplice(state.savedRows,rows))};
  }
  const next=reconcileMdText(state.rows,newText,makeId);
  if(!mdSplice(state.rows,next))return state;
  return {...state,rows:next,migration:null,version:state.version+1,
    dirty:Boolean(mdSplice(state.savedRows,next))};
}
/** Explicit legacy projection migration. No migration on normal load/GET. */
export function migratedMdRuntime(state,rows){
  if(!state)fail('尚未载入 MD');
  validateMdRows(rows);
  if(!mdSplice(state.rows,rows))return state;
  return {...state,rows,version:state.version+1,
    dirty:Boolean(mdSplice(state.savedRows,rows)),migration:{
      before:textOfRows(state.rows),after:textOfRows(rows),
      beforeRows:state.rows,afterRows:rows,
    }};
}
export function acknowledgeMdRuntime(state,savedRows,revision){
  if(!state||!Array.isArray(savedRows)||revision!==state.revision+1)
    fail('保存回执版本不匹配');
  return {...state,revision,savedRows,dirty:Boolean(mdSplice(savedRows,state.rows))};
}
export function mdRowAtPosition(text,position){
  if(!Number.isInteger(position)||position<0||position>text.length)
    fail('CM6 偏移越界');
  return text.slice(0,position).split('\n').length;
}
export function mdLineOffset(rows,lineNo){
  validateMdRows(rows);
  if(!Number.isInteger(lineNo)||lineNo<1||lineNo>rows.length)
    fail('行号越界');
  let offset=0;
  for(let index=0;index<lineNo-1;index++)offset+=rows[index].text.length+1;
  return offset;
}
const pbsRank=row=>{
  const match=/^p(\d+)b(\d+)/.exec(String(row.pbs??''));
  return [match?Number(match[1]):row.global_page+1,
          match?Number(match[2]):row.sibling_order,row.sibling_order,row.block_id];
};
export function reviewBlockOrder(blocks){
  const live=blocks.filter(row=>row.absorbed_into_block_id==null);
  const nodes=new Map(live.map(row=>[row.block_id,row]));
  if(nodes.size!==live.length)fail('重复 BlockID');
  const children=new Map();
  for(const row of live){
    if(row.parent_block_id!=null&&!nodes.has(row.parent_block_id))
      fail('缺失 Block 父节点');
    const list=children.get(row.parent_block_id)||[];
    list.push(row);children.set(row.parent_block_id,list);
  }
  const compare=(a,b)=>{
    const x=pbsRank(a),y=pbsRank(b);
    for(let i=0;i<4;i++)if(x[i]!==y[i])return x[i]-y[i];
    return 0;
  };
  children.get(null)?.sort(compare);
  for(const [parent,group] of children)
    if(parent!=null)group.sort((a,b)=>a.sibling_order-b.sibling_order||a.block_id-b.block_id);
  const output=[],seen=new Set();
  function walk(row){
    if(seen.has(row.block_id))fail('Block 循环');
    seen.add(row.block_id);output.push(row.block_id);
    for(const child of children.get(row.block_id)||[])walk(child);
  }
  for(const row of children.get(null)||[])walk(row);
  if(output.length!==live.length)fail('未关联的 Block 节点');
  return output;
}
export function reorderMdByBlocks(mdRows,blocks){
  validateMdRows(mdRows);
  const ordered=reviewBlockOrder(blocks);
  const active=new Set(ordered);
  const archived=new Map(blocks.filter(r=>r.absorbed_into_block_id!=null)
    .map(r=>[r.block_id,r.absorbed_into_block_id]));
  const content=new Map(),unowned=[];
  for(const row of mdRows){
    if(row.block_id==null){unowned.push(row);continue;}
    let blockId=row.block_id;
    if(archived.has(blockId)){
      // An absorbed wrapper is no longer a visible MD atom.  Never discard
      // manually edited nonblank content; attach it to the surviving parent.
      if(row.text==='')continue;
      blockId=archived.get(blockId);
    }
    if(!active.has(blockId))fail('MD 引用了不存在的 BlockID '+blockId);
    const group=content.get(blockId)||[];
    group.push({...row,block_id:blockId});
    content.set(blockId,group);
  }
  const reordered=renumber([...unowned,...ordered.flatMap(id=>content.get(id)||[])]);
  if(!reordered.length)fail('整理后正文为空');
  return validateMdRows(reordered);
}
