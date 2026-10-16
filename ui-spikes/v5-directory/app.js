/** V5 composition root inherits the V4 WCP/CQE manifest protocol.
 * No V4 imports, no Vault IO, no business-module IDs wired into the shell.
 */
import {mountWcp} from './vendor/wcp/components/v1/loader.js';
import {plugins} from './plugins/registry.generated.js';

const mount=document.getElementById('v5-mount');
const navigation=document.getElementById('v5-tabs');
const status=document.getElementById('v5-status');
const enabled=plugins.filter(p=>p.manifest.kind==='ui');
const modules=plugins.flatMap(p=>p.modules);
const contracts=plugins.flatMap(p=>p.contracts);
const home=enabled.find(p=>p.manifest.home);
const setStatus=(message,level='ready')=>{status.textContent=message;status.dataset.level=level};
if(!home||!modules.some(m=>m.id===home.manifest.id))throw Error('V5_HOME_PLUGIN_MISSING');
const tabs=new Map();
let runtime=null,changing=false;
for(const item of enabled){
 const tab=document.createElement('button');
 tab.type='button';tab.dataset.testid='v5-tab-'+item.manifest.id.split(':')[1];
 tab.textContent=item.manifest.tab;tab.setAttribute('role','tab');
 tab.setAttribute('aria-selected',String(item===home));
 tab.addEventListener('click',async()=>{
  if(changing||!runtime)return;
  changing=true;
  try{
   await runtime.selectModule(item.manifest.id);
   for(const [id,node] of tabs)node.setAttribute('aria-selected',String(id===item.manifest.id));
   setStatus('已进入 '+item.manifest.tab);
  }catch(error){setStatus('模块切换失败：'+String(error),'error')}
  finally{changing=false}
 });
 tabs.set(item.manifest.id,tab);navigation.append(tab);
}
document.addEventListener('wcp:module-status',event=>{
 const {moduleId,message,level}=event.detail||{};
 if(tabs.get(moduleId)&&typeof message==='string')setStatus(message.slice(0,300),level);
});
window.__ocr2mdV5={phase:'loading',modules:modules.map(x=>x.id),contracts:contracts.length};
try{
 runtime=await mountWcp(mount,{appId:'ocr2md-v5',modules,contracts,hostChrome:'external',
  allowedBuiltinPlugins:[],initialModuleId:home.manifest.id,autoApply:false,
  isDirty:()=>modules.some(m=>typeof m.isDirty==='function'&&m.isDirty())});
 if(!runtime.version||!mount.querySelector('[class=wcp-loader-host]'))throw Error('V5_WCP_NOT_MOUNTED');
 window.__ocr2mdV5={phase:'ready',modules:modules.map(x=>x.id),
  contracts:contracts.length,wcpVersion:runtime.version,instance:runtime};
 mount.dataset.wcpVersion=runtime.version;
 setStatus('WP0 已就绪 · WCP '+runtime.version+' · 业务模块待迁移');
}catch(error){
 window.__ocr2mdV5={phase:'error',error:String(error),modules:modules.map(x=>x.id)};
 setStatus('V5 启动失败：'+String(error),'error');
}
