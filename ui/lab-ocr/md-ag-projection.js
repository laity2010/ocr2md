/** Read-only MD AG projection. BlockID is authoritative; PBS is a mutable label.
 * Do not write PBS or filter state into md_line or CM6 Markdown.
 */
export function projectMdAgRows(mdRows,blockRows){
  const pbsByBlock=new Map(blockRows.map(row=>[row.block_id,row.pbs]));
  return mdRows.map(row=>({...row,pbs:pbsByBlock.get(row.block_id)??''}));
}
export function mdLineKind(text){
  return typeof text==='string'&&text.trim().length?'非空行':'空行';
}
