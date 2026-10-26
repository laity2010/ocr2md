/** Lab-only, read-only AG projection across manifest-backed chapter documents.
 * Scanners are reused from the five WCP modules; no CMD writes or extra
 * document/editor state is created. Selecting a row navigates to its source.
 */
import {createGrid,AllCommunityModule,ModuleRegistry,themeQuartz} from 'ag-grid-community';
import {buildOutline} from '../../../ui/outline-index.js';
import {findMedia} from '../../../ui/media-module.js';
import {findLatex} from '../../../ui/latex-scan.js';
import {checkLatex} from '../../../ui/latex-module.js';
import {findReviewMarkers} from '../../../ui/latex-review-markers.js';
import {scanAnnotations} from '../../../ui/cmd-annotations.js';
import {EnumCheckboxFilter} from '../../../ui/enum-checkbox-filter.js';
import {publishFocus} from '../../../ui/view-store.js';
import './chapter-all-elements.css';

ModuleRegistry.registerModules([AllCommunityModule]);
const theme=themeQuartz.withParams({
  accentColor:'#569d79',backgroundColor:'#2f383e',foregroundColor:'#d3c6aa',
  headerBackgroundColor:'#272f34',headerTextColor:'#d3c6aa',
  borderColor:'#525c62',rowHoverColor:'#37464b',
  selectedRowBackgroundColor:'rgba(86,157,121,.2)',
  oddRowBackgroundColor:'#2d363c',fontFamily:'"OCR2MD Sarasa",monospace',fontSize:13,spacing:3,
});
const namePattern=/^[0-9]{1,6}-[\p{L}\p{N}_-]{1,110}\.cmd\.chapter\.md$/u;
const base=location.pathname.match(/^\/labs\/[a-z][a-z0-9-]*\//)?.[0];
if(!base)throw Error('Cross-chapter AG requires isolated lab URL');

const filter=field=>({field,filter:EnumCheckboxFilter,suppressHeaderMenuButton:true});
const cell=(field,headerName,extra={})=>({field,headerName,resizable:true,sortable:false,suppressMovable:true,...extra});
const baseColumns=()=>[
  cell('chapter','章节',{width:215,minWidth:175,pinned:'left',lockPinned:true,
    ...filter('chapter')}),
  cell('line','源码行',{width:82,minWidth:72}),
];
function columnsFor(type){
  const prefix=baseColumns();
  if(type==='chapter-boundary')return [prefix[0],
    cell('title','标题',{minWidth:250,flex:2}),
    cell('level','层级',{width:78,minWidth:70,...filter('level')}),
    cell('pdfPage','PDF页码',{width:105,minWidth:90}),prefix[1]];
  if(type==='media')return [prefix[0],prefix[1],
    cell('preview','预览',{width:105,minWidth:90,cellRenderer:p=>{
      if(!p.data)return '';
      const url=p.data.url;
      const href=url.startsWith('media/')?base+url:url;
      const a=document.createElement('a');a.href=href;a.target='_blank';a.rel='noopener noreferrer';
      a.referrerPolicy='no-referrer';a.className='ocr-all-chapters-image';
      a.setAttribute('aria-label','查看媒体原图');a.addEventListener('click',e=>e.stopPropagation());
      const img=document.createElement('img');img.src=href;img.loading='lazy';img.decoding='async';
      img.alt='媒体';img.referrerPolicy='no-referrer';
      img.addEventListener('error',()=>{img.replaceWith(document.createTextNode('无预览'));});
      a.append(img);return a;
    }}),
    cell('url','链接',{minWidth:275,flex:2}),
    cell('local','位置',{width:88,valueFormatter:p=>p.value?'本地':'远程',...filter('local')})];
  return [prefix[0],prefix[1],
    cell('status','审阅',{width:100,...filter('status')}),
    cell('renderStatus','渲染',{width:88,...filter('renderStatus')}),
    cell('preview','预览',{minWidth:205,flex:1.3,cellRenderer:p=>{
      if(!p.data)return '';
      const el=document.createElement('div');el.className='ocr-all-chapters-latex-preview';
      if(p.data.html)el.innerHTML=p.data.html;
      else el.textContent=p.data.content;
      return el;
    }}),
    cell('content','源码',{minWidth:220,flex:1.5,cellRenderer:p=>{
      const el=document.createElement('span');el.className='ocr-all-chapters-source';
      el.textContent=p.value??'';return el;
    }}),
    cell('syntax','类型',{width:94,...filter('syntax')}),
    cell('error','错误信息',{minWidth:140,flex:0.8})];
}
export function scanChapterElements(name,source,type){
  const shared={chapter:name,sourceName:name};
  const items=type==='chapter-boundary' ? buildOutline(source).map(row=>({
    ...row,line:row.sourceLine,level:'H'+row.level,
  })) : type==='media' ? findMedia(source) : findLatex(source).map(item=>{
    const row=checkLatex(item);row.raw=source.slice(row.from,row.to);return row;
  });
  if(type==='latex')findReviewMarkers(source,items,scanAnnotations(source));
  return items.map((row,index)=>({...row,...shared,
    id:name+'#'+type+'#'+index,
    sourceEnd:row.sourceEnd??row.line+(row.raw?.split('\n').length||1),
    syntax:row.detection?'未定界':row.syntax,
  }));
}

export function mountAllChaptersGrid(outline,checkbox,indicator,getModule,onModeChange){
  const host=document.createElement('div');host.className='ocr-all-chapters-grid';
  host.hidden=true;outline.append(host);
  let grid=null,shown=false,disposed=false,loading=false,epoch=0,chapterDocs=[],loaded=false;
  let rows=[];
  const api={
    get enabled(){return shown;},
    enable(value){
      if(disposed)return;
      shown=Boolean(value);checkbox.checked=shown;
      outline.classList.toggle('ocr-all-chapters-mode',shown);
      host.hidden=!shown;
      onModeChange();
      if(!shown){epoch++;indicator.textContent='';return;}
      void load(true);
    },
    setModule(){if(shown)render();},
    reload(){if(shown)void load(true);},
    dispose(){disposed=true;epoch++;grid?.destroy();host.remove();},
  };
  const status=message=>{indicator.textContent=message;indicator.title=message;};
  async function read(url){
    const res=await fetch(base+url,{cache:'no-store'});
    if(!res.ok)throw Error(`读取失败 HTTP ${res.status}`);
    return res;
  }
  async function load(force){
    if(loaded&&!force){render();return;}
    const token=++epoch;loading=true;status('读取章节…');
    try{
      const manifest=await (await read('api/chapters')).json();
      const names=(manifest.files||[]).map(f=>f.name);
      if(!Array.isArray(manifest.files)||names.length>200||
        !names.every(n=>namePattern.test(n)))throw Error('章节清单格式不正确');
      // GET is strictly manifest checked by the existing lab server.
      const docs=await Promise.all(names.map(async name=>({name,
        source:await (await read('api/document?chapter='+encodeURIComponent(name))).text(),
      })));
      if(token!==epoch||!shown)return;
      chapterDocs=docs;loaded=true;
      render();
    }catch(e){if(token===epoch&&shown){status('汇总失败：'+e.message);grid?.destroy();grid=null;host.replaceChildren();}}
    finally{loading=false;}
  }
  function render(){
    if(disposed||!shown||!loaded)return;
    const type=getModule();
    rows=chapterDocs.flatMap(({name,source})=>scanChapterElements(name,source,type));
    if(!grid)grid=createGrid(host,{theme,columnDefs:columnsFor(type),rowData:rows,
      getRowId:p=>p.data.id,rowHeight:type==='latex'?95:type==='media'?66:39,
      headerHeight:37,animateRows:false,defaultColDef:{resizable:true},
      rowSelection:{mode:'singleRow',checkboxes:false,headerCheckbox:false,enableClickSelection:true},
      onRowClicked:e=>void openRow(e.data),
    });
    else{
      grid.setGridOption('columnDefs',columnsFor(type));
      grid.setGridOption('rowHeight',type==='latex'?95:type==='media'?66:39);
      grid.setGridOption('rowData',rows);
    }
    status(`${chapterDocs.length}章 · ${rows.length}项 · 已保存`);
  }
  async function openRow(row){
    if(!shown||!row||!row.sourceName)return;
    const detail={chapter:row.sourceName,promise:null};
    document.dispatchEvent(new CustomEvent('ocr2md:lab-switch-file',{detail}));
    try{
      if(!detail.promise)throw Error('章节切换尚未就绪');
      await detail.promise;
      if(!shown)return;
      api.enable(false);
      // Source file activation clears cross-file focus; publish only after it
      // has completed, so the normal single-chapter AG and CM6 receive it.
      requestAnimationFrame(()=>publishFocus({sourceLine:row.line,
        sourceEnd:row.sourceEnd,origin:'chapter-all',intent:'click'}));
    }catch(e){status('无法打开章节：'+e.message);}
  }
  checkbox.addEventListener('change',()=>api.enable(checkbox.checked));
  return api;
}
