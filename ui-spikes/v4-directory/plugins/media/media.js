/** Media read-only CQE isolation fixture. This is NOT a Vault downloader.
 * Enable only after a separate business acceptance. */
const maxText=20000;
export const mediaContract={name:'media.scan',version:1,kind:'query',
 senders:['ocr2md:media'],receivers:['ocr2md:media-scan'],
 payload:{type:'object',properties:{text:{type:'string',maxLength:maxText}},required:['text'],additionalProperties:false},
 response:{type:'object',properties:{items:{type:'array',items:{type:'object',properties:{kind:{type:'string',maxLength:20},value:{type:'string',maxLength:300}},required:['kind','value'],additionalProperties:false}}},required:['items'],additionalProperties:false}};
function scanMedia(text){
 const out=[];
 for(const match of text.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g))out.push({kind:'image',value:match[1].slice(0,300)});
 for(const match of text.matchAll(/<table\b[\s\S]*?<\/table\s*>/gi))out.push({kind:'html-table',value:match[0].slice(0,300)});
 for(const match of text.matchAll(/(?<!\\)\$\$(?:[^$]|\$(?!\$))+\$\$/g))out.push({kind:'latex-block',value:match[0].slice(0,300)});
 return out.slice(0,100);
}
export const mediaScanService={id:'ocr2md:media-scan',name:'媒体扫描服务',version:'0.1.0',presentation:'service',
 description:'仅解析传入 Markdown 的媒体结构，不读取或写入 Vault',
 setup(endpoint){return endpoint.handle('media.scan',({text})=>({items:scanMedia(text)}))}};
export const mediaModule={id:'ocr2md:media',name:'媒体',version:'0.1.0',presentation:'full',order:40,
 description:'媒体扫描隔离验收样板：粘贴 Markdown，识别图片、HTML 表格、块级公式；尚未接入 Vault 下载。',
 async mount(host,endpoint){
  host.dataset.moduleOwner='ocr2md:media';host.style.cssText='height:100%;width:100%;overflow:auto;padding:12px;background:#1d2732;color:#e1e7ef';
  const title=document.createElement('h3');title.textContent='媒体扫描 · 只读隔离验收样板';
  const input=document.createElement('textarea');input.dataset.testid='media-sample-input';
  input.placeholder='粘贴 Markdown 进行媒体识别（暂不读取 Vault）';
  input.style.cssText='width:100%;height:150px;background:#263440;color:inherit';
  const button=document.createElement('button');button.type='button';button.textContent='扫描媒体';button.dataset.testid='media-sample-scan';
  const output=document.createElement('pre');output.dataset.testid='media-sample-results';
  host.replaceChildren(title,input,button,output);
  const abort=new AbortController();host.__mediaAbort=abort;
  button.addEventListener('click',async()=>{
   try{const result=await endpoint.query('media.scan',{text:input.value});
    if(!abort.signal.aborted)output.textContent=JSON.stringify(result.items,null,2);
   }catch(error){if(!abort.signal.aborted)output.textContent='扫描失败：'+String(error)}
  },{signal:abort.signal});
 },
 unmount(host){host.__mediaAbort?.abort();host.replaceChildren()}};
