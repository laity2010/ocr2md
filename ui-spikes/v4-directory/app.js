/** OCR2MD V4 composition root: generic discovery, navigation and CQE. No business imports. */
// Prefer immutable, locally published WCP bytes on ALL origins, not the CDN.
// The loader still verifies the manifest and SHA of every WCP release.
// Only a missing loader may fall back to its official upstream URL.
let wcpLoader;
try{wcpLoader=await import('./vendor/wcp/components/v1/loader.js')}
catch(_missingLocalLoader){wcpLoader=await import('https://wcp.laity.bid/components/v1/loader.js?v=2')}
const {mountWcp,loaderVersion}=wcpLoader;
import {plugins} from './plugins/registry.generated.js?build=v4-261015-0114';
import {mountComponentInventory} from './component-inventory.js';
window.__v4Startup?.mark('entry-imports-ready');
const mount=document.getElementById('v4-module-mount');
const indicator=document.getElementById('status');
const nav=document.getElementById('v4-tabs');
const bar=document.getElementById('v4-top-actions');
const actionOrigins=document.getElementById('v4-action-origins');
const moduleBar=document.getElementById('v4-module-toolbar');
const moduleBarLabel=document.getElementById('v4-module-toolbar-label');
const statusBar=document.getElementById('v4-framework-status');
const statusLabel=document.getElementById('v4-status-module');
const statusCache=new Map();
// Framework-owned status contract: plugin messages carry a declared module ID,
// not DOM selectors, implementation objects or file access privileges.
function showActiveStatus(){
 const view=views.find(x=>x.manifest.id===active);
 const name=view?.modules.find(m=>m.id===active)?.name??view?.manifest.tab??'模块';
 statusLabel.textContent=name;
 const entry=statusCache.get(active)??{message:'等待'+name+'…',level:'busy'};
 indicator.textContent=entry.message;
 indicator.title=entry.message;
 statusBar.dataset.level=entry.level;
 statusBar.dataset.module=active;
}
function receiveStatus(moduleId,message,level='ready'){
 if(!modules.some(x=>x.id===moduleId)||typeof message!=='string')return;
 if(!['ready','busy','dirty','error'].includes(level))level='ready';
 statusCache.set(moduleId,{message:message.slice(0,600),level});
 if(active===moduleId)showActiveStatus();
}
document.addEventListener('wcp:module-status',event=>{
 const {moduleId,message,level}=event.detail||{};
 receiveStatus(moduleId,message,level);
});

const workflowControls=document.getElementById('v4-workflow-controls');
const modules=plugins.flatMap(p=>p.modules);
const contracts=plugins.flatMap(p=>p.contracts);
const views=plugins.filter(p=>p.manifest.kind==='ui');
const home=views.find(p=>p.manifest.home);
if(!home||!home.modules.some(x=>x.id===home.manifest.id))throw Error('V4_HOME_PLUGIN_MISSING');
const tabId=id=>'tab-'+id.split(':')[1];
const tabs=new Map(),actionBars=new Map(),groupLast=new Map(),globalTargets=new Map();
const globalRoles=['undo','redo','save'];
// A single, visible set of universal controls. Plugin descriptors decide
// which existing command receives the click. WCP never knows business IDs.
function refreshGlobalActions(){
 for(const role of globalRoles){
  const button=document.getElementById('v4-global-'+role);
  const targetId=globalTargets.get(active)?.[role];
  const target=targetId?document.getElementById(targetId):null;
  button.disabled=!target||target.disabled||switching;
  button.title=target?.title||({undo:'撤销当前模块',redo:'重做当前模块',save:'保存当前模块标定'}[role]);
 }
}
for(const role of globalRoles){
 const button=document.getElementById('v4-global-'+role);
 button.addEventListener('click',()=>{
  if(switching||button.disabled)return;
  const id=globalTargets.get(active)?.[role];const original=id?document.getElementById(id):null;
  if(original&&!original.disabled)original.click();
 });
}
const actionStatusObserver=new MutationObserver(refreshGlobalActions);
actionStatusObserver.observe(actionOrigins,{attributes:true,attributeFilter:['disabled'],subtree:true});
let activeWcp=null,active=home.manifest.id,switching=false;
for(const pkg of views){
 const spec=pkg.manifest,id=spec.id;
 if(!pkg.modules.some(m=>m.id===id))throw Error('V4_PLUGIN_MODULE_ID_MISMATCH '+id);
 const button=document.createElement('button');button.id=tabId(id);button.type='button';
 button.dataset.testid=button.id;button.role='tab';button.setAttribute('aria-controls','panel-modules');
 button.textContent=spec.tab;
 button.disabled=Boolean(spec.prewarm);
 if(spec.prewarm){button.dataset.settingsState='warming';button.title='组件后台预热中'}
 tabs.set(id,button);if(!spec.hiddenTab)nav.append(button);
 const roles={};for(const action of spec.actions){if(action.globalRole){
  if(roles[action.globalRole])throw Error('DUPLICATE_GLOBAL_ACTION_ROLE '+id+':'+action.globalRole);
  roles[action.globalRole]=action.id;
 }}
 globalTargets.set(id,roles);
 if(spec.actions.length){
   const group=document.createElement('div');group.id='plugin-actions-'+id.split(':')[1];
   group.className='v4-module-actions';group.setAttribute('role','group');group.setAttribute('aria-label',spec.tab+'全局操作');
   for(const action of spec.actions){const control=document.createElement('button');
     control.id=action.id;control.dataset.testid=action.id;control.type='button';
     control.textContent=action.label;control.title=action.title??'';control.disabled=true;
     if(action.globalRole)actionOrigins.append(control);
     else group.append(control);
   }
   actionBars.set(id,group);bar.append(group);
 }
}
const showTab=id=>{
 active=id;document.body.dataset.v4ActiveModule=id.split(':')[1];
 const group=views.find(x=>x.manifest.id===id)?.manifest.tabGroup||'';
 if(group)groupLast.set(group,id);
 for(const [key,tab] of tabs){
   const tag=views.find(x=>x.manifest.id===key)?.manifest;
   tab.setAttribute('aria-selected',String(key===id||Boolean(group&&tag?.tabGroup===group&&!tag.hiddenTab)));
 }
 workflowControls.hidden=!group;
 for(const [key,group] of actionBars)group.hidden=key!==id;
 for(const group of moduleBar.querySelectorAll('[data-module-actions-owner]'))group.hidden=group.dataset.moduleActionsOwner!==id;
 const view=views.find(x=>x.manifest.id===id);
 moduleBarLabel.textContent=view?.modules.find(m=>m.id===id)?.name||view?.manifest.tab||'模块';
 showActiveStatus();
 refreshGlobalActions();
 document.getElementById('panel-modules').setAttribute('aria-labelledby',tabId(id));
};
const choose=async id=>{
 if(switching||!activeWcp||active===id||tabs.get(id)?.disabled)return;
 switching=true;refreshGlobalActions();const prev=active;
 try{await activeWcp.selectModule(id);showTab(id)}
 catch(error){showTab(prev);receiveStatus(prev,'切换模块失败：'+String(error),'error')}
 finally{switching=false;refreshGlobalActions()}
};
for(const [id,tab] of tabs)tab.addEventListener('click',()=>{const group=views.find(x=>x.manifest.id===id)?.manifest.tabGroup;void choose(group?(groupLast.get(group)||id):id)});
// Generic workflow navigation: only the public event *name* crosses the DOM;
// document/book data remains exclusively on WCP CQE. No module-specific IDs.
document.addEventListener('wcp:workflow-transition',event=>{
 const name=event.detail?.event;if(typeof name!=='string')return;
 const target=views.find(pkg=>pkg.manifest.activateOn===name);
 if(target)void choose(target.manifest.id);
});
mountComponentInventory({getWcp:()=>activeWcp});
window.__ocr2mdV4={phase:'loading',modules:modules.map(x=>x.id),contracts:contracts.length};
window.__v4Startup?.mark('wcp-mounting');
showTab(home.manifest.id);
try{
 const instance=await mountWcp(mount,{
   appId:'ocr2md-v4',modules,contracts,hostChrome:'external',
   allowedBuiltinPlugins:[],initialModuleId:home.manifest.id,
   autoApply:true,checkIntervalMs:300000,
   isDirty:()=>Boolean(mount.querySelector('[data-unsaved]')||modules.some(x=>typeof x.isDirty==='function'&&x.isDirty())),
   onState({event,version,error}){
     if(['release-error','update-failed','check-failed'].includes(event))
       receiveStatus(active,'WCP '+(version??'—')+' · '+String(error??event),'error');
   }
 });
 if(typeof instance.selectModule!=='function')throw Error('WCP_NAVIGATION_API_REQUIRED');
 if(!mount.childElementCount||!nav.querySelector('[role=tab]'))
   throw Error('WCP_SHELL_NOT_RENDERED');
 activeWcp=instance;
 window.__ocr2mdV4={phase:'ready',modules:modules.map(x=>x.id),contracts:contracts.length,
   version:instance.version,loaderVersion,instance};
 mount.dataset.wcpVersion=instance.version;
 window.__v4Startup?.ready();
 // Optional components may prewarm AFTER the home module has become useful.
 // Keep shared settings prewarm independent and asynchronous; never block
 // the initial visible directory on settings network/AG/CodeMirror startup.
 const prepareOptional=()=>{
  for(const pkg of views){
   if(!pkg.manifest.prewarm)continue;
   const tab=tabs.get(pkg.manifest.id),implementation=pkg.modules.find(x=>x.id===pkg.manifest.id);
   if(typeof implementation?.prewarm!=='function')throw Error('V4_PREWARM_CONTRACT_MISSING '+pkg.manifest.id);
   void implementation.prewarm().then(()=>{
    tab.disabled=false;tab.dataset.settingsState='ready';tab.title='组件已预热';
   }).catch(error=>{
    tab.disabled=true;tab.dataset.settingsState='error';tab.title='组件预热失败：'+String(error);
   });
  }
 };
 if(typeof requestIdleCallback==='function')requestIdleCallback(prepareOptional,{timeout:600});
 else setTimeout(prepareOptional,0);
}catch(error){
 window.__ocr2mdV4={phase:'error',modules:modules.map(x=>x.id),error:String(error)};
 window.__v4Startup?.fail('WCP_MOUNT_FAILED');
 receiveStatus(active,'WCP 组件启动失败：'+String(error),'error');
 // The early shell handles safe retry; do not add another button here.
}

// Generic application-release watcher. Publishing changes static assets, not
// the tablet itself. A visible clean tab can safely switch to the new build;
// editor drafts and focused inputs are never reloaded out from under a user.
const currentBuild=document.getElementById('v4-build-label')?.dataset.buildId;
const updateReady=document.getElementById('v4-update-ready');
const buildInfoUrl=new URL('./build-info.json',import.meta.url);
const pageRootUrl=new URL('./',import.meta.url);
let pendingBuild='',releaseProbeBusy=false;
const releaseDirty=()=>Boolean(switching||
   statusBar.dataset.level==='dirty'||mount.querySelector('[data-unsaved]')||
   modules.some(x=>typeof x.isDirty==='function'&&x.isDirty())||
   document.activeElement?.closest('textarea,input,[contenteditable="true"],.cm-editor'));
function showPendingBuild(id,blocked,reason=''){
 if(!updateReady)return;
 updateReady.hidden=false;
 updateReady.disabled=blocked;
 updateReady.textContent='新版 '+id+(blocked?' · '+reason:' · 更新');
 updateReady.title=blocked?'保存草稿或退出编辑后自动更新':'点击使用 '+id;
}
async function inspectRelease(){
 if(!currentBuild||!updateReady||releaseProbeBusy||document.hidden||
   window.__ocr2mdV4?.phase!=='ready')return;
 releaseProbeBusy=true;
 try{
  const response=await fetch(buildInfoUrl.href+'?t='+Date.now(),{cache:'no-store'});
  if(!response.ok)return;
  const metadata=await response.json();
  if(typeof metadata.id!=='string'||!/^v4-\d{6}-\d{4}$/.test(metadata.id)||
     metadata.id<=currentBuild)return;
  pendingBuild=metadata.id;
  const blocked=releaseDirty();
  if(blocked){showPendingBuild(pendingBuild,true,'保存后更新');return}
  // A CDN may serve a newer manifest but a stale index. Never reload into an
  // inconsistent release or a redirect to authentication unexpectedly.
  const checkUrl=new URL('./?release-check='+encodeURIComponent(pendingBuild),pageRootUrl);
  const check=await fetch(checkUrl.href,{cache:'no-store'});
  if(!check.ok)return;
  const html=await check.text();
  if(!html.includes('id="v4-build-label"')||
     !html.includes('data-build-id="'+pendingBuild+'"')){
    showPendingBuild(pendingBuild,true,'等待资源同步');return;
  }
  if(releaseDirty()){showPendingBuild(pendingBuild,true,'保存后更新');return}
  const target=new URL(location.href);
  target.searchParams.set('build',pendingBuild);
  location.replace(target.href);
 }catch(_error){ /* Offline and restricted network: preserve the current tab. */ }
 finally{releaseProbeBusy=false}
}
if(updateReady&&currentBuild){
 updateReady.addEventListener('click',()=>{if(!releaseDirty())void inspectRelease()});
 setInterval(()=>{void inspectRelease()},60000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void inspectRelease()});
 window.addEventListener('pageshow',()=>{void inspectRelease()});
}
