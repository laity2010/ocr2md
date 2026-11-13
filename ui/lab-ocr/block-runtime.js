/** Lab OCR CM6 Block runtime reducer (pure, no DOM/SQL).
 * The Editor StateField is the sole writable runtime owner of these values.
 * SQL is an eventual, revision-checked replica. AG/PDF see projections only.
 */
const fail=message=>{throw Error(message);};
const idOf=value=>Number.isSafeInteger(Number(value))?Number(value):NaN;
const snapshot=rows=>rows.map(r=>[r.block_id,r.parent_block_id,r.sibling_order,r.pbs])
  .sort((a,b)=>a[0]-b[0]);
const same=(a,b)=>a.every((v,i)=>v===b[i]);
function validateRows(rows){
  const ids=new Set();
  for(const row of rows){
    if(!Number.isSafeInteger(row.block_id)||row.block_id<1||ids.has(row.block_id)||
       !Number.isInteger(row.global_page)||row.global_page<0||row.block_group!=='para_blocks')
      fail('CM Block 内存初始化数据异常');
    ids.add(row.block_id);
  }
}
/** Flatten one page to [root, direct child...] in DFS reading order.
 * PBS is display-only; parentBlockId and stable BlockID carry identity.
 */
export function planFlattenPageInMemory(rows,page){
  if(!Number.isInteger(page)||page<1)fail('两级整理页码无效');
  const group=rows.filter(row=>row.global_page===page-1);
  if(!group.length||group.length>5000)fail('需要完整的 para 页面才能整理 Block');
  const nodes=new Map(group.map(r=>[r.block_id,{...r}]));
  if(nodes.size!==group.length||group.some(r=>r.block_group!=='para_blocks'))
    fail('只能整理当前页面的 para Block');
  const children=new Map();
  for(const row of group){
    const parent=row.parent_block_id;
    if(parent!==null&&!nodes.has(parent))fail('父块缺失，无法自动修正');
    if(!children.has(parent))children.set(parent,[]);
    children.get(parent).push(row.block_id);
  }
  for(const items of children.values())
    items.sort((a,b)=>nodes.get(a).sibling_order-nodes.get(b).sibling_order||a-b);
  const seen=new Set(),output=[];
  function visit(id,visiting){
    if(visiting.has(id))fail('块关系存在循环');
    if(seen.has(id))fail('Block 被重复关联');
    seen.add(id);visiting.add(id);
    const ids=[id];
    for(const child of children.get(id)||[])ids.push(...visit(child,visiting));
    visiting.delete(id);
    return ids;
  }
  for(const [rootIndex,rootId] of (children.get(null)||[]).entries()){
    const root=nodes.get(rootId);
    root.parent_block_id=null;root.sibling_order=rootIndex;root.pbs=`p${page}b${rootIndex}`;
    output.push(root);seen.add(rootId);
    const direct=(children.get(rootId)||[]).flatMap(id=>visit(id,new Set([rootId])));
    for(const [index,id] of direct.entries()){
      const item=nodes.get(id);
      item.parent_block_id=rootId;
      item.sibling_order=index;
      item.pbs=`p${page}b${rootIndex}s${index}`;
      output.push(item);
    }
  }
  if(seen.size!==group.length||output.length!==group.length)
    fail('无法确定全部 Block 的有效顶层父块');
  const before=snapshot(group),after=snapshot(output);
  const changedRows=after.flatMap((row,i)=>same(before[i],row)?[]:[{
    block_id:row[0],parent_block_id:row[1],sibling_order:row[2],pbs:row[3],
  }]);
  return {page,changed:changedRows.length>0,changedRows,before,after};
}

export function createBlockRuntime({workspace,rows,revision=0,history=[],cursor=0}){
  if(typeof workspace!=='string'||!workspace||!Array.isArray(rows)||
     !Number.isSafeInteger(revision)||revision<0)fail('CM Block 初始化参数无效');
  const owned=rows.map(row=>({...row,block_id:Number(row.block_id),
    parent_block_id:row.parent_block_id==null?null:Number(row.parent_block_id),
    sibling_order:Number(row.sibling_order)}));
  validateRows(owned);
  const replay=history.map(entry=>({
    seq:entry.seq??null,
    page:entry.page,
    before:entry.before,
    after:entry.after,
    operation:entry.operation??null,
  }));
  const position=replay.filter(entry=>entry.seq!==null&&entry.seq<=cursor).length;
  return {workspace,rows:owned,revision,history:replay,
    cursor:position,queue:[],nextId:1,dirty:false};
}
export function planBlockMoveInMemory(rows,sourceBlockId,targetBlockId,placement){
  const sourceId=idOf(sourceBlockId),targetId=idOf(targetBlockId);
  if(!['before','after','child'].includes(placement))fail('Block 落点无效');
  if(!Number.isSafeInteger(sourceId)||!Number.isSafeInteger(targetId)||
     sourceId===targetId)fail('Block 源/目标无效');
  const all=new Map(rows.map(row=>[row.block_id,row]));
  const source=all.get(sourceId),target=all.get(targetId);
  if(!source||!target)fail('CM 没有源/目标 BlockID');
  if(source.global_page!==target.global_page)fail('第一版仅允许同页 para Block');
  const page=source.global_page;
  const group=rows.filter(row=>row.global_page===page);
  if(group.length>5000)fail('单页 para Block 超出 5000 个');
  const nodes=new Map(group.map(row=>[row.block_id,{...row}]));
  const siblings=new Map();
  for(const row of group){
    const parent=row.parent_block_id;
    if(parent!==null&&!nodes.has(parent))fail('CM 块关系存在失效的父 BlockID');
    if(!siblings.has(parent))siblings.set(parent,[]);
    siblings.get(parent).push(row.block_id);
  }
  for(const list of siblings.values())list.sort((a,b)=>
    nodes.get(a).sibling_order-nodes.get(b).sibling_order||a-b);
  for(const row of group){
    const walked=new Set();
    let id=row.block_id;
    while(id!==null){
      if(walked.has(id))fail('已有块关系存在循环');
      walked.add(id);id=nodes.get(id)?.parent_block_id??null;
    }
  }
  const sourceParent=source.parent_block_id;
  if(placement==='child'){
    if(sourceParent!==null)fail('当前只能将顶层父块归入另一父块');
    const newParent=target.parent_block_id===null?targetId:target.parent_block_id;
    let cursor=newParent;
    while(cursor!==null){
      if(cursor===sourceId)fail('不能归入自身的后代');
      cursor=nodes.get(cursor).parent_block_id;
    }
    siblings.get(sourceParent).splice(siblings.get(sourceParent).indexOf(sourceId),1);
    if(!siblings.has(newParent))siblings.set(newParent,[]);
    siblings.get(newParent).push(sourceId);
    nodes.get(sourceId).parent_block_id=newParent;
  }else{
    if(sourceParent!==target.parent_block_id)
      fail('之前／之后只允许同级 Block');
    const list=siblings.get(sourceParent);
    list.splice(list.indexOf(sourceId),1);
    list.splice(list.indexOf(targetId)+(placement==='after'?1:0),0,sourceId);
  }
  const ordered=[];
  function renumber(parent,prefix){
    for(const [index,id] of (siblings.get(parent)||[]).entries()){
      const row=nodes.get(id);
      row.sibling_order=index;
      row.pbs=parent===null?`${prefix}${index}`:`${prefix}s${index}`;
      ordered.push(row);
      renumber(id,row.pbs);
    }
  }
  renumber(null,`p${page+1}b`);
  if(ordered.length!==group.length||
     new Set(ordered.map(row=>row.pbs)).size!==ordered.length)
    fail('CM 块编号或层级不完整');
  const before=snapshot(group);
  // Absorbing a parent plus its children into another parent must yield
  // siblings under that parent, never a nested 's2s0' label.
  const after=planFlattenPageInMemory(ordered,page+1).after;
  const updates=after.flatMap((row,i)=>same(before[i],row)?[]:[{
    block_id:row[0],parent_block_id:row[1],sibling_order:row[2],pbs:row[3],
  }]);
  return {page:page+1,changed:updates.length>0,changedRows:updates,
    before,after};
}
function patchRows(state,patch){
  const byId=new Map(patch.map(row=>[row.block_id,row]));
  const rows=state.rows.map(row=>byId.has(row.block_id)?
    {...row,...byId.get(row.block_id)}:row);
  return {...state,rows};
}
function patchForSnapshot(current,restore){
  const before=new Map(current.filter(r=>r.global_page===restore.page)
    .map(row=>[row.block_id,row]));
  const changes=[];
  for(const [id,parent,order,pbs] of restore.snapshot){
    const row=before.get(id);
    if(!row)fail('CM Block 快照对应行不存在');
    if(row.parent_block_id!==parent||row.sibling_order!==order||row.pbs!==pbs)
      changes.push({block_id:id,parent_block_id:parent,sibling_order:order,pbs});
  }
  if(before.size!==restore.snapshot.length)fail('CM Block 快照对象不完整');
  return changes;
}
export function editBlockRuntime(state,command){
  if(!state?.workspace)fail('CM Block 未绑定');
  if(command.action==='flatten'){
    const plan=planFlattenPageInMemory(state.rows,command.page);
    if(!plan.changed)return {state,changed:false,changedRows:[],page:plan.page};
    const history=state.history.slice(0,state.cursor);
    history.push({page:plan.page,before:plan.before,after:plan.after,
      operation:{action:'flatten',page:plan.page}});
    const rows=patchRows(state,plan.changedRows);
    return {state:{...rows,history,cursor:history.length,
      queue:[...state.queue,{id:state.nextId,action:'flatten',page:plan.page}],
      nextId:state.nextId+1,dirty:true},
      changed:true,changedRows:plan.changedRows,page:plan.page};
  }
  if(command.action==='apply'){
    const plan=planBlockMoveInMemory(state.rows,
      command.sourceBlockId,command.targetBlockId,command.placement);
    if(!plan.changed)return {state,changed:false,changedRows:[],page:plan.page};
    const history=state.history.slice(0,state.cursor);
    history.push({page:plan.page,before:plan.before,after:plan.after,
      operation:{sourceBlockId:command.sourceBlockId,targetBlockId:command.targetBlockId,
        placement:command.placement}});
    const rows=patchRows(state,plan.changedRows);
    return {state:{...rows,history,cursor:history.length,
      queue:[...state.queue,{id:state.nextId,action:'apply',
        sourceBlockId:command.sourceBlockId,targetBlockId:command.targetBlockId,
        placement:command.placement}],nextId:state.nextId+1,dirty:true},
      changed:true,changedRows:plan.changedRows,page:plan.page};
  }
  if(!['undo','redo'].includes(command.action))fail('CM 未知的块操作');
  const index=command.action==='undo'?state.cursor-1:state.cursor;
  if(index<0||index>=state.history.length)fail('没有可用的 CM 撤销/重做历史');
  const entry=state.history[index];
  if(command.action==='undo'&&entry.operation?.action==='flatten')
    fail('两级结构修正是保护性迁移，不能用普通 Undo 恢复孙块');
  const restore={page:entry.page-1,
    snapshot:command.action==='undo'?entry.before:entry.after};
  const changes=patchForSnapshot(state.rows,restore);
  const rows=patchRows(state,changes);
  if(planFlattenPageInMemory(rows.rows,entry.page).changed)
    fail('该历史操作会恢复第三层子块，已阻止');
  return {state:{...rows,cursor:state.cursor+(command.action==='undo'?-1:1),
    queue:[...state.queue,{id:state.nextId,action:command.action}],
    nextId:state.nextId+1,dirty:true},
    changed:true,changedRows:changes,page:entry.page};
}
export function acknowledgeBlockPersistence(state,ids,revision){
  if(!state||!Array.isArray(ids)||!Number.isSafeInteger(revision)||revision<state.revision||
     ids.length>state.queue.length||ids.some((id,i)=>state.queue[i]?.id!==id))
    fail('CM Block 落盘回执不匹配，拒绝清理待持久队列');
  const queue=state.queue.slice(ids.length);
  return {...state,queue,revision,dirty:queue.length>0};
}
export function runtimeStatus(state){
  return {initialized:!!state,workspace:state?.workspace??null,
    revision:state?.revision??null,pending:state?.queue.length??0,
    canUndo:!!state&&state.cursor>0&&
      state.history[state.cursor-1]?.operation?.action!=='flatten',
    canRedo:!!state&&state.cursor<state.history.length};
}
export function projectBlockOverlays(state,data){
  if(!state||!data||data.level!=='block'||!Array.isArray(data.boxes))return data;
  const byId=new Map(state.rows.map(row=>[String(row.block_id),row]));
  return {...data,boxes:data.boxes.map(item=>{
    const row=byId.get(String(item.blockId));
    return row?{...item,pbs:row.pbs,
      parentBlockId:row.parent_block_id==null?null:String(row.parent_block_id)}:item;
  })};
}
