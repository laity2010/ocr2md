/** Shell-owned HTTP adapter. Settings receives directory capabilities, not filesystem or globals. */
import {appPath} from './http-path.js';
async function json(url){
  const response=await fetch(appPath(url),{cache:'no-store'});
  if(!response.ok)throw Error((await response.text()).slice(0,160)||`HTTP ${response.status}`);
  return response.json();
}
export const workspaceDirectoryPort=Object.freeze({
  roots:()=>json('/api/workspace/roots'),
  browse:path=>json('/api/workspace/browse?path='+encodeURIComponent(path)),
  books:root=>json('/api/workspace/books?path='+encodeURIComponent(root)),
});
