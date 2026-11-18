/** Tiny Lab-OCR entry: announce the release before fetching the heavy four-pane
 * graph. All business modules remain in boot.js / the existing Frame APIs.
 * A failed import must not leave the original 00000000 startup screen forever.
 */
import '../styles.css';
import '../obsidian-everforest.css';
import '../frame/frame.css';

const root=document.documentElement;
const status=document.getElementById('status');
const badge=document.getElementById('build-version');
const retry=document.getElementById('boot-retry');
const version=__FRAME_BUILD_VERSION__;
badge.textContent=version.match(/(\d{8}-\d{4})\d{2}$/)?.[1]??version;
status.textContent='正在加载四窗组件…';
status.dataset.kind='info';
root.dataset.ocrLabBoot='loading';
let lastResource='';
const loadTimer=setTimeout(()=>{
  if(root.dataset.ocrLabBoot!=='loading')return;
  status.textContent='Lab-OCR 四窗组件加载超时（BOOT_MODULE_TIMEOUT）。请点击「重新加载」。';
  status.dataset.kind='error';retry.hidden=false;retry.style.display='inline-block';
},20000);
function resourceError(event){
  const target=event.target;
  if(target?.tagName!=='SCRIPT'&&target?.tagName!=='LINK')return;
  const path=target.src??target.href??'';
  lastResource=path.split('/').at(-1)?.split('?')[0]?.slice(0,100)??'unknown';
}
window.addEventListener('error',resourceError,true);
try{
  await import('./boot.js');
  root.dataset.ocrLabBoot='ready';
  retry.hidden=true;retry.style.display='none';
  const url=new URL(location.href);
  if(url.searchParams.get('boot-retry')==='1'){
    url.searchParams.delete('boot-retry');
    history.replaceState(history.state,'',url.href);
  }
}catch(error){
  root.dataset.ocrLabBoot='failed';
  const detail=String(error?.message??error).slice(0,160);
  status.textContent='Lab-OCR 组件加载失败：'+detail+
    (lastResource?' · 资源：'+lastResource:'')+'。请点击「重新加载」。';
  status.dataset.kind='error';
  retry.hidden=false;retry.style.display='inline-block';
  const uri=new URL(location.href);
  if(!uri.searchParams.has('boot-retry')){
    uri.searchParams.set('boot-retry','1');
    status.textContent+=' 正在自动重试一次…';
    setTimeout(()=>location.replace(uri.href),1200);
  }
}finally{
  clearTimeout(loadTimer);
  window.removeEventListener('error',resourceError,true);
}
