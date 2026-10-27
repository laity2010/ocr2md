/** Experiment-only Dockview layout continuity across chapter document reloads.
 * Keeps just two divider ratios (AG | source, source / preview), not content,
 * user credentials, editor state, or individual document preferences.
 * All resize operations use Dockview's supported group.api.setSize().
 */
const STORAGE_KEY='ocr2md:lab:cm-html:workspace-divider:v1';
const validRatio=value=>typeof value==='number'&&Number.isFinite(value)&&value>0.08&&value<0.92;

export function persistLabWorkspaceLayout(port){
  let disposed=false,restoring=true;
  let stored=null;
  try{
    const parsed=JSON.parse(sessionStorage.getItem(STORAGE_KEY)||'null');
    if(parsed&&validRatio(parsed.agRatio)&&validRatio(parsed.sourceRatio))stored=parsed;
  }catch{}
  const capture=()=>{
    if(disposed||restoring)return;
    const ratios=port.getRatios();
    if(ratios)try{sessionStorage.setItem(STORAGE_KEY,JSON.stringify(ratios));}catch{}
  };
  let unsubscribe=null,attempts=0;
  const complete=()=>{
    if(disposed)return;
    restoring=false;
    unsubscribe=port.onChange(capture);
    window.addEventListener('pagehide',capture);
    capture();
  };
  const restore=()=>{
    if(disposed)return;
    const current=port.getRatios();
    if(!current){
      if(++attempts<90)requestAnimationFrame(restore);
      else complete();
      return;
    }
    if(stored)port.setRatios(stored);
    requestAnimationFrame(complete);
  };
  requestAnimationFrame(restore);
  return ()=>{
    disposed=true;
    unsubscribe?.dispose?.();
    window.removeEventListener('pagehide',capture);
  };
}
