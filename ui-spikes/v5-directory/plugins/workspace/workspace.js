/** WCP workspace view module. Owns UI and ephemeral selection state; the only
 * cross-component API is its scoped CQE endpoint. No file reads/writes here.
 */
import {WorkspaceView} from './workspace-grid.js';
import {TriPane,triPaneVersion} from '../../components/tripane.js';
const HOME='/ocr2md';
// Same versioned module URL as Shared Settings; one CodeMirror implementation.
// Fixed, same-origin, published public component dependency (not an import
// of another business plugin). Only the workspace owns this load lifecycle.
const SHARED_SOURCE_URL=new URL('../../vendor/shared-source/v1/source-surface.js',import.meta.url).href;
let sourceLoad;
function requireSourceSurface(){
 if(customElements.get('laity-source-surface'))return Promise.resolve();
 if(!sourceLoad)sourceLoad=new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.type='module';
  script.src=SHARED_SOURCE_URL;script.dataset.workspaceSharedSource='1';
  script.addEventListener('load',()=>customElements.get('laity-source-surface')?resolve():reject(Error('SOURCE_COMPONENT_NOT_REGISTERED')),{once:true});
  script.addEventListener('error',()=>reject(Error('SOURCE_COMPONENT_NOT_LOADED')),{once:true});
  document.head.append(script);
 }).catch(e=>{sourceLoad=null;throw e});
 return sourceLoad;
}
const own=(root,tag,attrs={},text='')=>{const el=document.createElement(tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));if(text)el.textContent=text;root.append(el);return el;};
const safe=x=>String(x||'').slice(0,500);
// WCP hosts own each mount; avoid V4 page anchors and resident overlays.
const instances=new WeakMap();
export const workspaceModule={
 id:'ocr2md:workspace',name:'工作目录',version:'1.3.0',order:1,presentation:'full',
 description:'工作目录只读导航：AG＋共享源码；CQE 文件服务与布局组件自治。',
 inspectComponents(){return [{id:'wcp:tripane',name:'WCP TriPane 布局',version:triPaneVersion}];},
 async mount(host,bus){
  // Scope AG, editor, navigation and state to the WCP host; remount is fresh.
  if(instances.has(host))return;
  const abort=new AbortController(),state={path:HOME,selected:null,selectedDirectory:null,epoch:0,previewEpoch:0,pending:false,connected:false};
  const viewRoot=own(host,'section',{class:'workspace-view', 'data-testid':'workspace-component'});
  viewRoot.style.cssText='width:100%;height:100%;min-height:0';
  let tri,grid;
  try{
  const style=own(viewRoot,'style');style.textContent=`
  .workspace-view{width:100%;height:100%;display:flex;flex-direction:column;min-height:0;gap:8px;color:#e1e7ef;font:14px/1.55 var(--laity-ui-font,"Sarasa Fixed SC","Sarasa Mono SC",ui-monospace,monospace);background:#1d2732;padding:6px;box-sizing:border-box}
  .workspace-view button,.workspace-view input{border:1px solid #52647c;border-radius:5px;background:#253343;color:#e1e7ef;font:inherit;padding:6px 10px}
  .workspace-view button:disabled{opacity:.5}
  .workspace-view .ws-connect{padding:10px;border:1px solid #52647c;border-radius:6px;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
  .workspace-view .ws-connect input{flex:1;min-width:190px}
  .workspace-view .ws-layout{flex:1;min-height:0;position:relative;border:1px solid #475258;overflow:hidden}
  .workspace-view .ws-grid{width:100%;height:100%;min-width:0;min-height:0}
  .workspace-view .ws-source{width:100%;height:100%;min-width:0;min-height:0;overflow:hidden}
  .workspace-view .ws-source laity-source-surface{width:100%;height:100%;display:block}
  .workspace-view .workspace-entry{border:0;background:transparent;color:inherit;padding:0 4px;width:100%;height:100%;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .workspace-view .workspace-entry:hover{color:#a8ccfb}
  .workspace-view .ws-grid .ws-directory-radio{appearance:auto;width:17px;height:17px;vertical-align:middle;accent-color:#83c092;cursor:pointer;margin:0 0 0 5px}
  .workspace-view .ws-grid .ws-directory-radio:focus-visible{outline:2px solid #83c092;outline-offset:2px}
  /* The AG Grid Community structural CSS supplies layout before grid
     construction, but its legacy [class*=ag-theme-] defaults are LIGHT.
     Keep the official structural rules while scoping the dark palette to
     this workspace's Grid. No global AG overrides, no extra CSS framework. */
  .workspace-view .ws-grid[class*=ag-theme-],
  .workspace-view .ws-grid [class*=ag-theme-],
  .workspace-view .ws-grid .ag-root-wrapper{
    --ag-foreground-color:#dbe5f0;
    --ag-data-color:#dbe5f0;
    --ag-secondary-foreground-color:#b9c8d8;
    --ag-header-foreground-color:#dbe5f0;
    --ag-background-color:#1d2732;
    --ag-wrapper-background-color:#1d2732;
    --ag-data-background-color:#1d2732;
    --ag-odd-row-background-color:#22303d;
    --ag-header-background-color:#253343;
    --ag-chrome-background-color:#253343;
    --ag-text-color:#dbe5f0;
    --ag-header-text-color:#dbe5f0;
    --ag-font-family:var(--laity-ui-font,"Sarasa Fixed SC","Sarasa Mono SC",ui-monospace,monospace);
    --ag-font-size:14px;
    --ag-browser-color-scheme:dark;
    --ag-border-color:#475258;
    --ag-row-hover-color:rgba(131,185,240,.14);
    --ag-selected-row-background-color:rgba(131,185,240,.20);
    color-scheme:dark;
  }
  /* AG headerHeight=40 is contractual. A delayed legacy CSS application in
     WebKit occasionally grows .ag-header to ~218px, moving every row below
     the viewport even when AG has all five DOM rows. Scope the header box. */
  .workspace-view .ws-grid .ag-header{height:40px !important;min-height:40px !important;max-height:40px !important;flex:0 0 40px !important}
  /* Empty pinned-top placeholder unexpectedly expands to ~218px on mobile
     WebKit after a reload, placing all regular rows below the viewport.
     This workspace never supplies pinned rows. Keep its empty spacer aligned
     to the existing 40px header; do not change other AG Grids or pinned data. */
  .workspace-view .ws-grid .ag-grid-pinned-top-rows:not(:has(.ag-row)){
    height:40px !important;min-height:40px !important;max-height:40px !important;flex:0 0 40px !important;
  }
  .workspace-view [data-level=error]{color:#ffb1a6}
  .workspace-view [data-level=busy]{color:#a8ccfb}
  .workspace-view .dv-theme-dark{--dv-background-color:#1d2732}
  `;
  const actions=own(viewRoot,'div',{'data-module-actions-owner':'ocr2md:workspace',
    'data-testid':'workspace-module-tools'});
  actions.style.cssText='flex:1 1 auto;min-width:0;gap:7px';
  const parent=own(actions,'button',{'data-testid':'workspace-parent',type:'button'},'返回上级');
  const refresh=own(actions,'button',{'data-testid':'workspace-refresh',type:'button'},'刷新目录');
  const layoutButton=own(actions,'button',{'data-testid':'workspace-layout-mode',type:'button'},'Full 模式');
  const pathDisplay=own(actions,'strong',{'data-testid':'workspace-path',title:'Obsidian/ocr2md/ocr2md'},'Obsidian/ocr2md/ocr2md');
  pathDisplay.style.cssText='flex:1 1 auto;min-width:85px;max-width:55vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:500;color:#c8d7e9';
  const set=own(actions,'button',{'data-testid':'workspace-set-root',type:'button'},'设为工作目录');
  const status=own(viewRoot,'div',{'data-testid':'workspace-status',role:'status','aria-live':'polite'},'检查 Mac Vault…');
  const gridHealth=own(viewRoot,'div',{'data-testid':'workspace-grid-health'});
  gridHealth.hidden=true;
  gridHealth.style.cssText='padding:6px 8px;border:1px solid #a98958;border-radius:4px;color:#f7dbad;font-size:12px';
  const healthMessage=own(gridHealth,'span',{'data-testid':'workspace-grid-health-message'});
  const geometryMessage=own(gridHealth,'div',{'data-testid':'workspace-grid-geometry'});
  const repaint=own(gridHealth,'button',{'data-testid':'workspace-grid-repaint',type:'button'},'重绘表格');
  repaint.style.marginLeft='8px';

  const login=own(viewRoot,'div',{class:'ws-connect','data-testid':'workspace-connect'});
  const key=own(login,'input',{type:'password',autocomplete:'off',placeholder:'输入 Mac Vault 访问密钥','aria-label':'Mac Vault 访问密钥'});
  const connect=own(login,'button',{type:'button','data-testid':'workspace-authorize'},'连接');
  const reuse=own(login,'button',{type:'button','data-testid':'workspace-reuse-v3'},'沿用 v3 授权');
  const secureAuth=own(login,'a',{href:new URL('/',location.href).href,'data-testid':'workspace-https-handoff'},'使用 HTTPS 同源授权');
  secureAuth.style.cssText='padding:6px 12px;border:1px solid #52647c;border-radius:5px;color:#a9d1ff;white-space:nowrap';
  const pair=own(login,'button',{type:'button','data-testid':'workspace-pair'},'Mac 本机授权');pair.hidden=true;
  const region=own(viewRoot,'div',{class:'ws-layout'});
  const ag=own(region,'div',{class:'ws-grid','data-testid':'workspace-ag'});
  const source=own(region,'div',{class:'ws-source','data-testid':'workspace-source'});
  // Reuse the exact source Web Component loaded by Shared Settings, not a second editor.
  await requireSourceSurface();
  // Preload the official AG Grid Community structural stylesheet before AG
  // construction. WebKit occasionally delays generated theme styles after
  // hard navigation; rows then exist in DOM but appear outside the viewport.
  const agCss=own(viewRoot,'link',{rel:'stylesheet',href:'./plugins/workspace/ag-grid-base.min.css'});
  await new Promise((ok,fail)=>{agCss.addEventListener('load',ok,{once:true});agCss.addEventListener('error',()=>fail(Error('AG_GRID_CSS_NOT_LOADED')),{once:true})});
  const css=own(viewRoot,'link',{rel:'stylesheet',href:'./components/dockview.css'});
  await new Promise((ok,fail)=>{css.addEventListener('load',ok,{once:true});css.addEventListener('error',()=>fail(Error('DOCKVIEW_CSS_NOT_LOADED')),{once:true})});
  host.dataset.moduleOwner='ocr2md:workspace';
  tri=new TriPane(region,{slots:{ag,source},panes:['ag','source'],mode:'compact',storage:sessionStorage,storageKey:'ocr2md-v5-workspace-dual-v1'});
  layoutButton.addEventListener('click',()=>{tri.setMode(tri.mode==='compact'?'full':'compact');layoutButton.textContent=tri.mode==='compact'?'Full 模式':'Compact 模式'},{signal:abort.signal});
  const output=(msg,level='ready')=>{
   status.dataset.level=level;status.textContent=safe(msg);
   document.dispatchEvent(new CustomEvent('wcp:module-status',{
     detail:{moduleId:'ocr2md:workspace',message:status.textContent,level}}));
  };
  // Model data and DOM rows are different facts. The old 'loaded N' status
  // only represented backend response count, and hid AG virtualization faults.
  const checkGrid=(expected,epoch)=>{
   if(abort.signal.aborted||epoch!==state.epoch||!grid)return;
   const h=grid.rowHealth();
   gridHealth.dataset.total=String(h.total);
   gridHealth.dataset.displayed=String(h.displayed);
   gridHealth.dataset.rendered=String(h.rendered);
   gridHealth.dataset.dom=String(h.dom);
   gridHealth.dataset.visible=String(h.visible);
   gridHealth.dataset.filtered=String(h.filtered);
   gridHealth.dataset.width=String(h.width);
   gridHealth.dataset.height=String(h.height);
   const mismatch=expected>0 && (h.total!==expected||h.displayed===0||h.rendered===0||h.dom===0||h.visible===0);
   // Keep diagnostics unobtrusive on successful renders; numeric evidence
   // remains in data attributes for tests. Re-open on any future mismatch.
   gridHealth.hidden=!mismatch;
   gridHealth.style.borderColor=mismatch?'#a98958':'#465267';
   gridHealth.style.color=mismatch?'#f7dbad':'#a5b7c8';
   healthMessage.textContent=`目录 ${expected} 项；AG 模型 ${h.total} / 筛后 ${h.displayed} / 渲染 ${h.rendered} / DOM ${h.dom} / 可见 ${h.visible}；筛选 ${h.filtered?'开':'关'}；初建宽 ${h.initialWidth} / 容器 ${h.width}×${h.height}`;
   repaint.hidden=!mismatch;
   const g=h.geometry,fmt=rect=>rect?rect.join(','):'none';
   geometryMessage.textContent=`行按钮 ${fmt(g.button)}；行容器 ${fmt(g.row)}；滚动视口 ${fmt(g.view)}；中心视口 ${fmt(g.center)}；滚动 ${Math.round(g.scrollTop)}/${Math.round(g.scrollHeight)}/${Math.round(g.clientHeight)}；范围 ${Math.round(g.scrollRange.top)}..${Math.round(g.scrollRange.bottom)}；样式 ${g.display}/${g.visibility}/${g.opacity}，行 ${g.rowDisplay}/${g.rowVisibility}/${g.rowOpacity}；定位 top=${g.rowTop} transform=${g.rowTransform}`;

  };
  // AG Grid may finish its virtual row DOM after the CQE data promise and
  // after the first layout pass, particularly under iOS Safari/WebKit.
  // Bounded follow-up reads prevent a transient 0/5 diagnostic from sticking.
  const recheck=(count,epoch)=>{
   for(const ms of [350,1400,3000])setTimeout(()=>checkGrid(count,epoch),ms);
  };
  const go=async(path,cursor='')=>{
   if(abort.signal.aborted||state.pending)return;
   state.pending=true;const epoch=++state.epoch;++state.previewEpoch;ag.inert=true;output('正在读取目录…','busy');
   try{
    const result=await bus.query('workspace.list',{path,cursor});if(epoch!==state.epoch||abort.signal.aborted)return;
    if(result.error)throw Error(result.error);
    state.path=result.path;state.selected=null;state.selectedDirectory=null;
    pathDisplay.textContent='Obsidian/ocr2md'+result.path;
    pathDisplay.title=pathDisplay.textContent;
    grid.setRows(result.entries);grid.setSource('选择左侧 AG 行查看该项详细信息；双击目录名称进入下级目录。');
    parent.disabled=result.path===HOME;
    output('已加载 '+result.entries.length+' 项'+(result.truncated?' · 本页只显示前 160 项':'')+(result.cursor?' · 还有下一页':''));
    recheck(result.entries.length,epoch);
   }catch(e){output('读取失败：'+safe(e),'error')}
   finally{state.pending=false;ag.inert=false}
  };
  try{grid=new WorkspaceView(ag,source,async row=>{
   state.selected=row;
   if(row.kind==='directory'){state.selectedDirectory=row.path;grid.selectDirectory(row.path)}
   const epoch=++state.previewEpoch;output('读取所选项…','busy');
   const data=await bus.query('workspace.preview',{path:row.path,nodeId:row.nodeId,revision:row.revision}).catch(e=>({error:String(e)}));
   if(epoch!==state.previewEpoch||abort.signal.aborted)return;
   grid.setSource(data.error?'读取失败：'+safe(data.error):data.text+(data.truncated?'\n\n（仅显示前段内容）':''));
   output('已选择 '+row.name);
  },row=>{if(row.kind==='directory')void go(row.path)});}catch(e){output('AG/源码组件加载失败：'+safe(e),'error');throw e}
  repaint.addEventListener('click',()=>{
   if(!grid||state.pending||abort.signal.aborted)return;
   grid.redraw();
   recheck(grid.rowHealth().total,state.epoch);
  },{signal:abort.signal});
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
    const path=state.selectedDirectory??state.path;
    output('验证书籍文件夹及 PDF…','busy');
    try{const result=await bus.command('workspace.activate',{path});output(result.selected?'工作目录已选定：'+result.path+' · PDF '+result.pdfCount+' 项（仅选择目录；文档由后续模块处理）':'设置失败：'+result.error,result.selected?'ready':'error')}
    catch(e){output('设置失败：'+safe(e),'error')}
  },{signal:abort.signal});
  const unsubscribe=bus.subscribe('workspace.selected',()=>{});
  const instance={host,tri,grid,dispose:()=>{
   abort.abort();unsubscribe();tri.dispose();grid.destroy();
   actions.remove();viewRoot.remove();
  }};
  instances.set(host,instance);
  instance.tri.resize();
  await statusCheck();
  }catch(error){
    // Mount failures must not leave a half-installed AG/CodeMirror/toolbar.
    abort.abort();instances.delete(host);
    try{grid?.destroy()}catch{}
    try{tri?.dispose()}catch{}
    viewRoot.remove();throw error;
  }
 },
 unmount(host){const instance=instances.get(host);if(instance){instances.delete(host);instance.dispose();}}

};
