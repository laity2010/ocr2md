/** Unlock lab with production 12-character code; never reuse its session cookie. */
import {unlockCode} from './v6-auth.test-helper.mjs';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
const lab=join(process.cwd(),'labs/cm-html');
const data=mkdtempSync(join(lab,'.runtime','shared-unlock-test-'));
const token=join(data,'lab-token'),doc=join(data,'document.md');
const formalDoc=join(process.cwd(),'.v6/workspace/buffetts-alpha.minerujson.md');
const formalToken=join(process.cwd(),'.v6/private/editor-token');
assert(existsSync(formalToken),'Mainline must already have its own save code');
const formalCode=unlockCode(readFileSync(formalToken,'utf8'));
const formalHash=createHash('sha256').update(readFileSync(formalDoc)).digest('hex');
const port=4734,base=`http://127.0.0.1:${port}`;
const server=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),stdio:'ignore',env:{
 ...process.env,V6_LAB_ID:'cm-html',V6_PORT:String(port),V6_TOKEN_PATH:token,
 V6_DOCUMENT_PATH:doc,V6_SETTINGS_PATH:join(data,'settings.json'),V6_PDF_PATH:join(lab,'.runtime/reference.pdf'),
 V6_LAB_UNLOCK_TOKEN_PATH:'' // Deliberately use mainline's read-only code.
}});
const api=base+'/labs/cm-html/';
const pause=t=>new Promise(r=>setTimeout(r,t));
try{
 let up=false;for(let i=0;i<70;i++){try{if((await fetch(api+'healthz')).ok){up=true;break;}}catch{}await pause(100);}
 assert(up,'Lab not running');
 assert(existsSync(token),'Lab has its own session signing key');
 const labCode=unlockCode(readFileSync(token,'utf8'));
 assert.notEqual(labCode,formalCode,'Fixture unexpectedly generated same unlock code');
 const unlock=code=>fetch(api+'api/unlock',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({code})});
 assert.equal((await unlock(labCode)).status,403,'Old lab-specific code must be refused');
 const ok=await unlock(formalCode);
 assert.equal(ok.status,200,'Formal code did not unlock lab');
 const cookie=ok.headers.get('set-cookie')||'';
 assert(cookie.startsWith('v6lab_cm_html='),'Lab should issue lab cookie only');
 assert(cookie.includes('Path=/labs/cm-html/'),'Lab cookie path escaped lab');
 assert(!cookie.includes('v6edit='),'Formal session token leaked');
 const sessionCookie=cookie.split(';')[0];
 assert.equal((await (await fetch(api+'api/session',{headers:{Cookie:sessionCookie}})).json()).canSave,true);
 assert.equal((await (await fetch(api+'api/session',{headers:{Cookie:`v6edit=${readFileSync(formalToken,'utf8').trim()}`}})).json()).canSave,false);
 const unauthorized=await fetch(api+'api/document',{method:'PUT',headers:{Origin:base},body:'no-formal-write'});
 assert.equal(unauthorized.status,403);
 assert(!existsSync(doc),'Unauthorized attempt wrote lab document');
 assert.equal(createHash('sha256').update(readFileSync(formalDoc)).digest('hex'),formalHash);
 console.log('SHARED_UNLOCK_TEST_PASS',JSON.stringify({formalCodeAccepted:true,labOldCodeRejected:true,labCookieIsolated:true,formalDocumentUntouched:true}));
}finally{server.kill('SIGTERM');}
