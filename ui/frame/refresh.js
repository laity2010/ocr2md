/** Public F03: isolated frame auto-update. No dirty-document prompt or save barrier. */
export function shouldReload(current,remote,name='lab-frame'){
  return Boolean(remote?.schema==='ocr2md-frame/v1'&&remote?.name===name&&
    typeof remote.version==='string'&&remote.version&&remote.version!==current);
}
export function startFrameAutoUpdate({version,name='lab-frame',report=()=>{},reload=()=>location.reload(),
  fetchVersion=()=>fetch(new URL('release-version.json',location.href),{cache:'no-store'}).then(r=>{
    if(!r.ok)throw Error(`HTTP ${r.status}`);return r.json();
  }),intervalMs=30000,documentRef=document}){
  let checking=false,disposed=false,triggered=false;
  async function check(){
    if(checking||disposed||triggered)return false;
    checking=true;
    try{
      const remote=await fetchVersion();
      if(disposed)return false;
      if(shouldReload(version,remote,name)){
        triggered=true;
        report('发现新版本 '+remote.version+'，自动更新中…','ok');
        reload();return true;
      }
      return false;
    }catch(error){if(!disposed)report('版本检测失败：'+error.message,'warning');return false;}
    finally{checking=false;}
  }
  function visible(){if(documentRef.visibilityState==='visible')void check();}
  const timer=setInterval(()=>void check(),intervalMs);
  documentRef.addEventListener('visibilitychange',visible);
  return Object.freeze({check,dispose(){disposed=true;clearInterval(timer);documentRef.removeEventListener('visibilitychange',visible);}});
}
