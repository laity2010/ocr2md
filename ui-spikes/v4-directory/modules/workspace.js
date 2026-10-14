/** WCP workspace view module. Owns UI and ephemeral selection state; the only
 * cross-component API is its scoped CQE endpoint. No file reads/writes here.
 */
import {WorkspaceView} from './workspace-grid.js';
import {TriPane,triPaneVersion} from '../components/tripane.js';
const HOME='/ocr2md';
// Same versioned module URL as Shared Settings; one CodeMirror implementation.
const SHARED_SOURCE_URL='https://agent-link.laity.bid/shared-source/v1/source-surface.js?v=0.2.5';
const own=(root,tag,attrs={},text='')=>{const el=document.createElement(tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));if(text)el.textContent=text;root.append(el);return el;};
const safe=x=>String(x||'').slice(0,500);
let active;
// WCP intentionally deactivates/re-activates views on tab changes. Keep this
// business view connected to document, as with the Settings module: otherwise
// AG and source are destroyed and the directory is fetched again on return.
let residentHost=null;
let residentResize=null;
let residentWindowEvents=new AbortController();
const parkedStyle='position:fixed;top:0;left:0;transform:translateX(-300vw);width:1032px;height:700px;overflow:hidden;pointer-events:none;z-index:-2;';
function ensureResident(){
 if(residentHost)return residentHost;
 residentHost=document.createElement('div');residentHost.dataset.workspaceResident='true';
 residentHost.inert=true;residentHost.setAttribute('aria-hidden','true');
 residentHost.style.cssText=parkedStyle;document.body.append(residentHost);
 return residentHost;
}
function hideResident(){
 residentResize?.disconnect();residentResize=null;
 residentWindowEvents.abort();residentWindowEvents=new AbortController();
 if(!residentHost)return;
 residentHost.inert=true;residentHost.setAttribute('aria-hidden','true');
 residentHost.style.cssText=parkedStyle;
}
function showResident(host){
 const mount=document.getElementById('v4-module-mount');
 if(!residentHost||!mount)throw Error('WORKSPACE_RESIDENT_HOST_MISSING');
 active.host=host;
 host.dataset.moduleOwner='ocr2md:workspace';
 host.style.cssText='width:100%;height:100%;min-height:0;overflow:hidden';
 residentHost.inert=false;residentHost.removeAttribute('aria-hidden');
 const fit=()=>{
  const bounds=mount.getBoundingClientRect();
  residentHost.style.cssText=`position:fixed;top:${bounds.top}px;left:${bounds.left}px;transform:none;width:${bounds.width}px;height:${bounds.height}px;min-height:0;overflow:hidden;pointer-events:auto;z-index:5;`;
  active?.tri?.resize();
 };
 fit();residentResize?.disconnect();residentResize=new ResizeObserver(fit);residentResize.observe(mount);
 window.addEventListener('resize',fit,{passive:true,signal:residentWindowEvents.signal});
}
export const workspaceModule={
 id:'ocr2md:workspace',name:'工作目录',version:'1.2.0',order:1,presentation:'full',
 description:'工作目录只读导航：AG＋共享源码；CQE 文件服务与布局组件自治。',
 inspectComponents(){return [{id:'wcp:tripane',name:'WCP TriPane 布局',version:triPaneVersion}];},
 async mount(host,bus){
  // Preserve the exact same AG, CodeMirror, directory, selection, and CQE
  // session across Settings ↔ Workspace switches. No fresh status/list request.
  if(active){showResident(host);return;}
  const abort=new AbortController(),state={path:HOME,selected:null,epoch:0,previewEpoch:0,pending:false,connected:false};
  const viewRoot=own(ensureResident(),'section',{class:'v4-workspace', 'data-testid':'workspace-component'});
  const style=own(viewRoot,'style');style.textContent=`
  .v4-workspace{width:100%;height:100%;display:flex;flex-direction:column;min-height:0;gap:8px;color:#e1e7ef;font:13px/1.5 system-ui;background:#1d2732;padding:6px;box-sizing:border-box}
  .v4-workspace button,.v4-workspace input{border:1px solid #52647c;border-radius:5px;background:#253343;color:#e1e7ef;font:inherit;padding:6px 10px}
  .v4-workspace button:disabled{opacity:.5}.v4-workspace .ws-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  .v4-workspace .ws-connect{padding:10px;border:1px solid #52647c;border-radius:6px;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
  .v4-workspace .ws-connect input{flex:1;min-width:190px}
  .v4-workspace .ws-layout{flex:1;min-height:0;position:relative;border:1px solid #475258;overflow:hidden}
  .v4-workspace .ws-grid{width:100%;height:100%;min-width:0;min-height:0}
  .v4-workspace .ws-source{width:100%;height:100%;min-width:0;min-height:0;overflow:hidden}
  .v4-workspace .ws-source laity-source-surface{width:100%;height:100%;display:block}
  .v4-workspace .workspace-entry{border:0;background:transparent;color:inherit;padding:0 4px;width:100%;height:100%;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .v4-workspace .workspace-entry:hover{color:#a8ccfb}
  .v4-workspace [data-level=error]{color:#ffb1a6}
  .v4-workspace [data-level=busy]{color:#a8ccfb}
  .v4-workspace .dv-theme-dark{--dv-background-color:#1d2732}
  `;
  const actions=own(viewRoot,'div',{class:'ws-actions'});
  const parent=own(actions,'button',{'data-testid':'workspace-parent',type:'button'},'返回上级');
  const refresh=own(actions,'button',{'data-testid':'workspace-refresh',type:'button'},'刷新目录');
  const layoutButton=own(actions,'button',{'data-testid':'workspace-layout-mode',type:'button'},'Full 模式');
  const pathDisplay=own(actions,'strong',{'data-testid':'workspace-path'},'Obsidian/ocr2md/ocr2md');
  const set=own(actions,'button',{'data-testid':'workspace-set-root',type:'button'},'设为工作目录');
  const status=own(viewRoot,'div',{'data-testid':'workspace-status',role:'status','aria-live':'polite'},'检查 Mac Vault…');
  const login=own(viewRoot,'div',{class:'ws-connect','data-testid':'workspace-connect'});
  const key=own(login,'input',{type:'password',autocomplete:'off',placeholder:'输入 Mac Vault 访问密钥','aria-label':'Mac Vault 访问密钥'});
  const connect=own(login,'button',{type:'button','data-testid':'workspace-authorize'},'连接');
  const reuse=own(login,'button',{type:'button','data-testid':'workspace-reuse-v3'},'沿用 v3 授权');
  const secureAuth=own(login,'a',{href:'https://ocr2md.laity.bid/v4-tripane-candidate/','data-testid':'workspace-https-handoff'},'使用 HTTPS 同源授权');
  secureAuth.style.cssText='padding:6px 12px;border:1px solid #52647c;border-radius:5px;color:#a9d1ff;white-space:nowrap';
  const pair=own(login,'button',{type:'button','data-testid':'workspace-pair'},'Mac 本机授权');pair.hidden=true;
  const region=own(viewRoot,'div',{class:'ws-layout'});
  const ag=own(region,'div',{class:'ws-grid','data-testid':'workspace-ag'});
  const source=own(region,'div',{class:'ws-source','data-testid':'workspace-source'});
  // Reuse the exact source Web Component loaded by Shared Settings, not a second editor.
  await import(SHARED_SOURCE_URL);
  const css=own(viewRoot,'link',{rel:'stylesheet',href:'./components/dockview.css'});
  await new Promise((ok,fail)=>{css.addEventListener('load',ok,{once:true});css.addEventListener('error',()=>fail(Error('DOCKVIEW_CSS_NOT_LOADED')),{once:true})});
  const tri=new TriPane(region,{slots:{ag,source},panes:['ag','source'],mode:'compact',storage:sessionStorage,storageKey:'ocr2md-v4-workspace-dual-v1'});
  layoutButton.addEventListener('click',()=>{tri.setMode(tri.mode==='compact'?'full':'compact');layoutButton.textContent=tri.mode==='compact'?'Full 模式':'Compact 模式'},{signal:abort.signal});
  const output=(msg,level='ready')=>{status.dataset.level=level;status.textContent=safe(msg)};
  const go=async(path,cursor='')=>{
   if(abort.signal.aborted||state.pending)return;
   state.pending=true;const epoch=++state.epoch;++state.previewEpoch;ag.inert=true;output('正在读取目录…','busy');
   try{
    const result=await bus.query('workspace.list',{path,cursor});if(epoch!==state.epoch||abort.signal.aborted)return;
    if(result.error)throw Error(result.error);
    state.path=result.path;state.selected=null;pathDisplay.textContent='Obsidian/ocr2md'+result.path;
    grid.setRows(result.entries);grid.setSource('选择左侧 AG 行查看该项详细信息；双击目录名称进入下级目录。');
    parent.disabled=result.path===HOME;
    output('已加载 '+result.entries.length+' 项'+(result.truncated?' · 本页只显示前 160 项':'')+(result.cursor?' · 还有下一页':''));
   }catch(e){output('读取失败：'+safe(e),'error')}
   finally{state.pending=false;ag.inert=false}
  };
  let grid;
  try{grid=new WorkspaceView(ag,source,async row=>{
   state.selected=row;const epoch=++state.previewEpoch;output('读取所选项…','busy');
   const data=await bus.query('workspace.preview',{path:row.path,nodeId:row.nodeId,revision:row.revision}).catch(e=>({error:String(e)}));
   if(epoch!==state.previewEpoch||abort.signal.aborted)return;
   grid.setSource(data.error?'读取失败：'+safe(data.error):data.text+(data.truncated?'\n\n（仅显示前段内容）':''));
   output('已选择 '+row.name);
  },row=>{if(row.kind==='directory')void go(row.path)});}catch(e){output('AG/源码组件加载失败：'+safe(e),'error');throw e}
  const disabled=()=>{parent.disabled=!state.connected;refresh.disabled=!state.connected;set.disabled=!state.connected};
  disabled();
  async function statusCheck(){
   try{const s=await bus.query('workspace.status',{});if(abort.signal.aborted)return;
    state.connected=s.authorized;login.hidden=s.authorized;pair.hidden=!s.canPairLocally;
    disabled();if(s.authorized)await go(HOME);else output(s.error||'等待 Vault 授权；只读访问，不修改原文件','busy');
   }catch(e){output('连接失败：'+safe(e),'error')}
  }
  const authorize=async(pairOnMac=false)=>{
   const value=key.value;key.value='';output('验证 Vault 访问权限…','busy');
   try{const s=await bus.command('workspace.authorize',{key:value,pairOnMac});
    if(abort.signal.aborted)return;state.connected=s.authorized;login.hidden=s.authorized;
    disabled();if(s.authorized)await go(HOME);else output(s.error||'授权失败','error');
   }catch(e){output('授权失败：'+safe(e),'error')}
  };
  reuse.addEventListener('click',async()=>{
   if(abort.signal.aborted)return;
   reuse.disabled=true;output('正在验证 Safari 已保存的 v3 授权…','busy');
   try{
     const result=await bus.command('workspace.reuse-v3',{});
     if(abort.signal.aborted)return;
     state.connected=result.authorized;login.hidden=result.authorized;disabled();
     if(result.authorized)await go(HOME);
     else output(result.error||'无法沿用 v3 授权','error');
   }catch(e){if(!abort.signal.aborted)output('v3 授权复用失败：'+safe(e),'error')}
   finally{reuse.disabled=false}
  },{signal:abort.signal});
  connect.addEventListener('click',()=>void authorize(false),{signal:abort.signal});
  pair.addEventListener('click',()=>void authorize(true),{signal:abort.signal});
  parent.addEventListener('click',()=>{const p=state.path.slice(0,state.path.lastIndexOf('/'))||HOME;void go(p.startsWith(HOME)?p:HOME)}, {signal:abort.signal});
  refresh.addEventListener('click',()=>void go(state.path),{signal:abort.signal});
  set.addEventListener('click',async()=>{
    const path=state.selected?.kind==='directory'?state.selected.path:state.path;
    output('验证书籍文件夹及 PDF…','busy');
    try{const result=await bus.command('workspace.activate',{path});output(result.selected?'工作目录已选定：'+result.path+' · PDF '+result.pdfCount+' 项（章节模块尚未安装）':'设置失败：'+result.error,result.selected?'ready':'error')}
    catch(e){output('设置失败：'+safe(e),'error')}
  },{signal:abort.signal});
  const unsubscribe=bus.subscribe('workspace.selected',()=>{});
  active={host,tri,grid,dispose:()=>{
   abort.abort();unsubscribe();tri.dispose();grid.destroy();hideResident();
   residentHost?.remove();residentHost=null;
  }};
  showResident(host);
  await statusCheck();
 },
 unmount(host){if(active?.host===host)hideResident()}

};
