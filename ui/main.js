import './styles.css';
import './obsidian-everforest.css';
import {EditorView, basicSetup} from 'codemirror';
import {markdown, markdownLanguage} from '@codemirror/lang-markdown';
import {ensureSyntaxTree} from '@codemirror/language';
import {undo, redo, undoDepth, redoDepth} from '@codemirror/commands';
import {obsidianMarkdown} from './obsidian-markdown.js';
import {obsidianHeadingMarkers} from './obsidian-heading-markers.js';
import {outlineLineHighlight,markOutlineLine} from './outline-focus.js';
import {createWorkspace} from './workspace.js';
import {documentChanged, selectionChanged, publishFocus, viewStore, setScrollSyncEnabled} from './view-store.js';

const $ = (id) => document.getElementById(id);
const buttons = {undo: $('undo'),redo:$('redo'),save:$('save'),extract:$('extract')};
let view;
let workspace;
// Only a save-revision marker, never a second copy of the Markdown document.
let savedRevision = 0;
let revision = 0;
let canSave = import.meta.env.DEV ? true : null;
let pendingUpdate = false;
let checkingVersion = false;
// This is only a release identifier; CM6 remains the sole editor state.
const currentBuild = __V6_BUILD_VERSION__;

function applyPendingUpdate() {
  if (!pendingUpdate) return;
  if (revision !== savedRevision || buttons.save.disabled || $('unlock-dialog').open) {
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
  $('status').textContent = text;
  $('status').dataset.kind = kind;
  $('status').title = text;
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
  $('count').textContent = view.state.doc.lines.toLocaleString() + ' 行 · ' + view.state.doc.length.toLocaleString() + ' 字符';
  if (pendingUpdate) applyPendingUpdate();
  else if (revision !== savedRevision) status('● 未保存','warning');
}
function extract() {
  const last = view.state.doc.length;
  const tree = ensureSyntaxTree(view.state,last,2500);
  if (!tree) { $('summary').textContent = '全文尚未解析完成，稍后重试。';return; }
  const count = {headings:0,images:0,tables:0,comments:0,formulas:0};
  tree.iterate({enter(node) {
    const type = node.type.name;
    if (/^ATXHeading\d|^SetextHeading/.test(type)) count.headings++;
    if (type === 'Image') count.images++;
    if (type === 'Table') count.tables++;
    if (type === 'HTMLBlock' || type === 'HTMLComment') count.comments++;
    if (type === 'FencedCode') {
      const code = view.state.doc.sliceString(node.from, Math.min(node.to,node.from+80));
      if (code.startsWith('```math')) count.formulas++;
    }
  }});
  $('summary').textContent = `CM6 全文语法树：标题 ${count.headings} · 图片 ${count.images} · GFM 表格 ${count.tables} · HTML 节点 ${count.comments} · math 代码块 ${count.formulas}`;
  return count;
}
async function save() {
  if (!view) return;
  if (canSave === false) { status('🔒 保存需授权','warning'); showUnlock(); return; }
  const snapshot = view.state.doc.toString(); // CM6 is the single source of document text
  const atRevision = revision;
  buttons.save.disabled = true;
  status('正在保存');
  try {
    const res = await fetch('/api/document',{method:'PUT',headers:{'Content-Type':'text/plain; charset=utf-8'},body:snapshot});
    if (res.status === 403) {
      canSave = false;
      status('🔒 保存需授权', 'warning');
      showUnlock();
      return;
    }
    if (!res.ok) throw Error(`HTTP ${res.status}: ${(await res.text()).slice(0,120)}`);
    savedRevision = atRevision;
    status(revision === atRevision ? '✓ 已保存' : '● 保存期间有新修改');
    if (pendingUpdate) applyPendingUpdate();
    // Deliberately no new EditorState, no view.dispatch, no reloading of document.
  } catch (error) {status('保存失败：'+error.message,'error');}
  finally {buttons.save.disabled = false;}
}

async function main() {
  const response = await fetch('/api/document',{cache:'no-store'});
  if (!response.ok) throw Error('文档读取失败 '+response.status);
  const markdownText = await response.text();
  workspace = createWorkspace($('workspace'), () => view?.state.doc.toString() || '', () => view);
  view = new EditorView({
    parent:workspace.editorHost, doc:markdownText,
    extensions:[
      basicSetup,
      EditorView.lineWrapping,
      markdown({base:markdownLanguage}),
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
  workspace.refreshPreview();
  workspace.refreshOutline();
  workspace.startScrollSync();
  const unsubscribeOutlineFocus=viewStore.subscribe((next,previous)=>{
    if(next.focusTarget===previous.focusTarget || !next.focusTarget)return;
    // Presentation effect only; never affects Markdown or undo history.
    view.dispatch({effects:markOutlineLine.of(next.focusTarget.sourceLine)});
  });
  const syncButton=$('sync-scroll');
  syncButton.addEventListener('click',()=>{
    const enabled=!viewStore.getState().scrollSyncEnabled;
    setScrollSyncEnabled(enabled);
    syncButton.setAttribute('aria-pressed',String(enabled));
    syncButton.title=enabled?'关闭同步滚动':'开启同步滚动';
  });
  buttons.undo.addEventListener('click',()=>{undo(view);refreshToolbar();view.focus();});
  buttons.redo.addEventListener('click',()=>{redo(view);refreshToolbar();view.focus();});
  buttons.extract.addEventListener('click',extract);
  buttons.save.addEventListener('click',save);
  $('unlock-cancel').addEventListener('click',()=>$('unlock-dialog').close());
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
      await save(); // Retry with the CURRENT CM6 document, not a second cached copy.
    } catch(error) {
      $('unlock-error').textContent='授权失败：'+error.message;
    }
  });
  window.addEventListener('beforeunload',event=>{
    if (revision !== savedRevision) {event.preventDefault(); event.returnValue='';}
  });
  window.addEventListener('pagehide',()=>unsubscribeOutlineFocus(),{once:true});
  refreshToolbar();
  status('✓ 已加载');
  if ((await checkPermission()) === false && revision === savedRevision) {
    status('🔒 保存需授权','warning');
  }
  // Read-only test seam for verifying *CM6 public APIs*, not an app document cache.
  if (import.meta.env.DEV) window.__v6cm6 = {
    get view(){return view;},
    get dockview(){return workspace?.dockview;},
    get scrollSync(){return workspace?.scrollSync;},
    get scrollState(){return viewStore.getState();},
    get outline(){return workspace?.outlineGrid;},
    extract,
  };
  // Opt-in, on-page font diagnostics so a real iPad screenshot can establish
  // font availability and measured glyph width without remote debugging.
  if (new URLSearchParams(location.search).has('fontcheck')) {
    void import('./fontcheck.js').then(({showFontCheck}) => showFontCheck());
  }
  // Git publication changes /healthz immediately; no extra store or WebSocket.
  setInterval(checkForNewBuild, 5000);
  document.addEventListener('visibilitychange',() => {
    if (!document.hidden) void checkForNewBuild();
  });
  void checkForNewBuild();
}
main().catch(error=>{status('加载失败');$('summary').textContent=error.stack||String(error);});
