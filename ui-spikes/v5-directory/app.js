/** OCR2MD V5 composition: no shared chrome or settings internals owned here.
 * WCP app-frame creates all chrome; app only declares modules and commands.
 */
import {mountWcp,createWcpAppFrame} from './vendor/wcp/components/v1/loader.js';
import {plugins} from './plugins/registry.generated.js';
const modules=plugins.flatMap(plugin=>plugin.modules);
const contracts=plugins.flatMap(plugin=>plugin.contracts);
const visible=plugins.filter(plugin=>plugin.manifest.kind==='ui').map(plugin=>({
  id:plugin.manifest.id,tab:plugin.manifest.tab,home:plugin.manifest.home,
  actions:plugin.manifest.actions||[],kind:plugin.manifest.kind,
  toolbarTitleVisible:plugin.manifest.toolbarTitleVisible!==false,
}));
// Declarative Settings registration happens once at composition time.
// Adding a plugin requires zero Settings or WCP source changes.
const settingsRegistrations=plugins.filter(plugin=>Array.isArray(plugin.settings)&&plugin.settings.length)
 .map(plugin=>({ownerId:plugin.manifest.id,schema:plugin.settings}));
document.dispatchEvent(new CustomEvent('wcp:settings:catalog-v1',
 {detail:{registrations:settingsRegistrations}}));
const home=visible.find(item=>item.home)||visible[0];
if(!home)throw Error('WCP_APP_NO_HOME_MODULE');
let runtime=null,changing=false;
// Version is release metadata, not handmaintained HTML and not a second source.
const buildId=document.getElementById('app-host').dataset.buildId||'v5-development';
const frame=await createWcpAppFrame(document.getElementById('app-host'),{
 appName:'ocr2md',buildId,modules:visible,
 onSelect:async id=>{
  if(!runtime||changing)return;
  changing=true;
  try{await runtime.selectModule(id);frame.setActive(id);frame.setStatus('已进入 '+id)}
  catch(error){frame.setStatus('模块切换失败：'+error,'error')}finally{changing=false}
 },
 onAction:id=>document.dispatchEvent(new CustomEvent('wcp:app-action',{detail:{id}})),
 catalogVisible:false,
});
document.addEventListener('wcp:module-status',e=>{
 const {moduleId,message,level}=e.detail||{};
 if(typeof message==='string'&&moduleId===frame.activeModule)frame.setStatus(message.slice(0,300),level);
});
document.addEventListener('wcp:app-action-state',e=>{
 if(e.detail?.id)frame.setActionState(e.detail.id,e.detail.disabled);
});
window.__ocr2mdV5={phase:'loading',modules:modules.map(m=>m.id),contracts:contracts.length};
try{
 runtime=await mountWcp(frame.mount,{appId:'ocr2md-v5',modules,contracts,
  hostChrome:'external',allowedBuiltinPlugins:[],initialModuleId:home.id,autoApply:false,
  isDirty:()=>modules.some(m=>typeof m.isDirty==='function'&&m.isDirty())});
 window.__ocr2mdV5={phase:'ready',modules:modules.map(m=>m.id),contracts:contracts.length,
  wcpVersion:runtime.version,instance:runtime};
 // WCP remains the sole authority for the complete installed inventory.
 // Settings is a user-facing view: hide explicitly internal components there
 // without changing WCP registration, routing or its diagnostic catalog.
 const internalIds=new Set(modules.filter(m=>m.inventoryRole==='internal').map(m=>m.id));
 const syncComponents=()=>{
   const components=runtime.getComponents().filter(item=>!internalIds.has(item.id));
   document.dispatchEvent(new CustomEvent('wcp:component-catalog',{detail:{components}}));
 };
 syncComponents();
 frame.mount.addEventListener('wcp:active',syncComponents);
 frame.setStatus('V5 已就绪 · WCP '+runtime.version);
 // AppFrame owns browser release watching, HTML/metadata parity, draft/focus
 // protection and Safari foreground checks; app only supplies public data.
 frame.watchBuild({metadataUrl:'./release-info.json',htmlUrl:'./',
  htmlBuildSelector:'#app-host',saveEvent:'ocr2md:v5:ui-settings-saved',
  isDirty:()=>changing||modules.some(m=>m.isDirty?.()),
  onPending:()=>frame.setStatus('发现新构建：保存修改或退出编辑后自动更新','dirty')});
}catch(error){window.__ocr2mdV5={phase:'error',error:String(error)};frame.setStatus('V5 启动失败：'+String(error),'error')}
