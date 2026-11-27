/** Existing preview pane, one read-only JSON document; exact download bytes. */
import {EditorState,StateEffect,StateField} from '@codemirror/state';
import {EditorView,Decoration,lineNumbers} from '@codemirror/view';
import {json} from '@codemirror/lang-json';
import {syntaxHighlighting} from '@codemirror/language';
import {oneDarkHighlightStyle} from '@codemirror/theme-one-dark';
import {TRANSLATION_JSON_FILENAME,indexJSONSentences} from './export-json.js';
import './json-preview.css';

export function mountJSONPreview(host){
  const replace=StateEffect.define(),focus=StateEffect.define();
  const focusField=StateField.define({
    create:()=>Decoration.none,
    update(value,tr){
      if(tr.docChanged)value=Decoration.none;
      for(const e of tr.effects)if(e.is(focus))value=e.value===null?Decoration.none:
        Decoration.set([Decoration.line({class:'translation-focus-json'}).range(tr.state.doc.line(e.value).from)]);
      return value;
    },provide:f=>EditorView.decorations.from(f)
  });
  let artifact=null,index=new Map();
  const editor=new EditorView({parent:host,state:EditorState.create({doc:'',extensions:[
    EditorState.readOnly.of(true),EditorView.editable.of(false),lineNumbers(),EditorView.lineWrapping,
    json(),syntaxHighlighting(oneDarkHighlightStyle,{fallback:true}),focusField,
    EditorView.contentAttributes.of({'aria-label':'待译句 JSON（只读）',spellcheck:'false'}),
    EditorState.transactionFilter.of(tr=>tr.docChanged&&!tr.effects.some(e=>e.is(replace))?[]:tr)
  ]})});
  function setArtifact(next){
    if(next===artifact)return;
    artifact=next;
    const text=next?.text??'';index=indexJSONSentences(text);
    if(text!==editor.state.doc.toString())editor.dispatch({changes:{from:0,to:editor.state.doc.length,insert:text},effects:[replace.of(null),focus.of(null)],selection:{anchor:0}});
  }
  function locate(row,{scroll=true}={}){
    const line=index.get(row?.key)??null;
    const pos=line===null?null:editor.state.doc.line(line).from;
    editor.dispatch({effects:[focus.of(line),...(pos!==null&&scroll?[EditorView.scrollIntoView(pos,{y:'center'})]:[])],
      ...(pos!==null&&scroll?{selection:{anchor:pos}}:{})});
  }
  function download(){
    if(!artifact||editor.state.doc.toString()!==artifact.text)throw Error('没有可导出的待译句 JSON');
    const url=URL.createObjectURL(new Blob([artifact.text],{type:'application/json;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download=TRANSLATION_JSON_FILENAME;
    document.body.append(a);
    try{a.click();}finally{a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
  }
  return Object.freeze({setArtifact,locate,download,layout:()=>editor.requestMeasure(),dispose:()=>editor.destroy()});
}
