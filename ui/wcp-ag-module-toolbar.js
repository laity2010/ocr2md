/** Lab AG toolbar: file identity selects the allowed module controls.
 * Move existing DOM nodes; the mainline handlers continue to own all actions.
 * Mother .minerujson.md -> chapter boundary. Derived .cmd.chapter.md ->
 * element picker Title/Media/LaTeX and owning module actions.
 */
import './wcp-ag-module-toolbar.css';
import {enhanceNavigationSelect} from './wcp-navigation-select.js';
import {mountVirtualAgQuery} from './wcp-ag-query.js';
import './wcp-ag-query.css';

export function mountAgModuleToolbar(){
  const moduleSelect=document.getElementById('module-select');
  const workspace=document.getElementById('workspace');
  const chapterActions=document.getElementById('module-actions');
  const actionGroups=[...document.querySelectorAll('.module-actions[data-module]')];
  if(!moduleSelect||!workspace||!chapterActions||actionGroups.length<3)
    throw Error('Missing module action/selection contract');

  let chapter=new URLSearchParams(location.search).get('chapter');
  let virtualMode=false; // Chapter navigation selects CMD-scoped views of the mother
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
  allLabel.append(allToggle,document.createTextNode('全部'));
  allLabel.title='勾选后 AG 显示所有章节的当前元素；不改变源码或预览的章节范围';
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
    if(moduleSelect.value==='settings')return;
    moduleSelect.value=elementSelect.value;
    moduleSelect.dispatchEvent(new Event('change',{bubbles:true}));
  });
  // Each element owns its distinct AG schema. The mother document may show
  // Title/Media/LaTeX without creating any combined or fourth grid.
  const activeModule=()=>selectedElementModule;

  function syncModule(){
    if(transitioning)return;
    const should=activeModule();
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
    elementSelect.hidden=settings;
    if(!settings){elementSelect.value=selected;elementSelect.ocrNavigationSelect?.tom.setValue(selected,true);}
    elementSelect.ocrNavigationSelect?.show();
    // The source navigation owns virtual-chapter selection; no second chapter
    // dropdown/toggle in AG. The element selector remains module-owned.
    indexLabel.hidden=true;
    allLabel.hidden=settings||Boolean(chapter);
    // '全部' controls AG membership even in the unbounded mother view.
    // The current chapter in the CMD index is the scoped AG fallback;
    // toggling never changes the CM6/Markdown source file or preview scope.
    allToggle.disabled=Boolean(chapter);
    allToggle.title='勾选显示所有章节；取消则只筛选 AG 当前章节，不改变源码和预览视图';
    chapterSelect.hidden=true;
    chapterSelect.ocrNavigationSelect?.show();
    allStatus.hidden=Boolean(chapter)||settings||!virtualMode;
    virtualQuery?.setModule();
    moduleSelect.setAttribute('aria-label','章节处理模块');
    // A virtual chapter is never exported to a second editable file.
    document.getElementById('export-chapters')?.setAttribute('hidden','');
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
    if(!settings)bar.hidden=false;
  }
  moduleSelect.addEventListener('change',()=>{
    if(transitioning)return;
    const selected=moduleSelect.value;
    if(selected==='settings'){refresh();return;}
    if(selected==='chapter-boundary'||selected==='media'||selected==='latex')
      selectedElementModule=selected;
    else{syncModule();return;}
    refresh();
    // The original module listener was registered after the lab toolbar and
    // may restore visibility of its own action group on the same event.
    // Apply file-type visibility after all synchronous owners have run.
    queueMicrotask(refresh);
  });
  // Navigation owns chapter scope and uses only the existing mother CM6.
  // No file switch, new EditorState, or legacy physical chapter endpoint.
  document.addEventListener('ocr2md:lab-virtual-select',event=>{
    const id=event.detail?.id??null;
    if(chapter){event.detail.error='实体章节模式不可切换虚拟章节';return;}
    if(id){
      const option=[...chapterSelect.options].find(item=>item.value===id);
      if(!option){event.detail.error='章节标定已经变化';return;}
      virtualMode=true;indexToggle.checked=true;
      // AG-initiated cross-chapter focus preserves "全部". Explicit source
      // navigator selections keep the existing default of chapter-only AG.
      if(!event.detail.preserveAll)allToggle.checked=false;
      chapterSelect.value=id;chapterSelect.ocrNavigationSelect?.refresh();
    }else{
      virtualMode=false;indexToggle.checked=false;allToggle.checked=true;
      selectedElementModule='chapter-boundary';
    }
    syncModule();virtualQuery?.sync();
    event.detail.accepted=true;
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
    // The first two visible controls are exactly: 全部 ☐ | [标题/媒体/LaTeX].
    bar.append(allLabel,elementSelect,moduleSelect,indexLabel,chapterSelect,allStatus,...actionGroups);
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
