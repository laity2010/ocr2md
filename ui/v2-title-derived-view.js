/** WP23 V2 Title AG Derived View: pure, read-only projection of LIVE CM6 text.
 * Never queries SQL for heading decisions and never owns a second document.
 * The two-table rows provide only existing stable identity/other AG columns.
 */
const heading=/^(#{1,6})(?=\s|$)/;
const fence=/^ {0,3}(`{3,}|~{3,})(?:[^\r\n]*)$/;

/** @param {Array<object>} rows full SQL logical inventory, current structure
 *  @param {Array<object>} sourceRows live v2SourcePort.getBlocks() snapshots
 */
export function deriveTitleRows(rows,sourceRows){
  if(!Array.isArray(rows)||!Array.isArray(sourceRows))throw Error('标题派生视图缺少逻辑块或 CM6 快照');
  const byId=new Map(rows.map(row=>[row.logical_id,row]));
  const output=[];
  let fenced=null;
  for(const source of [...sourceRows].sort((a,b)=>a.logicalOrder-b.logicalOrder)){
    const record=byId.get(source.logicalId);
    if(!record)continue;
    const md=source.markdownText;
    if(typeof md!=='string')continue;
    const mark=fence.exec(md);
    if(mark){
      const sequence=mark[1];
      if(!fenced)fenced={char:sequence[0],length:sequence.length};
      else if(sequence[0]===fenced.char&&sequence.length>=fenced.length)fenced=null;
      continue;
    }
    if(fenced)continue;
    const match=heading.exec(md);
    if(!match)continue;
    output.push({...record,logical_id:source.logicalId,
      md_block:md,block_type:source.blockType,
      logical_order:source.logicalOrder,p:source.p,b:source.b,s:source.s,
      level:match[1],heading_level:match[1].length,
      pbs:`p${source.p}b${source.b}s${source.s}`});
  }
  return output;
}
