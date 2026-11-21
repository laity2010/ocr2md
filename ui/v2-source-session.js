/** WP04: V2-only CM6 mount into the EXISTING Frame editor host.
 * Same V1 CodeMirror Markdown extensions/palette, no second EditorView,
 * no SQL writes. Undo/Redo use native CodeMirror history only.
 */
import {EditorState} from '@codemirror/state';
import {EditorView} from '@codemirror/view';
import {basicSetup} from 'codemirror';
import {undo,redo,undoDepth,redoDepth} from '@codemirror/commands';
import {markdown,markdownLanguage} from '@codemirror/lang-markdown';
import {syntaxHighlighting} from '@codemirror/language';
import {oneDarkHighlightStyle} from '@codemirror/theme-one-dark';
import {nativeIOSBasicSetup,isIOSWebKit} from './ios-native-selection.js';
import {obsidianMarkdown} from './obsidian-markdown.js';
import {obsidianSourceSyntax} from './obsidian-source-syntax.js';
import {obsidianHeadingMarkers} from './obsidian-heading-markers.js';
import {composeBlockSource,canEditBlocks,mapEditedBlocks,logicalTextRows,BLOCK_END} from './v2-block-source.js';
import './v2-source-session.css';

export function mountV2Source(host){
  let book='',loaded=false,initial='',blocks=[],dirty=false;
  host.classList.add('v2-source-session');
  const native=isIOSWebKit();
  host.classList.toggle('ocr-ios-native-selection',native);
  const undoButton=host.closest('.ocr-source-pane')?.querySelector('button#undo');
  const redoButton=host.closest('.ocr-source-pane')?.querySelector('button#redo');
  const emit=kind=>document.dispatchEvent(new CustomEvent('v2-cm-session',{detail:{
    book,loaded,dirty,blocks:blocks.length,undo:undoDepth(editor.state),redo:redoDepth(editor.state),kind,
  }}));
  const refresh=()=>{
    if(undoButton){undoButton.disabled=!loaded||!undoDepth(editor.state);
      undoButton.title=loaded?'撤销内存修改':'没有绑定文档';}
    if(redoButton){redoButton.disabled=!loaded||!redoDepth(editor.state);
      redoButton.title=loaded?'重做内存修改':'没有绑定文档';}
  };
  const extensions=[
    native?nativeIOSBasicSetup:basicSetup,
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({spellcheck:'false'}),
    markdown({base:markdownLanguage}),obsidianMarkdown,
    syntaxHighlighting(oneDarkHighlightStyle,{fallback:true}),
    obsidianSourceSyntax,obsidianHeadingMarkers,
    EditorState.changeFilter.of(tr=>{
      if(!tr.docChanged||!loaded)return true;
      const allowed=canEditBlocks(blocks,tr.changes);
      if(!allowed)document.dispatchEvent(new Event('v2-cm-protected-separator'));
      return allowed;
    }),
    EditorView.updateListener.of(update=>{
      if(update.docChanged&&loaded){
        blocks=mapEditedBlocks(blocks,update.changes);
        dirty=update.state.doc.toString()!==initial;
        refresh();emit('edit');
      }else if(update.transactions.length&&loaded){refresh();}
    }),
  ];
  const editor=new EditorView({state:EditorState.create({doc:'',extensions}),parent:host});
  const load=(snapshot,workspace)=>{
    if(!workspace||typeof workspace!=='string')throw Error('WP04: missing authorized workspace');
    if(loaded&&book===workspace)return false; // never discard unsaved edits during refresh
    const created=composeBlockSource(snapshot); // validate BEFORE touching current editor
    const next=EditorState.create({doc:created.source,extensions});
    loaded=false; // state replacement is not a user edit/history step
    editor.setState(next);
    book=workspace;blocks=created.blocks;initial=created.source;
    loaded=true;dirty=false;refresh();emit('load');
    return true;
  };
  const clear=()=>{
    if(!loaded&&!book)return;
    loaded=false;book='';blocks=[];initial='';dirty=false;
    editor.setState(EditorState.create({doc:'',extensions}));
    refresh();emit('clear');
  };
  const onUndo=()=>{if(loaded&&undoDepth(editor.state))undo(editor);refresh();};
  const onRedo=()=>{if(loaded&&redoDepth(editor.state))redo(editor);refresh();};
  undoButton?.addEventListener('click',onUndo);
  redoButton?.addEventListener('click',onRedo);
  const port=Object.freeze({
    load,clear,getMarkdown:()=>editor.state.doc.toString(),
    getBlocks:()=>logicalTextRows(editor.state.doc.toString(),blocks),
    getIntervals:()=>blocks.map(({logicalId,from,to})=>({logicalId,from,to})),
    getWorkspace:()=>book,
    getState:()=>({book,loaded,dirty,blockCount:blocks.length,
      undo:undoDepth(editor.state),redo:redoDepth(editor.state),separator:BLOCK_END}),
    undo:onUndo,redo:onRedo,
  });
  host.v2SourcePort=port;
  refresh();
  return {dispose(){undoButton?.removeEventListener('click',onUndo);
    redoButton?.removeEventListener('click',onRedo);delete host.v2SourcePort;editor.destroy();},
    layout:()=>editor.requestMeasure()};
}
