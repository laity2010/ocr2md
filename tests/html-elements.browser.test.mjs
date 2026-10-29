/** Real Chrome/WebKit AG integration: HTML scope/filter and WCP source focus. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium,webkit} from 'playwright';
const source=[
  '<!-- minerujson:block:v1:0:0 -->','# Chapter One','','A <sup class="note">1</sup> citation.','',
  '<!--ocr2md:note-ref id="1"-->','',
  '```html','<div>not an HTML node</div>','```','',
  '<!-- minerujson:block:v1:1:0 -->','# Chapter Two','',
  '<table>','<tr><td title="a > b">value</td></tr>','</table>','',
  ...Array.from({length:45},(_,i)=>'Another paragraph '+i+' of content to permit scrolling.'),'',
  '<!-- minerujson:source:v1','<img src="not-an-element">','-->',''
].join('\n');
const tmp=mkdtempSync(join(tmpdir(),'ocr2md-html-location-'));
const file=join(tmp,'document.md');writeFileSync(file,source);
const port=5961,url='http://127.0.0.1:'+port;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1',
  '--port',String(port),'--strictPort'],{cwd:process.cwd(),env:{...process.env,V6_DOCUMENT_PATH:file},stdio:'ignore'});
try{
  let ready=false;
  for(let i=0;i<180;i++){
    try{ready=(await fetch(url)).ok;if(ready)break;}catch{}
    await new Promise(r=>setTimeout(r,100));
  }
  assert(ready,'isolated Vite server failed');
  for(const [name,engine,mobile] of [['Chrome',chromium,false],['iPad WebKit',webkit,true]]){
    const browser=await engine.launch({headless:true});
    try{
      const page=await browser.newPage({viewport:{width:1032,height:642},hasTouch:mobile,isMobile:mobile});
      await page.route('**/*',r=>r.request().url().startsWith(url)?r.continue():r.abort());
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
      await page.locator('.ocr-lab-element-select').waitFor({state:'attached',timeout:50000});
      await page.locator('.ocr-lab-element-select').evaluate(el=>{
        el.value='html';el.dispatchEvent(new Event('change',{bubbles:true}));
      });
      const grid=page.locator('.ocr-html-elements-grid');
      await page.waitForFunction(()=>window.__v6cm6?.scrollState &&
        document.querySelectorAll('.ocr-html-elements-grid .ag-row').length>=7,null,{timeout:50000});
      assert.equal(await page.locator('.ocr-html-elements-pane').isVisible(),true);
      assert.match(await grid.innerText(),/sup|table/);
      assert.equal(await grid.locator('.ag-header-cell-text').allTextContents().then(v=>v.includes('类型')),true);
      const types=await grid.locator('.ag-row [col-id="kind"]').allTextContents();
      assert(types.includes('单行')&&types.includes('开合'),'group type should have standalone and paired tags');
      const tableRow=grid.locator('.ag-row').filter({has:page.locator('.ag-cell[col-id="tag"]', {hasText:'table'})}).first();
      assert.equal(await tableRow.count(),1,'table opening and closing must share one AG row');
      assert.equal(await tableRow.locator('[col-id="openLine"] button').textContent(),'15');
      assert.equal(await tableRow.locator('[col-id="closeLine"] button').textContent(),'17');
      await tableRow.locator('[col-id="closeLine"] button').click();
      await page.waitForFunction(()=>window.__v6cm6?.scrollState?.focusTarget?.sourceLine===17,
        null,{timeout:14000});
      assert.equal(await tableRow.locator('[col-id="kind"]').textContent(),'开合');
      assert(!(/not an HTML node/.test(await grid.innerText())));
      const raw=await page.locator('.ocr-html-elements-grid .ag-row').allTextContents();
      assert(raw.some(text=>text.includes('<!-- -->')),'general and CMD HTML comments missing');
      // Explicit AG click uses shared focus, without changing the CMD Markdown.
      const td=page.locator('.ocr-html-elements-grid .ag-row').filter({hasText:'td'}).first();
      await td.click();
      await page.waitForFunction(()=>{
        const focus=window.__v6cm6?.scrollState?.focusTarget;
        return focus?.origin==='html' && focus.sourceLine===16;
      },null,{timeout:14000});
      await page.waitForFunction(()=>[...document.querySelectorAll('#editor .cm-outline-focused-line')]
        .some(el=>el.textContent.includes('title="a > b"')),null,{timeout:14000});
      assert.deepEqual(errors,[],name+' browser console errors');
      // Virtual chapter filtering uses the existing AG scope toggle, while
      // CMB source remains unchanged and all rows return when 全部 is checked.
      const sourceFiles=page.locator('.ocr-source-pane .ocr-lab-file-select');
      const virtual=await sourceFiles.locator('option[value^="virtual:"]').first().getAttribute('value');
      assert(virtual,'no virtual chapter file');
      await sourceFiles.evaluate((el,value)=>{
        el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));
      },virtual);
      await page.waitForFunction(()=>{
        const input=document.querySelector('.ocr-all-chapters-control input');
        return input&&!input.checked&&!input.disabled;
      },null,{timeout:15000});
      await page.waitForFunction(()=>document.querySelectorAll('.ocr-html-elements-grid .ag-row').length<7,
        null,{timeout:15000});
      const chapterRows=await page.locator('.ocr-html-elements-grid .ag-row').count();
      assert(chapterRows===3,'HTML chapter scope did not filter rows');
      await page.locator('.ocr-all-chapters-control input').check();
      await page.waitForFunction(()=>document.querySelectorAll('.ocr-html-elements-grid .ag-row').length>=7,
        null,{timeout:15000});
      const allRows=await page.locator('.ocr-html-elements-grid .ag-row').count();
      assert(allRows>chapterRows,'AG 全部 did not restore cross-chapter HTML rows');
      assert.equal(readFileSync(file,'utf8'),source,'HTML locator rewrote the source');
      console.log('HTML_AG_BROWSER_PASS',name,JSON.stringify({rows:raw.length,chapterRows,allRows,clickedLine:16,readOnly:true}));
    }finally{await browser.close();}
  }
}finally{server.kill('SIGTERM');assert.equal(readFileSync(file,'utf8'),source);rmSync(tmp,{recursive:true,force:true});}
