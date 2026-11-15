/** Lab OCR location resolver: stable BlockID/LineID to four read-only views.
 * Never use mutable PBS as an identity or invent a source line for a PDF-only Block.
 */
export function resolveReviewLocation({lineId=null,blockId=null,lineNo=null}={},mdRows=[],blocks=[]){
  if(!Array.isArray(mdRows)||!Array.isArray(blocks))throw TypeError('Review rows required');
  const byLineId=lineId==null?null:mdRows.find(row=>row.line_id===lineId);
  const byLineNo=Number.isInteger(lineNo)&&lineNo>0?mdRows[lineNo-1]:null;
  const id=blockId==null?null:Number(blockId);
  const byBlock=Number.isSafeInteger(id)?mdRows.filter(row=>row.block_id===id):[];
  const row=byLineId??byLineNo??byBlock.find(item=>item.text?.trim())??byBlock[0]??null;
  const resolvedId=row?.block_id??(Number.isSafeInteger(id)?id:null);
  const block=blocks.find(item=>item.block_id===resolvedId);
  if(!row&&!block)return null;
  return Object.freeze({
    lineId:row?.line_id??null,
    lineNo:row?.line_no??null,
    blockId:resolvedId,
    page:Number.isInteger(block?.global_page)?block.global_page+1:null,
    pbs:block?.pbs??null,
  });
}
