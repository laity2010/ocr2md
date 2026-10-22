/** LaTeX review plugin. Reads live CMD text, owns its AG view and uses the
 * existing focusTarget bus for navigation. Never writes document text. */
import {createGrid,AllCommunityModule,ModuleRegistry,themeQuartz} from 'ag-grid-community';
import katex from 'katex';
import {findLatex} from './latex-scan.js';
import {viewStore,publishFocus} from './view-store.js';
import {EnumCheckboxFilter} from './enum-checkbox-filter.js';
import './latex-module.css';
ModuleRegistry.registerModules([AllCommunityModule]);
const theme=themeQuartz.withParams({accentColor:'#569d79',backgroundColor:'#2f383e',
  foregroundColor:'#d3c6aa',headerBackgroundColor:'#272f34',headerTextColor:'#d3c6aa',
  borderColor:'#525c62',rowHoverColor:'#37464b',
  selectedRowBackgroundColor:'rgba(86,157,121,.2)',
  oddRowBackgroundColor:'#2d363c',fontFamily:'"OCR2MD Sarasa",monospace',fontSize:13,spacing:3});

export function checkLatex(item){
  if(item.issue&&!item.detection)return {...item,status:'错误',error:item.issue,html:''};
  if(!item.content.trim())return {...item,status:'错误',error:'空公式',html:''};
  try{
    const html=katex.renderToString(item.content,{displayMode:item.kind==='独立',
      throwOnError:true,trust:false,maxExpand:1000,strict:'warn'});
    if(item.detection)return {...item,status:'待复核',error:item.issue,html};
    return {...item,status:'通过',error:'',html};
  }catch(e){
    const message=String(e.message||e).slice(0,300);
    // A guessed fragment may have incomplete boundaries. Report the parse
    // failure but never assert that the original document has bad TeX.
    if(item.detection)return {...item,status:'待复核',
      error:`KaTeX：${message}；可能是公式边界不完整`,html:''};
    return {...item,status:'错误',error:message,html:''};
  }
}

export function createLatexModule(host,getMarkdown,onStatus){
  host.classList.add('ocr-latex-pane');
  const gridHost=document.createElement('div');gridHost.className='ocr-latex-grid';
  host.append(gridHost);
  let grid,disposed=false,active=false,queued=false,rows=[];
  const formulaPreview=params=>{
    const item=params.data;
    if(!item)return '';
    const result=document.createElement('div');
    result.className='ocr-latex-preview';
    if(item.html){result.innerHTML=item.html;result.title='KaTeX 渲染';}
    else {result.textContent=item.content||'无有效公式';result.classList.add('ocr-latex-preview-error');}
    return result;
  };
  const columns=[
    {field:'line',headerName:'源码行',width:87,minWidth:76,pinned:'left',lockPinned:true},
    {field:'kind',headerName:'类型',width:77,minWidth:72,
      filter:EnumCheckboxFilter,suppressHeaderMenuButton:true},
    {field:'syntax',headerName:'识别方式',width:91,minWidth:87,
      valueFormatter:p=>p.data?.detection?'未定界':p.value||'明确',
      filter:EnumCheckboxFilter,
      filterValueGetter:p=>p.data?.detection?'未定界':'有定界',
      suppressHeaderMenuButton:true},
    {field:'content',headerName:'LaTeX 源码',minWidth:155,flex:1,
      cellRenderer:p=>{
        const el=document.createElement('span');el.className='ocr-latex-source';
        el.textContent=p.value;el.title=p.value;return el;
      }},
    {colId:'preview',headerName:'公式预览',minWidth:205,flex:1.15,
      cellRenderer:formulaPreview},
    {field:'status',headerName:'校验',width:85,minWidth:79,
      filter:EnumCheckboxFilter,suppressHeaderMenuButton:true,
      cellRenderer:p=>{
        if(!p.data)return '';
        const el=document.createElement('span');el.className='ocr-latex-status';
        el.dataset.status=p.value==='通过'?'ok':p.value==='待复核'?'review':'error';
        el.textContent=p.value;return el;
      }},
    {field:'error',headerName:'错误信息',minWidth:130,flex:0.9,
      cellRenderer:p=>{
        const el=document.createElement('span');el.className='ocr-latex-error';
        el.textContent=p.value||'—';el.title=p.value||'';return el;
      }},
  ].map(c=>({resizable:true,sortable:false,suppressMovable:true,...c}));
  grid=createGrid(gridHost,{theme,columnDefs:columns,rowData:[],rowHeight:103,
    getRowId:p=>p.data.id,
    rowSelection:{mode:'singleRow',checkboxes:false,enableClickSelection:true},
    onRowClicked:e=>publishFocus({sourceLine:e.data.line,
      sourceEnd:e.data.line+Math.max(1,e.data.content.split('\n').length),
      origin:'latex',intent:'click'})});
  function refresh(){
    if(disposed)return;
    rows=findLatex(getMarkdown()).map(checkLatex);
    grid.setGridOption('rowData',rows);
    if(active)onStatus(`LaTeX ${rows.length} 项 · 通过 ${rows.filter(row=>row.status==='通过').length} · 待复核 ${rows.filter(row=>row.status==='待复核').length} · 错误 ${rows.filter(row=>row.status==='错误').length}`);
  }
  function schedule(){
    if(queued||disposed)return;queued=true;
    queueMicrotask(()=>{queued=false;if(active)refresh();});
  }
  const unsubscribe=viewStore.subscribe((current,prior)=>{
    if(current.documentRevision!==prior.documentRevision)schedule();
  });
  return {
    refresh,
    setActive(enabled){active=enabled;host.hidden=!enabled;if(enabled)refresh();},
    dispose(){disposed=true;unsubscribe();grid.destroy();},
  };
}
