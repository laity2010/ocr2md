/** Development Main release update must not wait for unsaved CM6 / Settings.
 * /healthz is simulated against an isolated scratch Vite server; no actual
 * release or user's document is modified. Lab/production remains guarded. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {chromium,webkit,devices} from 'playwright';
import {chromeExecutable,webkitExecutable} from './platform.test-helper.mjs';
const source=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8');
const dir=mkdtempSync(join(tmpdir(),'ocr2md-main-autoreload-'));
const documentPath=join(dir,'test.md');writeFileSync(documentPath,source);
const port=await new Promise((ok,fail)=>{const server=createServer();server.once('error',fail);
  server.listen(0,'127.0.0.1',()=>{const p=server.address().port;
    server.close(err=>err?fail(err):ok(p));});});
const url=`http://127.0.0.1:${port}/`;
const host=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1',
  '--port',String(port),'--strictPort'],{cwd:process.cwd(),env:{...process.env,
  V6_DOCUMENT_PATH:documentPath,V6_PDF_PATH:join(dir,'no.pdf'),
  V6_SETTINGS_PATH:join(dir,'settings.json')},stdio:'ignore'});
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
try{
 let ready=false;for(let i=0;i<180;i++){try{if((await fetch(url)).ok){ready=true;break;}}catch{}await sleep(140);}
 assert(ready,'isolated Main preview did not start');
 for(const [name,engine,binary] of [['Chrome',chromium,chromeExecutable()],
   ['iPad-WebKit',webkit,webkitExecutable()]]){
  if(process.env.ONE_BROWSER&&name!==process.env.ONE_BROWSER)continue;
  const browser=await engine.launch({headless:true,...(binary?{executablePath:binary}:{})});
  try{
   const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:740}});
   const errors=[];let dialogCount=0,serveUpgrade=false,upgradeServed=false;
   page.on('pageerror',error=>errors.push(error.message));
   page.on('dialog',dialog=>{dialogCount++;void dialog.dismiss();});
   await page.addInitScript(()=>{
     const count=Number(sessionStorage.getItem('ocr2md-release-test-loads')||'0')+1;
     sessionStorage.setItem('ocr2md-release-test-loads',String(count));
     window.__releaseTestLoads=count;
   });
   await page.route('**/healthz',route=>{
     if(serveUpgrade&&!upgradeServed){upgradeServed=true;
       return route.fulfill({status:200,contentType:'application/json',
         body:JSON.stringify({version:'v6-20991231-235959'})});}
     return route.fulfill({status:200,contentType:'application/json',body:'{}'});
   });
   await page.goto(url,{waitUntil:'domcontentloaded',timeout:65000});
   await page.waitForFunction(()=>window.__v6cm6?.view?.state?.doc?.length>500,null,{timeout:85000});
   const buildTitle=await page.locator('#build-version').getAttribute('title');
   assert.match(buildTitle,/v6-\d{8}-\d{6}/,'development Main build ID');
   // Make a *real* unsaved CM6 change through the authoritative editor.
   await page.evaluate(()=>window.__v6cm6.view.dispatch({changes:{from:0,insert:'Unsaved test\n'}}));
   assert.equal(await page.evaluate(()=>window.__v6cm6.dirty),true);
   assert.equal(readFileSync(documentPath,'utf8'),source);
   serveUpgrade=true;
   await page.waitForFunction(()=>window.__releaseTestLoads>=2,null,{timeout:30000});
   await page.waitForFunction(()=>window.__v6cm6?.view?.state?.doc?.length>500,null,{timeout:80000});
   assert.equal(await page.evaluate(()=>window.__v6cm6.dirty),false,'reloaded Main uses persisted document');
   assert.equal(dialogCount,0,'unsaved beforeunload must not block authorized Main auto-update');
   assert.equal(readFileSync(documentPath,'utf8'),source,'auto-update must not save scratch edits');
   assert.deepEqual(errors,[]);
   console.log('MAIN_DEV_DIRTY_AUTO_RELEASE_PASS',name,{upgradeServed,autoReload:true,
     unsavedDirtyBefore:true,dialogCount,persistedFileUntouched:true});
  }finally{await browser.close();}
 }
}finally{host.kill('SIGTERM');rmSync(dir,{recursive:true,force:true});}
