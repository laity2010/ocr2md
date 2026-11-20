/** Shared Lab-Frame public F02 Workspace I/O port.
 * Server uses Frame-only signed sessions and scoped directory allowlists,
 * exercising POSIX I/O under the selected Frame-authorized directory.
 * No front-end filesystem access, OCR rules, or parallel Settings state.
 */
const DEFAULT_BASE='/labs/lab-frame/api/workspace-io/';

export function createFrameWorkspaceIO({fetcher=fetch,base=DEFAULT_BASE}={}){
  async function request(operation,workspace,{method='GET',path='',contentBase64,expectedSha256}={}){
    if(typeof workspace!=='string'||!workspace.startsWith('/')){
      throw Error('请先在全局设置绑定工作目录');
    }
    const url=base+operation+(method==='GET'
      ?'?'+new URLSearchParams({workspace,...(path?{path}:{})}).toString():'');
    const options={method,cache:'no-store',credentials:'same-origin'};
    if(method==='POST'){
      options.headers={'Content-Type':'application/json'};
      options.body=JSON.stringify({workspace,...(path?{path}:{}),
        ...(contentBase64!==undefined?{contentBase64}:{}),
        ...(expectedSha256!==undefined?{expectedSha256}:{})});
    }
    let response;
    try{response=await fetcher(url,options);}catch{
      throw Error('服务器工作区文件服务无法连接');
    }
    const result=await response.json().catch(()=>null);
    if(!response.ok){
      const detail=(typeof result?.error==='string'?result.error:'HTTP '+response.status).slice(0,200);
      throw Error(detail);
    }
    if(!result||typeof result!=='object')throw Error('工作区文件服务返回无效结果');
    return result;
  }
  return Object.freeze({
    probe:async workspace=>{
      const result=await request('probe',workspace,{method:'POST'});
      if(result.verified!==true||result.readable!==true||result.writable!==true){
        throw Error('工作区读写回读验证未完成');
      }
      return result;
    },
    listFiles:(workspace,path='')=>request('list',workspace,{path}),
    readFile:(workspace,path)=>request('read',workspace,{path}),
    createFile:(workspace,path,contentBase64)=>request('create',workspace,
      {method:'POST',path,contentBase64}),
    replaceFile:(workspace,path,contentBase64,expectedSha256)=>request('replace',workspace,
      {method:'POST',path,contentBase64,expectedSha256}),
  });
}
export const frameWorkspaceIO=createFrameWorkspaceIO();
