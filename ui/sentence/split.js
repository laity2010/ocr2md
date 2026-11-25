import {engineAdapter,engineCatalog} from './engines.js';
export const ENGINE_IDS=Object.freeze(engineCatalog.map(x=>x.id));
const check=(v,m)=>{if(!v)throw Error(m);};
// Non-translation structural elements are never fed to NLP. The exact source
// remains in the lossless raw pieces, including every protected inline span.
const structural=new Set(['interline_equation','table_body','image_body','chart_body']);
const protectedPattern=/<!--[\s\S]*?-->|(?:^|\n)[ \t>]*(?:\x60{3,}|~{3,})[^\n]*\n[\s\S]*?(?:(?:\n[ \t>]*(?:\x60{3,}|~{3,})[^\n]*)(?=\n|$)|$)|<table\b[\s\S]*?<\/table\s*>|\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|!\[[^\]\n]*\]\((?:<[^>\n]*>|[^)\n]*)\)|!\[\[[^\]\n]*\]\]|\x60+[^\n\x60]+\x60+|\$[^$\n]+\$|\\\([^\n]*?\\\)|\[\^[^\]\n]+\](?::[ \t]*)?|<[^>\n]+>|https?:\/\/[^\s<>()]+/giu;
export function projectBlock(block){
 const text=block.text;const mask=new Uint8Array(text.length);
 const hide=(a,b)=>mask.fill(1,a,b);
 if(structural.has(block.blockType))hide(0,text.length);
 else{
  for(const m of text.matchAll(protectedPattern))hide(m.index,m.index+m[0].length);
  for(const m of text.matchAll(/^[ \t]*(?:>[ \t]*)*(?:\[![^\]\n]+\][+-]?[^\n]*|#{1,6}[ \t]+|[-*+][ \t]+|\d+[.)][ \t]+)/gm))hide(m.index,m.index+m[0].length);
 }
 let clean='',map=[],space=null;
 for(let i=0;i<text.length;i++){
  if(mask[i]||/\s/u.test(text[i])){if(clean&&space===null)space=i;continue;}
  if(space!==null){clean+=' ';map.push(null);space=null;}
  clean+=text[i];map.push(i);
 }
 return {clean,map};
}
function rangesFor(map,start,end){
 const ranges=[];for(let i=start;i<end;i++){const at=map[i];if(at===null)continue;const last=ranges.at(-1);if(last&&last.to===at)last.to=at+1;else ranges.push({from:at,to:at+1});}return ranges;
}
function makePieces(text,units){
 const spans=units.flatMap((u,i)=>u.sourceRanges.map(r=>({...r,unit:i}))).sort((a,b)=>a.from-b.from);let cursor=0;const pieces=[];
 for(const r of spans){check(r.from>=cursor&&r.to>r.from&&r.to<=text.length,'源区间重叠');if(cursor<r.from)pieces.push({kind:'raw',from:cursor,to:r.from,text:text.slice(cursor,r.from)});pieces.push({kind:'sentence',...r,text:text.slice(r.from,r.to)});cursor=r.to;}
 if(cursor<text.length)pieces.push({kind:'raw',from:cursor,to:text.length,text:text.slice(cursor)});
 return pieces;
}
export function rebuildBlock(result){
 let cursor=0;const chunks=[];
 for(const p of result.pieces){check(p.from===cursor&&p.to-p.from===p.text.length&&p.to>p.from,'源分片不连续');cursor=p.to;chunks.push(p.text);}
 check(cursor===result.sourceLength,'源分片覆盖不全');return chunks.join('');
}
export function splitBlock(block,engine){
 const {clean,map}=projectBlock(block),units=[];
 if(clean){
  const boundaries=engineAdapter(engine).segment(clean);
  let prev=0;
  for(const {start,end} of boundaries){
   check(Number.isInteger(start)&&Number.isInteger(end)&&start>=prev&&end>start&&end<=clean.length&&!clean.slice(prev,start).trim(),'引擎遗漏或重叠正文 '+engine);
   prev=end;const original=clean.slice(start,end).trim();if(!original)continue;
   units.push({original,sourceRanges:rangesFor(map,start,end)});
  }
  check(!clean.slice(prev).trim(),'引擎结尾遗漏 '+engine);
 }
 const result={logicalId:block.logicalId,sourceSha256:block.sha256,engine,sourceLength:block.text.length,units,pieces:makePieces(block.text,units)};
 check(rebuildBlock(result)===block.text,'分句无法无损还原');return result;
}
export function splitSnapshot(snapshot){
 return snapshot.blocks.map(block=>({logicalId:block.logicalId,sourceSha256:block.sha256,candidates:ENGINE_IDS.map(engine=>{
  try{return splitBlock(block,engine);}catch(error){return {engine,error:error.message,logicalId:block.logicalId};}
 })}));
}
