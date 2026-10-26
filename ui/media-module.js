/** Media business module: discover Markdown images, resumable backend chunks,
 * and optimistic CMD replacement. Owns its AG grid; never owns an EditorView.
 */
import {createGrid,AllCommunityModule,ModuleRegistry,themeQuartz} from 'ag-grid-community';
import {viewStore,publishFocus} from './view-store.js';
import {EnumCheckboxFilter} from './enum-checkbox-filter.js';
import './media-module.css';

ModuleRegistry.registerModules([AllCommunityModule]);
// Include sized Markdown links and Obsidian wiki image links in adoption.
// Capture only the image path; leave the |width suffix intact on edits.
const imageRe=/!\[[^\]\n]*\]\((https?:\/\/[^\s)|]+|media\/[0-9a-f]{24}\.(?:jpe?g|png|gif|webp))(?:\|[1-9]\d{0,3}(?:x[1-9]\d{0,3})?)?\)/g;
const wikiImageRe=/!\[\[(media\/[0-9a-f]{24}\.(?:jpe?g|png|gif|webp))(?:\|[1-9]\d{0,3}(?:x[1-9]\d{0,3})?)?\]\]/g;
const theme=themeQuartz.withParams({
  accentColor:'#569d79',backgroundColor:'#2f383e',foregroundColor:'#d3c6aa',
  headerBackgroundColor:'#272f34',headerTextColor:'#d3c6aa',
  borderColor:'#525c62',rowHoverColor:'#37464b',
  selectedRowBackgroundColor:'rgba(86,157,121,.2)',
  oddRowBackgroundColor:'#2d363c',fontFamily:'"OCR2MD Sarasa",monospace',
  fontSize:14,spacing:3,
});

export function findMedia(source){
  const out=[];
  let line=1,last=0;
  // Do not inspect data within the original immutable MinerU evidence blobs.
  const evidence=[...source.matchAll(/<!--\s*minerujson:(?!block:v1:)[\s\S]*?-->/g)]
    .map(m=>[m.index,m.index+m[0].length]);
  const found=[...source.matchAll(imageRe),...source.matchAll(wikiImageRe)]
    .map(match=>({url:match[1],from:match.index+match[0].lastIndexOf(match[1])}))
    .sort((a,b)=>a.from-b.from);
  for(const {url,from} of found){
    const to=from+url.length;
    if(evidence.some(([start,end])=>from<end&&to>start))continue;
    for(let i=last;i<from;i++)if(source.charCodeAt(i)===10)line++;
    last=from;
    out.push({id:String(from),from,to,line,url,
      local:url.startsWith('media/'),status:url.startsWith('media/')?'本地':'待下载',
      bytes:0,total:null});
  }
  return out;
}

/** The Media domain uploads browser clipboard image bytes and returns a local
 * URL. It does not know the CMD source or paste position.
 */
export async function uploadPastedImage(file){
  if(!file||!['image/png','image/jpeg','image/gif','image/webp'].includes(file.type))
    throw Error('仅支持 PNG、JPEG、GIF 或 WebP 剪贴板图片');
  if(file.size<1||file.size>12*1024*1024)throw Error('粘贴图片必须小于 12 MB');
  const response=await fetch('/api/media/paste',{method:'POST',
    headers:{'Content-Type':file.type},body:file});
  if(response.status===403)throw Error('需要编辑授权，完成授权后重新粘贴图片');
  if(!response.ok)throw Error(`图片保存 HTTP ${response.status}: ${(await response.text()).slice(0,120)}`);
  const result=await response.json();
  if(!/^media\/[0-9a-f]{24}\.(?:jpg|jpeg|png|gif|webp)$/.test(result.path||''))
    throw Error('媒体服务未返回有效的本地路径');
  return result.path;
}

export function createMediaModule(host,getMarkdown,cmd,onStatus){
  host.classList.add('ocr-media-pane');
  const gridHost=document.createElement('div');
  gridHost.className='ocr-media-grid';
  host.append(gridHost);
  let rows=[],grid,active=false,disposed=false,queued=false,allRunning=false;
  let localFiles=[],chapterReferences=new Set();
  const paused=new Set(),running=new Set();
  const states=new Map();
  const stateFor=url=>states.get(url)||{state:'pending',bytes:0,total:null};
  const summarize=()=>rows.filter(r=>!r.local).length;
  const statusKind=row=>{
    if(row.local)return '本地';
    const state=stateFor(row.url);
    if(running.has(row.url))return '下载中';
    if(state.state==='partial')return '部分下载';
    return {complete:'已下载',error:'失败',paused:'已暂停'}[state.state]||'待下载';
  };
  const adoptionOf=row=>row.adopted?'已采用':'未采用';
  const valueOf=row=>{
    if(row.local)return '本地';
    const state=stateFor(row.url);
    if(state.state==='partial')return '已下载 '+(state.total?`${Math.round(state.bytes/state.total*100)}%`:`${state.bytes} B`);
    if(running.has(row.url))return '下载中 '+(state.total?`${Math.round(state.bytes/state.total*100)}%`:`${state.bytes} B`);
    return state.state==='complete'?'已下载':state.state==='error'?'失败':state.state==='paused'?'已暂停':'待下载';
  };
  function refresh(){
    if(disposed)return;
    const referenced=findMedia(getMarkdown());
    // The live CMD document is the source of truth for unsaved edits; the
    // read-only published chapters are a second legitimate reference source.
    const adoptedPaths=new Set([
      ...referenced.filter(row=>row.local).map(row=>row.url),
      ...chapterReferences,
    ]);
    rows=referenced.map(row=>({...row,adopted:true}));
    const linked=new Set(rows.filter(row=>row.local).map(row=>row.url));
    for(const file of localFiles){
      if(linked.has(file.path))continue;
      rows.push({id:'file:'+file.path,line:null,url:file.path,local:true,
        bytes:file.bytes,total:file.bytes,adopted:adoptedPaths.has(file.path)});
    }
    grid?.setGridOption('rowData',rows);
  }
  function schedule(){if(queued||disposed)return;queued=true;queueMicrotask(()=>{queued=false;refresh();});}
  async function getStatus(url){
    const r=await fetch('/api/media/status?url='+encodeURIComponent(url),{cache:'no-store'});
    if(r.ok){states.set(url,await r.json());schedule();}
  }
  async function scan(){
    refresh();
    const inventory=fetch('/api/media/inventory',{cache:'no-store'})
      .then(async response=>{
        if(!response.ok)throw Error('媒体清单 HTTP '+response.status);
        const data=await response.json();
        localFiles=Array.isArray(data.files)?data.files:[];
        chapterReferences=new Set(Array.isArray(data.chapterReferences)?data.chapterReferences:[]);
        refresh();
      });
    const progress=Promise.allSettled([...new Set(rows.filter(r=>!r.local).map(r=>r.url))].map(getStatus));
    const results=await Promise.allSettled([inventory,progress]);
    if(results[0].status==='rejected'){
      onStatus('媒体清单读取失败：'+results[0].reason.message,'error');
      return;
    }
    onStatus(`媒体 ${rows.length} 项，已采用 ${rows.filter(r=>r.adopted).length} 项，未采用 ${rows.filter(r=>!r.adopted).length} 项`);
  }
  async function downloadOne(url){
    if(running.has(url))return;
    if(!url.startsWith('https://') && !(url.startsWith('http://127.0.0.1:') && location.hostname==='127.0.0.1'))
      throw Error('仅支持 HTTPS 远程媒体');
    running.add(url);paused.delete(url);schedule();
    let unauthorized=false;
    try{
      while(!paused.has(url)){
        const response=await fetch('/api/media/chunk',{method:'POST',
          headers:{'Content-Type':'application/json'},body:JSON.stringify({url})});
        if(response.status===403){unauthorized=true;throw Error('需要编辑授权，请先点保存完成授权');}
        if(!response.ok)throw Error(`HTTP ${response.status}: ${(await response.text()).slice(0,120)}`);
        const state=await response.json();
        states.set(url,state);schedule();
        if(state.state==='complete'){
          if(!localFiles.some(file=>file.path===state.path))
            localFiles.push({path:state.path,bytes:state.bytes});
          if(active)grid?.refreshCells({force:true,columns:['preview']});
          // Re-scan the *current* CMD source after network I/O; stale offsets
          // or user edits cannot corrupt the document.
          const matches=findMedia(getMarkdown()).filter(row=>row.url===url);
          if(matches.length){
            cmd().replaceRanges(matches.map(row=>({from:row.from,to:row.to,
              expected:url,insert:state.path})));
            onStatus(`✓ 已本地化 ${matches.length} 处引用，记得保存 Markdown`);
          }else onStatus('✓ 媒体已下载；正文已改变，未替换其他链接');
          break;
        }
        if(state.state!=='partial'||!Number.isFinite(state.bytes))throw Error('Invalid media progress');
      }
      if(paused.has(url)){
        const state=stateFor(url);states.set(url,{...state,state:'paused'});
        onStatus('媒体下载已暂停，可续传');
      }
    }catch(error){
      states.set(url,{...stateFor(url),state:'error'});
      onStatus('媒体下载失败：'+error.message,'error');
    }finally{running.delete(url);schedule();}
    return !unauthorized;
  }
  async function downloadAll(){
    if(allRunning)return;
    allRunning=true;
    try{
      for(const url of [...new Set(findMedia(getMarkdown()).filter(r=>!r.local).map(r=>r.url))]){
        if(!allRunning)break;
        if(!await downloadOne(url))break; // Stop only on authorization error.
      }
    }finally{allRunning=false;}
  }
  // Native image elements use lazy decoding and the AG Grid viewport: no
  // extra browser fetches while the chapter module is active. Prefer the
  // completed local file, even if the CMD source still has a remote URL.
  function previewCell(params){
    if(!params.data)return '';
    const row=params.data,state=stateFor(row.url);
    const local=state.state==='complete' && /^media\/[0-9a-f]{24}\.(?:jpe?g|png|gif|webp)$/.test(state.path||'')
      ?state.path:null;
    const src='/'+(row.local?row.url:local||'');
    const address=row.local||local?src:row.url;
    const link=document.createElement('a');
    link.className='ocr-media-preview-link';
    link.href=address;
    link.target='_blank';link.rel='noopener noreferrer';
    link.referrerPolicy='no-referrer';
    link.title=row.line?'点击同步定位；Cmd/Ctrl+点击查看原图':'点击查看未引用媒体原图';
    link.setAttribute('aria-label',row.line?`定位第 ${row.line} 行媒体`:'查看未引用媒体原图');
    // The preview column is part of the Media AG: a normal tap must take
    // exactly the same four-pane focus path as tapping its source-line cell.
    // Cmd/Ctrl-click keeps the existing native open-original affordance;
    // unreferenced inventory files have no source coordinate to focus.
    link.addEventListener('click',event=>{
      event.stopPropagation();
      if(!row.line||event.metaKey||event.ctrlKey||event.shiftKey)return;
      event.preventDefault();
      params.node?.setSelected(true);
      publishFocus({sourceLine:row.line,origin:'media',intent:'click'});
    });
    const image=document.createElement('img');
    image.className='ocr-media-thumb';
    image.loading='lazy';image.decoding='async';
    image.referrerPolicy='no-referrer';
    image.alt=row.line?`第 ${row.line} 行媒体预览`:'未引用媒体预览';
    const fallback=document.createElement('span');
    fallback.className='ocr-media-thumb-fallback';
    fallback.hidden=true;fallback.textContent='无预览';
    image.addEventListener('error',()=>{image.hidden=true;fallback.hidden=false;});
    // Native lazy-loading alone can fetch from a hidden AG pane in Chrome;
    // keep src unset until the Media module is actually selected.
    if(active)image.src=address;
    link.append(image,fallback);
    return link;
  }
  const columns=[
    {colId:'preview',headerName:'预览',width:96,minWidth:88,pinned:'left',
      lockPinned:true,lockPosition:'left',cellRenderer:previewCell},
    {colId:'adopted',headerName:'采用',width:94,minWidth:85,
      valueGetter:p=>p.data?adoptionOf(p.data):'',
      filter:EnumCheckboxFilter,
      filterValueGetter:p=>p.data?adoptionOf(p.data):'',
      suppressHeaderMenuButton:true,
      cellRenderer:p=>{
        if(!p.data)return '';
        const el=document.createElement('span');
        el.className='ocr-media-adoption';
        el.dataset.adopted=p.data.adopted?'yes':'no';
        el.textContent=adoptionOf(p.data);
        return el;
      }},
    {field:'line',headerName:'源码行',width:76,minWidth:70,
      valueFormatter:p=>p.value??'—'},
    {field:'url',headerName:'媒体链接',minWidth:135,flex:1,cellRenderer:p=>{
      const el=document.createElement('span');el.className='ocr-media-url';
      el.textContent=p.value;el.title=p.value;return el;
    }},
    {colId:'status',headerName:'状态',width:113,minWidth:104,
      valueGetter:p=>p.data?valueOf(p.data):'',
      filter:EnumCheckboxFilter,
      filterValueGetter:p=>p.data?statusKind(p.data):'',
      suppressHeaderMenuButton:true},
    {colId:'action',headerName:'操作',width:85,minWidth:80,cellRenderer:p=>{
      if(!p.data||p.data.local)return '';
      const url=p.data.url,button=document.createElement('button');
      button.className='ocr-media-action';
      button.type='button';button.textContent=running.has(url)?'暂停':
        stateFor(url).state==='partial'||stateFor(url).state==='paused'?'续传':'下载';
      button.addEventListener('click',event=>{
        event.stopPropagation();
        if(running.has(url)){paused.add(url);return;}
        void downloadOne(url);
      });
      return button;
    }}
  ].map(c=>({sortable:false,resizable:true,suppressMovable:true,...c}));
  grid=createGrid(gridHost,{theme,columnDefs:columns,rowData:[],rowHeight:68,
    getRowId:p=>p.data.id,rowSelection:{mode:'singleRow',checkboxes:false,enableClickSelection:true},
    onRowClicked:e=>{
      if(e.data.line)publishFocus({sourceLine:e.data.line,origin:'media',intent:'click'});
    }});
  const unsubscribe=viewStore.subscribe((next,previous)=>{
    if(next.documentRevision!==previous.documentRevision)schedule();
  });
  refresh();
  return {
    api:grid,
    refresh,scan,downloadAll,
    setActive(enabled){
      active=enabled;host.hidden=!enabled;
      if(enabled){
        // Recreate visible row renderers only when the pane becomes active:
        // hidden thumbnails have no src and must be armed on activation.
        grid?.redrawRows();
        void scan();
      }
    },
    get count(){return rows.length;},
    dispose(){disposed=true;paused.clear();unsubscribe();grid.destroy();},
  };
}
