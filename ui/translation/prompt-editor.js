/** One independent CM6 Prompt document; no original-source or SQL writer. */
import {EditorState} from '@codemirror/state';
import {EditorView,lineNumbers,keymap} from '@codemirror/view';
import {history,historyKeymap,defaultKeymap,undo,redo,undoDepth,redoDepth} from '@codemirror/commands';
import {markdown,markdownLanguage} from '@codemirror/lang-markdown';
import {obsidianMarkdown} from '../obsidian-markdown.js';
import {createPromptStorage,DEFAULT_PROMPT} from './prompt-document.js';
import './prompt-editor.css';

export function mountPromptEditor(host,{onChange=()=>{},onStatus=()=>{},storage}={}){
  let port,baseline,loadError=null;
  try{port=createPromptStorage(storage??localStorage);baseline=port.read();}
  catch(error){loadError=error;baseline={stored:null,text:DEFAULT_PROMPT};}
  let editor;
  const text=()=>editor.state.doc.toString();
  const state=()=>({dirty:text()!==baseline.text,undo:undoDepth(editor.state),redo:redoDepth(editor.state)});
  const notify=()=>onChange(state());
  editor=new EditorView({parent:host,state:EditorState.create({doc:baseline.text,extensions:[
    history(),keymap.of([...historyKeymap,...defaultKeymap]),lineNumbers(),EditorView.lineWrapping,
    markdown({base:markdownLanguage}),obsidianMarkdown,
    EditorView.contentAttributes.of({'aria-label':'翻译 Prompt（可编辑）',spellcheck:'false'}),
    EditorView.updateListener.of(update=>{if(update.docChanged||update.transactions.length)notify();})
  ]})});
  function save(){
    if(loadError)throw Error('Prompt 草稿存储不可用：'+loadError.message);
    if(!state().dirty){onStatus('当前没有待保存的翻译 Prompt');return false;}
    baseline=port.save(text(),baseline.stored);notify();onStatus('✓ 翻译 Prompt 已保存至本浏览器','ok');return true;
  }
  return Object.freeze({getText:text,getState:state,save,undo:()=>undo(editor),redo:()=>redo(editor),
    activate(){editor.requestMeasure();notify();if(loadError)onStatus('Prompt 草稿读取失败，无法保存','error');},
    layout:()=>editor.requestMeasure(),dispose:()=>editor.destroy()});
}
