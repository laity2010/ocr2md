/** WP07: pure PBS two-level structural drag, independent of PDF geometry/SQL.
 * All block text and stable logical/base IDs survive byte-for-byte.
 * PBS p,b are group identities, never regenerated from logical_order.
 */
export function moveLogicalBlocks(rows,intent){
  if(!Array.isArray(rows)||!rows.length)throw Error('逻辑块尚未加载');
  const ids=new Map(rows.map(r=>[r.logicalId,r]));
  if(ids.size!==rows.length)throw Error('逻辑块 ID 重复');
  const {sourceBlockId,targetBlockId,placement}=intent||{};
  if(!['before','after','child'].includes(placement))throw Error('未知拖放落点');
  const src=ids.get(sourceBlockId),dst=ids.get(targetBlockId);
  if(!src||!dst||src===dst)throw Error('拖动来源或目标无效');
  const valid=r=>[r.p,r.b,r.s].every(v=>Number.isSafeInteger(v)&&v>=0);
  if(rows.some(r=>!valid(r)||!Number.isSafeInteger(r.logicalId)))throw Error('PBS 数据未完整加载');
  const rootFor=r=>rows.find(x=>x.p===r.p&&x.b===r.b&&x.s===0);
  const srcRoot=rootFor(src),dstRoot=rootFor(dst);
  if(!srcRoot||!dstRoot)throw Error('父块组缺少 s0');
  const sameGroup=src.p===dst.p&&src.b===dst.b;
  const group=r=>rows.filter(x=>x.p===r.p&&x.b===r.b);
  let moved,remaining,insertAt,newMembers;
  if(placement==='child'){
    if(src.s!==0||sameGroup)throw Error('只能把独立父块组归入其他父块组');
    moved=group(src); // flatten an existing root group, never create grandchildren
    remaining=rows.filter(r=>!moved.includes(r));
    const targetGroup=group(dst);
    const last=remaining.findLastIndex(r=>targetGroup.includes(r));
    insertAt=last+1;
    const start=Math.max(...targetGroup.map(r=>r.s))+1;
    newMembers=moved.map((r,i)=>({...r,p:dst.p,b:dst.b,s:start+i,parentId:dstRoot.logicalId}));
  }else if(src.s===0&&dst.s===0&&!sameGroup){
    // A root carries its children when moved before/after another root.
    moved=group(src);
    remaining=rows.filter(r=>!moved.includes(r));
    const at=remaining.findIndex(r=>r.logicalId===dstRoot.logicalId);
    const end=remaining.findLastIndex(r=>r.p===dst.p&&r.b===dst.b)+1;
    insertAt=placement==='before'?at:end;
    newMembers=moved.map(r=>({...r}));
  }else if(src.s>0&&dst.s>0&&sameGroup){
    moved=[src];
    remaining=rows.filter(r=>r!==src);
    const at=remaining.findIndex(r=>r.logicalId===dst.logicalId);
    insertAt=at+(placement==='after'?1:0);
    newMembers=[{...src}];
  }else throw Error('该层级的拖动落点不受支持');
  const reordered=[...remaining.slice(0,insertAt),...newMembers,...remaining.slice(insertAt)];
  // Sibling permutation is local to the affected group. Reuse its existing
  // s values (including holes) rather than renumbering all siblings 1..N.
  // Only members whose relative position changed receive a different s.
  if(src.s>0&&placement!=='child'){
    const siblings=reordered.filter(r=>r.p===src.p&&r.b===src.b&&r.s>0);
    const priorS=rows.filter(r=>r.p===src.p&&r.b===src.b&&r.s>0)
      .map(r=>r.s).sort((a,b)=>a-b);
    const remap=new Map(siblings.map((r,i)=>[r.logicalId,priorS[i]]));
    for(let i=0;i<reordered.length;i++){
      const row=reordered[i];
      if(remap.has(row.logicalId))reordered[i]={...row,s:remap.get(row.logicalId)};
    }
  }
  let pos=0;
  const blocks=reordered.map((r,i)=>{
    const text=r.markdownText;
    if(typeof text!=='string')throw Error('逻辑文本无效');
    const from=pos;pos+=text.length;const to=pos;pos+=2;
    return {...r,logicalOrder:i+1,from,to};
  });
  const source=blocks.map(r=>r.markdownText+'\n\n').join('');
  const before=new Map(rows.map(r=>[r.logicalId,r]));
  const fields=['parentId','logicalOrder','p','b','s'];
  const changes=blocks.filter(r=>fields.some(key=>before.get(r.logicalId)?.[key]!==r[key]))
    .map(r=>({logicalId:r.logicalId,
      before:Object.fromEntries(fields.map(k=>[k,before.get(r.logicalId)?.[k]??null])),
      after:Object.fromEntries(fields.map(k=>[k,r[k]??null]))}));
  if(!changes.length)throw Error('拖动没有产生结构变化');
  const coords=new Set(blocks.map(r=>[r.p,r.b,r.s].join('/')));
  if(coords.size!==blocks.length)throw Error('PBS 编号冲突');
  for(const r of blocks){
    const root=blocks.find(x=>x.p===r.p&&x.b===r.b&&x.s===0);
    if(!root||r.parentId!==(r.s===0?null:root.logicalId))throw Error('拖动产生无效父子关系');
  }
  return {blocks,source,changes};
}
