/** Lab-frame composition root: no CMD, SQLite, document, media or settings backend. */
import '../styles.css';
import '../obsidian-everforest.css';
import './frame.css';
import {createFrameWorkspace,createEmptySettings} from './layout.js';
import {startFrameAutoUpdate} from './refresh.js';
const $=id=>document.getElementById(id);
function topStatus(message,kind='ok'){
  const node=$('status');node.textContent=String(message);node.dataset.kind=kind;
}
const build=__FRAME_BUILD_VERSION__;
$('build-version').textContent=build;
const frame=createFrameWorkspace($('workspace'),{onStatus:topStatus});
let settings=null;
function showModule(name){
  const inSettings=name==='settings';
  $('workspace').hidden=inSettings;
  $('settings-workspace').hidden=!inSettings;
  if(inSettings){settings??=createEmptySettings($('settings-workspace'));settings.activate();}
  topStatus(inSettings?'全局设置组件已打开 · 无任何注册项或持久化数据':
    '空白四窗框架已就绪 · 不绑定文档、SQL 或媒体');
}
$('module-select').addEventListener('change',event=>showModule(event.target.value));
$('engineering-version').textContent=`版本：${build} · SHA：${__FRAME_SOURCE_COMMIT__.slice(0,12)}`;
$('build-version').addEventListener('click',()=>$('engineering-dialog').showModal());
$('engineering-close').addEventListener('click',()=>$('engineering-dialog').close());
const updater=startFrameAutoUpdate({version:build,report:topStatus});
$('check-update').addEventListener('click',async()=>{
  topStatus('正在检查更新…');
  const updated=await updater.check();
  if(!updated)topStatus('当前已是最新发布版本');
});
showModule('frame');
// This page intentionally has no beforeunload, dirty check, localStorage, API calls,
// database, media or source-document writer. The version watcher can always reload.
