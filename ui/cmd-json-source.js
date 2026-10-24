/** CMD generic JSON text source: one CodeMirror 6 document and atomic I/O.
 * It knows syntax and transactions, never the meaning of a setting key.
 */
import {EditorView,basicSetup} from 'codemirror';
import {undo,redo,undoDepth,redoDepth} from '@codemirror/commands';
import {CMDocument} from './cm-document.js';

export async function readCMDJsonSnapshot(){
  const response=await fetch('/api/settings',{cache:'no-store'});
  if(!response.ok)throw Error('设置 JSON 读取失败 '+response.status);
  const text=await response.text();
  const etag=response.headers.get('ETag');
  if(!etag)throw Error('设置 JSON 缺少版本指纹');
  return {text,etag};
}

export async function openCMDJsonSource(host,onUpdate=()=>{}){
  const snapshot=await readCMDJsonSnapshot();
  const text=snapshot.text;
  let etag=snapshot.etag;
  let savedDoc=null;
  const cm=new CMDocument({parent:host,markdown:text,extensions:[
    basicSetup,EditorView.lineWrapping,
    EditorView.updateListener.of(update=>{
      if(update.docChanged||update.selectionSet)onUpdate({text:update.state.doc.toString(),
        sourceOffset:update.state.selection.main.head,docChanged:update.docChanged});
    }),
  ]});
  savedDoc=cm.doc;
  const getText=()=>cm.getMarkdown();
  function readJSON(){return JSON.parse(getText());}
  function changeScalar(key,value){
    // This port changes exactly one literal scalar and leaves unrelated JSON
    // bytes untouched; registered settings own key semantics and ranges.
    if(!/^[A-Za-z_$][\w$]*$/.test(key) || !['number','boolean','string'].includes(typeof value))
      throw Error('Invalid JSON scalar edit');
    const source=getText();
    const pattern=new RegExp('"'+key+'"\\s*:\\s*(-?(?:\\d+(?:\\.\\d+)?)|true|false|"(?:[^"\\\\]|\\\\.)*")','g');
    const matches=[...source.matchAll(pattern)];
    if(matches.length!==1)throw Error('Expected exactly one JSON key: '+key);
    const matched=matches[0],start=matched.index+matched[0].lastIndexOf(matched[1]);
    const serialized=JSON.stringify(value);
    const projected=source.slice(0,start)+serialized+source.slice(start+matched[1].length);
    JSON.parse(projected); // fail without changing the text
    cm.replaceRanges([{from:start,to:start+matched[1].length,expected:matched[1],insert:serialized}]);
  }
  function revealKey(key){
    const source=getText();
    const at=source.indexOf('"'+key+'"');
    if(at<0)return false;
    cm.view.dispatch({selection:{anchor:at},scrollIntoView:true});
    return true;
  }
  async function save(){
    // Save is an explicit CMD transaction; never a per-slider network request.
    const snapshot=cm.doc;
    const body=getText();
    const parsed=JSON.parse(body);
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error('JSON 根节点必须是对象');
    const result=await fetch('/api/settings',{method:'PUT',headers:{
      'Content-Type':'application/json; charset=utf-8','If-Match':etag,
    },body});
    if(!result.ok)throw Error('设置保存失败 HTTP '+result.status+': '+(await result.text()).slice(0,100));
    // Server returns the full document hash in the GET, not a rewritten JSON.
    // Calculate it on the client for subsequent optimistic updates.
    const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body)));
    etag=Array.from(hash,x=>x.toString(16).padStart(2,'0')).join('');
    savedDoc=snapshot;
    onUpdate({text:getText(),sourceOffset:cm.view.state.selection.main.head,docChanged:false});
    return !isDirty();
  }
  function history(fn){
    fn({state:cm.view.state,dispatch:tr=>cm.view.dispatch({changes:tr.changes,
      selection:tr.selection,effects:tr.effects,annotations:tr.annotations,filter:false})});
  }
  const isDirty=()=>!cm.doc.eq(savedDoc);
  return Object.freeze({getText,readJSON,changeScalar,revealKey,save,isDirty,
    get history(){return {undo:undoDepth(cm.view.state),redo:redoDepth(cm.view.state)};},
    undo:()=>history(undo),redo:()=>history(redo),
    requestMeasure:()=>cm.requestMeasure(),destroy:()=>cm.destroy(),
  });
}
