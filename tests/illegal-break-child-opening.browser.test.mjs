/** A non-capitalized prose child without a split word is still an AG review.
 * Real Buffett MinerU fixture, a disposable native reparent p13b4→p13b3,
 * Chrome/iPad-WebKit CM6/PDF/AG and refresh; no edits to user documents.
 */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {chromium,webkit,devices} from 'playwright';
import {chromeExecutable} from './platform.test-helper.mjs';
import {toMarkdown} from '../packages/minerujson-md/dist/index.js';
import {planCMDReparentPBS} from '../ui/cmd-block-chains.js';
const o=toMarkdown(readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8'));
const reparent=planCMDReparentPBS(o,'p13b4','p13b3');
const seeded=[...reparent.edits].sort((a,b)=>b.from-a.from).reduce((s,e)=>{
  assert.equal(s.slice(e.from,e.to),e.expected);return s.slice(0,e.from)+e.insert+s.slice(e.to);
},o);
const dir=mkdtempSync(join(tmpdir(),'ocr2md-child-opening-'));
const doc=join(dir,'doc.md');writeFileSync(doc,seeded);
const port=await new Promise((resolve,reject)=>{const net=createServer();net.once('error',reject);
  net.listen(0,'127.0.0.1',()=>{const n=net.address().port;net.close(e=>e?reject(e):resolve(n));});});
const base=`http://127.0.0.1:${port}/`;
const server=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),env:{...process.env,
 V6_PORT:String(port),V6_BIND:'127.0.0.1',V6_LAN_TLS_HOST:'',V6_LAB_ID:'',
 V6_DOCUMENT_PATH:doc,V6_PDF_PATH:resolve('.v6/workspace/buffetts-alpha.original.pdf'),
 V6_STATIC_ROOT:resolve('dist'),V6_SETTINGS_PATH:join(dir,'settings.json'),
 V6_TOKEN_PATH:join(dir,'token')},stdio:'ignore'});
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
async function filterCurrentChild(page){
  const column=page.locator('.ocr-illegal-break-grid .ag-header-cell[col-id="blockId"] .ag-header-cell-filter-button');
  await column.click();
  const filter=page.locator('.ocr-enum-filter[aria-label="当前块 筛选"]:visible');
  await filter.waitFor();
  await filter.locator('[data-filter-value="all"] input').uncheck();
  await filter.locator('[data-filter-value="p13b3s1"] input').check();
  await page.waitForFunction(()=>document.querySelectorAll('.ocr-illegal-break-grid .ag-row').length===2,
    null,{timeout:18000});
  await page.locator('.ocr-illegal-break-grid .ag-header-cell[col-id="line"]').click();
}
const getRows=page=>page.locator('.ocr-illegal-break-grid .ag-row').evaluateAll(els=>els.map(node=>{
 const cell=id=>node.querySelector(`.ag-cell[col-id="${id}"]`)?.textContent.trim()||'';
 return {block:cell('blockId'),page:cell('pdfPage'),previous:cell('previousBlockId'),
   joined:cell('joined'),scope:cell('scopeLabel'),status:node.querySelector('.ocr-illegal-break-review-select')?.value||'',reason:cell('reason')};
}));
try{
 let ready=false;
 for(let i=0;i<200;i++){try{if((await fetch(base+'healthz')).ok){ready=true;break;}}catch{} await sleep(140);}
 assert(ready,'isolated OCR2MD service unavailable');
 for(const [name,engine,binary] of [['Chrome',chromium,chromeExecutable()],
   ['iPad-WebKit',webkit,webkit.executablePath()]]){
   if(process.env.ONE_BROWSER&&process.env.ONE_BROWSER!==name)continue;
   writeFileSync(doc,seeded);
   const browser=await engine.launch({headless:true,...(binary?{executablePath:binary}:{})});
   try{
     const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1408,height:900}});
     page.setDefaultTimeout(32000);
     const errors=[];page.on('pageerror',error=>errors.push(error.message));
     try{
       assert.equal((await page.goto(base,{waitUntil:'domcontentloaded',timeout:85000})).status(),200);
       await page.locator('#editor .cm-content').waitFor({state:'visible',timeout:90000});
       const activate=()=>page.locator('#module-select').evaluate(el=>{
         el.value='illegal-break';el.dispatchEvent(new Event('change',{bubbles:true}));
       });
       await activate();
       await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('待复核'),
         null,{timeout:75000});
       await filterCurrentChild(page);
       const rows=await getRows(page);
       const opening=rows.find(row=>row.joined.startsWith('initially'));
       assert(opening,'non-capitalized prose child must be in AG even without a hyphen');
       assert.equal(opening.block,'p13b3s1');
       assert.equal(opening.page,'14');
       assert.equal(opening.previous,'p13b3s0');
       assert.equal(opening.scope,'子块起始');
       assert.equal(opening.status,'待定');
       assert.match(opening.reason,/跨栏/);
       assert.equal(rows.length,2);
       const row=page.locator('.ocr-illegal-break-grid .ag-row').filter({
         has:page.locator('.ag-cell[col-id="joined"]:text-is("initially, transaction costs were probably")')});
       await row.locator('.ocr-illegal-break-jump').click();
       await page.waitForFunction(()=>{
         const sc=document.querySelector('#editor .cm-scroller');if(!sc)return false;
         const rect=sc.getBoundingClientRect();
         return [...document.querySelectorAll('#editor .cm-line')].some(e=>{
           const line=e.getBoundingClientRect();return line.bottom>rect.top&&line.top<rect.bottom&&
             e.textContent.includes('initially, transaction costs');
         });
       },null,{timeout:20000});
       assert.equal(readFileSync(doc,'utf8'),seeded,'review must not autosave or mark CMD');
       if(process.env.OCR_CHILD_OPENING_SCREENSHOTS){
         mkdirSync(process.env.OCR_CHILD_OPENING_SCREENSHOTS,{recursive:true});
         await page.screenshot({path:resolve(process.env.OCR_CHILD_OPENING_SCREENSHOTS,
           `child-opening-${name}.png`),animations:'disabled'});
       }
       await page.reload({waitUntil:'domcontentloaded'});
       await page.locator('#editor .cm-content').waitFor({state:'visible',timeout:70000});
       await activate();
       await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('待复核'),
         null,{timeout:70000});
       await filterCurrentChild(page);
       assert((await getRows(page)).some(x=>x.joined.startsWith('initially')&&x.status==='待定'));
       assert.deepEqual(errors,[]);
       console.log('CHILD_OPENING_AG_VISIBLE_PASS',name,'p13b3s1 initially, PDF14, CM6 visible, no source change, reload restored');
     }finally{await page.close();}
   }finally{await browser.close();}
 }
}finally{server.kill('SIGTERM');rmSync(dir,{recursive:true,force:true});}
