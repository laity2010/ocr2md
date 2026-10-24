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
    if(typeof path!=='string'||!path||!['number','boolean','string'].includes(typeof value))
      throw Error('Invalid JSON scalar edit');
    // Full paths avoid ambiguity when independent modules expose the same
    // leaf key. Parsing/patching belongs to CMD, never to AG or Settings.
    const source=getText(),tree=jsonLanguage.parser.parse(source);
    let selected=null;
    function scan(node){
      if(selected)return;
      if(node.name==='Property' && pathOfProperty(node,source)?.join('.')===path){
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
    return path?.length ? (path[0]==='$comments'?path[1]||null:path.join('.')) : null;
  }
  function revealKeyPath(key){
    const text=getText(),tree=jsonLanguage.parser.parse(text);
    let target=null;
    // Walk the JSON grammar, not a regex that may find a comment or a value.
    function scan(node){
      if(target)return;
      if(node.name==='Property'&&pathOfProperty(node,text)?.join('.')===key){
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
  /** Inject missing per-key comments as a standard-JSON metadata map; CMD
   * handles document edits only, callers own comment semantics. Existing
   * user-authored comments are never overridden. */
  function ensureKeyComments(defaults){
    if(!defaults||typeof defaults!=='object'||Array.isArray(defaults))throw Error('Invalid key comments');
    const source=getText(),data=JSON.parse(source);
    if(!data||typeof data!=='object'||Array.isArray(data))throw Error('JSON root must be an object');
    const prior=data.$comments;
    if(prior!==undefined&&(!prior||typeof prior!=='object'||Array.isArray(prior)))
      throw Error('$comments must be a JSON object');
    const merged={...(prior||{})};let changed=false;
    for(const [key,comment]of Object.entries(defaults)){
      if(typeof key!=='string'||typeof comment!=='string')throw Error('Invalid comment entry');
      if(!Object.hasOwn(merged,key)){merged[key]=comment;changed=true;}
    }
    if(!changed)return false;
    if(prior===undefined){
      const opening=source.indexOf('{');
      const hasKeys=Object.keys(data).length>0;
      cm.replaceRanges([{from:opening+1,to:opening+1,expected:'',
        insert:'\n  "$comments": '+JSON.stringify(merged,null,2).replace(/\n/g,'\n  ')+
          (hasKeys?',':'')+'\n'}]);
    }else{
      let prop=null;
      const tree=jsonLanguage.parser.parse(source);
      for(let node=tree.topNode.firstChild;node;node=node.nextSibling){
        if(node.name!=='Object')continue;
        for(let child=node.firstChild;child;child=child.nextSibling){
          if(child.name==='Property'&&pathOfProperty(child,source)?.join('.')==='$comments'){
            prop=child;break;
          }
        }
      }
      if(!prop)throw Error('Cannot locate $comments in JSON source');
      const value=prop.getChild('Object');
      if(!value)throw Error('$comments must be an object');
      cm.replaceRanges([{from:value.from,to:value.to,expected:source.slice(value.from,value.to),insert:JSON.stringify(merged,null,2)}]);
    }
    JSON.parse(getText());
    return true;
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
  return Object.freeze({getText,readJSON,changeScalar,revealKeyPath,keyAtOffset,ensureKeyComments,save,isDirty,
    get history(){return {undo:undoDepth(cm.view.state),redo:redoDepth(cm.view.state)};},
    undo:()=>history(undo),redo:()=>history(redo),
    requestMeasure:()=>cm.requestMeasure(),destroy:()=>cm.destroy(),
  });
}
