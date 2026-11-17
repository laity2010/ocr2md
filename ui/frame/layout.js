/** Minimal first-class Frame API: Dockview shell, no CMD/SQL/Media reads or writes. */
import {createDockview,themeAbyss} from 'dockview';
import {EditorState,StateField,StateEffect,Compartment,Transaction} from '@codemirror/state';
import {EditorView,Decoration} from '@codemirror/view';
import {documentChanged} from '../view-store.js';
import {createFootnotePopover} from '../footnote-popover.js';
import {basicSetup} from 'codemirror';
import {undo,redo,undoDepth,redoDepth} from '@codemirror/commands';
import {markdown,markdownLanguage} from '@codemirror/lang-markdown';
import {syntaxHighlighting} from '@codemirror/language';
import {oneDarkHighlightStyle} from '@codemirror/theme-one-dark';
import {nativeIOSBasicSetup,isIOSWebKit} from '../ios-native-selection.js';
import {mineruCommentFolding,foldInitialMineruComments} from '../mineru-comment-folding.js';
import {obsidianMarkdown} from '../obsidian-markdown.js';
import {obsidianSourceSyntax} from '../obsidian-source-syntax.js';
import {obsidianHeadingMarkers} from '../obsidian-heading-markers.js';
import {createMdLineGutter,physicalLineDeleteRange} from './md-line-gutter.js';
import {AllCommunityModule,ModuleRegistry,createGrid,themeQuartz} from 'ag-grid-community';
import 'dockview/dist/styles/dockview.css';
import '../workspace.css';
import '../outline-grid.css';
import '../ag-enum-filter-shared.css';
import '../settings-module.css';
import '../pdf-preview.css';
ModuleRegistry.registerModules([AllCommunityModule]);
// Optional Frame pane extension: registered by an experimental entry BEFORE
// bootstrapping the shared shell. The frame remains data-free without one.
let pdfPaneMount=null;
export function registerFramePdfPane(mount){
  if(pdfPaneMount||typeof mount!=='function')throw Error('PDF pane mount already registered or invalid');
  pdfPaneMount=mount;
}

const agTheme=themeQuartz.withParams({accentColor:'#569d79',backgroundColor:'#2f383e',
  foregroundColor:'#d3c6aa',headerBackgroundColor:'#272f34',headerTextColor:'#d3c6aa',
  borderColor:'#525c62',fontFamily:'"OCR2MD Sarasa",monospace',fontSize:13,spacing:3});

// Structured SQL rows live in CM6 StateField. AG receives a projection of this
// state, never becoming the mutable authority for Span content or selection.
const loadTableRows=StateEffect.define();
const selectTableRow=StateEffect.define();
const patchTableRows=StateEffect.define();
// The generic Frame knows only that a structured runtime value exists.
// Lab OCR supplies the reducer; CM6 owns the single current state. No
// OCR/SQLite business import is permitted in this shared Frame module.
const setStructuredRuntime=StateEffect.define();
const structuredRuntimeField=StateField.define({
  create:()=>null,
  update(value,transaction){
    for(const effect of transaction.effects)
      if(effect.is(setStructuredRuntime))value=effect.value;
    return value;
  },
});
const tableStateField=StateField.define({
  create:()=>({rows:[],selectedId:null}),
  update(value,transaction){
    for(const effect of transaction.effects){
      if(effect.is(loadTableRows))value={rows:effect.value,selectedId:null};
      if(effect.is(selectTableRow))value={...value,selectedId:effect.value};
      if(effect.is(patchTableRows)){
        const updated=new Map(effect.value.map(row=>[String(row.block_id),row]));
        value={...value,rows:value.rows.map(row=>updated.has(String(row.block_id))?
          {...row,...updated.get(String(row.block_id))}:row)};
      }
    }
    return value;
  },
});
function mountEmptySource(host){
  // Main's existing CM6 editor setup, palette, decorations and native iOS
  // selection. Lab-specific StateFields remain the sole document authority.
  const nativeIOSSelection=isIOSWebKit();
  host.classList.toggle('ocr-ios-native-selection',nativeIOSSelection);
  const setMdRuntime=StateEffect.define();
  const setMdFocusLine=StateEffect.define();
  const setMdFormulaRange=StateEffect.define();
  const setMdAllFormulaRanges=StateEffect.define();
  const setMdReviewPair=StateEffect.define();
  const setMdNoteRange=StateEffect.define();
  const deletedMdLine=StateEffect.define();
  const mdFocusField=StateField.define({
    create:()=>Decoration.none,
    update(value,tr){
      value=value.map(tr.changes);
      for(const effect of tr.effects){
        if(effect.is(setMdFocusLine)){
          const line=effect.value;
          value=Number.isInteger(line)&&line>=1&&line<=tr.newDoc.lines?
            Decoration.set([Decoration.line({class:'ocr-four-pane-source-active'})
              .range(tr.newDoc.line(line).from)]):Decoration.none;
        }
      }
      return value;
    },
    provide:field=>EditorView.decorations.from(field),
  });
  const mdAllFormulaField=StateField.define({
    create:()=>Decoration.none,
    update(value,tr){
      value=tr.docChanged?Decoration.none:value.map(tr.changes);
      for(const effect of tr.effects)if(effect.is(setMdAllFormulaRanges)){
        const ranges=[];
        for(const {from,to} of effect.value??[]){
          if(Number.isInteger(from)&&Number.isInteger(to)&&from>=0&&
             to>from&&to<=tr.newDoc.length)
            ranges.push(Decoration.mark({class:'ocr-latex-view-formula-all'}).range(from,to));
        }
        value=Decoration.set(ranges.sort((a,b)=>a.from-b.from||a.to-b.to));
      }
      return value;
    },
    provide:field=>EditorView.decorations.from(field),
  });
  const mdReviewPairField=StateField.define({
    create:()=>Decoration.none,
    update(value,tr){
      value=tr.docChanged?Decoration.none:value.map(tr.changes);
      for(const effect of tr.effects)if(effect.is(setMdReviewPair)){
        const pair=effect.value,ranges=[];
        for(const side of ['before','after']){
          const item=pair?.[side];
          if(!Number.isInteger(item?.lineNo)||item.lineNo<1||
             item.lineNo>tr.newDoc.lines||typeof item.token!=='string'||
             !/^(?:[A-Za-z]{2,60}-?|[1-9][0-9]{0,3}[A-Z]{1,5})$/.test(item.token))continue;
          const line=tr.newDoc.line(item.lineNo);
          const source=line.text;
          const index=side==='before'?source.trimEnd().lastIndexOf(item.token):
            source.search(/\S/);
          if(index<0||source.slice(index,index+item.token.length)!==item.token||
             (side==='before'&&index+item.token.length!==source.trimEnd().length))continue;
          ranges.push(Decoration.mark({class:'ocr-block-break-source-'+side})
            .range(line.from+index,line.from+index+item.token.length));
        }
        value=ranges.length?Decoration.set(ranges.sort((a,b)=>a.from-b.from)):Decoration.none;
      }
      return value;
    },
    provide:field=>EditorView.decorations.from(field),
  });
  const mdNoteFocusField=StateField.define({
    create:()=>Decoration.none,
    update(value,tr){
      value=tr.docChanged?Decoration.none:value.map(tr.changes);
      for(const effect of tr.effects)if(effect.is(setMdNoteRange)){
        const range=effect.value;
        value=range&&Number.isInteger(range.from)&&Number.isInteger(range.to)&&
          range.from>=0&&range.to>range.from&&range.to<=tr.newDoc.length?
          Decoration.set([Decoration.mark({class:'ocr-note-match-source-active'})
            .range(range.from,range.to)]):Decoration.none;
      }
      return value;
    },
    provide:field=>EditorView.decorations.from(field),
  });
  const mdFormulaFocusField=StateField.define({
    create:()=>Decoration.none,
    update(value,tr){
      // Never retain an out-of-date formula underline after a source edit.
      value=tr.docChanged?Decoration.none:value.map(tr.changes);
      for(const effect of tr.effects){
        if(effect.is(setMdFormulaRange)){
          const range=effect.value;
          value=range&&range.from>=0&&range.to>range.from&&
            range.to<=tr.newDoc.length?
            Decoration.set([Decoration.mark({class:'ocr-four-pane-formula-active cm-selectionMatch'+
              (range.kind==='inline'?' ocr-four-pane-formula-inline':'')})
              .range(range.from,range.to)]):Decoration.none;
        }
      }
      return value;
    },
    provide:field=>EditorView.decorations.from(field),
  });
  let programmaticMdSelection=false;
  const mdEditable=new Compartment();
  let mdReducer=null,mdOnChange=null,mdOnSelection=null;
  const mdField=StateField.define({
    create:()=>null,
    update(value,tr){
      for(const effect of tr.effects)if(effect.is(setMdRuntime))return effect.value;
      if(!value||!tr.docChanged||!mdReducer)return value;
      const removed=tr.effects.find(effect=>effect.is(deletedMdLine));
      return mdReducer(value,tr.newDoc.toString(),{
        deletedLine:removed?.value??null});
    },
  });
  let editor;
  const deleteMdLine=lineId=>{
    const row=editor.state.field(mdField)?.rows.find(r=>r.line_id===lineId);
    if(!row)return false;
    const range=physicalLineDeleteRange(editor.state.doc,row.line_no);
    if(!range||range.from===range.to)return false;
    const rows=editor.state.field(mdField).rows;
    const i=rows.findIndex(r=>r.line_id===lineId);
    editor.dispatch({changes:range,effects:deletedMdLine.of({
      row:{...row},previousId:rows[i-1]?.line_id??null,
      followingId:rows[i+1]?.line_id??null,
    }),annotations:Transaction.userEvent.of('delete.line')});
    return true;
  };
  const lineGutter=createMdLineGutter({
    isMarkdown:state=>Boolean(state.field(mdField)),
    focusLineAt:state=>{
      // Reuse the existing four-pane orange CM6 source-line decoration as
      // the sole focus authority; cursor moves publish into this same field.
      const marker=state.field(mdFocusField).iter();
      return marker.value?state.doc.lineAt(marker.from).number:null;
    },
    lineIdAt:lineNo=>editor?.state.field(mdField)?.rows[lineNo-1]?.line_id??null,
    onDelete:deleteMdLine,
  });
  const base=nativeIOSSelection?nativeIOSBasicSetup:basicSetup;
  // CodeMirror's stock lineNumbers() is the first extension in BOTH current
  // standard/iOS base setups. Replace only that extension, retaining all
  // mature editing, history, native iOS selection, folding and keybindings.
  editor=new EditorView({state:EditorState.create({doc:'',extensions:[
    mdEditable.of([EditorState.readOnly.of(true),EditorView.editable.of(false)]),
    tableStateField,structuredRuntimeField,mdField,mdFocusField,mdFormulaFocusField,mdAllFormulaField,mdReviewPairField,mdNoteFocusField,
    lineGutter.extension,...base.slice(1),
    EditorView.lineWrapping,EditorView.contentAttributes.of({spellcheck:'false'}),
    markdown({base:markdownLanguage}),mineruCommentFolding,
    obsidianMarkdown,syntaxHighlighting(oneDarkHighlightStyle,{fallback:true}),
    obsidianSourceSyntax,obsidianHeadingMarkers,
    EditorView.updateListener.of(update=>{
      const md=update.state.field(mdField);
      if(!md)return;
      if(update.docChanged&&!update.transactions.some(tr=>
        tr.effects.some(e=>e.is(setMdRuntime))))
        mdOnChange?.(md);
      if(update.selectionSet||update.docChanged){
        const line=update.state.doc.lineAt(update.state.selection.main.head).number;
        // Only a user gesture starts a new navigation event. CM6 updates
        // triggered by AG/PDF, undo replay and async SQL reload are followers.
        const userEvent=update.transactions.some(tr=>tr.annotation(Transaction.userEvent));
        if(!programmaticMdSelection&&userEvent)
          mdOnSelection?.(line,{docChanged:update.docChanged});
      }
    }),
  ]}),parent:host});
  host.ocrCmTable=Object.freeze({
    load(rows){editor.dispatch({effects:loadTableRows.of(rows)});},
    runtime(){return editor.state.field(structuredRuntimeField);},
    replaceRuntime(next){editor.dispatch({effects:setStructuredRuntime.of(next)});},
    reduceRuntime(reducer){
      if(typeof reducer!=='function')throw Error('CM6 结构状态变更器必须是纯函数');
      const prior=editor.state.field(structuredRuntimeField);
      const result=reducer(prior);
      if(!result||!Object.hasOwn(result,'state'))
        throw Error('CM6 结构状态变更结果无效');
      if(result.state!==prior)editor.dispatch({effects:setStructuredRuntime.of(result.state)});
      return result;
    },
    patchBlockRows(changedRows){editor.dispatch({effects:patchTableRows.of(changedRows)});},
    rows(){return editor.state.field(tableStateField).rows;},
    clearTableSelection(){editor.dispatch({effects:selectTableRow.of(null)});},
    mdRuntime(){return editor.state.field(mdField);},
    editorView(){return editor;},
    setReviewPair(pair=null){
      editor.dispatch({effects:setMdReviewPair.of(pair)});
      return Boolean(pair);
    },
    setLatexHighlights(rows=[]){
      const ranges=rows.filter(row=>Number.isInteger(row?.source_from)&&
        Number.isInteger(row?.source_to)&&row.source_to>row.source_from)
        .map(row=>({from:row.source_from,to:row.source_to}));
      editor.dispatch({effects:setMdAllFormulaRanges.of(ranges)});
      return ranges.length;
    },

    loadMarkdown(runtime,{reconcile,onChange,onSelection}={}){
      lineGutter.close();
      if(!runtime?.rows?.length||typeof reconcile!=='function')throw Error('MD 初始化无效');
      mdReducer=reconcile;mdOnChange=onChange??null;mdOnSelection=onSelection??null;
      const text=runtime.rows.map(r=>r.text).join('\n');
      editor.dispatch({changes:{from:0,to:editor.state.doc.length,insert:text},
        effects:[setMdRuntime.of(runtime),mdEditable.reconfigure([
          EditorState.readOnly.of(false),EditorView.editable.of(true)])],
        annotations:Transaction.addToHistory.of(false)});
      foldInitialMineruComments(editor);
    },
    setMarkdownRuntime(next){
      if(!next?.rows?.length)throw Error('MD 替换运行态无效');
      const text=next.rows.map(r=>r.text).join('\n');
      const old=editor.state.doc.toString();
      let prefix=0;
      while(prefix<old.length&&prefix<text.length&&old[prefix]===text[prefix])prefix++;
      let suffix=0;
      while(suffix<old.length-prefix&&suffix<text.length-prefix&&
        old[old.length-suffix-1]===text[text.length-suffix-1])suffix++;
      editor.dispatch({changes:{from:prefix,to:old.length-suffix,
        insert:text.slice(prefix,text.length-suffix)},
        effects:setMdRuntime.of(next),
        annotations:Transaction.addToHistory.of(false)});
    },
    clearMarkdown(){
      lineGutter.close();
      mdReducer=null;mdOnChange=null;mdOnSelection=null;
      editor.dispatch({changes:{from:0,to:editor.state.doc.length,insert:''},
        effects:[setMdRuntime.of(null),setMdFocusLine.of(null),mdEditable.reconfigure([
          EditorState.readOnly.of(true),EditorView.editable.of(false)])],
        annotations:Transaction.addToHistory.of(false)});
    },
    focusMdNoteRange({lineNo,from,to,focus=false}={}){
      if(!editor.state.field(mdField)||!Number.isInteger(lineNo)||
         lineNo<1||lineNo>editor.state.doc.lines||
         !Number.isInteger(from)||!Number.isInteger(to))return false;
      const line=editor.state.doc.line(lineNo);
      if(from<0||to<=from||to>line.length)return false;
      const start=line.from+from;
      programmaticMdSelection=true;
      try{editor.dispatch({selection:{anchor:start},
        effects:[setMdNoteRange.of({from:start,to:line.from+to}),
          EditorView.scrollIntoView(start,{y:'center'})]});}
      finally{programmaticMdSelection=false;}
      if(focus)editor.focus();return true;
    },
    clearMdNoteRange(){editor.dispatch({effects:setMdNoteRange.of(null)});},
    focusMdLine(lineNo,{focus=true}={}){
      if(!editor.state.field(mdField)||!Number.isInteger(lineNo)||
         lineNo<1||lineNo>editor.state.doc.lines)return false;
      const position=editor.state.doc.line(lineNo).from;
      programmaticMdSelection=true;
      try{editor.dispatch({selection:{anchor:position},
        effects:[setMdFormulaRange.of(null),setMdNoteRange.of(null),
          EditorView.scrollIntoView(position,{y:'center'})]});}
      finally{programmaticMdSelection=false;}
      if(focus)editor.focus();return true;
    },
    focusMdFormula({lineNo,column,endColumn,kind=null,focus=false}={}){
      // Formula-level offset and visible range (not merely the physical line)
      // use UTF-16 CodeMirror positions; this is a decoration, not an edit.
      if(!editor.state.field(mdField)||!Number.isInteger(lineNo)||
         lineNo<1||lineNo>editor.state.doc.lines||
         !Number.isInteger(column)||column<0)return false;
      const line=editor.state.doc.line(lineNo);
      if(column>=line.length||!([null,'inline','display'].includes(kind)))return false;
      const end=Number.isInteger(endColumn)&&endColumn>column&&
        endColumn<=line.length?endColumn:column+1;
      const position=line.from+column;
      programmaticMdSelection=true;
      try{editor.dispatch({selection:{anchor:position},
        effects:[setMdFormulaRange.of({from:position,to:line.from+end,kind}),
          EditorView.scrollIntoView(position,{y:'center'})]});}
      finally{programmaticMdSelection=false;}
      if(focus)editor.focus();return true;
    },
    markMdLine(lineNo,{reveal=false}={}){
      if(!editor.state.field(mdField))return false;
      if(lineNo!==null&&(!Number.isInteger(lineNo)||lineNo<1||
          lineNo>editor.state.doc.lines))return false;
      const current=editor.state.field(mdFocusField).iter();
      const prior=current.value?editor.state.doc.lineAt(current.from).number:null;
      // A popup belongs to the highlighted focus line, never to a stale one.
      if(prior!==lineNo)lineGutter.close();
      const effects=[setMdFocusLine.of(lineNo),setMdFormulaRange.of(null),setMdNoteRange.of(null)];
      if(reveal&&lineNo!==null)effects.push(EditorView.scrollIntoView(
        editor.state.doc.line(lineNo).from,{y:'center'}));
      editor.dispatch({effects});
      return true;
    },
    insertMdAtCursor(text){
      const md=editor.state.field(mdField);
      if(!md||typeof text!=='string'||!text.trim()||text.includes('\r'))
        throw Error('CM6 源码未就绪或 OCR 文本无效');
      // A PDF click does not move the CM6 selection; insert at its existing
      // caret head without replacing a selected range or rebinding BlockID.
      const at=editor.state.selection.main.head;
      editor.dispatch({changes:{from:at,insert:text},
        selection:{anchor:at+text.length},
        annotations:Transaction.userEvent.of('input.pdf-extract')});
      editor.focus();
      return true;
    },
    deleteMdLine(lineId){return deleteMdLine(lineId);},
    mergeMdBlockBreak(plan){
      const runtime=editor.state.field(mdField);
      const before=runtime?.rows.find(row=>row.line_id===plan?.beforeLineId);
      const after=runtime?.rows.find(row=>row.line_id===plan?.afterLineId);
      if(!before||!after||before.block_id!==plan.beforeBlockId||
         after.block_id!==plan.afterBlockId||
         before.line_no+1!==after.line_no||before.text!==plan.beforeText||
         after.text!==plan.afterText||!plan.joinedText?.trim())
        throw Error('CM6 断块原文或身份已变化，拒绝过期合并');
      const lineA=editor.state.doc.line(before.line_no);
      const lineB=editor.state.doc.line(after.line_no);
      if(lineA.text!==before.text||lineB.text!==after.text)
        throw Error('CM6 文档尚未与行表对齐，拒绝合并');
      // One history entry, TWO simultaneous text changes. Keep the newline
      // and B's physical line so reconcileMdText preserves both LineIDs.
      editor.dispatch({changes:[
        {from:lineA.from,to:lineA.to,insert:plan.joinedText},
        {from:lineB.from,to:lineB.to,insert:''},
      ],annotations:Transaction.userEvent.of('input.block-break-merge')});
      const next=editor.state.field(mdField);
      if(!next?.rows.some(row=>row.line_id===after.line_id&&
            row.block_id===after.block_id&&row.text===''))
        throw Error('CM6 未保留后块空行，请检查合并事务');
      return true;
    },
    convertMdNotePair(plan){
      const runtime=editor.state.field(mdField);
      if(!runtime||!Array.isArray(plan?.updates)||
         plan.updates.length<1||plan.updates.length>102)
        throw Error('CM6 注释转换计划无效');
      const changes=[];
      for(const patch of plan.updates){
        const current=runtime.rows.find(row=>row.line_id===patch.lineId);
        if(!current||current.line_no!==patch.lineNo||
           current.block_id!==patch.blockId||current.text!==patch.beforeText||
           typeof patch.afterText!=='string'||/[\r\n]/.test(patch.afterText)||
           patch.afterText===patch.beforeText)
          throw Error('注释转换的 LineID/BlockID/原文已变化，拒绝 CM6 写入');
        const line=editor.state.doc.line(current.line_no);
        if(line.text!==patch.beforeText)throw Error('CM6 注释转换文档未对齐');
        changes.push({from:line.from,to:line.to,insert:patch.afterText});
      }
      changes.sort((a,b)=>a.from-b.from);
      if(changes.some((change,i)=>i&&change.from<=changes[i-1].to))
        throw Error('CM6 注释转换范围重叠');
      // One atomic CM6 history entry, no physical newline is added/removed.
      // Existing mdOnChange and SQL md-save/CAS handle persistence.
      editor.dispatch({changes,
        annotations:Transaction.userEvent.of('input.note-footnote-convert')});
      const next=editor.state.field(mdField);
      for(const patch of plan.updates){
        const row=next?.rows.find(item=>item.line_id===patch.lineId);
        if(row?.block_id!==patch.blockId||row?.text!==patch.afterText)
          throw Error('CM6 注释转换后行身份校验失败');
      }
      return true;
    },
    editMdLine(lineId,text){
      const md=editor.state.field(mdField);
      const row=md?.rows.find(r=>r.line_id===lineId);
      if(!row||typeof text!=='string'||/[\r\n]/.test(text))
        throw Error('MD 行内容或 LineID 无效');
      if(row.text===text)return false;
      const line=editor.state.doc.line(row.line_no);
      editor.dispatch({changes:{from:line.from,to:line.to,insert:text}});
      return true;
    },
    mdDocument(){return editor.state.doc.toString();},
    undoMarkdown(){return undo(editor);},
    redoMarkdown(){return redo(editor);},
    markdownHistory(){return {undo:undoDepth(editor.state),redo:redoDepth(editor.state)};},
    select(row,{focus=true}={}){
      if(!row)return;
      const md=editor.state.field(mdField);
      if(md){
        const line=row.line_id!=null?
          md.rows.find(r=>r.line_id===row.line_id)?.line_no:
          row.block_id!=null?
            md.rows.find(r=>r.block_id===Number(row.block_id))?.line_no:null;
        if(line&&focus)this.focusMdLine(line);
        editor.dispatch({effects:selectTableRow.of(
          row.line_id??row.span_id??row.block_id??row.id??null)});
        return;
      }
      // Block selection shows the complete original per-block structure,
      // including every Line and Span. Child blocks live in their own rows.
      const raw=row.block_json ?? row.content ?? row.html ?? row.image_path ?? row.text_preview ?? '';
      let value=typeof raw==='string'?raw:'';
      if(row.block_json){
        try{value=JSON.stringify(JSON.parse(row.block_json),null,2);}catch{}
      }
      editor.dispatch({
        changes:{from:0,to:editor.state.doc.length,insert:value},
        effects:selectTableRow.of(row.span_id??row.block_id??row.id??null),
      });
    },
    clear(){editor.dispatch({
      ...(editor.state.field(mdField)?{}:{changes:{from:0,to:editor.state.doc.length,insert:''}}),
      effects:loadTableRows.of([])});},
    selected(){return editor.state.field(tableStateField).selectedId;},
  });
  return {dispose(){lineGutter.dispose();delete host.ocrCmTable;editor.destroy();},
    layout:()=>editor.requestMeasure()};
}
function mountEmptyGrid(host){
  const columnDefs=[
    {field:'pbs',headerName:'PBS',width:115},
    {field:'usable',headerName:'可用',width:72},
    {field:'type',headerName:'类型',width:95},
    {field:'content',headerName:'文本块',flex:1},
  ];
  let selectedListener=()=>{},filterListener=()=>{};
  let blockData=new Map();
  let mdData=new Map();
  // The switch belongs to the AG toolbar, not to the AG Grid column model.
  const allPagesControl=host.closest('.ocr-outline-pane')?.querySelector('.ocr-ag-all-pages');
  const allPagesInput=allPagesControl?.querySelector('input')??null;
  let formulaData=new Map(),noteData=new Map(),currentRowHeight=35;
  let pageScope=null,pdfPage=1,showAllPages=false;
  let expandPageOnCategory=null,lastCategoryModel='null';
  const isVisible=row=>row?.absorbed_into_block_id==null;
  const updatePbsModel=checked=>{
    const model={...(grid.getFilterModel()||{})};
    if(checked)delete model.pbs;
    else model.pbs={values:['p'+pdfPage]};
    grid.setFilterModel(Object.keys(model).length?model:null);
  };
  const toggleAllPages=checked=>{
    if(!pageScope||showAllPages===checked)return;
    showAllPages=checked;
    updatePbsModel(checked); // one AG column filter, no parallel page state
  };
  const onAllPagesChange=()=>toggleAllPages(allPagesInput.checked);
  allPagesInput?.addEventListener('change',onAllPagesChange);
  const grid=createGrid(host,{theme:agTheme,headerHeight:33,rowHeight:35,
    rowSelection:{mode:'singleRow',checkboxes:false,headerCheckbox:false,enableClickSelection:true},
    onRowClicked:event=>selectedListener(event.data),
    onFilterChanged:event=>{
      const model=event.api.getFilterModel();
      const category=JSON.stringify(expandPageOnCategory?model?.[expandPageOnCategory]??null:null);
      // A user-selected Block Type searches the whole book. Reuse the
      // existing AG PBS filter and 全部 checkbox; never introduce new UI.
      if(pageScope&&expandPageOnCategory&&model?.pbs&&
         Array.isArray(model?.[expandPageOnCategory]?.values)&&
         model[expandPageOnCategory].values.length>0&&category!==lastCategoryModel){
        lastCategoryModel=category;
        const widened={...model};delete widened.pbs;
        event.api.setFilterModel(widened);
        return;
      }
      lastCategoryModel=category;
      if(pageScope){
        showAllPages=!Boolean(model?.pbs);
        if(allPagesInput)allPagesInput.checked=showAllPages;
      }
      filterListener(model);
    },
    suppressNoRowsOverlay:true,overlayNoRowsTemplate:' ',
    defaultColDef:{resizable:true,sortable:false,suppressMovable:true},
    columnDefs,rowData:[]});
  // The AG pane owns the Grid API. Other modules may only update rows/columns
  // through this explicit, narrow component boundary; no private AG DOM access.
  host.ocrSqlGrid=Object.freeze({
    clearSelection(){grid.deselectAll();},
    // Read-only column contract: includes AG's horizontally virtualized columns.
    columnFields(){return grid.getColumnDefs()?.map(column=>column.field)??[];},
    show({rows,columns,onRowSelected,onFilterChanged,
    initialFilterModel=null,pageScope:scope=null,allPagesInitially=false,
    expandPageOnCategory:category=null,rowHeight=35}){
    selectedListener=onRowSelected??(()=>{});
    pageScope=scope;pdfPage=scope?.page??1;showAllPages=Boolean(scope&&allPagesInitially);
    expandPageOnCategory=category;lastCategoryModel='null';
    if(allPagesControl)allPagesControl.hidden=!pageScope;
    if(allPagesInput)allPagesInput.checked=showAllPages;
    // The full source atoms remain owned by CM6; the Grid shows only
    // non-absorbed blocks. Parent wrappers are retained for undo/audit.
    blockData=new Map(rows.filter(r=>r?.block_id!=null)
      .map(r=>[String(r.block_id),r]));
    mdData=new Map(rows.filter(r=>r?.line_id!=null)
      .map(r=>[String(r.line_id),r]));
    noteData=new Map(rows.filter(r=>r?.note_row_id!=null)
      .map(r=>[String(r.note_row_id),r]));
    formulaData=new Map(rows.filter(r=>r?.formula_id!=null)
      .map(r=>[String(r.formula_id),r]));
    if(rowHeight!==currentRowHeight){
      currentRowHeight=rowHeight;grid.setGridOption('rowHeight',rowHeight);
    }
    // Ignore transient filter-change events while replacing a whole SQL table.
    filterListener=()=>{};
    // Different SQLite tables must not inherit one another's AG filters.
    grid.setFilterModel(null);
    grid.setGridOption('columnDefs',columns);
    // AG Grid preserves prior per-column pinned state across reconfiguration.
    // When MD -> title reuses line_no and pbs, explicitly apply this view's
    // requested order and pinning; otherwise the former left-pinned indexes
    // remain ahead of the outline text despite the new columnDefs order.
    grid.applyColumnState({state:columns.filter(col=>col.field).map(col=>({
      colId:col.field,pinned:col.pinned??null,
    })),applyOrder:true});
    if(columns.some(column=>column.field==='note_row_id')){
      // A new Note Match view must not inherit the MD line or previous
      // schema's sorting. Only when first opening the view: later AG header
      // sorting by PBS/line remains the user's choice across row patches.
      grid.applyColumnState({state:[{colId:'number',sort:'asc',sortIndex:0}],
        defaultState:{sort:null,sortIndex:null}});
    }
    grid.setGridOption('rowData',rows.filter(isVisible));
    // Apply the caller's startup selection through AG Grid's public filter
    // model before subscribing to changes; the real checkbox UI stays owner.
    if(initialFilterModel)grid.setFilterModel(initialFilterModel);
    if(pageScope&&!allPagesInitially)updatePbsModel(false);
    if(allPagesInput)allPagesInput.checked=showAllPages;
    filterListener=onFilterChanged??(()=>{});
    filterListener(grid.getFilterModel());
    // Avoid carrying horizontal scroll from the previous table into the new
    // schema (AG virtualizes columns left outside the visible range).
    if(columns[0]?.field){
      const first=columns[0].field;
      grid.ensureColumnVisible(first,'start');
      requestAnimationFrame(()=>grid.ensureColumnVisible(first,'start'));
    }
  },setPdfPage(page){
    if(!Number.isSafeInteger(page)||page<1||pdfPage===page)return false;
    pdfPage=page;
    if(pageScope&&!showAllPages)updatePbsModel(false);
    return true;
  },patchFormulaRows(rows){
    // Formula IDs are not MD LineIDs: a physical line can contain multiple
    // formulas. Patch only changed cells and retain the AG filter/scroll.
    const next=new Map(rows.map(r=>[String(r.formula_id),r]));
    const remove=[],add=[];
    grid.forEachNode(node=>{
      const id=String(node.data?.formula_id??'');
      if(!id)return;
      const updated=next.get(id);
      if(!updated)remove.push(node.data);
      else if(Object.entries(updated).some(([field,value])=>node.data?.[field]!==value))
        node.updateData({...node.data,...updated});
    });
    for(const [id,row] of next)if(!formulaData.has(id))add.push(row);
    formulaData=next;
    if(remove.length||add.length)grid.applyTransaction({remove,add});
    if(Object.keys(grid.getFilterModel()??{}).length)grid.onFilterChanged();
  },patchNoteRows(rows){
    // Note citations are many-to-one: a single LineID may occur in several
    // AG rows. The stable projection key is note_row_id, not LineID/PBS.
    const next=new Map(rows.map(r=>[String(r.note_row_id),r]));
    const remove=[],add=[];
    grid.forEachNode(node=>{
      const id=String(node.data?.note_row_id??'');
      if(!id)return;
      const updated=next.get(id);
      if(!updated)remove.push(node.data);
      else if(Object.entries(updated).some(([field,value])=>node.data?.[field]!==value))
        node.updateData({...node.data,...updated});
    });
    for(const [id,row] of next)if(!noteData.has(id))add.push(row);
    noteData=next;
    if(remove.length||add.length)grid.applyTransaction({remove,add});
    if(Object.keys(grid.getFilterModel()??{}).length)grid.onFilterChanged();
  },patchMdRows(rows){
    const next=new Map(rows.map(r=>[String(r.line_id),r]));
    const remove=[],add=[];
    grid.forEachNode(node=>{
      const id=String(node.data?.line_id??'');
      if(!id)return;
      const current=next.get(id);
      if(!current)remove.push(node.data);
      else if(Object.entries(current).some(([field,value])=>node.data?.[field]!==value))
        node.updateData({...node.data,...current});
    });
    for(const [id,row] of next)if(!mdData.has(id))add.push(row);
    mdData=next;
    if(remove.length||add.length)grid.applyTransaction({remove,add});
    // Only an active filter needs recomputing after text becomes blank/nonblank.
    // Do not replace rowData or reset the user's filter selection.
    if(Object.keys(grid.getFilterModel()??{}).length)grid.onFilterChanged();
    else grid.refreshClientSideRowModel?.('sort');
  },patchBlockRows(changedRows){
    const changed=new Map(changedRows.map(r=>[String(r.block_id),r]));
    const remove=[],add=[];
    for(const [key,patch] of changed){
      const old=blockData.get(key);
      if(!old)continue;
      const next={...old,...patch};
      blockData.set(key,next);
      if(isVisible(old)&&!isVisible(next)){
        // AG node.updateData replaces the row object identity. Remove via
        // the CURRENT AG-owned row, not a stale CM projection reference.
        grid.forEachNode(node=>{
          if(String(node.data?.block_id)===key)remove.push(node.data);
        });
      }
      if(!isVisible(old)&&isVisible(next))add.push(next);
    }
    if(remove.length||add.length)grid.applyTransaction({remove,add});
    grid.forEachNode(node=>{
      const patch=changed.get(String(node.data?.block_id));
      if(patch&&isVisible(blockData.get(String(node.data?.block_id))))
        node.updateData({...node.data,...patch});
    });
    // A structural move can change PBS pN while leaving the physical page
    // intact. Reapply the existing PBS filter, not a second page predicate.
    if(pageScope)grid.onFilterChanged();
    else grid.refreshClientSideRowModel?.('sort');
  },selectById({field,id,focusColumn=field,focus=true,preserveFilters=false}){
    if(typeof field!=='string'||!field||id==null)return null;
    const wanted=String(id);
    const lookup=()=>{
      for(let index=0;index<grid.getDisplayedRowCount();index++){
        const node=grid.getDisplayedRowAtIndex(index);
        if(node?.data&&String(node.data[field])===wanted)return {node,index};
      }
      return null;
    };
    let selected=lookup();
    if(!selected&&!preserveFilters){
      // A PDF-visible Block may be hidden by unrelated AG filters (e.g.
      // block_type). Preserve the authoritative block_group filter.
      const current=grid.getFilterModel()||{};
      const remaining=Object.fromEntries(Object.entries(current).filter(([key])=>
        key==='block_group'||(pageScope&&key==='pbs')));
      if(Object.keys(current).length!==Object.keys(remaining).length){
        grid.setFilterModel(remaining);selected=lookup();
      }
    }
    if(!selected)return null;
    grid.ensureIndexVisible(selected.index,'middle');
    const column=grid.getColumn(focusColumn)?focusColumn:grid.getAllDisplayedColumns()[0]?.getColId();
    if(focus&&column){
      grid.ensureColumnVisible(column);grid.setFocusedCell(selected.index,column);
    }
    selected.node.setSelected(true,true);
    return selected.node.data;
  },clear(){selectedListener=()=>{};filterListener=()=>{};pageScope=null;showAllPages=false;
    expandPageOnCategory=null;lastCategoryModel='null';
    mdData.clear();blockData.clear();formulaData.clear();noteData.clear();
    if(allPagesControl)allPagesControl.hidden=true;
    if(allPagesInput)allPagesInput.checked=false;
    grid.setGridOption('rowData',[]);grid.setGridOption('columnDefs',columnDefs);}});
  return {dispose(){allPagesInput?.removeEventListener('change',onAllPagesChange);
    delete host.ocrSqlGrid;grid.destroy();},layout:()=>{}};
}
function blankPane(name,onSplit,onModuleChange,moduleLabel='空白框架',pdfSlot=null,onStatus=()=>{},
  agViewOptions=[],onAgViewChange=()=>{}){
  const element=document.createElement('div');
  let owned=null;
  if(name==='outline'){
    element.className='ocr-outline-pane';
    // The AG-owned module strip belongs to the left pane, not the global status.
    const bar=document.createElement('div');bar.className='ocr-ag-toolbar';
    bar.setAttribute('role','toolbar');bar.setAttribute('aria-label','AG 表工具栏');
    const allPages=document.createElement('label');allPages.className='ocr-ag-all-pages';
    allPages.hidden=true;
    const allPagesCheckbox=document.createElement('input');allPagesCheckbox.type='checkbox';
    allPagesCheckbox.checked=false;allPagesCheckbox.setAttribute('aria-label','全部');
    allPages.append(allPagesCheckbox,document.createTextNode('全部'));
    const label=document.createElement('span');label.className='ocr-ag-toolbar-label';label.textContent='AG 表';
    const picker=document.createElement('select');picker.className='ocr-ag-module-select';
    if(agViewOptions.length){
      picker.setAttribute('aria-label','选择 AG 过滤视图');
      for(const {value,label} of agViewOptions)picker.add(new Option(label,value));
      picker.value=agViewOptions[0].value;
      picker.addEventListener('change',()=>onAgViewChange(picker.value));
    }else{
      picker.setAttribute('aria-label','选择模块');
      picker.add(new Option(moduleLabel,'frame'));
      picker.add(new Option('全局设置','settings'));
      const ownModule='frame';picker.value=ownModule;
      picker.addEventListener('change',()=>{
        const next=picker.value;
        picker.value=ownModule;
        onModuleChange?.(next);
      });
    }
    // Function commands are ACTIONS, not persistent select values. iPad
    // Safari can leave a native select stuck on the last value, so choosing
    // the same action again fires no change event and silently does nothing.
    const functions=document.createElement('button');
    functions.type='button';functions.className='ocr-ag-function-select';
    functions.setAttribute('aria-label','当前 AG View 功能');
    functions.setAttribute('aria-haspopup','menu');
    functions.setAttribute('aria-expanded','false');
    functions.textContent='功能 ▾';functions.disabled=true;
    const action=document.createElement('button');
    action.type='button';action.className='ocr-ag-extra-action';action.hidden=true;
    const toggleLabel=document.createElement('label');
    toggleLabel.className='ocr-ag-review-toggle';toggleLabel.hidden=true;
    const toggle=document.createElement('input');toggle.type='checkbox';
    const toggleText=document.createElement('span');
    toggleLabel.append(toggle,toggleText);
    bar.append(allPages,label,picker,functions,action,toggleLabel);element.append(bar);
    const grid=document.createElement('div');grid.className='ocr-outline-grid';
    element.append(grid);
    owned=()=>mountEmptyGrid(grid);
  }else if(name==='source'){
    element.className='ocr-source-pane ocr-source-file-source';
    const bar=document.createElement('div');bar.className='ocr-source-file-toolbar';
    const select=document.createElement('select');select.className='ocr-source-file-select';
    select.setAttribute('aria-label','源码文件导航');
    const placeholder=new Option('选择源码文件…','');placeholder.disabled=true;
    select.add(placeholder);
    const group=document.createElement('optgroup');group.label='全局设置';
    group.append(new Option('settings.json','settings'));
    select.append(group);
    select.value='';
    select.addEventListener('change',()=>{
      if(select.value==='settings')onModuleChange?.('settings');
      else if(select.value==='sql:initialize'||select.value==='sql:minerujson'||select.value==='sql:span'||select.value==='sql:block'||select.value==='sql:md')onModuleChange?.(select.value);
    });
    const actions=document.createElement('div');actions.className='ocr-source-undo-redo';
    actions.setAttribute('role','group');actions.setAttribute('aria-label','源码撤销与重做');
    const undo=document.createElement('button');undo.type='button';undo.id='undo';
    undo.textContent='↶';undo.setAttribute('aria-label','撤销');undo.title='没有绑定文档';undo.disabled=true;
    const redo=document.createElement('button');redo.type='button';redo.id='redo';
    redo.textContent='↷';redo.setAttribute('aria-label','重做');redo.title='没有绑定文档';redo.disabled=true;
    actions.append(undo,redo);
    bar.append(select,actions);element.append(bar);
    const body=document.createElement('div');body.className='ocr-cm-source frame-editor';
    body.id='editor';
    element.append(body);owned=()=>mountEmptySource(body);
  }else if(name==='preview'){
    element.className='ocr-preview-pane';element.dataset.previewMode='md';
    const bar=document.createElement('div');bar.className='ocr-preview-switchbar';
    const mode=document.createElement('select');mode.className='ocr-preview-mode';
    mode.setAttribute('aria-label','预览类型');
    mode.append(new Option('Markdown 预览','md'),new Option('PDF 原文','pdf'));
    const pdfOption=mode.querySelector('option[value="pdf"]');
    pdfOption.disabled=!pdfPaneMount;
    const split=document.createElement('label');split.className='ocr-preview-split-toggle';
    const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=false;
    checkbox.setAttribute('aria-label','切分 Markdown PDF 预览');
    checkbox.addEventListener('change',()=>onSplit?.(checkbox.checked));
    split.append(checkbox,document.createTextNode('切分'));
    // Main's existing read-only footnote reader exposes the same
    // '定位注文' and '↩ 返回注引' workflow in the Lab preview.
    const mdTools=document.createElement('div');mdTools.className='ocr-preview-mode-tools';
    mdTools.dataset.mode='md';
    const returnNote=document.createElement('button');returnNote.type='button';
    returnNote.className='ocr-preview-return-note';
    returnNote.textContent='↩ 返回注引';
    returnNote.title='返回打开注文前的 Markdown 阅读位置';
    returnNote.hidden=true;
    returnNote.addEventListener('click',()=>pdfSlot.returnToNote?.());
    mdTools.append(returnNote);
    const pdfTools=document.createElement('div');pdfTools.className='ocr-preview-mode-tools';
    pdfTools.dataset.mode='pdf';pdfTools.hidden=true;
    bar.append(mode,split,mdTools,pdfTools);element.append(bar);
    const area=document.createElement('div');area.className='ocr-preview-md-scroll ocr-markdown';
    const surface=document.createElement('div');surface.className='ocr-preview-pdf-host';
    surface.dataset.pdfTheme='dark';
    element.append(area,surface);
    element.setAttribute('aria-label','Markdown / PDF 预览');
    function setMode(next){
      // A detached PDF is already visible during split; prevent duplicates.
      if(next==='pdf'&&(!pdfPaneMount||pdfSlot.detached)){
        mode.value='md';return false;
      }
      if(next!=='md'&&next!=='pdf')return false;
      element.dataset.previewMode=next;mode.value=next;
      mdTools.hidden=next!=='md';
      if(next!=='md')pdfSlot.noteReader?.close();
      pdfTools.hidden=next!=='pdf';
      surface.setAttribute('aria-hidden',String(next!=='pdf'&&!pdfSlot.detached));
      pdfSlot.current?.relayout?.();
      return true;
    }
    mode.addEventListener('change',()=>setMode(mode.value));
    owned=()=>{
      pdfSlot.preview=Object.freeze({surface,tools:pdfTools,
        mdArea:area,returnNote,
        setMode,setSplit(enabled){
          pdfOption.disabled=Boolean(enabled)||!pdfPaneMount;
          if(enabled){
            setMode('md');
            if(pdfSlot.detached){
              // The toolbar belongs to the detached PDF, even though the
              // shared preview dropdown remains in Markdown mode.
              pdfTools.hidden=false;
              surface.setAttribute('aria-hidden','false');
            }
          }else setMode(mode.value);
        },
        restore(){element.append(surface);bar.append(pdfTools);},
      });
      if(pdfPaneMount){
        const viewer=pdfPaneMount({surface,toolbar:pdfTools,onStatus});
        pdfSlot.current=viewer;
        if(pdfSlot.overlays)viewer.setOverlays(pdfSlot.overlays);
        viewer.setFormulaHighlights?.(pdfSlot.formulaHighlights);
        viewer.setReviewPair?.(pdfSlot.reviewPair);
        viewer.setEmptyMdBlocks?.(pdfSlot.emptyMdBlocks);
        if(pdfSlot.source)void viewer.loadPdf(pdfSlot.source).catch(()=>{});
      }
      return {dispose(){
        pdfSlot.current?.dispose();pdfSlot.current=null;
        pdfSlot.preview=null;
      }};
    };
  }else if(name==='pdf'){
    element.className='ocr-detached-pdf-pane';
    const bar=document.createElement('div');bar.className='ocr-detached-pdf-toolbar';
    const title=document.createElement('span');title.className='ocr-detached-pdf-title';title.textContent='PDF 原文';
    const actions=document.createElement('div');actions.className='ocr-detached-pdf-tools';
    if(!pdfPaneMount)actions.innerHTML='<div class="ocr-pdf-tools"><button type="button" disabled>−</button><button type="button" disabled>适宽</button><button type="button" disabled>+</button><span class="ocr-pdf-zoom">—</span><button type="button" disabled>提取文本</button><label>页 <input type="number" disabled value="1" class="ocr-pdf-page" aria-label="PDF 页码"/></label><span class="ocr-pdf-count">/ —</span></div>';
    bar.append(title,actions);element.append(bar);
    const host=document.createElement('div');host.className='ocr-detached-pdf-host';
    element.append(host);
    if(pdfPaneMount)owned=()=>{
      // Move the SAME PDF.js DOM and controls as Main's detachPdf/reattachPdf.
      // Do not recreate a PDFViewer, refetch the PDF or discard the text layer.
      const preview=pdfSlot.preview;
      if(!preview||pdfSlot.detached)throw Error('PDF split owner unavailable');
      host.append(preview.surface);actions.append(preview.tools);
      pdfSlot.detached={host,actions};
      preview.setSplit(true);
      pdfSlot.current?.relayout?.();
      return {dispose(){
        if(pdfSlot.detached?.host!==host)return;
        pdfSlot.detached=null;
        preview.restore();preview.setSplit(false);
        pdfSlot.current?.relayout?.();
      }};
    };
    else{
      const surface=document.createElement('div');surface.className='ocr-preview-pdf-host';
      host.append(surface);
    }
  }else throw Error('Unknown Frame pane '+name);
  return {element,init(){if(owned)this.resource=owned();},layout(){this.resource?.layout?.();},
    dispose(){this.resource?.dispose();}};
}

function addPanel(dockview,id,component,title,position){
  const panel=dockview.addPanel({id,component,title,...(position?{position}:{})});
  panel.group.header.hidden=true;panel.group.relayout();return panel;
}
/** Public F01: configurable preview default; Frame retains split, OCR uses PDF. */
export function createFrameWorkspace(container,{onStatus=()=>{},onModuleChange=()=>{},
  onAgViewChange=()=>{},agViewOptions=[],moduleLabel='空白框架',defaultPreview='split'}={}){
  let split=false;
  const pdfSlot={current:null,source:null,overlays:null,preview:null,detached:null,
    formulaHighlights:[],reviewPair:null,emptyMdBlocks:[],
    noteReader:null,returnToNote:null};
  const dockview=createDockview(container,{theme:themeAbyss,
    createComponent:({name})=>blankPane(name,setSplit,onModuleChange,moduleLabel,pdfSlot,onStatus,
      agViewOptions,onAgViewChange)});
  let previewToken=0,previewTimer=null;
  let previewClickCallback=null,previewSelectedLine=null,previewSync=null,previewClickArea=null;
  let footnoteReturn=null;
  const mdArea=()=>pdfSlot.preview?.mdArea??null;
  const noteReturnButton=()=>pdfSlot.preview?.returnNote??null;
  function clearFootnoteReturn(){
    footnoteReturn=null;
    const button=noteReturnButton();if(button)button.hidden=true;
  }
  function navigateToFootnote({sourceLine,noteId,referenceLine,referenceScrollTop,reference}){
    const root=mdArea();
    const note=root?.querySelector('li.footnote-item[id="'+noteId+'"]');
    if(!note||!Number.isInteger(sourceLine)||sourceLine<1)return;
    footnoteReturn={referenceLine,referenceScrollTop,reference};
    const button=noteReturnButton();if(button)button.hidden=false;
    // Frame's existing semantic navigation port handles CM6, AG and PDF.
    // Lab-OCR subscribes to it with stable LineID/BlockID lookup.
    previewClickCallback?.(sourceLine);
    root.scrollTop+=note.getBoundingClientRect().top-
      root.getBoundingClientRect().top-18;
  }
  function returnToFootnoteReference(){
    const saved=footnoteReturn;clearFootnoteReturn();
    if(!saved)return;
    if(Number.isInteger(saved.referenceLine)&&saved.referenceLine>=1)
      previewClickCallback?.(saved.referenceLine);
    const root=mdArea();if(root)root.scrollTop=saved.referenceScrollTop;
    if(saved.reference?.isConnected)saved.reference.focus({preventScroll:true});
  }
  pdfSlot.returnToNote=returnToFootnoteReference;
  const previewAnchors=()=>[...mdArea()?.querySelectorAll('[data-source-start][data-source-end]')??[]];
  function highlightPreviewLine(lineNo,{reveal=false}={}){
    previewSelectedLine=lineNo;
    const anchors=previewAnchors();
    for(const node of anchors)delete node.dataset.ocrSyncSelected;
    if(!Number.isInteger(lineNo)||!anchors.length)return false;
    const scored=anchors.map(node=>{
      const a=Number(node.dataset.sourceStart),b=Number(node.dataset.sourceEnd);
      return {node,a,b,distance:lineNo<a?a-lineNo:lineNo>=b?lineNo-b+1:0};
    }).filter(item=>Number.isFinite(item.distance));
    const exact=scored.filter(item=>item.distance===0)
      .sort((a,b)=>(a.b-a.a)-(b.b-b.a));
    // A Markdown source blank/evidence comment has no rendered element.
    // Do not falsely mark the adjacent paragraph as the exact target.
    const target=exact[0]?.node??null;
    if(target){target.dataset.ocrSyncSelected='true';
      if(reveal)target.scrollIntoView({block:'center',inline:'nearest'});}
    return Boolean(target);
  }
  function previewClick(event){
    if(pdfSlot.noteReader?.handleClick(event))return;
    if(!(event.target instanceof Element)||event.target.closest('a[href]'))return;
    const node=event.target.closest('[data-source-start][data-source-end]');
    if(!node||!mdArea()?.contains(node))return;
    const line=Number(node.dataset.sourceStart);
    if(Number.isSafeInteger(line)&&line>0)previewClickCallback?.(line);
  }
  function bindPreviewClick(){
    const current=mdArea();
    if(current===previewClickArea)return;
    previewClickArea?.removeEventListener('click',previewClick);
    previewClickArea=current;
    previewClickArea?.addEventListener('click',previewClick);
  }
  async function ensurePreviewScrollSync(){
    if(previewSync)return previewSync;
    const module=await import('../scroll-sync.js');
    const area=mdArea();
    if(!area)return null;
    previewSync=module.createScrollSync(
      ()=>container.querySelector('.ocr-cm-source')?.ocrCmTable?.editorView()??null,
      area,area);
    return previewSync;
  }
  const left=addPanel(dockview,'outline','outline','章节大纲 · AG');
  const source=addPanel(dockview,'source','source','Markdown 源码',{referencePanel:left,direction:'right'});
  addPanel(dockview,'preview','preview','Markdown 预览',{referencePanel:source,direction:'below'});
  // Reuse Main's exact footnote-popover.js (same code and CSS), not a
  // Lab-specific parser or card. The live Markdown renderer owns the DOM.
  pdfSlot.noteReader=createFootnotePopover({root:mdArea(),onLocate:navigateToFootnote});
  function setSplit(enabled){
    if(Boolean(enabled)===split)return;
    if(enabled){pdfSlot.preview?.setMode('md');addPanel(dockview,'pdf','pdf','PDF 原文',{referencePanel:'preview',direction:'right'});split=true;}
    else{const panel=dockview.getPanel('pdf');if(panel)dockview.removePanel(panel);split=false;}
    const checkbox=container.querySelector('.ocr-preview-split-toggle input');
    if(checkbox)checkbox.checked=split;
    pdfSlot.preview?.setSplit(split);
    onStatus(split?'四窗布局已启用':'三窗布局已启用');
  }
  if(defaultPreview==='pdf'&&pdfPaneMount)pdfSlot.preview?.setMode('pdf');
  else setSplit(true);
  let functionMenu=null;
  const functionTrigger=()=>container.querySelector('.ocr-outline-pane .ocr-ag-function-select');
  const closeFunctionMenu=()=>{
    functionMenu?.remove();functionMenu=null;
    document.removeEventListener('pointerdown',onFunctionOutside,true);
    document.removeEventListener('keydown',onFunctionEscape,true);
    functionTrigger()?.setAttribute('aria-expanded','false');
  };
  const onFunctionOutside=event=>{
    if(functionMenu&&!functionMenu.contains(event.target)&&
       event.target!==functionTrigger())closeFunctionMenu();
  };
  const onFunctionEscape=event=>{
    if(event.key==='Escape'){closeFunctionMenu();functionTrigger()?.focus();}
  };
  return Object.freeze({setSplit,
    setAgFunctions(items=[]){
      const trigger=functionTrigger();
      if(!trigger)return false;
      if(!Array.isArray(items)||items.some(item=>!item||typeof item.id!=='string'||
        !item.id||typeof item.label!=='string'||typeof item.onClick!=='function')||
        new Set(items.map(item=>item.id)).size!==items.length)
        throw Error('AG 功能菜单定义无效');
      closeFunctionMenu();
      trigger.disabled=items.length===0;
      trigger.textContent='功能 ▾'; // Never display an already executed command.
      trigger.onclick=event=>{
        event.stopPropagation();
        if(trigger.disabled)return;
        if(functionMenu){closeFunctionMenu();return;}
        const menu=document.createElement('div');
        menu.className='ocr-ag-function-menu';
        menu.setAttribute('role','menu');
        menu.setAttribute('aria-label','当前 AG View 功能');
        for(const item of items){
          const option=document.createElement('button');option.type='button';
          option.className='ocr-ag-function-item';
          option.setAttribute('role','menuitem');
          option.dataset.action=item.id;option.textContent=item.label;
          option.onclick=actionEvent=>{
            actionEvent.stopPropagation();
            closeFunctionMenu();
            // Invoke the action from the actual tap event. Show failures in
            // the common status bar rather than swallowing a rejected Promise.
            try{Promise.resolve(item.onClick()).catch(error=>
              onStatus(`AG 功能「${item.label}」失败：${error.message}`,'error'));}
            catch(error){onStatus(`AG 功能「${item.label}」失败：${error.message}`,'error');}
          };
          menu.append(option);
        }
        const rect=trigger.getBoundingClientRect();
        menu.style.left=Math.max(5,Math.min(rect.left,window.innerWidth-185))+'px';
        menu.style.top=Math.max(5,Math.min(rect.bottom+3,window.innerHeight-85))+'px';
        document.body.append(menu);functionMenu=menu;
        trigger.setAttribute('aria-expanded','true');
        document.addEventListener('pointerdown',onFunctionOutside,true);
        document.addEventListener('keydown',onFunctionEscape,true);
      };
      return items.length>0;
    },
    setAgToggle({label,checked=false,onChange}={}){
      const control=container.querySelector('.ocr-outline-pane .ocr-ag-review-toggle');
      if(!control)return false;
      const input=control.querySelector('input'),title=control.querySelector('span');
      control.hidden=!(label&&typeof onChange==='function');
      control.closest('.ocr-ag-toolbar')?.classList.toggle('ocr-ag-with-review-toggle',
        !control.hidden);
      if(control.hidden){input.onchange=null;input.checked=false;title.textContent='';return false;}
      title.textContent=String(label).slice(0,24);
      input.checked=Boolean(checked);
      input.onchange=()=>onChange(input.checked);
      return true;
    },
    setAgAction({label,onClick}={}){
      const button=container.querySelector('.ocr-outline-pane .ocr-ag-extra-action');
      if(!button)return false;
      button.hidden=!(label&&typeof onClick==='function');
      button.textContent=button.hidden?'':String(label).slice(0,20);
      button.onclick=button.hidden?null:onClick;
      return !button.hidden;
    },
    setAgView(value){
      const picker=container.querySelector('.ocr-outline-pane .ocr-ag-module-select');
      if(!picker||![...picker.options].some(option=>option.value===value))return false;
      picker.value=value;
      container.classList.toggle('ocr-latex-all-active',value==='latex');
      if(value!=='latex'){
        container.querySelector('.ocr-cm-source')?.ocrCmTable?.setLatexHighlights([]);
        pdfSlot.formulaHighlights=[];
        pdfSlot.current?.setFormulaHighlights?.([]);
      }
      return true;
    },
    setEmptyMdBlocks(ids=[]){
      if(!Array.isArray(ids)||ids.some(id=>!Number.isSafeInteger(id)||id<1))
        throw Error('PDF 空正文 BlockID 无效');
      pdfSlot.emptyMdBlocks=[...ids];
      return pdfSlot.current?.setEmptyMdBlocks?.(pdfSlot.emptyMdBlocks)??ids.length;
    },
    setReviewPair(pair=null,{skipSource=false}={}){
      // Ordinary source navigation/editing must not traverse the whole MD
      // preview or dispatch another CM6 transaction when no pair is active.
      if(pair===null&&pdfSlot.reviewPair===null)return false;
      if(pair!==null&&(!pair.before||!pair.after||
         [pair.before,pair.after].some(item=>!Number.isInteger(item.lineNo)||
           item.lineNo<1||!Number.isSafeInteger(item.blockId)||item.blockId<1||
           !Number.isInteger(item.page)||item.page<1||
           typeof item.text!=='string'||item.text.length>300||
           typeof item.token!=='string'||!item.token)))
        throw Error('双端审阅投影无效');
      pdfSlot.reviewPair=pair?['before','after'].map(side=>({
        side,blockId:pair[side].blockId,page:pair[side].page})):null;
      // CM6 already drops token decorations in its docChanged transaction.
      // Avoid nested EditorView.dispatch from the MD update listener.
      if(!skipSource)container.querySelector('.ocr-cm-source')?.ocrCmTable?.setReviewPair(pair);
      pdfSlot.current?.setReviewPair?.(pdfSlot.reviewPair);
      return Boolean(pair);
    },
    setMdPreviewNavigation(callback){
      if(callback!==null&&typeof callback!=='function')throw Error('MD 预览定位回调无效');
      previewClickCallback=callback;bindPreviewClick();
      if(callback===null){pdfSlot.noteReader?.close();clearFootnoteReturn();}
    },
    highlightMdPreview(lineNo,{reveal=false}={}){
      return highlightPreviewLine(lineNo,{reveal});
    },
    highlightMdSource(lineNo,{reveal=false}={}){
      return container.querySelector('.ocr-cm-source')?.ocrCmTable?.markMdLine(lineNo,{reveal})??false;
    },
    setMarkdownPreview(source,{nativeInlineMath=false}={}){
      if(typeof source!=='string')throw Error('MD 预览源码必须是字符串');
      // In Main a new document revision invalidates note coordinates at
      // once; the Frame's render is delayed, so invalidate immediately.
      pdfSlot.noteReader?.close();clearFootnoteReturn();
      bindPreviewClick();
      const token=++previewToken;
      if(previewTimer!==null)clearTimeout(previewTimer);
      previewTimer=setTimeout(()=>{
        previewTimer=null;
        void import('../markdown-preview.js').then(async module=>{
          if(token!==previewToken||!pdfSlot.preview?.mdArea)return;
          // Reuse Main's mature Markdown/Obsidian renderer + DOMPurify.
          // This is strictly a derived HTML projection; it never owns MD.
          const sync=await ensurePreviewScrollSync();
          if(token!==previewToken||!pdfSlot.preview?.mdArea)return;
          const preserved=sync?.beforeRender();
          // Main closes popovers before morphdom; Frame replaces its HTML
          // wholesale, so a card or return target cannot outlive the DOM.
          pdfSlot.noteReader?.close();clearFootnoteReturn();
          documentChanged();
          pdfSlot.preview.mdArea.innerHTML=module.renderMarkdown(source,{nativeInlineMath});
          sync?.afterRender(preserved);
          highlightPreviewLine(previewSelectedLine);
        }).catch(error=>onStatus('MD 预览渲染失败：'+error.message,'warning'));
      },240);
    },
    readStructuredRuntime(){
      return container.querySelector('.ocr-cm-source')?.ocrCmTable?.runtime()??null;
    },
    readMdRuntime(){
      return container.querySelector('.ocr-cm-source')?.ocrCmTable?.mdRuntime()??null;
    },
    mdDocument(){
      return container.querySelector('.ocr-cm-source')?.ocrCmTable?.mdDocument()??'';
    },
    loadMdRuntime(runtime,callbacks){
      const cm=container.querySelector('.ocr-cm-source')?.ocrCmTable;
      if(!cm)throw Error('CM6 尚未初始化');
      cm.loadMarkdown(runtime,callbacks);
    },
    replaceMdRuntime(next){
      const cm=container.querySelector('.ocr-cm-source')?.ocrCmTable;
      if(!cm)throw Error('CM6 尚未初始化');
      cm.setMarkdownRuntime(next);
    },
    clearMdRuntime(){
      container.querySelector('.ocr-cm-source')?.ocrCmTable?.clearMarkdown();
      ++previewToken;
      if(previewTimer!==null){clearTimeout(previewTimer);previewTimer=null;}
      pdfSlot.noteReader?.close();clearFootnoteReturn();
      if(pdfSlot.preview?.mdArea)pdfSlot.preview.mdArea.textContent='';
      previewSelectedLine=null;pdfSlot.reviewPair=null;pdfSlot.emptyMdBlocks=[];
      pdfSlot.current?.setEmptyMdBlocks?.([]);
      pdfSlot.current?.setReviewPair?.(null);
    },
    focusMdLine(lineNo,{focus=true}={}){
      return container.querySelector('.ocr-cm-source')?.ocrCmTable?.focusMdLine(lineNo,{focus})??false;
    },
    setLatexHighlights(rows=[]){
      const count=container.querySelector('.ocr-cm-source')?.ocrCmTable
        ?.setLatexHighlights(rows)??0;
      pdfSlot.formulaHighlights=rows.filter(row=>row?.formula_id&&
        Number.isInteger(row.page)&&Array.isArray(row.pdf_bbox)&&
        Array.isArray(row.page_size)).map(row=>({
          id:row.formula_id,page:row.page,bbox:row.pdf_bbox,pageSize:row.page_size}));
      pdfSlot.current?.setFormulaHighlights?.(pdfSlot.formulaHighlights);
      return count;
    },
    focusMdFormula(target){
      return container.querySelector('.ocr-cm-source')?.ocrCmTable?.focusMdFormula(target)??false;
    },
    focusMdNoteRange(target){
      return container.querySelector('.ocr-cm-source')?.ocrCmTable?.focusMdNoteRange(target)??false;
    },
    clearMdNoteRange(){
      return container.querySelector('.ocr-cm-source')?.ocrCmTable?.clearMdNoteRange()??false;
    },
    markMdLine(lineNo,{reveal=false}={}){
      if(!editor.state.field(mdField))return false;
      if(lineNo!==null&&(!Number.isInteger(lineNo)||lineNo<1||
          lineNo>editor.state.doc.lines))return false;
      const current=editor.state.field(mdFocusField).iter();
      const prior=current.value?editor.state.doc.lineAt(current.from).number:null;
      // A popup belongs to the highlighted focus line, never to a stale one.
      if(prior!==lineNo)lineGutter.close();
      const effects=[setMdFocusLine.of(lineNo),setMdFormulaRange.of(null),setMdNoteRange.of(null)];
      if(reveal&&lineNo!==null)effects.push(EditorView.scrollIntoView(
        editor.state.doc.line(lineNo).from,{y:'center'}));
      editor.dispatch({effects});
      return true;
    },
    mergeMdBlockBreak(plan){
      const runtime=editor.state.field(mdField);
      const before=runtime?.rows.find(row=>row.line_id===plan?.beforeLineId);
      const after=runtime?.rows.find(row=>row.line_id===plan?.afterLineId);
      if(!before||!after||before.block_id!==plan.beforeBlockId||
         after.block_id!==plan.afterBlockId||
         before.line_no+1!==after.line_no||before.text!==plan.beforeText||
         after.text!==plan.afterText||!plan.joinedText?.trim())
        throw Error('CM6 断块原文或身份已变化，拒绝过期合并');
      const lineA=editor.state.doc.line(before.line_no);
      const lineB=editor.state.doc.line(after.line_no);
      if(lineA.text!==before.text||lineB.text!==after.text)
        throw Error('CM6 文档尚未与行表对齐，拒绝合并');
      // One history entry, TWO simultaneous text changes. Keep the newline
      // and B's physical line so reconcileMdText preserves both LineIDs.
      editor.dispatch({changes:[
        {from:lineA.from,to:lineA.to,insert:plan.joinedText},
        {from:lineB.from,to:lineB.to,insert:''},
      ],annotations:Transaction.userEvent.of('input.block-break-merge')});
      const next=editor.state.field(mdField);
      if(!next?.rows.some(row=>row.line_id===after.line_id&&
            row.block_id===after.block_id&&row.text===''))
        throw Error('CM6 未保留后块空行，请检查合并事务');
      return true;
    },
    editMdLine(lineId,text){
      return container.querySelector('.ocr-cm-source')?.ocrCmTable?.editMdLine(lineId,text)??false;
    },
    mergeMdBlockBreak(plan){
      const cm=container.querySelector('.ocr-cm-source')?.ocrCmTable;
      if(!cm)throw Error('CM6 尚未初始化');
      return cm.mergeMdBlockBreak(plan);
    },
    convertMdNotePair(plan){
      const cm=container.querySelector('.ocr-cm-source')?.ocrCmTable;
      if(!cm)throw Error('CM6 尚未初始化');
      return cm.convertMdNotePair(plan);
    },
    insertMdAtCursor(text){
      const cm=container.querySelector('.ocr-cm-source')?.ocrCmTable;
      if(!cm)throw Error('CM6 源码窗未就绪');
      return cm.insertMdAtCursor(text);
    },
    patchMdRows(rows){
      return container.querySelector('.ocr-outline-grid')?.ocrSqlGrid?.patchMdRows(rows);
    },
    patchFormulaRows(rows){
      return container.querySelector('.ocr-outline-grid')?.ocrSqlGrid?.patchFormulaRows(rows);
    },
    patchNoteRows(rows){
      return container.querySelector('.ocr-outline-grid')?.ocrSqlGrid?.patchNoteRows(rows);
    },
    clearMdAgSelection(){
      container.querySelector('.ocr-outline-grid')?.ocrSqlGrid?.clearSelection();
      container.querySelector('.ocr-cm-source')?.ocrCmTable?.clearTableSelection();
    },
    selectMdLine(lineId){
      const row=container.querySelector('.ocr-outline-grid')?.ocrSqlGrid?.selectById({
        field:'line_id',id:lineId,focusColumn:'line_no',focus:false,preserveFilters:true});
      if(row)container.querySelector('.ocr-cm-source')?.ocrCmTable?.select(row,{focus:false});
      return row;
    },
    undoMd(){return container.querySelector('.ocr-cm-source')?.ocrCmTable?.undoMarkdown()??false;},
    redoMd(){return container.querySelector('.ocr-cm-source')?.ocrCmTable?.redoMarkdown()??false;},
    mdHistory(){return container.querySelector('.ocr-cm-source')?.ocrCmTable?.markdownHistory()??{undo:0,redo:0};},
    replaceStructuredRuntime(next){
      const cm=container.querySelector('.ocr-cm-source')?.ocrCmTable;
      if(!cm)throw Error('CM6 尚未初始化');
      cm.replaceRuntime(next);
    },
    reduceStructuredRuntime(reducer){
      const cm=container.querySelector('.ocr-cm-source')?.ocrCmTable;
      if(!cm)throw Error('CM6 尚未初始化');
      return cm.reduceRuntime(reducer);
    },
    // Semantic source port, independent of PDF.js and Dockview DOM internals.
    loadPdf(url){
      if(url!==null && typeof url!=='string')
        return Promise.reject(Error('PDF 来源必须是 URL 字符串'));
      pdfSlot.source=url;
      return pdfSlot.current?.loadPdf(url)??Promise.resolve(false);
    },
    setPdfOverlays(config){
      // Merge patches so the lazy-mounted viewer retains its original loader.
      pdfSlot.overlays={...pdfSlot.overlays,...config};
      return pdfSlot.current?.setOverlays(config)??false;
    },
    invalidatePdfBlockPage(page,changedRows=[]){
      return pdfSlot.current?.invalidateOverlayPage?.(page,changedRows)??false;
    },
    repaintPdfBlockPage(page){
      return pdfSlot.current?.repaintOverlayPage?.(page)??false;
    },
    setSqlEditHistory({canUndo=false,canRedo=false,onUndo=null,onRedo=null}={}){
      const undo=container.querySelector('#undo'),redo=container.querySelector('#redo');
      for(const [button,enabled,callback] of [[undo,canUndo,onUndo],[redo,canRedo,onRedo]]){
        if(!button)continue;
        button.disabled=!enabled;button.title=enabled?'撤销／重做 SQLite Block 结构':'没有对应的块操作';
        button.onclick=enabled&&typeof callback==='function'?()=>void Promise.resolve()
          .then(callback).catch(error=>onStatus('Block 历史操作失败：'+error.message,'error')):null;
      }
    },
    setMdEditHistory(){
      const cm=container.querySelector('.ocr-cm-source')?.ocrCmTable;
      const state=cm?.markdownHistory()??{undo:0,redo:0};
      for(const [id,enabled,action] of [
        ['undo',state.undo>0,()=>cm?.undoMarkdown()],
        ['redo',state.redo>0,()=>cm?.redoMarkdown()]]) {
        const button=container.querySelector('#'+id);
        if(!button)continue;
        button.disabled=!enabled;
        button.title=enabled?'Markdown 编辑撤销／重做':'无 Markdown 编辑历史';
        button.onclick=enabled?action:null;
      }
    },
    patchSqlBlockRows(changedRows){
      if(!Array.isArray(changedRows)||!changedRows.length)return;
      container.querySelector('.ocr-cm-source')?.ocrCmTable?.patchBlockRows(changedRows);
      container.querySelector('.ocr-outline-grid')?.ocrSqlGrid?.patchBlockRows(changedRows);
    },
    activate(){if(container.clientWidth&&container.clientHeight)
    dockview.layout(container.clientWidth,container.clientHeight);},
    setSqlPdfPage(page){
      return container.querySelector('.ocr-outline-grid')?.ocrSqlGrid?.setPdfPage(page)??false;
    },
    showSqlRows(rows,columns,{onSelect,onFilterChanged,initialFilterModel=null,
      pageScope=null,allPagesInitially=false,expandPageOnCategory=null,rowHeight=35}={}){
      const port=container.querySelector('.ocr-outline-grid')?.ocrSqlGrid;
      const cm=container.querySelector('.ocr-cm-source')?.ocrCmTable;
      if(!port||!cm)throw Error('AG 或 CM6 尚未初始化');
      cm.load(rows);
      port.show({rows:cm.rows(),columns,onFilterChanged,initialFilterModel,
        pageScope,allPagesInitially,expandPageOnCategory,rowHeight,onRowSelected:row=>{
        // MD rows use the semantic four-pane navigator to move the caret to
        // logical Block start. Do not focus this arbitrary AG physical row.
        cm.select(row,{focus:row?.line_id==null&&!row?.formula_id});
        onSelect?.(row);
      }});
    },
    // Semantic selection for external views. Only the AG port owns AG Grid;
    // CM6 still receives the same row, without a second SQL/Markdown store.
    selectSqlRowById({field='block_id',id,preserveFilters=false,focusSource=true}){
      const row=container.querySelector('.ocr-outline-grid')?.ocrSqlGrid?.selectById({field,id,preserveFilters});
      if(row)container.querySelector('.ocr-cm-source')?.ocrCmTable?.select(row,{focus:focusSource});
      return Boolean(row);
    },
    focusPdfBlock({id,page,reveal=true}){
      return pdfSlot.current?.focusBlock?.({id,page,reveal})??false;
    },
    focusPdfFormula({id,page,bbox,kind=null,reveal=true}){
      return pdfSlot.current?.focusFormula?.({id,page,bbox,kind,reveal})??false;
    },
    getPdfFormulaCrop(target){
      return pdfSlot.current?.renderFormulaCrop?.(target)??Promise.resolve(null);
    },
    clearPdfFocus(){return pdfSlot.current?.clearFocus?.()??false;},
    clearSqlRows(){
      container.querySelector('.ocr-cm-source')?.ocrCmTable?.clear();
      container.querySelector('.ocr-outline-grid')?.ocrSqlGrid?.clear();
    },
    dispose(){closeFunctionMenu();++previewToken;
      pdfSlot.noteReader?.dispose();pdfSlot.noteReader=null;
      clearFootnoteReturn();pdfSlot.returnToNote=null;
      if(previewTimer!==null)clearTimeout(previewTimer);
      previewClickArea?.removeEventListener('click',previewClick);previewClickArea=null;
      previewSync?.dispose();previewSync=null;
      dockview.dispose();},get split(){return split;}});
}
