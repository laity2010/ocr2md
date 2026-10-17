/** WCP AppFrame v1 — one owner for brand/build/status/catalog/navigation/actions.
 * Consumer supplies data+callbacks, never host DOM implementation.
 * No OCR2MD naming, selectors, storage, or business-side imports.
 */
const cssUrl=new URL('./app-frame.css',import.meta.url);
function styles(){
 if(document.querySelector('link[data-wcp-app-frame]'))return;
 const link=document.createElement('link');link.rel='stylesheet';link.href=cssUrl.href;
 link.dataset.wcpAppFrame='v1';document.head.append(link);
}
const element=(tag,klass,text)=>{const n=document.createElement(tag);if(klass)n.className=klass;if(text!=null)n.textContent=String(text);return n};
function makeButton(action,handler){
 const b=element('button','wcp-app-action',action.label);
 b.type='button';b.dataset.action=action.id;b.disabled=Boolean(action.disabled||action.alwaysDisabled);
 b.title=action.title||action.label;
 b.addEventListener('click',()=>handler(action.id));return b;
}
export function createAppFrame(host,{appName='应用',buildId='-',modules=[],onSelect=()=>{},onAction=()=>{},onCatalog=()=>{}}={}){
 if(!(host instanceof HTMLElement))throw new TypeError('WCP_APP_FRAME_HOST_REQUIRED');
 styles();
 const frame=element('div','wcp-app-frame');frame.dataset.component='wcp:app-frame-v1';
 const brand=element('div','wcp-app-brand');
 const updateReady=element('button','wcp-app-update');updateReady.type='button';updateReady.hidden=true;
 const version=element('button','wcp-app-version');version.type='button';version.setAttribute('aria-label','查看应用组件与版本');
 const brandName=element('strong','wcp-app-name',appName),build=element('span','wcp-app-build',buildId);
 version.append(brandName,build);
 const status=element('div','wcp-app-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.dataset.level='busy';
 const statusModule=element('strong','wcp-app-status-module'),statusText=element('span','wcp-app-status-text','加载中…');status.append(statusModule,statusText);brand.append(version,status,updateReady);
 const tabsRow=element('div','wcp-app-tabs-row');const nav=element('nav','wcp-app-tabs');nav.setAttribute('role','tablist');nav.setAttribute('aria-label','已接入模块');
 const globals=element('div','wcp-app-global-actions');globals.setAttribute('role','group');globals.setAttribute('aria-label','全局编辑操作');tabsRow.append(nav,globals);
 const toolbar=element('div','wcp-app-toolbar');toolbar.setAttribute('role','toolbar');toolbar.setAttribute('aria-label','当前模块操作');
 const moduleName=element('strong','wcp-app-toolbar-title'),actions=element('div','wcp-app-module-actions');toolbar.append(moduleName,actions);
 const workspace=element('main','wcp-app-workspace');const mount=element('div','wcp-app-mount');workspace.append(mount);
 const dialog=element('dialog','wcp-app-catalog');const heading=element('strong',null,'应用组件与版本'),close=makeButton({id:'close',label:'关闭'},()=>dialog.close());
 const catalogTitle=element('div','wcp-app-catalog-header');catalogTitle.append(heading,close);const details=element('p','wcp-app-catalog-description');const catalog=element('ul','wcp-app-catalog-items');dialog.append(catalogTitle,details,catalog);
 frame.append(brand,tabsRow,toolbar,workspace,dialog);host.replaceChildren(frame);
 let current=modules.find(x=>x.home)?.id||modules[0]?.id||null;
 let updateControl=null;
 const drawModules=()=>{
  nav.replaceChildren();
  for(const module of modules){if(module.kind==='service')continue;
   const tab=makeButton({id:module.id,label:module.tab||module.name||module.id},id=>{onSelect(id)});
   tab.setAttribute('role','tab');tab.dataset.module=module.id;tab.setAttribute('aria-selected',String(module.id===current));nav.append(tab);
  }
 };
 const setActive=(id)=>{
  current=id;const selected=modules.find(x=>x.id===id);
  statusModule.textContent=selected?.tab||selected?.name||id;
  moduleName.textContent=selected?.tab||selected?.name||id;
  for(const b of nav.querySelectorAll('[role="tab"]'))b.setAttribute('aria-selected',String(b.dataset.module===id));
  setActions(selected?.actions||[]);
 };
 function setActions(items){globals.replaceChildren();actions.replaceChildren();
  for(const action of items){const button=makeButton(action,onAction);(action.globalRole?globals:actions).append(button);}
 }
 const setActionState=(id,disabled)=>{
  for(const b of [...globals.querySelectorAll('[data-action]'),...actions.querySelectorAll('[data-action]')]){
   if(b.dataset.action===id)b.disabled=Boolean(disabled);
  }
 };
 const setStatus=(message,level='ready')=>{statusText.textContent=String(message);status.dataset.level=level};
 const setBuild=(id)=>{build.textContent=String(id);build.dataset.buildId=String(id)};
 const setCatalog=(items)=>{catalog.replaceChildren();for(const item of items){const li=element('li',null,`${item.name||item.id} · ${item.version||'-'}`);li.dataset.componentId=item.id;catalog.append(li)}};
 /** Framework-owned release lifecycle (no application-specific imports).
  * Format of the remote build metadata and settings-save event are passed in
  * by consumers. WCP owns polling, HTML verification and safe navigation.
  */
 function watchBuild({metadataUrl='./release-info.json',htmlUrl='./',metadataKey='buildId',
   htmlBuildSelector='[data-build-id]',intervalMs=15000,saveEvent=null,
   isDirty=()=>false,onPending=()=>{},onReload=null,checkOnStart=true}={}){
   updateControl?.stop();
   const currentBuild=build.textContent;
   if(!currentBuild||currentBuild==='-')throw new TypeError('WCP_APP_BUILD_REQUIRED');
   const remote=new URL(metadataUrl,document.baseURI);
   const html=new URL(htmlUrl,document.baseURI);
   const valid=id=>typeof id==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,90}$/.test(id);
   if(!valid(currentBuild))throw new TypeError('WCP_APP_BUILD_INVALID');
   let stopped=false,busy=false,pending='';
   const editingFocused=()=>Boolean(document.activeElement?.closest?.('textarea,input,[contenteditable="true"],.cm-editor'));
   const blocked=()=>Boolean(isDirty?.()||editingFocused());
   const notify=(next,reason)=>{
     pending=next;updateReady.hidden=false;updateReady.disabled=true;
     updateReady.textContent=`新版 ${next} · ${reason}`;
     onPending(next,reason);
   };
   const check=async()=>{
     if(stopped||busy||document.hidden)return;
     busy=true;
     try{
       const manifestUrl=new URL(remote);manifestUrl.searchParams.set('releaseCheck',String(Date.now()));
       const response=await fetch(manifestUrl,{cache:'no-store',credentials:'same-origin'});
       if(!response.ok)return;
       const info=await response.json();const next=info?.[metadataKey];
       if(!valid(next)||next===currentBuild){pending='';updateReady.hidden=true;return}
       if(blocked()){notify(next,'保存或结束编辑后更新');return}
       // Release metadata may become visible before HTML/assets have arrived
       // at a CDN edge. A matching HTML build stamp is mandatory.
       const verifyUrl=new URL(html);verifyUrl.searchParams.set('releaseCheck',next);
       const candidate=await fetch(verifyUrl,{cache:'no-store',credentials:'same-origin'});
       if(!candidate.ok){notify(next,'等待页面同步');return}
       const doc=new DOMParser().parseFromString(await candidate.text(),'text/html');
       if(doc.querySelector(htmlBuildSelector)?.getAttribute('data-build-id')!==next){
         notify(next,'等待页面同步');return;
       }
       if(blocked()){notify(next,'保存或结束编辑后更新');return}
       stopped=true;updateReady.hidden=true;
       const target=new URL(window.location.href);target.searchParams.set('build',next);
       if(typeof onReload==='function')onReload(next,target.href);
       else window.location.replace(target.href);
     }catch(_error){/* Offline/restricted network: preserve current page. */}
     finally{busy=false}
   };
   const foreground=()=>{if(!document.hidden)void check()};
   const focusout=()=>{if(pending)queueMicrotask(()=>void check())};
   const saved=()=>{void check()};
   const onUpdate=()=>{void check()};
   updateReady.addEventListener('click',onUpdate);
   const interval=setInterval(()=>void check(),intervalMs);
   document.addEventListener('visibilitychange',foreground);
   document.addEventListener('focusout',focusout);
   window.addEventListener('pageshow',foreground);
   window.addEventListener('focus',foreground);
   window.addEventListener('online',foreground);
   if(saveEvent)document.addEventListener(saveEvent,saved);
   if(checkOnStart)void check();
   updateControl=Object.freeze({check,stop(){stopped=true;clearInterval(interval);
     document.removeEventListener('visibilitychange',foreground);
     document.removeEventListener('focusout',focusout);
     window.removeEventListener('pageshow',foreground);
     window.removeEventListener('focus',foreground);
     window.removeEventListener('online',foreground);
     if(saveEvent)document.removeEventListener(saveEvent,saved);
     updateReady.removeEventListener('click',onUpdate);
     updateReady.hidden=true;
   }});
   return updateControl;
 }
 version.addEventListener('click',()=>{onCatalog();dialog.showModal()});
 drawModules();setActive(current);setBuild(buildId);
 return Object.freeze({mount,setActive,setActions,setStatus,setBuild,setCatalog,watchBuild,
  setActionState, get activeModule(){return current},get root(){return frame},
  get statusElement(){return status},get buildElement(){return build},
  get catalogElement(){return catalog},destroy(){updateControl?.stop();frame.remove()}});
}
export const appFrameVersion='1.0.2';
