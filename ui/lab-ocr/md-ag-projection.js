/** Read-only MD AG projection. BlockID is authoritative; PBS is a mutable label.
 * Do not write PBS or filter state into md_line or CM6 Markdown.
 */
export function projectMdAgRows(mdRows,blockRows){
  const byBlock=new Map(blockRows.map(({absorbed_into_block_id,...block})=>[block.block_id,block]));
  // Reuse the full reviewed Block columns as read-only AG metadata. A moved
  // block changes its PBS and parent attributes without changing MD line text.
  // Exclude absorbed_into_block_id: it describes a Block wrapper, not a reason
  // to hide a persisted MD source line from the AG row view.
  return mdRows.map(line=>({...(byBlock.get(line.block_id)??{}),
    ...line,pbs:byBlock.get(line.block_id)?.pbs??''}));
}
export function mdLineKind(text){
  return typeof text==='string'&&text.trim().length?'非空行':'空行';
}
