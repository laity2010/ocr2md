/** Pure V2 AG display projection. The full logical table remains in memory.
 * The user-facing page is the persistent PBS p, NOT the SQL 120-row offset
 * and NOT the physical PDF page of the original OCR rectangle.
 */
export function filterLogicalAG(rows,focusId,all=false){
  if(!Array.isArray(rows))throw Error('逻辑表尚未加载');
  const focused=rows.find(row=>row.logical_id===focusId)||rows[0]||null;
  const p=focused?.p??null;
  return {p,rows:all||p===null?rows:rows.filter(row=>row.p===p)};
}
