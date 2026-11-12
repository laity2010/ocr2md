/** Minimal first-class Frame API: Dockview shell, no CMD/SQL/Media reads or writes. */
import {createDockview,themeAbyss} from 'dockview';
import {EditorState,StateField,StateEffect} from '@codemirror/state';
import {EditorView,lineNumbers} from '@codemirror/view';
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
  const editor=new EditorView({state:EditorState.create({doc:'',extensions:[
    EditorState.readOnly.of(true),EditorView.editable.of(false),tableStateField,lineNumbers(),EditorView.lineWrapping,
  ]}),parent:host});
  host.ocrCmTable=Object.freeze({
    load(rows){editor.dispatch({effects:loadTableRows.of(rows)});},
    patchBlockRows(changedRows){editor.dispatch({effects:patchTableRows.of(changedRows)});},
    rows(){return editor.state.field(tableStateField).rows;},
    select(row){
      if(!row)return;
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
    clear(){editor.dispatch({changes:{from:0,to:editor.state.doc.length,insert:''},
      effects:loadTableRows.of([])});},
    selected(){return editor.state.field(tableStateField).selectedId;},
  });
  return {dispose(){delete host.ocrCmTable;editor.destroy();},layout:()=>editor.requestMeasure()};
}
function mountEmptyGrid(host){
  const columnDefs=[
    {field:'pbs',headerName:'PBS',width:115},
    {field:'usable',headerName:'可用',width:72},
    {field:'type',headerName:'类型',width:95},
    {field:'content',headerName:'文本块',flex:1},
  ];
  let selectedListener=()=>{},filterListener=()=>{};
  const grid=createGrid(host,{theme:agTheme,headerHeight:33,rowHeight:35,
    rowSelection:{mode:'singleRow',checkboxes:false,headerCheckbox:false,enableClickSelection:true},
    onRowClicked:event=>selectedListener(event.data),
    onFilterChanged:event=>filterListener(event.api.getFilterModel()),
    suppressNoRowsOverlay:true,overlayNoRowsTemplate:' ',
    defaultColDef:{resizable:true,sortable:false,suppressMovable:true},
    columnDefs,rowData:[]});
  // The AG pane owns the Grid API. Other modules may only update rows/columns
  // through this explicit, narrow component boundary; no private AG DOM access.
  host.ocrSqlGrid=Object.freeze({show({rows,columns,onRowSelected,onFilterChanged,initialFilterModel=null}){
    selectedListener=onRowSelected??(()=>{});
    // Ignore transient filter-change events while replacing a whole SQL table.
    filterListener=()=>{};
    // Different SQLite tables must not inherit one another's AG filters.
    grid.setFilterModel(null);
    grid.setGridOption('columnDefs',columns);
    grid.setGridOption('rowData',rows);
    // Apply the caller's startup selection through AG Grid's public filter
    // model before subscribing to changes; the real checkbox UI stays owner.
    if(initialFilterModel)grid.setFilterModel(initialFilterModel);
    filterListener=onFilterChanged??(()=>{});
    filterListener(grid.getFilterModel());
    // Avoid carrying horizontal scroll from the previous table into the new
    // schema (AG virtualizes columns left outside the visible range).
    if(columns[0]?.field){
      const first=columns[0].field;
      grid.ensureColumnVisible(first,'start');
      requestAnimationFrame(()=>grid.ensureColumnVisible(first,'start'));
    }
  },patchBlockRows(changedRows){
    const changed=new Map(changedRows.map(r=>[String(r.block_id),r]));
    grid.forEachNode(node=>{
      const patch=changed.get(String(node.data?.block_id));
      if(patch)node.updateData({...node.data,...patch});
    });
    grid.refreshClientSideRowModel?.('sort');
  },selectById({field,id}){
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
    if(!selected){
      // A PDF-visible Block may be hidden by unrelated AG filters (e.g.
      // block_type). Preserve the authoritative block_group filter.
      const current=grid.getFilterModel()||{};
      const remaining=Object.fromEntries(Object.entries(current).filter(([key])=>key==='block_group'));
      if(Object.keys(current).length!==Object.keys(remaining).length){
        grid.setFilterModel(remaining);selected=lookup();
      }
    }
    if(!selected)return null;
    grid.ensureIndexVisible(selected.index,'middle');
    const column=grid.getColumn(field)?field:grid.getAllDisplayedColumns()[0]?.getColId();
    if(column){grid.ensureColumnVisible(column);grid.setFocusedCell(selected.index,column);}
    selected.node.setSelected(true,true);
    return selected.node.data;
  },clear(){selectedListener=()=>{};filterListener=()=>{};grid.setGridOption('rowData',[]);grid.setGridOption('columnDefs',columnDefs);}});
  return {dispose(){delete host.ocrSqlGrid;grid.destroy();},layout:()=>{}};
}
function blankPane(name,onSplit,onModuleChange,moduleLabel='空白框架',pdfSlot=null,onStatus=()=>{}){
  const element=document.createElement('div');
  let owned=null;
  if(name==='outline'){
    element.className='ocr-outline-pane';
    // The AG-owned module strip belongs to the left pane, not the global status.
    const bar=document.createElement('div');bar.className='ocr-ag-toolbar';
    bar.setAttribute('role','toolbar');bar.setAttribute('aria-label','AG 表工具栏');
    const label=document.createElement('span');label.className='ocr-ag-toolbar-label';label.textContent='AG 表';
    const picker=document.createElement('select');picker.className='ocr-ag-module-select';
    picker.setAttribute('aria-label','选择模块');
    picker.add(new Option(moduleLabel,'frame'));
    picker.add(new Option('全局设置','settings'));
    const ownModule='frame';picker.value=ownModule;
    picker.addEventListener('change',()=>{
      const next=picker.value;
      picker.value=ownModule; // Each pane retains its own correct module on return.
      onModuleChange?.(next);
    });
    bar.append(label,picker);element.append(bar);
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
      else if(select.value==='sql:minerujson'||select.value==='sql:span'||select.value==='sql:block')onModuleChange?.(select.value);
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
  moduleLabel='空白框架',defaultPreview='split'}={}){
  let split=false;
  const pdfSlot={current:null,source:null,overlays:null,preview:null,detached:null};
  const dockview=createDockview(container,{theme:themeAbyss,
    createComponent:({name})=>blankPane(name,setSplit,onModuleChange,moduleLabel,pdfSlot,onStatus)});
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
    setSqlEditHistory({canUndo=false,canRedo=false,onUndo=null,onRedo=null}={}){
      const undo=container.querySelector('#undo'),redo=container.querySelector('#redo');
      for(const [button,enabled,callback] of [[undo,canUndo,onUndo],[redo,canRedo,onRedo]]){
        if(!button)continue;
        button.disabled=!enabled;button.title=enabled?'撤销／重做 SQLite Block 结构':'没有对应的块操作';
        button.onclick=enabled&&typeof callback==='function'?()=>void Promise.resolve()
          .then(callback).catch(error=>onStatus('Block 历史操作失败：'+error.message,'error')):null;
      }
    },
    patchSqlBlockRows(changedRows){
      if(!Array.isArray(changedRows)||!changedRows.length)return;
      container.querySelector('.ocr-cm-source')?.ocrCmTable?.patchBlockRows(changedRows);
      container.querySelector('.ocr-outline-grid')?.ocrSqlGrid?.patchBlockRows(changedRows);
    },
    activate(){if(container.clientWidth&&container.clientHeight)
    dockview.layout(container.clientWidth,container.clientHeight);},
    showSqlRows(rows,columns,{onSelect,onFilterChanged,initialFilterModel=null}={}){
      const port=container.querySelector('.ocr-outline-grid')?.ocrSqlGrid;
      const cm=container.querySelector('.ocr-cm-source')?.ocrCmTable;
      if(!port||!cm)throw Error('AG 或 CM6 尚未初始化');
      cm.load(rows);
      port.show({rows:cm.rows(),columns,onFilterChanged,initialFilterModel,onRowSelected:row=>{
        cm.select(row);
        onSelect?.(row);
      }});
    },
    // Semantic selection for external views. Only the AG port owns AG Grid;
    // CM6 still receives the same row, without a second SQL/Markdown store.
    selectSqlRowById({field='block_id',id}){
      const row=container.querySelector('.ocr-outline-grid')?.ocrSqlGrid?.selectById({field,id});
      if(row)container.querySelector('.ocr-cm-source')?.ocrCmTable?.select(row);
      return Boolean(row);
    },
    focusPdfBlock({id,page}){
      return pdfSlot.current?.focusBlock?.({id,page})??false;
    },
    clearSqlRows(){
      container.querySelector('.ocr-cm-source')?.ocrCmTable?.clear();
      container.querySelector('.ocr-outline-grid')?.ocrSqlGrid?.clear();
    },
    dispose(){dockview.dispose();},get split(){return split;}});
}
