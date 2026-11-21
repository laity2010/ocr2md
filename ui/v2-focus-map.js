/** Pure V2 logical identity <-> live CM6 UTF-16 coordinates.
 * No SQL, no PDF coordinate guessing, no CMD inline markers.
 */
export function logicalAtOffset(rows,pos){
  if(!Number.isInteger(pos)||pos<0)return null;
  let previous=null;
  for(const row of rows){
    if(pos<row.from)break;
    if(pos<=row.to)return row;
    previous=row;
  }
  return previous;
}
export function logicalAtSourceLine(rows,doc,line){
  if(!doc||!Number.isInteger(line)||line<1||line>doc.lines)return null;
  return logicalAtOffset(rows,doc.line(line).from);
}
export function logicalForAG(rows,table,data){
  if(!data||!['logical_block','mineru_base'].includes(table))return null;
  if(table==='logical_block')return rows.find(row=>row.logicalId===data.logical_id)||null;
  return rows.find(row=>row.baseBlockId===data.blockid)||null;
}
export function pageForLogical(row,table,pageSize=120){
  if(!row)return null;
  const number=table==='logical_block'?row.logicalOrder:table==='mineru_base'?row.baseBlockId:null;
  return Number.isInteger(number)&&number>0?Math.floor((number-1)/pageSize)*pageSize:null;
}
