/** Real toolbar/pagechanging -> Workspace scalar port -> text-block AG filter.
 * Isolated disposable document; original OCR, CMD, and PDF stay read-only.
 */
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {chromium,webkit,devices} from 'playwright';
import {chromeExecutable} from './platform.test-helper.mjs';
import {toMarkdown} from '../packages/minerujson-md/dist/index.js';
import {selectPreview} from './navigation-ui.test-helper.mjs';

const source=toMarkdown(readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8'));
const dir=mkdtempSync(join(tmpdir(),'ocr2md-ag-page-'));
const doc=join(dir,'document.md');writeFileSync(doc,source);
const port=await new Promise((ok,fail)=>{const s=createServer();s.once('error',fail);
  s.listen(0,'127.0.0.1',()=>{const n=s.address().port;s.close(e=>e?fail(e):ok(n));});});
const base=`http://127.0.0.1:${port}`;
const server=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),env:{...process.env,
  V6_PORT:String(port),V6_BIND:'127.0.0.1',V6_LAB_ID:'',V6_LAN_TLS_HOST:'',
  V6_DOCUMENT_PATH:doc,V6_PDF_PATH:resolve('.v6/workspace/buffetts-alpha.original.pdf'),
  V6_STATIC_ROOT:resolve('dist'),V6_SETTINGS_PATH:join(dir,'settings.json'),
  V6_TOKEN_PATH:join(dir,'token')},stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const current=page=>page.locator('.ocr-text-block-grid .ag-cell[col-id="pdfPage"]').allTextContents();
const waitPageCells=(page,number)=>page.waitForFunction(expected=>{
  const cells=[...document.querySelectorAll('.ocr-text-block-grid .ag-cell[col-id="pdfPage"]')];
  return cells.length>0&&cells.every(cell=>cell.textContent.trim()===String(expected));
},number,{timeout:30000});
const waitView=async(page,fragment)=>{
  try{return await page.waitForFunction(text=>
    document.querySelector('#status')?.textContent.includes(text),fragment,{timeout:20000});}
  catch(error){
    const info=await page.evaluate(()=>({
      status:document.querySelector('#status')?.textContent,
      pdfInput:document.querySelector('.ocr-pdf-page')?.value,
      pdfStatus:document.querySelector('.ocr-pdf-status')?.textContent,
      agRows:[...document.querySelectorAll('.ocr-text-block-grid .ag-cell[col-id="pdfPage"]')].slice(0,7).map(x=>x.textContent),
      module:document.querySelector('#module-select')?.value,
      all:document.querySelector('.ocr-all-chapters-control input')?.checked
    }));
    console.error('AG_PAGE_DIAGNOSTIC',fragment,JSON.stringify(info));throw error;
  }
};
try{
  let ready=false;
  for(let i=0;i<240;i++){try{if((await fetch(`${base}/healthz`)).ok){ready=true;break;}}catch{}await sleep(120);}
  assert(ready,'disposable page-filter server unavailable');
  for(const [name,engine,binary] of [['Chrome',chromium,chromeExecutable()],
    ['iPad-WebKit',webkit,webkit.executablePath()]]){
    if(process.env.ONE_BROWSER&&name!==process.env.ONE_BROWSER)continue;
    const browser=await engine.launch({headless:true,...(binary?{executablePath:binary}:{})});
    try{
      const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:900}});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      try{
        await page.goto(base,{waitUntil:'domcontentloaded',timeout:75000});
        await page.waitForFunction(()=>document.querySelector('.ocr-pdf-status')?.textContent==='就绪',null,{timeout:95000});
        await page.locator('#module-select').evaluate(el=>{el.value='text-block';el.dispatchEvent(new Event('change',{bubbles:true}));});
        await waitView(page,'AG 第 1 页');
        const toggle=page.locator('.ocr-all-chapters-control input');
        assert.equal(await toggle.isEnabled(),true,'文本块的「全部」在母文档必须可用');
        assert.equal(await toggle.isChecked(),false,'文本块默认跟随当前 PDF 页');
        const header=page.locator('.ocr-text-block-grid .ag-header-cell[col-id="pdfPage"]');
        assert.equal(await header.locator('.ag-header-cell-text').innerText(),'页码');
        assert.equal(await page.locator('.ocr-text-block-grid .ag-header-cell[col-id="pdfPage"]').count(),1);
        const openFilter=header.locator('.ag-header-cell-filter-button');
        await openFilter.waitFor({state:'visible',timeout:20000});
        await waitPageCells(page,1);
        // Real header interaction: all 22 page values must be offered, even
        // though the grid is currently showing page 1 only. No extra picker.
        await openFilter.click();
        const filter=page.locator('.ocr-enum-filter[aria-label="页码 筛选"]:visible');
        await filter.waitFor({state:'visible',timeout:12000});
        assert.equal(await filter.locator('[data-filter-value="1"] input').isChecked(),true);
        assert.equal(await filter.locator('[data-filter-value="2"] input').isChecked(),false);
        assert.equal(await filter.locator('[data-filter-value="22"] input').count(),1,
          'filter choices must include the last PDF page, not only current-page rowData');
        // Manual page 3, while PDF itself is still displaying page 1.
        await filter.locator('[data-filter-value="3"] input').check();
        await filter.locator('[data-filter-value="1"] input').uncheck();
        await waitPageCells(page,3);
        assert.equal(await toggle.isChecked(),false,'manually changing the column must not tick 全部');
        assert.equal(await page.locator('.ocr-pdf-page').inputValue(),'1',
          'AG page filter must not navigate the PDF');
        await selectPreview(page,'pdf');
        const pager=page.locator('.ocr-pdf-page');
        await page.locator('.ocr-pdf-scroller .page[data-page-number="2"]').scrollIntoViewIfNeeded({timeout:35000});
        await waitView(page,'AG 第 2 页');
        await waitPageCells(page,2);
        // PDF page navigation wins over the previous manual page-3 selection.
        await openFilter.click();
        await filter.waitFor({state:'visible'});
        assert.equal(await filter.locator('[data-filter-value="2"] input').isChecked(),true);
        assert.equal(await filter.locator('[data-filter-value="3"] input').isChecked(),false);
        await openFilter.click();
        await toggle.check();
        await waitView(page,'AG 全部页');
        assert((await current(page)).some(x=>x.trim()==='1'),'all mode restores page 1 rows');
        await page.locator('.ocr-pdf-scroller .page[data-page-number="3"]').scrollIntoViewIfNeeded({timeout:35000});
        await page.waitForFunction(()=>document.querySelector('.ocr-pdf-page')?.value==='3');
        assert.equal(await toggle.isChecked(),true,'scroll/page change preserves all mode');
        assert((await current(page)).some(x=>x.trim()==='1'),'all mode remains cross-page');
        await toggle.uncheck();
        await waitView(page,'AG 第 3 页');
        await waitPageCells(page,3);
        await page.locator('#module-select').evaluate(el=>{el.value='chapter-boundary';el.dispatchEvent(new Event('change',{bubbles:true}));});
        await page.waitForFunction(()=>document.querySelector('#module-select')?.value==='chapter-boundary');
        assert.equal(await toggle.isChecked(),true,'other AG module keeps chapter-wide semantics');
        assert.equal(await toggle.isDisabled(),true,'mother chapter index remains unchanged');
        assert.equal(readFileSync(doc,'utf8'),source,'AG page lens must never write CMD source');
        assert.deepEqual(errors,[]);
        console.log('TEXT_BLOCK_AG_PAGE_FILTER_BROWSER_PASS',name,'auto1→manual3→PDF2→all→PDF3→local3');
      }finally{await page.close();}
    }finally{await browser.close();}
  }
}finally{server.kill('SIGTERM');rmSync(dir,{recursive:true,force:true});}
