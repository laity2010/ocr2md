/** WP31: same authorized book-scoped Media byte service; no editor state. */
import {MEDIA_API,mediaFileUrl} from './v2-media-url.js';
export async function uploadV2PastedImage(workspace,file){
  if(!workspace||!file||!['image/png','image/jpeg','image/gif','image/webp'].includes(file.type))
    throw Error('仅支持 PNG、JPEG、GIF 或 WebP 剪贴板图片');
  if(file.size<1||file.size>12*1024*1024)throw Error('粘贴图片最大 12 MiB');
  const res=await fetch(MEDIA_API+'media-paste?'+new URLSearchParams({workspace}),
    {method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':file.type},body:file});
  const result=await res.json().catch(()=>null);
  if(!res.ok)throw Error(result?.error||'图片保存 HTTP '+res.status);
  if(!mediaFileUrl(workspace,result?.path))throw Error('媒体服务未返回有效的本地路径');
  return result.path;
}
