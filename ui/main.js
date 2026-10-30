import {appPath} from './http-path.js';
import './styles.css';
import {createWCPRuntime} from './wcp-wcp-virtual-chapters.js';
import './obsidian-everforest.css';
import {EditorView, basicSetup} from 'codemirror';
import {markdown, markdownLanguage} from '@codemirror/lang-markdown';
import {syntaxHighlighting} from '@codemirror/language';
import {oneDarkHighlightStyle} from '@codemirror/theme-one-dark';
import {undo, redo, undoDepth, redoDepth} from '@codemirror/commands';
import {obsidianMarkdown} from './obsidian-markdown.js';
import {obsidianSourceSyntax} from './obsidian-source-syntax.js';
import {obsidianHeadingMarkers} from './obsidian-heading-markers.js';
import {outlineLineHighlight,markOutlineLine} from './outline-focus.js';
import {createWorkspace} from './workspace.js';
import {CMDocument} from './wcp-cm-document.js';
import {createSettingsModule} from './wcp-settings-module.js';
import {workspaceDirectoryPort} from './wcp-workspace-directory-port.js';
import {createSourceFileNavigation} from './wcp-source-file-navigation.js';
import {mountAgModuleToolbar} from './wcp-ag-module-toolbar.js';
import {registerCMSourceFontSetting} from './cm-font-setting.js';
import {registerOutlineTitleScaleSetting} from './wcp-chapter-outline.js';
import {uploadPastedImage} from './media-module.js';
import {mineruCommentFolding,foldInitialMineruComments} from './mineru-comment-folding.js';
import {isIOSWebKit,nativeIOSBasicSetup} from './ios-native-selection.js';
import {countMarkers} from './chapter-markers.js';
import {buildChapterFiles} from './wcp-chapter-files.js';
import {documentChanged, selectionChanged, publishFocus, viewStore, setScrollSyncEnabled} from './view-store.js';

const $ = (id) => document.getElementById(id);
const buttons = {undo: $('undo'),redo:$('redo'),save:$('save')};
let view;
let cm;
let cmdPort=null;
const wcpRuntime=createWCPRuntime();
let workspace;
let settings;
// CM6 immutable document handle, not a shadow Markdown string.
let savedDoc = null;
// Strong server revision from the exact document GET; not the edited CM6 text.
let documentETag = null;
let saveConflict = false;
let revision = 0;
let saving = false, exporting = false, initializing = false, afterUnlock = null;
let allowInitializeReload = false;
let canSave = import.meta.env.DEV ? true : null;
let pendingUpdate = false;
let releaseReloadRequested = false;
let checkingVersion = false;
// This is only a release identifier; CM6 remains the sole editor state.
const currentBuild = __V6_BUILD_VERSION__;
// One visible status channel beside the release badge. Former subbar, AG
// footer and page footer metadata all converge here without extra UI rows.
let documentLabel='Buffett’s Alpha.minerujson.md';
let statusMessage='正在加载';
let statusKind='ok';
let documentLines=null,documentChars=null;

function renderGlobalStatus() {
  const store=viewStore.getState();
  const segments=[statusMessage];
  if(documentLines!==null && documentChars!==null)
    segments.push(`${documentLines.toLocaleString()}行 / ${documentChars.toLocaleString()}字`);
  if(store.outlineCount!==null)
    segments.push(`大纲${store.outlineCount}项`);
  const markers=view?countMarkers(view.state.doc):{comment:0,tag:0};
  segments.push(`章节标定 注释${markers.comment}/标签${markers.tag}`);
  segments.push(store.scrollSyncEnabled?'⇅滚动同步':'⇅独立滚动');
  segments.push(documentLabel);
  const text=segments.join(' · ');
  const element=$('status');
  element.textContent=text;
  element.dataset.kind=statusKind;
  element.title=text;
}

const hasUnsavedEdits = () => Boolean(view && savedDoc && !view.state.doc.eq(savedDoc));
function applyPendingUpdate() {
  if (!pendingUpdate || releaseReloadRequested) return;
  // The server has a new bundle, but CM6 and Settings own unsaved buffers.
  // Never silently discard edits or an in-flight write on a release change.
  if (saving || exporting || initializing || buttons.save.disabled) return;
  if (hasUnsavedEdits() || settings?.hasUnsaved()) {
    status('● 新版本已上线 · 请先保存未保存内容，随后自动更新','warning');
    return;
  }
  if (document.querySelector('dialog[open]')) {
    status('● 新版本已上线 · 关闭当前对话框后自动更新','warning');
    return;
  }
  releaseReloadRequested = true;
  window.location.reload();
}
async function checkForNewBuild() {
  if (checkingVersion || releaseReloadRequested || !view || document.hidden) return;
  checkingVersion = true;
  try {
    // A stalled network fetch must not lock the poller forever on mobile.
    const res = await fetch(appPath('/healthz'), {
      cache:'no-store',signal:AbortSignal.timeout(7000),
    });
    if (!res.ok) return;
    const {version} = await res.json();
    if (version && version !== currentBuild) {
      pendingUpdate = true;
      applyPendingUpdate();
    }
  } catch { /* Transient tunnel/network failures must not disturb the editor. */ }
  finally {checkingVersion = false;}
}
// UI badge is intentionally short; release/healthz keeps its full immutable ID.
const compactBuildLabel=full=>{
  const match=/(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(?:\d{2})?$/.exec(full);
  if(!match)return full;
  const channel=full.startsWith('v6-lab-')?'lab':'main';
  return `${channel}-${match[1].slice(-2)}${match[2]}${match[3]}-${match[4]}${match[5]}`;
};
$('build-version').textContent=compactBuildLabel(currentBuild);
$('build-version').title=`${currentBuild} · 打开工程菜单`;

function status(text, kind='ok') {
  statusMessage=text;
  statusKind=kind;
  renderGlobalStatus();
}
function showUnlock() {
  $('unlock-error').textContent = '';
  $('unlock-code').value = '';
  if (!$('unlock-dialog').open) $('unlock-dialog').showModal();
  $('unlock-code').focus();
}
async function checkPermission() {
  if (import.meta.env.DEV) return true;
  try {
    const res = await fetch(appPath('/api/session'), {cache:'no-store'});
    if (!res.ok) throw Error(`HTTP ${res.status}`);
    canSave = Boolean((await res.json()).canSave);
  } catch { canSave = null; } // A failed probe must not discard any local edits.
  return canSave;
}
function refreshToolbar() {
  if ($('module-select').value==='settings' && settings) {
    buttons.undo.disabled=!settings.history.undo;
    buttons.redo.disabled=!settings.history.redo;
    if (pendingUpdate) applyPendingUpdate();
    return;
  }
  buttons.undo.disabled = !undoDepth(view.state);
  buttons.redo.disabled = !redoDepth(view.state);
  if(documentLines!==view.state.doc.lines || documentChars!==view.state.doc.length){
    documentLines=view.state.doc.lines;
    documentChars=view.state.doc.length;
    renderGlobalStatus();
  }
  if (pendingUpdate) applyPendingUpdate();
  else if (saveConflict && hasUnsavedEdits())
    status('⚠ 保存冲突：磁盘已有其他编辑，请保留本地修改并核对', 'error');
  else if (hasUnsavedEdits()) status('● 未保存','warning');
  else renderGlobalStatus();
}
async function save() {
  if ($('module-select').value==='settings'){
    if(!settings)return false;
    if(canSave!==true){afterUnlock='settings';status('🔒 保存需授权','warning');showUnlock();return false;}
    const rootChanged=settings.workspaceRootChanged;
    if(rootChanged&&hasUnsavedEdits()){
      status('请先保存 Markdown 未保存的编辑，再切换工作根目录','warning');
      return false;
    }
    buttons.save.disabled=true;
    try{
      const ok=await settings.save();
      if(ok&&rootChanged){
        status('✓ 工作目录已切换，正在重新加载文档');
        window.location.reload();
        return true;
      }
      status(ok?'✓ 全局设置已保存':'● 保存期间设置被继续修改',ok?'ok':'warning');
      return ok;
    }catch(error){status('设置保存失败：'+error.message,'error');return false;}
    finally{buttons.save.disabled=false;refreshToolbar();}
  }
  if (!view) return false;
  if (canSave !== true) {
    status('🔒 保存需授权','warning');
    if (!$('unlock-dialog').open) showUnlock();
    return false;
  }
  const snapshotDoc = view.state.doc;
  const snapshot = snapshotDoc.toString();
  const savingETag = documentETag;
  if (!savingETag) {
    status('⚠ 缺少磁盘版本标识，保留本地修改；请核对当前文档', 'error');
    return false;
  }
  saving = true;
  buttons.save.disabled = true;
  status('正在保存');
  try {
    const res = await fetch(appPath('/api/document'),{method:'PUT',headers:{
      'Content-Type':'text/plain; charset=utf-8','If-Match':savingETag},body:snapshot});
    if (res.status === 403) {
      canSave = false;
      status('🔒 保存需授权', 'warning');
      showUnlock();
      return false;
    }
    if (res.status===412 || res.status===428) {
      saveConflict = true;
      status('⚠ 保存冲突：服务器内容已变化；本地修改保留，不能直接覆盖', 'error');
      return false;
    }
    if (!res.ok) throw Error(`HTTP ${res.status}: ${(await res.text()).slice(0,120)}`);
    const nextETag=res.headers.get('ETag');
    if (!nextETag) throw Error('保存响应缺少 ETag；需人工核对服务器版本');
    documentETag = nextETag;
    saveConflict = false;
    savedDoc = snapshotDoc;
    status(!hasUnsavedEdits() ? '✓ 已保存' : '● 保存期间有新修改');
    if (pendingUpdate) applyPendingUpdate();
    // Deliberately no new EditorState, no view.dispatch, no reloading of document.
    return !hasUnsavedEdits();
  } catch (error) {status('保存失败：'+error.message,'error');return false;}
  finally {saving=false;buttons.save.disabled = false;applyPendingUpdate();}
}

async function sourceHash(source){
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source));
  return [...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('');
}
async function restoreExport(){
  try {
    const res=await fetch(appPath('/api/chapters'),{cache:'no-store'});
    if(!res.ok)return;
    const manifest=await res.json();
    if(manifest.sourceSha256!==await sourceHash(view.state.doc.toString()))return;
    const match=/^(\d{1,6})-/.exec(manifest.files?.[0]?.name||'');
    if(match&&match[1].length<=5&&Number(match[1])<=99999){
      // The filename records the exact original zero-padding width.
      workspace.setChapterStartNumber(match[1]);
      $('chapter-start-number').value=match[1];
    }
    workspace.setChaptersExported(view.state.doc,manifest.files.map(file=>file.name));
  }catch{ /* Missing previous export is ordinary. */ }
}
async function exportChapters(){
  if(!view||exporting)return;
  if(canSave!==true){
    afterUnlock='export';status('🔒 导出章节需要保存授权','warning');showUnlock();return;
  }
  exporting=true;
  $('export-chapters').disabled=true;
  try {
    if(hasUnsavedEdits() && !await save())throw Error('请先保存标定再导出章节');
    const doc=view.state.doc;
    workspace.refreshOutline();
    const {rows,startText}=workspace.getChapterState();
    const files=buildChapterFiles(doc.toString(),rows,startText);
    const hash=await sourceHash(doc.toString());
    status(`正在导出${files.length}个章节`);
    const res=await fetch(appPath('/api/export-chapters'),{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({sourceSha256:hash,
        files:files.map(file=>({name:file.name,content:file.content}))}),
    });
    if(res.status===403){canSave=false;throw Error('授权过期，请重新授权');}
    if(!res.ok)throw Error(`HTTP ${res.status}: ${(await res.text()).slice(0,140)}`);
    const manifest=await res.json();
    if(manifest.sourceSha256!==hash||manifest.files?.length!==files.length)
      throw Error('导出清单与当前文档不一致');
    if(!view.state.doc.eq(doc))throw Error('导出时文档发生变化，请重新导出');
    if(workspace.getChapterState().startText!==startText)
      throw Error('导出期间起始编号变化，请重新导出');
    workspace.setChaptersExported(doc,manifest.files.map(item=>item.name));
    status(`✓ 已导出${files.length}个章节 · AG文件名可点击`);
  }catch(error){status('导出失败：'+error.message,'error');}
  finally{exporting=false;$('export-chapters').disabled=false;applyPendingUpdate();}
}
function openInitializeDialog(){
  $('engineering-dialog').close();
  $('initialize-phrase').value='';
  $('initialize-error').textContent='';
  $('initialize-confirm').disabled=true;
  $('initialize-dialog').showModal();
  $('initialize-phrase').focus();
}
async function initializeDataDocument(){
  if(initializing || $('initialize-phrase').value.trim()!=='初始化')return;
  if(!view||!savedDoc)return;
  if(canSave!==true){
    $('initialize-dialog').close();
    afterUnlock='initialize';
    status('🔒 初始化需要编辑授权','warning');
    showUnlock();
    return;
  }
  initializing=true;
  $('initialize-confirm').disabled=true;
  $('initialize-cancel').disabled=true;
  $('initialize-error').textContent='正在备份并初始化，请勿关闭页面…';
  try{
    const expectedSha256=await sourceHash(savedDoc.toString());
    const res=await fetch(appPath('/api/initialize-document'),{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({confirmation:'初始化',expectedSha256}),
    });
    if(res.status===403){
      canSave=false;
      throw Error('授权已过期，请关闭窗口后重新授权');
    }
    if(res.status===409)throw Error('工作文档已被其他操作修改，请刷新页面后重试');
    if(!res.ok)throw Error(`HTTP ${res.status}: ${(await res.text()).slice(0,130)}`);
    const result=await res.json();
    if(result.initialized!==true)throw Error('服务器没有确认初始化成功');
    // Reload creates a new CM6 History. This is intentionally different from
    // an ordinary save and prevents undoing into pre-initialization data.
    allowInitializeReload=true;
    const url=new URL(window.location.href);
    url.searchParams.set('initialized',result.unchanged?'unchanged':'restored');
    window.location.assign(url.toString());
  }catch(error){
    $('initialize-error').textContent='初始化失败：'+error.message;
    status('初始化未完成：'+error.message,'error');
  }finally{
    initializing=false;
    $('initialize-cancel').disabled=false;
    $('initialize-confirm').disabled=$('initialize-phrase').value.trim()!=='初始化';
  }
}
async function main() {
  const response = await fetch(appPath('/api/document'),{cache:'no-store'});
  if (!response.ok) throw Error('文档读取失败 '+response.status);
  const firstETag=response.headers.get('ETag');
  if(!firstETag)throw Error('文档响应缺少版本 ETag，拒绝开启无保护保存');
  // Server is authoritative for the selected book's document identity.
  const rawLabel=response.headers.get('X-OCR2MD-Document-Name');
  if(rawLabel && /^[0-9a-f]+$/i.test(rawLabel)){
    try{
      const bytes=new Uint8Array(rawLabel.match(/.{2}/g).map(pair=>parseInt(pair,16)));
      documentLabel=new TextDecoder().decode(bytes);
    }catch{/* Default is only a label, never a file selector. */}
  }
  const markdownText = await response.text();
  documentETag=firstETag;
  const unsubscribeGlobalStatus=viewStore.subscribe((next,previous)=>{
    if(next.outlineCount!==previous.outlineCount ||
       next.scrollSyncEnabled!==previous.scrollSyncEnabled)
      renderGlobalStatus();
  });
  settings=createSettingsModule($('settings-workspace'),(message,kind)=>{
    if($('module-select').value==='settings')status(message,kind);
    refreshToolbar();
  },workspaceDirectoryPort);
  // Application composition root owns cross-module mounting; Settings may
  // not instantiate AG or the source-file navigator as hidden dependencies.
  // A narrow Shell-owned UI port: AG and navigation cannot locate or mutate
  // Shell module selectors, action groups or errors through global DOM IDs.
  const moduleSelector=$('module-select');
  const modulePort=Object.freeze({
    getModule:()=>moduleSelector.value,
    selectModule:next=>{
      if(moduleSelector.value===next)return;
      moduleSelector.value=next;
      moduleSelector.dispatchEvent(new Event('change',{bubbles:true}));
    },
    onModuleChange:handler=>moduleSelector.addEventListener('change',handler),
    hasModuleActions:()=>Boolean($('module-actions'))&&
      document.querySelectorAll('.module-actions[data-module]').length>=3,
    mountSelector:parent=>parent.append(moduleSelector),
    mountActionGroups:parent=>parent.append(...document.querySelectorAll('.module-actions[data-module]')),
    mountAgStatus:element=>$('status').after(element),
    hideSelector:()=>{moduleSelector.hidden=true;},
    labelSelector:label=>moduleSelector.setAttribute('aria-label',label),
    hideLegacyExport:()=>$('export-chapters')?.setAttribute('hidden',''),
    showActions:({selected,settings,chapter,virtualMode})=>{
      for(const actions of document.querySelectorAll('.module-actions[data-module]')){
        actions.hidden=settings||actions.dataset.module!==selected||
          (actions.dataset.module==='chapter-boundary' && (chapter||virtualMode));
      }
    },
  });
  const sourceNavigation=createSourceFileNavigation({modulePort,
    workbench:$('workspace'),settingsWorkbench:$('settings-workspace'),
    documentName:documentLabel,
    reportError:message=>$('status')?.setAttribute('data-file-switch-error',message)});
  mountAgModuleToolbar({modulePort,workspace:$('workspace')});
  registerCMSourceFontSetting(settings);
  workspace = createWorkspace($('workspace'), () => view?.state.doc.toString() || '', () => view, () => cmdPort??cm, (message,kind)=>{
    if(hasUnsavedEdits()&&kind!=='error')status('● 未保存 · '+message,'warning');
    else status(message,kind);
  },wcpRuntime,documentLabel);
  registerOutlineTitleScaleSetting(settings,value=>workspace.setOutlineTitleFontScale(value));
  const nativeIOSSelection=isIOSWebKit();
  workspace.editorHost.classList.toggle('ocr-ios-native-selection',nativeIOSSelection);
  cm = new CMDocument({
    parent:workspace.editorHost, markdown:markdownText,
    convertMineruJson: async input=>{
      const raw=typeof input==='string'?input:JSON.stringify(input);
      const res=await fetch(appPath('/api/convert-mineru'),{
        method:'POST',headers:{'Content-Type':'application/json'},body:raw,
      });
      if(!res.ok)throw Error(`MinerU conversion HTTP ${res.status}`);
      return res.text();
    },
    extensions:[
      ...wcpRuntime.editorExtensions,
      nativeIOSSelection ? nativeIOSBasicSetup : basicSetup,
      EditorView.lineWrapping,
      // Only image clipboard items are handled here; native CM6 paste retains
      // full control of text and all other clipboard formats.
      EditorView.domEventHandlers({paste(event){
        const item=[...(event.clipboardData?.items||[])].find(candidate=>
          candidate.kind==='file' && candidate.type.startsWith('image/'));
        if(!item)return false;
        event.preventDefault();
        const file=item.getAsFile();
        if(!file){status('剪贴板图片不可读取','error');return true;}
        if(canSave!==true){
          status('🔒 粘贴图片需要编辑授权','warning');
          showUnlock();
          return true;
        }
        const target=cm.capturePasteTarget();
        void (async()=>{
          try{
            status('正在将剪贴板图片写入 media/');
            const path=await uploadPastedImage(file);
            cm.pasteAt(target,`![](${path})`);
            status('✓ 已插入图片引用 · 请保存 Markdown');
            void workspace.scanMedia();
          }catch(error){status('粘贴图片失败：'+error.message,'error');}
        })();
        return true;
      }}),
      markdown({base:markdownLanguage}),
      mineruCommentFolding,
      obsidianMarkdown,
      // Keep Obsidian/Everforest the primary Markdown highlighter. One Dark
      // contributes its official token CSS only for the nested sTeX ranges.
      syntaxHighlighting(oneDarkHighlightStyle,{fallback:true}),
      obsidianSourceSyntax,
      obsidianHeadingMarkers,
      outlineLineHighlight,
      EditorView.updateListener.of(update=>{
        if (update.docChanged) {
          revision++;
          documentChanged();
        }
        if (update.selectionSet) {
          const offset=update.state.selection.main.head;
          selectionChanged(offset);
          // A deliberate cursor change locates the same element in both
          // read-only views. Typing must not steal reading scroll.
          if(!update.docChanged) {
            const line=update.state.doc.lineAt(offset);
            publishFocus({sourceLine:line.number,origin:'cm6'});
          }
        }
        if (update.docChanged || update.transactions.some(tx=>tx.selection)) refreshToolbar();
      })
    ]
  });
  view=cm.view;
  cmdPort=wcpRuntime.wrapCMD(cm);
  workspace.mountSourceLineMenu(view,{onInsert:(plan,kind='callout')=>{
    try{
      cmdPort.replaceRanges([{from:plan.from,to:plan.to,
        expected:plan.expected,insert:plan.insert}],plan.cursorAfter);
      view.focus();
      status(kind==='fence'?'✓ 已插入 Markdown 围栏块 · 请全局保存':
        '✓ 已在光标处插入 Callout · 请全局保存');
    }catch(error){status('源码插入失败：'+error.message,'error');}
  },onQuoteIndent:direction=>{
    try{
      const result=cm.adjustQuoteIndent(direction);
      if(result.changed)status(`✓ 已${direction>0?'增加':'减少'} ${result.changed} 行引用缩进`);
    }catch(error){status(error.message,'warning');}
  }});
  wcpRuntime.onCMReady({view,status});
  foldInitialMineruComments(view);
  view.contentDOM.addEventListener('click',()=>{
    const sourceLine=view.state.doc.lineAt(view.state.selection.main.head).number;
    publishFocus({sourceLine,origin:'cm6',intent:'click'});
  });
  savedDoc=view.state.doc;
  workspace.refreshPreview();
  workspace.refreshOutline();
  workspace.refreshPdf();
  workspace.startScrollSync();
  const unsubscribeOutlineFocus=viewStore.subscribe((next,previous)=>{
    if(next.focusTarget===previous.focusTarget || !next.focusTarget)return;
    // CM6 already highlights its own active line. Repainting that same line
    // after every tap can interfere with iOS double-tap word selection.
    if(next.focusTarget.origin==='cm6')return;
    // Cross-pane navigation still highlights its requested source line.
    view.dispatch({effects:markOutlineLine.of(next.focusTarget.sourceLine)});
  });
  function history(command){
    // Keep CM6's own history event (changes, selection, effects, annotations)
    // but do not force-scroll to its restored selection. AG edits can be made
    // while the caret remains at offset 0 although a later page is visible.
    // Native history's scrollIntoView:true would jump the source to page one.
    // The change listener rebuilds AG and preview; it must not navigate us to
    // the AG-selected heading either.
    command({state:view.state,dispatch:transaction=>view.dispatch({
      changes:transaction.changes,
      selection:transaction.selection,
      effects:transaction.effects,
      annotations:transaction.annotations,
      filter:false,
    })});
    refreshToolbar();
  }
  buttons.undo.addEventListener('click',()=> $('module-select').value==='settings'?settings?.undo():history(undo));
  buttons.redo.addEventListener('click',()=> $('module-select').value==='settings'?settings?.redo():history(redo));
  buttons.save.addEventListener('click',save);
  $('build-version').addEventListener('click',()=>{
    $('engineering-dialog').showModal();
  });
  $('engineering-close').addEventListener('click',()=>$('engineering-dialog').close());
  $('initialize-document').addEventListener('click',()=>{
    if(saving||exporting||initializing){status('当前有操作正在进行，请稍后重试','warning');return;}
    if(canSave!==true){
      $('engineering-dialog').close();
      afterUnlock='initialize';
      status('🔒 初始化需要编辑授权','warning');
      showUnlock();
      return;
    }
    openInitializeDialog();
  });
  $('initialize-cancel').addEventListener('click',()=>$('initialize-dialog').close());
  $('initialize-phrase').addEventListener('input',()=>{
    $('initialize-confirm').disabled=$('initialize-phrase').value.trim()!=='初始化';
  });
  $('initialize-form').addEventListener('submit',event=>{
    event.preventDefault();
    void initializeDataDocument();
  });

  $('export-chapters').addEventListener('click',exportChapters);
  // The selected module owns the command area. More modules can register
  // their own data-module container without changing the global toolbar.
  // Switching between two independent Dockview hosts must NOT reset their
  // shared AG/source/preview sashes. Transfer only ratios, never editor data.
  let lastVisibleModule='chapter-boundary';
  let sharedPaneRatios=null;
  const showModule=()=>{
    const selected=$('module-select').value;
    if(selected==='settings'&&lastVisibleModule!=='settings')
      sharedPaneRatios=workspace.getPaneRatios()||sharedPaneRatios;
    if(selected!=='settings'&&lastVisibleModule==='settings')
      sharedPaneRatios=settings.getPaneRatios()||sharedPaneRatios;
    for(const panel of document.querySelectorAll('.module-actions[data-module]'))
      panel.hidden=panel.dataset.module!==selected;
    const isSettings=selected==='settings';
    $('workspace').hidden=isSettings;
    $('settings-workspace').hidden=!isSettings;
    const previous=lastVisibleModule;
    lastVisibleModule=selected;
    if(isSettings){
      // Settings removes chapter-boundary marker editing permission even
      // though the existing AG pane is retained beneath the settings view.
      workspace.setWorkModule('settings');
      void settings.load().then(()=>{
        sourceNavigation.mountSettings();
        if($('module-select').value!=='settings')return;
        settings.activate();
        settings.applyPaneRatios(sharedPaneRatios);
        refreshToolbar();
      }).catch(error=>{
        // A transient settings transport error must never leave a blank app.
        if($('module-select').value==='settings'){
          $('module-select').value=previous==='settings'?'chapter-boundary':previous;
          showModule();
        }
        status('设置载入失败：'+error.message,'error');
      });
    }else{
      workspace.setWorkModule(selected);
      if(previous==='settings'){
        // Re-showing a hidden Dockview can enqueue an additional ResizeObserver
        // layout in the following frame. Restore after both layout passes.
        const restore=()=>{
          if($('module-select').value===selected)workspace.applyPaneRatios(sharedPaneRatios);
        };
        requestAnimationFrame(()=>{restore();requestAnimationFrame(restore);});
      }
    }
    refreshToolbar();
  };
  $('media-refresh').addEventListener('click',()=>void workspace.scanMedia());
  $('latex-refresh').addEventListener('click',()=>workspace.scanLatex());
  $('latex-normalize').addEventListener('click',()=>workspace.normalizeLatex());
  $('note-templates').addEventListener('click',()=>workspace.openNoteTemplates());
  $('note-convert-all').addEventListener('click',()=>workspace.convertAllNotes());
  $('html-normalize-tables').addEventListener('click',()=>workspace.normalizeHtmlTables());
  $('media-download-all').addEventListener('click',async()=>{
    const button=$('media-download-all');button.disabled=true;
    try{await workspace.downloadMedia();}
    finally{button.disabled=false;}
  });
  $('module-select').addEventListener('change',showModule);
  showModule();
  const numberInput=$('chapter-start-number');
  numberInput.addEventListener('input',()=>{
    const raw=numberInput.value;
    const valid=/^\d{1,5}$/.test(raw);
    numberInput.setAttribute('aria-invalid',String(!valid));
    if(valid){
      workspace.setChapterStartNumber(raw);
      sourceNavigation.refreshChapters();
    }
  });
  numberInput.addEventListener('blur',()=>{
    numberInput.value=workspace.getChapterState().startText;
    numberInput.setAttribute('aria-invalid','false');
  });
  document.addEventListener('ocr2md:chapter-error',e=>status(e.detail||'标定失败','error'));
  $('unlock-cancel').addEventListener('click',()=>{afterUnlock=null;$('unlock-dialog').close();});
  $('unlock-form').addEventListener('submit',async event=>{
    event.preventDefault();
    $('unlock-error').textContent='';
    const code=$('unlock-code').value.trim().replace(/[\u200b-\u200d\ufeff]/gi,'');
    try {
      const res=await fetch(appPath('/api/unlock'),{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({code})
      });
      if (res.status === 403) {
        // The server rejects both invalid codes and invalid origins with 403.
        // Keep those errors distinct instead of blaming the user's code.
        const reason = await res.text();
        if (reason.includes('Invalid origin')) {
          $('unlock-error').textContent='访问地址校验失败，请使用 https://ocr2md.laity.bid/ 重新进入';
        } else if (reason.includes('Invalid code')) {
          $('unlock-error').textContent=`授权码不匹配（当前输入 ${code.length} 位，应为 12 位）；请重新复制授权码`;
        } else {
          $('unlock-error').textContent='授权请求被拒绝（HTTP 403），请确认访问地址';
        }
        return;
      }
      if (!res.ok) throw Error(`HTTP ${res.status}: ${(await res.text()).slice(0,120)}`);
      canSave = true;
      $('unlock-code').value='';
      $('unlock-dialog').close();
      const action=afterUnlock;afterUnlock=null;
      if(action==='settings')await save();
      else if(action==='export')await exportChapters();
      else if(action==='initialize')openInitializeDialog();
      else await save();
    } catch(error) {
      $('unlock-error').textContent='授权失败：'+error.message;
    }
  });
  window.addEventListener('beforeunload',event=>{
    if ((hasUnsavedEdits()||settings?.hasUnsaved())&&!allowInitializeReload) {event.preventDefault(); event.returnValue='';}
  });
  window.addEventListener('pagehide',()=>{
    unsubscribeOutlineFocus();
    unsubscribeGlobalStatus();
  },{once:true});
  refreshToolbar();
  status('✓ 已加载');
  const initialized=new URLSearchParams(location.search).get('initialized');
  if(initialized==='unchanged'||initialized==='restored'){
    status(initialized==='restored'
      ?'✓ 数据文档已初始化 · 旧存盘文档已备份'
      :'✓ 数据文档已是原始状态，无须更改');
    const cleanUrl=new URL(location.href);
    cleanUrl.searchParams.delete('initialized');
    window.history.replaceState(null,'',cleanUrl.pathname+cleanUrl.search+cleanUrl.hash);
  }
  if ((await checkPermission()) === false && !hasUnsavedEdits()) {
    status('🔒 保存需授权','warning');
  }
  // A module may have become active while the async document fetch and
  // authorization check were still running. The generic 'loaded' status above
  // can otherwise overwrite its initial report (Muse Linux 38ea47d). Refresh
  // through Workspace's public semantic API, never via LaTeX internals.
  if ($('module-select').value === 'latex') workspace.scanLatex();
  // Read-only test seam for verifying *CM6 public APIs*, not an app document cache.
  if (import.meta.env.DEV) window.__v6cm6 = {
    get view(){return view;},
    get cm(){return cm;},
    exportChapters,save,
    get dirty(){return hasUnsavedEdits();},
    get dockview(){return workspace?.debug?.dockview;},
    get scrollSync(){return workspace?.debug?.scrollSync;},
    get scrollState(){return viewStore.getState();},
    get outline(){return workspace?.debug?.outline;},
    get settings(){return settings?.debug;},
    get pdf(){return workspace?.debug?.pdf;},
    // Regression seam for the existing scroll coordinator; no fourth button.
    setScrollSyncEnabled,
  };
  // Opt-in, on-page font diagnostics so a real iPad screenshot can establish
  // font availability and measured glyph width without remote debugging.
  if (new URLSearchParams(location.search).has('fontcheck')) {
    void import('./fontcheck.js').then(({showFontCheck}) => showFontCheck());
  }
  await restoreExport();
  // Load the compact global JSON in parallel with the PDF/document UI.
  // Settings can stay hidden; it will still apply registered CM font defaults.
  void settings.initialize();
  // Git publication changes /healthz immediately; no extra store or WebSocket.
  setInterval(checkForNewBuild, 5000);
  document.addEventListener('visibilitychange',() => {
    if (!document.hidden) void checkForNewBuild();
  });
  // Safari can freeze/restore a page without changing document.hidden.
  window.addEventListener('pageshow',()=>void checkForNewBuild());
  window.addEventListener('focus',()=>void checkForNewBuild());
  window.addEventListener('online',()=>void checkForNewBuild());
  // If a save was blocked by an open dialog, resume after it is closed.
  document.addEventListener('close',()=>applyPendingUpdate(),true);
  void checkForNewBuild();
}
main().catch(error=>status('加载失败：'+(error?.message||String(error)),'error'));
