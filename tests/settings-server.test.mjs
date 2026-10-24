/** Authenticated CMD settings JSON endpoint and isolated atomic-save regression. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,writeFileSync,existsSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const root=mkdtempSync(join(tmpdir(),'ocr-settings-server-'));
const token=join(root,'auth');writeFileSync(token,'settings-port-test-secret');
const storage=join(root,'settings.json');
const port=5766,base=`http://127.0.0.1:${port}`;
const server=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),
  env:{...process.env,V6_BIND:'127.0.0.1',V6_PORT:String(port),V6_TOKEN_PATH:token,
    V6_SETTINGS_PATH:storage,V6_DOCUMENT_PATH:join(root,'mother.minerujson.md')},stdio:'ignore'});
const pause=t=>new Promise(resolve=>setTimeout(resolve,t));
let up=false;
for(let i=0;i<100;i++){try{if((await fetch(base+'/healthz')).ok){up=true;break;}}catch{}await pause(100);}
assert(up,'Settings test server never became ready');
try{
 const current=await fetch(base+'/api/settings');assert.equal(current.status,200);
 const oldEtag=current.headers.get('etag');assert.equal(oldEtag?.length,64);
 assert.equal((await current.json()).settings['globalUi.cmSource.defaultFontSize'].value,12);
 assert.equal(existsSync(storage),false,'GET must not create user config');
 const content=JSON.stringify({settings:{'globalUi.cmSource.defaultFontSize':{
  key:'defaultFontSize',category1:'全局 UI',category2:'CM 源码窗',
  comment:'测试持久化',value:23,range:{min:8,max:32,step:1}
 }},keep:'untouched'},null,2)+'\n';
 const send=(cookie,origin,etag,body=content)=>fetch(base+'/api/settings',{method:'PUT',
   headers:{'Content-Type':'application/json','Cookie':cookie,'Origin':origin,'If-Match':etag},body});
 assert.equal((await send('',base,oldEtag)).status,403);
 assert.equal((await send('v6edit=settings-port-test-secret','http://another.example',oldEtag)).status,403);
 assert.equal(existsSync(storage),false,'Unauthorized writes must not create settings');
 const yes=await send('v6edit=settings-port-test-secret',base,oldEtag);
 assert.equal(yes.status,200);
 assert.equal(readFileSync(storage,'utf8'),content);
 assert.equal((await send('v6edit=settings-port-test-secret',base,oldEtag,'{}')).status,409);
 const newEtag=(await fetch(base+'/api/settings')).headers.get('etag');
 assert.notEqual(newEtag,oldEtag);
 assert.equal((await send('v6edit=settings-port-test-secret',base,newEtag,'not JSON')).status,400);
 assert.equal(readFileSync(storage,'utf8'),content);
 console.log('CMD_SETTINGS_SERVER_PASS',JSON.stringify({readOnlyGet:true,auth:true,origin:true,
   compareAndSave:true,preserveBytes:true,staleRejected:true,invalidRejected:true}));
}finally{server.kill('SIGTERM');}
