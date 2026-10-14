/** OCR2MD-owned media module v1.0.2: one isolated task/UI state per WCP activation. */
import {scanChapterElements} from './media-scan.js';
const chapter='alpha/chapters/01.md';
const sessions=new WeakMap();
const hosts=new WeakMap();
const findImages=text=>scanChapterElements(text,chapter,'媒体')
 .filter(row=>row.mediaSourceUrl&&/^https?:\/\//i.test(row.mediaSourceUrl))
 .map(row=>({name:row.kind||'图片',source:row.mediaSourceUrl,line:row.range?.line??-1}));
function render(state){
 const ui=state.ui;
 if(!ui?.host.isConnected)return;
 ui.heading.textContent='媒体清洗 · 独立组件 v1.0.2';
 ui.status.textContent='r'+state.revision+' · '+state.task+' · '+state.rows.length+' 条待处理媒体';
 ui.rows.replaceChildren();
 for(const item of state.rows){
   const line=document.createElement('div');
   line.style.cssText='padding:9px 0;border-bottom:1px solid #435266;display:flex;gap:8px;align-items:center;flex-wrap:wrap';
   const label=document.createElement('span');
   label.textContent='第 '+(item.line+1)+' 行 · '+item.name+' · '+item.source;
   const btn=document.createElement('button');btn.type='button';btn.dataset.testid='media-apply';
   btn.textContent='模拟采用本地路径';btn.disabled=state.busy;
   btn.addEventListener('click',()=>void apply(state,item.source));
   line.append(label,btn);ui.rows.append(line);
 }
 ui.host.dataset.mediaRevision=String(state.revision);
 ui.host.dataset.mediaCount=String(state.rows.length);
}
async function refresh(state){
 const snapshot=await state.channel.query('document.snapshot',{chapter});
 state.revision=snapshot.revision;
 state.rows=findImages(snapshot.text);
 render(state);
}
async function apply(state,source){
 if(state.busy)return;
 state.busy=true;state.task='处理中';render(state);
 try{
   const changed=await state.channel.command('document.media.apply',{
      chapter,revision:state.revision,image:source,
   });
   state.task='已采用 '+changed.localPath;
   await refresh(state);
 }catch(error){state.task='失败：'+String(error);render(state)}
 finally{state.busy=false;render(state)}
}
export const media={
 id:'ocr2md:media',name:'章节媒体',version:'1.0.2',order:3,presentation:'dock',
 description:'OCR2MD 真实媒体扫描 + 按实例隔离的任务状态；仅内存模拟写入',
 setup(channel){
   const state={channel,revision:0,rows:[],task:'空闲',busy:false,ui:null};
   sessions.set(channel,state);
   const off=channel.subscribe('document.updated',({revision})=>{
     state.task='文档更新 r'+revision;
     void refresh(state);
   });
   return ()=>{off();state.ui=null};
 },
 async mount(host,channel){
   const state=sessions.get(channel);
   if(!state)throw Error('MEDIA_SESSION_UNAVAILABLE');
   const wrap=document.createElement('article');
   wrap.style.cssText='padding:15px;height:100%;overflow:auto;color:#e1e7ef';
   const heading=document.createElement('h3');
   const note=document.createElement('p');
   note.textContent='真实 OCR2MD 扫描；Alpha 仅操作内存示例，不访问网络、Obsidian 或正式章节文件。';
   const status=document.createElement('p');status.id='wcp-media-status';
   const rows=document.createElement('section');rows.id='wcp-media-rows';
   wrap.append(heading,note,status,rows);
   host.replaceChildren(wrap);
   state.ui={host,heading,rows,status};hosts.set(host,state);
   state.task='正在查询文档服务';await refresh(state);
 },
 unmount(host){const state=hosts.get(host);if(state)state.ui=null;hosts.delete(host);host.replaceChildren()},
};
