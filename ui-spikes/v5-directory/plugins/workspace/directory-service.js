/** Read-only directory navigation adapter owned exclusively by the workspace plugin.
 * Directory selection only changes transient state; no persistent mutation.
 * WCP sees typed messages, never credentials or direct filesystem objects.
 */
import {setRememberDevice} from './device-auth.js';
const ROOT='/ocr2md';
const KEY='ocr2md-v5-workspace-access-key';
const OLD_KEY='ocr2md-v3-mac-vault-key';
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
 id:'ocr2md:directory',name:'只读工作目录服务',version:'1.0.0',presentation:'service',inventoryRole:'internal',order:0,
 description:'仅导航 Mac Vault 目录；30天授权由独立网关托管，不修改文件、不解析文档。',
 setup(bus){
  let selected='',key=sessionStorage.getItem(KEY)||'';
  const abort=new AbortController();
  let remember=false;
  // Settings exposes preferences through its public event, not its private
  // store or UI. The directory service retains only this one boolean.
  document.dispatchEvent(new CustomEvent('wcp:settings:read-v1',{
    detail:{ownerId:'ocr2md:workspace',reply:values=>{remember=values.workspaceRemember30Days===true}}
  }));
  const notice=(message,level='ready')=>document.dispatchEvent(new CustomEvent('wcp:module-status',
    {detail:{moduleId:'ocr2md:workspace',message,level}}));
  const rememberOnDevice=(enabled,credential='')=>setRememberDevice(enabled,credential,abort.signal);
  const onPreferences=event=>{
    if(event.detail?.ownerId!=='ocr2md:workspace')return;
    const next=event.detail.values.workspaceRemember30Days===true;
    if(next===remember)return;
    remember=next;
    if(next&&!key){notice('已开启30天记住设备：下次输入 Vault 密钥后生效','busy');return}
    void rememberOnDevice(next,key).then(()=>{
      notice(next?'本设备已授权 30 天':'已取消本设备的30天授权');
    }).catch(error=>{if(!abort.signal.aborted)notice('记住设备设置未生效：'+error,'error')});
  };
  document.addEventListener('wcp:settings:changed-v1',onPreferences,{signal:abort.signal});
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
  clean.push(bus.handle('workspace.authorize',async({key:value})=>{
   // Keys are only stored in sessionStorage; never returned on the WCP bus.
   const candidate=str(value,256).trim();
   const result=await status(candidate);
   if(result.authorized&&candidate){
    key=candidate;sessionStorage.setItem(KEY,key);
    if(remember)try{await rememberOnDevice(true,key)}
    catch(e){result.error='目录已连接，但记住设备失败：'+errorText(e)}
   }
   return result;
  }));
  clean.push(bus.handle('workspace.reuse-v3',async()=>{
   const previous=sessionStorage.getItem(OLD_KEY)||'';
   const result=await status(previous);
   if(result.authorized&&previous){
    key=previous;sessionStorage.setItem(KEY,key);
    if(remember)try{await rememberOnDevice(true,key)}
    catch(e){result.error='目录已连接，但记住设备失败：'+errorText(e)}
   }
   return result;
  }));
  clean.push(bus.handle('workspace.list',async({path,cursor})=>{
   try{return await list(path,cursor)}catch(e){return{path:ROOT,entries:[],cursor:'',error:errorText(e),truncated:false}}
  }));
  clean.push(bus.handle('workspace.activate',async({path})=>{
   try{
    directoryPath(path);
    const page=await list(path);
    if(page.error)throw Error(page.error);
    selected=path;
    await bus.publish('workspace.selected',{path});
    return{selected:true,path,error:''};
   }catch(e){return{selected:false,path:ROOT,error:errorText(e)}}
  }));
  clean.push(bus.handle('workspace.current',async()=>({path:selected||ROOT,selected:Boolean(selected)})));
  return()=>{abort.abort();selected='';for(const release of clean)release()};
 },
};
