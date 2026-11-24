/** WP24: an AG-only read model of CM6's latest logical Markdown blocks.
 * Takes live source rows (not a possibly stale SQL md_block or block_type).
 * SQL logical rows supply other AG columns, never a title table or VIEW.
 */
const atx=/^(#{1,6})(?=\s|$)/;
const fence=/^ {0,3}(`{3,}|~{3,})/;
export function titleRowsFromCM(logicalRows,liveBlocks){
  if(!Array.isArray(logicalRows)||!Array.isArray(liveBlocks))throw Error('标题视图缺少原始逻辑数据或 CM6 正文');
  const metadata=new Map(logicalRows.map(row=>[row.logical_id,row]));
  const out=[];
  let enclosed=null;
  for(const block of [...liveBlocks].sort((a,b)=>a.logicalOrder-b.logicalOrder)){
    const row=metadata.get(block.logicalId),md=block.markdownText;
    if(!row||typeof md!=='string')continue;
    const f=fence.exec(md);
    if(f){
      if(!enclosed)enclosed={char:f[1][0],length:f[1].length};
      else if(f[1][0]===enclosed.char&&f[1].length>=enclosed.length)enclosed=null;
      continue;
    }
    if(enclosed)continue;
    const h=atx.exec(md);
    if(!h)continue;
    out.push({...row,logical_id:block.logicalId,logical_order:block.logicalOrder,
      md_block:md,block_type:block.blockType,p:block.p,b:block.b,s:block.s,
      level:h[1],heading_level:h[1].length,pbs:`p${block.p}b${block.b}s${block.s}`});
  }
  return out;
}
