/** Virtual chapter names from the current CMD index, not exported files.
 * All views share ONE mother CM6 document and its Undo/Redo/Save history.
 * The source select is the sole chapter-view navigator; Settings remains
 * its existing independent document/editor.
 */
import './source-file-navigation.css';
import {enhanceNavigationSelect} from './navigation-select.js';
import {viewStore} from '../../../ui/view-store.js';
import {chapterAssignments} from './chapter-files.js';

const DEFAULTS=Object.freeze([
  {id:'document',label:'章节定界/Buffett’s Alpha.minerujson.md'},
  {id:'settings',label:'全局设置/settings.json'},
]);
const chapterId=id=>'virtual:'+id;
let activeChapter=null;

export function createSourceFileNavigation(){
  const moduleSelector=document.getElementById('module-select');
  const workbench=document.getElementById('workspace');
  const settingsWorkbench=document.getElementById('settings-workspace');
  const selectBoxes=new Set();
  let views=[],bridge=null,refreshTimer=null;
  const selected=()=>activeChapter?chapterId(activeChapter):'document';
  const isSettings=()=>moduleSelector?.value==='settings';
  function syncOptions(){
    for(const select of selectBoxes){
      select.replaceChildren();
      for(const [heading,items] of [
        ['工作区',DEFAULTS],
        ['章节文件',views.map(item=>({id:chapterId(item.id),
          label:'章节chapter/'+item.name}))],
      ]){
        const group=document.createElement('optgroup');group.label=heading;
        for(const item of items){
          const option=document.createElement('option');
          option.value=item.id;option.textContent=item.label;group.append(option);
        }
        select.append(group);
      }
      // Both file navigator mirrors represent ONE active document. Hidden
      // source navigation must not keep '章节定界' selected in Settings.
      select.value=isSettings()?'settings':selected();
      select.ocrNavigationSelect?.refresh();
    }
  }
  function selectChapter(id,{preserveAll=false}={}){
    const detail={id,preserveAll,accepted:false,error:null};
    document.dispatchEvent(new CustomEvent('ocr2md:lab-virtual-select',{detail}));
    if(!detail.accepted)throw Error(detail.error||'虚拟章节视图尚未就绪');
    activeChapter=id;
    syncOptions();
  }
  function refreshChapters(){
    if(!bridge?.getCMD?.()?.getIndex)return;
    try{
      const index=bridge.getCMD().getIndex();
      const outline=bridge.views?.outline;
      // Use the original lab chapter filename formatter, but on the current
      // CMD boundaries, never on AG's asynchronously refreshed rowData. An
      // independent marker must immediately rename/renumber subsequent views.
      const pseudoRows=index.chapters.map(chapter=>({
        id:chapter.id,title:chapter.title,independent:true,
      }));
      const names=chapterAssignments(pseudoRows,outline?.startText||'000');
      const next=index.chapters.map((chapter,i)=>({
        id:chapter.id,name:names[i].file,from:chapter.from,
      }));
      if(activeChapter&&!next.some(row=>row.id===activeChapter)){
        const old=views.find(row=>row.id===activeChapter);
        const owner=old&&index.chapterAt(Math.min(old.from,index.bodyEnd-1));
        const substitute=owner?.id??null;
        // This chapter was merged with the preceding independent chapter.
        // Follow the resulting owner rather than navigating to a stale file.
        selectChapter(substitute);
      }
      views=next;
      syncOptions();
    }catch(error){
      console.warn('CMD 虚拟章节导航更新失败',error.message);
    }
  }
  function scheduleRefresh(immediate=false){
    clearTimeout(refreshTimer);
    refreshTimer=setTimeout(refreshChapters,immediate?0:220);
  }
  function navigate(target,{preserveAll=false}={}){
    if(target==='settings'){
      moduleSelector.value='settings';
      moduleSelector.dispatchEvent(new Event('change',{bubbles:true}));
      syncOptions();
      return;
    }
    if(target!=='document'&&!target.startsWith('virtual:')){
      syncOptions();return;
    }
    const next=target==='document'?null:target.slice('virtual:'.length);
    if(next&&!views.some(item=>item.id===next)){
      syncOptions();return;
    }
    try{
      if(activeChapter!==next||isSettings())selectChapter(next,{preserveAll});
      if(isSettings()||moduleSelector.value==='settings'){
        moduleSelector.value=next?'chapter-boundary':'chapter-boundary';
        moduleSelector.dispatchEvent(new Event('change',{bubbles:true}));
      }
      // Browser history keeps views addressable without ?chapter=<file>;
      // reload will still load only mother CM6 (never a derived file).
      const url=new URL(location.href);
      if(next)url.searchParams.set('view',next);
      else url.searchParams.delete('view');
      history.pushState(null,'',url.pathname+url.search+url.hash);
    }catch(error){
      console.warn('虚拟章节视图切换失败',error.message);
      document.getElementById('status')?.setAttribute('data-file-switch-error',error.message);
    }
    syncOptions();
  }
  function updateVisibility(){
    const toolbar=workbench?.querySelector('.ocr-source-pane > .ocr-lab-file-toolbar');
    if(toolbar){
      toolbar.hidden=isSettings();
      toolbar.querySelector('.ocr-source-file-select')?.ocrNavigationSelect?.show();
    }
  }
  // Cross-chapter AG/PDF focus requests the owning *virtual* chapter by ID.
  // Keep the source navigation, browser URL and WCP scope in agreement.
  document.addEventListener('ocr2md:lab-virtual-open',event=>{
    const {id,preserveAll=false}=event.detail??{};
    if(!id||!views.some(row=>row.id===id))return;
    navigate(chapterId(id),{preserveAll});
    event.detail.accepted=activeChapter===id;
  });
  moduleSelector?.addEventListener('change',()=>{updateVisibility();syncOptions();});
  document.addEventListener('ocr2md:wp3-ag-ready',event=>{
    bridge=event.detail;
    // CMDocument can finish initializing in the same event loop.
    queueMicrotask(()=>{
      refreshChapters();
      const desired=new URLSearchParams(location.search).get('view');
      if(desired&&views.some(item=>item.id===desired)){
        try{selectChapter(desired);}catch(error){console.warn(error.message);}
      }
    });
  });
  // Source mutation notifies all readers; list rebuilding is deferred while
  // typing but explicit independent-chapter changes refresh next task.
  viewStore.subscribe((now,before)=>{
    if(now.documentRevision!==before.documentRevision)scheduleRefresh();
  });
  document.addEventListener('change',event=>{
    if(event.target?.matches?.('.ocr-outline-checkbox, #chapter-start-number'))
      queueMicrotask(()=>scheduleRefresh(true));
  },true);
  document.addEventListener('input',event=>{
    if(event.target?.matches?.('#chapter-start-number'))scheduleRefresh(true);
  },true);
  window.addEventListener('popstate',()=>{
    const next=new URLSearchParams(location.search).get('view');
    if(next===activeChapter)return;
    if(next&&!views.some(row=>row.id===next))return;
    try{selectChapter(next);}catch(error){console.warn(error.message);}
  });

  function addBar(host){
    if(!host||host.querySelector(':scope > .ocr-lab-file-toolbar'))return;
    let bar=host.querySelector(':scope > .ocr-source-file-toolbar');
    if(!bar){bar=document.createElement('div');bar.className='ocr-source-file-toolbar';host.prepend(bar);}
    let select=bar.querySelector('.ocr-source-file-select');
    if(!select){
      select=document.createElement('select');select.className='ocr-source-file-select';
      select.setAttribute('aria-label','源码文件导航');bar.append(select);
    }
    bar.classList.add('ocr-lab-file-toolbar');
    select.classList.add('ocr-lab-file-select');
    select.title='在同一母 Markdown 中切换虚拟章节视图';
    select.addEventListener('change',()=>navigate(select.value));
    selectBoxes.add(select);host.classList.add('ocr-lab-file-source');
    syncOptions();
    enhanceNavigationSelect(select,{search:true,kind:'files'});
    updateVisibility();
  }
  function mountPreview(){
    const picker=workbench?.querySelector('.ocr-preview-pane select.ocr-preview-mode');
    if(!picker)return false;
    enhanceNavigationSelect(picker,{kind:'preview'});return true;
  }
  if(!mountPreview()&&workbench){
    const observer=new MutationObserver(()=>{
      if(mountPreview())observer.disconnect();
    });observer.observe(workbench,{childList:true,subtree:true});
  }
  function mountMarkdown(){
    const host=workbench?.querySelector('#editor')?.closest('.ocr-source-pane');
    if(host)addBar(host);
    return Boolean(host);
  }
  function mountSettings(){
    const host=settingsWorkbench?.querySelector('.ocr-settings-pane.ocr-settings-source');
    if(host)addBar(host);
  }
  if(!mountMarkdown()&&workbench){
    const observer=new MutationObserver(()=>{
      if(mountMarkdown())observer.disconnect();
    });observer.observe(workbench,{childList:true,subtree:true});
  }
  return Object.freeze({mountSettings,refreshChapters});
}
