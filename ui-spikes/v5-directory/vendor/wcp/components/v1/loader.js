/** WCP Loader v1 — central manifest, immutable hash-verified releases, safe updates, rollback. */
const origin=new URL('./',import.meta.url);
const manifestUrl=new URL('manifest.json',origin);
const versionRe=/^\d+\.\d+\.\d+$/;
const major=v=>Number(v.split('.')[0]);
function assertRelease(item){
  if(!item||!versionRe.test(item.version)||!/^releases\/\d+\.\d+\.\d+\/wcp-workbench\.js$/.test(item.entry)||
    !/^[a-f0-9]{64}$/.test(item.sha256)||item.tag!=='laity-wcp-workbench-v'+item.version.replaceAll('.','-'))
    throw Error('INVALID_RELEASE_MANIFEST');
}
async function manifest(){
  const response=await fetch(manifestUrl,{cache:'no-store',credentials:'omit',mode:'cors'});
  if(!response.ok)throw Error('WCP_MANIFEST_HTTP_'+response.status);
  const data=await response.json();
  if(data.schemaVersion!==1||!versionRe.test(data.stable)||!Array.isArray(data.releases))throw Error('WCP_MANIFEST_UNSUPPORTED');
  data.releases.forEach(assertRelease);
  if(!data.releases.some(item=>item.version===data.stable))throw Error('WCP_MANIFEST_STABLE_MISSING');
  return data;
}
async function verifiedImport(item){
  const url=new URL(item.entry,origin);
  if(url.origin!==origin.origin||!url.pathname.startsWith(origin.pathname+'releases/'))throw Error('WCP_ENTRY_UNTRUSTED');
  const res=await fetch(url,{credentials:'omit',mode:'cors'});
  if(!res.ok)throw Error('WCP_RELEASE_HTTP_'+res.status);
  const content=await res.arrayBuffer();
  if(content.byteLength>2000000)throw Error('WCP_RELEASE_OVERSIZE');
  const digest=await crypto.subtle.digest('SHA-256',content);
  const hex=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
  if(hex!==item.sha256)throw Error('WCP_RELEASE_INTEGRITY_FAILED');
  // Import the exact verified bytes, not a second mutable network fetch (TOCTOU).
  const objectUrl=URL.createObjectURL(new Blob([content],{type:'text/javascript'}));
  let module;
  try{module=await import(/* @vite-ignore */ objectUrl)}
  finally{URL.revokeObjectURL(objectUrl)}
  if(module.version!==item.version||module.elementTag!==item.tag||!customElements.get(item.tag))throw Error('WCP_RELEASE_MODULE_INVALID');
  return module;
}
const safeStore={
  get(key){try{return localStorage.getItem(key)}catch{return null}},
  set(key,val){try{localStorage.setItem(key,val)}catch{}},
  remove(key){try{localStorage.removeItem(key)}catch{}}
};
export async function mountWcp(target,options={}){
  if(!(target instanceof HTMLElement))throw TypeError('WCP mount target must be HTMLElement');
  const appId=options.appId||'wcp-consumer';
  if(!/^[a-z][a-z0-9-]{0,63}$/.test(appId))throw Error('WCP_APP_ID_INVALID');
  const key='wcp:v1:pin:'+appId;
  const container=document.createElement('div');
  container.className='wcp-loader-host';
  Object.assign(container.style,{position:'relative',width:'100%',height:'100%',minHeight:'320px',overflow:'hidden'});
  target.replaceChildren(container);
  let current=null,release=null,known=null,pending=null,closed=false,updateTimer,working=false;
  function notify(event,detail={}){
    target.dispatchEvent(new CustomEvent('wcp:'+event,{detail,bubbles:true}));
    options.onState?.({event,version:release?.version??null,...detail});
  }
  function dirty(){return Boolean(options.isDirty?.()||current?.dirty||current?.hasAttribute('data-unsaved'))}
  async function activate(item){
    if(closed||working)return false;
    working=true;
    try{
      await verifiedImport(item);
      if(closed)return false;
      const candidate=document.createElement(item.tag);
      candidate.setAttribute('app-id',appId);
      // App code is supplied by its owner; WCP never downloads app-specific modules.
      candidate.externalModules=options.modules??[];
      candidate.hostChrome=options.hostChrome==='external'?'external':'internal';
      candidate.allowedBuiltinPlugins=options.allowedBuiltinPlugins;
      candidate.initialModuleId=options.initialModuleId;
      candidate.messageContracts=options.contracts??[];
      if(options.settingsSchemaUrl)candidate.setAttribute('settings-schema-url',options.settingsSchemaUrl);
      Object.assign(candidate.style,{position:'absolute',inset:'0',width:'100%',height:'100%',visibility:'hidden'});
      container.append(candidate);
      const ready=await new Promise((resolve,reject)=>{
        let timeout=setTimeout(()=>reject(Error('WCP_COMPONENT_READY_TIMEOUT')),30000);
        const cleanup=()=>{clearTimeout(timeout);candidate.removeEventListener('wcp-ready',ok);candidate.removeEventListener('wcp-error',fail)};
        const ok=()=>{cleanup();resolve(true)};
        const fail=e=>{cleanup();reject(Error(e.detail?.message||'WCP_COMPONENT_FAILED'))};
        candidate.addEventListener('wcp-ready',ok,{once:true});candidate.addEventListener('wcp-error',fail,{once:true});
      }).catch(error=>{candidate.remove();throw error});
      if(!ready||closed){candidate.remove();return false}
      candidate.style.visibility='visible';
      current?.remove();
      current=candidate;release=item;pending=null;
      notify('active',{version:item.version,tag:item.tag});
      return true;
    }finally{working=false}
  }
  async function loadInitial(){
    known=await manifest();
    const pinned=safeStore.get(key);
    const chosen=known.releases.find(x=>x.version===(pinned||known.stable));
    const attempts=[chosen,known.releases.find(x=>x.version===known.previous),...known.releases]
      .filter((x,i,all)=>x&&all.findIndex(y=>y?.version===x.version)===i&&major(x.version)===major(known.stable));
    let last;
    for(const item of attempts){try{if(await activate(item)){
      if(item.version!==known.stable){safeStore.set(key,item.version);notify('fallback',{version:item.version})}
      return;
    }}catch(e){last=e;notify('release-error',{version:item.version,error:String(e)})}}
    throw last||Error('WCP_NO_COMPATIBLE_RELEASE');
  }
  async function checkUpdates(){
    if(closed||working)return null;
    const next=await manifest();known=next;
    if(safeStore.get(key))return null; // explicit rollback pin prevents surprise upgrade
    const item=known.releases.find(x=>x.version===known.stable);
    if(!release||!item||item.version===release.version)return null;
    if(major(item.version)!==major(release.version)){notify('major-update',{version:item.version});return item.version}
    if(dirty()||options.autoApply===false){pending=item;notify('update-available',{version:item.version,dirty:dirty()});return item.version}
    try{await activate(item)}catch(e){pending=item;notify('update-failed',{version:item.version,error:String(e)})}
    return item.version;
  }
  await loadInitial();
  const interval=Math.max(60000,options.checkIntervalMs??300000);
  updateTimer=setInterval(()=>void checkUpdates().catch(e=>notify('check-failed',{error:String(e)})),interval);
  const onVisible=()=>{if(document.visibilityState==='visible')void checkUpdates().catch(()=>{})};
  document.addEventListener('visibilitychange',onVisible);
  return {
    get version(){return release?.version??null},
    getComponents(){return current?.getComponents?.()??[]},
    async selectModule(id){
      if(typeof id!=='string'||!/^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/.test(id))
        throw Error('WCP_MODULE_ID_INVALID');
      if(!current?.selectModule)throw Error('WCP_MODULE_NOT_READY');
      return current.selectModule(id);
    },
    get updateAvailable(){return pending?.version??null},
    get dirty(){return dirty()},
    checkUpdates,
    async applyUpdate(){if(dirty())throw Error('WCP_UNSAVED_CHANGES');
      if(!pending)await checkUpdates();
      if(!pending)return false;
      return activate(pending)},
    async rollback(){
      if(dirty())throw Error('WCP_UNSAVED_CHANGES');
      known=await manifest();
      const index=known.releases.findIndex(x=>x.version===release?.version);
      const fallback=known.releases.slice(index+1).find(x=>major(x.version)===major(release.version));
      if(!fallback)throw Error('WCP_NO_PREVIOUS_RELEASE');
      const ok=await activate(fallback);
      if(ok){safeStore.set(key,fallback.version);notify('rollback',{version:fallback.version})}
      return ok;
    },
    async followLatest(){if(dirty())throw Error('WCP_UNSAVED_CHANGES');safeStore.remove(key);
      known=await manifest();const item=known.releases.find(x=>x.version===known.stable);
      return item.version===release.version?true:activate(item)},
    dispose(){closed=true;clearInterval(updateTimer);document.removeEventListener('visibilitychange',onVisible);current?.remove();container.remove();current=null}
  };
}
export const loaderVersion=1;
