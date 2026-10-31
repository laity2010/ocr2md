/** CMD-owned reversible logical text-block joins.
 * Original MinerU anchors, original OCR evidence and block bodies are NEVER
 * erased. A join is an ordinary CM6 source annotation immediately preceding
 * the target anchor; undo / redo and global Save follow normal CMD semantics.
 */
import {blockAnchor,quotePrefix,unquotePrefix} from './mineru-anchors.js';
const tag=/^<!-- ocr2md:block-join:v1 prev="(p\d+b\d+)" target="(p\d+b\d+)" -->$/;
export const isJoinable=r=>r?.anchorCount===1&&r.type==='text'&&
  (r.textHead?.trim()||r.textTail?.trim());
export function readCMDBlockJoins(source,rows){
  const lines=source.split('\n'),joined=new Map(),invalid=[];
  const byId=new Map(rows.map(r=>[r.id,r]));
  for(let i=0;i<lines.length;i++){
    const m=tag.exec(unquotePrefix(lines[i]).trim());if(!m)continue;
    const [ ,prev,target]=m;
    const next=blockAnchor(lines[i+1]||'');
    if(!next||`p${next.pageIndex}b${next.blockIndex}`!==target||
      !byId.has(prev)||!byId.has(target)||joined.has(target)){
      invalid.push({line:i+1,prev,target});continue;
    }
    joined.set(target,prev);
  }
  return {joined,invalid};
}
const marker=(prev,target)=>`<!-- ocr2md:block-join:v1 prev="${prev}" target="${target}" -->`;
export function planCMDBlockJoin(source,rows,targetId,join){
  if(typeof source!=='string'||typeof targetId!=='string'||typeof join!=='boolean')
    throw Error('非法文本块合并指令');
  const ordered=rows.filter(r=>r.anchorCount===1).sort((a,b)=>a.from-b.from);
  const i=ordered.findIndex(r=>r.id===targetId);
  if(i<0)throw Error('目标文本块没有唯一 CMD 锚点');
  const target=ordered[i];
  if(!isJoinable(target))throw Error('空白块、图表和非文本 Block 不能合并正文');
  let before=i-1;
  // An OCR-empty placeholder is not a paragraph boundary. Do not jump over
  // images, headings, formulae or populated non-text blocks.
  while(before>=0&&ordered[before].type==='text'&&!isJoinable(ordered[before]))before--;
  const previous=ordered[before];
  if(!isJoinable(previous))throw Error('找不到相邻且有正文的前一个文本块');
  // Reading order is the CMD block-anchor order, not arbitrary PDF bbox order.
  const {joined,invalid}=readCMDBlockJoins(source,rows);
  if(invalid.length)throw Error('CMD 存在无效的文本块续接标记，先修复后再编辑');
  const old=joined.get(targetId);
  if(join){
    if(old===previous.id)return {changed:0,previous:previous.id,target:targetId};
    if(old)throw Error('目标文本块已经接续到其他块');
  }else{
    if(!old)return {changed:0,previous:previous.id,target:targetId};
    if(old!==previous.id)throw Error('目标文本块的前驱关系发生变化');
  }
  const lineStart=source.lastIndexOf('\n',target.from-1)+1;
  if(lineStart!==target.from)throw Error('文本块锚点不在独立行');
  const anchorLine=source.slice(target.from,source.indexOf('\n',target.from));
  const text=quotePrefix(anchorLine)+marker(previous.id,targetId);
  if(join)return {changed:1,previous:previous.id,target:targetId,
    edits:[{from:target.from,to:target.from,expected:'',insert:text+'\n'}]};
  const pre=source.slice(0,target.from);
  const prevLineStart=pre.lastIndexOf('\n',pre.length-2)+1;
  const prevLine=pre.slice(prevLineStart).replace(/\n$/,'');
  if(prevLine!==text)throw Error('续接标记不在目标 Block 正前方，无法安全撤销');
  return {changed:1,previous:previous.id,target:targetId,
    edits:[{from:prevLineStart,to:target.from,expected:text+'\n',insert:''}]};
}
export function projectCMDLogicalTextBlocks(source,rows){
  const {joined,invalid}=readCMDBlockJoins(source,rows);
  const ordered=rows.filter(r=>r.anchorCount===1).sort((a,b)=>a.from-b.from);
  const roots=new Map();const result=[];
  for(let i=0;i<ordered.length;i++){
    const row=ordered[i],from=row.from;
    const next=ordered[i+1]?.from??source.indexOf('<!-- minerujson:source:v1:');
    const lineEnd=source.indexOf('\n',from);
    const markdown=source.slice(lineEnd+1,next<0?source.length:next)
      .replace(/<!--\s*ocr2md:block-join:v1[^\n]*-->/g,'')
      .replace(/<!--[\s\S]*?-->/g,'').trim();
    if(joined.has(row.id)){
      const parent=roots.get(joined.get(row.id));
      if(parent){
        parent.memberIds.push(row.id);
        parent.text=parent.text?(parent.text.replace(/\s+$/,'')+' '+markdown):markdown;
        roots.set(row.id,parent);
        continue;
      }
      invalid.push({target:row.id,reason:'缺少已存在的前驱逻辑块'});
    }
    const item={id:row.id,memberIds:[row.id],text:markdown};
    roots.set(row.id,item);result.push(item);
  }
  return {blocks:result,joined,invalid};
}
