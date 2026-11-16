/** Minimal first-class Frame API: Dockview shell, no CMD/SQL/Media reads or writes. */
import {createDockview,themeAbyss} from 'dockview';
import {EditorState,StateField,StateEffect,Compartment,Transaction} from '@codemirror/state';
import {EditorView,Decoration} from '@codemirror/view';
import {documentChanged} from '../view-store.js';
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
    lineIdAt:lineNo=>editor?.state.field(mdField)?.rows[lineNo-1]?.line_id??null,
    onDelete:deleteMdLine,
  });
  const base=nativeIOSSelection?nativeIOSBasicSetup:basicSetup;
  // CodeMirror's stock lineNumbers() is the first extension in BOTH current
  // standard/iOS base setups. Replace only that extension, retaining all
  // mature editing, history, native iOS selection, folding and keybindings.
  editor=new EditorView({state:EditorState.create({doc:'',extensions:[
    mdEditable.of([EditorState.readOnly.of(true),EditorView.editable.of(false)]),
    tableStateField,structuredRuntimeField,mdField,mdFocusField,
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
    focusMdLine(lineNo,{focus=true}={}){
      if(!editor.state.field(mdField)||!Number.isInteger(lineNo)||
         lineNo<1||lineNo>editor.state.doc.lines)return false;
      const position=editor.state.doc.line(lineNo).from;
      programmaticMdSelection=true;
      try{editor.dispatch({selection:{anchor:position},
        effects:EditorView.scrollIntoView(position,{y:'center'})});}
      finally{programmaticMdSelection=false;}
      if(focus)editor.focus();return true;
    },
    markMdLine(lineNo,{reveal=false}={}){
      if(!editor.state.field(mdField))return false;
      if(lineNo!==null&&(!Number.isInteger(lineNo)||lineNo<1||
          lineNo>editor.state.doc.lines))return false;
      const effects=[setMdFocusLine.of(lineNo)];
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
    expandPageOnCategory:category=null}){
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
    mdData.clear();blockData.clear();
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
    bar.append(allPages,label,picker);element.append(bar);
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
    const pdfTools=document.createElement('div');pdfTools.className='ocr-preview-mode-tools';
    pdfTools.dataset.mode='pdf';pdfTools.hidden=true;
    bar.append(mode,split,pdfTools);element.append(bar);
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
      pdfTools.hidden=next!=='pdf';
      surface.setAttribute('aria-hidden',String(next!=='pdf'&&!pdfSlot.detached));
      pdfSlot.current?.relayout?.();
      return true;
    }
    mode.addEventListener('change',()=>setMode(mode.value));
    owned=()=>{
      pdfSlot.preview=Object.freeze({surface,tools:pdfTools,
        mdArea:area,
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
  const pdfSlot={current:null,source:null,overlays:null,preview:null,detached:null};
  const dockview=createDockview(container,{theme:themeAbyss,
    createComponent:({name})=>blankPane(name,setSplit,onModuleChange,moduleLabel,pdfSlot,onStatus,
      agViewOptions,onAgViewChange)});
  let previewToken=0,previewTimer=null;
  let previewClickCallback=null,previewSelectedLine=null,previewSync=null,previewClickArea=null;
  const mdArea=()=>pdfSlot.preview?.mdArea??null;
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
    const node=event.target instanceof Element?
      event.target.closest('[data-source-start][data-source-end]'):null;
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
  return Object.freeze({setSplit,
    setAgView(value){
      const picker=container.querySelector('.ocr-outline-pane .ocr-ag-module-select');
      if(!picker||![...picker.options].some(option=>option.value===value))return false;
      picker.value=value;return true;
    },
    setMdPreviewNavigation(callback){
      if(callback!==null&&typeof callback!=='function')throw Error('MD 预览定位回调无效');
      previewClickCallback=callback;bindPreviewClick();
    },
    highlightMdPreview(lineNo,{reveal=false}={}){
      return highlightPreviewLine(lineNo,{reveal});
    },
    highlightMdSource(lineNo,{reveal=false}={}){
      return container.querySelector('.ocr-cm-source')?.ocrCmTable?.markMdLine(lineNo,{reveal})??false;
    },
    setMarkdownPreview(source){
      if(typeof source!=='string')throw Error('MD 预览源码必须是字符串');
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
          documentChanged();
          pdfSlot.preview.mdArea.innerHTML=module.renderMarkdown(source);
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
      if(pdfSlot.preview?.mdArea)pdfSlot.preview.mdArea.textContent='';
      previewSelectedLine=null;
    },
    focusMdLine(lineNo,{focus=true}={}){
      return container.querySelector('.ocr-cm-source')?.ocrCmTable?.focusMdLine(lineNo,{focus})??false;
    },
    markMdLine(lineNo,{reveal=false}={}){
      if(!editor.state.field(mdField))return false;
      if(lineNo!==null&&(!Number.isInteger(lineNo)||lineNo<1||
          lineNo>editor.state.doc.lines))return false;
      const effects=[setMdFocusLine.of(lineNo)];
      if(reveal&&lineNo!==null)effects.push(EditorView.scrollIntoView(
        editor.state.doc.line(lineNo).from,{y:'center'}));
      editor.dispatch({effects});
      return true;
    },
    editMdLine(lineId,text){
      return container.querySelector('.ocr-cm-source')?.ocrCmTable?.editMdLine(lineId,text)??false;
    },
    insertMdAtCursor(text){
      const cm=container.querySelector('.ocr-cm-source')?.ocrCmTable;
      if(!cm)throw Error('CM6 源码窗未就绪');
      return cm.insertMdAtCursor(text);
    },
    patchMdRows(rows){
      return container.querySelector('.ocr-outline-grid')?.ocrSqlGrid?.patchMdRows(rows);
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
      pageScope=null,allPagesInitially=false,expandPageOnCategory=null}={}){
      const port=container.querySelector('.ocr-outline-grid')?.ocrSqlGrid;
      const cm=container.querySelector('.ocr-cm-source')?.ocrCmTable;
      if(!port||!cm)throw Error('AG 或 CM6 尚未初始化');
      cm.load(rows);
      port.show({rows:cm.rows(),columns,onFilterChanged,initialFilterModel,
        pageScope,allPagesInitially,expandPageOnCategory,onRowSelected:row=>{
        // MD rows use the semantic four-pane navigator to move the caret to
        // logical Block start. Do not focus this arbitrary AG physical row.
        cm.select(row,{focus:row?.line_id==null});
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
    clearPdfFocus(){return pdfSlot.current?.clearFocus?.()??false;},
    clearSqlRows(){
      container.querySelector('.ocr-cm-source')?.ocrCmTable?.clear();
      container.querySelector('.ocr-outline-grid')?.ocrSqlGrid?.clear();
    },
    dispose(){++previewToken;if(previewTimer!==null)clearTimeout(previewTimer);
      previewClickArea?.removeEventListener('click',previewClick);previewClickArea=null;
      previewSync?.dispose();previewSync=null;
      dockview.dispose();},get split(){return split;}});
}
