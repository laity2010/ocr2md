/** Read-only index of media and mathematics in a published chapter.
 * The *same* physical MD offsets drive AG → CodeMirror → DIRjson/PDF evidence.
 * No network, image fetch, file writes, or OCR text mutation.
 */
import {createHash} from 'crypto';
import type {Candidate} from './types';
export type CleanElementModule='媒体'|'表格'|'LaTeX';
const image=/!\[(?:[^\]\\]|\\.)*\]\(\s*(?:<([^>]+)>|([^\s)]+))[^\n)]*\)|!\[\[([^\]\n]+)\]\]|<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>/gi;
function clip(s:string){return s.replace(/\s+/g,' ').slice(0,145);}
export function scanChapterElements(md:string,sourcePath:string,module:CleanElementModule):Candidate[]{
 const text=md.replace(/\r\n?/g,'\n'),lines=text.split('\n'),starts:number[]=[];
 for(let i=0,pos=0;i<lines.length;i++){starts.push(pos);pos+=lines[i].length+1;}
 const occupied:[number,number][]=[],items:{from:number;to:number;kind:string;value:string;url?:string}[]=[];
 const record=(from:number,to:number,kind:string,url?:string)=>{
   if(from<0||to<=from||occupied.some(([a,b])=>from<b&&to>a)&&kind!=='表格内公式')return;
   items.push({from,to,kind,value:text.slice(from,to),url});
 };
 const within=(pos:number)=>occupied.some(([a,b])=>pos>=a&&pos<b);
 // Explicit fences dominate anything that looks like a literal image or
 // inline formula inside the fenced source code.
 for(let i=0;i<lines.length;i++){
   const m=/^ {0,3}(`{3,}|~{3,})([a-z]*)\s*$/i.exec(lines[i]);
   if(!m)continue;
   let end=i+1;
   const close=new RegExp(`^ {0,3}${m[1][0]}{${m[1].length},}[ \\t]*$`);
   for(;end<lines.length&&!close.test(lines[end]);end++){}
   if(end>=lines.length)continue;
   const content=lines.slice(i+1,end).join('\n');
   const from=starts[i],to=starts[end]+lines[end].length;
   occupied.push([from,to]);
   if(module==='LaTeX'&&/^(math|latex|tex)$/i.test(m[2]))items.push({from,to,kind:'独立公式',value:content});
   if(module==='表格'&&m[2].toLowerCase()==='html'&&/^\s*<table\b[\s\S]*<\/table>\s*$/i.test(content))
     items.push({from,to,kind:'HTML 表格',value:content});
   i=end;
 }
 if(module==='媒体'){
   for(const m of text.matchAll(image)){
     if(within(m.index))continue;
     const url=m[1]??m[2]??m[3]??m[4]??m[5]??m[6];
     record(m.index,m.index+m[0].length,'图片',url);
   }
   // MinerU's IR deliberately exports remote images as inert provenance
   // links until an explicit authenticated download. Include these in Media.
   for(const m of text.matchAll(/\[(?:图片|图表|表格图片)(?:来源|图片来源)?[^\]\n]*\]\((https?:\/\/[^\s)]+)\)/g))
     if(!within(m.index))record(m.index,m.index+m[0].length,'图片来源',m[1]);
 }else if(module==='表格'){
   for(const m of text.matchAll(/<table\b[^>]*>[\s\S]*?<\/table\s*>/gi))
     if(!within(m.index))record(m.index,m.index+m[0].length,'HTML 表格');
 }else{
   // Inline, display and common Obsidian/LaTeX delimiters. Do not inspect
   // JS, HTML or non-math fenced code examples, even when they contain $. 
   const math=/\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|(?<!\\)\$(?!\$)(?:\\.|[^$\n\\])+?(?<!\\)\$/g;
   for(const m of text.matchAll(math))if(!within(m.index))
     record(m.index,m.index+m[0].length,m[0].startsWith('$$')||m[0].startsWith('\\[')?'独立公式':'行内公式');
   // MinerU occasionally embeds formulas inside table cells as <eq>...</eq>.
   // The media module owns the HTML table; LaTeX retains every such formula.
   for(const m of text.matchAll(/<eq(?:\s[^>]*)?>([\s\S]*?)<\/eq>/gi))
     record(m.index,m.index+m[0].length,'表格内公式');
   // Exported Obsidian HTML replaces unsupported MinerU <eq> with an inert,
   // editable code span, never discarding or silently guessing its formula.
   for(const m of text.matchAll(/<code class="ocr2md-latex-pending">([\s\S]*?)<\/code>/gi))
     record(m.index,m.index+m[0].length,'表格内公式（待清洗）');
   for(let i=0;i<lines.length;i++){
     if(!/\\(?:frac|dfrac|tfrac|mathsf|sum|int|sqrt|begin)\b/.test(lines[i]))continue;
     if(within(starts[i])||items.some(x=>x.from<starts[i]+lines[i].length&&x.to>starts[i]))continue;
     record(starts[i],starts[i]+lines[i].length,'疑似缺失数学定界');
   }
 }
 items.sort((a,b)=>a.from-b.from);
 const physicalLine=(offset:number)=>{
   let lo=0,hi=starts.length-1;
   while(lo<=hi){const mid=(lo+hi)>>1;
     if(starts[mid]<=offset)lo=mid+1;else hi=mid-1;}
   return Math.max(0,hi);
 };
 const markers=[...text.matchAll(/<!--\s*ocr2md-ir:block=(blk_[a-f0-9]{24})\s*-->/g)]
   .map(m=>({offset:m.index,id:m[1]}));
 return items.map((x,i)=>{
   const first=physicalLine(x.from),last=physicalLine(Math.max(x.from,x.to-1));
   const parent=markers.filter(m=>m.offset<=x.from).at(-1)?.id;
   const id=createHash('sha256').update(`${x.from}\0${x.value}`).digest('hex').slice(0,16);
   const local=!!x.url&&/^(?:\.\/)?(?:imgs\/|\.\.\/imgs\/|[^:]+\.(?:png|jpe?g|gif|webp)$)/i.test(x.url);
   return {id:`clean-${module}-${i}-${id}`,kind:'regex' as const,
     rowId:`clean-${module}-${i}-${id}`,label:`${x.kind} · ${clip(x.value)}`,
     raw:x.value,preview:clip(x.value),sourcePath,
     sourceLabel:sourcePath.split('/').at(-1),
     typeLabel:module==='媒体'?'媒体' as const:'文本块' as const,
     lineType:x.kind,range:{line:first,start:x.from-starts[first],
       ...(last>first?{endLine:last}:{}),end:x.to-starts[last]},
     ...(module==='媒体'&&x.url?{mediaGroup:local?'已采用' as const:'未下载' as const,
       mediaSourceUrl:!local?x.url:undefined,
       localPath:local?x.url:undefined,mediaPath:x.url}:{}),
     ...(parent?{parentBlockId:parent}:{}),
     status:'候选',
   } satisfies Candidate;
 });
}
