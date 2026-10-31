/** CMD-owned reversible logical text-block joins.
 * Original MinerU anchors, original OCR evidence and block bodies are NEVER
 * erased. A join is an ordinary CM6 source annotation immediately preceding
 * the target anchor; undo / redo and global Save follow normal CMD semantics.
 */
import {blockAnchor,quotePrefix,unquotePrefix} from './mineru-anchors.js';
const tag=/^<!-- ocr2md:block-join:v1 prev="(p\d+b\d+)" target="(p\d+b\d+)" -->$/;
// All MinerU Block types (including OCR-empty placeholders) are independent
// by default. A page boundary is NOT a paragraph boundary: p9b0 can continue
// the last anchored Block of page 8. Only the document's first Block has no
// predecessor. Keep original OCR identities and geometry unchanged.
export const isJoinable=r=>r?.anchorCount===1;
export const precedingPageBlock=(rows,target)=>{
  const ordered=rows.filter(row=>row.anchorCount===1).sort((a,b)=>a.from-b.from);
  const i=ordered.findIndex(row=>row.id===target?.id);
  if(i<=0||target.anchorCount!==1)return null;
  const previous=ordered[i-1];
  const samePage=previous.pageIndex===target.pageIndex;
  const nextPage=previous.pageIndex===target.pageIndex-1 &&
    !ordered.some(row=>row.pageIndex===target.pageIndex&&row.from<target.from);
  // The immediately preceding CMD source Block (not OCR's old blockIndex) is
  // the join parent after any page-local move. Reject orphaned anchors.
  if(rows.some(r=>r.anchorCount!==1&&
    (r.pageIndex===target.pageIndex||nextPage&&r.pageIndex===previous.pageIndex)))return null;
  return (samePage||nextPage)&&previous.anchorCount===1&&
    Number.isInteger(previous.from)&&Number.isInteger(target.from)&&
    previous.from<target.from?previous:null;
};
export function readCMDBlockJoins(source,rows){
  const lines=source.split('\n'),joined=new Map(),invalid=[];
  const byId=new Map(rows.map(r=>[r.id,r]));
  for(let i=0;i<lines.length;i++){
    const m=tag.exec(unquotePrefix(lines[i]).trim());if(!m)continue;
    const [ ,prev,target]=m;
    const next=blockAnchor(lines[i+1]||'');
    const previous=byId.get(prev),current=byId.get(target);
    if(!next||`p${next.pageIndex}b${next.blockIndex}`!==target||
      !previous||!current||previous.anchorCount!==1||current.anchorCount!==1||
      precedingPageBlock(rows,current)?.id!==previous.id||
      joined.has(target)){
      invalid.push({line:i+1,prev,target});continue;
    }
    joined.set(target,prev);
  }
  return {joined,invalid};
}
const marker=(prev,target)=>`<!-- ocr2md:block-join:v1 prev="${prev}" target="${target}" -->`;
/** Plan one CMD-only, page-local cut/insert. No second ordering state: source
 * order is the reading order. Evidence comments/page delimiters stay fixed.
 * Joined pages are intentionally not draggable in this first experiment.
 */
export function planCMDBlockMove(source,rows,fromId,afterId){
  if(typeof source!=='string'||fromId===afterId)throw Error('无效的文本块移动目标');
  const a=rows.find(r=>r.id===fromId),b=rows.find(r=>r.id===afterId);
  if(!a||!b||a.pageIndex!==b.pageIndex||
    a.anchorCount!==1||b.anchorCount!==1)throw Error('只能移动同一 PDF 页中有唯一锚点的 Block');
  const page=rows.filter(r=>r.pageIndex===a.pageIndex).sort((x,y)=>x.from-y.from);
  if(page.length<2||page.some(r=>r.anchorCount!==1||!Number.isInteger(r.from)))
    throw Error('当前页存在缺失或重复锚点，不能调整顺序');
  const {joined,invalid}=readCMDBlockJoins(source,rows);
  if(invalid.length||page.some(r=>joined.has(r.id))||
    [...joined].some(([target,prev])=>page.some(r=>r.id===prev||r.id===target)))
    throw Error('本页已有文本块合并，请先勾选恢复独立再调整顺序');
  const start=page[0].from;
  const tail=source.slice(page.at(-1).from);
  const match=/^[ \t]*(?:>[ \t]*)*<!-- minerujson:(?!block:v1:)[^\n]*/gm.exec(tail);
  if(!match)throw Error('当前页缺少安全的 MinerU 证据边界');
  const end=page.at(-1).from+match.index;
  if(end<=page.at(-1).from||end>=source.length)throw Error('文本块区间不完整');
  const pieces=page.map((r,i)=>source.slice(r.from,i+1<page.length?page[i+1].from:end));
  const original=pieces.join('');
  if(original!==source.slice(start,end))throw Error('Block 源码边界不连续');
  const moving=page.findIndex(r=>r.id===fromId);
  const target=page.findIndex(r=>r.id===afterId);
  if(moving===target+1)return {changed:0,sourceId:fromId,afterId};
  const reordered=page.map((r,i)=>({id:r.id,text:pieces[i]}));
  const [item]=reordered.splice(moving,1);
  const insertAt=reordered.findIndex(r=>r.id===afterId);
  reordered.splice(insertAt+1,0,item);
  return {changed:1,sourceId:fromId,afterId,pageIndex:a.pageIndex,
    edits:[{from:start,to:end,expected:original,insert:reordered.map(r=>r.text).join('')}]};
}
export function planCMDBlockJoin(source,rows,targetId,join){
  if(typeof source!=='string'||typeof targetId!=='string'||typeof join!=='boolean')
    throw Error('非法文本块合并指令');
  const target=rows.find(row=>row.id===targetId);
  if(!isJoinable(target))throw Error('目标文本块缺少唯一 CMD 锚点');
  const previous=precedingPageBlock(rows,target);
  if(!previous)throw Error('当前 Block 没有有效的前驱 Block，不能合并');
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
  const roots=new Map();const result=[],pageCounters=new Map(),assignments=new Map();
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
        assignments.set(row.id,parent.id);
        continue;
      }
      invalid.push({target:row.id,reason:'缺少已存在的前驱逻辑块'});
    }
    const index=pageCounters.get(row.pageIndex)||0;
    pageCounters.set(row.pageIndex,index+1);
    const logicalId=`p${row.pageIndex}b${index}`;
    const item={id:logicalId,sourceId:row.id,pageIndex:row.pageIndex,
      memberIds:[row.id],text:markdown};
    roots.set(row.id,item);assignments.set(row.id,logicalId);result.push(item);
  }
  return {blocks:result,joined,invalid,assignments};
}
