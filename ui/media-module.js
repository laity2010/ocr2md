/** Media business module: discover Markdown images, resumable backend chunks,
 * and optimistic CMD replacement. Owns its AG grid; never owns an EditorView.
 */
import {createGrid,AllCommunityModule,ModuleRegistry,themeQuartz} from 'ag-grid-community';
import {viewStore,publishFocus} from './view-store.js';
import './media-module.css';

ModuleRegistry.registerModules([AllCommunityModule]);
const imageRe=/!\[[^\]\n]*\]\((https?:\/\/[^\s)]+|media\/[0-9a-f]{24}\.(?:jpe?g|png|gif|webp))\)/g;
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
  for(const match of source.matchAll(imageRe)){
    const url=match[1],from=match.index+match[0].lastIndexOf(url),to=from+url.length;
    if(evidence.some(([start,end])=>from<end&&to>start))continue;
    for(let i=last;i<from;i++)if(source.charCodeAt(i)===10)line++;
    last=from;
    out.push({id:String(from),from,to,line,url,
      local:url.startsWith('media/'),status:url.startsWith('media/')?'本地':'待下载',
      bytes:0,total:null});
  }
  return out;
}

export function createMediaModule(host,getMarkdown,cmd,onStatus){
  host.classList.add('ocr-media-pane');
  const gridHost=document.createElement('div');
  gridHost.className='ocr-media-grid';
  host.append(gridHost);
  let rows=[],grid,active=false,disposed=false,queued=false,allRunning=false;
  const paused=new Set(),running=new Set();
  const states=new Map();
  const stateFor=url=>states.get(url)||{state:'pending',bytes:0,total:null};
  const summarize=()=>rows.filter(r=>!r.local).length;
  const valueOf=row=>{
    if(row.local)return '本地';
    const state=stateFor(row.url);
    if(state.state==='partial')return '已下载 '+(state.total?`${Math.round(state.bytes/state.total*100)}%`:`${state.bytes} B`);
    if(running.has(row.url))return '下载中 '+(state.total?`${Math.round(state.bytes/state.total*100)}%`:`${state.bytes} B`);
    return state.state==='complete'?'已下载':state.state==='error'?'失败':state.state==='paused'?'已暂停':'待下载';
  };
  function refresh(){
    if(disposed)return;
    rows=findMedia(getMarkdown());
    grid?.setGridOption('rowData',rows);
  }
  function schedule(){if(queued||disposed)return;queued=true;queueMicrotask(()=>{queued=false;refresh();});}
  async function getStatus(url){
    const r=await fetch('/api/media/status?url='+encodeURIComponent(url),{cache:'no-store'});
    if(r.ok){states.set(url,await r.json());schedule();}
  }
  async function scan(){
    refresh();
    await Promise.allSettled([...new Set(rows.filter(r=>!r.local).map(r=>r.url))].map(getStatus));
    onStatus(`媒体 ${rows.length} 项，远程 ${summarize()} 项`);
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
  const columns=[
    {field:'line',headerName:'源码行',width:104,minWidth:90},
    {field:'url',headerName:'媒体链接',minWidth:195,flex:1,cellRenderer:p=>{
      const el=document.createElement('span');el.className='ocr-media-url';
      el.textContent=p.value;el.title=p.value;return el;
    }},
    {colId:'status',headerName:'状态',width:130,minWidth:110,valueGetter:p=>p.data?valueOf(p.data):''},
    {colId:'action',headerName:'操作',width:92,minWidth:84,cellRenderer:p=>{
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
  grid=createGrid(gridHost,{theme,columnDefs:columns,rowData:[],
    getRowId:p=>p.data.id,rowSelection:{mode:'singleRow',checkboxes:false,enableClickSelection:true},
    onRowClicked:e=>publishFocus({sourceLine:e.data.line,origin:'media',intent:'click'})});
  const unsubscribe=viewStore.subscribe((next,previous)=>{
    if(next.documentRevision!==previous.documentRevision)schedule();
  });
  refresh();
  return {
    refresh,scan,downloadAll,
    setActive(enabled){active=enabled;host.hidden=!enabled;if(enabled)void scan();},
    get count(){return rows.length;},
    dispose(){disposed=true;paused.clear();unsubscribe();grid.destroy();},
  };
}
