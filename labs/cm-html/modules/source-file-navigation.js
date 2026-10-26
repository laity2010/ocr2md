/** Experimental file selection uses the SAME original CM6 / CMD / AG / PDF
 * workbench; navigating a file reloads it as the currently active document.
 * Per-file save is explicitly routed on the server and cannot touch mother.
 */
import './source-file-navigation.css';
import {enhanceNavigationSelect} from './navigation-select.js';
const DEFAULTS=Object.freeze([
  {id:'document',label:'章节定界/Buffett’s Alpha.minerujson.md'},
  {id:'settings',label:'全局设置/settings.json'},
]);
const FILE_PATTERN=/^[0-9]{1,6}-[\p{L}\p{N}_-]{1,110}\.cmd\.chapter\.md$/u;
const chapterId=name=>'chapter:'+name;
let currentChapter=new URLSearchParams(location.search).get('chapter');

export function createSourceFileNavigation(){
  const moduleSelector=document.getElementById('module-select');
  const workbench=document.getElementById('workspace');
  const settingsWorkbench=document.getElementById('settings-workspace');
  const selectBoxes=new Set();
  let names=[];
  const activeId=()=>currentChapter?chapterId(currentChapter):'document';
  const isChapterMode=()=>moduleSelector?.value!=='settings';
  const updateVisibility=()=>{
    const toolbar=workbench?.querySelector('.ocr-source-pane > .ocr-lab-file-toolbar');
    if(toolbar)toolbar.hidden=!isChapterMode();
  };
  moduleSelector?.addEventListener('change',updateVisibility);
  function syncOptions(){
    for(const select of selectBoxes){
      const isSettings=Boolean(select.closest('#settings-workspace'));
      select.replaceChildren();
      for(const [groupLabel,items] of [
        ['工作区',DEFAULTS],
        ['章节文件',names.map(name=>({id:chapterId(name),label:'章节chapter/'+name}))],
      ]){
        const group=document.createElement('optgroup');group.label=groupLabel;
        for(const item of items){
          const option=document.createElement('option');
          option.value=item.id;option.textContent=item.label;group.append(option);
        }
        select.append(group);
      }
      select.value=isSettings?'settings':activeId();
      select.tomselect?.sync(true);
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
  async function navigate(target,selector){
    if(target==='settings'){
      moduleSelector.value='settings';
      moduleSelector.dispatchEvent(new Event('change',{bubbles:true}));
      selector.value=selector.closest('#settings-workspace')?'settings':activeId();
      return;
    }
    if(target.startsWith('chapter:')&&!names.includes(target.slice(8))){
      syncOptions();
      return;
    }
    const next=target==='document'?null:target.slice(8);
    if(next!==currentChapter){
      const detail={chapter:next,promise:null};
      document.dispatchEvent(new CustomEvent('ocr2md:lab-switch-file',{detail}));
      try{
        if(!detail.promise)throw Error('文件切换服务尚未就绪');
        await detail.promise;
        currentChapter=next;
        syncOptions();
      }catch(error){
        console.warn('文件切换失败',error.message);
        syncOptions();
        document.getElementById('status')?.setAttribute('data-file-switch-error',error.message);
      }
      return;
    }
    if(!isChapterMode()){
      moduleSelector.value='chapter-boundary';
      moduleSelector.dispatchEvent(new Event('change',{bubbles:true}));
    }
    syncOptions();
  }
  document.addEventListener('ocr2md:lab-file-activated',event=>{
    currentChapter=event.detail.chapter;
    syncOptions();
  });

  function addBar(host){
    if(!host)return;
    // V6 supplies the one permanent source bar and its real quote buttons.
    // The lab supplies only dynamic file options and the change handler.
    if(host.querySelector(':scope > .ocr-lab-file-toolbar'))return;
    let bar=host.querySelector(':scope > .ocr-source-file-toolbar');
    if(!bar){
      // The settings JSON editor is independent of the Markdown SourcePanel.
      // It needs the same navigation dropdown, but never its quote buttons.
      bar=document.createElement('div');bar.className='ocr-source-file-toolbar';
      host.prepend(bar);
    }
    let select=bar.querySelector('.ocr-source-file-select');
    if(!select){
      select=document.createElement('select');select.className='ocr-source-file-select';
      select.setAttribute('aria-label','源码文件导航');bar.append(select);
    }
    bar.classList.add('ocr-lab-file-toolbar');
    select.classList.add('ocr-lab-file-select');
    select.title='切换同一 CM6 工作台加载的 Markdown 文件';
    select.addEventListener('change',()=>{void navigate(select.value,select);});
    selectBoxes.add(select);host.classList.add('ocr-lab-file-source');
    syncOptions();
    enhanceNavigationSelect(select,{search:true,kind:'files'});
    updateVisibility();
  }

  function mountPreview(){
    const picker=workbench?.querySelector('.ocr-preview-pane select.ocr-preview-mode');
    if(!picker)return false;
    enhanceNavigationSelect(picker,{kind:'preview'});
    return true;
  }
  if(!mountPreview()&&workbench){
    const observer=new MutationObserver(()=>{
      if(mountPreview())observer.disconnect();
    });
    observer.observe(workbench,{childList:true,subtree:true});
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
