/** Root discovery must not depend on a selected book's current existence.
 * Real HTTP server, explicit authorization and Mac/Linux-neutral temp paths.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,symlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const scratch=mkdtempSync(join(tmpdir(),'ocr-roots-stale-'));
const source=join(scratch,'source'),catalog=join(scratch,'catalog');
mkdirSync(source);mkdirSync(catalog);
writeFileSync(join(source,'document.md'),'# Stable document');
writeFileSync(join(source,'reference.pdf'),'DUMMY');
const token=join(scratch,'auth-token'),settings=join(scratch,'settings.json');
writeFileSync(token,'ROOT_DISCOVERY_AUTH_TOKEN_abcdefghijklmnopqrstuvwxyz');
const port=await new Promise((resolve,reject)=>{
 const sock=createServer();sock.on('error',reject);
 sock.listen(0,'127.0.0.1',()=>{const n=sock.address().port;sock.close(e=>e?reject(e):resolve(n))});
});
const base='http://127.0.0.1:'+port;
const value=v=>({value:v});
function saveSelection(root,book){
 writeFileSync(settings,JSON.stringify({settings:{
  'workspace.files.rootPath':value(root),
  'workspace.files.bookName':value(book),
 }}));
}
// Broken selections are externally persisted state, not something this test PUTs.
saveSelection(catalog,'Book was moved outside the catalogue');
const service=spawn('python3',['scripts/v6_serve.py'],{
 cwd:process.cwd(),env:{...process.env,V6_BIND:'127.0.0.1',V6_PORT:String(port),
 V6_LAN_TLS_HOST:'',V6_LAB_ID:'',V6_WORKSPACE_ALLOWED_ROOTS:catalog,
 V6_DOCUMENT_PATH:join(source,'document.md'),V6_PDF_PATH:join(source,'reference.pdf'),
 V6_TOKEN_PATH:token,V6_SETTINGS_PATH:settings},stdio:['ignore','ignore','pipe']
});
let stderr='';service.stderr.on('data',chunk=>{stderr+=chunk.toString().slice(0,1000)});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
try{
 let ready=false;
 for(let i=0;i<90;i++){try{if((await fetch(base+'/healthz')).ok){ready=true;break}}catch{}await delay(100)}
 assert(ready,'Isolated HTTP server unavailable: '+stderr);
 assert.equal((await fetch(base+'/api/workspace/roots')).status,403,'Authorization must stay enforced');
 const authorization=await fetch(base+'/api/unlock',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},
  body:JSON.stringify({code:readFileSync(token,'utf8').slice(0,12)})});
 assert.equal(authorization.status,200,await authorization.text());
 const cookie=authorization.headers.get('set-cookie').split(';')[0];
 const get=path=>fetch(base+path,{headers:{Cookie:cookie}});
 async function roots(reason){
  const before=readFileSync(settings);
  const res=await get('/api/workspace/roots');
  const raw=await res.text();
  assert.equal(res.status,200,reason+': '+raw);
  const body=JSON.parse(raw);
  assert.deepEqual(readFileSync(settings),before,'GET must not alter saved selection');
  assert(body.allowedRoots.includes(catalog),'Catalog authorization must remain visible');
  assert(!body.allowedRoots.includes('/etc'),'No unauthorized roots may be exposed');
  assert.equal(body.activeRoot,source,'Fallback identity must be the default document');
  assert.equal(body.activeBook,'','Invalid book must not be represented as active');
  assert.equal(body.documentName,'document.md');
  assert(body.selectionError,reason+' should report stale saved selection');
 }
 await roots('deleted selected book');
 assert.equal((await get('/api/workspace/browse?path='+encodeURIComponent(catalog))).status,200);
 assert.equal((await get('/api/workspace/browse?path='+encodeURIComponent('/etc'))).status,422);
 mkdirSync(join(scratch,'real-book'));
 symlinkSync(join(scratch,'real-book'),join(catalog,'Linked Book'));
 saveSelection(catalog,'Linked Book');
 await roots('symlink selected book');
 saveSelection(join(scratch,'old-catalog-removed'),'Old Book');
 await roots('deleted configured catalogue');
 writeFileSync(settings,'{"settings": malformed');
 await roots('damaged saved settings');
 saveSelection('','');
 const ok=await get('/api/workspace/roots');assert.equal(ok.status,200);
 const final=await ok.json();assert(!final.selectionError,'No warning for valid empty selection');
 console.log('WORKSPACE_STALE_ROOT_DISCOVERY_PASS',{authorization:true,
  staleBook:true,symlinkBook:true,staleRoot:true,malformedSettings:true,
  allowedRootsPreserved:true,strictBrowse:true,unchangedSettings:true});
}finally{service.kill('SIGTERM');rmSync(scratch,{recursive:true,force:true});}
