/** Independent chapter-cleaning UI plugin. V3 controller owns document state;
 * WCP only passes scoped book/path references. No cross-plugin imports. */
import {TriPane,triPaneVersion} from '../../components/tripane.js';
import {ResidentHost,residentVersion} from '../../components/resident.js';
import {createBoundaryFs} from './transport.js';
let current=null,resident=null,wanted=null;
const find=id=>document.getElementById(id);
const names=['章节标题','媒体','表格','LaTeX'];
const safe=e=>String(e instanceof Error?e.message:e).slice(0,500);
function status(msg,level='ready'){
 const el=find('chapter-clean-status');if(el){el.textContent=msg;el.dataset.level=level}
 document.dispatchEvent(new CustomEvent('wcp:module-status',{
  detail:{moduleId:'ocr2md:chapter-cleaning',message:msg,level}}));
}
function createView(root){
 root.className='v4-cleaning';root.dataset.testid='chapter-cleaning-component';
 root.innerHTML=`<style>
 .v4-cleaning{width:100%;height:100%;display:flex;flex-direction:column;min-height:0;box-sizing:border-box;background:#1d2732;color:#e1e7ef;font:13px/1.5 var(--laity-ui-font,ui-monospace,monospace)}
 .v4-cleaning .clean-top,.v4-cleaning .clean-preview-title{display:flex;align-items:center;gap:7px;flex-wrap:wrap;padding:5px 8px;border-bottom:1px solid #43536b;background:#253343}
 .v4-cleaning :is(select,button,input){border:1px solid #52647c;border-radius:4px;color:#e1e7ef;background:#263746;font:inherit;padding:4px 7px}
 .v4-cleaning button:disabled{opacity:.48}.v4-cleaning [data-level=error]{color:#ffb1a6}
 .v4-cleaning #chapter-clean-status{flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:11px;color:#c2d2e3}
 .v4-cleaning .clean-layout{flex:1;min-height:0;min-width:0;position:relative}
 .v4-cleaning .clean-track{width:100%;height:100%;min-height:0;min-width:0;display:flex;flex-direction:column;overflow:hidden;background:#1d2732}
 .v4-cleaning .clean-track>section{flex:1;min-height:0;position:relative;overflow:hidden}
 .v4-cleaning #chapter-clean-grid,.v4-cleaning #chapter-clean-source,.v4-cleaning #chapter-clean-preview{width:100%;height:100%;min-height:0;overflow:auto}
 .v4-cleaning #chapter-clean-source .cm-editor{height:100%;background:#1d2732;color:#e1e7ef}
 .v4-cleaning #chapter-clean-pdf{position:absolute;inset:0;overflow:hidden;background:#29323a}
 .v4-cleaning #chapter-clean-pdf .pdfViewer .page{margin:4px auto;box-shadow:0 3px 16px #0007}
 .v4-cleaning #chapter-clean-pdf[data-pdf-theme=dark] .pdfViewer .page canvas{filter:invert(1) hue-rotate(180deg)}
 .v4-cleaning #chapter-clean-preview{position:absolute;inset:0;background:#1d2732;padding:12px;box-sizing:border-box}
 .v4-cleaning .clean-preview-title button[aria-selected=true]{background:#3b5269;color:white}
 </style>
 <header class="clean-top"><strong>章节清洗</strong>
 <label>模块 <select id="chapter-clean-module" data-testid="chapter-clean-module"><option>章节标题</option><option>媒体</option><option>表格</option><option>LaTeX</option></select></label>
 <label id="chapter-clean-number-wrap"><input id="chapter-clean-number" data-testid="chapter-clean-number" type="checkbox" checked> 标题序号</label>
 <button id="chapter-clean-media-download" data-testid="chapter-clean-media-download" type="button" hidden>下载图片</button>
 <button id="chapter-clean-normalize" type="button" title="将 MinerU 章节格式转换成 Obsidian MD 草稿">转换 OB 格式</button>
 <span id="chapter-clean-status" data-testid="chapter-clean-status" role="status">请先选择章节</span></header>
 <div class="clean-layout" id="chapter-clean-layout" data-testid="chapter-clean-layout">
  <div class="clean-track" id="chapter-clean-ag"><section><div id="chapter-clean-grid" data-testid="chapter-clean-grid"></div></section></div>
  <div class="clean-track" id="chapter-clean-code"><section><div id="chapter-clean-source" data-testid="chapter-clean-source"></div></section></div>
  <div class="clean-track" id="chapter-clean-foot"><div class="clean-preview-title">
   <button type="button" id="chapter-clean-pdf-tab" data-testid="chapter-clean-pdf-tab" aria-selected="false">PDF 原文</button>
   <button type="button" id="chapter-clean-md-tab" data-testid="chapter-clean-md-tab" aria-selected="true">MD 预览</button>
   <button type="button" id="chapter-clean-page-prev">‹</button><input type="number" id="chapter-clean-page" min="1" value="1" style="width:55px">
   <button type="button" id="chapter-clean-page-next">›</button></div>
   <section><div id="chapter-clean-pdf" data-testid="chapter-clean-pdf"></div><div id="chapter-clean-preview" data-testid="chapter-clean-preview"></div></section>
  </div>
 </div>`;
 return {root:find('chapter-clean-layout'),ag:find('chapter-clean-ag'),source:find('chapter-clean-code'),preview:find('chapter-clean-foot')};
}
function updateButtons(){if(!current?.workbench)return;const state=current.workbench.chapterState();
 find('chapter-clean-save').disabled=!state.dirty||state.saving||!current.canSave;
 current.media?.updateTool(find('chapter-clean-module').value==='媒体');
 find('chapter-clean-undo').disabled=!state.canUndo;
 find('chapter-clean-redo').disabled=!state.canRedo;
}
async function display(book,path){
 const ctx=current;if(!ctx||ctx.loading)return;
 if(ctx.workbench?.chapterState().dirty){status('有未保存的章节修改，请先保存或撤销','error');return}
 ctx.loading=true;status('读取已发布章节及 Markdown…','busy');
 try{
  const fs=ctx.fs;
  if(ctx.book!==book){await ctx.workbench.openFolder(book);ctx.book=book}
  let cursor,files=[];
  do{const page=await fs.list({workspaceId:fs.workspaceId,path:book+'/chapters'},cursor);
    files.push(...page.entries.filter(x=>x.kind==='file'&&/\.md$/i.test(x.path)));
    cursor=page.nextCursor||undefined;
    if(files.length>800)throw Error('章节数量过多');
  }while(cursor);
  ctx.workbench.setChapterFiles(files);
  ctx.workbench.setChapterMode(true);
  const chapter=files.find(x=>x.path===path)||files[0];
  if(!chapter)throw Error('尚未发布 chapters/*.md，先从书籍根目录发布');
  await ctx.workbench.openFile(chapter.path);
  // PDF original should remain navigable while chapter cleaning edits MD.
  if(!ctx.pdfFile){
   const folder=await fs.list({workspaceId:fs.workspaceId,path:book});
   const pdf=folder.entries.find(x=>x.kind==='file'&&/\.pdf$/i.test(x.path));
   if(pdf){ctx.pdfFile=pdf;void ctx.pdf.open(fs,pdf).catch(e=>status('PDF 加载失败：'+safe(e),'error'))}
  }
  status('已加载章节 · '+chapter.path.slice(book.length+1)+' · '+files.length+' 份 MD');
  updateButtons();
 }catch(e){status('章节清洗加载失败：'+safe(e),'error')}
 finally{ctx.loading=false}
}
async function mount(host,bus){
 if(current){current.host=host;resident.show(find('v4-module-mount'));return}
 resident=new ResidentHost({attributes:{'data-clean-resident':'true'},onResize:()=>{
  current?.tri?.resize();if(current?.pdf?.snapshot().phase==='ready')void current.pdf.resize();
 }});
 const root=document.createElement('section');resident.element.append(root);
 const slots=createView(root);
 const tri=new TriPane(slots.root,{slots:{ag:slots.ag,source:slots.source,preview:slots.preview},
  compactLayout:'right-stack',mode:'compact',storage:sessionStorage,storageKey:'ocr2md-v4-cleaning-tri-v1'});
 resident.show(find('v4-module-mount'));
 // Cleaning owns this toolbar fragment. WCP merely switches any fragment
 // carrying data-module-actions-owner; it never interprets the controls.
 const bar=document.getElementById('v4-top-actions');
 if(bar){
  let buttons=document.getElementById('cleaning-module-tools');
  if(!buttons){buttons=document.createElement('div');buttons.id='cleaning-module-tools';
   buttons.dataset.moduleActionsOwner='ocr2md:chapter-cleaning';buttons.hidden=true;bar.append(buttons)}
  for(const id of ['chapter-clean-module','chapter-clean-number-wrap','chapter-clean-media-download','chapter-clean-normalize']){
   const node=find(id);if(node)buttons.append(id==='chapter-clean-module'?(node.closest('label')||node):node);
  }
 }
 current={host,root,tri,bus,book:'',loading:false,canSave:false,fs:null,pdf:null,pdfFile:null,workbench:null};
 try{
  for(const file of ['pdf-viewer.css','clean-theme.css','clean-preview.css']){
   if(!document.querySelector('link[data-clean-style="'+file+'"]')){
    const link=document.createElement('link');link.rel='stylesheet';link.href=new URL(file,import.meta.url).href;
    link.dataset.cleanStyle=file;document.head.append(link);
   }
  }
  const {V3Workbench,V3PdfPreview,DEFAULT_DIRECTORY_SETTINGS,MacVaultHttpFS,ChapterMediaController}=await import('./legacy.js');
  const ctx=current;
  ctx.fs=createBoundaryFs(bus,MacVaultHttpFS);
  ctx.pdf=new V3PdfPreview(find('chapter-clean-pdf'),info=>{
   if(info.page)find('chapter-clean-page').value=String(info.page);
   find('chapter-clean-pdf').dataset.phase=info.phase;
  });
  ctx.workbench=new V3Workbench({open:async()=>ctx.fs},ctx.fs.workspaceId,()=>updateButtons(),
   ()=>{},find('chapter-clean-grid'),find('chapter-clean-source'),find('chapter-clean-preview'),()=>updateButtons());
  ctx.workbench.setHeadingPresentation(DEFAULT_DIRECTORY_SETTINGS);ctx.canSave=true;
  ctx.media=new ChapterMediaController(ctx.workbench,()=>updateButtons());
  ctx.workbench.registerChapterGridView(ctx.media.gridView);
  ctx.media.bindTool(find('chapter-clean-media-download'),()=>ctx.book,
    e=>status('媒体下载失败：'+safe(e),'error'));
  const change=()=>{const module=find('chapter-clean-module').value;
    ctx.workbench.setCleaningModule(module);find('chapter-clean-number-wrap').hidden=module!=='章节标题';
    ctx.media.updateTool(module==='媒体');
  };
  find('chapter-clean-module').addEventListener('change',change);change();
  find('chapter-clean-number').addEventListener('change',e=>ctx.workbench.setTitleNumbers(e.target.checked));
  find('chapter-clean-undo').addEventListener('click',()=>{ctx.workbench.undoChapter();updateButtons()});
  find('chapter-clean-redo').addEventListener('click',()=>{ctx.workbench.redoChapter();updateButtons()});
  find('chapter-clean-normalize').addEventListener('click',()=>{
    try{const r=ctx.workbench.normalizeCurrentChapter();status(r.changed?'Obsidian 格式转换已暂存，尚未保存':'当前无需格式转换');updateButtons()}
    catch(e){status(safe(e),'error')}
  });
  find('chapter-clean-save').addEventListener('click',()=>{
   if(!current?.book||!ctx.workbench.chapterState().dirty)return;
   if(!window.confirm('保存当前章节 MD 到 Obsidian？将由 Mac Vault 检查版本冲突。'))return;
   status('正在通过专用 CQE 保存章节…','busy');
   void ctx.workbench.saveChapter(ctx.book).then(()=>{
     status('章节保存成功，SHA/版本读回一致');updateButtons();
   }).catch(e=>{status('章节保存失败：'+safe(e),'error');updateButtons()});
  });
  const show=mode=>{const pdf=mode==='pdf';
   find('chapter-clean-pdf').style.visibility=pdf?'visible':'hidden';
   find('chapter-clean-preview').hidden=pdf;find('chapter-clean-preview').style.display=pdf?'none':'block';
   find('chapter-clean-pdf-tab').setAttribute('aria-selected',String(pdf));
   find('chapter-clean-md-tab').setAttribute('aria-selected',String(!pdf));
   if(pdf&&ctx.pdf.snapshot().phase==='ready')void ctx.pdf.resize();
  };
  find('chapter-clean-pdf-tab').addEventListener('click',()=>show('pdf'));
  find('chapter-clean-md-tab').addEventListener('click',()=>show('md'));
  find('chapter-clean-page-prev').addEventListener('click',()=>void ctx.pdf.showPage(ctx.pdf.snapshot().page-1));
  find('chapter-clean-page-next').addEventListener('click',()=>void ctx.pdf.showPage(ctx.pdf.snapshot().page+1));
  find('chapter-clean-page').addEventListener('change',e=>void ctx.pdf.showPage(Number(e.target.value)));
  show('md');
  if(wanted)await display(wanted.book,wanted.path);
 }catch(e){status('章节清洗初始化失败：'+safe(e),'error')}
}
export const cleaningModule={id:'ocr2md:chapter-cleaning',name:'章节清洗',version:'0.1.0',presentation:'full',
 isDirty(){return Boolean(current?.workbench?.chapterState().dirty)},
 inspectComponents(){return [{id:'wcp:tripane',name:'WCP TriPane',version:triPaneVersion},
  {id:'wcp:resident',name:'ResidentHost',version:residentVersion}]},
 setup(bus){
  const unsub1=bus.subscribe('workbench.chapter-selected',detail=>{wanted=detail;if(current?.workbench)void display(detail.book,detail.path)});
  const unsub2=bus.handle('workbench.can-navigate',()=>({ok:!current?.workbench?.chapterState().dirty,
   error:current?.workbench?.chapterState().dirty?'章节清洗存在未保存的编辑，请先保存或撤销':''}));
  return ()=>{unsub1();unsub2()};
 },
 async mount(host,bus){await mount(host,bus)},
 unmount(host){if(current?.host===host)resident?.hide()}
};
