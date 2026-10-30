/** Real Buffett fixture: one legacy CMD mark, explicit rescan adds next rule. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,rmSync,mkdtempSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium,webkit} from 'playwright';
import nspell from 'nspell';
import {detectIllegalBreaks,planIllegalBreakMarks,LINEBREAK_TAG} from '../ui/cmd-linebreak.js';
import {formatAnnotation} from '../ui/cmd-annotations.js';
const source=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8');
const dictionary=nspell(readFileSync('node_modules/dictionary-en/index.aff'),readFileSync('node_modules/dictionary-en/index.dic'));
const found=detectIllegalBreaks(source,dictionary,{bodyEnd:source.indexOf('<!-- minerujson:source:v1')});
assert.deepEqual(found.issues.map(x=>x.joined),['about 3','latest 13F']);
const old=planIllegalBreakMarks(source,found.issues.filter(x=>x.joined==='about 3'),[])[0];
const seeded=source.slice(0,old.at)+formatAnnotation(old.tag,old.attributes)+source.slice(old.at);
const dir=mkdtempSync(join(tmpdir(),'ocr2md-real-break-rescan-'));
const doc=join(dir,'document.md'),settings=join(dir,'settings.json'),token=join(dir,'token');
writeFileSync(settings,'{}');writeFileSync(token,'break-real-fixture');
const port=5978,base=`http://127.0.0.1:${port}`;
const production=process.env.LINEBREAK_PRODUCTION==='1';
const server=production
 ?spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),stdio:'ignore',env:{...process.env,
  V6_PORT:String(port),V6_BIND:'127.0.0.1',V6_LAN_TLS_HOST:'',V6_DOCUMENT_PATH:doc,
  V6_SETTINGS_PATH:settings,V6_TOKEN_PATH:token,V6_STATIC_ROOT:resolve('dist')}})
 :spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{
  cwd:process.cwd(),stdio:'ignore',env:{...process.env,V6_DOCUMENT_PATH:doc}});
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
async function select(page,value){
  await page.locator('.ocr-lab-ag-toolbar .ocr-navigation-elements .ts-control').click();
  await page.locator(`.ocr-navigation-popup-elements:visible [data-value="${value}"]`).click();
  await page.waitForFunction(v=>document.querySelector('#module-select')?.value===v,value);
}
try{
 let ready=false;
 for(let i=0;i<150;i++){try{if((await fetch(base)).ok){ready=true;break}}catch{}await sleep(100)}
 assert(ready,'isolated browser server failed to start');
 for(const [label,engine,mobile] of [['Chrome',chromium,false],['iPad-WebKit',webkit,true]]){
   writeFileSync(doc,seeded);
   const browser=await engine.launch({headless:true});
   try{
     const context=await browser.newContext({viewport:{width:1110,height:800},hasTouch:mobile,isMobile:mobile});
     await context.addInitScript(()=>{
       window.__rescanCount=0;const WorkerBase=window.Worker;
       window.Worker=class extends WorkerBase{postMessage(arg,...rest){
         if(arg?.kind==='linebreak')window.__rescanCount++;
         return super.postMessage(arg,...rest);
       }};
     });
     if(production)await context.addCookies([{name:'v6edit',value:'break-real-fixture',domain:'127.0.0.1',path:'/'}]);
     const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
     await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
     await page.goto(base,{waitUntil:'domcontentloaded',timeout:65000});
     await page.locator('#editor .cm-content').waitFor({state:'visible',timeout:50000});
     await select(page,'illegal-break');
     await page.waitForFunction(()=>document.querySelectorAll('.ocr-illegal-break-grid .ag-row').length===1,null,{timeout:16000});
     assert.equal(await page.evaluate(()=>window.__rescanCount),0,'old CMD mark unexpectedly re-scanned');
     assert.equal(readFileSync(doc,'utf8'),seeded,'opening old mark modified persisted source');
     await page.locator('#ag-functions-toggle').click();
     await page.locator('#illegal-break-rescan').click();
     await page.waitForFunction(()=>document.querySelectorAll('.ocr-illegal-break-grid .ag-row').length===2,null,{timeout:55000});
     assert.equal(await page.evaluate(()=>window.__rescanCount),1,'explicit action should scan exactly once');
     const joined=(await page.locator('.ocr-illegal-break-grid .ag-cell[col-id="joined"]').allTextContents()).sort();
     assert.deepEqual(joined,['about 3','latest 13F']);
     assert.equal(readFileSync(doc,'utf8'),seeded,'rescan silently saved');
     await page.locator('#save').click();
     for(let i=0;i<90&&readFileSync(doc,'utf8').split('<!--'+LINEBREAK_TAG).length-1!==2;i++)await sleep(100);
     assert.equal(readFileSync(doc,'utf8').split('<!--'+LINEBREAK_TAG).length-1,2,'should have two deduplicated CMD annotations');
     await page.reload({waitUntil:'domcontentloaded'});
     await page.locator('#editor .cm-content').waitFor({state:'visible',timeout:50000});
     await select(page,'illegal-break');
     await page.waitForFunction(()=>document.querySelectorAll('.ocr-illegal-break-grid .ag-row').length===2,null,{timeout:20000});
     assert.equal(await page.evaluate(()=>window.__rescanCount),0,'persisted newer mark triggered re-scan');
     assert.deepEqual(errors,[],label+' runtime errors');
     console.log('REAL_BUFFETT_BREAK_RESCAN_PASS',label,{savedMarks:2,scansAfterReload:0});
   }finally{await browser.close();}
 }
}finally{server.kill('SIGTERM');await sleep(160);rmSync(dir,{recursive:true,force:true});}
