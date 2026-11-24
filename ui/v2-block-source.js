/** WP14 preserves one PHYSICAL TEXT line per logical MD Block, not one
 * CM6 document line including structural blank separators. WP13 remains
 * authoritative for DISPLAY SPACING: one LF inside a (p,b) parent group;
 * two LF at the end of each independent parent group. Existing SQL text is
 * never trimmed during projection, dragging, or loading an edited book.
 */
export const BLOCK_END='\n\n';
export const CHILD_LINE_END='\n';
const BACKEND_SEP='\n\n';
const groupKey=row=>String(row.p)+'/'+String(row.b);
export function groupEndPadding(text){
  if(typeof text!=='string')throw Error('逻辑文本无效');
  return text.endsWith(BLOCK_END)?'':text.endsWith(CHILD_LINE_END)?CHILD_LINE_END:BLOCK_END;
}
export function childLinePadding(text){
  if(typeof text!=='string')throw Error('逻辑文本无效');
  return text.endsWith(CHILD_LINE_END)?'':CHILD_LINE_END;
}
export function composeLogicalSource(rows){
  if(!Array.isArray(rows))throw Error('逻辑块无效');
  let source='';
  const blocks=rows.map((row,i)=>{
    if(typeof row?.markdownText!=='string')throw Error('逻辑文本无效');
    const next=rows[i+1];
    const sameGroup=next&&groupKey(row)===groupKey(next);
    const padding=sameGroup?childLinePadding(row.markdownText):groupEndPadding(row.markdownText);
    const from=source.length;
    source+=row.markdownText+padding;
    // Compatibility name: count of virtual LF at the end of THIS block.
    return {...row,from,to:source.length,groupEndPad:padding.length};
  });
  return {source,blocks};
}
/** WP23D owned-LF model: all text and LF belong to real logical rows.
 * Strict read-only projection. No padding, no stripping, no implicit migration.
 * Legacy live callers remain on v2 until the editor/SQL transition is validated.
 */
export function composeOwnedSource(rows){
  if(!Array.isArray(rows))throw Error('Invalid logical rows');
  let source='';
  const ids=new Set(),groups=new Set();
  let rootId=null;
  const blocks=rows.map((row,i)=>{
    const next=rows[i+1],prev=rows[i-1],key=groupKey(row);
    const same=next&&groupKey(next)===key;
    if(!Number.isSafeInteger(row.logicalId)||row.logicalId<=0||ids.has(row.logicalId)||
      !Number.isSafeInteger(row.baseBlockId)||row.baseBlockId<=0||
      row.logicalOrder!==i+1||typeof row.blockType!=='string'||
      ![row.p,row.b,row.s].every(v=>Number.isSafeInteger(v)&&v>=0)||
      typeof row.markdownText!=='string'||row.markdownText.includes('\r')||
      !row.markdownText.endsWith(same?'\n':'\n\n'))
      throw Error('Invalid owned block or missing owned LF');
    ids.add(row.logicalId);
    if(!prev||groupKey(prev)!==key){
      if(groups.has(key)||row.s!==0||row.parentId!==null)throw Error('Invalid PBS group');
      groups.add(key);rootId=row.logicalId;
    }else{
      if(row.s<=prev.s||row.parentId!==rootId)throw Error('Invalid PBS child');
    }
    const from=source.length;
    source+=row.markdownText;
    return {...row,from,to:source.length};
  });
  return {source,blocks};
}
export function composeBlockSource(snapshot){
  if(!snapshot||!['v2-logical-md/v2','v2-logical-md/v3'].includes(snapshot.schema)||
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
    if(i&&snapshot.schema==='v2-logical-md/v2'){
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
  return snapshot.schema==='v2-logical-md/v3'?composeOwnedSource(blocks):composeLogicalSource(blocks);
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

/** WP18: project an ordinary CM6 edit using ACTUAL MD text ownership.
 *
 * A virtual LF is not part of md_block, even when a user types adjacent to
 * it. Never guess new block intervals via ChangeDesc.mapPos at a shared
 * boundary: the wrong association can shift every following logical block
 * by two UTF-16 units and persist prefixes from their next sibling.
 *
 * Callers accept this projection only when its source exactly equals the
 * proposed CM6 document. If it doesn't, the transaction is not a safe
 * one-line text edit; explicit typed block replacement/normalization handles
 * more complex changes with its own Undo/Redo history.
 */
export function planOwnedTextEdit(source,blocks,changes){
  if(typeof source!=='string'||!Array.isArray(blocks)||!changes?.iterChanges)
    return null;
  const original=logicalTextRows(source,blocks);
  if(!blocks.length||blocks[0].from!==0||blocks.at(-1).to!==source.length||
     blocks.some((row,i)=>!Number.isSafeInteger(row.logicalId)||
       !Number.isInteger(row.groupEndPad)||row.groupEndPad<0||
       row.from<0||row.to<row.from+row.groupEndPad||
       i>0&&row.from!==blocks[i-1].to))return null;
  const byId=new Map();let valid=true,affected=0;
  changes.iterChanges((fromA,toA,fromB,toB,inserted)=>{
    if(!valid)return;
    const content=inserted.toString();
    if(/[\r\n]/.test(content)){valid=false;return;}
    // Prefer the next row for a zero-width edit at an actual block start.
    // The display-only LF tail is NEVER part of the editable MD Block.
    const candidates=blocks.filter(row=>fromA>=row.from&&
      toA<=row.to-row.groupEndPad);
    const owner=candidates.find(row=>fromA===row.from)||candidates[0];
    if(!owner){valid=false;return;}
    if(!byId.has(owner.logicalId))byId.set(owner.logicalId,[]);
    byId.get(owner.logicalId).push({from:fromA-owner.from,to:toA-owner.from,insert:content});
    affected++;
  });
  if(!valid||!affected)return null;
  const updates=original.map(row=>{
    const edits=byId.get(row.logicalId);
    if(!edits)return row;
    const old=row.markdownText;let cursor=0,result='';
    for(const edit of edits){
      if(edit.from<cursor||edit.from>edit.to||edit.to>old.length){valid=false;break;}
      result+=old.slice(cursor,edit.from)+edit.insert;
      cursor=edit.to;
    }
    return {...row,markdownText:result+old.slice(cursor)};
  });
  return valid?composeLogicalSource(updates):null;
}
