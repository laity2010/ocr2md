/** Lab-frame evaluation adapter for the pre-existing authorized server
 * Workspace discovery API. No filesystem access or OCR rules in the client.
 * This adapter may later be replaced with a dedicated generic service. */
async function request(path){
  const response=await fetch(path,{cache:'no-store',credentials:'same-origin'});
  if(response.status===403)throw Error('目录访问需要 Main 的编辑授权');
  if(response.status===404)throw Error('服务器目录服务尚未接通');
  if(!response.ok)throw Error('服务器目录接口 HTTP '+response.status);
  return response.json();
}
export const frameDirectoryPort=Object.freeze({
  roots:()=>request('/api/workspace/roots'),
  browse:path=>request('/api/workspace/browse?path='+encodeURIComponent(path)),
});
