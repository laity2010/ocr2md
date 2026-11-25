/** Main byte-store, V2 authorized book transport. No editor state. */
import {MEDIA_API,mediaFileUrl} from './v2-media-url.js';
export async function uploadPastedImage(book,file){
  if(!file||!['image/png','image/jpeg','image/gif','image/webp'].includes(file.type)||file.size<1||file.size>12*1024*1024)
    throw Error('仅支持 12 MiB 内 PNG/JPEG/GIF/WebP 图片');
  const response=await fetch(MEDIA_API+'media-paste?'+new URLSearchParams({workspace:book}),{
    method:'POST',credentials:'same-origin',headers:{'Content-Type':file.type},body:file});
  const result=await response.json();
  if(!response.ok)throw Error(result?.error||'HTTP '+response.status);
  if(!mediaFileUrl(book,result.path))throw Error('媒体路径无效');
  return result.path;
}
