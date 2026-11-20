/** Frame-owned directory discovery; F02 session and allowlist are authoritative.
 * Optional UI adapter is injected into the generic tree-picker module.
 */
import {mountFrameAuthorization} from './access-auth.js';
const BASE='/labs/lab-frame/api/workspace-io/';
async function request(path){
  const response=await fetch(BASE+path,{cache:'no-store',credentials:'same-origin'});
  if(response.status===403)throw Error('目录访问需要 Lab-Frame 独立授权');
  if(response.status===404)throw Error('Frame 独立目录服务未接通');
  if(!response.ok){
    const reason=(await response.text()).trim().replace(/[\r\n\t]+/g,' ').slice(0,240);
    throw Error('Frame 目录访问失败（HTTP '+response.status+'）'+(reason?'：'+reason:''));
  }
  return response.json();
}
export const frameDirectoryPort=Object.freeze({
  roots:()=>request('roots'),
  browse:path=>request('browse?path='+encodeURIComponent(path)),
  mountAuthorization:(host,options)=>mountFrameAuthorization({host,...options}),
});
