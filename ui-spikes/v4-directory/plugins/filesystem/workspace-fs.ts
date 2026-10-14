/** V4 Vault authority reusing V3's headless DirectoryController.
 * Directory/file commands are READ-ONLY. The chapter-boundary plugin alone may
 * request explicit version-checked DIRjson save / chapter publication commands;
 * the original Mac server remains the authority for CAS, backups and writes.
 * V4 session credentials never mutate V3 auth storage or leave this service.
 */
import {V3DirectoryController} from '../../../../src/v3DirectoryController';
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
  async post<T>(url:string,data:unknown):Promise<T>{
    const headers=new Headers({'Content-Type':'application/json'});
    if(this.key)headers.set('X-OCR2MD-V3-Key',this.key);
    const res=await fetch(url,{method:'POST',headers,body:JSON.stringify(data),cache:'no-store',credentials:'same-origin'});
    const type=res.headers.get('content-type')||'';
    if(!type.includes('json'))throw Error('IR 提交网关不是 JSON (HTTP '+res.status+')');
    const body=await res.json();
    if(!res.ok)throw Error('IR HTTP '+res.status+': '+trim(body?.error??body?.code??'请求失败'));
    return body as T;
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
 id:'ocr2md:filesystem',name:'授权文件与 DIRjson 服务',version:'1.1.0',presentation:'service',
 description:'目录浏览只读，章节定界保存/发布使用授权且版本校验的专用 CQE 事务；无通用文件写接口。',
 setup(bus:any){
  let irCache:{book:string;body:string}|null=null;
  let upload:{book:string;requestId:string;expectedGeneration:string|null;expectedMarkingsRevision:string;segments:string[];size:number}|null=null;
  let chapterUpload:{book:string;filename:string;nodeId:string;expectedRevision:string;requestId:string;segments:string[];size:number}|null=null;
  const clip=(v:unknown)=>JSON.stringify(v);
  const boundBook=(p:string)=>{const book=requirePath(p);if(!chosen||book!==chosen)throw Error('请先设置当前工作目录');return book};
  const okData=(value:unknown,max=113000)=>{const data=clip(value);if(data.length>max)throw Error('数据响应超限');return {data,error:''}};
  const boundaryFail=(e:unknown)=>({data:'',error:fail(e)});
  const handles=[
   bus.handle('boundary.fs.fetch',async ({op,path,cursor,nodeId,revision,offset,length}:{op:string;path:string;cursor:string;nodeId:string;revision:string;offset:number;length:number})=>{
     try{
       const book=boundBook(chosen);
       if(!['stat','list','read'].includes(op))throw Error('文件操作不受支持');
       const file=requirePath(path);
       if(file!==book&&!file.startsWith(book+'/'))throw Error('不能读取当前书籍以外的数据');
       if(op==='read'&&(!Number.isInteger(offset)||offset<0||!Number.isInteger(length)||length<1||length>65536))
         throw Error('读取范围必须为 <=64KiB');
       const parts:Record<string,string>={path:file};
       if(cursor)parts.cursor=cursor;
       if(op==='read')Object.assign(parts,{nodeId,revision,offset:String(offset),length:String(length)});
       return okData(await vault.request(endpoint(op,parts)));
     }catch(e){return boundaryFail(e)}
   }),
   bus.handle('clean.chapter.begin',({book,filename,nodeId,expectedRevision,requestId}:{book:string;filename:string;nodeId:string;expectedRevision:string;requestId:string})=>{
     try{
       boundBook(book);
       if(chapterUpload)throw Error('已有章节保存事务');
       if(!/^[a-zA-Z0-9_-]{8,100}$/.test(requestId)||!nodeId||!expectedRevision||
         !filename||filename.includes('/')||filename.includes('..')||!filename.endsWith('.md'))throw Error('章节保存参数错误');
       chapterUpload={book,filename,nodeId,expectedRevision,requestId,segments:[],size:0};
       return {ok:true,error:''};
     }catch(e){return {ok:false,error:fail(e)}}
   }),
   bus.handle('clean.chapter.append',({requestId,data}:{requestId:string;data:string})=>{
     try{
       if(!chapterUpload||chapterUpload.requestId!==requestId)throw Error('章节保存事务不存在');
       if(!data||data.length>60000||!/^[a-zA-Z0-9+/=]*$/.test(data)||chapterUpload.size+data.length>720000)
         throw Error('章节内容超出 512 KiB 保存限制');
       chapterUpload.segments.push(data);chapterUpload.size+=data.length;
       return {ok:true,error:''};
     }catch(e){chapterUpload=null;return {ok:false,error:fail(e)}}
   }),
   bus.handle('clean.chapter.commit',async({requestId}:{requestId:string})=>{
     try{
       if(!chapterUpload||chapterUpload.requestId!==requestId)throw Error('章节保存事务不存在');
       const tx=chapterUpload;chapterUpload=null;boundBook(tx.book);
       const base64=tx.segments.join('');
       if(!base64||base64.length>720000)throw Error('章节正文为空或过大');
       const value=await vault.post('/__v3/chapters/commit',{book:tx.book,filename:tx.filename,nodeId:tx.nodeId,
         expectedRevision:tx.expectedRevision,base64});
       return okData(value,6000);
     }catch(e){chapterUpload=null;return boundaryFail(e)}
   }),
   bus.handle('clean.media.download',async({book,filename,nodeId,expectedRevision,sourceUrl}:
     {book:string;filename:string;nodeId:string;expectedRevision:string;sourceUrl:string})=>{
     try{
       boundBook(book);
       if(!filename||filename.includes('/')||filename.includes('..')||!filename.endsWith('.md')||!nodeId||!expectedRevision)
         throw Error('章节媒体来源非法');
       if(!/^https:\/\//.test(sourceUrl)||sourceUrl.length>2048)throw Error('媒体 URL 必须是 HTTPS');
       const data=await vault.post('/__v3/chapters/media/download',{book,filename,nodeId,expectedRevision,sourceUrl});
       return okData(data,6000);
     }catch(e){return boundaryFail(e)}
   }),
   bus.handle('boundary.ir.load',async({book}:{book:string})=>{
     try{
       boundBook(book);
       const response=await vault.request<any>('/__v3/ir?'+new URLSearchParams({book}));
       const body=String(response.irBase64||'');
       if(body.length>32_000_000)throw Error('DIRjson 快照超出安全限制');
       irCache={book,body};delete response.irBase64;
       const meta=clip(response);
       if(meta.length>64000)throw Error('DIRjson 元信息超限');
       return {meta,size:body.length,error:''};
     }catch(e){irCache=null;return {meta:'',size:0,error:fail(e)}}
   }),
   bus.handle('boundary.ir.markings.read',async({book}:{book:string})=>{
     try{boundBook(book);return okData(await vault.request('/__v3/ir/markings?'+new URLSearchParams({book})),64000)}
     catch(e){return boundaryFail(e)}
   }),
   bus.handle('boundary.ir.markings.save',async({book,expectedGeneration,expectedRevision,requestId,markings,overwrite}:
     {book:string;expectedGeneration:string;expectedRevision:string;requestId:string;markings:string;overwrite:boolean})=>{
     try{
       boundBook(book);
       if(!/^[a-f0-9]{64}$/.test(expectedGeneration)||!/^[a-zA-Z0-9_-]{8,100}$/.test(requestId)||markings.length>48000)
         throw Error('章节标定版本或长度非法');
       const response=await vault.post('/__v3/ir/markings/commit',{
         book,expectedGeneration,expectedRevision,requestId,markings:JSON.parse(markings),overwrite});
       irCache=null;
       return okData(response,6000);
     }catch(e){return boundaryFail(e)}
   }),
   bus.handle('boundary.ir.chunk',({book,offset}:{book:string;offset:number})=>{
     try{
       boundBook(book);
       if(irCache?.book!==book||!Number.isInteger(offset)||offset<0||offset>irCache.body.length)
         throw Error('快照读取会话不存在或位置错误');
       return {data:irCache.body.slice(offset,offset+60000),error:''};
     }catch(e){return boundaryFail(e)}
   }),
   bus.handle('boundary.ir.begin',({book,requestId,expectedGeneration,expectedMarkingsRevision}:{book:string;requestId:string;expectedGeneration:string;expectedMarkingsRevision:string})=>{
     try{
       boundBook(book);
       if(upload)throw Error('已有未完成的 DIRjson 保存事务');
       if(!/^[a-zA-Z0-9_-]{8,100}$/.test(requestId))throw Error('请求 ID 格式错误');
       upload={book,requestId,expectedGeneration:expectedGeneration||null,expectedMarkingsRevision,segments:[],size:0};
       return {ok:true,error:''};
     }catch(e){return {ok:false,error:fail(e)}}
   }),
   bus.handle('boundary.ir.append',({requestId,data}:{requestId:string;data:string})=>{
     try{
       if(!upload||upload.requestId!==requestId)throw Error('DIRjson 上传事务不存在');
       if(!/^[a-zA-Z0-9+/=]*$/.test(data)||!data||data.length>60000)throw Error('IR 传输段格式错误');
       if(upload.size+data.length>32_000_000)throw Error('IR 保存超出限制');
       upload.segments.push(data);upload.size+=data.length;
       return {ok:true,error:''};
     }catch(e){upload=null;return {ok:false,error:fail(e)}}
   }),
   bus.handle('boundary.ir.commit',async({requestId}:{requestId:string})=>{
     try{
       if(!upload||upload.requestId!==requestId)throw Error('DIRjson 提交事务不存在');
       const tx=upload;upload=null;
       const response=await vault.post('/__v3/ir/commit',{
         book:tx.book,requestId:tx.requestId,expectedGeneration:tx.expectedGeneration,
         expectedMarkingsRevision:tx.expectedMarkingsRevision,archiveBase64:tx.segments.join('')});
       irCache=null;
       return okData(response,6000);
     }catch(e){upload=null;return boundaryFail(e)}
   }),
   bus.handle('boundary.ir.publish',async({book,expectedGeneration,expectedIrSha256,expectedMarkingsRevision}:{book:string;expectedGeneration:string;expectedIrSha256:string;expectedMarkingsRevision:string})=>{
     try{
       boundBook(book);
       if(!/^[a-f0-9]{64}$/.test(expectedIrSha256)||!expectedGeneration)throw Error('缺少可信 IR 版本和指纹');
       const response=await vault.post('/__v3/ir/publish-chapters',{book,expectedGeneration,expectedIrSha256,expectedMarkingsRevision});
       irCache=null;
       return okData(response,6000);
     }catch(e){return boundaryFail(e)}
   }),
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
