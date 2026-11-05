/** WCP: AG line click for a late-page p8b3s0 break must leave a *visible*
 * CM6 source line, not an empty virtualized viewport. Real MinerU source
 * converted into a disposable CMD document, isolated per browser.
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
const operation=planCMDReparentPBS(original,'p8b4','p8b3');
const seeded=[...operation.edits].sort((a,b)=>b.from-a.from).reduce((s,e)=>{
  assert.equal(s.slice(e.from,e.to),e.expected);return s.slice(0,e.from)+e.insert+s.slice(e.to);
},original);
const dir=mkdtempSync(join(tmpdir(),'ocr2md-cm6-visible-focus-'));
const doc=join(dir,'doc.md');writeFileSync(doc,seeded);
const port=await new Promise((ok,bad)=>{const s=createServer();s.once('error',bad);
  s.listen(0,'127.0.0.1',()=>{const n=s.address().port;s.close(e=>e?bad(e):ok(n));});});
const base=`http://127.0.0.1:${port}/`;
const server=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),env:{...process.env,
  V6_PORT:String(port),V6_BIND:'127.0.0.1',V6_LAN_TLS_HOST:'',V6_LAB_ID:'',
  V6_DOCUMENT_PATH:doc,V6_PDF_PATH:resolve('.v6/workspace/buffetts-alpha.original.pdf'),
  V6_STATIC_ROOT:resolve('dist'),V6_SETTINGS_PATH:join(dir,'settings.json'),
  V6_TOKEN_PATH:join(dir,'token')},stdio:'ignore'});
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
const visibleSource=page=>page.evaluate(()=>{
  const scroll=document.querySelector('#editor .cm-scroller');
  const bounds=scroll?.getBoundingClientRect();
  if(!bounds||bounds.height<100)return {visible:false,why:'source pane has no height'};
  const rendered=[...document.querySelectorAll('#editor .cm-line')].filter(node=>{
    const r=node.getBoundingClientRect();
    return r.bottom>bounds.top+2&&r.top<bounds.bottom-2&&
      node.textContent.trim().length>=8;
  });
  const focused=rendered.filter(node=>node.textContent.includes('To evaluate Bufet'));
  return {visible:focused.length>0,sourceLines:rendered.length,
    focusText:focused[0]?.textContent.slice(0,110)||'',scrollTop:scroll.scrollTop,
    paneHeight:bounds.height,global:document.querySelector('#status')?.textContent,
    pdfId:document.querySelector('.ocr-pdf-region-overlay')?.dataset.pbsId||null};
});
try{
  let ready=false;
  for(let i=0;i<230;i++){try{if((await fetch(base+'healthz')).ok){ready=true;break;}}catch{}
    await sleep(150);}
  assert(ready,'isolated browser service did not start');
  for(const [name,engine,binary] of [['Chrome',chromium,chromeExecutable()],
    ['iPad-WebKit',webkit,webkit.executablePath()]]){
    if(process.env.ONE_BROWSER&&name!==process.env.ONE_BROWSER)continue;
    writeFileSync(doc,seeded);
    const browser=await engine.launch({headless:true,...(binary?{executablePath:binary}:{})});
    try{
      // Approximate the user's three-pane Safari height (source ≈300 CSS px).
      const page=await browser.newPage({...devices['iPad Pro 11 landscape'],
        viewport:{width:1536,height:740}});
      page.setDefaultTimeout(35000);
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      try{
        assert.equal((await page.goto(base,{waitUntil:'domcontentloaded',timeout:95000})).status(),200);
        await page.locator('#editor .cm-content').waitFor({state:'visible',timeout:85000});
        await page.locator('#module-select').evaluate(el=>{
          el.value='illegal-break';el.dispatchEvent(new Event('change',{bubbles:true}));
        });
        await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('待复核'),
          null,{timeout:85000});
        await page.locator('.ocr-illegal-break-grid .ag-header-cell[col-id="blockId"] .ag-header-cell-filter-button').click();
        const filter=page.locator('.ocr-enum-filter[aria-label="当前块 筛选"]:visible');
        await filter.waitFor();
        await filter.locator('[data-filter-value="all"] input').uncheck();
        await filter.locator('[data-filter-value="p8b3s0"] input').check();
        await page.locator('.ocr-illegal-break-grid .ag-header-cell[col-id="line"]').click();
        const row=page.locator('.ocr-illegal-break-grid .ag-row')
          .filter({has:page.locator('.ag-cell[col-id="joined"]:text-is("portfolio")')});
        await row.waitFor();
        const targetLine=Number(await row.locator('.ocr-illegal-break-jump').textContent());
        assert(targetLine>1000,'regression must exercise late-page virtualized source');
        await row.locator('.ocr-illegal-break-jump').click();
        // The row exists in the full CM6 document at all times; that alone
        // doesn't imply that the source is *visibly painted in its pane*.
        await page.waitForFunction(()=>{
          const scroll=document.querySelector('#editor .cm-scroller');
          if(!scroll)return false;
          const viewport=scroll.getBoundingClientRect();
          return [...document.querySelectorAll('#editor .cm-line')].some(node=>{
            const rect=node.getBoundingClientRect();
            return rect.bottom>viewport.top+2&&rect.top<viewport.bottom-2&&
              node.textContent.includes('To evaluate Bufet');
          });
        },null,{timeout:18000});
        const observed=await visibleSource(page);
        assert(observed.visible&&observed.sourceLines>0,JSON.stringify(observed));
        assert.equal(observed.pdfId,'p8b3s0',JSON.stringify(observed));
        assert.equal(readFileSync(doc,'utf8'),seeded,'focus must not auto-save');
        if(process.env.OCR_BREAK_SOURCE_SCREENSHOTS){
          mkdirSync(process.env.OCR_BREAK_SOURCE_SCREENSHOTS,{recursive:true});
          await page.screenshot({path:resolve(process.env.OCR_BREAK_SOURCE_SCREENSHOTS,
            `source-visible-${name}.png`),animations:'disabled'});
        }
        assert.deepEqual(errors,[]);
        console.log('ILLEGAL_BREAK_SOURCE_VISIBLE_PASS',name,targetLine,
          JSON.stringify({height:observed.paneHeight,sourceLines:observed.sourceLines,pdfId:observed.pdfId}));
      }finally{await page.close();}
    }finally{await browser.close();}
  }
}finally{server.kill('SIGTERM');rmSync(dir,{recursive:true,force:true});}
