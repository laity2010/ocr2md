/** Isolated work-root HTTP contract: two real documents, no Main/Lab user data. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const root=mkdtempSync(join(tmpdir(),'v6-root-switch-'));
const original=join(root,'original'),alternative=join(root,'alternative'),empty=join(root,'empty');
for(const p of [original,alternative,empty])mkdirSync(p);
const filename='mother.minerujson.md',pdf='source.pdf';
const originalDoc=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8');
const alternateDoc=originalDoc+'\n<!-- alternate workroot unique -->\n';
writeFileSync(join(original,filename),originalDoc);
writeFileSync(join(alternative,filename),alternateDoc);
writeFileSync(join(original,pdf),'ORIGINAL_PDF');writeFileSync(join(alternative,pdf),'ALTERNATE_PDF');
const token=join(root,'token');writeFileSync(token,'WORKROOT_TEST_SECRET_abcdefghij');
const settingsPath=join(root,'settings.json');
const port=await new Promise((resolve,reject)=>{const socket=createServer();socket.once('error',reject);
 socket.listen(0,'127.0.0.1',()=>{const found=socket.address().port;socket.close(e=>e?reject(e):resolve(found))});});
const url=`http://127.0.0.1:${port}`;
const server=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),env:{...process.env,
 V6_BIND:'127.0.0.1',V6_PORT:String(port),V6_LAN_TLS_HOST:'',V6_LAB_ID:'',
 V6_WORKSPACE_ALLOWED_ROOTS:root,V6_DOCUMENT_PATH:join(original,filename),
 V6_PDF_PATH:join(original,pdf),V6_TOKEN_PATH:token,V6_SETTINGS_PATH:settingsPath},stdio:['ignore','ignore','pipe']});
server.stderr.on('data',chunk=>console.error('ISOLATED_SERVER_ERROR',String(chunk).slice(0,1400)));
const paused=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try{
 let live=false;
 for(let i=0;i<110;i++){try{if((await fetch(url+'/healthz')).ok){live=true;break}}catch{}await paused(90)}
 assert(live,'isolated server unavailable');
 const unauth=await fetch(url+'/api/workspace/roots');assert.equal(unauth.status,403);
 const unlocked=await fetch(url+'/api/unlock',{method:'POST',headers:{Origin:url,'Content-Type':'application/json'},
  body:JSON.stringify({code:readFileSync(token,'utf8').slice(0,12)})});assert.equal(unlocked.status,200);
 const cookie=unlocked.headers.get('set-cookie').split(';')[0];
 const get=(endpoint)=>fetch(url+endpoint,{headers:{Cookie:cookie}});
 const roots=await (await get('/api/workspace/roots')).json();
 assert.equal(roots.activeRoot,original);assert(roots.allowedRoots.includes(root));
 const browse=await (await get('/api/workspace/browse?path='+encodeURIComponent(root))).json();
 assert.deepEqual(browse.children.map(c=>c.name),['alternative','empty','original']);
 assert.equal((await get('/api/workspace/browse?path=/etc')).status,422);
 assert.equal((await get('/api/workspace/browse?path='+encodeURIComponent(empty))).status,200);
 const initial=await get('/api/document');assert.equal(initial.status,200);
 assert.equal(await initial.text(),originalDoc);const oldEtag=initial.headers.get('etag');
 const initialPdf=await get('/api/pdf');assert.equal(await initialPdf.text(),'ORIGINAL_PDF');
 const settings=await get('/api/settings'),source=await settings.json(),etag=settings.headers.get('etag');
 const record={key:'rootPath',category1:'工作区',category2:'文件与目录',comment:'Root',
  value:alternative,range:{kind:'server-directory'}};
 const setRoot=async (value,ifMatch=etag)=>{
  const payload=structuredClone(source);payload.settings['workspace.files.rootPath']={...record,value};
  return fetch(url+'/api/settings',{method:'PUT',headers:{Cookie:cookie,Origin:url,
   'Content-Type':'application/json','If-Match':ifMatch},body:JSON.stringify(payload)});
 };
 assert.equal((await setRoot('/etc')).status,400);
 assert.equal((await setRoot(empty)).status,400);
 assert.equal(existsSync(settingsPath),false,'rejected settings unexpectedly written');
 const switched=await setRoot(alternative);assert.equal(switched.status,200,await switched.text());
 const active=await (await get('/api/workspace/roots')).json();assert.equal(active.activeRoot,alternative);
 const next=await get('/api/document');assert.equal(await next.text(),alternateDoc);
 const newEtag=next.headers.get('etag');assert.notEqual(oldEtag,newEtag);
 const afterPdf=await get('/api/pdf');assert.equal(await afterPdf.text(),'ALTERNATE_PDF');
 const stale=await fetch(url+'/api/document',{method:'PUT',headers:{Cookie:cookie,Origin:url,
  'If-Match':oldEtag},body:'stale-edit'});assert.equal(stale.status,412);
 const savedBody=alternateDoc+'\n# saved safely\n';
 const saved=await fetch(url+'/api/document',{method:'PUT',headers:{Cookie:cookie,Origin:url,
  'If-Match':newEtag},body:savedBody});assert.equal(saved.status,200);
 assert.equal(readFileSync(join(alternative,filename),'utf8'),savedBody);
 assert.equal(readFileSync(join(original,filename),'utf8'),originalDoc);
 const settingsNow=await get('/api/settings');const currentSettings=await settingsNow.json();
 currentSettings.settings['workspace.files.rootPath'].value='';
 const restore=await fetch(url+'/api/settings',{method:'PUT',headers:{Cookie:cookie,Origin:url,
 'If-Match':settingsNow.headers.get('etag')},body:JSON.stringify(currentSettings)});assert.equal(restore.status,200);
 assert.equal(await (await get('/api/document')).text(),originalDoc);
 assert.equal(readFileSync(join(alternative,filename),'utf8'),savedBody);
 assert.equal(readFileSync(join(original,filename),'utf8'),originalDoc);
 console.log('WORKSPACE_ROOT_ISOLATED_SERVER_PASS',JSON.stringify({validBrowse:true,deniedTraversal:true,
  rejectedInvalidRoot:true,safeSwitch:true,staleSaveRejected:true,alternateSaved:true,restore:true}));
}finally{server.kill('SIGTERM');rmSync(root,{recursive:true,force:true});}
