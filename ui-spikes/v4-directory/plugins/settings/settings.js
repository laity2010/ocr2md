/** OCR2MD v4 settings configuration adapter. It supplies data, validation,
 * persistence and top actions for a shared component, but is not itself
 * a reusable WCP component. WCP retains its lifecycle.
 */
import {DEFAULT_UI_SETTINGS,parseUiSettings} from './ui-settings-model.js';
import {TriPane,triPaneVersion} from '../../components/tripane.js';
import {ResidentHost,residentVersion} from '../../components/resident.js';
// Separate from the old 24-item v3 migration snapshot; leave that store intact.
const STORAGE_KEY='ocr2md-v4-ui-settings-v1';
const SHARED_COMPONENT=new URL('../../vendor/shared-settings/v1/settings-panel.js',import.meta.url).href;
const SHARED_MANIFEST=new URL('../../vendor/shared-settings/v1/manifest.json',import.meta.url).href;
const SHARED_SOURCE=new URL('../../vendor/shared-source/v1/source-surface.js?v=0.2.5',import.meta.url).href;
const SHARED_MANIFEST_UPSTREAM='https://agent-link.laity.bid/shared-settings/v1/manifest.json';
const SHARED_COMPONENT_UPSTREAM='https://agent-link.laity.bid/shared-settings/v1/settings-panel.js';
const clone=value=>structuredClone(value);
// WCP owns ALL splitters. Shared Settings retains its existing AG, editor,
// preview, history and persistence; only their host DOM nodes change parent.
const SETTINGS_TRI_KEY='ocr2md-v4-settings-tri-v2';
const SETTINGS_TRI_CSS=`
  laity-settings-panel[data-wcp-layout="tripane"] .las-shell{
    position:relative!important;display:block!important;min-height:0!important;
    width:100%!important;height:100%!important;padding:0!important;overflow:hidden!important;
  }
  laity-settings-panel[data-wcp-layout="tripane"] .las-divider,
  laity-settings-panel[data-wcp-layout="tripane"] .las-preview-divider{display:none!important}
  laity-settings-panel[data-wcp-layout="tripane"] .las-grid-col,
  laity-settings-panel[data-wcp-layout="tripane"] .las-source-col{
    display:flex!important;flex:1 1 auto!important;flex-direction:column!important;
    width:100%!important;height:100%!important;min-height:0!important;
    min-width:0!important;max-width:none!important;overflow:hidden!important;
  }
  laity-settings-panel[data-wcp-layout="tripane"] .las-preview{
    display:flex!important;flex:1 1 auto!important;position:static!important;
    height:100%!important;max-height:none!important;min-height:0!important;
    min-width:0!important;width:100%!important;overflow:auto!important;
    border-top:0!important;
  }
  laity-settings-panel[data-wcp-layout="tripane"] .wcp-tripane-slot{min-height:0;min-width:0}
  /* SETTINGS_AG_SCOPED_DARK_THEME: legacy AG structural CSS loaded by the
     workspace supplies LIGHT AG tokens to a different plugin instance.
     Shared Settings owns its AG; OCR2MD's settings view only scopes its
     palette + Sarasa font here. No WCP, other settings sites, or Grid APIs. */
  #settings-shared[data-wcp-layout="tripane"] .las-grid-col .ag-styled-root,
  #settings-shared[data-wcp-layout="tripane"] .las-grid-col .ag-root-wrapper{
    --ag-background-color:#1d2732;
    --ag-wrapper-background-color:#1d2732;
    --ag-data-background-color:#1d2732;
    --ag-odd-row-background-color:#22303d;
    --ag-header-background-color:#253343;
    --ag-chrome-background-color:#253343;
    --ag-foreground-color:#dbe5f0;
    --ag-text-color:#dbe5f0;
    --ag-data-color:#dbe5f0;
    --ag-header-foreground-color:#dbe5f0;
    --ag-header-text-color:#dbe5f0;
    --ag-secondary-foreground-color:#b9c8d8;
    --ag-border-color:#475258;
    --ag-row-hover-color:rgba(131,185,240,.14);
    --ag-selected-row-background-color:rgba(131,185,240,.20);
    --ag-browser-color-scheme:dark;
    --ag-font-family:var(--laity-ui-font,"Sarasa Fixed SC","Sarasa Mono SC",ui-monospace,monospace);
    color-scheme:dark;
  }
`;
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
  if(panel._wcpTriPane)return panel._wcpTriPane;
  await ensureSettingsTriStyle();
  const shell=panel.querySelector('.las-shell');
  const ag=panel.querySelector('.las-grid-col');
  const source=panel.querySelector('.las-source-col');
  const preview=panel.querySelector('[data-role="preview"]');
  if(!shell||!ag||!source||!preview||!panel._gridApi||!panel._codeSurface)
    throw Error('SETTINGS_TRIPANE_REQUIRED_SLOTS_MISSING');
  const style=document.createElement('style');style.dataset.wcpSettingsLayout='true';
  style.textContent=SETTINGS_TRI_CSS;panel.append(style);
  panel.dataset.wcpLayout='tripane';
  // The CSS-scoped attribute is applied in the same task as the constructor.
  // WebKit can still report computed position=static before its style flush;
  // explicitly create the positioning context required by WCP TriPane.
  shell.style.setProperty('position','relative','important');
  // Keep the custom <laity-settings-panel> connected throughout: upstream
  // disconnectedCallback destroys its AG instance.
  const tri=new TriPane(shell,{slots:{ag,source,preview},compactLayout:'right-stack',mode:'compact',
    storage:sessionStorage,storageKey:SETTINGS_TRI_KEY});
  panel._wcpTriPane=tri;
  panel.dataset.triPaneVersion=triPaneVersion;
  requestAnimationFrame(()=>requestAnimationFrame(()=>panel.refresh?.()));
  return tri;
}

let livePanel=null;
let parkedHost=null;
let resident=null;
let prewarmPromise=null;
const topActions=()=>['settings-undo','settings-redo','settings-reset','settings-save']
  .map(id=>document.getElementById(id)).filter(Boolean);
function ensureParking(){
 if(resident)return resident.element;
 resident=new ResidentHost({id:'ocr2md-settings-prewarm',onResize:()=>livePanel?._codeSurface?.refresh?.()});
 parkedHost=resident.element;
 return parkedHost;
}
function hideParking(){resident?.hide()}
function revealParking(){
 const anchor=document.getElementById('v4-module-mount');
 if(!anchor)throw Error('SETTINGS_DISPLAY_HOST_MISSING');
 ensureParking();resident.show(anchor);
}
function loadValues(){
  try{
    const raw=localStorage.getItem(STORAGE_KEY);
    return parseUiSettings(raw?JSON.parse(raw):clone(DEFAULT_UI_SETTINGS));
  }catch{return parseUiSettings(clone(DEFAULT_UI_SETTINGS))}
}
export const settingsModule={
  id:'ocr2md:settings',name:'设置',version:'1.1.0',
  description:'通用设置 UI 的配置数据适配器：仅设置页面自身的样式与编辑偏好；无目录、章节或文件权限。',
  order:0,presentation:'full',inventoryRole:'adapter',
  isDirty(){return Boolean(livePanel?.canUndo)},
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
        if(panel?.dataset.ready==='true'&&panel?.dataset.sourceReady==='true'
          &&panel._gridApi&&panel._wcpTriPane&&panel.querySelector('[data-role="preview"]'))stop();
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
    revealParking();
    for(const control of topActions())control.disabled=false;
    document.getElementById('settings-undo').disabled=!livePanel?.canUndo;
    document.getElementById('settings-redo').disabled=!livePanel?.canRedo;
  },
  async _prepare(host,_channel){
    const abort=new AbortController();
    const actions={undo:document.getElementById('settings-undo'),
      redo:document.getElementById('settings-redo'),
      reset:document.getElementById('settings-reset'),
      save:document.getElementById('settings-save')};
    const activity=document.querySelector('[data-testid="activity-settings"]');
    const activityValue=activity?.querySelector('[data-activity-value]');
    const state=document.getElementById('status');
    const setState=(message,level='ready')=>{
      if(activity){activity.dataset.level=level;if(activityValue)activityValue.textContent=message;}
      if(state&&document.body.dataset.v4ActiveModule==='settings')state.textContent=message;
    };
    host.dataset.moduleOwner='ocr2md:settings';
    // Preserve offscreen position: the prewarmed Settings must NOT be a flex sibling.
    if(host!==parkedHost)host.style.cssText='height:100%;width:100%;min-height:0;overflow:hidden';
    const message=document.createElement('div');message.className='settings-load-status';message.setAttribute('role','status');
    message.textContent='正在加载通用设置组件…';
    host.replaceChildren(message);
    Object.values(actions).forEach(x=>{if(x)x.disabled=true;});
    setState('加载中','busy');
    // Keep WCP mounting independently of the shared asset startup latency.
    const boot=async()=>{
      try{
        const [schema,manifest]=await Promise.all([
          fetch(new URL('./settings.schema.json',import.meta.url),{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('SETTINGS_SCHEMA_HTTP_'+r.status);return r.json();}),
          fetch(SHARED_MANIFEST,{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('SHARED_SETTINGS_MANIFEST_HTTP_'+r.status);return r.json();}).catch(()=>fetch(SHARED_MANIFEST_UPSTREAM,{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('SHARED_SETTINGS_FALLBACK_HTTP_'+r.status);return r.json();})),
        ]);
        if(!/^\d+\.\d+\.\d+$/.test(manifest.version))throw Error('SHARED_SETTINGS_VERSION_INVALID');
        try{await import(SHARED_COMPONENT+'?v='+encodeURIComponent(manifest.version))}
        catch(_localMissing){await import(SHARED_COMPONENT_UPSTREAM+'?v='+encodeURIComponent(manifest.version))}
        if(abort.signal.aborted)return;
        const panel=document.createElement('laity-settings-panel');
        panel.id='settings-shared';
        panel.setAttribute('data-testid','shared-settings-panel');
        panel.setAttribute('app-id','ocr2md-v4');
        panel.setAttribute('title','ocr2md 设置');
        panel.setAttribute('layout','horizontal');
        panel.setAttribute('table-layout','components');
        panel.setAttribute('source-editor','codemirror');
        panel.setAttribute('source-module-url',SHARED_SOURCE);
        panel.setAttribute('source-comments','true');
        panel.setAttribute('storage','none');
        panel.setAttribute('commit-mode','explicit');
        panel.setAttribute('chrome','external');
        panel.settingsSchema=schema;
        panel.initialValues=loadValues();
        panel.validateValues=value=>parseUiSettings(value);
        panel.style.cssText='display:block;width:100%;height:100%;min-height:0;--las-panel-bg:#1d2732;--las-control-bg:#253343;--las-border:#43536b;--las-fg:#e1e7ef;--las-accent:#83c092;--las-font-family:var(--laity-ui-font,"Sarasa Fixed SC",ui-monospace,monospace)';
        const applyUiSettings=()=>{
          const options=parseUiSettings(panel.values);
          panel.style.setProperty('--las-source-font-size',options.sourceFontSize+'px');
          panel.style.setProperty('--las-source-line-height',String(options.sourceLineHeight));
          panel.style.setProperty('--las-preview-height',options.previewHeight+'%');
          panel.style.setProperty('--las-accent',options.accentColor);
          panel.setAttribute('source-comments',String(options.sourceComments));
        };
        applyUiSettings();
        const buttons=()=>{
          if(actions.undo)actions.undo.disabled=!panel.canUndo;
          if(actions.redo)actions.redo.disabled=!panel.canRedo;
          if(actions.reset)actions.reset.disabled=false;
          if(actions.save)actions.save.disabled=false;
        };
        // This host requests a per-instance column layout through AG's public
        // column-state API. No change to other Shared Settings consumers.
        const orderColumns=()=>{
          const api=panel._gridApi;
          if(!api?.applyColumnState)return;
          api.applyColumnState({state:[
            {colId:'componentModule'},{colId:'featureGroup'},
            {colId:'enabled',pinned:null},{colId:'parameterName'},
          ],applyOrder:true});
        };
        let triInstalling=false;
        const maybeInstallTriPane=()=>{
          if(abort.signal.aborted||triInstalling||panel._wcpTriPane||
             panel.dataset.ready!=='true'||panel.dataset.sourceReady!=='true')return;
          triInstalling=true;
          void installSettingsTriPane(panel).then(()=>{
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
        panel.addEventListener('laity-settings-change',applyUiSettings,{signal:abort.signal});
        panel.addEventListener('laity-settings-history',()=>{applyUiSettings();buttons();setState(panel.canUndo?'草稿待保存':'AG / 源码已就绪',panel.canUndo?'dirty':'ready');},{signal:abort.signal});
        panel.addEventListener('laity-settings-saved',e=>{
          try{
            const value=parseUiSettings(e.detail.values);
            localStorage.setItem(STORAGE_KEY,JSON.stringify(value));
            setState('配置已保存');
          }catch(error){setState('保存失败：'+String(error),'error');}
          buttons();
        },{signal:abort.signal});
        panel.addEventListener('laity-settings-load-error',e=>setState('设置错误：'+String(e.detail?.message??'未知错误'),'error'),{signal:abort.signal});
        const invoke=(name,fn)=>actions[name]?.addEventListener('click',()=>{
          Promise.resolve().then(fn).catch(error=>setState(String(error),'error'));
        },{signal:abort.signal});
        invoke('undo',()=>panel.undo());
        invoke('redo',()=>panel.redo());
        invoke('reset',()=>panel.reset());
        invoke('save',()=>panel.save());
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
    host.__settingsCleanup=()=>{abort.abort();Object.values(actions).forEach(x=>{if(x)x.disabled=true;});};
    void boot();
  },
  unmount(host){
    // Keep the original custom element connected, including its AG instance.
    hideParking();
    topActions().forEach(x=>x.disabled=true);
    host.replaceChildren();
  }
};
export const modules=[settingsModule];
export const contracts=[];
