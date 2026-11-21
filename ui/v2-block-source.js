/** WP04: pure logical Markdown -> editable CM6 source projection.
 * No SQL, filesystem, HTML CMD tags, or additional editor states.
 * In a V2 source view every logical block is followed by ONE blank line.
 * The separate segment inventory, not the visible blank lines, owns IDs.
 */
export const BLOCK_END='\n\n';
const BACKEND_SEP='\n\n';
export function composeBlockSource(snapshot){
  if(!snapshot||snapshot.schema!=='v2-logical-md/v2'||
    typeof snapshot.markdown!=='string'||!Array.isArray(snapshot.segments)||
    snapshot.rowCount!==snapshot.segments.length)
    throw Error('WP04: invalid logical Markdown snapshot');
  const original=snapshot.markdown;
  let offset=0,source='',blocks=[];
  const ids=new Set();
  for(const [i,part] of snapshot.segments.entries()){
    if(!part||!Number.isInteger(part.logicalId)||part.logicalId<=0||
      !Number.isInteger(part.baseBlockId)||part.baseBlockId<=0||
      !Number.isInteger(part.startUtf16)||!Number.isInteger(part.endUtf16)||
      part.endUtf16<part.startUtf16||!Number.isInteger(part.logicalOrder)||
      part.logicalOrder!==i+1||typeof part.blockType!=='string'||
      ids.has(part.logicalId))throw Error('WP04: invalid logical block boundary or ID');
    ids.add(part.logicalId);
    if(i){
      if(original.slice(offset,offset+BACKEND_SEP.length)!==BACKEND_SEP)
        throw Error('WP04: source separator lost');
      offset+=BACKEND_SEP.length;
    }
    if(offset!==part.startUtf16||part.endUtf16>original.length)
      throw Error('WP04: source position manifest is inconsistent');
    const text=original.slice(part.startUtf16,part.endUtf16);
    const from=source.length;source+=text;
    blocks.push({logicalId:part.logicalId,baseBlockId:part.baseBlockId,
      parentId:part.parentId,logicalOrder:part.logicalOrder,blockType:part.blockType,
      from,to:source.length});
    source+=BLOCK_END;offset=part.endUtf16;
  }
  if(offset!==original.length)throw Error('WP04: unmapped backend Markdown tail');
  return {source,blocks};
}

/** CM6 change coordinates are UTF-16, exactly as document strings. A change
 * must stay WITHIN one block's editable text (including its insertion edges),
 * never consume the invariant blank-line suffix or cross logical blocks.
 */
export function canEditBlocks(blocks,changes){
  let allowed=true;
  changes.iterChanges((a,b,_newA,_newB)=>{
    if(!blocks.some(({from,to})=>a>=from&&b<=to))allowed=false;
  });
  return allowed;
}

/** Map only the mutable text interval through a real CodeMirror transaction.
 * Protect all suffixes and persistent IDs, including zero-length logical rows.
 */
export function mapEditedBlocks(blocks,changes){
  return blocks.map(row=>({
    ...row,
    from:changes.mapPos(row.from,-1),
    to:changes.mapPos(row.to,1),
  }));
}
export function logicalTextRows(source,blocks){
  return blocks.map(row=>({logicalId:row.logicalId,baseBlockId:row.baseBlockId,
    parentId:row.parentId,logicalOrder:row.logicalOrder,
    blockType:row.blockType,markdownText:source.slice(row.from,row.to)}));
}
