/** Block-level, read-only table AG projection. Source: resident reviewed
 * Block runtime and current CM6 MD rows, never inferred from Markdown syntax.
 * Every block whose block_type contains "table" is included, even PDF-only
 * parent wrappers and historical merged blocks.
 */
// V2 may supply a structural membership predicate; V1's type-only default is unchanged.
export function projectTableBlockRows(mdRows=[],blockRows=[],includeBlock=block=>
  typeof block?.block_type==='string'&&block.block_type.toLowerCase().includes('table')){
  if(!Array.isArray(mdRows)||!Array.isArray(blockRows))
    throw TypeError('表格视图需要 MD 行和 Block 表');
  const firstByBlock=new Map();
  for(const row of mdRows){
    if(row?.block_id==null||firstByBlock.has(row.block_id))continue;
    firstByBlock.set(row.block_id,row);
  }
  return blockRows.filter(includeBlock).map(block=>{
    const source=firstByBlock.get(block.block_id);
    // Frame's generic AG normally hides absorbed wrappers; this view must
    // show ALL table types. Keep the original absorption info in a separate
    // explicitly labelled read-only field instead of forging an active block.
    const {absorbed_into_block_id,...rest}=block;
    return {...rest,merged_into_block_id:absorbed_into_block_id??null,
      line_id:source?.line_id??null,line_no:source?.line_no??null,
      text:source?.text??null};
  });
}
