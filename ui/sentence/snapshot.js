import {mdlineTypes,quoteLevel} from './mdline-attributes.js';
/** WP04B: verify the V2 transport, expose only immutable Markdown lines. */
const require=(ok,message)=>{if(!ok)throw Error(message);};
export async function sha256(text){
 const bytes=new TextEncoder().encode(text);
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
}
const integer=(v,min=0)=>Number.isSafeInteger(v)&&v>=min;
// Pure Markdown input, independent of OCR structure. LF belongs to the line
// that it terminates; an EOF cursor after LF is not a physical source line.
export async function createMDLineSnapshot(markdown){
 require(typeof markdown==='string'&&new TextEncoder().encode(markdown).length<=8*1024*1024,'Markdown 快照大小无效');
 const sourceSha256=await sha256(markdown),lines=[];
 for(let from=0;from<markdown.length;){
  const lf=markdown.indexOf('\n',from),textTo=lf<0?markdown.length:lf,to=lf<0?textTo:lf+1;
  lines.push({sourceLine:lines.length+1,from,to,textTo,text:markdown.slice(from,textTo),eol:markdown.slice(textTo,to)});
  from=to;
 }
 const types=mdlineTypes(markdown);let owner=null;
 for(const [i,line] of lines.entries()){
  line.type=types[i];line.level=quoteLevel(line.text);
  if(line.type==='blank'&&owner){line.ownerLine=owner.sourceLine;owner.ownedTail+=line.text+line.eol;}
  else{owner=line;line.ownerLine=line.sourceLine;line.ownedTail=line.eol;}
 }
 const frozen=await Promise.all(lines.map(async line=>Object.freeze({...line,sha256:await sha256(line.text+line.eol)})));
 return Object.freeze({schema:'ocr2md-sentence-mdline/v1',documentVersion:sourceSha256,sourceSha256,markdown,lines:Object.freeze(frozen)});
}
export async function importSnapshot(input){
 require(input?.schema==='v2-logical-md/v3','分句需要 V2 真实 LF 快照；旧式虚拟分隔符不可作为 MDLine');
 const {markdown:md,segments,sha256:digest}=input;
 require(typeof md==='string'&&new TextEncoder().encode(md).length<=8*1024*1024&&Array.isArray(segments)&&segments.length<=100000,'V2 快照大小无效');
 require(input.rowCount===segments.length&&input.lengthUtf16===md.length&&await sha256(md)===digest,'V2 全文摘要或长度不符');
 const ids=new Set(),blocks=[];let cursor=0,chars=0;
 for(let i=0;i<segments.length;i++){
  const x=segments[i];
  require(x&&integer(x.logicalId,1)&&!ids.has(x.logicalId)&&integer(x.baseBlockId,1)&&x.logicalOrder===i+1&&typeof x.blockType==='string','逻辑块身份无效');
  require(x.parentId===null||integer(x.parentId,1),'父块身份无效');
  require([x.p,x.b,x.s].every(v=>v===null)||[x.p,x.b,x.s].every(v=>integer(v)),'PBS 无效');
  require(x.startUtf16===cursor&&integer(x.endUtf16,cursor)&&x.endUtf16<=md.length&&x.startChar===chars,'块位置不连续');
  const text=md.slice(cursor,x.endUtf16);
  require(text.endsWith('\n'),'V2 逻辑块缺少真实 LF');
  const count=Array.from(text).length;
  require(x.endChar===chars+count&&await sha256(text)===x.fragmentSha256,'块摘要或字符位置不符');
  // UTF-16 cut must not separate a surrogate pair.
  require(!(/[\uD800-\uDBFF]$/u.test(text)&&/^[\uDC00-\uDFFF]/u.test(md.slice(x.endUtf16))),'代理对截断');
  const block=Object.freeze({logicalId:x.logicalId,baseBlockId:x.baseBlockId,parentId:x.parentId,logicalOrder:x.logicalOrder,blockType:x.blockType,p:x.p,b:x.b,s:x.s,from:cursor,to:x.endUtf16,text,sha256:x.fragmentSha256});
  blocks.push(block);ids.add(x.logicalId);cursor=x.endUtf16;chars+=count;
 }
 require(cursor===md.length,'存在未映射正文');
 const byId=new Map(blocks.map(b=>[b.logicalId,b]));
 for(const b of blocks){const seen=new Set();let node=b;while(node){require(!seen.has(node.logicalId),'父块循环');seen.add(node.logicalId);if(node.parentId===null)break;node=byId.get(node.parentId);require(node,'父块缺失');}}
 return createMDLineSnapshot(md);
}
export async function readV2Snapshot(workspace,fetcher=fetch){
 require(typeof workspace==='string'&&workspace.length>0,'未绑定资料目录');
 const url='/labs/lab-ocr-v2/api/mineru-base/markdown?'+new URLSearchParams({workspace});
 const response=await fetcher(url,{method:'GET',credentials:'same-origin',cache:'no-store'});
 if(!response.ok)throw Error('V2 只读快照 HTTP '+response.status);
 return importSnapshot(await response.json());
}
export function createSnapshotSession({report=()=>{},reader=readV2Snapshot}={}){
 let generation=0,current=null;
 return Object.freeze({getSnapshot:()=>current,
  async load(path){
   const seq=++generation;
   try{
    const snapshot=await reader(path);
    if(seq!==generation)return null;
    current=snapshot;
    report('V2 已保存逻辑表 · '+snapshot.lines.length+' MDLine · '+snapshot.documentVersion.slice(0,12),'ok');
    return snapshot;
   }catch(error){if(seq===generation){current=null;report('分句快照读取失败：'+error.message,'error');}return null;}
  },
  invalidate(){generation++;current=null;}
 });
}
