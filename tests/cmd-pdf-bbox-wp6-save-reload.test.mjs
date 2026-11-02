/** WP6 real, authenticated HTTP save/load of only a temporary CMD document. */
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {toMarkdown,toMineruJSON} from '../packages/minerujson-md/dist/index.js';
import {queryCMDLayout} from '../ui/cmd-text-blocks.js';
import {planCMDPDFBBoxEdit,applyCMDPDFBBoxOverrides} from '../ui/cmd-pdf-bbox.js';
const raw=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8');
const source=toMarkdown(raw),layout=await queryCMDLayout(source);
const id='p0b0',bbox=layout.pages[0].regions[0].bbox;
const corrected=[bbox[0]+.5,bbox[1]+.5,bbox[2],bbox[3]];
const plan=planCMDPDFBBoxEdit(source,layout,id,corrected);
const updated=[...plan.edits].sort((a,b)=>b.from-a.from).reduce((s,e)=>s.slice(0,e.from)+e.insert+s.slice(e.to),source);
const temp=mkdtempSync(join(tmpdir(),'ocr2md-wp6-http-')),doc=join(temp,'source.md'),token=join(temp,'token');
writeFileSync(doc,source);const secret='WP6_PDF_SOURCE_SAVE_TOKEN_abcdefghijklmnopqrstuvwxyz';writeFileSync(token,secret);
const port=await new Promise((ok,fail)=>{const s=createServer();s.once('error',fail);
 s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(e=>e?fail(e):ok(p));});});
const origin=`http://127.0.0.1:${port}`;
const server=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),env:{...process.env,
 V6_BIND:'127.0.0.1',V6_PORT:String(port),V6_LAN_TLS_HOST:'',V6_LAB_ID:'',
 V6_STATIC_ROOT:resolve('dist'),V6_DOCUMENT_PATH:doc,V6_PDF_PATH:join(temp,'not-provided.pdf'),
 V6_TOKEN_PATH:token,V6_SETTINGS_PATH:join(temp,'settings.json')},stdio:'ignore'});
const wait=ms=>new Promise(ok=>setTimeout(ok,ms));
try{
 let ready=false;for(let i=0;i<160;i++){try{if((await fetch(origin+'/healthz')).ok){ready=true;break;}}catch{}await wait(120);}
 assert(ready,'WP6 HTTP test server unavailable');
 const get=async(cookie='')=>fetch(origin+'/api/document',{headers:cookie?{Cookie:cookie}:{}});
 const initial=await get(),etag=initial.headers.get('etag');
 assert.equal(await initial.text(),source);
 const auth=await fetch(origin+'/api/unlock',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},
  body:JSON.stringify({code:secret.slice(0,12)})});
 assert.equal(auth.status,200);
 const cookie=auth.headers.get('set-cookie').split(';')[0];
 const put=(text,match)=>fetch(origin+'/api/document',{method:'PUT',headers:{Origin:origin,
  Cookie:cookie,'Content-Type':'text/plain; charset=utf-8',...(match?{'If-Match':match}:{})},body:text});
 const save=await put(updated,etag);assert.equal(save.status,200,await save.text());
 assert.equal(readFileSync(doc,'utf8'),updated);
 const loaded=await get(cookie),reloaded=await loaded.text();
 assert.equal(reloaded,updated);assert.equal(toMineruJSON(reloaded),raw);
 assert.deepEqual(applyCMDPDFBBoxOverrides(await queryCMDLayout(reloaded),reloaded)
  .pages[0].regions[0].bbox,corrected);
 assert.equal((await put(source,etag)).status,412,'concurrent old revision must not overwrite');
 assert.equal((await put(source)).status,428,'missing If-Match must fail');
 const reset=planCMDPDFBBoxEdit(reloaded,layout,id,null);
 const restored=[...reset.edits].reduce((s,e)=>s.slice(0,e.from)+e.insert+s.slice(e.to),reloaded);
 assert.equal(restored,source);
 assert.equal((await put(restored,loaded.headers.get('etag'))).status,200);
 assert.equal((await (await get(cookie)).text()),source);
 console.log('CMD_PDF_BBOX_WP6_HTTP_PASS',{saved:true,reloaded:true,reset:true,stale412:true,missing428:true,originalOCR:true});
}finally{server.kill('SIGTERM');rmSync(temp,{recursive:true,force:true});}
