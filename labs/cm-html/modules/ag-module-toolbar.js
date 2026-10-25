/** Lab AG toolbar: file identity selects the allowed module controls.
 * Move existing DOM nodes; the mainline handlers continue to own all actions.
 * Mother .minerujson.md -> chapter boundary. Derived .cmd.chapter.md ->
 * module switcher plus the owning Media/LaTeX action group.
 */
import './ag-module-toolbar.css';

export function mountAgModuleToolbar(){
  const moduleSelect=document.getElementById('module-select');
  const workspace=document.getElementById('workspace');
  const chapterActions=document.getElementById('module-actions');
  const actionGroups=[...document.querySelectorAll('.module-actions[data-module]')];
  if(!moduleSelect||!workspace||!chapterActions||actionGroups.length<3)
    throw Error('Missing module action/selection contract');

  let chapter=new URLSearchParams(location.search).get('chapter');
  const chapterModules=new Map();
  let bar=null;
  let transitioning=false;
  const isChapter=()=>Boolean(chapter);
  const activeModule=()=>{
    const value=chapterModules.get(chapter);
    return value==='media'||value==='latex'?value:'media';
  };

  function syncModule(){
    if(transitioning)return;
    const should=isChapter()?activeModule():'chapter-boundary';
    if(moduleSelect.value!==should){
      transitioning=true;
      moduleSelect.value=should;
      moduleSelect.dispatchEvent(new Event('change',{bubbles:true}));
      transitioning=false;
    }
    refresh();
  }
  function refresh(){
    if(!bar)return;
    const selected=moduleSelect.value;
    const settings=selected==='settings';
    bar.hidden=settings;
    bar.setAttribute('aria-label',isChapter()?'章节元素处理工具栏':'章节定界工具栏');
    moduleSelect.hidden=!isChapter();
    moduleSelect.setAttribute('aria-label','章节处理模块');
    for(const option of moduleSelect.options){
      // Global settings is addressed via the file navigator, not a chapter
      // element-processing module. This does not delete/disable its API option.
      option.hidden=isChapter()&&(option.value==='chapter-boundary'||option.value==='settings');
    }
    for(const actions of actionGroups){
      actions.hidden=settings || actions.dataset.module!==selected ||
        (isChapter()?actions.dataset.module==='chapter-boundary':actions.dataset.module!=='chapter-boundary');
    }
    if(!isChapter()&&selected!=='settings')bar.hidden=false;
  }
  moduleSelect.addEventListener('change',()=>{
    if(transitioning)return;
    const selected=moduleSelect.value;
    if(selected==='settings'){refresh();return;}
    if(isChapter()){
      if(selected==='media'||selected==='latex')chapterModules.set(chapter,selected);
      else{syncModule();return;}
    }else if(selected!=='chapter-boundary'){
      syncModule();return;
    }
    refresh();
  });
  document.addEventListener('ocr2md:lab-file-activated',event=>{
    // A native in-place file switch has already changed the CM6 state; the AG
    // module is selected through the *original* module handler, once only.
    chapter=event.detail.chapter||null;
    syncModule();
  });
  function attach(){
    const outline=workspace.querySelector('.ocr-outline-pane');
    const grid=outline?.querySelector(':scope > .ocr-outline-grid');
    if(!outline||!grid)return false;
    if(outline.querySelector(':scope > .ocr-lab-ag-toolbar'))return true;
    bar=document.createElement('div');
    bar.className='ocr-lab-ag-toolbar';
    bar.setAttribute('role','toolbar');
    // No cloned controls. Events and input state stay owned by mainline.
    bar.append(moduleSelect,...actionGroups);
    outline.insertBefore(bar,grid);
    refresh();
    // Startup may have deep-linked directly into a chapter. The mainline's
    // module-select listener is registered later during async initialization.
    setTimeout(syncModule,0);
    return true;
  }
  if(!attach()){
    const observer=new MutationObserver(()=>{
      if(attach())observer.disconnect();
    });
    observer.observe(workspace,{childList:true,subtree:true});
  }
}
