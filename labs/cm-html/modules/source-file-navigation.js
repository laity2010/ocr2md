/** Experimental file-navigation chrome for the two existing CM sources.
 * No extra editor, document cache, file write, or new persistence interface.
 * Navigation uses the existing WCP module selection control.
 */
import './source-file-navigation.css';
const OPEN_FILES=Object.freeze([
  {id:'document',label:'Buffett’s Alpha.minerujson.md'},
  {id:'settings',label:'settings.json'},
]);

export function createSourceFileNavigation(){
  const moduleSelector=document.getElementById('module-select');
  const workbench=document.getElementById('workspace');
  const settingsWorkbench=document.getElementById('settings-workspace');
  let lastMarkdownModule='chapter-boundary';
  const updateLastModule=()=>{
    if(moduleSelector?.value&&moduleSelector.value!=='settings')
      lastMarkdownModule=moduleSelector.value;
  };
  moduleSelector?.addEventListener('change',updateLastModule);
  updateLastModule();

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
      option.textContent=file.label;
      select.append(option);
    }
    select.value=source;
    select.addEventListener('change',()=>{
      const next=select.value;
      // Neither source is recreated: each CM6 keeps its own edits and undo.
      // Module selection has the existing save/dirty handling.
      if(next==='settings')moduleSelector.value='settings';
      else moduleSelector.value=lastMarkdownModule;
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
    if(pane)addBar(pane,'document');
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
