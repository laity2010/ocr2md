/** Lab-only navigation for master, JSON settings, and exported bounded chapters.
 * The master CM6/editor API is untouched. Chapters open read-only in their
 * own CM6 view until a dedicated element module owns chapter write actions.
 */
import {EditorState} from '@codemirror/state';
import {EditorView,basicSetup} from 'codemirror';
import {markdown} from '@codemirror/lang-markdown';
import './source-file-navigation.css';

const DEFAULTS=Object.freeze([
  {id:'document',label:'章节定界/Buffett’s Alpha.minerujson.md'},
  {id:'settings',label:'全局设置/settings.json'},
]);
const FILE_PATTERN=/^[0-9]{1,6}-[\p{L}\p{N}_-]{1,110}\.cmd\.chapter\.md$/u;
const chapterId=name=>'chapter:'+name;

export function createSourceFileNavigation(){
  const moduleSelector=document.getElementById('module-select');
  const workbench=document.getElementById('workspace');
  const settingsWorkbench=document.getElementById('settings-workspace');
  const selectBoxes=new Set();
  let names=[],activeChapter=null,chapterView=null,chapterPane=null,requestId=0;
  const isChapterMode=()=>moduleSelector?.value==='chapter-boundary';
  function setSelections(){
    for(const select of selectBoxes){
      const isSettings=Boolean(select.closest('#settings-workspace'));
      select.value=isSettings?'settings':activeChapter?chapterId(activeChapter):'document';
    }
  }
  function updateVisibility(){
    const toolbar=workbench?.querySelector('.ocr-source-pane > .ocr-lab-file-toolbar');
    if(toolbar)toolbar.hidden=!isChapterMode();
    if(!isChapterMode())closeChapter();
  }
  function closeChapter(){
    requestId++;
    activeChapter=null;
    chapterView?.destroy();chapterView=null;
    if(chapterPane)chapterPane.hidden=true;
    const pane=workbench?.querySelector('.ocr-source-pane');
    pane?.classList.remove('ocr-lab-chapter-active');
    setSelections();
  }
  moduleSelector?.addEventListener('change',updateVisibility);

  function rebuildOptions(){
    for(const select of selectBoxes){
      select.replaceChildren();
      for(const item of [...DEFAULTS,...names.map(name=>({id:chapterId(name),label:'章节chapter/'+name}))]){
        const option=document.createElement('option');
        option.value=item.id;option.textContent=item.label;
        select.append(option);
      }
    }
    if(activeChapter&&!names.includes(activeChapter))closeChapter();
    setSelections();
  }

  async function refreshChapters(){
    try{
      const response=await fetch('api/chapters',{cache:'no-store'});
      if(response.status===404){names=[];rebuildOptions();return;}
      if(!response.ok)throw Error('章节清单 HTTP '+response.status);
      const manifest=await response.json();
      names=(manifest.files||[]).map(f=>f.name).filter(name=>FILE_PATTERN.test(name));
      rebuildOptions();
    }catch(error){
      // Keep previously listed files if a transient connection is lost.
      console.warn('章节清单暂不可读',error.message);
    }
  }

  async function showChapter(name){
    if(!names.includes(name))throw Error('章节清单不存在该文件');
    const seq=++requestId;
    const response=await fetch('api/chapters/'+encodeURIComponent(name),{cache:'no-store'});
    if(!response.ok)throw Error('章节文件读取失败 HTTP '+response.status);
    const content=await response.text();
    if(seq!==requestId||!isChapterMode())return;
    const pane=workbench?.querySelector('.ocr-source-pane');
    if(!pane)throw Error('CM 源码窗尚未就绪');
    if(!chapterPane){
      chapterPane=document.createElement('div');
      chapterPane.className='ocr-lab-chapter-reader ocr-cm-source';
      chapterPane.setAttribute('aria-label','已定界章节 CM 源码（只读）');
      chapterPane.hidden=true;
      pane.append(chapterPane);
    }
    chapterView?.destroy();
    chapterPane.replaceChildren();
    chapterView=new EditorView({parent:chapterPane,state:EditorState.create({doc:content,
      extensions:[basicSetup,markdown(),EditorState.readOnly.of(true),EditorView.editable.of(false),EditorView.lineWrapping]})});
    activeChapter=name;
    chapterPane.hidden=false;
    pane.classList.add('ocr-lab-chapter-active');
    setSelections();
  }

  async function navigate(target,fromSelect){
    try{
      if(target==='settings'){
        closeChapter();
        moduleSelector.value='settings';
        moduleSelector.dispatchEvent(new Event('change',{bubbles:true}));
      }else{
        if(!isChapterMode()){
          moduleSelector.value='chapter-boundary';
          moduleSelector.dispatchEvent(new Event('change',{bubbles:true}));
        }
        if(target==='document')closeChapter();
        else if(target.startsWith('chapter:'))await showChapter(target.slice(8));
      }
    }catch(error){
      closeChapter();
      console.warn('章节导航未完成',error.message);
      const pane=workbench?.querySelector('.ocr-source-pane');
      pane?.setAttribute('data-chapter-error',error.message);
    }finally{
      fromSelect.value=fromSelect.closest('#settings-workspace')?'settings':activeChapter?chapterId(activeChapter):'document';
    }
  }

  function addBar(host){
    if(!host||host.querySelector(':scope > .ocr-lab-file-toolbar'))return;
    const toolbar=document.createElement('div');toolbar.className='ocr-lab-file-toolbar';
    const select=document.createElement('select');select.className='ocr-lab-file-select';
    select.setAttribute('aria-label','源码文件导航');
    select.title='章节文件只读预览；章节元素编辑将在对应模块启用';
    const note=document.createElement('span');
    note.className='ocr-lab-chapter-readonly';note.textContent='章节只读';note.hidden=true;
    select.addEventListener('change',()=>{
      void navigate(select.value,select).then(()=>{note.hidden=!activeChapter;});
    });
    selectBoxes.add(select);
    toolbar.append(select,note);host.prepend(toolbar);
    host.classList.add('ocr-lab-file-source');
    rebuildOptions();
    updateVisibility();
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
    let noticed=false;
    new MutationObserver(()=>{
      const exported=status.textContent?.includes('已导出');
      if(exported&&!noticed)void refreshChapters();
      noticed=exported;
    }).observe(status,{childList:true,characterData:true,subtree:true});
  }
  void refreshChapters();
  return Object.freeze({mountSettings,refreshChapters});
}
