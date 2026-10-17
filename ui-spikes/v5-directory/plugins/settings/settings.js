/** OCR2MD v5 settings configuration adapter, inherited from frozen V4. It supplies data, validation,
 * persistence and top actions for a shared component, but is not itself
 * a reusable WCP component. WCP retains its lifecycle.
 */
import {createSettingsModel} from './ui-settings-model.js';
import {TriPane,triPaneVersion} from '../../components/tripane.js';
import {ResidentHost,residentVersion} from '../../components/resident.js';
// Separate from the old 24-item v3 migration snapshot; leave that store intact.
const STORAGE_KEY='ocr2md-v5-ui-settings-v1';
const V4_READONLY_SETTINGS_KEY='ocr2md-v4-ui-settings-v1';
const SHARED_COMPONENT=new URL('../../vendor/shared-settings/v1/releases/0.1.18/settings-panel.js',import.meta.url).href;
const SHARED_MANIFEST=new URL('../../vendor/shared-settings/v1/manifest.json',import.meta.url).href;
const SHARED_SOURCE=new URL('../../vendor/shared-source/v1/source-surface.js?v=0.2.5',import.meta.url).href;
const SHARED_MANIFEST_UPSTREAM=SHARED_MANIFEST;
const SHARED_COMPONENT_UPSTREAM=SHARED_COMPONENT;
// Settings Contract v1: the app composition publishes *declarative* plugin
// settings, not business services or filesystem objects. No business ID,
// storage key, or plugin type is embedded in this adapter.
let coreSchema=[];
let registrations=[];
let model=createSettingsModel([]);
const rebuildModel=()=>{model=createSettingsModel(coreSchema,registrations)};
document.addEventListener('wcp:settings:catalog-v1',event=>{
  if(!Array.isArray(event.detail?.registrations))throw Error('SETTINGS_CATALOG_INVALID');
  registrations=structuredClone(event.detail.registrations);
  rebuildModel();
});
// WCP owns ALL splitters. Shared Settings retains its existing AG, editor,
// preview, history and persistence; only their host DOM nodes change parent.
const SETTINGS_TRI_KEY='ocr2md-v5-settings-tri-v2';
// Shared Settings owns its internal pane CSS and exposes layout slots via API.
// This host only constructs the public WCP TriPane from those slots.
const triPanes=new WeakMap();
let settingsTriStylePromise;
function ensureSettingsTriStyle(){
  if(settingsTriStylePromise)return settingsTriStylePromise;
  settingsTriStylePromise=new Promise((resolve,reject)=>{
    const link=document.createElement('link');link.rel='stylesheet';
    link.href=new URL('../../components/dockview.css',import.meta.url).href;
    link.dataset.wcpSettingsTriStyle='true';
    link.addEventListener('load',resolve,{once:true});
    link.addEventListener('error',()=>reject(Error('SETTINGS_TRIPANE_STYLES_FAILED')),{once:true});
    document.head.append(link);
  });
  return settingsTriStylePromise;
}
async function installSettingsTriPane(panel){
  if(triPanes.has(panel))return triPanes.get(panel);
  await ensureSettingsTriStyle();
  const slots=panel.setExternalLayout(true);
  if(!slots||!panel.isLayoutReady)throw Error('SETTINGS_PUBLIC_LAYOUT_SLOTS_UNAVAILABLE');
  const tri=new TriPane(slots.host,{slots:{ag:slots.ag,source:slots.source,preview:slots.preview},
    compactLayout:'right-stack',mode:'compact',storage:sessionStorage,storageKey:SETTINGS_TRI_KEY});
  triPanes.set(panel,tri);
  panel.dataset.wcpLayout='tripane';
  panel.dataset.triPaneVersion=triPaneVersion;
  requestAnimationFrame(()=>requestAnimationFrame(()=>panel.refresh()));
  return tri;
}

let savedSettingsSnapshot=null;
const settingsSnapshot=()=>livePanel?.isLayoutReady
  ?JSON.stringify({values:livePanel.values,source:livePanel.sourceText,disabled:livePanel.disabledIds})
  :null;
let livePanel=null;
let parkedHost=null;
let resident=null;
let prewarmPromise=null;
const updateAction=(id,disabled)=>document.dispatchEvent(new CustomEvent('wcp:app-action-state',
  {detail:{id,disabled:Boolean(disabled)}}));
function ensureParking(){
 if(resident)return resident.element;
 resident=new ResidentHost({id:'ocr2md-settings-prewarm',onResize:()=>livePanel?.refresh?.()});
 parkedHost=resident.element;
 return parkedHost;
}
function hideParking(){resident?.hide()}
function revealParking(anchor){
 if(!anchor?.isConnected)throw Error('SETTINGS_DISPLAY_HOST_MISSING');
 ensureParking();resident.show(anchor);
}
function readStored(){
  try{
    const raw=localStorage.getItem(STORAGE_KEY)||localStorage.getItem(V4_READONLY_SETTINGS_KEY);
    const value=raw?JSON.parse(raw):{};
    return value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  }catch{return{}}
}
function loadValues(){return model.fromStored(readStored())}
// Stable public API: read and saved notifications are scoped to the caller's
// registered ownerId. Business modules never import or inspect Settings internals.
document.addEventListener('wcp:settings:read-v1',event=>{
  const {ownerId,reply}=event.detail||{};
  if(typeof ownerId==='string'&&typeof reply==='function')reply(model.forOwner(ownerId,loadValues()));
});
export const settingsModule={
  id:'ocr2md:settings',name:'设置',version:'1.1.0',
  description:'通用设置 UI 的配置数据适配器：仅设置页面自身的样式与编辑偏好；无目录、章节或文件权限。',
  order:0,presentation:'full',inventoryRole:'adapter',
  isDirty(){const snapshot=settingsSnapshot();return snapshot!==null&&savedSettingsSnapshot!==null&&snapshot!==savedSettingsSnapshot;},
  inspectComponents(){
    return [{id:'shared:settings',name:'通用设置 UI',version:livePanel?.version??'加载中'},
      {id:'wcp:tripane',name:'WCP TriPane 布局',version:triPaneVersion}];
  },
  prewarm(){
    if(prewarmPromise)return prewarmPromise;
    const host=ensureParking();
    prewarmPromise=new Promise((resolve,reject)=>{
      let ended=false;
      const observer=new MutationObserver(check);
      const stop=(error)=>{if(ended)return;ended=true;observer.disconnect();clearTimeout(timeout);
        if(error)reject(error);else resolve(true);};
      function check(){
        const panel=host.querySelector('laity-settings-panel');
        if(panel?.dataset.ready==='error'||panel?.dataset.sourceReady==='fallback'||panel?.dataset.wcpLayout==='error')
          return stop(Error('SETTINGS_PREWARM_COMPONENT_ERROR'));
        if(panel?.isLayoutReady&&triPanes.has(panel))stop();
      }
      observer.observe(host,{subtree:true,childList:true,attributes:true,
        attributeFilter:['data-ready','data-source-ready','data-wcp-layout']});
      const timeout=setTimeout(()=>stop(Error('SETTINGS_PREWARM_TIMEOUT')),90000);
      // Initial mount is isolated; page stays navigable throughout prewarm.
      void this._prepare(host,null).then(check).catch(stop);
    });
    return prewarmPromise;
  },
  async mount(host,_channel){
    await this.prewarm();
    ensureParking();
    host.dataset.moduleOwner='ocr2md:settings';
    host.style.cssText='height:100%;width:100%;min-height:0;overflow:hidden';
    // Shared Settings destroys AG on disconnect; never reparent it, use an overlay.
    revealParking(host);
    updateAction('settings-undo',!livePanel?.canUndo);
    updateAction('settings-redo',!livePanel?.canRedo);
  },
  async _prepare(host,_channel){
    const abort=new AbortController();
    const setState=(message,level='ready')=>{
      document.dispatchEvent(new CustomEvent('wcp:module-status',
        {detail:{moduleId:'ocr2md:settings',message,level}}));
    };
    // The Settings component owns placeholder rows. WCP owns the catalog.
    let componentCatalog=[];
    document.addEventListener('wcp:component-catalog',event=>{
      componentCatalog=event.detail?.components??[];
      livePanel?.setComponentCatalog(componentCatalog);
    },{signal:abort.signal});
    host.dataset.moduleOwner='ocr2md:settings';
    // Preserve offscreen position: the prewarmed Settings must NOT be a flex sibling.
    if(host!==parkedHost)host.style.cssText='height:100%;width:100%;min-height:0;overflow:hidden';
    const message=document.createElement('div');message.className='settings-load-status';message.setAttribute('role','status');
    message.textContent='正在加载通用设置组件…';
    host.replaceChildren(message);
    for(const id of ['settings-undo','settings-redo','settings-save','settings-reset'])updateAction(id,true);
    setState('加载中','busy');
    // Keep WCP mounting independently of the shared asset startup latency.
    const boot=async()=>{
      try{
        const [schema,manifest]=await Promise.all([
          fetch(new URL('./settings.schema.json',import.meta.url),{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('SETTINGS_SCHEMA_HTTP_'+r.status);return r.json();}),
          fetch(SHARED_MANIFEST,{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('SHARED_SETTINGS_MANIFEST_HTTP_'+r.status);return r.json();}).catch(()=>fetch(SHARED_MANIFEST_UPSTREAM,{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('SHARED_SETTINGS_FALLBACK_HTTP_'+r.status);return r.json();})),
        ]);
        if(!/^\d+\.\d+\.\d+$/.test(manifest.version))throw Error('SHARED_SETTINGS_VERSION_INVALID');
        await import('../../vendor/shared-settings/v1/releases/0.1.18/settings-panel.js');
        if(abort.signal.aborted)return;
        const panel=document.createElement('laity-settings-panel');
        panel.id='settings-shared';
        panel.setAttribute('data-testid','shared-settings-panel');
        panel.setAttribute('app-id','ocr2md-v5');
        panel.setAttribute('title','ocr2md 设置');
        panel.setAttribute('layout','horizontal');
        // Real Settings AG must expose values, not merely parameter IDs and
        // the unrelated "enabled" checkbox. Existing consumers keep
        // the original components-only layout unless they opt in.
        panel.setAttribute('table-layout','components-values');
        panel.setAttribute('source-editor','codemirror');
        panel.setAttribute('source-module-url',SHARED_SOURCE);
        panel.setAttribute('source-comments','true');
        panel.setAttribute('storage','none');
        panel.setAttribute('commit-mode','explicit');
        panel.setAttribute('chrome','external');
        coreSchema=schema;rebuildModel();
        const visibleSchema=model.schema;
        panel.setParameterNameMode('label');
        panel.setComponentCatalog(componentCatalog);
        panel.settingsSchema=visibleSchema;
        // Preserve hidden chapter values in the V5 storage even when no
        // chapter plugin is present. No change to V4 schema or storage keys.
        panel.initialValues=loadValues();
        panel.validateValues=value=>model.validate(value,{strict:true});
        panel.style.cssText='display:block;width:100%;height:100%;min-height:0;--las-panel-bg:#1d2732;--las-control-bg:#253343;--las-border:#43536b;--las-fg:#e1e7ef;--las-accent:#83c092;--las-font-family:var(--laity-ui-font,"Sarasa Fixed SC",ui-monospace,monospace)';
        const applyUiSettings=()=>{
          const options=model.validate(panel.values,{strict:true});
          panel.style.setProperty('--las-source-font-size',options.sourceFontSize+'px');
          panel.style.setProperty('--las-source-line-height',String(options.sourceLineHeight));
          panel.style.setProperty('--las-preview-height',options.previewHeight+'%');
          panel.style.setProperty('--las-accent',options.accentColor);
          panel.setAttribute('source-comments',String(options.sourceComments));
        };
        applyUiSettings();
        const buttons=()=>{
          updateAction('settings-undo',!panel.canUndo);
          updateAction('settings-redo',!panel.canRedo);
          updateAction('settings-reset',false);
          updateAction('settings-save',false);
        };
        // The central Settings component owns AG and exports its column API.
        const orderColumns=()=>panel.setColumnOrder([
          'componentModule','componentVersion','featureGroup','enabled','parameterName']);
        let triInstalling=false;
        const maybeInstallTriPane=()=>{
          if(abort.signal.aborted||triInstalling||triPanes.has(panel)||!panel.isLayoutReady)return;
          triInstalling=true;
          void installSettingsTriPane(panel).then(()=>{
            if(savedSettingsSnapshot===null)savedSettingsSnapshot=settingsSnapshot();
            setState('AG / 源码 / 预览 TriPane 已就绪');
          }).catch(error=>{
            panel.dataset.wcpLayout='error';
            setState('TriPane 初始化失败：'+String(error),'error');
          });
        };
        const readiness=new MutationObserver(maybeInstallTriPane);
        readiness.observe(panel,{attributes:true,attributeFilter:['data-ready','data-source-ready']});
        abort.signal.addEventListener('abort',()=>readiness.disconnect(),{once:true});
        panel.addEventListener('laity-settings-ready',()=>{
          orderColumns();applyUiSettings();buttons();setState('AG / 源码就绪，正在建立 TriPane');
          maybeInstallTriPane();
        },{signal:abort.signal});
        // Source selection synchronization is owned by shared-settings itself.
        panel.addEventListener('laity-settings-change',applyUiSettings,{signal:abort.signal});
        panel.addEventListener('laity-settings-history',()=>{applyUiSettings();buttons();setState(panel.canUndo?'草稿待保存':'AG / 源码已就绪',panel.canUndo?'dirty':'ready');},{signal:abort.signal});
        panel.addEventListener('laity-settings-saved',e=>{
          try{
            // Unknown inactive legacy settings are kept as inert storage
            // values, never fed into the live Schema, source editor or events.
            const value=model.validate(e.detail.values,{strict:true});
            localStorage.setItem(STORAGE_KEY,JSON.stringify({...readStored(),...value}));
            savedSettingsSnapshot=settingsSnapshot();
            // Settings is the single authority for saved visual preferences;
            // notify resident business modules without importing their code.
            for(const {ownerId,values} of model.byOwner(value))
              document.dispatchEvent(new CustomEvent('wcp:settings:changed-v1',
                {detail:{ownerId,values}}));
            setState('配置已保存');
          }catch(error){setState('保存失败：'+String(error),'error');}
          buttons();
        },{signal:abort.signal});
        panel.addEventListener('laity-settings-load-error',e=>setState('设置错误：'+String(e.detail?.message??'未知错误'),'error'),{signal:abort.signal});
        const actions={
          'settings-undo':()=>panel.undo(),
          'settings-redo':()=>panel.redo(),
          'settings-reset':()=>panel.reset(),
          'settings-save':()=>panel.save(),
        };
        document.addEventListener('wcp:app-action',event=>{
          const fn=actions[event.detail?.id];
          if(fn)Promise.resolve().then(fn).catch(error=>setState(String(error),'error'));
        },{signal:abort.signal});
        host.replaceChildren(panel);
        livePanel=panel;
        maybeInstallTriPane();
        host.dataset.settingsMounted='true';
        setState('组件已装载，初始化中…','busy');
      }catch(error){
        if(abort.signal.aborted)return;
        setState('设置加载失败','error');
        message.textContent='通用设置加载失败：'+String(error);
        const retry=document.createElement('button');retry.textContent='重试加载';retry.type='button';
        retry.addEventListener('click',()=>{retry.remove();void boot()},{once:true,signal:abort.signal});
        host.replaceChildren(message,retry);
      }
    };
    host.__settingsCleanup=()=>{abort.abort();};
    void boot();
  },
  unmount(host){
    // Keep the original custom element connected, including its AG instance.
    hideParking();
    for(const id of ['settings-undo','settings-redo','settings-save','settings-reset'])updateAction(id,true);
    host.replaceChildren();
  }
};
export const modules=[settingsModule];
export const contracts=[];
