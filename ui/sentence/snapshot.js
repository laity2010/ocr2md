/** WP01: immutable, tag-free import of the public V2 logical snapshot. */
const require=(ok,message)=>{if(!ok)throw Error(message);};
export async function sha256(text){
 const bytes=new TextEncoder().encode(text);
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
}
const integer=(v,min=0)=>Number.isSafeInteger(v)&&v>=min;
export async function importSnapshot(input){
 require(input&&['v2-logical-md/v2','v2-logical-md/v3'].includes(input.schema),'V2 快照协议不支持');
 const {markdown:md,segments,sha256:digest}=input;
 require(typeof md==='string'&&new TextEncoder().encode(md).length<=8*1024*1024&&Array.isArray(segments)&&segments.length>0&&segments.length<=100000,'V2 快照大小无效');
 require(input.rowCount===segments.length&&input.lengthUtf16===md.length&&await sha256(md)===digest,'V2 全文摘要或长度不符');
 const ids=new Set(),blocks=[];let cursor=0,chars=0;
 for(let i=0;i<segments.length;i++){
  const x=segments[i];
  if(i&&input.schema==='v2-logical-md/v2'){require(md.slice(cursor,cursor+2)==='\n\n','分隔符不符');cursor+=2;chars+=2;}
  require(x&&integer(x.logicalId,1)&&!ids.has(x.logicalId)&&integer(x.baseBlockId,1)&&x.logicalOrder===i+1&&typeof x.blockType==='string','逻辑块身份无效');
  require(x.parentId===null||integer(x.parentId,1),'父块身份无效');
  require([x.p,x.b,x.s].every(v=>v===null)||[x.p,x.b,x.s].every(v=>integer(v)),'PBS 无效');
  require(x.startUtf16===cursor&&integer(x.endUtf16,cursor)&&x.endUtf16<=md.length&&x.startChar===chars,'块位置不连续');
  const text=md.slice(cursor,x.endUtf16);
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
 const documentVersion=await sha256(JSON.stringify([input.schema,digest,blocks.map(({logicalId,baseBlockId,parentId,logicalOrder,blockType,p,b,s,from,to,sha256})=>[logicalId,baseBlockId,parentId,logicalOrder,blockType,p,b,s,from,to,sha256])]));
 return Object.freeze({schema:'ocr2md-sentence-source/v1',sourceSchema:input.schema,documentVersion,sourceSha256:digest,markdown:md,blocks:Object.freeze(blocks)});
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
    report('V2 已保存逻辑表 · '+snapshot.blocks.length+' 块 · '+snapshot.documentVersion.slice(0,12),'ok');
    const {splitSnapshot}=await import('./split.js');
    const results=splitSnapshot(snapshot);
    if(seq!==generation)return null;
    const failures=results.flatMap(r=>r.candidates).filter(c=>c.error).length;
    report('分句候选已生成 · '+snapshot.blocks.length+' 块 · '+failures+' 个引擎失败待审','ok');

    return snapshot;
   }catch(error){if(seq===generation){current=null;report('分句快照读取失败：'+error.message,'error');}return null;}
  },
  invalidate(){generation++;current=null;}
 });
}
