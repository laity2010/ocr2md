/** Isolated V4 Vault authority reusing V3's headless DirectoryController.
 * Only GET & readRange, no writes. Separate V4 session credential: NEVER reads
 * or mutates V3 auth storage. WCP's bus sees scoped query/command, not fetch.
 */
import {V3DirectoryController} from '../../../src/v3DirectoryController';
const KEY='ocr2md-v4-workspace-access-key';
const V3_KEY='ocr2md-v3-mac-vault-key';
const WORKSPACE='obsidian-ocr2md';
const HOME='/ocr2md';
const inside=(path:string)=>path===HOME||path.startsWith(HOME+'/');
const endpoint=(op:string,parts:Record<string,string>={})=>'/__v3/fs?'+new URLSearchParams({op,...parts});
const textExt=/\.(md|markdown|txt|json|jsonl|yaml|yml|csv|html|htm|xml|log|ini|tex|rst)$/i;
const trim=(v:unknown,length=500)=>String(v??'').slice(0,length);
const fail=(x:unknown)=>trim(x instanceof Error?x.message:x,480);
class ReadOnlyVault{
  readonly workspaceId=WORKSPACE;
  key=sessionStorage.getItem(KEY)||'';
  async request<T>(url:string):Promise<T>{
    const headers=new Headers();if(this.key)headers.set('X-OCR2MD-V3-Key',this.key);
    let response:Response;
    try{response=await fetch(url,{headers,cache:'no-store',credentials:'same-origin'});}catch(e){throw Error('无法连接 Mac Vault：'+fail(e))}
    const type=response.headers.get('content-type')||'';
    if(!type.includes('json'))throw Error('Mac Vault 返回非 JSON (HTTP '+response.status+')');
    const value=await response.json();
    if(!response.ok)throw Error('Vault HTTP '+response.status+': '+trim(value?.error??value?.code??'请求失败'));
    return value as T;
  }
  setKey(key:string){
    this.key=key.trim();
    if(this.key)sessionStorage.setItem(KEY,this.key);
    else sessionStorage.removeItem(KEY);
  }
  status(){return this.request<{authorized:boolean;canPairLocally:boolean;rootLabel:string}>(endpoint('status'))}
  pair(){return this.request<{accessKey:string}>(endpoint('pair'))}
  async open(id:string){
    if(id!==WORKSPACE)throw Error('未知工作目录');
    await this.request(endpoint('bootstrap'));
    const r=this;
    return {
      workspaceId:WORKSPACE,protocolVersion:3,
      stat:(loc:{path:string})=>r.request<any>(endpoint('stat',{path:loc.path})),
      list:(loc:{path:string},cursor?:string)=>r.request<any>(endpoint('list',{path:loc.path,...(cursor?{cursor}:{})})),
      readRange:async(ref:{path:string;nodeId:string},range:{offset:number;length:number;expectedRevision:string})=>{
        const v=await r.request<{base64:string;revision:string;totalBytes:number}>(endpoint('read',{path:ref.path,nodeId:ref.nodeId,revision:range.expectedRevision,offset:String(range.offset),length:String(range.length)}));
        const raw=atob(v.base64);return {bytes:Uint8Array.from(raw,x=>x.charCodeAt(0)),revision:v.revision,totalBytes:v.totalBytes};
      },
      subscribe:()=>()=>{},close:async()=>{},
      commit:async()=>{throw Error('V4 工作目录只读；不允许文件写入')},
    } as any;
  }
}
const vault=new ReadOnlyVault();
let controller:V3DirectoryController|undefined;
let chosen='';
let cursorPage:undefined|{path:string;entries:any[];generation:string;nextCursor?:string};
let requestSerial=0;
async function init(){
  if(controller)return controller;
  const c=new V3DirectoryController(vault as any,WORKSPACE,()=>`v4-ro-${++requestSerial}`,undefined,HOME);
  await c.initialize(HOME);controller=c;return c;
}
function row(n:any){return {nodeId:trim(n.nodeId,128),path:trim(n.path,2000),name:trim(n.path.split('/').at(-1),512),kind:trim(n.kind,24),size:Math.max(0,Number(n.size||0)),revision:trim(n.revision,256),modifiedAt:trim(n.modifiedAt||'',96)}}
function requirePath(path:string){if(!inside(path)||path.includes('\0')||path.includes('..'))throw Error('目录必须位于 Obsidian/ocr2md');return path}
export const filesystemModule={
 id:'ocr2md:filesystem',name:'只读文件服务',version:'1.0.0',presentation:'service',
 description:'复用 v3 无界面目录控制器，负责鉴权、目录读数和 PDF 工作目录验证，无文件写入权限。',
 setup(bus:any){
  const handles=[
   bus.handle('workspace.status',async()=>{
     try{const x=await vault.status();return {authorized:!!x.authorized,canPairLocally:!!x.canPairLocally,rootLabel:trim(x.rootLabel),error:''}}
     catch(e){return {authorized:false,canPairLocally:false,rootLabel:'Obsidian/ocr2md',error:fail(e)}}
   }),
   bus.handle('workspace.authorize',async({key,pairOnMac}:{key:string;pairOnMac:boolean})=>{
     try{
       if(pairOnMac){const v=await vault.pair();vault.setKey(v.accessKey)}else vault.setKey(key);
       if(controller){await controller.close();controller=undefined}
       await init();
       const x=await vault.status();return {authorized:!!x.authorized,canPairLocally:!!x.canPairLocally,rootLabel:trim(x.rootLabel),error:''};
     }catch(e){return {authorized:false,canPairLocally:false,rootLabel:'Obsidian/ocr2md',error:fail(e)}}
   }),
   bus.handle('workspace.reuse-v3',async()=>{
     // Explicit user click only. Same-origin localStorage survives other tabs;
     // sessionStorage is available only when navigating from V3 in the SAME tab.
     // Never delete/edit V3 credential or send it as a CQE payload.
     const previous=vault.key;
     let candidate='';
     try{candidate=(sessionStorage.getItem(V3_KEY)||localStorage.getItem(V3_KEY)||'').trim()}catch{}
     if(!candidate)return {authorized:false,canPairLocally:false,rootLabel:'Obsidian/ocr2md',
       error:'未找到 v3 保存的密钥。若 v3 只在另一标签页授权，请在已连接 v3 的那个标签页地址栏打开 v4，再点本按钮。'};
     try{
       // Verify before persisting; a stale V3 key may be expired or revoked.
       vault.key=candidate;
       const status=await vault.status();
       if(!status.authorized)throw Error('v3 密钥已失效，请在 v3 重新授权');
       if(controller){await controller.close();controller=undefined}
       await init();
       vault.setKey(candidate); // V4 session only; no V3 mutation.
       return {authorized:true,canPairLocally:!!status.canPairLocally,rootLabel:trim(status.rootLabel),error:''};
     }catch(e){
       vault.key=previous;
       return {authorized:false,canPairLocally:false,rootLabel:'Obsidian/ocr2md',
         error:'v3 密钥验证失败：'+fail(e)};
     }
   }),
   bus.handle('workspace.list',async({path,cursor}:{path:string;cursor:string})=>{
     try{
       const dir=requirePath(path||HOME);const c=await init();
       const old=c.snapshot();
       if(!cursor || old.directory!==dir){cursorPage=undefined;await c.browse(dir)}
       else if(old.nextCursor===cursor)await c.loadMore();
       else throw Error('目录分页已过期，请刷新');
       const view=c.snapshot();
       // CQE messages are capped at 128KiB; bound each response and keep cursor.
       const all=view.entries.map(row);const entries=all.slice(0,160);
       const truncated=all.length>160;
       return {path:view.directory,entries,cursor:view.nextCursor||'',error:view.error||'',truncated};
     }catch(e){return {path:path||HOME,entries:[],cursor:'',error:fail(e),truncated:false}}
   }),
   bus.handle('workspace.preview',async({path,nodeId,revision}:{path:string;nodeId:string;revision:string})=>{
     try{
       const p=requirePath(path);const c=await init();
       const dir=p.slice(0,p.lastIndexOf('/'))||'/';
       if(c.snapshot().directory!==dir)throw Error('选中项已变化，请刷新目录');
       const item=c.snapshot().entries.find((n:any)=>n.path===p&&n.nodeId===nodeId&&n.revision===revision);
       if(!item)throw Error('文件引用已过期，请刷新');
       const metadata={name:p.split('/').at(-1),path:'Obsidian/ocr2md'+p,kind:item.kind,size:item.size,revision:item.revision,modifiedAt:item.modifiedAt};
       if(item.kind!=='file'||!textExt.test(p))return {text:JSON.stringify(metadata,null,2)+'\n\n（目录或非文本文件，仅预览元数据）',truncated:false,error:''};
       const preview=await c.previewFile(item,16*1024);
       const source=new TextDecoder('utf-8',{fatal:false}).decode(preview.bytes);
       if(source.includes('\0'))return {text:JSON.stringify(metadata,null,2)+'\n（二进制文件不作为文本解析）',truncated:false,error:''};
       return {text:('【文件详情】\n'+JSON.stringify(metadata,null,2)+'\n\n【只读源码】\n'+source).slice(0,24000),truncated:preview.truncated||source.length>24000,error:''};
     }catch(e){return {text:'',truncated:false,error:fail(e)}}
   }),
   bus.handle('workspace.activate',async({path}:{path:string})=>{
     try{
       const p=requirePath(path),c=await init();
       const listed=await c.browse(p);
       const pdfs=listed.entries.filter((x:any)=>x.kind==='file'&&/\.pdf$/i.test(x.path));
       if(!pdfs.length)throw Error('目录内没有直接存放的 PDF 原文；请选择书籍文件夹');
       chosen=p;
       await bus.publish('workspace.selected',{path:p,pdfCount:pdfs.length});
       return {selected:true,path:p,pdfCount:pdfs.length,error:''};
     }catch(e){return {selected:false,path:'',pdfCount:0,error:fail(e)}}
   }),
   bus.handle('workspace.current',()=>({path:chosen,selected:!!chosen})),
  ];
  return ()=>{for(const x of handles)x();if(controller)void controller.close();controller=undefined};
 }
};
