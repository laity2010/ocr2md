/**
 * Lab-only replacement for the one V6 component that needs new behavior:
 * the AG Grid chapter checkbox. Workspace, filters, styles and CM6 extensions
 * are imported unchanged from the V6 mainline.
 */
import {AllCommunityModule,ModuleRegistry,createGrid,themeQuartz} from 'ag-grid-community';
import {viewStore,publishFocus} from '../../ui/view-store.js';
import {buildOutline,headingAtLine} from '../../ui/outline-index.js';
import {EnumCheckboxFilter} from '../../ui/enum-checkbox-filter.js';
import {markerForHeading,putMarker} from './metadata.js';
import '../../ui/outline-grid.css';

ModuleRegistry.registerModules([AllCommunityModule]);

const theme=themeQuartz.withParams({
  accentColor:'#569d79',backgroundColor:'#2f383e',foregroundColor:'#d3c6aa',
  headerBackgroundColor:'#272f34',headerTextColor:'#d3c6aa',
  borderColor:'#525c62',rowHoverColor:'#37464b',
  selectedRowBackgroundColor:'rgba(86,157,121,.2)',
  oddRowBackgroundColor:'#2d363c',fontFamily:'"OCR2MD Sarasa",monospace',
  fontSize:16,spacing:3,
});
const fields=['pdfPage','level','title','independent','chapterFile'];
const labels=['PDF页码','层级','标题','独立章节','章节文件'];
const valueOf=(row,field)=>{
  if(field==='level')return 'H'+row.level;
  if(field==='independent')return row.independent?'是':'否';
  if(field==='chapterFile')return row.chapterFile||'未导出';
  return row[field]==null?'—':String(row[field]);
};
function titleCell(params){
  if(!params.data)return '';
  const span=document.createElement('span');
  span.className='ocr-outline-title ocr-outline-h'+params.data.level;
  span.textContent=params.data.title;span.title=params.data.title;
  span.dataset.headingSourceLine=String(params.data.sourceLine);
  return span;
}

export function createOutlineGrid(element,getMarkdown,getEditor) {
  let rows=[],api,activeId=null,timer=null,disposed=false,focusUntil=0;
  element.classList.add('ocr-outline-pane');
  const host=document.createElement('div');
  host.className='ocr-outline-grid';
  element.append(host);

  function choose(row,ensureVisible=true){
    if(!row||!api||activeId===row.id)return;
    if(activeId)api.getRowNode(activeId)?.setSelected(false);
    activeId=row.id;
    const node=api.getRowNode(row.id);
    node?.setSelected(true);
    if(ensureVisible&&node?.rowIndex!=null)api.ensureIndexVisible(node.rowIndex,'middle');
  }
  function chooseLine(line,ensureVisible=true) {
    choose(headingAtLine(rows,line)||rows[0],ensureVisible);
  }
  function refresh(){
    if(disposed||!api)return;
    const previous=new Map(rows.map(row=>[row.id,row]));
    const editor=getEditor();
    rows=buildOutline(getMarkdown());
    for(const row of rows) {
      const marker=editor?markerForHeading(editor.state.doc,row):null;
      row.independent=marker?.independent??true;
      row.markerFormat=marker?.format||null;
    }
    api.setGridOption('rowData',rows);
    const changed=rows.filter(row=>{
      const old=previous.get(row.id);
      return old&&(old.level!==row.level||old.markerFormat!==row.markerFormat);
    });
    if(changed.length){
      const nodes=changed.map(row=>api.getRowNode(row.id)).filter(Boolean);
      if(nodes.length)api.refreshCells({rowNodes:nodes,columns:['title','independent'],force:true});
      if(changed.some(row=>(previous.get(row.id).level===1)!==(row.level===1)))
        api.resetRowHeights();
    }
    api.onFilterChanged();
    const state=viewStore.getState();
    if(state.focusTarget?.revision===state.documentRevision)
      chooseLine(state.focusTarget.sourceLine);
    else if(state.scrollTarget?.revision===state.documentRevision)
      chooseLine(state.scrollTarget.sourceLine);
    else if(editor)chooseLine(editor.state.doc.lineAt(state.sourceOffset).number,false);
    if(state.outlineCount!==rows.length)viewStore.setState({outlineCount:rows.length});
    document.dispatchEvent(new CustomEvent('cm-html:outline-refreshed'));
  }
  function schedule(){clearTimeout(timer);timer=setTimeout(refresh,160);}

  const columns=fields.map((field,i)=>{
    const def={field,headerName:labels[i],filter:EnumCheckboxFilter,
      filterValueGetter:p=>p.data?valueOf(p.data,field):'',
      sortable:false,resizable:true,suppressMovable:true,
      suppressHeaderMenuButton:true,suppressHeaderFilterButton:false};
    if(field==='pdfPage')
      Object.assign(def,{width:78,minWidth:70,pinned:'left',
        lockPinned:true,lockPosition:'left',valueFormatter:p=>p.value??'—'});
    if(field==='level')
      Object.assign(def,{width:58,minWidth:55,valueFormatter:p=>'H'+p.value});
    if(field==='title')
      Object.assign(def,{flex:1,minWidth:140,cellRenderer:titleCell,
        wrapText:false,autoHeight:false});
    if(field==='independent')
      Object.assign(def,{width:91,minWidth:87,cellRenderer:p=>{
        if(!p.data)return '';
        const input=document.createElement('input');
        input.type='checkbox';input.className='ocr-outline-checkbox';
        input.checked=p.data.independent;
        const first=rows[0]?.id===p.data.id;
        input.disabled=first;
        input.title=first?'首项必须独立成章':'写入隔离 Markdown 的 CM6 标定注释';
        input.setAttribute('aria-label',p.data.title+' 独立章节');
        input.addEventListener('click',e=>e.stopPropagation());
        input.addEventListener('change',e=>{
          e.stopPropagation();
          try{
            putMarker(getEditor(),p.data,input.checked,
              document.querySelector('#marker-format')?.value||'comment');
            p.data.independent=input.checked;
            api.refreshCells({rowNodes:[p.node],columns:['independent'],force:true});
            api.onFilterChanged();
          }catch(error){
            input.checked=!input.checked;
            document.dispatchEvent(new CustomEvent('cm-html:error',{detail:error.message}));
          }
        });
        return input;
      }});
    if(field==='chapterFile')
      Object.assign(def,{width:94,minWidth:86,valueFormatter:p=>p.value||'未导出'});
    return def;
  });
  api=createGrid(host,{
    theme,columnDefs:columns,rowData:rows,headerHeight:40,rowHeight:34,
    getRowHeight:p=>p.data?.level===1?48:40,
    getRowId:p=>p.data.id,
    rowSelection:{mode:'singleRow',checkboxes:false,headerCheckbox:false,
      enableClickSelection:false},
    suppressCellFocus:true,animateRows:false,
    defaultColDef:{resizable:true},enableFilterHandlers:false,
    onRowClicked:p=>{
      if(!p.data)return;
      choose(p.data);
      publishFocus({sourceLine:p.data.sourceLine,sourceEnd:p.data.sourceEnd,
        origin:'outline',elementId:p.data.id});
    },
  });
  const unsub=viewStore.subscribe((next,prev)=>{
    if(next.documentRevision!==prev.documentRevision)schedule();
    if(next.focusTarget!==prev.focusTarget && next.focusTarget){
      focusUntil=performance.now()+1100;
      chooseLine(next.focusTarget.sourceLine);
    }else if(next.scrollTarget!==prev.scrollTarget&&next.scrollTarget&&
      performance.now()>=focusUntil)chooseLine(next.scrollTarget.sourceLine);
    else if(next.sourceOffset!==prev.sourceOffset&&getEditor()&&!next.focusTarget)
      chooseLine(getEditor().state.doc.lineAt(next.sourceOffset).number);
  });
  return {
    api,get rows(){return rows;},get filters(){return api?.getFilterModel()||{};},
    refresh,schedule,
    dispose(){
      disposed=true;clearTimeout(timer);unsub();api?.destroy();
      element.replaceChildren();
    },
  };
}
