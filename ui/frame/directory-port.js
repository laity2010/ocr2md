/** Lab-frame evaluation adapter for the pre-existing authorized server
 * Workspace discovery API. No filesystem access or OCR rules in the client.
 * This adapter may later be replaced with a dedicated generic service. */
async function request(path){
  const response=await fetch(path,{cache:'no-store',credentials:'same-origin'});
  if(response.status===403){
    const error=Error('目录访问需要 Main 的编辑授权');
    error.status=403;
    throw error;
  }
  if(response.status===404)throw Error('服务器目录服务尚未接通');
  if(!response.ok){
    // Main returns validation failures as plain text; preserve the reason.
    const reason=(await response.text()).trim().replace(/[\r\n\t]+/g,' ').slice(0,240);
    const operation=path.includes('/roots')?'授权根目录':'目录访问';
    throw Error(operation+'失败（HTTP '+response.status+'）'+(reason?'：'+reason:''));
  }
  return response.json();
}
export const frameDirectoryPort=Object.freeze({
  roots:()=>request('/api/workspace/roots'),
  browse:path=>request('/api/workspace/browse?path='+encodeURIComponent(path)),
});
