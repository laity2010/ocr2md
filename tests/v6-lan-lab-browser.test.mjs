/** Real TLS listener -> loopback lab; verifies scoped storage and auth in browsers. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,existsSync,mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {homedir} from 'node:os';
import https from 'node:https';
import {createHash} from 'node:crypto';
import {chromium,webkit} from 'playwright';
const root=process.cwd();
const lab=join(root,'labs/cm-html');
const cert=join(homedir(),'Library/Application Support/ocr2md/lan-tls/server.crt');
const key=join(homedir(),'Library/Application Support/ocr2md/lan-tls/server.key');
const testPDF=join(lab,'.runtime/reference.pdf');
const prodDoc=join(root,'.v6/workspace/buffetts-alpha.minerujson.md');
const prodRelease=join(root,'.v6/release/index.html');
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const before=[hash(prodDoc),hash(prodRelease)];
const engines=[['Chrome',chromium,{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}],
 ['WebKit',webkit,{executablePath:homedir()+'/Library/Caches/ms-playwright/webkit-2359/pw_run.sh'}]];
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function request(url,opts={}){
 return new Promise((resolve,reject)=>{
  const req=https.request(url,{rejectUnauthorized:false,method:opts.method||'GET',headers:opts.headers||{}},res=>{
   const data=[];res.on('data',c=>data.push(c));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(data)}));
  });req.on('error',reject);req.end(opts.body);
 });
}
for(const [idx,[name,engine,config]] of engines.entries()){
 const labPort=4650+idx, tlsPort=4660+idx, formalPort=4670+idx;
 const base=`https://127.0.0.1:${tlsPort}/`,labUrl=base+'labs/cm-html/';
 const data=mkdtempSync(join(lab,'.runtime','lan-acceptance-'));
 const doc=join(data,'document.md'),token=join(data,'token');
 const serverEnv={...process.env,V6_LAB_ID:'cm-html',V6_PORT:String(labPort),V6_BIND:'127.0.0.1',
  V6_DOCUMENT_PATH:doc,V6_SETTINGS_PATH:join(data,'settings.json'),V6_TOKEN_PATH:token,V6_LAB_UNLOCK_TOKEN_PATH:token,
  V6_PDF_PATH:testPDF,V6_LAB_LAN_ORIGIN:base.slice(0,-1)};
 const labServer=spawn('python3',['scripts/v6_serve.py'],{cwd:root,env:serverEnv,stdio:'ignore'});
 const formalServer=spawn('python3',['scripts/v6_serve.py'],{cwd:root,env:{...process.env,
  V6_LAB_ID:'',V6_PORT:String(formalPort),V6_BIND:'127.0.0.1',
  V6_LAN_TLS_HOST:'127.0.0.1',V6_LAN_TLS_PORT:String(tlsPort),
  V6_LAN_TLS_CERT:cert,V6_LAN_TLS_KEY:key,V6_LAN_LAB_ROUTES:`cm-html=${labPort}`,
  V6_DOCUMENT_PATH:join(data,'formal-test-document.md'),V6_TOKEN_PATH:join(data,'formal-test-token')},stdio:'ignore'});
 let browser;
 try{
  let healthy=false;
  for(let k=0;k<100;k++){
   try{if((await request(labUrl+'healthz')).status===200){healthy=true;break;}}catch{}
   await pause(100);
  }
  assert(healthy,`${name} LAN TLS proxy did not become healthy`);
  assert.equal((await request(base)).status,200,'Formal V6 root missing');
  assert.equal((await request(base+'labs/unknown/')).status,404,'Unknown lab proxied');
  assert.equal((await request(labUrl+'api/pdf',{headers:{Range:'bytes=0-30'}})).status,206,'PDF Range lost by proxy');
  assert.equal((await request(labUrl+'api/document',{method:'PUT',headers:{Origin:base.slice(0,-1),'Content-Length':'4'},body:'FAIL'})).status,403);
  assert(!existsSync(doc),'Unauthorized LAN lab write changed document');
  browser=await engine.launch({headless:true,...config});
  const page=await browser.newPage({viewport:{width:1200,height:780},ignoreHTTPSErrors:true});
  const pageErrors=[],outside=[];
  page.on('pageerror',err=>pageErrors.push(err.message));
  page.on('request',req=>{const u=new URL(req.url());if(u.pathname.startsWith('/api/')||u.pathname.startsWith('/media/')||(u.hostname==='127.0.0.1'&&u.port!==String(tlsPort)))outside.push(req.url());});
  await page.goto(labUrl,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('大纲21项'),null,{timeout:45000});
  assert.deepEqual(await page.locator('#module-select option').evaluateAll(nodes=>nodes.map(n=>n.value)),['chapter-boundary','media','latex','settings']);
  await page.locator('#save').click();
  await page.waitForFunction(()=>document.querySelector('#unlock-dialog')?.open);
  await page.locator('#unlock-code').fill(readFileSync(token,'utf8').trim().slice(0,12));
  await page.locator('#unlock-form button[type=submit]').click();
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('已保存'),null,{timeout:12000});
  assert(existsSync(doc),'LAN lab save not persisted');
  const cookies=await page.context().cookies();
  assert(cookies.some(c=>c.name==='v6lab_cm_html'&&c.path==='/labs/cm-html/'&&c.secure),'Lab cookie not path scoped / Secure');
  assert(!cookies.some(c=>c.name==='v6edit'),'Formal edit cookie leaked');
  assert.deepEqual(pageErrors,[],'Page JavaScript errors');
  assert.deepEqual(outside,[],'Browser escaped TLS lab namespace');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('大纲21项'),null,{timeout:35000});
  console.log('LAN_LAB_TLS_PASS',name,JSON.stringify({port:tlsPort,authorizedSaved:true,secureCookie:true,pdfRange:true,unscopedRequests:outside.length}));
 }finally{
  if(browser)await browser.close();
  formalServer.kill('SIGTERM');labServer.kill('SIGTERM');
 }
}
assert.deepEqual([hash(prodDoc),hash(prodRelease)],before,'Production document/release touched by lab tests');
console.log('LAN_LAB_FORMAL_ISOLATION_PASS');
