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
// The displayed badge is immutable for this build. Keep seconds in the
// release identity for auto-update checks, but show year/month/day-hour/minute.
$('build-version').textContent=build.match(/(\d{8}-\d{4})\d{2}$/)?.[1]??build;
const frame=createFrameWorkspace($('workspace'),{onStatus:topStatus,onModuleChange:showModule});
let settings=null;
function showModule(name){
  const inSettings=name==='settings';
  $('workspace').hidden=inSettings;
  $('settings-workspace').hidden=!inSettings;
  if(inSettings){settings??=createEmptySettings($('settings-workspace'),{onModuleChange:showModule});settings.activate();}
  topStatus(inSettings?'全局设置组件已打开 · 无任何注册项或持久化数据':
    '空白四窗框架已就绪 · 不绑定文档、SQL 或媒体');
}
// Navigation lives inside each AG pane; the brand is a normal /labs/ link.
// No engineering dialog or dirty-state confirmation intercepts navigation.
startFrameAutoUpdate({version:build,report:topStatus});
showModule('frame');
// This page intentionally has no beforeunload, dirty check, localStorage, API calls,
// database, media or source-document writer. The version watcher can always reload.
