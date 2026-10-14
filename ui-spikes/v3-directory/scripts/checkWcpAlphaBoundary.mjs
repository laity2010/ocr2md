import{readFile}from'node:fs/promises';import{resolve}from'node:path';
const root=resolve('ui-spikes/v3-directory/wcp-alpha/modules');
const peers=['media','document','review'];
for(const owner of peers){
 const text=await readFile(resolve(root,owner+'.js'),'utf8');
 const imports=[...text.matchAll(/\bimport\s+(?:[^;]*?\s+from\s+)?['"]([^'"]+)['"]/g)].map(x=>x[1]);
 for(const source of imports){
  if(peers.some(peer=>peer!==owner&&source.includes('/'+peer+'.js'))||
     source.includes('web-component-platform')||source.includes('/platform/')||
     /^(https?:|\/)/.test(source))throw Error('MODULE_BOUNDARY_VIOLATION '+owner+' '+source);
 }
}
console.log('OCR_WCP_MODULE_ISOLATION_PASS',peers.join(','));
