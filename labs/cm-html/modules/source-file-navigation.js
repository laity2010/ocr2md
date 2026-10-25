/** Experimental file selection uses the SAME original CM6 / CMD / AG / PDF
 * workbench; navigating a file reloads it as the currently active document.
 * Per-file save is explicitly routed on the server and cannot touch mother.
 */
import './source-file-navigation.css';
const DEFAULTS=Object.freeze([
  {id:'document',label:'章节定界/Buffett’s Alpha.minerujson.md'},
  {id:'settings',label:'全局设置/settings.json'},
]);
const FILE_PATTERN=/^[0-9]{1,6}-[\p{L}\p{N}_-]{1,110}\.cmd\.chapter\.md$/u;
const chapterId=name=>'chapter:'+name;
const currentChapter=new URLSearchParams(location.search).get('chapter');

export function createSourceFileNavigation(){
  const moduleSelector=document.getElementById('module-select');
  const workbench=document.getElementById('workspace');
  const settingsWorkbench=document.getElementById('settings-workspace');
  const selectBoxes=new Set();
  let names=[];
  const activeId=()=>currentChapter?chapterId(currentChapter):'document';
  const isChapterMode=()=>moduleSelector?.value==='chapter-boundary';
  const updateVisibility=()=>{
    const toolbar=workbench?.querySelector('.ocr-source-pane > .ocr-lab-file-toolbar');
    if(toolbar)toolbar.hidden=!isChapterMode();
  };
  moduleSelector?.addEventListener('change',updateVisibility);
  function syncOptions(){
    for(const select of selectBoxes){
      const isSettings=Boolean(select.closest('#settings-workspace'));
      select.replaceChildren();
      for(const item of [...DEFAULTS,...names.map(name=>({id:chapterId(name),label:'章节chapter/'+name}))]){
        const option=document.createElement('option');
        option.value=item.id;option.textContent=item.label;select.append(option);
      }
      select.value=isSettings?'settings':activeId();
    }
  }
  async function refreshChapters(){
    try{
      const response=await fetch('api/chapters',{cache:'no-store'});
      if(response.status===404){names=[];syncOptions();return;}
      if(!response.ok)throw Error('章节清单 HTTP '+response.status);
      const manifest=await response.json();
      names=(manifest.files||[]).map(f=>f.name).filter(n=>FILE_PATTERN.test(n));
      syncOptions();
    }catch(error){console.warn('章节清单暂不可读',error.message);}
  }
  function navigate(target,selector){
    if(target==='settings'){
      moduleSelector.value='settings';
      moduleSelector.dispatchEvent(new Event('change',{bubbles:true}));
      selector.value=selector.closest('#settings-workspace')?'settings':activeId();
      return;
    }
    if(target.startsWith('chapter:')&&!names.includes(target.slice(8))){
      selector.value=selector.closest('#settings-workspace')?'settings':activeId();
      return;
    }
    const next=target==='document'?null:target.slice(8);
    if(next!==currentChapter){
      const url=new URL(location.href);
      if(next)url.searchParams.set('chapter',next);
      else url.searchParams.delete('chapter');
      // Native beforeunload protects unsaved CM/Settings changes. A new page
      // creates a fresh CM history for the new file, not mixed transactions.
      location.assign(url.toString());
      return;
    }
    if(!isChapterMode()){
      moduleSelector.value='chapter-boundary';
      moduleSelector.dispatchEvent(new Event('change',{bubbles:true}));
    }
    selector.value=selector.closest('#settings-workspace')?'settings':activeId();
  }
  function addBar(host){
    if(!host||host.querySelector(':scope > .ocr-lab-file-toolbar'))return;
    const bar=document.createElement('div');bar.className='ocr-lab-file-toolbar';
    const select=document.createElement('select');select.className='ocr-lab-file-select';
    select.setAttribute('aria-label','源码文件导航');
    select.title='切换同一 CM6 工作台加载的 Markdown 文件';
    select.addEventListener('change',()=>navigate(select.value,select));
    selectBoxes.add(select);bar.append(select);host.prepend(bar);
    host.classList.add('ocr-lab-file-source');syncOptions();updateVisibility();
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
    });
    observer.observe(workbench,{childList:true,subtree:true});
  }
  const status=document.getElementById('status');
  if(status){
    let notified=false;
    new MutationObserver(()=>{
      const exported=status.textContent?.includes('已导出');
      if(exported&&!notified)void refreshChapters();
      notified=exported;
    }).observe(status,{childList:true,characterData:true,subtree:true});
  }
  void refreshChapters();
  return Object.freeze({mountSettings,refreshChapters});
}
