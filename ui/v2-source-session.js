/** WP10: one editable CM6 text+structure history. SQL persists MD Block;
 * Raw Block is external reference only and never modified from this pane. */
import {EditorState,StateField,StateEffect,Transaction,ChangeSet} from '@codemirror/state';
import {EditorView,Decoration} from '@codemirror/view';
import {basicSetup} from 'codemirror';
import {undo,redo,undoDepth,redoDepth,invertedEffects,isolateHistory} from '@codemirror/commands';
import {markdown,markdownLanguage} from '@codemirror/lang-markdown';
import {syntaxHighlighting} from '@codemirror/language';
import {oneDarkHighlightStyle} from '@codemirror/theme-one-dark';
import {nativeIOSBasicSetup,isIOSWebKit} from './ios-native-selection.js';
import {obsidianMarkdown} from './obsidian-markdown.js';
import {obsidianSourceSyntax} from './obsidian-source-syntax.js';
import {obsidianHeadingMarkers} from './obsidian-heading-markers.js';
import {composeBlockSource,composeLogicalSource,composeOwnedSource,logicalTextRows,planOwnedTextEdit,BLOCK_END} from './v2-block-source.js';
import {documentChanged,selectionChanged,publishFocus} from './view-store.js';
import {logicalAtOffset} from './v2-focus-map.js';
import {moveLogicalBlocks} from './v2-structure-move.js';
import {isSyntheticId} from './v2-legacy-block-id.js';
import {createMdLineIndex} from './v2-md-line-index.js';
import {planMdLineEdit} from './v2-md-line-edit.js';
import {captureLineSelection,quoteLineChanges} from './v2-line-quote.js';
import {singleLineMD} from './v2-single-line.js';
import {uploadV2PastedImage} from './v2-media-paste.js';
// Byte-identical V1 Frame source gutter, adapted only via callbacks.
import {createMdLineGutter} from './v2-md-line-gutter.js';
import './v2-source-session.css';

export function mountV2Source(host){
  let book='',loaded=false,blocks=[],dirty=false,programmatic=false,ownedLF=false;
  let persistedStructureSignature='',persistedTextSignature='';
  const structureEffect=StateEffect.define();
  const dragEffect=StateEffect.define();
  const blockTextEffect=StateEffect.define();

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
  const latexEffect=StateEffect.define();
  const latexField=StateField.define({
    create:()=>Decoration.none,
    update(value,tr){
      if(tr.docChanged||tr.effects.some(e=>e.is(structureEffect)))value=Decoration.none;
      for(const effect of tr.effects)if(effect.is(latexEffect))
        value=Decoration.set(effect.value.map(r=>Decoration.mark({class:r.kind==='独立'?'v2-latex-display':'v2-latex-inline'}).range(r.source_from,r.source_to)),true);
      return value;
    },provide:f=>EditorView.decorations.from(f),
  });
  const breakEffect=StateEffect.define();
  const breakField=StateField.define({
    create:()=>Decoration.none,
    update(value,tr){
      if(tr.docChanged||tr.effects.some(e=>e.is(structureEffect)))value=Decoration.none;
      for(const effect of tr.effects)if(effect.is(breakEffect))
        value=Decoration.set(effect.value.filter(r=>Number.isInteger(r.from)&&r.to>r.from).map(r=>
          Decoration.mark({class:'ocr-block-break-source-'+r.side}).range(r.from,r.to)),true);
      return value;
    },provide:f=>EditorView.decorations.from(f)
  });
  let selectedId=null,selectedLine=null;
  let indexedDoc=null,indexedBlocks=null,lineIndex=null;
  const getMdLineIndex=(state=editor?.state)=>{
    // Gutter rendering precedes updateListener. Read both parts of the
    // snapshot from the SAME immutable CM6 state, never its outer cache.
    const intervals=state?.field(structureField,false);
    if(!ownedLF||!intervals?.length)return null;
    if(indexedDoc!==state.doc||indexedBlocks!==intervals){
      lineIndex=createMdLineIndex(state.doc,intervals);
      indexedDoc=state.doc;indexedBlocks=intervals;
    }
    return lineIndex;
  };
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
  let editor;
  const lineGutter=createMdLineGutter({
    isMarkdown:state=>Boolean(state.field(structureField).length),
    focusLineAt:state=>state.doc.lineAt(state.selection.main.head).number,
    lineIdAt:(lineNo,state=editor?.state)=>{
      if(!state||lineNo<1||lineNo>state.doc.lines)return null;
      const line=state.doc.line(lineNo),intervals=state.field(structureField);
      return (ownedLF?getMdLineIndex(state)?.atSourceLine(lineNo)?.logical_id:
        intervals.find(row=>row.from===line.from)?.logicalId)??null;
    },
    captureLine:lineNo=>ownedLF?getMdLineIndex()?.makeRef(lineNo):{legacy:true},
    captureSelection:()=>captureLineSelection(editor.state.doc,getMdLineIndex(),editor.state.selection.main),
    onQuote:(range,mode)=>{
      try{
        const changes=quoteLineChanges(getMdLineIndex(),range,mode);
        if(changes.length){
          const state=editor.state,planned=ChangeSet.of(changes,state.doc.length);
          const plan=planMdLineEdit(state.doc,state.field(structureField),planned);
          if(!plan)throw Error('选区无法保留逻辑行归属');
          document.querySelector('#workspace .ocr-preview-md-scroll')?.v2MarkdownPreviewPort?.beforeSourceEdit?.();
          editor.dispatch({changes:planned,annotations:[Transaction.userEvent.of('input.quote-lines'),isolateHistory.of('full')]});
          if(editor.state.doc.toString()!==plan.source)throw Error('引用操作未通过 CM6 事务门禁');
        }
        document.dispatchEvent(new CustomEvent('v2-cm-status',{detail:{text:`引用${mode==='add'?'增加':'减少'} · ${changes.length} 行${changes.length?' · 可撤销':''}`,kind:'ok'}}));
      }catch(error){document.dispatchEvent(new CustomEvent('v2-cm-status',{detail:{text:'引用操作失败：'+error.message,kind:'error'}}));}
    },
    onDelete:(logicalId,lineRef)=>{
      if(deleteLogicalLine(logicalId,lineRef))document.dispatchEvent(new CustomEvent('v2-cm-status',{
        detail:{text:'已删除当前 MD 行，逻辑块及 PBS 保留 · CM6 可撤销',kind:'ok'},
      }));
    },
    getPdfText:async logicalId=>{
      const activeBook=book;
      if(!loaded||!activeBook)return {text:'',workspace:activeBook};
      const pdf=document.querySelector('#workspace .ocr-preview-pdf-host')?.v2PDFPort;
      const text=pdf?.getState().workspace===activeBook?
        await pdf.getNativeTextForLogicalId(logicalId):'';
      return {text:loaded&&book===activeBook?text:'',workspace:activeBook};
    },
    onPdfText:(logicalId,mode,text,expectedBook,lineRef)=>{
      try{
        if(!loaded||!expectedBook||book!==expectedBook)
          throw Error('原工作目录已经变更，拒绝使用旧 PDF 文字层');
        const count=insertPdfText({blockId:logicalId,mode,text,lineRef});
        const row=blocks.find(item=>item.logicalId===logicalId);
        document.dispatchEvent(new CustomEvent('v2-cm-status',{detail:{
          text:`PDF 原文${mode==='replace'?'替换':'插入'} · p${row?.p}b${row?.b}s${row?.s} · ${count} 字符 · CM6 可撤销`,kind:'ok',
        }}));
      }catch(error){
        document.dispatchEvent(new CustomEvent('v2-cm-status',{detail:{
          text:'PDF 原文操作失败：'+error.message,kind:'error',
        }}));
      }
    },
  });
  // V1 Frame replaces only the stock first line-number extension.
  // Preserve CM6's remaining setup, native iPad selection and history.
  const base=native?nativeIOSBasicSetup:basicSetup;
  const pasteStatus=(text,kind='info')=>document.dispatchEvent(new CustomEvent('v2-cm-status',{detail:{text,kind}}));
  const extensions=[
    lineGutter.extension,...base.slice(1),
    EditorView.domEventHandlers({paste(event,view){
      const item=[...(event.clipboardData?.items||[])].find(x=>x.kind==='file'&&x.type.startsWith('image/'));
      if(!item)return false; // text remains native CM6
      event.preventDefault();
      if(!loaded||!ownedLF){pasteStatus('粘贴图片需要已加载的真实 LF 正文','warning');return true;}
      const file=item.getAsFile();
      const snapshot=view.state.doc,structure=view.state.field(structureField),workspace=book;
      const {from,to}=view.state.selection.main;
      // A file must never be uploaded for an invalid cross-block edit.
      const template={from,to,insert:'![](media/'+'0'.repeat(24)+'.png)'};
      if(!planMdLineEdit(snapshot,structure,ChangeSet.of([template],snapshot.length))){
        pasteStatus('图片粘贴位置跨越受保护逻辑块','warning');return true;
      }
      void (async()=>{
        try{
          pasteStatus('正在将剪贴板图片写入 media/');
          const path=await uploadV2PastedImage(workspace,file);
          document.dispatchEvent(new CustomEvent('v2-media-pasted',{detail:{workspace}}));
          if(!loaded||book!==workspace||view.state.doc!==snapshot||view.state.field(structureField)!==structure)
            throw Error('图片上传期间文档已改变，请重新选择位置粘贴');
          const insert='![]('+path+')',change={from,to,insert};
          const changes=ChangeSet.of([change],snapshot.length);
          const plan=planMdLineEdit(snapshot,structure,changes);
          if(!plan)throw Error('图片粘贴位置不再有效');
          if(plan.source===snapshot.toString()){pasteStatus('图片引用已存在','ok');return;}
          document.querySelector('#workspace .ocr-preview-md-scroll')?.v2MarkdownPreviewPort?.beforeSourceEdit?.();
          view.dispatch({changes,effects:view.scrollSnapshot().map(changes),selection:{anchor:from+insert.length},
            annotations:[Transaction.userEvent.of('input.paste'),isolateHistory.of('full')]});
          if(view.state.doc.toString()!==plan.source)throw Error('图片引用未通过 CM6 事务门禁');
          pasteStatus('已插入图片引用 · 等待 SQL 增量保存','ok');
        }catch(error){pasteStatus('粘贴图片失败：'+error.message,'error');}
      })();
      return true;
    }}),
    // The native CM6 document is editable. Every textual transaction owns a
    // single logical block (or several independent changes, one each); cross-
    // block deletion/replacement remains forbidden to protect stable IDs.
    EditorView.editable.of(true),
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({spellcheck:'false'}),
    markdown({base:markdownLanguage}),obsidianMarkdown,
    syntaxHighlighting(oneDarkHighlightStyle,{fallback:true}),
    obsidianSourceSyntax,obsidianHeadingMarkers,focusField,structureField,latexField,breakField,
    invertedEffects.of(tr=>[
      ...(tr.effects.some(e=>e.is(structureEffect))?
        [structureEffect.of(tr.startState.field(structureField))]:[]),
      ...(tr.effects.some(e=>e.is(dragEffect))?[dragEffect.of(true)]:[]),
      ...(tr.effects.some(e=>e.is(blockTextEffect))?[blockTextEffect.of(true)]:[]),
    ]),
    // WP18 gate: ordinary edits may affect ONLY their logical MD text.
    // Structural LF and boundaries are immutable display padding. A valid
    // transaction's exact projected source and positions must both agree
    // BEFORE CM6 accepts the edit; otherwise its SQL could lose all later
    // blocks' first two characters (observed real p1b11+ live incident).
    EditorState.transactionFilter.of(tr=>{
      if(!loaded||!tr.docChanged||tr.effects.some(e=>
        e.is(dragEffect)||e.is(blockTextEffect)))return tr;
      if(ownedLF){
        // History restores the exact prior ownership, including boundary
        // insertions whose inverse otherwise looks like another line edit.
        if((tr.isUserEvent('undo')||tr.isUserEvent('redo'))&&tr.effects.some(e=>e.is(structureEffect))){
          const restored=tr.effects.find(e=>e.is(structureEffect)).value;
          try{
            createMdLineIndex(tr.newDoc,restored);
            const old=tr.startState.field(structureField);
            if(signature(restored)!==signature(old))return [];
            return tr;
          }catch{return [];}
        }
        const plan=planMdLineEdit(tr.startState.doc,
          tr.startState.field(structureField),tr.changes);
        if(!plan||plan.requested!==tr.newDoc.toString()){
          document.dispatchEvent(new Event('v2-cm-protected-separator'));return [];
        }
        const repair=ChangeSet.of(plan.repairs,tr.changes.newLength);
        if(repair.apply(tr.newDoc).toString()!==plan.source)
          throw Error('WP23E real LF transaction projection mismatch');
        if(plan.source===tr.startState.doc.toString())return [];
        // Repair is real text, in the SAME native CM6 history transaction.
        // Keep the caret before a newly supplied trailing LF.
        return [tr,{sequential:true,changes:repair,
          selection:tr.newSelection.map(repair,-1),
          effects:structureEffect.of(plan.blocks)}];
      }
      const plan=planOwnedTextEdit(tr.startState.doc.toString(),
        tr.startState.field(structureField),tr.changes);
      if(!plan||plan.source!==tr.newDoc.toString()){
        document.dispatchEvent(new Event('v2-cm-protected-separator'));
        return [];
      }
      return tr;
    }),
    EditorState.transactionExtender.of(tr=>{
      if(!loaded||ownedLF||!tr.docChanged||tr.effects.some(e=>e.is(structureEffect)))return null;
      const plan=planOwnedTextEdit(tr.startState.doc.toString(),
        tr.startState.field(structureField),tr.changes);
      if(!plan||plan.source!==tr.newDoc.toString())return null;
      return {effects:structureEffect.of(plan.blocks)};
    }),
    EditorState.changeFilter.of(tr=>{
      if(!loaded||ownedLF||!tr.docChanged||tr.effects.some(e=>
        e.is(dragEffect)||e.is(blockTextEffect)))return true;
      const plan=planOwnedTextEdit(tr.startState.doc.toString(),
        tr.startState.field(structureField),tr.changes);
      return !!plan&&plan.source===tr.newDoc.toString();
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
        const line=update.state.doc.lineAt(Math.min(pos,update.state.doc.length)).number;
        if(row&&(row.logicalId!==selectedId||(ownedLF&&(line!==selectedLine||update.docChanged)))){
          const blockChanged=row.logicalId!==selectedId;
          selectedId=row.logicalId;selectedLine=line;
          if(blockChanged)queueMicrotask(()=>{if(loaded&&selectedId===row.logicalId)setFocused(row);});
          publishFocus({sourceLine:line,origin:'cm6',intent:'click',elementId:String(row.logicalId)});
        }
      }
    }),
  ];
  editor=new EditorView({state:EditorState.create({doc:'',extensions}),parent:host});
  const load=(snapshot,workspace)=>{
    if(!workspace||typeof workspace!=='string')throw Error('WP04: missing authorized workspace');
    if(loaded&&book===workspace)return false; // never discard unsaved edits during refresh
    const created=composeBlockSource(snapshot); // validate BEFORE touching current editor
    const next=EditorState.create({doc:created.source,extensions});
    loaded=false; // state replacement is not a user edit/history step
    ownedLF=snapshot.schema==='v2-logical-md/v3';
    editor.setState(next);
    editor.dispatch({effects:structureEffect.of(created.blocks),
      annotations:Transaction.addToHistory.of(false)});
    book=workspace;blocks=created.blocks;persistedStructureSignature=signature(blocks);
    persistedTextSignature=textSignature(logicalTextRows(created.source,blocks));
    loaded=true;dirty=false;selectedId=null;selectedLine=null;documentChanged();refresh();emit('load');
    return true;
  };
  const clear=()=>{
    if(!loaded&&!book)return;
    loaded=false;ownedLF=false;book='';blocks=[];persistedStructureSignature='';persistedTextSignature='';dirty=false;selectedId=null;
    editor.setState(EditorState.create({doc:'',extensions}));
    documentChanged();refresh();emit('clear');
  };
  const onUndo=()=>{if(loaded&&undoDepth(editor.state))undo(editor);refresh();};
  const onRedo=()=>{if(loaded&&redoDepth(editor.state))redo(editor);refresh();};
  const applyDrag=intent=>{
    if(!loaded)throw Error('工作目录未绑定');
    const result=moveLogicalBlocks(logicalTextRows(editor.state.doc.toString(),blocks),intent,{ownedLF});
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
    if(ownedLF)throw Error('真实换行模式禁止单行整理');
    if(!loaded||dirty)throw Error('请先保存当前正文或结构');
    const rows=actualText();
    const next=rows.map(row=>({...row,markdownText:singleLineMD(row.markdownText)}));
    const count=next.filter((row,i)=>row.markdownText!==rows[i].markdownText).length;
    if(!count)return 0;
    // Explicit SQL-group normalization owns a typed ONE-history transaction.
    // Ordinary single-line typing never edits synthetic LF. No programmatic
    // source-map fallback can silently shift the rest of the book.
    const planned=composeLogicalSource(next);
    editor.dispatch({changes:{from:0,to:editor.state.doc.length,insert:planned.source},
      effects:[structureEffect.of(planned.blocks),blockTextEffect.of(true)]});
    return count;
  };
  // WP17: V1 physically deletes a source row. V2 owns a stable SQL
  // logical_id for EACH line; clearing only its MD text is the safe analogue.
  // The virtual LF, logical order, PBS identity and PDF geometry never move.
  const deleteLogicalLine=(logicalId,lineRef=null)=>{
    if(!loaded||!Number.isSafeInteger(logicalId))return false;
    const row=blocks.find(r=>r.logicalId===logicalId);
    if(!row)return false;
    if(ownedLF){
      const idx=getMdLineIndex(),line=lineRef?idx.resolve(lineRef):idx.atOffset(editor.state.selection.main.head);
      if(!line||line.logical_id!==logicalId)return false;
      const previous=editor.state.doc;
      document.querySelector('#workspace .ocr-preview-md-scroll')?.v2MarkdownPreviewPort?.beforeSourceEdit?.();
      editor.dispatch({changes:{from:line.from,to:line.to,insert:''},
        selection:{anchor:line.from},annotations:Transaction.userEvent.of('delete.line')});
      return editor.state.doc!==previous;
    }
    const from=row.from,to=row.to-row.groupEndPad;
    if(to<=from||!editor.state.doc.sliceString(from,to))return false;
    editor.dispatch({changes:{from,to,insert:''},
      selection:{anchor:from},annotations:Transaction.userEvent.of('delete.line')});
    return actualText().find(r=>r.logicalId===logicalId)?.markdownText==='';
  };
  // V1's PDF.js callback contains ONLY text collected from its currently
  // highlighted bbox; V2 restores one physical text row per logical block.
  const insertPdfText=({blockId,text,mode='insert',lineRef=null})=>{
    if(!['insert','replace'].includes(mode))throw Error('PDF 文本操作类型无效');
    if(!loaded||typeof text!=='string'||!text.trim())
      throw Error('尚未加载正文或 PDF 文字层无可提取文本');
    const id=Number(blockId);
    if(!Number.isSafeInteger(id)||id<1)throw Error('PDF 目标逻辑块无效');
    const textRows=actualText();
    const row=blocks.find(r=>r.logicalId===id);
    if(!row)throw Error('当前 PDF 高亮块不存在于 CM6 逻辑表');
    const inserted=singleLineMD(text);
    if(!inserted)throw Error('PDF 覆盖框没有可用文字');
    const head=editor.state.selection.main.head;
    if(ownedLF){
      const idx=getMdLineIndex(),atCaret=idx.atOffset(head);
      const line=lineRef?idx.resolve(lineRef):atCaret?.logical_id===id?atCaret:idx.forBlock(id)[0];
      if(!line||line.logical_id!==id)throw Error('MD 行定位已过期或不属于目标 PDF 块');
      const pos=head>=line.from&&head<=line.textTo?head:line.from;
      const change={from:mode==='replace'?line.from:pos,to:mode==='replace'?line.textTo:pos,insert:inserted};
      if(editor.state.doc.sliceString(change.from,change.to)===inserted)return 0;
      document.querySelector('#workspace .ocr-preview-md-scroll')?.v2MarkdownPreviewPort?.beforeSourceEdit?.();
      const scrollAnchor=editor.scrollSnapshot().map(ChangeSet.of([change],editor.state.doc.length));
      const previous=editor.state.doc;
      editor.dispatch({changes:change,effects:scrollAnchor,
        selection:{anchor:change.from+inserted.length},userEvent:'input.paste'});
      if(editor.state.doc===previous)throw Error('MD 行文字操作未提交');
      return inserted.length;
    }
    const from=row.from,to=row.to-(row.groupEndPad??0);
    const pos=head>=from&&(ownedLF?head<to:head<=to)?head:from;
    const raw=textRows.find(r=>r.logicalId===id)?.markdownText;
    if(typeof raw!=='string')throw Error('PDF 目标逻辑正文不存在');
    const offset=mode==='replace'?0:pos-from;
    let nextText=mode==='replace'?(ownedLF?inserted+(raw.match(/\n+$/)?.[0]||''):inserted):
      raw.slice(0,offset)+inserted+raw.slice(offset);
    if(ownedLF){
      const next=blocks[blocks.indexOf(row)+1];
      const min=next&&next.p===row.p&&next.b===row.b?1:2;
      nextText+='\n'.repeat(Math.max(0,min-(nextText.match(/\n+$/)?.[0].length||0)));
    }
    if(nextText===raw)return 0; // no second SQL commit for identical content
    const planned=(ownedLF?composeOwnedSource:composeLogicalSource)(textRows.map(item=>item.logicalId===id?
      {...item,markdownText:nextText}:item));
    const target=planned.blocks.find(item=>item.logicalId===id);
    // WP21: do NOT replace the entire CM6 document for a one-block edit.
    // Full-document replacement invalidates CM6's viewport height map and
    // sent the real 267-block book from visible line 60 to line 1 on WebKit
    // and Chromium. Change ONLY the target block (including its virtual
    // padding when required) and prove the result equals the canonical
    // projection before dispatch. The typed effect preserves LF ownership.
    const replacement=planned.source.slice(target.from,target.to);
    const current=editor.state.doc.toString();
    if(current.slice(0,row.from)+replacement+current.slice(row.to)!==planned.source)
      throw Error('PDF 单块替换与原逻辑块位置不一致，已取消操作');
    const beforeHead=editor.state.selection.main.head;
    // PDF/gutter commands run outside CM6's focus tree. Keep SOURCE as the
    // scroll leader across the delayed Markdown re-render: reuse the proven
    // V1 scroll-sync sourceEditGesture() instead of allowing the read-only
    // preview to drag CM6 to its previous viewport anchor.
    document.querySelector('#workspace .ocr-preview-md-scroll')
      ?.v2MarkdownPreviewPort?.beforeSourceEdit?.();
    const caret=mode==='replace'
      ?target.from+Math.min(Math.max(beforeHead-from,0),nextText.length)
      :target.from+offset+inserted.length;
    const localChange={from:row.from,to:row.to,insert:replacement};
    // Use CM6's NATIVE scroll anchor, mapped through the local change. This
    // retains the currently visible source section even when the edited line
    // loses/gains hundreds of pixels of wrapping; no ad-hoc scrollTop write.
    const scrollAnchor=editor.scrollSnapshot()
      .map(ChangeSet.of([localChange],editor.state.doc.length));
    editor.dispatch({changes:localChange,
      effects:[scrollAnchor,structureEffect.of(planned.blocks),blockTextEffect.of(true)],
      selection:{anchor:caret}});
    if(actualText().find(item=>item.logicalId===id)?.markdownText!==nextText)
      throw Error('PDF 文本回写未与逻辑块精确对齐');
    return inserted.length;
  };
  const applyTableRecovery=candidates=>{
    if(ownedLF)throw Error('真实换行模式的表格恢复待兼容验收');
    if(!loaded||dirty)throw Error('请先保存正文或结构后再恢复表格');
    if(!Array.isArray(candidates)||!candidates.length||candidates.length>10000)
      throw Error('表格恢复清单无效');
    const textRows=actualText();
    const live=new Map(textRows.map(r=>[r.logicalId,r]));
    const seen=new Set(),replacement=new Map();
    // Validate EVERY requested logical ID before touching the CM6 document.
    for(const item of candidates){
      if(!Number.isSafeInteger(item.logicalId)||seen.has(item.logicalId)||
        typeof item.before!=='string'||typeof item.after!=='string'||
        /[\r\n]/.test(item.after))throw Error('表格恢复值不合法');
      seen.add(item.logicalId);
      const row=live.get(item.logicalId);
      if(!row||!['table_body','table_caption','table_footnote'].includes(row.blockType)||
        row.markdownText!==item.before||item.before===item.after)
        throw Error('表格行已编辑或来源已变化，拒绝覆盖');
      replacement.set(item.logicalId,item.after);
    }
    const planned=composeLogicalSource(textRows.map(row=>replacement.has(row.logicalId)?
      {...row,markdownText:replacement.get(row.logicalId)}:row));
    // Use the same typed one-document/StateEffect history contract as a PDF
    // structure move, but emit the normal TEXT-change signal (not structure).
    // Whole-document replacement maintains ownership of all synthetic LF:
    // inserting at an empty block's left boundary must NOT promote its pads.
    editor.dispatch({changes:{from:0,to:editor.state.doc.length,insert:planned.source},
      effects:[structureEffect.of(planned.blocks),blockTextEffect.of(true)]});
    if(!dirty)throw Error('表格恢复未进入 CM6 历史');
    return replacement.size;
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
    selectedId=row?.logicalId??null;selectedLine=line;
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
    selectedId=id;selectedLine=editor.state.doc.lineAt(pos).number;editor.focus();return true;
  };
  // Public line-edit command for business views. The immutable reference
  // and exact preimage are validated against the SAME current CM6 state.
  const replaceMdLines=(updates,{allowMultiline=false}={})=>{
    if(!loaded||!ownedLF||!Array.isArray(updates)||!updates.length)
      throw Error('MD Line 替换需要已加载的真实 LF 正文');
    const idx=getMdLineIndex(),seen=new Set(),changes=[];
    for(const u of updates){
      const line=idx.resolve(u?.ref);
      if(!line||seen.has(line.source_line)||typeof u.beforeText!=='string'||
         typeof u.afterText!=='string'||/\r/.test(u.afterText)||
         (u.afterText.includes('\n')&&(!allowMultiline||!line.md_line||u.afterText.endsWith('\n')))||
         line.md_line!==u.beforeText||u.beforeText===u.afterText)
        throw Error('MD Line 替换证据已过期或包含非法改写');
      seen.add(line.source_line);
      changes.push({from:line.from,to:line.textTo,insert:u.afterText});
    }
    changes.sort((a,b)=>a.from-b.from);
    const planned=ChangeSet.of(changes,editor.state.doc.length);
    const expected=planned.apply(editor.state.doc).toString();
    document.querySelector('#workspace .ocr-preview-md-scroll')?.v2MarkdownPreviewPort?.beforeSourceEdit?.();
    editor.dispatch({changes:planned,annotations:[Transaction.userEvent.of('input.note-convert'),isolateHistory.of('full')]});
    if(editor.state.doc.toString()!==expected)throw Error('MD Line 替换未通过原生 CM6 事务门禁');
    return changes.length;
  };
  const port=Object.freeze({
    replaceMdLines,
    setBreakPair(index,pair){
      if(index&&index!==getMdLineIndex())return false;
      editor.dispatch({effects:breakEffect.of(pair),annotations:Transaction.addToHistory.of(false)});return true;
    },
    setLatexHighlights(index,rows){
      if(index&&index!==getMdLineIndex())return false;
      editor.dispatch({effects:latexEffect.of(rows),annotations:Transaction.addToHistory.of(false)});
      return true;
    },
    focusFormula(index,row){
      if(index!==getMdLineIndex()||!index.resolve(row.source_ref))return false;
      const pos=row.source_from;
      if(!Number.isInteger(pos)||pos<0||pos>=editor.state.doc.length)return false;
      programmatic=true;
      try{editor.dispatch({selection:{anchor:pos},effects:EditorView.scrollIntoView(pos,{y:'center'})});}
      finally{programmatic=false;}
      editor.focus();return true;
    },
    load,clear,locateSourceLine,locateLogicalId,setFocusedId:id=>setFocused(blocks.find(row=>row.logicalId===id)),
    applyDrag,countMultiline,normalizeLines,applyTableRecovery,
    deleteLogicalLine,insertPdfText,getStructureRows:()=>blocks.map(({logicalId,parentId,logicalOrder,p,b,s})=>({
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
    getEditorView:()=>editor,getDoc:()=>editor.state.doc,getMdLineIndex,
    getLineAtOffset:pos=>editor.state.doc.lineAt(Math.min(Math.max(pos,0),editor.state.doc.length)).number,
    getMarkdown:()=>editor.state.doc.toString(),
    getBlocks:()=>logicalTextRows(editor.state.doc.toString(),blocks),
    getIntervals:()=>blocks.map(({logicalId,baseBlockId,logicalOrder,blockType,p,b,s,from,to,groupEndPad})=>({
      logicalId,baseBlockId,logicalOrder,blockType,p,b,s,from,to,...(ownedLF?{}:{groupEndPad})})),
    getWorkspace:()=>book,
    getState:()=>({book,loaded,dirty,readOnly:false,legacyArtificialCount:blocks.filter(r=>isSyntheticId(r.logicalId)).length,blockCount:blocks.length,
      undo:undoDepth(editor.state),redo:redoDepth(editor.state),
      ownedLF,separator:ownedLF?'':BLOCK_END,groupEndMinimum:BLOCK_END}),
    undo:onUndo,redo:onRedo,
  });
  host.v2SourcePort=port;
  refresh();
  return {dispose(){undoButton?.removeEventListener('click',onUndo);
    redoButton?.removeEventListener('click',onRedo);lineGutter.dispose();
    delete host.v2SourcePort;editor.destroy();},
    layout:()=>editor.requestMeasure()};
}
