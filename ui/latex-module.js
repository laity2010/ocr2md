/** LaTeX review plugin. Reads live CMD text, owns its AG view and uses the
 * existing focusTarget bus for navigation. Never writes document text. */
import {createGrid,AllCommunityModule,ModuleRegistry,themeQuartz} from 'ag-grid-community';
import katex from 'katex';
import {findLatex} from './latex-scan.js';
import {viewStore,publishFocus} from './view-store.js';
import {EnumCheckboxFilter} from './enum-checkbox-filter.js';
import './latex-module.css';
ModuleRegistry.registerModules([AllCommunityModule]);
const reviewOptions=['待复核','latex','忽略'];
// Content fingerprint + occurrence distinguishes repeated formulas and remains
// stable if unrelated source lines are inserted above a reviewed formula.
function formulaFingerprint(value){
  let hash=0xcbf29ce484222325n;
  for(const char of value){
    hash^=BigInt(char.codePointAt(0));
    hash=(hash*0x100000001b3n)&0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16,'0');
}
const theme=themeQuartz.withParams({accentColor:'#569d79',backgroundColor:'#2f383e',
  foregroundColor:'#d3c6aa',headerBackgroundColor:'#272f34',headerTextColor:'#d3c6aa',
  borderColor:'#525c62',rowHoverColor:'#37464b',
  selectedRowBackgroundColor:'rgba(86,157,121,.2)',
  oddRowBackgroundColor:'#2d363c',fontFamily:'"OCR2MD Sarasa",monospace',fontSize:13,spacing:3});

export function checkLatex(item){
  // Rendering and human review are orthogonal: incomplete MinerU fragments
  // can parse successfully, while an unreviewed fragment may fail KaTeX.
  if(item.issue&&!item.detection)
    return {...item,status:'错误',renderStatus:'未检测',error:item.issue,html:''};
  if(!item.content.trim())
    return {...item,status:'错误',renderStatus:'未检测',error:'空公式',html:''};
  try{
    const html=katex.renderToString(item.content,{displayMode:item.kind==='独立',
      throwOnError:true,trust:false,maxExpand:1000,strict:'warn'});
    if(item.detection)return {...item,status:'待复核',renderStatus:'成功',error:item.issue,html};
    return {...item,status:'通过',renderStatus:'成功',error:'',html};
  }catch(e){
    const message=String(e.message||e).slice(0,300);
    // A guessed fragment may have incomplete boundaries. Report the parse
    // failure but never assert that the original document has bad TeX.
    if(item.detection)return {...item,status:'待复核',renderStatus:'失败',
      error:`KaTeX：${message}；可能是公式边界不完整`,html:''};
    return {...item,status:'错误',renderStatus:'失败',error:message,html:''};
  }
}

export function createLatexModule(host,getMarkdown,onStatus){
  host.classList.add('ocr-latex-pane');
  const gridHost=document.createElement('div');gridHost.className='ocr-latex-grid';
  host.append(gridHost);
  let grid,disposed=false,active=false,queued=false,rows=[];
  let reviewRecords=new Map(),reviewsLoaded=false,reviewsLoading=null;
  const savingReviews=new Set();
  function report(){
    if(!active)return;
    onStatus(`LaTeX ${rows.length} 项 · 渲染成功 ${rows.filter(row=>row.renderStatus==='成功').length} / 失败 ${rows.filter(row=>row.renderStatus==='失败').length} / 未检测 ${rows.filter(row=>row.renderStatus==='未检测').length} · 待复核 ${rows.filter(row=>row.status==='待复核').length} / latex ${rows.filter(row=>row.status==='latex').length} / 忽略 ${rows.filter(row=>row.status==='忽略').length}`);
  }
  function updateRowReview(item,review){
    item.status=review;
    grid.applyTransaction({update:[item]});
    report();
  }
  async function saveReview(item,value){
    if(disposed||!reviewsLoaded||!reviewOptions.includes(value)||
       item.status===value||savingReviews.has(item.reviewKey))return;
    const before=item.status;
    savingReviews.add(item.reviewKey);
    if(value==='待复核')reviewRecords.delete(item.reviewKey);
    else reviewRecords.set(item.reviewKey,value);
    updateRowReview(item,value);
    try{
      const response=await fetch('/api/latex/review',{method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({key:item.reviewKey,review:value})});
      if(!response.ok)throw Error(response.status===403?'需先取得编辑授权':`HTTP ${response.status}`);
      const result=await response.json();
      if(result.review!==value)throw Error('服务端审阅状态不一致');
      report();
    }catch(error){
      if(before==='待复核')reviewRecords.delete(item.reviewKey);
      else reviewRecords.set(item.reviewKey,before);
      updateRowReview(item,before);
      onStatus(`LaTeX 审阅未保存：${error.message}`);
    }finally{
      savingReviews.delete(item.reviewKey);
      if(!disposed)grid.applyTransaction({update:[item]});
    }
  }
  async function loadReviews(){
    if(reviewsLoading)return reviewsLoading;
    reviewsLoading=(async()=>{
      const response=await fetch('/api/latex/reviews',{cache:'no-store'});
      if(!response.ok)throw Error(`HTTP ${response.status}`);
      const data=await response.json();
      if(!data?.reviews || typeof data.reviews!=='object' || Array.isArray(data.reviews))
        throw Error('审阅记录格式不正确');
      reviewRecords=new Map(Object.entries(data.reviews));
      reviewsLoaded=true;
      if(!disposed)refresh();
    })().catch(error=>{
      if(!disposed&&active)onStatus(`LaTeX 审阅记录加载失败：${error.message}`);
    }).finally(()=>{reviewsLoading=null;});
    return reviewsLoading;
  }
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
    {field:'renderStatus',headerName:'渲染',width:89,minWidth:83,
      filter:EnumCheckboxFilter,suppressHeaderMenuButton:true,
      cellRenderer:p=>{
        if(!p.data)return '';
        const el=document.createElement('span');el.className='ocr-latex-render-status';
        el.dataset.render=p.value==='成功'?'success':p.value==='失败'?'failure':'unavailable';
        el.textContent=p.value;
        el.title=p.value==='失败'?(p.data.error||'KaTeX 无法渲染'):
          p.value==='成功'?'KaTeX 能解析渲染；不代表 OCR 内容已确认':'未执行渲染';
        return el;
      }},
    {field:'status',headerName:'审阅',width:106,minWidth:98,
      filter:EnumCheckboxFilter,suppressHeaderMenuButton:true,
      cellRenderer:p=>{
        if(!p.data)return '';
        const dropdown=document.createElement('select');
        dropdown.className='ocr-latex-review-select';
        dropdown.setAttribute('aria-label',`第 ${p.data.line} 行公式审阅`);
        for(const choice of reviewOptions){
          const option=document.createElement('option');
          option.value=choice;option.textContent=choice;
          dropdown.append(option);
        }
        dropdown.value=p.data.status;
        dropdown.disabled=!reviewsLoaded||savingReviews.has(p.data.reviewKey);
        dropdown.dataset.review=p.data.status;
        // A popup selection must not also trigger a four-pane AG row click.
        for(const event of ['pointerdown','mousedown','click','touchstart'])
          dropdown.addEventListener(event,evt=>evt.stopPropagation());
        dropdown.addEventListener('change',()=>void saveReview(p.data,dropdown.value));
        return dropdown;
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
    const seen=new Map();
    rows=findLatex(getMarkdown()).map(item=>{
      const row=checkLatex(item);
      const fingerprint=formulaFingerprint(`${item.kind}\n${item.content}`);
      const occurrence=(seen.get(fingerprint)||0)+1;
      seen.set(fingerprint,occurrence);
      row.reviewKey=`${fingerprint}:${occurrence}`;
      row.status=reviewRecords.get(row.reviewKey)||'待复核';
      return row;
    });
    grid.setGridOption('rowData',rows);
    report();
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
    setActive(enabled){
      active=enabled;host.hidden=!enabled;
      if(enabled){refresh();if(!reviewsLoaded)void loadReviews();}
    },
    dispose(){disposed=true;unsubscribe();grid.destroy();},
  };
}
