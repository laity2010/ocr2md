/** Experimental file-navigation chrome for the two existing CM sources.
 * No extra editor, document cache, file write, or new persistence interface.
 * Navigation uses the existing WCP module selection control.
 */
import './source-file-navigation.css';
const OPEN_FILES=Object.freeze([
  {id:'document',path:'Buffett’s Alpha.minerujson.md'},
  {id:'settings',path:'settings.json'},
]);

export function createSourceFileNavigation(){
  const moduleSelector=document.getElementById('module-select');
  const workbench=document.getElementById('workspace');
  const settingsWorkbench=document.getElementById('settings-workspace');
  // This is only the Chapter Boundary / Global Settings navigator.
  // Media and LaTeX have separate future navigation designs.
  const filenames=Object.freeze({
    document:'章节定界/Buffett’s Alpha.minerujson.md',
    settings:'全局设置/settings.json',
  });
  const updateVisibility=()=>{
    const toolbar=workbench?.querySelector('.ocr-source-pane > .ocr-lab-file-toolbar');
    if(toolbar)toolbar.hidden=moduleSelector?.value!=='chapter-boundary';
  };
  moduleSelector?.addEventListener('change',updateVisibility);

  function addBar(host,source){
    if(!host||host.querySelector(':scope > .ocr-lab-file-toolbar'))return;
    const toolbar=document.createElement('div');
    toolbar.className='ocr-lab-file-toolbar';
    const select=document.createElement('select');
    select.className='ocr-lab-file-select';
    select.setAttribute('aria-label','源码文件导航');
    select.title='切换已打开的源码文件';
    for(const file of OPEN_FILES){
      const option=document.createElement('option');
      option.value=file.id;
      option.textContent=filenames[file.id];
      select.append(option);
    }
    select.value=source;
    updateVisibility();
    select.addEventListener('change',()=>{
      const next=select.value;
      // Neither source is recreated: each CM6 keeps its own edits and undo.
      // Module selection has the existing save/dirty handling.
      if(next==='settings')moduleSelector.value='settings';
      else moduleSelector.value='chapter-boundary';
      moduleSelector.dispatchEvent(new Event('change',{bubbles:true}));
      select.value=source; // this pane always displays its own file
    });
    toolbar.append(select);
    host.prepend(toolbar);
    host.classList.add('ocr-lab-file-source');
  }
  function mountMarkdown(){
    const editor=workbench?.querySelector('#editor');
    const pane=editor?.closest('.ocr-source-pane');
    if(pane){addBar(pane,'document');updateVisibility();}
    return Boolean(pane);
  }
  function mountSettings(){
    const sourcePane=settingsWorkbench?.querySelector('.ocr-settings-pane.ocr-settings-source');
    if(sourcePane)addBar(sourcePane,'settings');
  }
  if(!mountMarkdown()&&workbench){
    const observer=new MutationObserver(()=>{
      if(mountMarkdown())observer.disconnect();
    });
    observer.observe(workbench,{childList:true,subtree:true});
  }
  return Object.freeze({mountSettings});
}
