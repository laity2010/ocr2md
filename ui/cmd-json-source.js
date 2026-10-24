/** CMD generic JSON text source: one CodeMirror 6 document and atomic I/O.
 * It knows syntax and transactions, never the meaning of a setting key.
 */
import {EditorView,basicSetup} from 'codemirror';
import {undo,redo,undoDepth,redoDepth} from '@codemirror/commands';
import {CMDocument} from './cm-document.js';
import {isIOSWebKit,nativeIOSBasicSetup} from './ios-native-selection.js';
import {json,jsonLanguage} from '@codemirror/lang-json';
import {HighlightStyle,syntaxHighlighting} from '@codemirror/language';
import {tags as t} from '@lezer/highlight';

const jsonEverforest=syntaxHighlighting(HighlightStyle.define([
  {tag:t.propertyName,color:'#83c092'},
  {tag:t.string,color:'#a7c080'},
  {tag:t.number,color:'#d699b6'},
  {tag:t.bool,color:'#d699b6'},
  {tag:t.null,color:'#e69875'},
  {tag:t.punctuation,color:'#9aa79d'},
]));

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
  const nativeSelection=isIOSWebKit();
  host.classList.toggle('ocr-ios-native-selection',nativeSelection);
  const cm=new CMDocument({parent:host,markdown:text,extensions:[
    nativeSelection?nativeIOSBasicSetup:basicSetup,EditorView.lineWrapping,json(),jsonEverforest,
    EditorView.updateListener.of(update=>{
      if(update.docChanged||update.selectionSet)onUpdate({text:update.state.doc.toString(),
        sourceOffset:update.state.selection.main.head,docChanged:update.docChanged});
    }),
  ]});
  savedDoc=cm.doc;
  const getText=()=>cm.getMarkdown();
  function readJSON(){return JSON.parse(getText());}
  function changeScalar(path,value){
    if(!Array.isArray(path)||path.length<1||path.some(part=>typeof part!=='string'||!part)||!['number','boolean','string'].includes(typeof value))
      throw Error('Invalid JSON scalar edit');
    // Full paths avoid ambiguity when independent modules expose the same
    // leaf key. Parsing/patching belongs to CMD, never to AG or Settings.
    const source=getText(),tree=jsonLanguage.parser.parse(source);
    let selected=null;
    function scan(node){
      if(selected)return;
      if(node.name==='Property' && JSON.stringify(pathOfProperty(node,source))===JSON.stringify(path)){
        selected=node;return;
      }
      for(let child=node.firstChild;child;child=child.nextSibling)scan(child);
    }
    scan(tree.topNode);
    const scalar=selected?.lastChild;
    if(!scalar||!['Number','String','True','False','Null'].includes(scalar.name))
      throw Error('JSON setting is not a scalar: '+path);
    const from=scalar.from,to=scalar.to,serialized=JSON.stringify(value);
    JSON.parse(source.slice(0,from)+serialized+source.slice(to));
    cm.replaceRanges([{from,to,expected:source.slice(from,to),insert:serialized}]);
  }
  /** CMD JSON syntax-aware key navigation. Never match a duplicated key via
   * string search: nested path identity comes from official Lezer JSON AST.
   */
  function pathOfProperty(node,source){
    const segments=[];
    for(let current=node;current;current=current.parent){
      if(current.name!=='Property')continue;
      const name=current.getChild('PropertyName');
      if(!name)return null;
      try{segments.unshift(JSON.parse(source.slice(name.from,name.to)));}
      catch{return null;}
    }
    return segments;
  }
  function propertyAt(offset){
    const text=getText(),tree=jsonLanguage.parser.parse(text);
    const position=Math.max(0,Math.min(offset,text.length));
    let node=tree.resolveInner(position,-1);
    for(;node;node=node.parent)if(node.name==='Property')
      return pathOfProperty(node,text);
    return null;
  }
  function keyAtOffset(offset){
    const path=propertyAt(offset);
    return path?.[0]==='settings' && typeof path[1]==='string' ?path[1]:null;
  }
  function revealKeyPath(key){
    const text=getText(),tree=jsonLanguage.parser.parse(text);
    let target=null;
    // Target a settings record in the JSON grammar, not other same-name keys.
    const expected=['settings',key];
    function scan(node){
      if(target)return;
      if(node.name==='Property'&&JSON.stringify(pathOfProperty(node,text))===JSON.stringify(expected)){
        target=node.getChild('PropertyName');return;
      }
      for(let child=node.firstChild;child;child=child.nextSibling)scan(child);
    }
    scan(tree.topNode);
    if(!target)return false;
    cm.view.dispatch({selection:{anchor:target.from,head:target.to},scrollIntoView:true});
    cm.view.focus();
    return true;
  }
  /** CMD owns the text transaction, the Settings module supplies a validated
   * migrated document. This never persists to disk until explicit Save. */
  function replaceDocument(nextText){
    if(typeof nextText!=='string')throw Error('CMD requires JSON text');
    JSON.parse(nextText);
    const old=getText();
    if(old===nextText)return false;
    cm.replaceRanges([{from:0,to:old.length,expected:old,insert:nextText}]);
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
  return Object.freeze({getText,readJSON,changeScalar,revealKeyPath,keyAtOffset,replaceDocument,save,isDirty,
    get history(){return {undo:undoDepth(cm.view.state),redo:redoDepth(cm.view.state)};},
    undo:()=>history(undo),redo:()=>history(redo),
    requestMeasure:()=>cm.requestMeasure(),destroy:()=>cm.destroy(),
  });
}
