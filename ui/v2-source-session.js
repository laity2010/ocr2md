/** WP07: CM6 is the ONLY document+structure memory owner, but source text
 * is read-only. PDF drag generates an auditable structure transaction which
 * CodeMirror history can undo/redo. SQL writes live in the outer adapter.
 */
import {EditorState,StateField,StateEffect,Transaction} from '@codemirror/state';
import {EditorView,Decoration} from '@codemirror/view';
import {basicSetup} from 'codemirror';
import {undo,redo,undoDepth,redoDepth,invertedEffects} from '@codemirror/commands';
import {markdown,markdownLanguage} from '@codemirror/lang-markdown';
import {syntaxHighlighting} from '@codemirror/language';
import {oneDarkHighlightStyle} from '@codemirror/theme-one-dark';
import {nativeIOSBasicSetup,isIOSWebKit} from './ios-native-selection.js';
import {obsidianMarkdown} from './obsidian-markdown.js';
import {obsidianSourceSyntax} from './obsidian-source-syntax.js';
import {obsidianHeadingMarkers} from './obsidian-heading-markers.js';
import {composeBlockSource,logicalTextRows,BLOCK_END} from './v2-block-source.js';
import {documentChanged,selectionChanged,publishFocus} from './view-store.js';
import {logicalAtOffset} from './v2-focus-map.js';
import {moveLogicalBlocks} from './v2-structure-move.js';
import './v2-source-session.css';

export function mountV2Source(host){
  let book='',loaded=false,blocks=[],dirty=false,programmatic=false,persistedSignature='';
  const structureEffect=StateEffect.define();
  const structureField=StateField.define({
    create:()=>[],
    update(value,tr){
      const change=tr.effects.find(effect=>effect.is(structureEffect));
      return change?change.value:value;
    },
  });
  const signature=rows=>JSON.stringify(rows.map(r=>[
    r.logicalId,r.logicalOrder,r.parentId,r.p,r.b,r.s]));
  const focusEffect=StateEffect.define();
  const focusField=StateField.define({
    create:()=>Decoration.none,
    update(value,tr){
      value=value.map(tr.changes);
      for(const effect of tr.effects)if(effect.is(focusEffect)){
        const {from,to}=effect.value||{};
        if(!Number.isInteger(from)||!Number.isInteger(to))value=Decoration.none;
        else if(from===to){
          const line=tr.state.doc.lineAt(Math.min(from,tr.state.doc.length));
          value=Decoration.set([Decoration.line({class:'v2-sync-source-focus'}).range(line.from)]);
        }else value=Decoration.set([Decoration.mark({class:'v2-sync-source-focus'}).range(from,to)]);
      }
      return value;
    },provide:f=>EditorView.decorations.from(f),
  });
  let selectedId=null;
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
    // The DOM is noneditable; a changeFilter rejects every non-structural
    // change. CM6's state.readOnly must remain false for native undo/redo:
    // @codemirror/commands intentionally disables history on readOnly state.
    EditorView.editable.of(false),
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({spellcheck:'false'}),
    markdown({base:markdownLanguage}),obsidianMarkdown,
    syntaxHighlighting(oneDarkHighlightStyle,{fallback:true}),
    obsidianSourceSyntax,obsidianHeadingMarkers,focusField,structureField,
    invertedEffects.of(tr=>tr.effects.some(e=>e.is(structureEffect))?
      [structureEffect.of(tr.startState.field(structureField))]:[]),
    EditorState.changeFilter.of(tr=>{
      if(!tr.docChanged||!loaded)return true;
      const allowed=tr.effects.some(effect=>effect.is(structureEffect));
      if(!allowed)document.dispatchEvent(new Event('v2-cm-source-readonly'));
      return allowed;
    }),
    EditorView.updateListener.of(update=>{
      const structural=update.transactions.some(tr=>tr.effects.some(e=>e.is(structureEffect)));
      if(loaded&&structural){
        blocks=update.state.field(structureField);
        dirty=signature(blocks)!==persistedSignature;
        documentChanged(); // V1 revision rejects stale multi-pane focus/scroll
        refresh();emit('structure');
      }else if(update.transactions.length&&loaded){refresh();}
      if(loaded&&!programmatic&&(update.selectionSet||update.docChanged)){
        const pos=update.state.selection.main.head;
        selectionChanged(pos);
        const row=logicalAtOffset(blocks,pos);
        if(row&&row.logicalId!==selectedId){
          selectedId=row.logicalId;
          // CM6 cannot dispatch while its own update is in progress.
          // Schedule only the decoration; the state-bus focus is synchronous.
          queueMicrotask(()=>{if(loaded&&selectedId===row.logicalId)setFocused(row);});
          publishFocus({sourceLine:update.state.doc.lineAt(Math.min(pos,update.state.doc.length)).number,
            origin:'cm6',intent:'click',elementId:String(row.logicalId)});
        }
      }
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
    editor.dispatch({effects:structureEffect.of(created.blocks),
      annotations:Transaction.addToHistory.of(false)});
    book=workspace;blocks=created.blocks;persistedSignature=signature(blocks);
    loaded=true;dirty=false;selectedId=null;documentChanged();refresh();emit('load');
    return true;
  };
  const clear=()=>{
    if(!loaded&&!book)return;
    loaded=false;book='';blocks=[];persistedSignature='';dirty=false;selectedId=null;
    editor.setState(EditorState.create({doc:'',extensions}));
    documentChanged();refresh();emit('clear');
  };
  const onUndo=()=>{if(loaded&&undoDepth(editor.state))undo(editor);refresh();};
  const onRedo=()=>{if(loaded&&redoDepth(editor.state))redo(editor);refresh();};
  const applyDrag=intent=>{
    if(!loaded)throw Error('工作目录未绑定');
    const result=moveLogicalBlocks(logicalTextRows(editor.state.doc.toString(),blocks),intent);
    // A repeated drop at the correct position is a successful no-op, not a
    // failed SQL write. No CM6 history entry, dirty flag or idle commit.
    if(result.unchanged)return {changed:[],unchanged:true,sourceBlockId:intent.sourceBlockId};
    editor.dispatch({changes:{from:0,to:editor.state.doc.length,insert:result.source},
      effects:structureEffect.of(result.blocks),
      selection:{anchor:result.blocks.find(r=>r.logicalId===intent.sourceBlockId)?.from??0}});
    return {changed:result.changes,unchanged:false,sourceBlockId:intent.sourceBlockId};
  };
  undoButton?.addEventListener('click',onUndo);
  redoButton?.addEventListener('click',onRedo);
  const setFocused=row=>{
    if(!row)return false;
    const from=Math.min(row.from,editor.state.doc.length);
    const to=Math.min(row.to,editor.state.doc.length);
    selectedId=row.logicalId;
    programmatic=true;
    try{editor.dispatch({effects:focusEffect.of({from,to})});}finally{programmatic=false;}
    return true;
  };
  const locateSourceLine=line=>{
    if(!loaded||!Number.isInteger(line)||line<1||line>editor.state.doc.lines)return false;
    const pos=editor.state.doc.line(line).from;
    const row=logicalAtOffset(blocks,pos);
    programmatic=true;
    try{editor.dispatch({selection:{anchor:pos},effects:focusEffect.of(row)});}
    finally{programmatic=false;}
    selectedId=row?.logicalId??null;
    editor.focus();
    return true;
  };
  const locateLogicalId=id=>{
    if(!loaded)return false;
    const row=blocks.find(row=>row.logicalId===id);
    if(!row)return false;
    const pos=row.from;
    programmatic=true;
    try{editor.dispatch({selection:{anchor:pos},effects:focusEffect.of(row)});}
    finally{programmatic=false;}
    selectedId=id;editor.focus();return true;
  };
  const port=Object.freeze({
    load,clear,locateSourceLine,locateLogicalId,setFocusedId:id=>setFocused(blocks.find(row=>row.logicalId===id)),
    applyDrag,getStructureRows:()=>blocks.map(({logicalId,parentId,logicalOrder,p,b,s})=>({
      logicalId,parentId,logicalOrder,p,b,s})),
    markPersisted:rows=>{
      if(!loaded)return;
      persistedSignature=signature(rows);
      dirty=signature(blocks)!==persistedSignature;refresh();emit('saved');
    },
    getEditorView:()=>editor,getDoc:()=>editor.state.doc,
    getLineAtOffset:pos=>editor.state.doc.lineAt(Math.min(Math.max(pos,0),editor.state.doc.length)).number,
    getMarkdown:()=>editor.state.doc.toString(),
    getBlocks:()=>logicalTextRows(editor.state.doc.toString(),blocks),
    getIntervals:()=>blocks.map(({logicalId,baseBlockId,logicalOrder,blockType,p,b,s,from,to})=>({
      logicalId,baseBlockId,logicalOrder,blockType,p,b,s,from,to})),
    getWorkspace:()=>book,
    getState:()=>({book,loaded,dirty,readOnly:true,blockCount:blocks.length,
      undo:undoDepth(editor.state),redo:redoDepth(editor.state),separator:BLOCK_END}),
    undo:onUndo,redo:onRedo,
  });
  host.v2SourcePort=port;
  refresh();
  return {dispose(){undoButton?.removeEventListener('click',onUndo);
    redoButton?.removeEventListener('click',onRedo);delete host.v2SourcePort;editor.destroy();},
    layout:()=>editor.requestMeasure()};
}
