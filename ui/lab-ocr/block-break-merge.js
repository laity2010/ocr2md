/** WCP43: pure atomic edit plan, never manipulates Markdown/PDF/SQL itself.
 * A stays the owner of joined text. B keeps its physical empty MD row,
 * LineID and BlockID. Only a directly adjacent, single-content-line prose
 * B is auto-mergeable: anything more complex must be reviewed manually.
 */
export function planBlockBreakMerge(candidate,mdRows,blockRows){
  if(!candidate||!Array.isArray(mdRows)||!Array.isArray(blockRows))
    throw Error('断块合并候选无效');
  const a=mdRows.find(row=>row.line_id===candidate.before_line_id);
  const b=mdRows.find(row=>row.line_id===candidate.after_line_id);
  if(!a||!b||a.block_id!==candidate.before_block_id||
     b.block_id!==candidate.after_block_id||
     a.line_no+1!==b.line_no||a.line_no<1)
    throw Error('断块物理行不相邻或 LineID 已变化，不能自动合并');
  const tail=mdRows.filter(row=>row.block_id===b.block_id&&row.text.trim());
  if(tail.length!==1||tail[0].line_id!==b.line_id)
    throw Error('后块含有多行正文，不能自动清空整个逻辑块');
  const before=blockRows.find(row=>row.block_id===a.block_id);
  const after=blockRows.find(row=>row.block_id===b.block_id);
  if(!before||!after||!['text','paragraph'].includes(before.block_type)||
     !['text','paragraph'].includes(after.block_type)||
     before.block_group!=='para_blocks'||after.block_group!=='para_blocks'||
     before.absorbed_into_block_id!=null||after.absorbed_into_block_id!=null)
    throw Error('断块的正文 Block 身份无效');
  if(before.parent_block_id==null){
    if(after.parent_block_id!==before.block_id)
      throw Error('断块父子关系不匹配');
  }else if(after.parent_block_id!==before.parent_block_id||
           after.sibling_order<=before.sibling_order){
    throw Error('断块兄弟关系不匹配');
  }
  const siblings=blockRows.filter(row=>row.parent_block_id===after.parent_block_id&&
    row.absorbed_into_block_id==null&&row.block_id!==after.block_id&&
    (before.parent_block_id==null?row.sibling_order<after.sibling_order:
      row.sibling_order>before.sibling_order&&row.sibling_order<after.sibling_order));
  if(siblings.length)throw Error('断块之间存在其他子块，拒绝合并');
  if(typeof a.text!=='string'||typeof b.text!=='string'||
    !a.text.trim()||!b.text.trim()||/\r|\n/.test(a.text+b.text))
    throw Error('断块原文已经变化');
  if(!a.text.trimEnd().endsWith(candidate.before_token)||
     !b.text.trimStart().startsWith(candidate.after_token))
    throw Error('断块接续词证据已变化');
  const stripHyphen=candidate.kind==='跨块断词'&&a.text.trimEnd().endsWith('-');
  const left=stripHyphen?a.text.trimEnd().slice(0,-1):a.text.trimEnd();
  const glue=stripHyphen?'':' ';
  const joined=left+glue+b.text.trimStart();
  return Object.freeze({beforeLineId:a.line_id,afterLineId:b.line_id,
    beforeBlockId:a.block_id,afterBlockId:b.block_id,
    beforeText:a.text,afterText:b.text,joinedText:joined,
    joinLeftLength:left.length,joinGlue:glue,
    beforeLineNo:a.line_no,afterLineNo:b.line_no});
}

/** Derived empty B IDs; never changes an original OCR sourceEmpty flag.
 * Parent wrappers with nonempty children are never labeled as empty solely
 * because they have no own MD line.
 */
export function emptyMdChildBlockIds(mdRows,blockRows){
  if(!Array.isArray(mdRows)||!Array.isArray(blockRows))return [];
  const seen=new Set(mdRows.filter(row=>row.block_id!=null).map(row=>row.block_id));
  const nonempty=new Set(mdRows.filter(row=>row.block_id!=null&&
    typeof row.text==='string'&&row.text.trim()).map(row=>row.block_id));
  return blockRows.filter(row=>row.parent_block_id!=null&&
    ['text','paragraph'].includes(row.block_type)&&
    row.absorbed_into_block_id==null&&seen.has(row.block_id)&&
    !nonempty.has(row.block_id)).map(row=>row.block_id);
}
