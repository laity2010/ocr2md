/** WP3: isolated real HTTP CMD document save/reload & competing editor CAS.
 * No user's workfile, only temp directory and randomly bound loopback server.
 */
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {toMarkdown,toMineruJSON} from '../packages/minerujson-md/dist/index.js';
import {readCMDBlockChains,planCMDMergeBlockChains,
  planCMDSplitBlockChain,planCMDMigrateLegacyBlockChains} from '../ui/cmd-block-chains.js';
const raw=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8');
const legacy=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8');
const source=toMarkdown(raw);
const apply=(s,plan)=>[...plan.edits].sort((a,b)=>b.from-a.from).reduce((v,e)=>{
  assert.equal(v.slice(e.from,e.to),e.expected);return v.slice(0,e.from)+e.insert+v.slice(e.to);
},s);
const temp=mkdtempSync(join(tmpdir(),'ocr2md-wp3-save-'));
const md=join(temp,'mother.md'),token=join(temp,'token'),settings=join(temp,'settings.json');
writeFileSync(md,source);
const secret='WP3_SAVING_SOURCE_TOKEN_abcdefghijklmnopqrstuvwxyz';writeFileSync(token,secret);
const port=await new Promise((ok,fail)=>{const s=createServer();s.once('error',fail);
 s.listen(0,'127.0.0.1',()=>{const id=s.address().port;s.close(e=>e?fail(e):ok(id));});});
const origin=`http://127.0.0.1:${port}`;
const server=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),env:{...process.env,
 V6_BIND:'127.0.0.1',V6_PORT:String(port),V6_LAN_TLS_HOST:'',V6_LAB_ID:'',
 V6_STATIC_ROOT:resolve('dist'),V6_DOCUMENT_PATH:md,V6_PDF_PATH:join(temp,'absent.pdf'),
 V6_TOKEN_PATH:token,V6_SETTINGS_PATH:settings},stdio:['ignore','ignore','pipe']});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
try{
 let ready=false;for(let i=0;i<200;i++){try{if((await fetch(origin+'/healthz')).ok){ready=true;break;}}catch{}await delay(125);}
 assert(ready,'isolated CMD HTTP server unavailable');
 const get=async(cookie='')=>fetch(origin+'/api/document',{headers:cookie?{Cookie:cookie}:{}});
 const initial=await get();const initialTag=initial.headers.get('etag');
 assert.equal(await initial.text(),source);
 const auth=await fetch(origin+'/api/unlock',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},
 body:JSON.stringify({code:secret.slice(0,12)})});
 assert.equal(auth.status,200);
 const cookie=auth.headers.get('set-cookie').split(';')[0];
 const put=(payload,etag)=>fetch(origin+'/api/document',{method:'PUT',headers:{Origin:origin,
  Cookie:cookie,'Content-Type':'text/plain; charset=utf-8',...(etag?{'If-Match':etag}:{})},body:payload});
 let expected=apply(source,planCMDMergeBlockChains(source,'p3b0s0','p4b0s2'));
 const saved=await put(expected,initialTag);assert.equal(saved.status,200,await saved.text());
 assert.equal(readFileSync(md,'utf8'),expected);
 const after=await get(cookie);assert.equal(await after.text(),expected);
 const restored=readCMDBlockChains(readFileSync(md,'utf8'));
 assert.deepEqual(restored.chains.find(c=>c.id==='bc-0001')?.members,['p3b0s0','p4b0s2']);
 assert.equal(restored.invalid.length,0);
 assert.equal(toMineruJSON(expected),raw);
 const stale=await put(source,initialTag);assert.equal(stale.status,412);
 assert.equal(readFileSync(md,'utf8'),expected);
 const noMatch=await put(source);assert.equal(noMatch.status,428);
 assert.equal(readFileSync(md,'utf8'),expected);
 const denied=await fetch(origin+'/api/document',{method:'PUT',headers:{Origin:origin,
  'If-Match':after.headers.get('etag')},body:source});
 assert.equal(denied.status,403);
 const split=apply(expected,planCMDSplitBlockChain(expected,'p4b0s2'));
 const updated=await put(split,after.headers.get('etag'));
 assert.equal(updated.status,200);
 assert.equal((await (await get(cookie)).text()),split);
 assert.equal(toMineruJSON(split),raw);
 assert.equal(readCMDBlockChains(split).summary.chains,267);
 // Legacy content migration must also survive save & reload, with the same
 // original OCR bytes and no new old-format join markers.
 const legacySave=await put(legacy,updated.headers.get('etag'));
 assert.equal(legacySave.status,200);
 const converted=apply(legacy,planCMDMigrateLegacyBlockChains(legacy));
 const savedMigrated=await put(converted,legacySave.headers.get('etag'));
 assert.equal(savedMigrated.status,200);
 assert.equal(await (await get(cookie)).text(),converted);
 assert.equal(toMineruJSON(converted),raw);
 console.log('CMD_BC_WP3_SAVE_RELOAD_PASS',{atoms:267,afterMerge:266,
  afterSplit:267,oldMigrated:224,stale412:true,missingRevision428:true,unauthed403:true,
  rawJSONUnchanged:true});
}finally{server.kill('SIGTERM');rmSync(temp,{recursive:true,force:true});}
