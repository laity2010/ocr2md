import {MEDIA_API,mediaFileUrl} from './v2-media-url.js';
export {MEDIA_API,mediaFileUrl};
/** Read-only preview lookup; the existing authorized status API decides whether
 * the exact remote URL already has a complete local file. Never downloads. */
export async function resolveMediaPreviewUrl(workspace,remote){
 if(!workspace||typeof remote!=='string'||remote.length>2048||remote.includes('\\'))return null;
 let parsed;try{parsed=new URL(remote);}catch{return null;}
 if(parsed.protocol!=='https:'||parsed.hostname!=='cdn-mineru.openxlab.org.cn'||
    parsed.port||parsed.username||parsed.password||parsed.hash||
    !/\.(?:jpe?g|png|gif|webp)$/i.test(parsed.pathname))return null;
 try{
  const response=await fetch(MEDIA_API+'media-status?'+new URLSearchParams({workspace,url:remote}),
    {credentials:'same-origin',cache:'no-store'});
  if(!response.ok)return null;
  const status=await response.json();
  return status.state==='complete'?mediaFileUrl(workspace,status.path):null;
 }catch{return null;}
}
