/** Frame composition root: isolated Settings/CM6 shell; lab-pdf optionally
 * mounts a public PDF Viewer demo. No Main CMD, SQL or document backend. */
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
const labName=typeof __FRAME_APP_ID__==='string'?__FRAME_APP_ID__:'lab-frame';
const globalStatus=createFrameStatus($('status'));
const topStatus=(message,kind='info')=>globalStatus.publish(message,kind);
const build=__FRAME_BUILD_VERSION__;
// The displayed badge is immutable for this build. Keep seconds in the
// release identity for auto-update checks, but show year/month/day-hour/minute.
$('build-version').textContent=build.match(/(\d{8}-\d{4})\d{2}$/)?.[1]??build;
let publishedDirectory='';
const io=createFrameSettingsIO(localStorage,labName,()=>publishedDirectory,
  path=>frameDirectoryPort.browse(path));
function setSize(size){document.documentElement.style.setProperty('--ocr-frame-font-size',size+'px');
  document.documentElement.style.setProperty('--ocr-frame-scale',String(size/16));}
setSize(io.getInitialSize());
const onPdfMount=labName==='lab-pdf'?(surface,pane)=>{
  // Dynamic import keeps the public PDF.js bundle out of frame-only clients.
  // Dockview alone owns mount/dispose on split-pane transitions.
  let disposed=false,view=null;
  void import('../lab-pdf/demo.js').then(({mountPdfDemo})=>{
    if(!disposed)view=mountPdfDemo(surface,pane,topStatus);
  }).catch(error=>{if(!disposed)topStatus('PDF 组件加载失败：'+error.message,'error');});
  return {layout(){},dispose(){disposed=true;view?.dispose();}};
}:null;
const frame=createFrameWorkspace($('workspace'),{onStatus:topStatus,onModuleChange:showModule,
  onPdfMount});
// Main's Tom Select adapter owns the visible control, never a parallel picker.
const frameFileSelect=$('workspace').querySelector('.ocr-source-file-select');
enhanceNavigationSelect(frameFileSelect,{search:true,kind:'files'});
let settings=null,loadingSettings=null,currentModule='frame';
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
    const module=createSettingsModule($('settings-workspace'),settingsStatus,frameDirectoryPort,io);
    module.register({module:'F',key:'globalUi.font.family',category:['全局 UI','字体'],
      label:'字体 Sarasa（只读）',comment:'Sarasa Fixed SC；字体家族固定',
      type:'string',control:'readonly',defaultValue:'Sarasa',message:'settings.changed'});
    module.register({module:'F',key:'globalUi.font.size',category:['全局 UI','字体'],
      label:'字号',comment:'Lab PDF 的统一字号，8–32 px',
      type:'number',control:'slider',defaultValue:16,min:8,max:32,step:1,
      unit:'px',message:'settings.changed'});
    module.register({module:'F',key:'runtime.workDirectory',category:['运行环境','目录'],
      label:'工作目录',comment:'当前发布入口对应的本机目录；只读，与业务模块无关',
      type:'string',control:'readonly',defaultValue:publishedDirectory||'未发布',
      message:'settings.changed'});
    module.register({module:'F',key:'workspace.dataDirectory',category:['工作区','目录'],
      label:'资料目录',comment:'通用资料目录绑定；不检查 OCR、MinerU 或 PDF',
      type:'path',control:'directory-tree',defaultValue:'',message:'settings.changed'});
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
  back.addEventListener('click',()=>void showModule('frame'));
  const select=document.createElement('select');select.className='ocr-source-file-select';
  select.setAttribute('aria-label','源码文件导航');
  // Clone only the underlying authoritative select/optgroup, never Tom's DOM.
  select.append(...[...frameFileSelect.children].map(child=>child.cloneNode(true)));
  select.value='settings';
  select.addEventListener('change',()=>{if(select.value==='settings')void showModule('settings');});
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
  refreshSettingsHistory();
}
async function showModule(name){
  currentModule=name==='settings'?'settings':'frame';
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
    frameFileSelect.value='';
    // The native select is the Main NavigationSelect public business port.
    frameFileSelect.dispatchEvent(new Event('change',{bubbles:true}));
    frame.activate();
    topStatus('空白四窗框架已就绪 · 可由源码导航进入 settings.json');
  }
}
$('global-save').addEventListener('click',async()=>{
  if(!settings){topStatus('当前无文档可保存；请打开 settings.json 修改设置');return;}
  if(!settings.hasUnsaved()){topStatus('当前没有待保存的全局设置');return;}
  try{const saved=await settings.save();topStatus(saved?'✓ 全局设置已保存':'● 保存期间设置有新修改',saved?'ok':'warning');}
  catch(error){topStatus('保存失败：'+error.message,'error');}
});
// Navigation lives inside each AG pane; the brand is a normal /labs/ link.
// No engineering dialog or dirty-state confirmation intercepts navigation.
startFrameAutoUpdate({version:build,labName,report:topStatus});
showModule('frame');
// Reuse Main Settings / CM6 with frame-local IO. No beforeunload/dirty gate,
// SQL, media or source-document writer. No implicit per-slider save.
