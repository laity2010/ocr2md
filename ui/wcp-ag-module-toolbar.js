/** Lab AG toolbar: file identity selects the allowed module controls.
 * Move existing DOM nodes; the mainline handlers continue to own all actions.
 * Mother .minerujson.md -> chapter boundary. Derived .cmd.chapter.md ->
 * element picker Title/Media/LaTeX and owning module actions.
 */
import './wcp-ag-module-toolbar.css';
import {enhanceNavigationSelect} from './wcp-navigation-select.js';
import {mountVirtualAgQuery} from './wcp-ag-query.js';
import './wcp-ag-query.css';

let toolbarInitialized=false;
export function mountAgModuleToolbar({modulePort,workspace}={}){
  if(toolbarInitialized)return false;
  if(!modulePort||!workspace||!modulePort.hasModuleActions())
    throw Error('AG toolbar requires an explicit Shell module-control port');

  toolbarInitialized=true;
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
  allLabel.title='勾选：AG 显示并操作整份 CMB；取消：仅显示并操作当前章节。不改变源码或预览显示范围';
  const chapterSelect=document.createElement('select');
  chapterSelect.className='ocr-wp3-chapter-select';
  chapterSelect.setAttribute('aria-label','虚拟章节');
  const allStatus=document.createElement('span');
  allStatus.className='ocr-all-chapters-status ocr-global-ag-status';
  allStatus.setAttribute('role','status');
  allStatus.setAttribute('aria-live','polite');
  const functionHost=document.createElement('div');
  functionHost.className='ocr-ag-functions';
  const functionButton=document.createElement('button');
  functionButton.type='button';
  functionButton.id='ag-functions-toggle';
  functionButton.textContent='功能 ▾';
  functionButton.setAttribute('aria-label','AG 功能菜单');
  functionButton.setAttribute('aria-haspopup','true');
  functionButton.setAttribute('aria-expanded','false');
  const functionMenu=document.createElement('div');
  functionMenu.id='ag-functions-menu';
  functionMenu.className='ocr-ag-functions-menu';
  functionMenu.setAttribute('aria-label','当前 AG 模块功能');
  functionMenu.hidden=true;
  functionHost.append(functionButton,functionMenu);
  functionButton.addEventListener('click',()=>{
    if(functionButton.disabled)return;
    const open=functionMenu.hidden;
    functionMenu.hidden=!open;
    functionButton.setAttribute('aria-expanded',String(open));
  });
  const closeFunctions=()=>{
    functionMenu.hidden=true;
    functionButton.setAttribute('aria-expanded','false');
  };
  functionMenu.addEventListener('click',event=>{
    // Preserve original click handlers; the menu is merely a UI host.
    if(event.target.closest('button'))closeFunctions();
  });
  document.addEventListener('pointerdown',event=>{
    if(!functionHost.contains(event.target))closeFunctions();
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&!functionMenu.hidden){
      closeFunctions();functionButton.focus();
    }
  });
  // File navigation and the mainline module handler keep the original select.
  // The chapter's visible element picker owns explicit per-module options: iPad
  // Safari's native picker can expose <option hidden>, so don't rely on it.
  const elementSelect=document.createElement('select');
  elementSelect.className='ocr-lab-element-select';
  elementSelect.setAttribute('aria-label','文档元素');
  for(const [value,label] of [['chapter-boundary','标题'],['media','媒体'],['latex','LaTeX'],['note','注释对'],['html','HTML 元素']]){
    const option=document.createElement('option');
    option.value=value;option.textContent=label;elementSelect.append(option);
  }
  elementSelect.addEventListener('change',()=>{
    if(modulePort.getModule()==='settings')return;
    modulePort.selectModule(elementSelect.value);
  });
  // Each element owns its distinct AG schema. The mother document may show
  // Title/Media/LaTeX without creating any combined or fourth grid.
  const activeModule=()=>selectedElementModule;

  function syncModule(){
    if(transitioning)return;
    const should=activeModule();
    if(modulePort.getModule()!==should){
      transitioning=true;
      try{modulePort.selectModule(should);}finally{transitioning=false;}
    }
    refresh();
    queueMicrotask(refresh);
  }
  function refresh(){
    if(!bar)return;
    const selected=modulePort.getModule();
    const settings=selected==='settings';
      bar.hidden=settings;
    bar.setAttribute('aria-label',chapter?'实体章节兼容工具栏':
      virtualMode?'CMD 虚拟章节元素工具栏':'章节定界工具栏');
    modulePort.hideSelector();
    elementSelect.hidden=settings;
    if(!settings){elementSelect.value=selected;elementSelect.ocrNavigationSelect?.tom.setValue(selected,true);}
    elementSelect.ocrNavigationSelect?.show();
    // The source navigation owns virtual-chapter selection; no second chapter
    // dropdown/toggle in AG. The element selector remains module-owned.
    indexLabel.hidden=true;
    allLabel.hidden=settings||Boolean(chapter);
    // The mother '章节定界' view must always show all headings/elements.
    // Only a selected virtual chapter file may filter AG membership.
    // The checkbox changes AG query AND action scope, but never switches
    // the CM6/Markdown/PDF projection of the selected chapter.
    if(!virtualMode)allToggle.checked=true;
    allToggle.disabled=Boolean(chapter)||!virtualMode;
    allToggle.title=allToggle.disabled
      ?'章节定界固定显示全部章节；仅在章节文件中可选择'
      :'勾选：AG 操作整份 CMB；取消：AG 仅操作当前章节';
    chapterSelect.hidden=true;
    chapterSelect.ocrNavigationSelect?.show();
    allStatus.hidden=Boolean(chapter)||settings||!virtualMode;
    virtualQuery?.setModule();
    modulePort.labelSelector('章节处理模块');
    // A virtual chapter is never exported to a second editable file.
    modulePort.hideLegacyExport();
    // Original settings option stays intact for source-file navigation,
    // but cannot appear in the separate 3-item native chapter picker.
    modulePort.showActions({selected,settings,chapter:Boolean(chapter),virtualMode});
    const group=functionMenu.querySelector('.module-actions[data-module="'+selected+'"]');
    // Count actual active controls, not hidden historical export actions.
    // Title/index scope with no actionable group must not open a blank menu.
    const available=!settings&&!!group&&!group.hidden&&
      [...group.querySelectorAll('button:not([hidden]),input:not([hidden])')].some(
        control=>control.id!=='export-chapters');
    functionButton.disabled=!available;
    if(!available||functionMenu.dataset.module!==selected)closeFunctions();
    functionMenu.dataset.module=selected;
    if(!settings)bar.hidden=false;
  }
  modulePort.onModuleChange(()=>{
    if(transitioning)return;
    const selected=modulePort.getModule();
    if(selected==='settings'){refresh();return;}
    if(selected==='chapter-boundary'||selected==='media'||selected==='latex'||selected==='note'||selected==='html')
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
  // The retired physical-file switch had no producer after CMD virtual
  // chapters replaced chapter exports. Do not subscribe to a ghost bus topic.
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
    bar.append(allLabel,elementSelect);
    modulePort.mountSelector(bar);
    bar.append(indexLabel,chapterSelect,functionHost);
    modulePort.mountActionGroups(functionMenu);
    modulePort.mountAgStatus(allStatus);
    enhanceNavigationSelect(elementSelect,{kind:'elements'});
    enhanceNavigationSelect(chapterSelect,{kind:'virtual-chapters',search:true});
    outline.insertBefore(bar,grid);
    virtualQuery=mountVirtualAgQuery({checkbox:allToggle,chapterSelect,
      status:allStatus,getModule:()=>modulePort.getModule(),
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
