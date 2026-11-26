/** Lab-Sentence composition root: shared Frame settings, public V2 source, own sentence API. */
import '../styles.css';
import '../obsidian-everforest.css';
import './frame.css';
import {createFrameWorkspace} from './layout.js';
import {requestSentence,saveSentenceChoices} from '../sentence/persisted.js';
import {createSnapshotSession} from '../sentence/snapshot.js';
import {startFrameAutoUpdate} from './refresh.js';
import {createFrameSettingsIO} from './settings-io.js';
import {frameDirectoryPort} from './directory-port.js';
import {frameWorkspaceIO} from './workspace-io.js';
import {createFrameStatus} from './global-status.js';
import {enhanceNavigationSelect} from '../wcp-navigation-select.js';
const $=id=>document.getElementById(id);
const globalStatus=createFrameStatus($('status'));
const topStatus=(message,kind='info')=>globalStatus.publish(message,kind);
const sentenceSource=createSnapshotSession({report:topStatus});
let sentenceCandidates=null,loadedSnapshot=null,loadedRows=null;
const build=__FRAME_BUILD_VERSION__;
// The displayed badge is immutable for this build. Keep seconds in the
// release identity for auto-update checks, but show year/month/day-hour/minute.
$('build-version').textContent=build.match(/(\d{8}-\d{4})\d{2}$/)?.[1]??build;
let publishedDirectory='';
const io=createFrameSettingsIO(localStorage,'lab-sentence',()=>publishedDirectory,
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
let probeGeneration=0,loadedPath='',rebuilding=false;
function wireSQLGroup(select){
  const adapter=select.ocrNavigationSelect;
  adapter.tom.dropdown.addEventListener('click',event=>{
    const header=event.target.closest('.optgroup-header');
    if(!header?.closest('.optgroup')||header.textContent.trim()!=='SQL')return;
    event.preventDefault();event.stopPropagation();adapter.tom.close();
    openSQLActions();
  },true);
}
wireSQLGroup(frameFileSelect);
function syncLogicalNavigation(loaded){
  for(const select of [frameFileSelect,$('settings-workspace').querySelector('.ocr-source-file-select')]){
    if(!select)continue;
    select.querySelector('optgroup[label="SQL"]')?.remove();
    if(loaded){
      const sql=document.createElement('optgroup');sql.label='SQL';
      sql.append(new Option('逻辑表 · logical_block','frame'));
      if(loadedRows!==null)sql.append(new Option('分句表 · sentence','sentence'));
      select.prepend(sql);
    }
    select.value=select===frameFileSelect?(loaded?(currentModule==='sentence'&&loadedRows!==null?'sentence':'frame'):''):'settings';
    select.ocrNavigationSelect?.refresh();
  }
}
function clearLogicalSource(){
  sentenceSource.invalidate();sentenceCandidates=null;loadedSnapshot=null;loadedRows=null;loadedPath='';
  if(currentModule==='sentence')currentModule='frame';
  frame.setSourceMarkdown('',{resetReview:true});syncLogicalNavigation(false);
}
function openSQLActions(){
  if(!loadedPath||rebuilding)return;
  if(settings?.hasUnsaved()){topStatus('请先保存全局设置，再重新初始化句表','warning');return;}
  let dialog=$('sentence-sql-actions-dialog');
  if(!dialog){
    dialog=document.createElement('dialog');dialog.id='sentence-sql-actions-dialog';
    const title=document.createElement('h2');title.textContent='SQL · 功能菜单';
    const info=document.createElement('p');info.textContent='重新初始化句表将清除已有分句与人工仲裁；上游两表不变。';
    const reset=document.createElement('button');reset.type='button';reset.textContent='重新初始化句表';
    reset.addEventListener('click',()=>{
      if(reset.dataset.confirm!=='yes'){
        reset.dataset.confirm='yes';reset.textContent='确认重新初始化句表';return;
      }
      dialog.close();
      const path=loadedPath;
      if(path&&!settings?.hasUnsaved())void verifyWorkspaceIO(path,{reinitialize:true});
    });
    const close=document.createElement('button');close.type='button';close.textContent='取消';close.addEventListener('click',()=>dialog.close());
    dialog.append(title,info,reset,close);document.body.append(dialog);
  }
  const reset=dialog.querySelector('button');reset.dataset.confirm='';reset.textContent='重新初始化句表';
  dialog.showModal();
}
async function verifyWorkspaceIO(selected,{afterSave=false,uncommitted=false,reinitialize=false}={}){
  if(reinitialize&&rebuilding)return;
  if(reinitialize)rebuilding=true;
  const generation=++probeGeneration;
  if(!uncommitted){
    frame.setLocked(true);
    if(frame.hasPending()&&!await frame.flush()){
      if(generation===probeGeneration)frame.setLocked(false);
      if(reinitialize)rebuilding=false;
      return;
    }
    if(generation!==probeGeneration){if(reinitialize)rebuilding=false;return;}
  }
  if(!uncommitted&&selected!==loadedPath)clearLogicalSource();
  if(!selected){
    if(generation===probeGeneration)topStatus(afterSave?'✓ 全局设置已保存 · 尚未绑定工作目录':
      '尚未绑定工作区资料目录','warning');
    rebuilding=false;if(!uncommitted)frame.setLocked(false);return;
  }
  topStatus((afterSave?'✓ 全局设置已保存 · ':'')+'正在验证工作区文件读写…');
  try{
    await frameWorkspaceIO.probe(selected);
    if(generation===probeGeneration)topStatus(
      (afterSave?'✓ 全局设置已保存 · ':'✓ ')+'工作区文件可读写'+(uncommitted?' · 目录设置尚未保存':''),'ok');
    if(generation===probeGeneration&&!uncommitted){
      const snapshot=await sentenceSource.load(selected);
      if(generation!==probeGeneration)return;
      if(!snapshot){if(!reinitialize)clearLogicalSource();return;}
      topStatus(reinitialize?'正在重新初始化句表…':'正在初始化或加载句表…');
      const result=await requestSentence(selected,snapshot,{reinitialize});
      if(generation!==probeGeneration)return;
      loadedPath=selected;loadedSnapshot=snapshot;
      loadedRows=result.state==='ready'?result.rows:null;sentenceCandidates=result.review;
      frame.setSourceMarkdown(snapshot.markdown,{resetReview:reinitialize||result.state==='stale'});
      if(sentenceCandidates)frame.setReview(snapshot,sentenceCandidates,loadedRows,batch=>saveSentenceChoices(selected,snapshot,batch));
      if(currentModule==='sentence'&&loadedRows===null)currentModule='frame';
      syncLogicalNavigation(true);
      if(result.state==='stale')topStatus('句表与已保存 MDLine 不一致 · 请通过 SQL 组重新初始化句表','warning');
      else {
        const failures=sentenceCandidates.lines.flatMap(row=>row.candidates).filter(c=>c.error).length;
        topStatus('V2 已保存逻辑表 · '+snapshot.lines.length+' MDLine · '+loadedRows.length+' 句记录 · 三引擎分句 '+(snapshot.lines.length*3-failures)+'/'+(snapshot.lines.length*3)+(failures?' · '+failures+' 个候选失败':''),failures?'warning':'ok');
      }
    }
  }catch(error){
    if(generation===probeGeneration){
      if(!uncommitted&&!reinitialize)clearLogicalSource();
      topStatus((reinitialize?'重新初始化未确认成功：':afterSave?'全局设置已保存，但工作区加载失败：':'工作区加载失败：')+error.message,'error');
    }
  }finally{if(reinitialize)rebuilding=false;if(generation===probeGeneration)frame.setLocked(false);}
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
  select.addEventListener('change',()=>{if(select.value==='settings')void showModule('settings');else if(select.value==='frame'||select.value==='sentence')void showModule(select.value);});
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
  wireSQLGroup(select);
  refreshSettingsHistory();
}
async function showModule(name){
  currentModule=name==='settings'?'settings':name==='sentence'&&loadedRows!==null?'sentence':'frame';
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
        void verifyWorkspaceIO(module.get('workspace.dataDirectory'),{uncommitted:module.hasUnsaved()});
      }}
    catch(error){topStatus('全局设置加载失败：'+error.message,'error');}
  }else{
    // Leaving Settings does not add a second file to the single-file menu.
    frameFileSelect.value=loadedPath?currentModule:'';
    // The native select is the Main NavigationSelect public business port.
    frameFileSelect.ocrNavigationSelect?.refresh();
    frame.activate();
    if(currentModule==='sentence')frame.focusTable();else if(loadedPath)frame.focusSource();
    const snapshot=loadedSnapshot;
    if(snapshot&&loadedRows===null)topStatus('句表与已保存 MDLine 不一致 · 请通过 SQL 组重新初始化句表','warning');
    else if(frame.hasPending())topStatus('● 分句仲裁待保存','warning');
    else topStatus(snapshot?'V2 已保存逻辑表 · '+snapshot.lines.length+' MDLine · '+frame.rowCount()+' 句记录':'分句工作台 · 尚未加载逻辑表',snapshot?'ok':'warning');

  }
}
$('global-save').addEventListener('click',async()=>{
  if(frame.hasPending()){
    if(!await frame.flush())return;
    if(currentModule!=='settings'||!settings?.hasUnsaved())return;
  }
  if(!settings){topStatus('当前无文档可保存；请打开 settings.json 修改设置');return;}
  if(!settings.hasUnsaved()){topStatus('当前没有待保存的全局设置');return;}
  try{const saved=await settings.save();
    if(saved)void verifyWorkspaceIO(settings.get('workspace.dataDirectory'),{afterSave:true});
    else topStatus('● 保存期间设置有新修改','warning');}
  catch(error){topStatus('保存失败：'+error.message,'error');}
});
// Navigation lives inside each AG pane; the brand is a normal /labs/ link.
// No engineering dialog or dirty-state confirmation intercepts navigation.
window.addEventListener('beforeunload',event=>{
  if(frame.hasPending()){event.preventDefault();event.returnValue='';}
});
startFrameAutoUpdate({version:build,report:topStatus,reload:()=>{
  // Pending user edits are never deliberately discarded by auto-update.
  void frame.flush().then(ok=>{if(ok&&!frame.hasPending())location.reload();});
}});
showModule('frame');
void getSettings().then(module=>{if(currentModule==='frame')void verifyWorkspaceIO(module.get('workspace.dataDirectory'));}).catch(error=>topStatus('全局设置加载失败：'+error.message,'error'));
// Reuse Main Settings / CM6 with frame-local IO. No beforeunload/dirty gate,
// SQL, media or source-document writer. No implicit per-slider save.
