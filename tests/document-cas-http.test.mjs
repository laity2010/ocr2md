// Direct HTTP contract test for PUT /api/document compare-and-swap:
// 428 without If-Match, 412 on stale revision, 200 + new ETag on match,
// and the stored bytes change ONLY on the 200 path. Fully isolated runtime.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
const dir=resolve('.v6/tests/document-cas-http');
rmSync(dir,{recursive:true,force:true});mkdirSync(dir+'/private',{recursive:true});
const doc=dir+'/doc.md',port=String(4700+Math.floor(Math.random()*200));
const original=Buffer.from('# CAS original\n\nbody\n');
writeFileSync(doc,original);
writeFileSync(dir+'/private/token','cas-test-token-'+'x'.repeat(30));
const server=spawn('python3',['scripts/v6_serve.py'],{stdio:['ignore','inherit','inherit'],env:{...process.env,
  V6_PORT:port,V6_DOCUMENT_PATH:doc,V6_TOKEN_PATH:dir+'/private/token',V6_SETTINGS_PATH:dir+'/settings.json'}});
const base=`http://127.0.0.1:${port}`,origin={Origin:base};
try{
  let up=false;for(let i=0;i<100&&!up;i++){try{up=(await fetch(base+'/healthz')).ok;}catch{await new Promise(r=>setTimeout(r,100));}}
  assert(up,'isolated server did not start');
  const unlock=await fetch(base+'/api/unlock',{method:'POST',headers:{...origin,'Content-Type':'application/json'},
    body:JSON.stringify({code:readFileSync(dir+'/private/token','utf8').trim().slice(0,12)})});
  assert.equal(unlock.status,200);
  const cookie=unlock.headers.get('set-cookie').split(';')[0];
  const h={...origin,Cookie:cookie,'Content-Type':'text/plain; charset=utf-8'};
  const get=await fetch(base+'/api/document',{headers:h});
  assert.equal(get.status,200);
  assert.deepEqual(Buffer.from(await get.arrayBuffer()),original);
  const etag=get.headers.get('etag');assert.match(etag,/^"[0-9a-f]{64}"$/);
  // 1. no If-Match -> 428, bytes untouched
  const r428=await fetch(base+'/api/document',{method:'PUT',headers:h,body:'overwrite-428'});
  assert.equal(r428.status,428);assert.deepEqual(readFileSync(doc),original);
  // 2. stale/wrong revision -> 412, bytes untouched
  const r412=await fetch(base+'/api/document',{method:'PUT',headers:{...h,'If-Match':'"'+'0'.repeat(64)+'"'},body:'overwrite-412'});
  assert.equal(r412.status,412);assert.deepEqual(readFileSync(doc),original);
  // 3. unauthenticated -> 403 even with correct revision
  const r403=await fetch(base+'/api/document',{method:'PUT',headers:{...origin,'If-Match':etag},body:'overwrite-403'});
  assert.equal(r403.status,403);assert.deepEqual(readFileSync(doc),original);
  // 4. matching revision -> 200, new ETag, bytes replaced
  const r200=await fetch(base+'/api/document',{method:'PUT',headers:{...h,'If-Match':etag},body:'# saved v2\n'});
  assert.equal(r200.status,200);
  const etag2=r200.headers.get('etag');assert.notEqual(etag2,etag);
  assert.equal(readFileSync(doc,'utf8'),'# saved v2\n');
  // 5. reusing the old revision is now stale -> 412, v2 preserved
  const again=await fetch(base+'/api/document',{method:'PUT',headers:{...h,'If-Match':etag},body:'lost-update'});
  assert.equal(again.status,412);assert.equal(readFileSync(doc,'utf8'),'# saved v2\n');
  const get2=await fetch(base+'/api/document',{headers:h});
  assert.equal(get2.headers.get('etag'),etag2);
  console.log('DOCUMENT_CAS_HTTP_PASS',JSON.stringify({s:[428,412,403,200,412]}));
}finally{server.kill();}
