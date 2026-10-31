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
/** A join marker occupies the line immediately before its own Block anchor.
 * Its source range is separate from the previous Block's Markdown body.
 */
const joinLineBefore=(source,row)=>{
  const from=source.lastIndexOf('\n',row.from-2)+1;
  if(from<0||from>=row.from)return null;
  const text=source.slice(from,row.from);
  const m=tag.exec(unquotePrefix(text.trimEnd()).trim());
  return m?.[2]===row.id?{from,to:row.from,text,prev:m[1]}:null;
};
/** Plan one CMD-only, page-local cut/insert. Unchecked state belongs to
 * the Block, not its old predecessor: rebuild join markers with the new
 * immediate CMD predecessor in the SAME transaction. Original MinerU
 * page/evidence comments and all OCR identities remain untouched.
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
  if(invalid.length)throw Error('CMD 存在无效的文本块续接标记，请先修复');
  const marks=page.map(r=>joinLineBefore(source,r));
  for(let i=0;i<page.length;i++)
    if(Boolean(marks[i])!==joined.has(page[i].id))
      throw Error('文本块续接标记位置不匹配，不能安全移动');
  const start=marks[0]?.from??page[0].from;
  const tail=source.slice(page.at(-1).from);
  const match=/^[ \t]*(?:>[ \t]*)*<!-- minerujson:(?!block:v1:)[^\n]*/gm.exec(tail);
  if(!match)throw Error('当前页缺少安全的 MinerU 证据边界');
  const end=page.at(-1).from+match.index;
  if(end<=page.at(-1).from||end>=source.length)throw Error('文本块区间不完整');
  const pieces=page.map((r,i)=>source.slice(r.from,
    i+1<page.length?(marks[i+1]?.from??page[i+1].from):end));
  const original=page.map((r,i)=>(marks[i]?.text??'')+pieces[i]).join('');
  if(original!==source.slice(start,end))throw Error('Block 源码边界不连续');
  const moving=page.findIndex(r=>r.id===fromId);
  const target=page.findIndex(r=>r.id===afterId);
  if(moving===target+1)return {changed:0,sourceId:fromId,afterId};
  const reordered=page.map((r,i)=>({id:r.id,row:r,text:pieces[i]}));
  const [item]=reordered.splice(moving,1);
  const insertAt=reordered.findIndex(r=>r.id===afterId);
  reordered.splice(insertAt+1,0,item);
  const sorted=rows.filter(r=>r.anchorCount===1).sort((x,y)=>x.from-y.from);
  const firstGlobal=sorted.findIndex(r=>r.id===page[0].id);
  const priorPage=sorted[firstGlobal-1];
  if(priorPage&&priorPage.pageIndex!==a.pageIndex-1)
    throw Error('上一 PDF 页的 Block 顺序不连续');
  const text=reordered.map((part,i)=>{
    if(!joined.has(part.id))return part.text;
    const prev=i?reordered[i-1].id:priorPage?.id;
    if(!prev)throw Error('文档首块不能处于合并状态，请先恢复独立');
    const anchorLine=source.slice(part.row.from,source.indexOf('\n',part.row.from));
    return quotePrefix(anchorLine)+marker(prev,part.id)+'\n'+part.text;
  }).join('');
  const edits=[{from:start,to:end,expected:original,insert:text}];
  // If the first Block of the NEXT page is joined into this page's tail,
  // moving the tail changes that one cross-page predecessor as well.
  const next=sorted.find(r=>r.pageIndex===a.pageIndex+1);
  if(next&&joined.has(next.id)&&reordered.at(-1).id!==page.at(-1).id){
    const mark=joinLineBefore(source,next);
    if(!mark||mark.prev!==page.at(-1).id)
      throw Error('下一页的跨页接续标记不完整');
    const anchorLine=source.slice(next.from,source.indexOf('\n',next.from));
    edits.push({from:mark.from,to:mark.to,expected:mark.text,
      insert:quotePrefix(anchorLine)+marker(reordered.at(-1).id,next.id)+'\n'});
  }
  return {changed:1,sourceId:fromId,afterId,pageIndex:a.pageIndex,
    edits};
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
