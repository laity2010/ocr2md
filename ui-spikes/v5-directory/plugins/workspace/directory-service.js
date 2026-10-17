/** Read-only directory adapter owned exclusively by the workspace plugin.
 * Directory selection only changes transient state; no persistent mutation.
 * WCP sees typed messages, never credentials or direct filesystem objects.
 */
const ROOT='/ocr2md';
const KEY='ocr2md-v5-workspace-access-key';
const OLD_KEY='ocr2md-v3-mac-vault-key';
const TEXT=/\.(?:md|markdown|txt|json|jsonl|yaml|yml|csv|html|htm|xml|log|ini|tex|rst)$/i;
const errorText=e=>String(e?.message||e).slice(0,500);
export function directoryPath(value){
 if(typeof value!=='string'||value.length>2000||!(value===ROOT||value.startsWith(ROOT+'/'))||
   /[\\\u0000-\u001f\u007f]/u.test(value)||value.slice(1).split('/').some(x=>x==='.'||x==='..'||x===''))
  throw Error('WORKSPACE_PATH_OUTSIDE_ROOT');
 return value;
}
const integer=v=>Math.max(0,Math.floor(Number(v)||0));
const str=(v,n)=>String(v??'').slice(0,n);
export const directoryModule={
 id:'ocr2md:directory',name:'只读工作目录服务',version:'1.0.0',presentation:'service',order:0,
 description:'仅读取 Mac Vault 目录、预览文本及选择目录；不修改文件、不解析文档。',
 setup(bus){
  let selected='',key=sessionStorage.getItem(KEY)||'';
  const abort=new AbortController();
  const urls=(op,params={})=>'/__v3/fs?'+new URLSearchParams({op,...params});
  async function request(op,params={},override=key){
   const headers=new Headers();if(override)headers.set('X-OCR2MD-V3-Key',override);
   const response=await fetch(urls(op,params),{headers,credentials:'same-origin',cache:'no-store',signal:abort.signal});
   const type=response.headers.get('content-type')||'';
   if(!type.includes('application/json'))throw Error('WORKSPACE_BACKEND_NOT_JSON');
   const data=await response.json();
   if(!response.ok)throw Error('Vault '+response.status+': '+str(data.error||data.code||'unavailable',350));
   return data;
  }
  async function status(override=key){
   try{
    const result=await request('status',{},override);
    return {authorized:Boolean(result.authorized),canPairLocally:Boolean(result.canPairLocally),
      rootLabel:str(result.rootLabel||'Obsidian/ocr2md',200),error:str(result.error||'',500)};
   }catch(e){return{authorized:false,canPairLocally:false,rootLabel:'Obsidian/ocr2md',error:errorText(e)}}
  }
  async function list(path,cursor=''){
   directoryPath(path);
   const data=await request('list',{path,...cursor?{cursor}:{}});
   const entries=(data.entries||[]).slice(0,160).map(item=>({
    nodeId:str(item.nodeId,128),path:directoryPath(item.path),
    name:str(item.path.split('/').at(-1),512),kind:str(item.kind,24),size:integer(item.size),
    revision:str(item.revision,256),modifiedAt:str(item.modifiedAt,96),
   }));
   return{path,entries,cursor:str(data.nextCursor||'',2000),error:'',truncated:entries.length<((data.entries||[]).length)||Boolean(data.nextCursor)};
  }
  const clean=[];
  clean.push(bus.handle('workspace.status',async()=>status()));
  clean.push(bus.handle('workspace.authorize',async({key:value,pairOnMac})=>{
   // Keys are only stored in sessionStorage; never returned on the WCP bus.
   const candidate=str(value,256).trim();
   let result;
   if(pairOnMac){try{await request('pair',{},candidate)}catch(e){return{authorized:false,canPairLocally:false,rootLabel:'Obsidian/ocr2md',error:errorText(e)}}}
   result=await status(candidate);
   if(result.authorized){key=candidate;sessionStorage.setItem(KEY,key)}
   return result;
  }));
  clean.push(bus.handle('workspace.reuse-v3',async()=>{
   const previous=sessionStorage.getItem(OLD_KEY)||'';
   const result=await status(previous);
   if(result.authorized){key=previous;sessionStorage.setItem(KEY,key)}
   return result;
  }));
  clean.push(bus.handle('workspace.list',async({path,cursor})=>{
   try{return await list(path,cursor)}catch(e){return{path:ROOT,entries:[],cursor:'',error:errorText(e),truncated:false}}
  }));
  clean.push(bus.handle('workspace.preview',async({path,nodeId,revision})=>{
   try{
    directoryPath(path);
    if(!TEXT.test(path))return {text:'仅预览文本格式的文件；PDF 请在专用预览模块打开。',truncated:false,error:''};
    const response=await request('read',{path,nodeId,revision,offset:'0',length:'16384'});
    const bytes=Uint8Array.from(atob(response.base64||''),char=>char.charCodeAt(0));
    const text=new TextDecoder('utf-8',{fatal:false}).decode(bytes);
    return{text:str(text,24576),truncated:Boolean(response.totalBytes>bytes.length),error:''};
   }catch(e){return{text:'',truncated:false,error:errorText(e)}}
  }));
  clean.push(bus.handle('workspace.activate',async({path})=>{
   try{
    directoryPath(path);
    const page=await list(path);
    if(page.error)throw Error(page.error);
    const pdfCount=page.entries.filter(e=>e.kind!=='directory'&&/\.pdf$/i.test(e.name)).length;
    if(pdfCount===0||page.truncated)return{selected:false,path,pdfCount,error:page.truncated?'目录结果未完整，无法确认书籍':'所选目录没有 PDF'};
    selected=path;
    await bus.publish('workspace.selected',{path,pdfCount});
    return{selected:true,path,pdfCount,error:''};
   }catch(e){return{selected:false,path:ROOT,pdfCount:0,error:errorText(e)}}
  }));
  clean.push(bus.handle('workspace.current',async()=>({path:selected||ROOT,selected:Boolean(selected)})));
  return()=>{abort.abort();selected='';for(const release of clean)release()};
 },
};
