/** WP23G: explicit real blank-line split; no implicit block creation.
 * Synthetic identity is separate from immutable original OCR IDs.
 */
import {composeOwnedSource} from './v2-block-source.js';
export const SYNTHETIC_ID_MIN=2**48;
export const SYNTHETIC_ID_MAX=2**49-1;
export const isSyntheticId=id=>Number.isSafeInteger(id)&&id>=SYNTHETIC_ID_MIN&&id<=SYNTHETIC_ID_MAX;
export function newSplitId(rows){
  const ids=new Set(rows.map(r=>r.logicalId));
  for(let i=0;i<16;i++){
    const words=crypto.getRandomValues(new Uint32Array(2));
    const id=SYNTHETIC_ID_MIN+(words[0]&65535)*2**32+words[1];
    if(!ids.has(id))return id;
  }
  throw Error('无法分配新的逻辑 ID');
}
export function splitOwnedBlock(rows,{logicalId,offset,newId}){
  composeOwnedSource(rows);
  const index=rows.findIndex(r=>r.logicalId===logicalId);
  if(index<0||!isSyntheticId(newId)||rows.some(r=>r.logicalId===newId))
    throw Error('分割逻辑身份无效');
  const row=rows[index],raw=row.markdownText;
  // Offset denotes the empty line's real LF, not the virtual final caret.
  if(!Number.isInteger(offset)||offset<0||offset>=raw.length||
    raw[offset]!=='\n'||(offset!==0&&raw[offset-1]!=='\n'))
    throw Error('仅允许在真实空行显式分割');
  const same=r=>r.p===row.p&&r.b===row.b;
  const followers=rows.slice(index+1).filter(same);
  const slot=row.b+1;
  const left=raw.slice(0,offset+1);
  const suffix=raw.slice(offset+1);
  const minTail=(text,n)=>text+'\n'.repeat(Math.max(0,n-(text.match(/\n+$/)?.[0].length||0)));
  const newRow={logicalId:newId,baseBlockId:row.baseBlockId,parentId:null,
    logicalOrder:row.logicalOrder+1,p:row.p,b:slot,s:0,blockType:'text',
    markdownText:minTail(suffix,followers.length?1:2)};
  const ordered=rows.flatMap((r,i)=>{
    if(i===index)return [{...r,markdownText:minTail(left,2)},newRow];
    if(i>index&&same(r))return [{...r,b:slot,s:r.s-row.s,parentId:newId}];
    if(r.p===row.p&&r.b>=slot)return [{...r,b:r.b+1}];
    return [r];
  }).map((r,i)=>({...r,logicalOrder:i+1}));
  return {...composeOwnedSource(ordered),newId};
}
