/** Lab-only AG toolbar host. Each module supplies its existing action DOM;
 * no duplicate buttons, handlers, or CMD/AG ownership changes.
 */
import './ag-module-toolbar.css';

export function mountAgModuleToolbar(){
  const moduleSelect=document.getElementById('module-select');
  const workspace=document.getElementById('workspace');
  const actions=document.getElementById('module-actions');
  if(!moduleSelect||!workspace||!actions)throw Error('Missing chapter action contract');

  function attach(){
    const outline=workspace.querySelector('.ocr-outline-pane');
    const grid=outline?.querySelector(':scope > .ocr-outline-grid');
    if(!outline||!grid)return false;
    if(outline.querySelector(':scope > .ocr-lab-ag-toolbar'))return true;
    const bar=document.createElement('div');
    bar.className='ocr-lab-ag-toolbar';
    bar.setAttribute('role','toolbar');
    bar.setAttribute('aria-label','章节定界工具栏');
    // Reparent, never clone, the actual controls used by mainline listeners.
    // This preserves export, validation, disabled state, and number history.
    bar.append(actions);
    outline.insertBefore(bar,grid);
    const refresh=()=>{bar.hidden=moduleSelect.value!=='chapter-boundary';};
    moduleSelect.addEventListener('change',refresh);
    refresh();
    return true;
  }
  if(!attach()){
    const observer=new MutationObserver(()=>{
      if(attach())observer.disconnect();
    });
    observer.observe(workspace,{childList:true,subtree:true});
  }
}
