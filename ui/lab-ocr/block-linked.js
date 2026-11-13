/** Cross-page and post-cross-page Block relation planner.
 * Pure: physical global_page and source bytes remain immutable.
 * A child carries its parent's logical PBS even when its PDF bbox stays
 * on the following physical page.
 */
export function planLinkedBlockMove(rows,sourceBlockId,targetBlockId,placement){
  const sourceId=Number(sourceBlockId),targetId=Number(targetBlockId);
  const nodes=new Map(rows.map(r=>[r.block_id,{...r}]));
  const source=nodes.get(sourceId),target=nodes.get(targetId);
  if(!source||!target||sourceId===targetId)throw Error('Block 源/目标无效');
  if(!['child','before','after'].includes(placement))throw Error('Block 落点无效');
  if(rows.length>10000||nodes.size!==rows.length)throw Error('跨页 Block 关系数量异常');
  const cross=source.global_page!==target.global_page;
  if(cross&&(source.global_page!==target.global_page+1||placement!=='child'||
     source.parent_block_id!==null))
    throw Error('跨页仅允许后一页顶层块归入前一页父块；之前／之后仍须同页');
  const byParent=new Map();
  const keyFor=(parent,page)=>parent===null?'root:'+page:'child:'+parent;
  for(const row of nodes.values()){
    if(row.block_group!=='para_blocks')throw Error('Block 只能处理 para');
    const parent=row.parent_block_id;
    if(parent!==null&&!nodes.has(parent))throw Error('CM 父 BlockID 缺失');
    const key=keyFor(parent,row.global_page);
    if(!byParent.has(key))byParent.set(key,[]);
    byParent.get(key).push(row.block_id);
  }
  for(const members of byParent.values())members.sort((a,b)=>
    nodes.get(a).sibling_order-nodes.get(b).sibling_order||a-b);
  for(const row of nodes.values()){
    const seen=new Set();let cur=row.block_id;
    while(cur!==null){
      if(seen.has(cur))throw Error('块关系存在循环');
      seen.add(cur);cur=nodes.get(cur).parent_block_id;
    }
  }
  const sourceParent=source.parent_block_id;
  const targetRoot=target.parent_block_id===null?targetId:target.parent_block_id;
  if(cross&&nodes.get(targetRoot)?.global_page!==target.global_page)
    throw Error('跨页不能越过相邻的逻辑父页');
  const start=rows.map(r=>r);
  if(placement==='child'){
    if(sourceParent!==null)throw Error('只能将顶层父块归入另一父块');
    if(targetRoot===sourceId)throw Error('不能归入自身子孙');
    if(nodes.get(targetRoot).parent_block_id!==null)throw Error('最多只有两级 Block');
    const sourceKey=keyFor(null,source.global_page);
    const existing=byParent.get(sourceKey)||[];
    existing.splice(existing.indexOf(sourceId),1);
    const promoted=[];
    const visit=id=>{
      for(const childId of byParent.get('child:'+id)||[]){
        if(cross&&nodes.get(childId).global_page!==source.global_page)
          throw Error('跨页归入不能再串接第三个物理页');
        promoted.push(childId);visit(childId);
      }
    };
    visit(sourceId);
    for(const id of [sourceId,...promoted])nodes.get(id).parent_block_id=targetRoot;
    byParent.delete('child:'+sourceId);
    for(const id of promoted)byParent.delete('child:'+id);
    const destKey='child:'+targetRoot;
    if(!byParent.has(destKey))byParent.set(destKey,[]);
    byParent.get(destKey).push(sourceId,...promoted);
  }else{
    if(cross||sourceParent!==target.parent_block_id)
      throw Error('之前／之后只允许同页且同级 Block');
    const key=keyFor(sourceParent,source.global_page);
    const members=byParent.get(key);
    members.splice(members.indexOf(sourceId),1);
    members.splice(members.indexOf(targetId)+(placement==='after'?1:0),0,sourceId);
  }
  const pages=new Set([source.global_page,target.global_page]);
  for(const page of pages){
    const roots=byParent.get('root:'+page)||[];
    roots.forEach((id,index)=>{
      const root=nodes.get(id);
      root.sibling_order=index;root.pbs=`p${page+1}b${index}`;
      for(const [childIndex,childId] of (byParent.get('child:'+id)||[]).entries()){
        const child=nodes.get(childId);
        child.parent_block_id=id;child.sibling_order=childIndex;
        child.pbs=`${root.pbs}s${childIndex}`;
      }
    });
  }
  // If a moved root is no longer a root, its new parent belongs to the
  // destination page, already renumbered above.
  for(const row of nodes.values()){
    if(row.parent_block_id!==null){
      const p=nodes.get(row.parent_block_id);
      if(!p||p.parent_block_id!==null)throw Error('不能生成第三层 Block');
      if(!row.pbs.startsWith(p.pbs+'s'))throw Error('跨页 PBS 关系不一致');
    }
  }
  const before=[],after=[],updates=[];
  for(const row of start){
    const newRow=nodes.get(row.block_id);
    if(row.parent_block_id!==newRow.parent_block_id||
       row.sibling_order!==newRow.sibling_order||row.pbs!==newRow.pbs){
      before.push([row.block_id,row.parent_block_id,row.sibling_order,row.pbs]);
      after.push([newRow.block_id,newRow.parent_block_id,newRow.sibling_order,newRow.pbs]);
      updates.push({block_id:newRow.block_id,parent_block_id:newRow.parent_block_id,
        sibling_order:newRow.sibling_order,pbs:newRow.pbs});
      pages.add(row.global_page);
    }
  }
  before.sort((a,b)=>a[0]-b[0]);after.sort((a,b)=>a[0]-b[0]);
  return {changed:!!updates.length,changedRows:updates,
    sourceBlockId:sourceId,targetBlockId:targetId,placement,
    page:source.global_page+1,pages:[...pages].sort((a,b)=>a-b).map(p=>p+1),
    scope:'delta',before,after};
}
