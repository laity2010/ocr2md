/** Real p6b6 logical-child regression, isolated conversion fixture and PDF.
 * Reparent the original physical p6b7 under p6b6 exactly as the user did.
 * Check 1 child boundary plus two distinct same-line OCR hyphen scars in AG.
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
const original=toMarkdown(readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8'));
const plan=planCMDReparentPBS(original,'p6b7','p6b6');
const seeded=[...plan.edits].sort((a,b)=>b.from-a.from).reduce((s,e)=>{
 assert.equal(s.slice(e.from,e.to),e.expected);return s.slice(0,e.from)+e.insert+s.slice(e.to);
},original);
const dir=mkdtempSync(join(tmpdir(),'ocr2md-p6b6-linebreak-'));
const doc=join(dir,'document.md'),token=join(dir,'token');
writeFileSync(doc,seeded);writeFileSync(token,'p6b6-test-token');
const port=await new Promise((ok,bad)=>{const srv=createServer();srv.once('error',bad);
  srv.listen(0,'127.0.0.1',()=>{const n=srv.address().port;srv.close(e=>e?bad(e):ok(n));});});
const base=`http://127.0.0.1:${port}/`;
const server=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),env:{...process.env,
  V6_PORT:String(port),V6_BIND:'127.0.0.1',V6_LAN_TLS_HOST:'',V6_LAB_ID:'',
  V6_DOCUMENT_PATH:doc,V6_PDF_PATH:resolve('.v6/workspace/buffetts-alpha.original.pdf'),
  V6_STATIC_ROOT:resolve('dist'),V6_SETTINGS_PATH:join(dir,'settings.json'),
  V6_TOKEN_PATH:token},stdio:'ignore'});
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
const rowsFromDOM=page=>page.locator('.ocr-illegal-break-grid .ag-row').evaluateAll(nodes=>nodes.map(node=>{
  const cell=id=>node.querySelector(`.ag-cell[col-id="${id}"]`)?.textContent.trim()||'';
  return {block:cell('blockId'),next:cell('nextBlockId'),joined:cell('joined'),
    status:cell('markState'),reason:cell('reason'),line:cell('line')};
}));
async function filterP6B6(page){
  const button=page.locator('.ocr-illegal-break-grid .ag-header-cell[col-id="blockId"] .ag-header-cell-filter-button');
  await button.click();
  const popup=page.locator('.ocr-enum-filter[aria-label="当前块 筛选"]:visible');
  await popup.waitFor({timeout:12000});
  assert.equal(await popup.locator('[data-filter-value="p6b6s0"]').count(),1);
  assert.equal(await popup.locator('[data-filter-value="p6b6s1"]').count(),1);
  await popup.locator('[data-filter-value="all"] input').uncheck();
  await popup.locator('[data-filter-value="p6b6s0"] input').check();
  await popup.locator('[data-filter-value="p6b6s1"] input').check();
  await page.waitForFunction(()=>document.querySelectorAll('.ocr-illegal-break-grid .ag-row').length===3,
    null,{timeout:18000});
  await page.locator('.ocr-illegal-break-grid .ag-header-cell[col-id="line"]').click();
}
try{
  let ready=false;
  for(let i=0;i<200;i++){
    try{if((await fetch(base+'healthz')).ok){ready=true;break;}}catch{}
    await sleep(170);
  }
  assert(ready,'isolated p6b6 test server unavailable');
  for(const [name,engine,binary] of [['Chrome',chromium,chromeExecutable()],
    ['iPad-WebKit',webkit,webkit.executablePath()]]){
    if(process.env.ONE_BROWSER&&process.env.ONE_BROWSER!==name)continue;
    writeFileSync(doc,seeded);
    const browser=await engine.launch({headless:true,...(binary?{executablePath:binary}:{})});
    try{
      const page=await browser.newPage({...devices['iPad Pro 11 landscape'],
        viewport:{width:1280,height:950}});
      page.setDefaultTimeout(35000);
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      try{
        await page.context().addCookies([{name:'v6edit',value:'p6b6-test-token',domain:'127.0.0.1',path:'/'}]);
        assert.equal((await page.goto(base,{waitUntil:'domcontentloaded',timeout:80000})).status(),200);
        await page.locator('#editor .cm-content').waitFor({state:'visible',timeout:95000});
        await page.locator('#module-select').evaluate(el=>{
          el.value='illegal-break';el.dispatchEvent(new Event('change',{bubbles:true}));
        });
        await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('待复核'),
          null,{timeout:90000});
        await filterP6B6(page);
        const rows=await rowsFromDOM(page);
        assert.deepEqual(rows.map(x=>[x.block,x.next,x.joined,x.status]),[
          ['p6b6s0','p6b6s1','about 3','待复核'],
          ['p6b6s1','','leverage','待复核'],
          ['p6b6s1','','insurance','待复核'],
        ]);
        assert.equal(rows[1].line,rows[2].line,'two OCR scars belong to same original source line');
        assert.equal(new Set(rows.map(x=>x.reason)).size,2);
        assert.equal(readFileSync(doc,'utf8'),seeded,'candidate scan must not autosave');
        const global=await page.locator('#status').textContent();
        assert(global.includes('待复核'),global);
        if(process.env.OCR_P6B6_SCREENSHOTS){
          mkdirSync(process.env.OCR_P6B6_SCREENSHOTS,{recursive:true});
          await page.screenshot({path:resolve(process.env.OCR_P6B6_SCREENSHOTS,
            `p6b6-illegal-break-${name}.png`),animations:'disabled'});
        }
        await page.locator('.ocr-illegal-break-grid .ag-row')
          .filter({has:page.locator('.ag-cell[col-id="joined"]:text-is("leverage")')})
          .locator('.ocr-illegal-break-jump').click();
        await page.waitForFunction(()=>document.querySelector('#editor .cm-content')?.textContent.includes('lever- age'),
          null,{timeout:18000});
        assert.equal(readFileSync(doc,'utf8').split('<!--ocr2md:illegal-break').length-1,0,
          'all three suspicious p6b6 splits are review-only and never auto-tagged');
        await page.reload({waitUntil:'domcontentloaded'});
        await page.locator('#editor .cm-content').waitFor({state:'visible',timeout:70000});
        await page.locator('#module-select').evaluate(el=>{
          el.value='illegal-break';el.dispatchEvent(new Event('change',{bubbles:true}));
        });
        await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('待复核'),
          null,{timeout:70000});
        await filterP6B6(page);
        assert.deepEqual((await rowsFromDOM(page)).map(x=>x.joined),
          ['about 3','leverage','insurance'],'candidate review restored after reload');
        assert.deepEqual(errors,[]);
        console.log('P6B6_ILLEGAL_BREAK_AG_PASS',name,'about 3, leverage, insurance; no CMD tag; reload restored');
      }finally{await page.close();}
    }finally{await browser.close();}
  }
}finally{server.kill('SIGTERM');rmSync(dir,{recursive:true,force:true});}
