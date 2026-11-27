/** Existing preview pane, one read-only JSON document; exact download bytes. */
import {EditorState,StateEffect} from '@codemirror/state';
import {EditorView,lineNumbers} from '@codemirror/view';
import {json} from '@codemirror/lang-json';
import {syntaxHighlighting} from '@codemirror/language';
import {oneDarkHighlightStyle} from '@codemirror/theme-one-dark';
import {TRANSLATION_JSON_FILENAME} from './export-json.js';
import './json-preview.css';

export function mountJSONPreview(host){
  const replace=StateEffect.define();
  let artifact=null;
  const editor=new EditorView({parent:host,state:EditorState.create({doc:'',extensions:[
    EditorState.readOnly.of(true),EditorView.editable.of(false),lineNumbers(),EditorView.lineWrapping,
    json(),syntaxHighlighting(oneDarkHighlightStyle,{fallback:true}),
    EditorView.contentAttributes.of({'aria-label':'待译句 JSON（只读）',spellcheck:'false'}),
    EditorState.transactionFilter.of(tr=>tr.docChanged&&!tr.effects.some(e=>e.is(replace))?[]:tr)
  ]})});
  function setArtifact(next){
    if(next===artifact)return;
    artifact=next;
    const text=next?.text??'';
    if(text!==editor.state.doc.toString())editor.dispatch({changes:{from:0,to:editor.state.doc.length,insert:text},effects:[replace.of(null)],selection:{anchor:0}});
  }
  function download(){
    if(!artifact||editor.state.doc.toString()!==artifact.text)throw Error('没有可导出的待译句 JSON');
    const url=URL.createObjectURL(new Blob([artifact.text],{type:'application/json;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download=TRANSLATION_JSON_FILENAME;
    document.body.append(a);
    try{a.click();}finally{a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
  }
  return Object.freeze({setArtifact,download,layout:()=>editor.requestMeasure(),dispose:()=>editor.destroy()});
}
