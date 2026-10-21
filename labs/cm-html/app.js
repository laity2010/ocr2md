import '../../ui/styles.css';
import '../../ui/obsidian-everforest.css';
import './style.css';
import {basicSetup} from 'codemirror';
import {CMDocument} from './cm-document.js';
import {markdown,markdownLanguage} from '@codemirror/lang-markdown';
import {ensureSyntaxTree,syntaxTree} from '@codemirror/language';
import {undo,redo,undoDepth,redoDepth} from '@codemirror/commands';
import {obsidianMarkdown} from '../../ui/obsidian-markdown.js';
import {obsidianHeadingMarkers} from '../../ui/obsidian-heading-markers.js';
import {outlineLineHighlight,markOutlineLine} from '../../ui/outline-focus.js';
import {createWorkspace} from '../../ui/workspace.js';
import {viewStore,documentChanged,selectionChanged,publishFocus} from '../../ui/view-store.js';
import {countMarkers,markerForHeading,convertMarkers} from './metadata.js';
import {buildChapterFiles} from './chapters.js';

const BASE='/labs/cm-html/';
const api=BASE+'api/';
const $=id=>document.getElementById(id);
let workspace,view,cm,savedDocument=null,revision=0,canSave=false,lastMarkedId=null;
let message='正在加载隔离文档',kind='ok';
// Lab-only release polling. Never reload an edited CM6 document or an
// in-flight save: an unexpected refresh would silently destroy user work.
const CHECK_INTERVAL_MS=6000;
let pendingLabVersion=null,checkingVersion=false,reloading=false,saving=false;
let allowDiscardForUpdate=false,exporting=false,afterUnlock=null;
// Compare actual immutable CM6 Text content against its last saved version.
// Revision counters are not dirty flags: an undo can restore identical text.
const hasUnsavedEdits=()=>Boolean(view)&&Boolean(savedDocument)&&
  !view.state.doc.eq(savedDocument);
function applyAvailableRelease(){
  if(!pendingLabVersion||reloading||!view||hasUnsavedEdits()||saving||exporting||
     $('unlock-dialog').open||document.hidden)return;
  reloading=true;
  window.location.reload();
}
async function checkForUpdate(){
  if(checkingVersion||reloading)return;
  checkingVersion=true;
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),8000);
  try{
    const response=await fetch(BASE+'healthz',{cache:'no-store',signal:controller.signal});
    if(!response.ok)return;
    const data=await response.json();
    if(data.scope!==BASE||typeof data.version!=='string'||
       !data.version.startsWith('lab-cm-html-')||data.version===__LAB_VERSION__)return;
    pendingLabVersion=data.version;
    renderStatus();
    applyAvailableRelease();
  }catch{/* Offline/slow checks should never interrupt editing or block future checks. */}
  finally{clearTimeout(timeout);checkingVersion=false;}
}
function watchLabRelease(){
  setInterval(()=>{if(!document.hidden)void checkForUpdate();},CHECK_INTERVAL_MS);
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden)void checkForUpdate();
  });
  window.addEventListener('pageshow',()=>void checkForUpdate());
  void checkForUpdate();
}


$('build-version').textContent=__LAB_VERSION__;
function status(text,level='ok'){
  message=text;kind=level;
  renderStatus();
}
function renderStatus(){
  const updateButton=$('update-release');
  updateButton.hidden=!pendingLabVersion;
  if(pendingLabVersion){
    updateButton.textContent=hasUnsavedEdits()?'新版 · 待保存':'新版 · 更新';
    updateButton.title=`${pendingLabVersion}：${hasUnsavedEdits()?'有未保存修改，可保存后更新，或确认放弃修改':'立即加载新版本'}`;
  }
  const data=view?countMarkers(view.state.doc):{comment:0,tag:0};
  const notice=pendingLabVersion
    ? (hasUnsavedEdits()||saving||$('unlock-dialog').open
      ? '⚠ 新版已发布，先保存实验修改后自动更新'
      : '↻ 实验正在更新')
    : null;
  const parts=[...(notice?[notice]:[]),message,'独立实验文件'];
  if(view)parts.push(`${view.state.doc.lines.toLocaleString()}行`);
  parts.push(`注释${data.comment} / 标签${data.tag}`);
  parts.push('主线只读');
  const text=parts.join(' · ');
  $('status').textContent=text;
  $('status').title=text;
  $('status').dataset.kind=notice?'warning':kind;
}
function controls(){
  $('undo').disabled=!view||!undoDepth(view.state);
  $('redo').disabled=!view||!redoDepth(view.state);
  $('export-chapters').disabled=!view||exporting;
  if(hasUnsavedEdits())status('● 未保存实验标定','warning');
  else renderStatus();
  applyAvailableRelease();
}
function setParserReport(text){
  $('parse-report').textContent=text;
  $('parse-report').title=text;
}
function inspect(){
  if(!view||!workspace?.outlineGrid)return null;
  const rows=workspace.outlineGrid.rows;
  const selected=workspace.outlineGrid.api.getSelectedNodes()?.[0]?.data;
  const row=(selected&&markerForHeading(view.state.doc,selected)?selected:null)
    ||rows.find(item=>item.id===lastMarkedId&&markerForHeading(view.state.doc,item))
    ||rows.find(item=>markerForHeading(view.state.doc,item));
  if(!row){
    setParserReport('尚无标定：在 AG 表取消任一“独立章节”勾选');
    return null;
  }
  const marker=markerForHeading(view.state.doc,row);
  const tree=ensureSyntaxTree(view.state,marker.to+1,2000)||syntaxTree(view.state);
  const types=[];
  tree.iterate({from:marker.from,to:marker.to,
    enter(node){if(!types.includes(node.name))types.push(node.name);}});
  // Markdown's outer parser sees HTMLTag/CommentBlock; its mixed HTML
  // sub-parser distinguishes TagName, AttributeName and AttributeValue.
  // These are actual CM6/Lezer syntax nodes, not OCR2MD regex guesses.
  const source=view.state.doc.sliceString(marker.from,marker.to);
  const parts={};
  for(const [name,needle] of [
    ['element','ocr2md-chapter'],['id','data-id'],['independent','data-independent'],
  ]){
    const offset=source.indexOf(needle);
    if(offset>=0)parts[name]=tree.resolveInner(marker.from+offset+2,1).name;
  }
  const result={id:row.id,format:marker.format,independent:marker.independent,
    syntax:types,parts,line:marker.line};
  setParserReport(`${marker.format==='comment'?'HTML 注释':'HTML 标签'} · 第${marker.line}行 · ${[...types,...Object.values(parts)].join(' / ')}`);
  return result;
}
function onDocChange(update){
  if(update.docChanged){
    revision++;
    documentChanged();
  }
  if(update.selectionSet){
    const offset=update.state.selection.main.head;
    selectionChanged(offset);
    if(!update.docChanged){
      const line=update.state.doc.lineAt(offset);
      publishFocus({sourceLine:line.number,origin:'cm6'});
    }
  }
  if(update.docChanged||update.transactions.some(tx=>tx.selection))controls();
}
async function permission(){
  try {
    const response=await fetch(api+'session',{cache:'no-store'});
    if(!response.ok)throw Error('HTTP '+response.status);
    canSave=Boolean((await response.json()).canSave);
  }catch{canSave=false;}
  return canSave;
}
function openUnlock(){
  $('unlock-code').value='';
  $('unlock-error').textContent='';
  if(!$('unlock-dialog').open)$('unlock-dialog').showModal();
}
async function save(){
  if(!view)return false;
  if(!canSave){status('🔒 实验保存需要独立授权','warning');openUnlock();return false;}
  const snapshotDoc=view.state.doc;
  const snapshot=snapshotDoc.toString();
  saving=true;
  $('save').disabled=true;
  status('正在保存实验文档');
  try{
    const res=await fetch(api+'document',{
      method:'PUT',headers:{'Content-Type':'text/plain; charset=utf-8'},body:snapshot,
    });
    if(res.status===403){
      canSave=false;status('🔒 实验授权过期','warning');openUnlock();return false;
    }
    if(!res.ok)throw Error(`HTTP ${res.status}: ${(await res.text()).slice(0,120)}`);
    savedDocument=snapshotDoc;
    const clean=!hasUnsavedEdits();
    status(clean?'✓ 实验已保存':'● 保存期间有新修改',clean?'ok':'warning');
    return clean;
  }catch(error){status('实验保存失败：'+error.message,'error');return false;}
  finally{
    saving=false;
    $('save').disabled=false;
    applyAvailableRelease();
  }
}
async function sourceSha256(markdownText){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(markdownText));
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}
async function restoreExportMapping(){
  try{
    const res=await fetch(api+'chapters',{cache:'no-store'});
    if(!res.ok)return;
    const manifest=await res.json();
    if(manifest.sourceSha256!==await sourceSha256(view.state.doc.toString()))return;
    workspace.outlineGrid.setExported(view.state.doc,manifest.files.map(item=>item.name));
    status(`✓ 已找到 ${manifest.files.length} 份匹配当前文档的章节文件`);
  }catch{/* A missing or unreadable previous export must not block editing. */}
}
async function exportChapters(){
  if(!view||exporting)return;
  if(!canSave){
    afterUnlock='export';
    status('🔒 导出章节需要实验独立授权','warning');
    openUnlock();
    return;
  }
  exporting=true;
  $('export-chapters').disabled=true;
  try{
    if(hasUnsavedEdits()){
      if(!await save())throw Error('请先成功保存标定，才能导出章节');
    }
    const doc=view.state.doc;
    workspace.refreshOutline();
    const list=buildChapterFiles(doc.toString(),workspace.outlineGrid.rows);
    const sourceHash=await sourceSha256(doc.toString());
    status(`正在导出 ${list.length} 个章节到隔离目录`);
    const res=await fetch(api+'export-chapters',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({sourceSha256:sourceHash,files:list.map(file=>({name:file.name,content:file.content}))}),
    });
    if(res.status===403){canSave=false;throw Error('实验授权过期，请重新授权');}
    if(!res.ok)throw Error(`HTTP ${res.status}: ${(await res.text()).slice(0,160)}`);
    const manifest=await res.json();
    if(manifest.sourceSha256!==sourceHash||manifest.files?.length!==list.length)
      throw Error('服务器导出清单与当前源文档不匹配');
    workspace.outlineGrid.setExported(doc,manifest.files.map(file=>file.name));
    status(`✓ 已导出 ${list.length} 个章节 · 点击 AG「章节文件」可查看`);
  }catch(error){status('章节导出失败：'+error.message,'error');}
  finally{
    exporting=false;
    $('export-chapters').disabled=false;
    applyAvailableRelease();
  }
}
async function main(){
  const response=await fetch(api+'document',{cache:'no-store'});
  if(!response.ok)throw Error('实验文档读取失败 HTTP '+response.status);
  const markdownText=await response.text();
  workspace=createWorkspace($('workspace'),()=>view?.state.doc.toString()||'',()=>view);
  cm=new CMDocument({
    parent:workspace.editorHost,markdown:markdownText,
    convertMineruJson:async input=>{
      const raw=typeof input==='string'?input:JSON.stringify(input);
      const result=await fetch(api+'convert-mineru',{
        method:'POST',headers:{'Content-Type':'application/json'},body:raw,
      });
      if(!result.ok)throw Error(`MinerU conversion HTTP ${result.status}`);
      return result.text();
    },
    extensions:[
      basicSetup,EditorView.lineWrapping,markdown({base:markdownLanguage}),
      obsidianMarkdown,obsidianHeadingMarkers,outlineLineHighlight,
      EditorView.updateListener.of(onDocChange),
    ],
  });
  view=cm.view;
  savedDocument=view.state.doc;
  const initialMarkers=countMarkers(view.state.doc);
  if(initialMarkers.tag>0&&initialMarkers.comment===0)$('marker-format').value='tag';
  workspace.refreshPreview();
  workspace.refreshOutline();
  workspace.startScrollSync();
  const unsubFocus=viewStore.subscribe((next,prev)=>{
    if(next.focusTarget===prev.focusTarget||!next.focusTarget)return;
    view.dispatch({effects:markOutlineLine.of(next.focusTarget.sourceLine)});
  });
  document.addEventListener('cm-html:error',e=>status(e.detail||'标定失败','error'));
  document.addEventListener('cm-html:outline-refreshed',()=>renderStatus());
  function runHistory(command){
    const selectedId=workspace.outlineGrid?.api.getSelectedNodes()?.[0]?.id;
    if(command(view)&&selectedId){
      // Undo/redo may restore a different CM6 selection (often offset 0).
      // Rebuild the derived index once, then navigate using the stable ID,
      // not pre-edit line numbers or a second Markdown/state copy.
      workspace.refreshOutline();
      const row=workspace.outlineGrid.rows.find(item=>item.id===selectedId);
      if(row)publishFocus({sourceLine:row.sourceLine,sourceEnd:row.sourceEnd,
        origin:'outline',elementId:row.id});
    }
    controls();
  }
  $('undo').addEventListener('click',()=>runHistory(undo));
  $('redo').addEventListener('click',()=>runHistory(redo));
  $('save').addEventListener('click',save);
  $('export-chapters').addEventListener('click',exportChapters);
  $('update-release').addEventListener('click',()=>{
    if(!pendingLabVersion||reloading||saving)return;
    if(hasUnsavedEdits()){
      if(!window.confirm('当前实验有未保存的章节修改。放弃未保存修改并更新页面？'))return;
      allowDiscardForUpdate=true;
      reloading=true;
      window.location.reload();
    }else applyAvailableRelease();
  });
  $('marker-format').addEventListener('change',()=>{
    const mode=$('marker-format').value;
    const changed=convertMarkers(view,mode);
    setParserReport(`已切换为 ${mode==='comment'?'HTML 注释':'HTML 标签'} · 转换${changed}项`);
    if(!changed)status(`使用${mode==='comment'?'HTML 注释':'HTML 标签'}标定`);
  });
  $('inspect').addEventListener('click',inspect);
  $('unlock-cancel').addEventListener('click',()=>{
    afterUnlock=null;
    $('unlock-dialog').close();
  });
  $('unlock-form').addEventListener('submit',async event=>{
    event.preventDefault();
    const code=$('unlock-code').value.trim();
    $('unlock-error').textContent='';
    try {
      const res=await fetch(api+'unlock',{method:'POST',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({code})});
      if(res.status===403){
        $('unlock-error').textContent='实验专用授权码错误';
        return;
      }
      if(!res.ok)throw Error('HTTP '+res.status);
      canSave=true;
      $('unlock-code').value='';
      $('unlock-dialog').close();
      const action=afterUnlock;
      afterUnlock=null;
      if(action==='export')await exportChapters();
      else await save();
    }catch(error){$('unlock-error').textContent='授权失败：'+error.message;}
  });
  window.addEventListener('beforeunload',event=>{
    if(hasUnsavedEdits()&&!allowDiscardForUpdate){
      event.preventDefault();event.returnValue='';
    }
  });
  window.addEventListener('pagehide',()=>unsubFocus(),{once:true});
  await permission();
  controls();
  status(canSave?'✓ 实验已加载':'✓ 已加载 · 保存需实验授权',canSave?'ok':'warning');
  watchLabRelease();
  await restoreExportMapping();
  // Inspection seam; no second copy of Markdown or persistence authority.
  window.__cmHtmlLab={
    get view(){return view;},
    get cm(){return cm;},
    get outline(){return workspace?.outlineGrid;},
    get workspace(){return workspace;},
    get revision(){return revision;},
    inspect,save,checkForUpdate,exportChapters,
    get dirty(){return hasUnsavedEdits();},
    get pendingVersion(){return pendingLabVersion;},
    noteId(id){lastMarkedId=id;},
  };
}
main().catch(error=>status('实验初始化失败：'+(error.message||String(error)),'error'));
