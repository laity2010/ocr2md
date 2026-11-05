/** Browser-native, read-only decoding and SHA-256 verification of CMD evidence. */
export const CMD_SEALED_SOURCE=/<!-- minerujson:source:v1:([a-f0-9]{64})\n([a-zA-Z0-9_\-\n]+)\n-->\s*$/;
const decode=encoded=>{
  const base64=encoded.replace(/\s/g,'').replace(/-/g,'+').replace(/_/g,'/');
  const binary=atob(base64);const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return bytes;
};
const hex=bytes=>Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
async function inflate(bytes){
  if(typeof DecompressionStream!=='function')throw Error('浏览器不支持解压 CMD 内嵌 JSON');
  const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
// Cache only the small geometry projection. The full decompressed OCR tree
// is deliberately short-lived: WebKit PDF.js needs its memory for page
// canvases and can crash on zoom if we retain every OCR span in parallel.
let cached=null;
export async function readCMDSealedJSON(source){
  if(typeof source!=='string')throw Error('CMD 源码无效');
  const match=CMD_SEALED_SOURCE.exec(source);
  if(!match)throw Error('CMD 缺少无损 MinerU JSON 封存区');
  const key=match[0];
  const bytes=await inflate(decode(match[2]));
  const sha=hex(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)));
  if(sha!==match[1])throw Error('CMD 封存 JSON SHA-256 校验失败');
  const data=JSON.parse(new TextDecoder().decode(bytes));
  if(!Array.isArray(data.pdf_info))throw Error('CMD 封存 JSON 无 PDF 页面');
  return {data,bytes,end:match.index,key};
}
