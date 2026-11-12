/** Read-only PBS parent relations and highlight state, independent of PDF/AG.
 * All identities are stable Block IDs; never parse a mutable PBS label.
 */
export function indexBlockParents(target,boxes){
  for(const box of boxes||[]){
    if(box?.blockId===null||box?.blockId===undefined)continue;
    const id=String(box.blockId);
    if(!id)continue;
    const parent=box.parentBlockId===null||box.parentBlockId===undefined||
      String(box.parentBlockId)===''?null:String(box.parentBlockId);
    target.set(id,parent===id?null:parent);
  }
  return target;
}

/** direct | family | none: descendants only, never ancestors/siblings.
 * The IDs set can contain aliases of a geometrically deduplicated block.
 */
export function blockHighlight(blockIds,selectedBlockId,parents){
  if(selectedBlockId===null||selectedBlockId===undefined)return 'none';
  const selected=String(selectedBlockId);
  const ids=[...blockIds].map(String);
  if(ids.includes(selected))return 'direct';
  for(const id of ids){
    const visited=new Set([id]);
    let cursor=id;
    while(parents.has(cursor)){
      const parent=parents.get(cursor);
      if(!parent||visited.has(parent))break;
      if(parent===selected)return 'family';
      visited.add(parent);
      cursor=parent;
    }
  }
  return 'none';
}
