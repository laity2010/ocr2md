import '../../ui/styles.css';
import '../../ui/obsidian-everforest.css';
import './style.css';
import {EditorView,basicSetup} from 'codemirror';
import {markdown,markdownLanguage} from '@codemirror/lang-markdown';
import {ensureSyntaxTree,syntaxTree} from '@codemirror/language';
import {undo,redo,undoDepth,redoDepth} from '@codemirror/commands';
import {obsidianMarkdown} from '../../ui/obsidian-markdown.js';
import {obsidianHeadingMarkers} from '../../ui/obsidian-heading-markers.js';
import {outlineLineHighlight,markOutlineLine} from '../../ui/outline-focus.js';
import {createWorkspace} from '../../ui/workspace.js';
import {viewStore,documentChanged,selectionChanged,publishFocus} from '../../ui/view-store.js';
import {countMarkers,markerForHeading,convertMarkers} from './metadata.js';

const BASE='/labs/cm-html/';
const api=BASE+'api/';
const $=id=>document.getElementById(id);
let workspace,view,revision=0,savedRevision=0,canSave=false,lastMarkedId=null;
let message='正在加载隔离文档',kind='ok';

$('build-version').textContent=__LAB_VERSION__;
function status(text,level='ok'){
  message=text;kind=level;
  renderStatus();
}
function renderStatus(){
  const data=view?countMarkers(view.state.doc):{comment:0,tag:0};
  const parts=[message,'独立实验文件'];
  if(view)parts.push(`${view.state.doc.lines.toLocaleString()}行`);
  parts.push(`注释${data.comment} / 标签${data.tag}`);
  parts.push('主线只读');
  const text=parts.join(' · ');
  $('status').textContent=text;
  $('status').title=text;
  $('status').dataset.kind=kind;
}
function controls(){
  $('undo').disabled=!view||!undoDepth(view.state);
  $('redo').disabled=!view||!redoDepth(view.state);
  if(revision!==savedRevision)status('● 未保存实验标定','warning');
  else renderStatus();
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
  if(!view)return;
  if(!canSave){status('🔒 实验保存需要独立授权','warning');openUnlock();return;}
  const snapshot=view.state.doc.toString(),atRevision=revision;
  $('save').disabled=true;
  status('正在保存实验文档');
  try{
    const res=await fetch(api+'document',{
      method:'PUT',headers:{'Content-Type':'text/plain; charset=utf-8'},body:snapshot,
    });
    if(res.status===403){
      canSave=false;status('🔒 实验授权过期','warning');openUnlock();return;
    }
    if(!res.ok)throw Error(`HTTP ${res.status}: ${(await res.text()).slice(0,120)}`);
    savedRevision=atRevision;
    status(atRevision===revision?'✓ 实验已保存':'● 保存期间有新修改',
      atRevision===revision?'ok':'warning');
  }catch(error){status('实验保存失败：'+error.message,'error');}
  finally{$('save').disabled=false;}
}
async function main(){
  const response=await fetch(api+'document',{cache:'no-store'});
  if(!response.ok)throw Error('实验文档读取失败 HTTP '+response.status);
  const markdownText=await response.text();
  workspace=createWorkspace($('workspace'),()=>view?.state.doc.toString()||'',()=>view);
  view=new EditorView({
    parent:workspace.editorHost,doc:markdownText,
    extensions:[
      basicSetup,EditorView.lineWrapping,markdown({base:markdownLanguage}),
      obsidianMarkdown,obsidianHeadingMarkers,outlineLineHighlight,
      EditorView.updateListener.of(onDocChange),
    ],
  });
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
  $('marker-format').addEventListener('change',()=>{
    const mode=$('marker-format').value;
    const changed=convertMarkers(view,mode);
    setParserReport(`已切换为 ${mode==='comment'?'HTML 注释':'HTML 标签'} · 转换${changed}项`);
    if(!changed)status(`使用${mode==='comment'?'HTML 注释':'HTML 标签'}标定`);
  });
  $('inspect').addEventListener('click',inspect);
  $('unlock-cancel').addEventListener('click',()=>$('unlock-dialog').close());
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
      await save();
    }catch(error){$('unlock-error').textContent='授权失败：'+error.message;}
  });
  window.addEventListener('beforeunload',event=>{
    if(revision!==savedRevision){event.preventDefault();event.returnValue='';}
  });
  window.addEventListener('pagehide',()=>unsubFocus(),{once:true});
  await permission();
  controls();
  status(canSave?'✓ 实验已加载':'✓ 已加载 · 保存需实验授权',canSave?'ok':'warning');
  // Inspection seam; no second copy of Markdown or persistence authority.
  window.__cmHtmlLab={
    get view(){return view;},
    get outline(){return workspace?.outlineGrid;},
    get workspace(){return workspace;},
    get revision(){return revision;},
    inspect,save,
    noteId(id){lastMarkedId=id;},
  };
}
main().catch(error=>status('实验初始化失败：'+(error.message||String(error)),'error'));
