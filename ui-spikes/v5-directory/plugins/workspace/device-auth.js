/** Only the V5 gateway handles long-lived device authorization.
 * This adapter has no file or DIRjson access; it never stores a credential.
 */
export async function setRememberDevice(enabled,credential='',signal){
 const headers={'Content-Type':'application/json'};
 if(enabled&&credential)headers['X-OCR2MD-V3-Key']=credential;
 const url='/__v5/auth/remember';
 const response=await fetch(url,{method:'POST',headers,
  body:JSON.stringify({remember:enabled}),credentials:'same-origin',cache:'no-store',signal});
 if(!response.ok)throw Error('授权服务 '+response.status);
 return response.json();
}
