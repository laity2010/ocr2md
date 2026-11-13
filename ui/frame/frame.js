/** Lab-frame composition root: no CMD, SQLite, document, media or settings backend. */
import '../styles.css';
import '../obsidian-everforest.css';
import './frame.css';
import {createFrameWorkspace} from './layout.js';
import {startFrameAutoUpdate} from './refresh.js';
import {createFrameSettingsIO} from './settings-io.js';
import {frameDirectoryPort} from './directory-port.js';
import {createFrameStatus} from './global-status.js';
import {enhanceNavigationSelect} from '../wcp-navigation-select.js';
const $=id=>document.getElementById(id);
// Shared Frame shell with independent Lab identity and a unified top status port.
const labName=typeof __FRAME_APP_ID__==='string'?__FRAME_APP_ID__:'lab-frame';
const globalStatus=createFrameStatus($('status'));
const topStatus=(message,kind='info')=>globalStatus.publish(message,kind);
const build=__FRAME_BUILD_VERSION__;
// The displayed badge is immutable for this build. Keep seconds in the
// release identity for auto-update checks, but show year/month/day-hour/minute.
$('build-version').textContent=build.match(/(\d{8}-\d{4})\d{2}$/)?.[1]??build;
let publishedDirectory='';
let authorizationAdapter=null;
async function withMainDirectoryAuthorization(operation){
  try{return await operation();}
  catch(error){
    // The existing Main directory API determines eligibility. Never grant
    // access or bypass a non-403 error in the Lab browser.
    if(labName!=='lab-ocr'||error?.status!==403)throw error;
    if(!authorizationAdapter){
      const {createMainEditorAuthorization}=await import('../lab-ocr/editor-authorization.js');
      authorizationAdapter=createMainEditorAuthorization({onStatus:topStatus});
    }
    if(!await authorizationAdapter.request())throw error;
    return operation(); // Exactly one reattempt, authorized by Main itself.
  }
}
const directoryPort=labName==='lab-ocr'?Object.freeze({
  roots:()=>withMainDirectoryAuthorization(()=>frameDirectoryPort.roots()),
  browse:path=>withMainDirectoryAuthorization(()=>frameDirectoryPort.browse(path)),
}):frameDirectoryPort;
const io=createFrameSettingsIO(localStorage,labName,()=>publishedDirectory,
  path=>directoryPort.browse(path));
function setSize(size){document.documentElement.style.setProperty('--ocr-frame-font-size',size+'px');
  document.documentElement.style.setProperty('--ocr-frame-scale',String(size/16));}
setSize(io.getInitialSize());
function setPdfOverlayBorderWidth(value){
  if(typeof value==='number'&&Number.isFinite(value)&&value>=0.25&&value<=3)
    $('workspace').style.setProperty('--lab-ocr-pdf-overlay-border-width',value+'px');
}
function setPdfOverlayTransparency(value){
  if(Number.isInteger(value)&&value>=0&&value<=95)
    $('workspace').style.setProperty('--lab-ocr-pdf-overlay-opacity',String((100-value)/100));
}
if(labName==='lab-ocr'){
  const initial=io.getInitialOverlayStyle();
  setPdfOverlayBorderWidth(initial.borderWidth);
  setPdfOverlayTransparency(initial.transparency);
}
// User navigation must win over asynchronous initial book inspection on reload.
let manualNavigationRevision=0;
let currentModule='frame';
function userShowModule(name){
  manualNavigationRevision++;
  if(name==='sql:initialize'){
    if(!ocrWorkflow)return Promise.resolve(false);
    return ocrWorkflow.initializeSql().then(async result=>{
      if(result)await showModule('sql:block');
      else{
        // A canceled destructive initialization must not leave Tom Select
        // stranded on the same command, or the user cannot invoke it again.
        frameFileSelect.value=currentModule.startsWith('sql:')?currentModule:'';
        frameFileSelect.ocrNavigationSelect?.refresh();
      }
      return result;
    }).catch(error=>{topStatus('SQL 初始化失败：'+error.message,'error');return false;});
  }
  return showModule(name);
}
function previewStatus(message,kind='info'){
  // PDF warm-up runs asynchronously. It must not overwrite a more recent
  // user-initiated SQLite table/row status; errors always remain visible.
  if(message.startsWith('PDF ·')&&currentModule.startsWith('sql:')&&kind!=='error')return;
  topStatus(message,kind);
}
const frame=createFrameWorkspace($('workspace'),{onStatus:previewStatus,onModuleChange:userShowModule,
  moduleLabel:labName==='lab-ocr'?'OCR 审阅':'空白框架',
  defaultPreview:labName==='lab-ocr'?'pdf':'split'});
// Main's Tom Select adapter owns the visible control, never a parallel picker.
const frameFileSelect=$('workspace').querySelector('.ocr-source-file-select');
enhanceNavigationSelect(frameFileSelect,{search:true,kind:'files'});
let settings=null,loadingSettings=null,ocrWorkflow=null;
function refreshSettingsHistory(){
  const root=$('settings-workspace');
  const history=settings?.history||{undo:0,redo:0};
  const undo=root.querySelector('#settings-undo');
  const redo=root.querySelector('#settings-redo');
  if(undo)undo.disabled=!history.undo;
  if(redo)redo.disabled=!history.redo;
}
function settingsStatus(message,kind){
  topStatus(message,kind);
  queueMicrotask(refreshSettingsHistory);
}

async function getSettings(){
  if(settings)return settings;
  if(!loadingSettings)loadingSettings=(async()=>{
    // The publisher, not the browser, is the authority for the local directory
    // serving the current /labs/<name>/ entry. A dev build has no such directory.
    const expectedName=new URL('.',location.href).pathname.split('/').filter(Boolean).at(-1);
    try{
      const response=await fetch(new URL('release-version.json',location.href),{cache:'no-store'});
      if(!response.ok)throw Error('HTTP '+response.status);
      const metadata=await response.json();
      if(metadata?.name===expectedName&&typeof metadata.publishDirectory==='string'&&
        metadata.publishDirectory.startsWith('/')&&!/[\r\n\0]/.test(metadata.publishDirectory))
        publishedDirectory=metadata.publishDirectory;
    }catch{publishedDirectory='';}
    const {createSettingsModule}=await import('../settings-module.js');
    const module=createSettingsModule($('settings-workspace'),settingsStatus,directoryPort,io);
    module.register({module:'F',key:'globalUi.font.family',category:['全局 UI','字体'],
      label:'字体 Sarasa（只读）',comment:'Sarasa Fixed SC；字体家族固定',
      type:'string',control:'readonly',defaultValue:'Sarasa',message:'settings.changed'});
    module.register({module:'F',key:'globalUi.font.size',category:['全局 UI','字体'],
      label:'字号',comment:'整个 Lab Frame 的字号，8–32 px',
      type:'number',control:'slider',defaultValue:16,min:8,max:32,step:1,
      unit:'px',message:'settings.changed'});
    module.register({module:'F',key:'runtime.workDirectory',category:['运行环境','目录'],
      label:'工作目录',comment:'当前发布入口对应的本机目录；只读，与业务模块无关',
      type:'string',control:'readonly',defaultValue:publishedDirectory||'未发布',
      message:'settings.changed'});
    module.register({module:'F',key:'workspace.dataDirectory',category:['工作区','目录'],
      label:'资料目录',comment:'通用资料目录绑定；不检查 OCR、MinerU 或 PDF',
      type:'path',control:'directory-tree',defaultValue:'',message:'settings.changed'});
    if(labName==='lab-ocr'){
      module.register({module:'F',key:'pdf.overlay.borderWidth',category:['PDF 原文','覆盖框'],
        label:'覆盖框边框粗细',comment:'Block 与 Span 共用；0.25–3 px，默认 0.75 px',
        type:'number',control:'slider',defaultValue:0.75,min:0.25,max:3,step:0.25,
        unit:'px',message:'settings.changed'});
      module.register({module:'F',key:'pdf.overlay.transparency',category:['PDF 原文','覆盖框'],
        label:'覆盖框透明度',comment:'Block 与 Span 共用；0% 不透明、95% 最透明，默认 65%',
        type:'number',control:'slider',defaultValue:65,min:0,max:95,step:5,
        unit:'%',message:'settings.changed'});
      module.subscribe({module:'F',key:'pdf.overlay.borderWidth'},({value})=>
        setPdfOverlayBorderWidth(value));
      module.subscribe({module:'F',key:'pdf.overlay.transparency'},({value})=>
        setPdfOverlayTransparency(value));
    }
    module.subscribe({module:'F',key:'globalUi.font.size'},({value})=>setSize(value));
    await module.load();settings=module;mountSettingsNavigation();refreshSettingsHistory();return module;
  })().catch(error=>{loadingSettings=null;throw error;});
  return loadingSettings;
}
function mountSettingsNavigation(){
  const source=$('settings-workspace').querySelector('.ocr-settings-source');
  if(!source||source.querySelector('.ocr-source-file-toolbar'))return;
  const bar=document.createElement('div');bar.className='ocr-source-file-toolbar';
  // The single file is not a navigation-back choice. Return is a separate
  // workspace action so the dropdown still contains exactly one file group.
  const back=document.createElement('button');back.type='button';
  back.className='ocr-frame-back';back.textContent='←';
  back.title='返回空白框架';back.setAttribute('aria-label','返回空白框架');
  back.addEventListener('click',()=>void userShowModule('frame'));
  const select=document.createElement('select');select.className='ocr-source-file-select';
  select.setAttribute('aria-label','源码文件导航');
  // Clone only the underlying authoritative select/optgroup, never Tom's DOM.
  select.append(...[...frameFileSelect.children].map(child=>child.cloneNode(true)));
  select.value='settings';
  select.addEventListener('change',()=>{
    if(select.value==='settings')void userShowModule('settings');
    else if(select.value==='sql:initialize'||select.value==='sql:minerujson'||select.value==='sql:span'||select.value==='sql:block')void userShowModule(select.value);
  });
  const actions=document.createElement('div');actions.className='ocr-source-undo-redo';
  actions.setAttribute('role','group');actions.setAttribute('aria-label','源码撤销与重做');
  for(const [name,action,label] of [['undo',()=>settings?.undo(),'撤销'],
    ['redo',()=>settings?.redo(),'重做']]){
    const button=document.createElement('button');button.type='button';
    button.id='settings-'+name;button.textContent=name==='undo'?'↶':'↷';
    button.setAttribute('aria-label',label);button.title=label;button.disabled=true;
    button.addEventListener('click',()=>{action();queueMicrotask(refreshSettingsHistory);});
    actions.append(button);
  }
  bar.append(back,select,actions);source.prepend(bar);
  enhanceNavigationSelect(select,{search:true,kind:'files'});
  ocrWorkflow?.refreshNavigation?.();
  refreshSettingsHistory();
}
async function showModule(name){
  currentModule=name==='settings'?'settings':name==='sql:minerujson'||name==='sql:span'||name==='sql:block'?name:'frame';
  const inSettings=currentModule==='settings';
  $('workspace').hidden=inSettings;
  $('settings-workspace').hidden=!inSettings;
  $('global-save').disabled=false;
  if(inSettings){
    topStatus('正在打开全局设置…');
    try{const module=await getSettings();
      if(currentModule==='settings'){module.activate();topStatus('全局设置已就绪 · 字体 Sarasa · 字号 '+module.get('globalUi.font.size')+' px');}}
    catch(error){topStatus('全局设置加载失败：'+error.message,'error');}
  }else{
    // Leaving Settings does not add a second file to the single-file menu.
    frameFileSelect.value=currentModule.startsWith('sql:')?currentModule:'';
    // Programmatic navigation must update the visible Tom Select without
    // dispatching a new business change (which would recursively reopen SQL).
    frameFileSelect.ocrNavigationSelect?.refresh();
    frame.activate();
    if(currentModule.startsWith('sql:')&&ocrWorkflow){
      await ocrWorkflow.openSql(currentModule.slice(4));
    }else{
      frame.clearSqlRows();
      topStatus(labName==='lab-ocr'
        ?'lab-ocr 已就绪 · 请从 SQLite 导航查看已导入的数据'
        :'空白四窗框架已就绪 · 可由源码导航进入 settings.json');
    }
  }
}
$('global-save').addEventListener('click',async()=>{
  // The global Save command is also an explicit async CM6 -> SQLite flush.
  // It must work while the settings component has never been opened.
  let blockSaved=false;
  try{if(ocrWorkflow)blockSaved=await ocrWorkflow.flushBlockChanges();}
  catch(error){
    topStatus('Block SQLite 保存失败；CM6 内存修改仍保留：'+error.message,'error');
    return;
  }
  if(!settings){topStatus(blockSaved?'✓ CM6 Block 已持久化至 SQLite':
    '当前无待保存数据；全局设置可以通过 settings.json 修改',blockSaved?'ok':'info');return;}
  if(!settings.hasUnsaved()){topStatus(blockSaved?'✓ CM6 Block 已持久化至 SQLite':
    '当前没有待保存的全局设置或 Block 关系',blockSaved?'ok':'info');return;}
  try{const revision=manualNavigationRevision;
    const saved=await settings.save();topStatus(saved?'✓ 全局设置已保存':'● 保存期间设置有新修改',saved?'ok':'warning');
    if(saved&&ocrWorkflow){
      const ready=await ocrWorkflow.afterSave();
      if(ready&&revision===manualNavigationRevision)await showModule('sql:block');
    }}
  catch(error){topStatus('保存失败：'+error.message,'error');}
});
// Navigation lives inside each AG pane; the brand is a normal /labs/ link.
// No engineering dialog or dirty-state confirmation intercepts navigation.
startFrameAutoUpdate({version:build,name:labName,report:topStatus});
if(labName==='lab-ocr'){
  const bootNavigationRevision=manualNavigationRevision; // snapshot BEFORE async imports
  // The empty Frame stays independent. OCR activates only in its own Lab entry.
  void (async()=>{
    try{
      const {createLabOcrWorkflow}=await import('../lab-ocr/workflow.js');
      ocrWorkflow=createLabOcrWorkflow({io,frame,navigation:frameFileSelect,
        settingsRoot:$('settings-workspace'),onStatus:topStatus,showModule});
      const saved=await ocrWorkflow.savedWorkspace();
      if(!saved){if(bootNavigationRevision===manualNavigationRevision)await showModule('settings');
        topStatus('尚未绑定书籍工作目录，请在全局设置中选择 sample/ 并保存','warning');}
      else{
        if(bootNavigationRevision===manualNavigationRevision)await showModule('frame');
        const initialized=await ocrWorkflow.initialize();
        // Async inspection must never override explicit user navigation.
        if(initialized&&ocrWorkflow.blockReady()&&bootNavigationRevision===manualNavigationRevision)
          await showModule('sql:block');
      }
    }catch(error){topStatus('Lab OCR 初始化失败：'+error.message,'error');}
  })();
}else void showModule('frame');
// No implicit per-slider save, and neither JSON nor PDF sources are modified.
