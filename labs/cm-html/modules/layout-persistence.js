/** Experiment-only Dockview layout continuity across chapter document reloads.
 * Keeps just two divider ratios (AG | source, source / preview), not content,
 * user credentials, editor state, or individual document preferences.
 * All resize operations use Dockview's supported group.api.setSize().
 */
const STORAGE_KEY='ocr2md:lab:cm-html:workspace-divider:v1';
const validRatio=value=>typeof value==='number'&&Number.isFinite(value)&&value>0.08&&value<0.92;

export function persistLabWorkspaceLayout(dockview,container){
  let restoring=true,disposed=false;
  const group=id=>dockview.getPanel(id)?.group?.api;
  const measure=()=>{
    const ag=group('outline'),source=group('source'),preview=group('preview');
    const width=dockview.width||container.clientWidth;
    const sourceHeight=(source?.height||0),previewHeight=(preview?.height||0);
    if(!ag||!source||!preview||width<=0||sourceHeight<=0||previewHeight<=0)return null;
    const agRatio=ag.width/width;
    const sourceRatio=sourceHeight/(sourceHeight+previewHeight);
    return validRatio(agRatio)&&validRatio(sourceRatio)
      ?{agRatio,sourceRatio}:null;
  };
  const capture=()=>{
    if(restoring||disposed)return;
    const state=measure();
    if(state)try{sessionStorage.setItem(STORAGE_KEY,JSON.stringify(state));}catch{}
  };
  let stored=null;
  try{
    const parsed=JSON.parse(sessionStorage.getItem(STORAGE_KEY)||'null');
    if(parsed&&validRatio(parsed.agRatio)&&validRatio(parsed.sourceRatio))stored=parsed;
  }catch{}
  let attempts=0;
  function complete(){
    restoring=false;
    dockview.onDidLayoutChange(capture);
    window.addEventListener('pagehide',capture,{once:true});
    capture();
  }
  function restoreWhenReady(){
    if(disposed)return;
    const sizes=measure();
    if(!sizes){
      if(++attempts<90)requestAnimationFrame(restoreWhenReady);
      else complete();
      return;
    }
    if(stored){
      const ag=group('outline'),source=group('source'),preview=group('preview');
      const width=dockview.width||container.clientWidth;
      ag.setSize({width:Math.round(stored.agRatio*width)});
      const height=(source.height+preview.height);
      source.setSize({height:Math.round(stored.sourceRatio*height)});
    }
    // Allow Dockview to finish laying out and to resolve size constraints.
    requestAnimationFrame(complete);
  }
  requestAnimationFrame(restoreWhenReady);
  return {dispose(){disposed=true;}};
}
