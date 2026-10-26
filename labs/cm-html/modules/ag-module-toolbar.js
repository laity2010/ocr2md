/** Lab AG toolbar: file identity selects the allowed module controls.
 * Move existing DOM nodes; the mainline handlers continue to own all actions.
 * Mother .minerujson.md -> chapter boundary. Derived .cmd.chapter.md ->
 * element picker Title/Media/LaTeX and owning module actions.
 */
import './ag-module-toolbar.css';
import {enhanceNavigationSelect} from './navigation-select.js';
import {mountVirtualAgQuery} from '../wp0-2/ag-query.js';
import '../wp0-2/ag-query.css';

export function mountAgModuleToolbar(){
  const moduleSelect=document.getElementById('module-select');
  const workspace=document.getElementById('workspace');
  const chapterActions=document.getElementById('module-actions');
  const actionGroups=[...document.querySelectorAll('.module-actions[data-module]')];
  if(!moduleSelect||!workspace||!chapterActions||actionGroups.length<3)
    throw Error('Missing module action/selection contract');

  let chapter=new URLSearchParams(location.search).get('chapter');
  let virtualMode=false; // WP3 opt-in; retain the mother chapter-boundary contract
  // The element category is a workspace-wide view preference, not a
  // document-specific state. Chapters share it across in-place navigation.
  let selectedElementModule='chapter-boundary';
  let bar=null;
  let virtualQuery=null;
  let transitioning=false;
  const indexLabel=document.createElement('label');
  indexLabel.className='ocr-wp3-index-toggle';
  const indexToggle=document.createElement('input');
  indexToggle.type='checkbox';indexToggle.setAttribute('aria-label','CMD 虚拟索引');
  indexLabel.append(indexToggle,document.createTextNode('CMD 虚拟索引'));
  const allLabel=document.createElement('label');
  allLabel.className='ocr-all-chapters-control';
  const allToggle=document.createElement('input');
  allToggle.type='checkbox';allToggle.setAttribute('aria-label','章节所有');
  allLabel.append(allToggle,document.createTextNode('章节所有'));
  const chapterSelect=document.createElement('select');
  chapterSelect.className='ocr-wp3-chapter-select';
  chapterSelect.setAttribute('aria-label','虚拟章节');
  const allStatus=document.createElement('span');
  allStatus.className='ocr-all-chapters-status';
  allStatus.setAttribute('role','status');
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
  // WP3 is an opt-in view of the mother CM6 text; file sessions and
  // chapter-boundary editing remain intact until WP4 and WP7 migrations.
  const isChapter=()=>Boolean(chapter)||virtualMode;
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
    bar.setAttribute('aria-label',chapter?'实体章节兼容工具栏':
      virtualMode?'CMD 虚拟章节元素工具栏':'章节定界工具栏');
    moduleSelect.hidden=true;
    elementSelect.hidden=settings||!isChapter();
    if(!settings){elementSelect.value=selected;elementSelect.ocrNavigationSelect?.tom.setValue(selected,true);}
    elementSelect.ocrNavigationSelect?.show();
    indexLabel.hidden=Boolean(chapter)||settings;
    allLabel.hidden=Boolean(chapter)||settings||!virtualMode;
    chapterSelect.hidden=Boolean(chapter)||settings||!virtualMode||allToggle.checked;
    chapterSelect.ocrNavigationSelect?.show();
    allStatus.hidden=Boolean(chapter)||settings||!virtualMode;
    virtualQuery?.setModule();
    moduleSelect.setAttribute('aria-label','章节处理模块');
    // Original settings option stays intact for source-file navigation,
    // but cannot appear in the separate 3-item native chapter picker.
    for(const actions of actionGroups){
      // Title view on bounded chapters has no Export/Start Number actions:
      // those belong exclusively to the mother document.
      // Until WP4/WP6, the virtual scope is an AG query experiment, not
      // a bulk action target. Legacy chapters retain their own handlers.
      actions.hidden=settings || actions.dataset.module!==selected ||
        (chapter ? actions.dataset.module==='chapter-boundary' : virtualMode);
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
  indexToggle.addEventListener('change',()=>{
    if(chapter){indexToggle.checked=false;return;}
    virtualMode=indexToggle.checked;
    syncModule();virtualQuery?.sync();
  });
  document.addEventListener('ocr2md:lab-file-activated',event=>{
    chapter=event.detail.chapter||null;
    virtualMode=false;indexToggle.checked=false;
    syncModule();
    virtualQuery?.sync();
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
    bar.append(moduleSelect,elementSelect,indexLabel,allLabel,chapterSelect,allStatus,...actionGroups);
    enhanceNavigationSelect(elementSelect,{kind:'elements'});
    enhanceNavigationSelect(chapterSelect,{kind:'virtual-chapters',search:true});
    outline.insertBefore(bar,grid);
    virtualQuery=mountVirtualAgQuery({checkbox:allToggle,chapterSelect,
      status:allStatus,getModule:()=>moduleSelect.value,
      isPhysicalChapter:()=>Boolean(chapter),isIndexMode:()=>virtualMode});
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
