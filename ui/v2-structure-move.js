/** WP07: PBS insertion slots; shift all following same-level numbers by +1.
 * An emptied source slot is deliberately not compressed. CM6 owns sequence
 * and history; this pure projection changes only affected logical rows.
 * Stable logical/base IDs, text and PDF geometry are never regenerated.
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
  const increment=(value,amount=1)=>{
    const sum=value+amount;
    if(!Number.isSafeInteger(sum))throw Error('PBS 编号超出安全整数范围');
    return sum;
  };
  let moved,remaining,insertAt,newMembers;
  if(placement==='child'){
    if(src.s!==0||sameGroup)throw Error('只能把独立父块组归入其他父块组');
    moved=group(src); // flatten an existing root group, never create grandchildren
    const slot=increment(dst.s); // s0 -> s1, sK -> s(K+1)
    remaining=rows.filter(r=>!moved.includes(r)).map(r=>
      r.p===dst.p&&r.b===dst.b&&r.s>=slot
        ?{...r,s:increment(r.s,moved.length)}:r);
    const at=remaining.findIndex(r=>r.logicalId===dst.logicalId);
    insertAt=at+1;
    newMembers=moved.map((r,i)=>({
      ...r,p:dst.p,b:dst.b,s:increment(slot,i),parentId:dstRoot.logicalId,
    }));
  }else if(src.s===0&&dst.s===0&&!sameGroup){
    // A root carries its children when moved before/after another root.
    moved=group(src);
    const slot=increment(dst.b,placement==='after'?1:0);
    // Shift *all* later b groups on the target logical page, even across
    // existing gaps; children inherit the parent's new b automatically.
    remaining=rows.filter(r=>!moved.includes(r)).map(r=>
      r.p===dst.p&&r.b>=slot?{...r,b:increment(r.b)}:r);
    const at=remaining.findIndex(r=>r.logicalId===dstRoot.logicalId);
    // BEFORE moves the target's b; locate by stable logical_id, not PBS.
    const end=remaining.findLastIndex(r=>r.logicalId===dstRoot.logicalId||
      r.parentId===dstRoot.logicalId)+1;
    insertAt=placement==='before'?at:end;
    newMembers=moved.map(r=>({...r,p:dst.p,b:slot}));
  }else if(src.s>0&&dst.s>0&&sameGroup){
    moved=[src];
    const slot=increment(dst.s,placement==='after'?1:0);
    remaining=rows.filter(r=>r!==src).map(r=>
      r.p===dst.p&&r.b===dst.b&&r.s>=slot
        ?{...r,s:increment(r.s)}:r);
    const at=remaining.findIndex(r=>r.logicalId===dst.logicalId);
    insertAt=at+(placement==='after'?1:0);
    newMembers=[{...src,s:slot}];
  }else throw Error('该层级的拖动落点不受支持');
  const reordered=[...remaining.slice(0,insertAt),...newMembers,...remaining.slice(insertAt)];
  // CM6 order may already match the intended drop while PBS labels are still
  // inverted by an older order-only move. Do not mistake that for a no-op:
  // the slot insertion must still repair b/s and persist the changed rows.
  // Only an ALREADY correctly ordered + numbered neighbor is truly unchanged.
  const sequenceUnchanged=reordered.every((r,i)=>r.logicalId===rows[i].logicalId);
  const numberedCorrectly=src.s===0
    ?src.p===dst.p&&(placement==='before'?src.b<dst.b:src.b>dst.b)
    :sameGroup&&(placement==='before'?src.s<dst.s:src.s>dst.s);
  if(sequenceUnchanged&&placement!=='child'&&numberedCorrectly){
    return {blocks:rows,source:rows.map(r=>r.markdownText+'\n\n').join(''),
      changes:[],unchanged:true};
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
  if(!changes.length)return {blocks,source,changes:[],unchanged:true};
  const coords=new Set(blocks.map(r=>[r.p,r.b,r.s].join('/')));
  if(coords.size!==blocks.length)throw Error('PBS 编号冲突');
  for(const r of blocks){
    const root=blocks.find(x=>x.p===r.p&&x.b===r.b&&x.s===0);
    if(!root||r.parentId!==(r.s===0?null:root.logicalId))throw Error('拖动产生无效父子关系');
  }
  return {blocks,source,changes,unchanged:false};
}
