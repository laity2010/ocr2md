/** One independent CM6 Prompt document; no original-source or SQL writer. */
import {EditorState,Annotation,Transaction} from '@codemirror/state';
import {EditorView,lineNumbers,keymap} from '@codemirror/view';
import {history,historyKeymap,defaultKeymap,undo,redo,undoDepth,redoDepth} from '@codemirror/commands';
import {markdown,markdownLanguage} from '@codemirror/lang-markdown';
import {syntaxHighlighting} from '@codemirror/language';
import {oneDarkHighlightStyle} from '@codemirror/theme-one-dark';
import {obsidianSourceSyntax} from '../obsidian-source-syntax.js';
import {obsidianHeadingMarkers} from '../obsidian-heading-markers.js';
import {obsidianMarkdown} from '../obsidian-markdown.js';
import {createPromptStorage,DEFAULT_PROMPT,createPromptParameters} from './prompt-document.js';
import './prompt-editor.css';

export function mountPromptEditor(host,{onChange=()=>{},onStatus=()=>{},storage,artifact=null,workspace=''}={}){
  let port,baseline,loadError=null;
  try{port=createPromptStorage(storage??localStorage);baseline=port.read();}
  catch(error){loadError=error;baseline={stored:null,text:DEFAULT_PROMPT};}
  const generated=Annotation.define();
  let suffix=createPromptParameters(artifact,workspace),editor;
  const fullText=()=>editor.state.doc.toString();
  const text=()=>fullText().slice(0,editor.state.doc.length-suffix.length);
  const state=()=>({dirty:text()!==baseline.text,undo:undoDepth(editor.state),redo:redoDepth(editor.state)});
  const notify=()=>onChange(state());
  editor=new EditorView({parent:host,state:EditorState.create({doc:baseline.text+suffix,extensions:[
    history(),keymap.of([...historyKeymap,...defaultKeymap]),lineNumbers(),EditorView.lineWrapping,
    markdown({base:markdownLanguage}),obsidianMarkdown,syntaxHighlighting(oneDarkHighlightStyle,{fallback:true}),obsidianSourceSyntax,obsidianHeadingMarkers,
    EditorState.transactionFilter.of(tr=>{
      if(!tr.docChanged||tr.annotation(generated))return tr;
      const bodyEnd=tr.startState.doc.length-suffix.length;
      let allowed=true;tr.changes.iterChangedRanges((from,to)=>{if(from>bodyEnd||to>bodyEnd)allowed=false;});
      return allowed?tr:[];
    }),
    EditorView.contentAttributes.of({'aria-label':'翻译 Prompt（可编辑）',spellcheck:'false'}),
    EditorView.updateListener.of(update=>{if(update.docChanged||update.transactions.length)notify();})
  ]})});
  function setTask(next,path){
    const value=createPromptParameters(next,path);
    if(value===suffix)return;
    const from=editor.state.doc.length-suffix.length,to=editor.state.doc.length;
    suffix=value;
    editor.dispatch({changes:{from,to,insert:value},annotations:[generated.of(true),Transaction.addToHistory.of(false)],
      ...(editor.state.selection.main.head>from?{selection:{anchor:from}}:{})});
  }
  function save(){
    if(loadError)throw Error('Prompt 草稿存储不可用：'+loadError.message);
    if(!state().dirty){onStatus('当前没有待保存的翻译 Prompt');return false;}
    baseline=port.save(text(),baseline.stored);notify();onStatus('✓ 翻译 Prompt 已保存至本浏览器','ok');return true;
  }
  return Object.freeze({getText:fullText,getState:state,setTask,save,undo:()=>undo(editor),redo:()=>redo(editor),
    activate(){editor.requestMeasure();notify();if(loadError)onStatus('Prompt 草稿读取失败，无法保存','error');},
    layout:()=>editor.requestMeasure(),dispose:()=>editor.destroy()});
}
