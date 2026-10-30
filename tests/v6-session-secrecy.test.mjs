/** Proposal D: the raw editor KEY (and any 12+ char substring of it) must
 * never appear in any response header, Set-Cookie or body; the unlock code
 * is not KEY[:12]; KEY-prefix codes are rejected; the HMAC session cookie
 * authorizes; legacy raw-KEY cookies migrate (replaced by HMAC) and are
 * refused when V6_LEGACY_RAW_COOKIE=0. Isolated /tmp document and token. */
import {unlockCode,sessionToken} from './v6-auth.test-helper.mjs';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
const scratch=mkdtempSync(join(tmpdir(),'v6-session-secrecy-'));
const doc=join(scratch,'mother.minerujson.md');
writeFileSync(doc,readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8'));
writeFileSync(join(scratch,'ref.pdf'),'PDF');
const token=join(scratch,'editor-token');
const KEY=randomBytes(36).toString('base64url');writeFileSync(token,KEY);
const freePort=()=>new Promise((ok,fail)=>{const n=createServer();n.once('error',fail);n.listen(0,'127.0.0.1',()=>{const p=n.address().port;n.close(e=>e?fail(e):ok(p));});});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
// Any 12-char window of KEY counts as a leak.
const windows=[...Array(KEY.length-11).keys()].map(i=>KEY.slice(i,i+12));
const leaks=text=>windows.some(w=>text.includes(w));
async function start(extra={}){
 const port=await freePort(),url=`http://127.0.0.1:${port}`;
 const proc=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),env:{...process.env,
  V6_BIND:'127.0.0.1',V6_PORT:String(port),V6_LAN_TLS_HOST:'',V6_LAB_ID:'',V6_DOCUMENT_PATH:doc,
  V6_PDF_PATH:join(scratch,'ref.pdf'),V6_TOKEN_PATH:token,V6_SETTINGS_PATH:join(scratch,'settings.json'),...extra},stdio:'ignore'});
 for(let i=0;i<120;i++){try{if((await fetch(url+'/healthz')).ok)return {url,proc};}catch{}await pause(100);}
 proc.kill();throw Error('isolated server not ready');
}
const observed=[];
async function call(url,path,init={}){
 const r=await fetch(url+path,{redirect:'manual',...init});
 const body=Buffer.from(await r.arrayBuffer()).toString('latin1');
 const headers=[...r.headers.entries()].map(([k,v])=>k+': '+v).join('\n')+'\n'+(r.headers.getSetCookie?.()||[]).join('\n');
 observed.push({path,status:r.status,headers,body});
 return {r,body,headers,setCookie:r.headers.getSetCookie?.()||[]};
}
let s=await start();
try{
 const code=unlockCode(KEY);
 assert.notEqual(code,KEY.slice(0,12),'unlock code must not be KEY[:12]');
 assert(!leaks(code),'unlock code must not contain a KEY window');
 const json=c=>({method:'POST',headers:{Origin:s.url,'Content-Type':'application/json'},body:JSON.stringify({code:c})});
 assert.equal((await call(s.url,'/api/unlock',json(KEY.slice(0,12)))).r.status,403,'legacy KEY-prefix code must be rejected');
 const ok=await call(s.url,'/api/unlock',json(code));
 assert.equal(ok.r.status,200);
 const cookie=ok.setCookie.find(c=>c.startsWith('v6edit='));
 assert(cookie,'unlock must set the session cookie');
 const value=cookie.split(';')[0].slice('v6edit='.length);
 assert.equal(value,sessionToken(KEY,'v6edit'));assert.notEqual(value,KEY);
 assert(/HttpOnly/i.test(cookie)&&/SameSite=Lax/i.test(cookie),'cookie flags must not be loosened');
 const session=await call(s.url,'/api/session',{headers:{Cookie:'v6edit='+value}});
 assert.equal(JSON.parse(session.body).canSave,true,'HMAC session must authorize');
 assert.equal(JSON.parse((await call(s.url,'/api/session',{headers:{Cookie:'v6edit='+value+'x'}})).body).canSave,false);
 const access=await call(s.url,'/access/'+KEY);
 assert.equal(access.r.status,302);
 assert(access.setCookie.some(c=>c.startsWith('v6edit='+value+';')),'access link must issue the HMAC cookie');
 const legacy=await call(s.url,'/api/session',{headers:{Cookie:'v6edit='+KEY}});
 assert.equal(JSON.parse(legacy.body).canSave,true,'legacy cookie accepted during migration');
 assert(legacy.setCookie.some(c=>c.startsWith('v6edit='+value+';')),'legacy cookie must be replaced by HMAC cookie');
 for(const path of ['/','/api/session','/api/document','/api/settings','/healthz'])
  await call(s.url,path,{headers:{Cookie:'v6edit='+value}});
}finally{s.proc.kill();}
s=await start({V6_LEGACY_RAW_COOKIE:'0'});
try{
 const legacy=await call(s.url,'/api/session',{headers:{Cookie:'v6edit='+KEY}});
 assert.equal(JSON.parse(legacy.body).canSave,false,'legacy cookie refused once migration is closed');
 assert.equal(legacy.setCookie.length,0);
}finally{s.proc.kill();}
// The only place KEY may appear is the request line we sent ourselves
// (/access/KEY); no response header, cookie or body may contain it.
const leaked=observed.filter(o=>leaks(o.headers)||leaks(o.body)).map(o=>o.path===('/access/'+KEY)?'/access/<KEY>':o.path);
assert.deepEqual(leaked,[],'raw KEY leaked in responses');
console.log('V6_SESSION_SECRECY_PASS responses_checked='+observed.length);
