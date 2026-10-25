/** Lab AG toolbar: file identity selects the allowed module controls.
 * Move existing DOM nodes; the mainline handlers continue to own all actions.
 * Mother .minerujson.md -> chapter boundary. Derived .cmd.chapter.md ->
 * element picker Title/Media/LaTeX and owning module actions.
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
  // The element category is a workspace-wide view preference, not a
  // document-specific state. Chapters share it across in-place navigation.
  let selectedElementModule='chapter-boundary';
  let bar=null;
  let transitioning=false;
  // File navigation and the mainline module handler keep the original select.
  // The chapter's *visible* element picker has only three real options: iPad
  // Safari's native picker can expose <option hidden>, so don't rely on it.
  const elementSelect=document.createElement('select');
  elementSelect.className='ocr-lab-element-select';
  elementSelect.setAttribute('aria-label','文档元素');
  for(const [value,label] of [['chapter-boundary','标题'],['media','媒体'],['latex','LaTeX']]){
    const option=document.createElement('option');
    option.value=value;option.textContent=label;elementSelect.append(option);
  }
  elementSelect.addEventListener('change',()=>{
    if(!isChapter())return;
    moduleSelect.value=elementSelect.value;
    moduleSelect.dispatchEvent(new Event('change',{bubbles:true}));
  });
  const isChapter=()=>Boolean(chapter);
  const activeModule=()=>selectedElementModule;

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
    queueMicrotask(refresh);
  }
  function refresh(){
    if(!bar)return;
    const selected=moduleSelect.value;
    const settings=selected==='settings';
    bar.hidden=settings;
    bar.setAttribute('aria-label',isChapter()?'章节元素处理工具栏':'章节定界工具栏');
    moduleSelect.hidden=true;
    elementSelect.hidden=!isChapter()||settings;
    if(!settings)elementSelect.value=selected;
    moduleSelect.setAttribute('aria-label','章节处理模块');
    // Original settings option stays intact for source-file navigation,
    // but cannot appear in the separate 3-item native chapter picker.
    for(const actions of actionGroups){
      // Title view on bounded chapters has no Export/Start Number actions:
      // those belong exclusively to the mother document.
      actions.hidden=settings || actions.dataset.module!==selected ||
        (isChapter()&&actions.dataset.module==='chapter-boundary');
    }
    if(!isChapter()&&selected!=='settings')bar.hidden=false;
  }
  moduleSelect.addEventListener('change',()=>{
    if(transitioning)return;
    const selected=moduleSelect.value;
    if(selected==='settings'){refresh();return;}
    if(isChapter()){
      if(selected==='chapter-boundary'||selected==='media'||selected==='latex')selectedElementModule=selected;
      else{syncModule();return;}
    }else if(selected!=='chapter-boundary'){
      syncModule();return;
    }
    refresh();
    // The original module listener was registered after the lab toolbar and
    // may restore visibility of its own action group on the same event.
    // Apply file-type visibility after all synchronous owners have run.
    queueMicrotask(refresh);
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
    bar.append(moduleSelect,elementSelect,...actionGroups);
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
