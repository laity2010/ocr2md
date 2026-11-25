/** One authorized local media byte URL for both V2 readers. */
export const MEDIA_API='/labs/lab-ocr-v2/api/mineru-base/';
export function mediaFileUrl(workspace,path){
 if(!workspace||!/^media\/[0-9a-f]{24}\.(?:jpg|jpeg|png|gif|webp)$/.test(path??''))return null;
 return MEDIA_API+'media-file?'+new URLSearchParams({workspace,path});
}
/** Retry transient image transport errors twice; do not destroy the cell DOM. */
const retryBindings=new WeakMap();
export function retryLocalImage(image,src,onFailure=()=>{}){
 const original=new URL(src,location.href);original.searchParams.delete('_retry');
 const key=original.href;
 const existing=retryBindings.get(image);
 if(existing?.key===key)return;
 existing?.dispose();
 let retries=0,timer=null;
 const matches=()=>{
  const raw=image.getAttribute('src');if(!raw)return false;
  const current=new URL(raw,location.href);current.searchParams.delete('_retry');
  return current.href===key;
 };
 const loaded=()=>{if(!matches())return;clearTimeout(timer);timer=null;retries=0;};
 const failed=()=>{
  if(!matches()||timer!==null)return;
  if(retries>=2){onFailure();return;}
  retries++;
  timer=setTimeout(()=>{
   timer=null;
   if(!image.isConnected||!matches())return;
   const url=new URL(key);url.searchParams.set('_retry',String(retries));
   image.src=url.href;
  },retries*250);
 };
 const dispose=()=>{clearTimeout(timer);image.removeEventListener('load',loaded);image.removeEventListener('error',failed);};
 retryBindings.set(image,{key,dispose});
 image.addEventListener('load',loaded);image.addEventListener('error',failed);
 // Morphdom may reuse a mounted image whose request already failed.
 if(image.complete&&!image.naturalWidth&&matches())failed();
}
