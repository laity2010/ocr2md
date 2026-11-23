/** V2 CM6 projects immutable SQL MD blocks with minimal display newlines.
 * Adjacent siblings in a (p,b) group occupy SEPARATE lines (one LF), while
 * distinct groups retain a visible blank line (two LF). Existing raw text is
 * never trimmed or silently saved; positions use stable segment IDs only.
 */
export const BLOCK_END='\n\n';
export const CHILD_LINE_END='\n';
const BACKEND_SEP='\n\n';
const groupKey=row=>String(row.p)+'/'+String(row.b);
/** Minimal LF tail that makes a blank source line after the group.
 * No original character is modified or trimmed. The missing tail is a
 * CM6-only projection, unless the user explicitly edits this display tail.
 */
export function groupEndPadding(text){
  if(typeof text!=='string')throw Error('逻辑文本无效');
  return text.endsWith('\n\n')?'':text.endsWith('\n')?'\n':BLOCK_END;
}
/** Minimum display LF separating two blocks in the same parent group.
 * Original newlines (including intentionally blank lines) stay in MD Block.
 */
export function childLinePadding(text){
  if(typeof text!=='string')throw Error('逻辑文本无效');
  return text.endsWith(CHILD_LINE_END)?'':CHILD_LINE_END;
}
export function composeLogicalSource(rows){
  if(!Array.isArray(rows))throw Error('逻辑块无效');
  let source='';
  const blocks=rows.map((row,i)=>{
    if(typeof row?.markdownText!=='string')throw Error('逻辑文本无效');
    const lastInGroup=i===rows.length-1||groupKey(row)!==groupKey(rows[i+1]);
    const padding=lastInGroup?groupEndPadding(row.markdownText):childLinePadding(row.markdownText);
    const from=source.length;
    source+=row.markdownText+padding;
    // groupEndPad is retained as a public/CM6 mapping field name: it now
    // tracks ANY virtual trailing LF (one in-group, up to two at group end).
    return {...row,from,to:source.length,groupEndPad:padding.length};
  });
  return {source,blocks};
}
export function composeBlockSource(snapshot){
  if(!snapshot||snapshot.schema!=='v2-logical-md/v2'||
    typeof snapshot.markdown!=='string'||!Array.isArray(snapshot.segments)||
    snapshot.rowCount!==snapshot.segments.length)
    throw Error('WP04: invalid logical Markdown snapshot');
  const original=snapshot.markdown;
  let offset=0,blocks=[];
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
    blocks.push({logicalId:part.logicalId,baseBlockId:part.baseBlockId,
      parentId:part.parentId,logicalOrder:part.logicalOrder,blockType:part.blockType,
      p:part.p,b:part.b,s:part.s,markdownText:text});
    offset=part.endUtf16;
  }
  if(offset!==original.length)throw Error('WP04: unmapped backend Markdown tail');
  return composeLogicalSource(blocks);
}

/** CM6 change coordinates are UTF-16, exactly as document strings. Each
 * block owns its trailing blank lines; changes must not span block IDs.
 * WP10 permits one-block edits with native CM6 Undo/Redo.
 */
export function editOwner(blocks,from,to){
  // A zero-width insertion at a shared boundary belongs to the NEXT block.
  if(from===to){
    const next=blocks.find(row=>row.from===from&&row.to>from);
    if(next)return next;
  }
  return blocks.find(row=>from>=row.from&&to<=row.to&&
    (from<row.to||row===blocks.at(-1)))||null;
}
export function canEditBlocks(blocks,changes){
  let allowed=true;
  changes.iterChanges((a,b)=>{
    if(!editOwner(blocks,a,b))allowed=false;
  });
  return allowed;
}

/** Map a single-block CodeMirror text transaction; virtual LF edits are
 * promoted to real text only when actually touched by the user.
 */
export function mapEditedBlocks(blocks,changes,autopads=[]){
  const added=new Map(autopads.map(({logicalId,length})=>[logicalId,length]));
  const autoAt=new Set(blocks.filter(row=>added.has(row.logicalId)).map(row=>row.to));
  const changed=[];
  changes.iterChanges((fromA,toA)=>{
    changed.push({fromA,toA,owner:editOwner(blocks,fromA,toA)?.logicalId});
  });
  return blocks.map(row=>({
    ...row,
    from:changes.mapPos(row.from,autoAt.has(row.from)?1:changed.some(change=>
      change.fromA===row.from&&change.owner===row.logicalId)?-1:1),
    to:changes.mapPos(row.to,added.has(row.logicalId)?1:changed.some(change=>change.fromA===row.to&&
      change.toA===row.to&&change.owner!==row.logicalId)?-1:1),
    // WP10: when someone types into a currently virtual
    // blank line, promote the WHOLE display tail into this block's real text
    // before persistence. Otherwise slicing off groupEndPad would silently
    // discard text entered by the user.
    groupEndPad:added.has(row.logicalId)?added.get(row.logicalId):
      (row.groupEndPad??0)>0&&changed.some(({fromA,toA})=>
      fromA<row.to&&(
        toA>row.to-row.groupEndPad||
        fromA===toA&&fromA>=row.to-row.groupEndPad))
      ?0:row.groupEndPad??0,
  }));
}
export function logicalTextRows(source,blocks){
  return blocks.map(row=>({logicalId:row.logicalId,baseBlockId:row.baseBlockId,
    parentId:row.parentId,logicalOrder:row.logicalOrder,
    p:row.p,b:row.b,s:row.s,
    blockType:row.blockType,
    markdownText:source.slice(row.from,row.to-(row.groupEndPad??0))}));
}
