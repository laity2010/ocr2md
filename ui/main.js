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
import {CMDocument} from './cm-document.js';
import {countMarkers,markerForHeading,convertMarkers} from './chapter-markers.js';
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
let lastMarkedId = null;
let saving = false, exporting = false, afterUnlock = null;
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
  if (hasUnsavedEdits() || buttons.save.disabled || exporting || $('unlock-dialog').open) {
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
function extract() {
  const last = view.state.doc.length;
  const tree = ensureSyntaxTree(view.state,last,2500);
  if (!tree) { status('全文尚未解析完成，稍后重试','warning');return; }
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
  status(`CM6 结构：标题${count.headings} · 图片${count.images} · 表格${count.tables} · HTML${count.comments} · 数学${count.formulas}`);
  return count;
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
    workspace.outlineGrid.setExported(view.state.doc,manifest.files.map(file=>file.name));
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
    const files=buildChapterFiles(doc.toString(),workspace.outlineGrid.rows);
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
    workspace.outlineGrid.setExported(doc,manifest.files.map(item=>item.name));
    status(`✓ 已导出${files.length}个章节 · AG文件名可点击`);
  }catch(error){status('导出失败：'+error.message,'error');}
  finally{exporting=false;$('export-chapters').disabled=false;applyPendingUpdate();}
}
function inspectChapter(){
  const rows=workspace?.outlineGrid?.rows||[];
  const selected=workspace?.outlineGrid?.api.getSelectedNodes()?.[0]?.data;
  const row=(selected&&markerForHeading(view.state.doc,selected)?selected:null)
    ||rows.find(x=>x.id===lastMarkedId&&markerForHeading(view.state.doc,x))
    ||rows.find(x=>markerForHeading(view.state.doc,x));
  if(!row){$('parse-report').textContent='当前没有章节 HTML 标定';return null;}
  const marker=markerForHeading(view.state.doc,row);
  const result=cm.readHtml(marker.line);
  $('parse-report').textContent=`${marker.format==='comment'?'HTML 注释':'HTML 标签'} · 行${marker.line} · ${result.syntax.join(' / ')}`;
  return result;
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
  workspace = createWorkspace($('workspace'), () => view?.state.doc.toString() || '', () => view);
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
  view=cm.view;
  savedDoc=view.state.doc;
  const initialMarkers=countMarkers(view.state.doc);
  if(initialMarkers.tag>0&&initialMarkers.comment===0)$('marker-format').value='tag';
  workspace.refreshPreview();
  workspace.refreshOutline();
  workspace.startScrollSync();
  const unsubscribeOutlineFocus=viewStore.subscribe((next,previous)=>{
    if(next.focusTarget===previous.focusTarget || !next.focusTarget)return;
    // Presentation effect only; never affects Markdown or undo history.
    view.dispatch({effects:markOutlineLine.of(next.focusTarget.sourceLine)});
  });
  function history(command){
    const selectedId=workspace.outlineGrid?.api.getSelectedNodes()?.[0]?.id;
    if(command(view)&&selectedId){
      workspace.refreshOutline();
      const row=workspace.outlineGrid.rows.find(x=>x.id===selectedId);
      if(row)publishFocus({sourceLine:row.sourceLine,sourceEnd:row.sourceEnd,
        origin:'outline',elementId:row.id});
    }
    refreshToolbar();
  }
  buttons.undo.addEventListener('click',()=>history(undo));
  buttons.redo.addEventListener('click',()=>history(redo));
  buttons.save.addEventListener('click',save);
  $('export-chapters').addEventListener('click',exportChapters);
  $('marker-format').addEventListener('change',()=>{
    const mode=$('marker-format').value;
    const n=convertMarkers(view,mode);
    $('parse-report').textContent=`${mode==='comment'?'HTML 注释':'HTML 标签'} · 转换${n}项`;
  });
  $('inspect').addEventListener('click',inspectChapter);
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
      else await save();
    } catch(error) {
      $('unlock-error').textContent='授权失败：'+error.message;
    }
  });
  window.addEventListener('beforeunload',event=>{
    if (hasUnsavedEdits()) {event.preventDefault(); event.returnValue='';}
  });
  window.addEventListener('pagehide',()=>{
    unsubscribeOutlineFocus();
    unsubscribeGlobalStatus();
  },{once:true});
  refreshToolbar();
  status('✓ 已加载');
  if ((await checkPermission()) === false && !hasUnsavedEdits()) {
    status('🔒 保存需授权','warning');
  }
  // Read-only test seam for verifying *CM6 public APIs*, not an app document cache.
  if (import.meta.env.DEV) window.__v6cm6 = {
    get view(){return view;},
    get cm(){return cm;},
    exportChapters,save,inspectChapter,
    get dirty(){return hasUnsavedEdits();},
    get dockview(){return workspace?.dockview;},
    get scrollSync(){return workspace?.scrollSync;},
    get scrollState(){return viewStore.getState();},
    get outline(){return workspace?.outlineGrid;},
    // Regression seam for the existing scroll coordinator; no fourth button.
    setScrollSyncEnabled,
    extract,
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
