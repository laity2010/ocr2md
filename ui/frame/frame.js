/** Translation state composition: Frame settings plus public read-only Sentence snapshot. */
import '../styles.css';
import '../obsidian-everforest.css';
import './frame.css';
import {createFrameWorkspace} from './layout.js';
import {createOriginalSession} from '../translation/original-sentences.js';
import {initializePreparation} from '../translation/preparation.js';
import {startFrameAutoUpdate} from './refresh.js';
import {createFrameSettingsIO} from './settings-io.js';
import {frameDirectoryPort} from './directory-port.js';
import {frameWorkspaceIO} from './workspace-io.js';
import {createFrameStatus} from './global-status.js';
import {enhanceNavigationSelect} from '../wcp-navigation-select.js';
const $=id=>document.getElementById(id);
const globalStatus=createFrameStatus($('status'));
const topStatus=(message,kind='info')=>globalStatus.publish(message,kind);
const build=__FRAME_BUILD_VERSION__;
// The displayed badge is immutable for this build. Keep seconds in the
// release identity for auto-update checks, but show year/month/day-hour/minute.
$('build-version').textContent=build.match(/(\d{8}-\d{4})\d{2}$/)?.[1]??build;
let publishedDirectory='';
const io=createFrameSettingsIO(localStorage,'lab-frame',()=>publishedDirectory,
  path=>frameDirectoryPort.browse(path));
function setSize(size){document.documentElement.style.setProperty('--ocr-frame-font-size',size+'px');
  document.documentElement.style.setProperty('--ocr-frame-scale',String(size/16));}
setSize(io.getInitialSize());
const frame=createFrameWorkspace($('workspace'),{onStatus:topStatus,onModuleChange:showModule});
// Main's Tom Select adapter owns the visible control, never a parallel picker.
const frameFileSelect=$('workspace').querySelector('.ocr-source-file-select');
enhanceNavigationSelect(frameFileSelect,{search:true,kind:'files'});
let settings=null,loadingSettings=null,currentModule='frame';
// Only one I/O probe may publish status; switching Settings cancels older
// announcements without touching the shared status or Save component.
let probeGeneration=0,verifiedPath='',selectedPath='',initializing=false;
let preparation=null,preparationRequest=null;
function clearPreparation(){preparationRequest?.abort();preparationRequest=null;preparation=null;}
const original=createOriginalSession({onChange:current=>{
  if(!current||preparation?.sentence_sha256!==current.snapshot.sentence_sha256)clearPreparation();
  if(currentModule==='translation'&&preparation)frame.setTranslationRows(preparation.rows);
  else frame.setOriginalRows(current?.snapshot.rows??null);
  syncNavigation();
}});
function settingsNav(){return $('settings-workspace').querySelector('.ocr-source-file-select');}
function syncNavigation(){
  for(const select of [frameFileSelect,settingsNav()]){
    if(!select)continue;
    select.querySelector('optgroup[label="SQL"]')?.remove();
    if(verifiedPath){
      const group=document.createElement('optgroup');group.label='SQL';
      group.append(new Option('初始化原句表（只读）','sql-init'));
      if(original.current?.workspace===verifiedPath){
        group.append(new Option('原句表 · sentence（只读）','original'),new Option('初始化译句表','translation-init'));
        if(preparation)group.append(new Option('译句表 · translation','translation'));
      }
      select.prepend(group);
    }
    select.value=select===frameFileSelect?(original.current?(currentModule==='translation'&&preparation?'translation':'original'):''):'settings';
    select.ocrNavigationSelect?.refresh();
  }
}
async function initializeOriginal(){
  const path=verifiedPath;
  if(!path||path!==selectedPath||initializing)return;
  initializing=true;
  topStatus('正在只读初始化原句表…');
  try{
    const result=await original.initialize(path);
    if(!result||path!==verifiedPath||path!==selectedPath)return;
    await showModule('original');
  }catch(error){
    if(path===verifiedPath&&path===selectedPath){
      currentModule='settings';$('workspace').hidden=true;$('settings-workspace').hidden=false;settings?.activate();
      syncNavigation();topStatus('原句表初始化失败：'+error.message,'error');
    }
  }finally{initializing=false;syncNavigation();}
}
async function initializeTranslation(){
  const current=original.current;
  if(!current||current.workspace!==verifiedPath||current.workspace!==selectedPath||initializing||preparationRequest)return;
  const controller=new AbortController();preparationRequest=controller;
  topStatus('正在识别不翻译元素并初始化译句表…');
  try{
    const result=await initializePreparation(current.workspace,current.snapshot,{signal:controller.signal});
    if(preparationRequest!==controller||original.current!==current||verifiedPath!==current.workspace||selectedPath!==current.workspace)return;
    preparation=result;await showModule('translation');
  }catch(error){
    if(preparationRequest!==controller||original.current!==current)return;
    preparation=null;await showModule('original');topStatus('译句表初始化失败：'+error.message,'error');
  }finally{
    if(preparationRequest===controller){preparationRequest=null;syncNavigation();}
  }
}
async function verifyWorkspaceIO(selected,{afterSave=false,uncommitted=false}={}){
  const generation=++probeGeneration;
  if(selected!==selectedPath){selectedPath=selected;verifiedPath='';original.invalidate();}
  if(!selected){verifiedPath='';original.invalidate();
    topStatus(afterSave?'✓ 全局设置已保存 · 尚未绑定工作目录':'尚未绑定工作区资料目录','warning');return;
  }
  topStatus((afterSave?'✓ 全局设置已保存 · ':'')+'正在验证工作区文件读写…');
  try{
    await frameWorkspaceIO.probe(selected);
    if(generation!==probeGeneration)return;
    verifiedPath=selected;syncNavigation();
    topStatus((afterSave?'✓ 全局设置已保存 · ':'✓ ')+'工作区文件可读写'+(uncommitted?' · 目录设置尚未保存':'')+' · 可初始化原句表','ok');
  }catch(error){
    if(generation!==probeGeneration)return;
    verifiedPath='';original.invalidate();
    topStatus((afterSave?'全局设置已保存，但':'')+'工作区文件读写验证失败：'+error.message,'error');
  }
}
// The chooser reports every explicit adoption, including an unchanged path.
// Changed paths already trigger the Settings-owned `settings.changed` port.
// Re-adopting the same path must still verify filesystem access, not just
// replay the generic warning from the directory widget.
document.addEventListener('workspace-directory-adopted',event=>{
  const {key,path,unchanged}=event.detail||{};
  if(currentModule!=='settings'||key!=='workspace.dataDirectory')return;
  event.preventDefault();
  if(unchanged)void verifyWorkspaceIO(path,{uncommitted:settings?.hasUnsaved()||false});
  else topStatus('正在验证工作区文件读写…');
  // Settings may emit its generic unsaved/loaded message AFTER the change
  // listener starts the probe. Reassert the progress state after the chooser
  // finishes, without starting a second filesystem request.
});
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
    module.subscribe({module:'F',key:'globalUi.font.size'},({value})=>setSize(value));
    // A directory-picker adoption (or a valid CM6 settings.json edit) is
    // already a runtime change. Probe it immediately, BEFORE explicit Save,
    // without storing it or changing Main's Settings document. Do not probe
    // during initial load; the startup module switch verifies the saved path.
    module.subscribe({module:'F',key:'workspace.dataDirectory'},({value,origin})=>{
      if(origin==='cm6')void verifyWorkspaceIO(value,{uncommitted:true});
    });
    await module.load();settings=module;mountSettingsNavigation();refreshSettingsHistory();return module;
  })().catch(error=>{loadingSettings=null;throw error;});
  return loadingSettings;
}
function mountSettingsNavigation(){
  const source=$('settings-workspace').querySelector('.ocr-settings-source');
  if(!source||source.querySelector('.ocr-source-file-toolbar'))return;
  const bar=document.createElement('div');bar.className='ocr-source-file-toolbar';
  // Navigation has one settings.json entry; no back button or second menu.
  const select=document.createElement('select');select.className='ocr-source-file-select';
  select.setAttribute('aria-label','源码文件导航');
  // Clone only the underlying authoritative select/optgroup, never Tom's DOM.
  select.append(...[...frameFileSelect.children].map(child=>child.cloneNode(true)));
  select.value='settings';
  select.addEventListener('change',()=>{if(['settings','sql-init','original','translation-init','translation'].includes(select.value))void showModule(select.value);});
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
  bar.append(select,actions);source.prepend(bar);
  enhanceNavigationSelect(select,{search:true,kind:'files'});
  syncNavigation();refreshSettingsHistory();
}
async function showModule(name){
  if(name==='sql-init'){syncNavigation();return initializeOriginal();}
  if(name==='translation-init'){syncNavigation();return initializeTranslation();}
  if((name==='original'||name==='translation')&&!original.current)return;
  if(name==='translation'&&!preparation)return;
  currentModule=['original','translation'].includes(name)?name:'settings';
  const inSettings=currentModule==='settings';
  $('workspace').hidden=inSettings;
  $('settings-workspace').hidden=!inSettings;
  $('global-save').disabled=false;
  if(inSettings){
    ++probeGeneration;
    topStatus('正在打开全局设置…');
    try{const module=await getSettings();
      if(currentModule==='settings'){
        module.activate();
        topStatus('全局设置已就绪 · 字体 Sarasa · 字号 '+module.get('globalUi.font.size')+' px');
        // Initial entry and any reentry check the already-saved directory.
        void verifyWorkspaceIO(module.get('workspace.dataDirectory'));
      }}
    catch(error){topStatus('全局设置加载失败：'+error.message,'error');}
  }else{
    if(currentModule==='translation'){
      frame.setTranslationRows(preparation.rows);
      topStatus('✓ 译句表 · '+preparation.rows.length+' 句 · 可翻译 '+preparation.rows.filter(r=>r.translatable).length+' 句','ok');
    }else{
      frame.setOriginalRows(original.current.snapshot.rows);
      topStatus('✓ 原句表（只读） · '+original.current.snapshot.rows.length+' 句 · 已保存分句快照','ok');
    }
    syncNavigation();frame.activate();
  }
}
$('global-save').addEventListener('click',async()=>{
  if(!settings){topStatus('当前无文档可保存；请打开 settings.json 修改设置');return;}
  if(!settings.hasUnsaved()){topStatus('当前没有待保存的全局设置');return;}
  try{const saved=await settings.save();
    if(saved)void verifyWorkspaceIO(settings.get('workspace.dataDirectory'),{afterSave:true});
    else topStatus('● 保存期间设置有新修改','warning');}
  catch(error){topStatus('保存失败：'+error.message,'error');}
});
// Navigation lives inside each AG pane; the brand is a normal /labs/ link.
// No engineering dialog or dirty-state confirmation intercepts navigation.
startFrameAutoUpdate({version:build,report:topStatus});
showModule('settings');
// Reuse Main Settings / CM6 with frame-local IO. No beforeunload/dirty gate,
// SQL, media or source-document writer. No implicit per-slider save.
