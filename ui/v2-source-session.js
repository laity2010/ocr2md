/** WP10: one editable CM6 text+structure history. SQL persists MD Block;
 * Raw Block is external reference only and never modified from this pane. */
import {EditorState,StateField,StateEffect,Transaction,Annotation} from '@codemirror/state';
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
import {composeBlockSource,logicalTextRows,canEditBlocks,mapEditedBlocks,groupEndPadding,childLinePadding,BLOCK_END} from './v2-block-source.js';
import {documentChanged,selectionChanged,publishFocus} from './view-store.js';
import {logicalAtOffset} from './v2-focus-map.js';
import {moveLogicalBlocks} from './v2-structure-move.js';
import {singleLineMD} from './v2-single-line.js';
import './v2-source-session.css';

export function mountV2Source(host){
  let book='',loaded=false,blocks=[],dirty=false,programmatic=false;
  let persistedStructureSignature='',persistedTextSignature='';
  const structureEffect=StateEffect.define();
  const dragEffect=StateEffect.define();
  const autoblanks=Annotation.define();
  const structureField=StateField.define({
    create:()=>[],
    update(value,tr){
      const change=tr.effects.find(effect=>effect.is(structureEffect));
      return change?change.value:value;
    },
  });
  const signature=rows=>JSON.stringify(rows.map(r=>[
    r.logicalId,r.logicalOrder,r.parentId,r.p,r.b,r.s]));
  const textSignature=rows=>JSON.stringify(rows.map(r=>[r.logicalId,r.markdownText]));
  const actualText=()=>logicalTextRows(editor.state.doc.toString(),blocks);
  const refreshDirty=()=>{dirty=signature(blocks)!==persistedStructureSignature||
    textSignature(actualText())!==persistedTextSignature;};
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
    // The native CM6 document is editable. Every textual transaction owns a
    // single logical block (or several independent changes, one each); cross-
    // block deletion/replacement remains forbidden to protect stable IDs.
    EditorView.editable.of(true),
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({spellcheck:'false'}),
    markdown({base:markdownLanguage}),obsidianMarkdown,
    syntaxHighlighting(oneDarkHighlightStyle,{fallback:true}),
    obsidianSourceSyntax,obsidianHeadingMarkers,focusField,structureField,
    invertedEffects.of(tr=>[
      ...(tr.effects.some(e=>e.is(structureEffect))?
        [structureEffect.of(tr.startState.field(structureField))]:[]),
      ...(tr.effects.some(e=>e.is(dragEffect))?[dragEffect.of(true)]:[]),
    ]),
    EditorState.transactionFilter.of(tr=>{
      if(!loaded||!tr.docChanged||tr.effects.some(e=>e.is(dragEffect))||
        !canEditBlocks(tr.startState.field(structureField),tr.changes))return tr;
      // Preserve WP13 display spacing on EVERY edit: one LF within a parent
      // group, one blank line (two LF) at each parent-group end. WP14's
      // single-line MD Block normalization concerns TEXT, not these gaps.
      const before=tr.startState.field(structureField);
      const pads=[];
      for(let i=0;i<before.length;i++){
        const row=before[i],next=before[i+1];
        const sameGroup=next&&row.p===next.p&&row.b===next.b;
        const end=tr.changes.mapPos(row.to,next?-1:1);
        const suffix=tr.newDoc.sliceString(Math.max(0,end-2),end);
        const padding=sameGroup?childLinePadding(suffix):groupEndPadding(suffix);
        if(padding)pads.push({logicalId:row.logicalId,length:padding.length,
          from:end,insert:padding});
      }
      if(!pads.length)return tr;
      return [tr,{changes:pads.map(p=>({from:p.from,insert:p.insert})),
        sequential:true,annotations:autoblanks.of(pads)}];
    }),
    EditorState.transactionExtender.of(tr=>{
      if(!loaded||!tr.docChanged||tr.effects.some(e=>e.is(structureEffect)))return null;
      return {effects:structureEffect.of(mapEditedBlocks(
        tr.startState.field(structureField),tr.changes,tr.annotation(autoblanks)||[]))};
    }),
    EditorState.changeFilter.of(tr=>{
      if(!tr.docChanged||!loaded)return true;
      // A mapped structureEffect is also attached to ordinary text edits;
      // it is NOT permission to cross block boundaries. Only an actual PDF
      // structure drag (and its native inverse history) has dragEffect.
      if(tr.effects.some(effect=>effect.is(dragEffect)))return true;
      let insertedLineBreak=false;
      tr.changes.iterChanges((a,b,c,d,inserted)=>{
        if(/[\r\n]/.test(inserted.toString()))insertedLineBreak=true;
      });
      const allowed=!insertedLineBreak&&canEditBlocks(blocks,tr.changes);
      if(!allowed)document.dispatchEvent(new Event('v2-cm-protected-separator'));
      return allowed;
    }),
    EditorView.updateListener.of(update=>{
      const changedEffect=update.transactions.some(tr=>tr.effects.some(e=>e.is(structureEffect)));
      if(loaded&&changedEffect){
        blocks=update.state.field(structureField);
        refreshDirty();
        documentChanged(); // V1 revision rejects stale multi-pane focus/scroll
        refresh();
        // Keep the established public session contract. The V1 PDF
        // adapter listens for "structure"; the V1 Markdown/scroll adapters
        // distinguish user "edit" from an actual block drag. Undo/Redo
        // carry dragEffect in their inverse CM6 transaction.
        const dragging=update.transactions.some(tr=>tr.effects.some(e=>e.is(dragEffect)));
        emit(dragging?'structure':'edit');
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
    book=workspace;blocks=created.blocks;persistedStructureSignature=signature(blocks);
    persistedTextSignature=textSignature(logicalTextRows(created.source,blocks));
    loaded=true;dirty=false;selectedId=null;documentChanged();refresh();emit('load');
    return true;
  };
  const clear=()=>{
    if(!loaded&&!book)return;
    loaded=false;book='';blocks=[];persistedStructureSignature='';persistedTextSignature='';dirty=false;selectedId=null;
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
      effects:[structureEffect.of(result.blocks),dragEffect.of(true)],
      selection:{anchor:result.blocks.find(r=>r.logicalId===intent.sourceBlockId)?.from??0}});
    return {changed:result.changes,unchanged:false,sourceBlockId:intent.sourceBlockId};
  };
  const countMultiline=()=>actualText().filter(r=>singleLineMD(r.markdownText)!==r.markdownText).length;
  const normalizeLines=()=>{
    if(!loaded||dirty)throw Error('请先保存当前正文或结构');
    const changes=blocks.map(row=>{
      const raw=editor.state.doc.sliceString(row.from,row.to-(row.groupEndPad??0));
      const after=singleLineMD(raw);
      return after!==raw?{from:row.from,to:row.to-(row.groupEndPad??0),insert:after}:null;
    }).filter(Boolean);
    if(!changes.length)return 0;
    // Native CM6 history (one transaction): old edits remain undoable and
    // SQL commits only per-logical-id optimistic text differences.
    editor.dispatch({changes});
    return changes.length;
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
    applyDrag,countMultiline,normalizeLines,getStructureRows:()=>blocks.map(({logicalId,parentId,logicalOrder,p,b,s})=>({
      logicalId,parentId,logicalOrder,p,b,s})),
    markPersisted:rows=>{
      if(!loaded)return;
      persistedStructureSignature=signature(rows);
      refreshDirty();refresh();emit('saved');
    },
    markTextPersisted:rows=>{
      if(!loaded)return;
      persistedTextSignature=textSignature(rows);
      refreshDirty();refresh();emit('saved');
    },
    getEditorView:()=>editor,getDoc:()=>editor.state.doc,
    getLineAtOffset:pos=>editor.state.doc.lineAt(Math.min(Math.max(pos,0),editor.state.doc.length)).number,
    getMarkdown:()=>editor.state.doc.toString(),
    getBlocks:()=>logicalTextRows(editor.state.doc.toString(),blocks),
    getIntervals:()=>blocks.map(({logicalId,baseBlockId,logicalOrder,blockType,p,b,s,from,to,groupEndPad})=>({
      logicalId,baseBlockId,logicalOrder,blockType,p,b,s,from,to,groupEndPad})),
    getWorkspace:()=>book,
    getState:()=>({book,loaded,dirty,readOnly:false,blockCount:blocks.length,
      undo:undoDepth(editor.state),redo:redoDepth(editor.state),
      separator:BLOCK_END,groupEndMinimum:BLOCK_END}),
    undo:onUndo,redo:onRedo,
  });
  host.v2SourcePort=port;
  refresh();
  return {dispose(){undoButton?.removeEventListener('click',onUndo);
    redoButton?.removeEventListener('click',onRedo);delete host.v2SourcePort;editor.destroy();},
    layout:()=>editor.requestMeasure()};
}
