/** Real chapter delimitation plugin, preserving original V3 IrWorkbenchPanel.
 * WCP handles lifecycle, CQE carries all document I/O, TriPane owns geometry. */
import {TriPane,triPaneVersion} from '../../components/tripane.js';
import {ResidentHost,residentVersion} from '../../components/resident.js';
import {createBoundaryView} from './template.js';
import {createBoundaryFs} from './transport.js';
let resident=null,live=null,selectedBook='';
let navigator=null,navBusy=false,knownChapters=[],currentNavPath='';
const uiNav=()=>document.getElementById('v4-workbench-path-nav');
const uiNavStatus=()=>document.getElementById('v4-workbench-nav-status');
const reportStatus=(message,level='ready')=>document.dispatchEvent(
 new CustomEvent('wcp:module-status',{detail:{moduleId:'ocr2md:chapter-boundary',message,level}}));
const setNavStatus=text=>{const el=uiNavStatus();if(el)el.textContent=text;
 if(/失败|错误|未保存/.test(text))reportStatus(text,'error');
};
async function refreshNavigation(bus){
 if(navBusy||!selectedBook)return;
 navBusy=true;const select=uiNav();if(!select)return;
 const previous=select.value||currentNavPath||selectedBook;
 select.disabled=true;setNavStatus('读取章节目录…');
 try{
  const book=selectedBook,folder=book+'/chapters';
  const base={path:folder,nodeId:'',revision:'',cursor:'',offset:0,length:0};
  const r=await bus.query('boundary.fs.fetch',{...base,op:'list'});
  if(book!==selectedBook)return;
  let list=[];
  if(!r.error){
   const data=JSON.parse(r.data);list=data.entries?.filter(x=>x.kind==='file'&&x.path.startsWith(folder+'/')&&/\.md$/i.test(x.path))||[];
   let cursor=data.nextCursor||'';
   for(let i=0;cursor&&i<12;i++){
    const page=await bus.query('boundary.fs.fetch',{...base,op:'list',cursor});
    if(page.error)break;
    const obj=JSON.parse(page.data);
    list.push(...obj.entries.filter(x=>x.kind==='file'&&x.path.startsWith(folder+'/')&&/\.md$/i.test(x.path)));
    cursor=obj.nextCursor||'';
   }
  }else if(!/ENOENT|不存在|not found|404/i.test(r.error))throw Error(r.error);
  knownChapters=list.sort((a,b)=>a.path.localeCompare(b.path,'zh-CN'));
  select.replaceChildren();
  select.add(new Option('章节定界：'+book,book));
  if(knownChapters.length){
   select.add(new Option('章节清洗：'+folder+'/',folder));
   for(const item of knownChapters)select.add(new Option('章节清洗：'+item.path,item.path));
  }
  select.value=[...select.options].some(o=>o.value===previous)?previous:book;
  currentNavPath=select.value;
  setNavStatus(knownChapters.length?`已发布 ${knownChapters.length} 章节`: '尚未发布 chapters/');
 }catch(e){setNavStatus('章节导航失败：'+fail(e))}
 finally{navBusy=false;select.disabled=false}
}
async function navigateWorkbench(bus,path){
 const select=uiNav(),book=selectedBook;
 if(!book||!path.startsWith(book))return;
 if(live?.ir?.isDirty()&&currentNavPath===book&&path!==book){
  setNavStatus('章节定界有未保存的草稿；请先保存或撤销');if(select)select.value=currentNavPath;return;
 }
 if(currentNavPath!==book&&path!==currentNavPath){
  try{const approved=await bus.query('workbench.can-navigate',{});
   if(!approved.ok){setNavStatus(approved.error);if(select)select.value=currentNavPath;return}
  }catch(e){setNavStatus('切换章节检查失败：'+fail(e));if(select)select.value=currentNavPath;return}
 }
 if(path===book){
  currentNavPath=book;
  document.dispatchEvent(new CustomEvent('wcp:workflow-transition',{detail:{event:'workspace.selected'}}));
  return;
 }
 const chapter=path===book+'/chapters'?knownChapters[0]?.path:path;
 if(!chapter){setNavStatus('尚无可清洗的章节文件');if(select)select.value=book;return}
 const target=await bus.publish('workbench.chapter-selected',{book,path:chapter}).catch(e=>setNavStatus(fail(e)));
 // The chapters/ option resolves to the first actual MD document. After
 // navigation, the visible label must identify the *open file*, not just the
 // container the reader entered from.
 currentNavPath=chapter;
 if(select&&[...select.options].some(option=>option.value===chapter))select.value=chapter;
 document.dispatchEvent(new CustomEvent('wcp:workflow-transition',{detail:{event:'workbench.cleaning'}}));
}
function installNavigation(bus){
 const host=document.getElementById('v4-workflow-controls');if(!host)return;
 const select=document.createElement('select');select.id='v4-workbench-path-nav';select.dataset.testid='workbench-path-nav';
 select.setAttribute('aria-label','以工作目录为根的书籍与章节导航');
 select.addEventListener('change',()=>void navigateWorkbench(bus,select.value));
 const refresh=document.createElement('button');refresh.type='button';refresh.textContent='↻';
 refresh.title='刷新已发布章节列表';refresh.dataset.testid='workbench-nav-refresh';
 refresh.addEventListener('click',()=>void refreshNavigation(bus));
 const status=document.createElement('span');status.id='v4-workbench-nav-status';status.style.cssText='color:#a9bacc;font-size:11px;white-space:nowrap';
 host.append(select,refresh,status);navigator=select;
}

const get=id=>document.getElementById(id);
function bookTitle(path){return 'Obsidian/ocr2md'+path}
function fail(error){return String(error instanceof Error?error.message:error).slice(0,600)}
function indicator(text,level='ready'){
 const el=get('ir-status');if(el){el.textContent=text;el.dataset.level=level}
 reportStatus(text,level);
}
async function loadBook(ctx,book,requestedPdf=''){
 if(!book||ctx.currentBook===book&&!requestedPdf||ctx.loading===book)return;
 if(ctx.ir.isDirty()){
   const select=get('boundary-pdf-file');if(select&&ctx.pdfFile)select.value=ctx.pdfFile.path;
   indicator('存在未保存的章节定界草稿。请先保存或撤销，不能自动切换书籍。','error');return;
 }
 const epoch=++ctx.epoch;ctx.loading=book;
 get('boundary-book-label').textContent=bookTitle(book);
 ctx.root.setAttribute('aria-busy','true');
 indicator('正在读取工作目录及已保存 DIRjson…','busy');
 try{
  const fs=ctx.fs;
  let cursor,checked=0;const files=[];
  do{
   const page=await fs.list({workspaceId:fs.workspaceId,path:book},cursor);
   checked+=page.entries.length;
   files.push(...page.entries.filter(x=>x.kind==='file'&&x.path.startsWith(book+'/')&&/\.pdf$/i.test(x.path)));
   cursor=page.nextCursor||undefined;
   if(checked>800)throw Error('工作目录文件过多，请先整理再做章节定界');
  }while(cursor);
  if(!files.length)throw Error('工作目录下没有 PDF 原文');
  const file=files.find(f=>f.path===requestedPdf)||files[0];
  const select=get('boundary-pdf-file');
  if(select){select.replaceChildren(...files.map(item=>new Option(item.path.split('/').at(-1),item.path)));select.value=file.path;}
  if(epoch!==ctx.epoch)return;
  ctx.currentBook='';ctx.pdfFile=file;
  await ctx.ir.open(fs,book,file);
  if(epoch!==ctx.epoch)return;
  ctx.currentBook=book;get('boundary-book-label').textContent=bookTitle(book);
  // Use the official PDF.js viewer and authenticated Range-FS reader.
  await ctx.pdf.open(fs,file);
  if(epoch!==ctx.epoch)return;
  indicator(ctx.ir.status.textContent||'章节定界已加载');
  get('ir-ocr-source-choice').hidden=!get('ir-ocr-select')?.querySelectorAll('option')?.length||get('ir-ocr-select').options.length<=2;
 }catch(error){if(epoch===ctx.epoch)indicator('加载章节定界失败：'+fail(error),'error')}
 finally{if(epoch===ctx.epoch){ctx.loading='';ctx.root.removeAttribute('aria-busy')}}
}
// V3 uses crypto.randomUUID(), which browsers omit on plain HTTP LAN IPs.
// getRandomValues() remains available, so preserve 1226-line legacy controller
// unchanged and supply a standards-compliant CSPRNG UUID only when necessary.
function ensureLegacyUuid(){
 if(typeof crypto.randomUUID==='function')return;
 if(typeof crypto.getRandomValues!=='function')throw Error('安全随机数源不可用，禁止保存');
 Object.defineProperty(crypto,'randomUUID',{configurable:true,value:()=>{
  const bytes=crypto.getRandomValues(new Uint8Array(16));
  bytes[6]=(bytes[6]&0x0f)|0x40;bytes[8]=(bytes[8]&0x3f)|0x80;
  const h=[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
  return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
 }});
}
async function show(host,bus){
 if(live){live.host=host;resident.show(get('v4-module-mount'));return}
 const dock=new ResidentHost({attributes:{'data-boundary-resident':'true'},onResize:()=>{
   live?.tri?.resize();if(live?.pdf?.snapshot().phase==='ready')void live.pdf.resize();
 }});
 resident=dock;
 const root=document.createElement('section');dock.element.append(root);
 let slots,layout;
 try{
  slots=createBoundaryView(root);
  // Establish the containing block immediately, as the settings adapter does.
  // The layout must not depend on a newly inserted stylesheet being flushed.
  slots.root.style.position='relative';
  layout=new TriPane(slots.root,{slots:{ag:slots.ag,source:slots.source,preview:slots.preview},
    compactLayout:'right-stack',mode:'compact',storage:sessionStorage,
    storageKey:'ocr2md-v4-boundary-tri-v1'});
 }catch(error){
  // A failed first mount has no live controller yet. Remove BOTH the parked
  // view and its moved toolbar nodes before any retry can create duplicate IDs.
  dock.dispose();get('boundary-module-tools')?.remove();resident=null;
  reportStatus('章节定界布局初始化失败：'+fail(error),'error');
  throw error;
 }
 live={host,bus,root,tri:layout,epoch:0,loading:'',currentBook:'',ir:null,pdf:null,fs:null,pdfFile:null};
 dock.show(get('v4-module-mount'));
 indicator('正在载入原版章节定界控制器…','busy');
 try{
  // Keep the original V3 boundary selectors in this plugin only. Never
  // install legacy global workbench CSS into the WCP shell.
  for(const [name,attribute] of [['pdf-viewer.css','boundaryPdfCss'],['legacy-preview.css','boundaryPreviewCss'],['legacy-theme.css','boundaryV3Css']]){
   const marker='data-'+attribute.replace(/[A-Z]/g,c=>'-'+c.toLowerCase());
   if(!document.querySelector('link['+marker+']')){
    const css=document.createElement('link');css.rel='stylesheet';
    css.href=new URL('./'+name,import.meta.url).href;
    css.setAttribute(marker,'true');document.head.append(css);
   }
  }
  // Large V3 IR/AG/PDF code is loaded only when the tab is actually opened.
  ensureLegacyUuid();
  const {IrWorkbenchPanel,V3PdfPreview,DEFAULT_DIRECTORY_SETTINGS,MacVaultHttpFS}=await import('./legacy.js');
  const ctx=live;if(!ctx)return;
  ctx.fs=createBoundaryFs(bus,MacVaultHttpFS,({loaded,total})=>{
   if(ctx.loading&&loaded>=0&&total>0){
    const pct=Math.round(100*loaded/total);
    indicator('正在恢复已保存 DIRjson：'+pct+'%','busy');
   }
  });
  get('boundary-retry').addEventListener('click',()=>{
   if(selectedBook)void loadBook(ctx,selectedBook,ctx.pdfFile?.path||'');
   else indicator('请先在「工作目录」选择书籍并设为工作目录','error');
  });
  const pdfHost=get('boundary-pdf-view');
  ctx.pdf=new V3PdfPreview(pdfHost,state=>{
    const page=get('boundary-page');if(page&&state.page)page.value=String(state.page);
    if(pdfHost)pdfHost.dataset.pdfPhase=state.phase;
    if(state.phase==='error')indicator('PDF 原文：'+String(state.error||'加载失败'),'error');
  },(page,x,y)=>ctx.ir?.onPdfPoint(page,x,y));
  ctx.pdf.setTheme(DEFAULT_DIRECTORY_SETTINGS.pdfTheme);
  ctx.ir=new IrWorkbenchPanel(get('workbench-ir-grid'),get('workbench-ir-source'),
   async(regions,id)=>{
    if(!regions.length)return;
    if(ctx.pdf?.snapshot().phase!=='ready'){
      // AG selected the source now; notify the user if the PDF is not ready.
      indicator('源码已定位，高亮等待 PDF 原文加载完成…','busy');
      return;
    }
    switchView('pdf');
    await ctx.pdf.focusRegion(regions[0],id);
   },DEFAULT_DIRECTORY_SETTINGS,async page=>{
     switchView('pdf');await ctx.pdf?.focusPage(page);
   });
  ctx.ir.setStage('chapters');
  get('boundary-pdf-file').addEventListener('change',e=>{
    if(ctx.currentBook)void loadBook(ctx,ctx.currentBook,e.target.value);
  });
  // V3 keeps PDF.js geometrically mounted when MD preview is foreground.
  // Using display:none here collapses the PDF viewer and loses async region
  // overlays after an AG row requests focus from the MD tab.
  const switchView=which=>{
    const isPdf=which==='pdf';
    get('boundary-preview-pdf').setAttribute('aria-selected',String(isPdf));
    get('boundary-preview-md').setAttribute('aria-selected',String(!isPdf));
    const pdf=get('boundary-pdf-view'),md=get('ir-markdown-preview');
    pdf.hidden=false;pdf.style.display='block';
    pdf.style.visibility=isPdf?'visible':'hidden';
    pdf.style.pointerEvents=isPdf?'auto':'none';
    md.hidden=isPdf;md.style.display=isPdf?'none':'block';
    if(isPdf&&ctx.pdf.snapshot().phase==='ready')void ctx.pdf.resize();
  };
  get('boundary-preview-pdf').addEventListener('click',()=>switchView('pdf'));
  get('boundary-preview-md').addEventListener('click',()=>switchView('md'));
  get('boundary-prev').addEventListener('click',()=>void ctx.pdf.showPage(ctx.pdf.snapshot().page-1));
  get('boundary-next').addEventListener('click',()=>void ctx.pdf.showPage(ctx.pdf.snapshot().page+1));
  get('boundary-page').addEventListener('change',e=>void ctx.pdf.showPage(Number(e.target.value)));
  get('boundary-zoomout').addEventListener('click',()=>ctx.pdf.zoomStep(-1));
  get('boundary-zoomin').addEventListener('click',()=>ctx.pdf.zoomStep(1));
  get('boundary-zoom-value').addEventListener('change',e=>{
   const value=e.target.value;
   if(value==='page-width'||value==='page-fit')ctx.pdf.setZoom(value);
   else ctx.pdf.setZoom('custom',Number(value));
  });
  get('boundary-pdf-reload').addEventListener('click',()=>{
   if(ctx.pdfFile&&ctx.fs)void ctx.pdf.open(ctx.fs,ctx.pdfFile);
  });
  switchView('pdf');
  const statusObserver=new MutationObserver(()=>{
   if(/^发布成功：/.test(get('ir-status')?.textContent||''))void refreshNavigation(bus);
  });
  statusObserver.observe(get('ir-status'),{childList:true,characterData:true,subtree:true});
  // V3 IrWorkbenchPanel also writes this node directly, bypassing the newer
  // wrapper indicator. The plugin mirrors the final business message without
  // introducing a second visible status surface.
  const statusRelay=new MutationObserver(()=>{
   const node=get('ir-status');if(node?.textContent)reportStatus(node.textContent,node.dataset.level||'ready');
  });
  statusRelay.observe(get('ir-status'),{childList:true,characterData:true,subtree:true,
   attributes:true,attributeFilter:['data-level']});
  const chosen=await bus.query('workspace.current',{});
  if(chosen.selected&&chosen.path)selectedBook=chosen.path;
  // WCP may mount the resident view after workspace.selected was published.
  // Always restore the top-level book navigation from the authoritative CQE
  // snapshot during mount instead of relying solely on an event subscription.
  if(selectedBook)void refreshNavigation(bus);
  if(selectedBook)await loadBook(ctx,selectedBook);
  else indicator('请先在「工作目录」选定含 PDF 的书籍文件夹');
 }catch(error){indicator('章节定界控制器初始化失败：'+fail(error),'error')}
}
export const boundaryModule={
 id:'ocr2md:chapter-boundary',name:'章节定界',version:'1.0.0',presentation:'full',order:30,
 description:'原 V3 DIRjson 章节定界、AG + CodeMirror + 官方 PDF.js；CQE 读写和版本化保存发布。',
 isDirty(){return Boolean(live?.ir?.isDirty())},
 inspectComponents(){return [{id:'wcp:tripane',name:'WCP TriPane',version:triPaneVersion},
  {id:'wcp:resident',name:'WCP ResidentHost',version:residentVersion}]},
 setup(bus){
  installNavigation(bus);
  const unsubscribe=bus.subscribe('workspace.selected',({path})=>{
   selectedBook=path;currentNavPath=path;
   void refreshNavigation(bus);
   if(live?.ir)void loadBook(live,path);
   // Pure navigation hint; all book data stays on the authorized CQE bus.
   document.dispatchEvent(new CustomEvent('wcp:workflow-transition',{detail:{event:'workspace.selected'}}));
  });
  void bus.query('workspace.current',{}).then(({selected,path})=>{
   if(selected&&path){selectedBook=path;currentNavPath=path;void refreshNavigation(bus)}
  }).catch(()=>{});
  return unsubscribe;
 },
 async mount(host,bus){await show(host,bus)},
 unmount(host){if(live?.host===host)resident?.hide()}
};
