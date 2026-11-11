/** Lab-frame composition root: no CMD, SQLite, document, media or settings backend. */
import '../styles.css';
import '../obsidian-everforest.css';
import './frame.css';
import {createFrameWorkspace} from './layout.js';
import {startFrameAutoUpdate} from './refresh.js';
import {createFrameSettingsIO} from './settings-io.js';
const $=id=>document.getElementById(id);
function topStatus(message,kind='ok'){
  const node=$('status');node.textContent=String(message);node.dataset.kind=kind;
}
const build=__FRAME_BUILD_VERSION__;
// The displayed badge is immutable for this build. Keep seconds in the
// release identity for auto-update checks, but show year/month/day-hour/minute.
$('build-version').textContent=build.match(/(\d{8}-\d{4})\d{2}$/)?.[1]??build;
const io=createFrameSettingsIO();
function setSize(size){document.documentElement.style.setProperty('--ocr-frame-font-size',size+'px');
  document.documentElement.style.setProperty('--ocr-frame-scale',String(size/16));}
setSize(io.getInitialSize());
const frame=createFrameWorkspace($('workspace'),{onStatus:topStatus,onModuleChange:showModule});
let settings=null,loadingSettings=null,currentModule='frame';
async function getSettings(){
  if(settings)return settings;
  if(!loadingSettings)loadingSettings=(async()=>{
    const {createSettingsModule}=await import('../settings-module.js');
    const module=createSettingsModule($('settings-workspace'),topStatus,null,io);
    module.register({module:'F',key:'globalUi.font.family',category:['全局 UI','字体'],
      label:'字体 Sarasa（只读）',comment:'Sarasa Fixed SC；字体家族固定',
      type:'string',control:'readonly',defaultValue:'Sarasa',message:'settings.changed'});
    module.register({module:'F',key:'globalUi.font.size',category:['全局 UI','字体'],
      label:'字号',comment:'整个 Lab Frame 的字号，8–32 px',
      type:'number',control:'slider',defaultValue:16,min:8,max:32,step:1,
      unit:'px',message:'settings.changed'});
    module.subscribe({module:'F',key:'globalUi.font.size'},({value})=>setSize(value));
    await module.load();settings=module;mountSettingsNavigation();return module;
  })().catch(error=>{loadingSettings=null;throw error;});
  return loadingSettings;
}
function mountSettingsNavigation(){
  const source=$('settings-workspace').querySelector('.ocr-settings-source');
  if(!source||source.querySelector('.ocr-source-file-toolbar'))return;
  const bar=document.createElement('div');bar.className='ocr-source-file-toolbar';
  const select=document.createElement('select');select.className='ocr-source-file-select';
  select.setAttribute('aria-label','源码文件导航');
  select.add(new Option('空白工作台（未绑定文档）','frame'));
  select.add(new Option('全局设置 / settings.json','settings'));
  select.value='settings';
  select.addEventListener('change',()=>void showModule(select.value));
  bar.append(select);source.prepend(bar);
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
  }else{frame.activate();topStatus('空白四窗框架已就绪 · 可由源码导航进入 settings.json');}
}
$('global-save').addEventListener('click',async()=>{
  if(!settings){topStatus('当前无文档可保存；请打开 settings.json 修改设置');return;}
  if(!settings.hasUnsaved()){topStatus('当前没有待保存的全局设置');return;}
  try{const saved=await settings.save();topStatus(saved?'✓ 全局设置已保存':'● 保存期间设置有新修改',saved?'ok':'warning');}
  catch(error){topStatus('保存失败：'+error.message,'error');}
});
// Navigation lives inside each AG pane; the brand is a normal /labs/ link.
// No engineering dialog or dirty-state confirmation intercepts navigation.
startFrameAutoUpdate({version:build,report:topStatus});
showModule('frame');
// Reuse Main Settings / CM6 with frame-local IO. No beforeunload/dirty gate,
// SQL, media or source-document writer. No implicit per-slider save.
