import './styles.css';
import './obsidian-everforest.css';
import {EditorView, basicSetup} from 'codemirror';
import {markdown, markdownLanguage} from '@codemirror/lang-markdown';
import {undo, redo, undoDepth, redoDepth} from '@codemirror/commands';
import {obsidianMarkdown} from './obsidian-markdown.js';
import {obsidianHeadingMarkers} from './obsidian-heading-markers.js';
import {outlineLineHighlight,markOutlineLine} from './outline-focus.js';
import {createWorkspace} from './workspace.js';
import {CMDocument} from './cm-document.js';
import {uploadPastedImage} from './media-module.js';
import {mineruCommentFolding,foldInitialMineruComments} from './mineru-comment-folding.js';
import {isIOSWebKit,nativeIOSBasicSetup} from './ios-native-selection.js';
import {countMarkers} from './chapter-markers.js';
import {buildChapterFiles} from './chapter-files.js';
import {documentChanged, selectionChanged, publishFocus, viewStore, setScrollSyncEnabled} from './view-store.js';

const $ = (id) => document.getElementById(id);
const buttons = {undo: $('undo'),redo:$('redo'),save:$('save')};
let view;
let cm;
let workspace;
// CM6 immutable document handle, not a shadow Markdown string.
let savedDoc = null;
let revision = 0;
let saving = false, exporting = false, initializing = false, afterUnlock = null;
let allowInitializeReload = false;
let canSave = import.meta.env.DEV ? true : null;
let pendingUpdate = false;
let checkingVersion = false;
// This is only a release identifier; CM6 remains the sole editor state.
const currentBuild = __V6_BUILD_VERSION__;
// One visible status channel beside the release badge. Former subbar, AG
// footer and page footer metadata all converge here without extra UI rows.
const documentLabel='Buffett’s Alpha.minerujson.md';
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
  if (!pendingUpdate) return;
  if (hasUnsavedEdits() || buttons.save.disabled || exporting || initializing ||
      $('unlock-dialog').open || $('engineering-dialog').open || $('initialize-dialog').open) {
    status('● 新版本待更新，请先保存','warning');
    return;
  }
  window.location.reload();
}
async function checkForNewBuild() {
  if (checkingVersion || !view || document.hidden) return;
  checkingVersion = true;
  try {
    const res = await fetch('/healthz', {cache:'no-store'});
    if (!res.ok) return;
    const {version} = await res.json();
    if (version && version !== currentBuild) {
      pendingUpdate = true;
      applyPendingUpdate();
    }
  } catch { /* Transient tunnel/network failures must not disturb the editor. */ }
  finally {checkingVersion = false;}
}
$('build-version').textContent = __V6_BUILD_VERSION__;

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
    const res = await fetch('/api/session', {cache:'no-store'});
    if (!res.ok) throw Error(`HTTP ${res.status}`);
    canSave = Boolean((await res.json()).canSave);
  } catch { canSave = null; } // A failed probe must not discard any local edits.
  return canSave;
}
function refreshToolbar() {
  buttons.undo.disabled = !undoDepth(view.state);
  buttons.redo.disabled = !redoDepth(view.state);
  if(documentLines!==view.state.doc.lines || documentChars!==view.state.doc.length){
    documentLines=view.state.doc.lines;
    documentChars=view.state.doc.length;
    renderGlobalStatus();
  }
  if (pendingUpdate) applyPendingUpdate();
  else if (hasUnsavedEdits()) status('● 未保存','warning');
  else renderGlobalStatus();
}
async function save() {
  if (!view) return false;
  if (canSave !== true) {
    status('🔒 保存需授权','warning');
    if (!$('unlock-dialog').open) showUnlock();
    return false;
  }
  const snapshotDoc = view.state.doc;
  const snapshot = snapshotDoc.toString();
  saving = true;
  buttons.save.disabled = true;
  status('正在保存');
  try {
    const res = await fetch('/api/document',{method:'PUT',headers:{'Content-Type':'text/plain; charset=utf-8'},body:snapshot});
    if (res.status === 403) {
      canSave = false;
      status('🔒 保存需授权', 'warning');
      showUnlock();
      return false;
    }
    if (!res.ok) throw Error(`HTTP ${res.status}: ${(await res.text()).slice(0,120)}`);
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
    const res=await fetch('/api/chapters',{cache:'no-store'});
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
    const res=await fetch('/api/export-chapters',{
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
    const res=await fetch('/api/initialize-document',{
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
  const response = await fetch('/api/document',{cache:'no-store'});
  if (!response.ok) throw Error('文档读取失败 '+response.status);
  const markdownText = await response.text();
  const unsubscribeGlobalStatus=viewStore.subscribe((next,previous)=>{
    if(next.outlineCount!==previous.outlineCount ||
       next.scrollSyncEnabled!==previous.scrollSyncEnabled)
      renderGlobalStatus();
  });
  workspace = createWorkspace($('workspace'), () => view?.state.doc.toString() || '', () => view, () => cm, (message,kind)=>{
    if(hasUnsavedEdits()&&kind!=='error')status('● 未保存 · '+message,'warning');
    else status(message,kind);
  });
  const nativeIOSSelection=isIOSWebKit();
  workspace.editorHost.classList.toggle('ocr-ios-native-selection',nativeIOSSelection);
  cm = new CMDocument({
    parent:workspace.editorHost, markdown:markdownText,
    convertMineruJson: async input=>{
      const raw=typeof input==='string'?input:JSON.stringify(input);
      const res=await fetch('/api/convert-mineru',{
        method:'POST',headers:{'Content-Type':'application/json'},body:raw,
      });
      if(!res.ok)throw Error(`MinerU conversion HTTP ${res.status}`);
      return res.text();
    },
    extensions:[
      nativeIOSSelection ? nativeIOSBasicSetup : basicSetup,
      EditorView.lineWrapping,
      // Only image clipboard items are handled here; native CM6 paste retains
      // full control of text and all other clipboard formats.
      EditorView.domEventHandlers.of({paste(event){
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
  // Toolbar controls use the live CM6 selection (also on iPad). They do not
  // reselect an AG heading or move the editor's scroll position.
  function quoteIndent(direction){
    try{
      const result=cm.adjustQuoteIndent(direction);
      if(result.changed)status(`✓ 已${direction>0?'增加':'减少'} ${result.changed} 行引用缩进`);
    }catch(error){status(error.message,'warning');}
  }
  for(const id of ['quote-indent','quote-outdent'])
    $(id).addEventListener('mousedown',event=>event.preventDefault());
  $('quote-indent').addEventListener('click',()=>quoteIndent(1));
  $('quote-outdent').addEventListener('click',()=>quoteIndent(-1));
  buttons.undo.addEventListener('click',()=>history(undo));
  buttons.redo.addEventListener('click',()=>history(redo));
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
  const showModule=()=>{
    const selected=$('module-select').value;
    for(const panel of document.querySelectorAll('.module-actions[data-module]'))
      panel.hidden=panel.dataset.module!==selected;
    workspace.setWorkModule(selected);
  };
  $('media-refresh').addEventListener('click',()=>void workspace.scanMedia());
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
    if(valid)workspace.setChapterStartNumber(raw);
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
      const res=await fetch('/api/unlock',{
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
      if(action==='export')await exportChapters();
      else if(action==='initialize')openInitializeDialog();
      else await save();
    } catch(error) {
      $('unlock-error').textContent='授权失败：'+error.message;
    }
  });
  window.addEventListener('beforeunload',event=>{
    if (hasUnsavedEdits()&&!allowInitializeReload) {event.preventDefault(); event.returnValue='';}
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
  // Git publication changes /healthz immediately; no extra store or WebSocket.
  setInterval(checkForNewBuild, 5000);
  document.addEventListener('visibilitychange',() => {
    if (!document.hidden) void checkForNewBuild();
  });
  void checkForNewBuild();
}
main().catch(error=>status('加载失败：'+(error?.message||String(error)),'error'));
