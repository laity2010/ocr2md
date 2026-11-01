/** Real PDF.js selection -> original text layer -> exact CM6 Block replacement.
 * Isolated source and server: test NEVER edits the user's mother document.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium,webkit} from 'playwright';
const source=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8');
const temp=mkdtempSync(join(tmpdir(),'ocr2md-pdf-replace-'));
const doc=join(temp,'document.md');writeFileSync(doc,source);
const port=5967,url=`http://127.0.0.1:${port}/`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1',
  '--port',String(port),'--strictPort'],{cwd:process.cwd(),stdio:'ignore',
  env:{...process.env,V6_DOCUMENT_PATH:doc,V6_SETTINGS_PATH:join(temp,'settings.json')}});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try{
  let ready=false;
  for(let i=0;i<210;i++){
    try{if((await fetch(url)).ok){ready=true;break;}}catch{}
    await delay(150);
  }
  assert(ready,'Vite isolated fixture unavailable');
  for(const [name,engine,mobile] of [['Chrome',chromium,false],['iPad-WebKit',webkit,true]]){
    if(process.env.ONE_BROWSER&&process.env.ONE_BROWSER!==name)continue;
    const browser=await engine.launch({headless:true});
    try{
      const page=await browser.newPage({viewport:{width:1220,height:840},isMobile:mobile,hasTouch:mobile});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(url,{waitUntil:'domcontentloaded',timeout:50000});
      await page.locator('.ocr-preview-switchbar .ocr-navigation-preview .ts-control').evaluate(el=>el.click());
      await page.locator('.ocr-navigation-popup-preview:visible [data-value="pdf"]').evaluate(el=>el.click());
      const button=page.locator('.ocr-pdf-extract-text');
      assert(await button.isDisabled(),'button starts disabled without selection');
      await page.waitForFunction(()=>document.querySelectorAll('.ocr-pdf-block-cover').length===224,
        null,{timeout:40000});
      // Clicking inside the visual PDF block is real source-line positioning,
      // not an invented direct PDF.js selected assignment.
      await page.locator('.ocr-pdf-block-cover[data-block-id="p16b0"]')
        .scrollIntoViewIfNeeded({timeout:22000});
      await page.waitForFunction(()=>document.querySelector(
        '.ocr-pdf-block-cover[data-block-id="p16b0"]')?.closest('.page')
        ?.querySelector('canvas')?.width>0,null,{timeout:25000});
      await page.locator('.ocr-pdf-block-cover[data-block-id="p16b0"]').evaluate(node=>{
        const page=node.closest('.page'),canvas=page.querySelector('canvas');
        const rect=node.getBoundingClientRect();
        canvas.dispatchEvent(new MouseEvent('click',{bubbles:true,
          clientX:rect.left+rect.width/2,clientY:rect.top+rect.height/2}));
      });
      await page.waitForFunction(()=>!document.querySelector('.ocr-pdf-extract-text')?.disabled,
        null,{timeout:28000});
      assert.match(await button.getAttribute('title'),/PDF 原文字层/);
      await button.evaluate(el=>el.click());
      await page.waitForFunction(()=>document.querySelector('.ocr-pdf-status')?.textContent?.includes('已提取'),
        null,{timeout:30000});
      assert.equal(readFileSync(doc,'utf8'),source,'must not auto-save CMD');
      await page.locator('#save').evaluate(el=>el.click());
      await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('已保存'),
        null,{timeout:22000});
      const after=readFileSync(doc,'utf8');
      assert(after.includes('Buffett has experienced. Indeed, because Buffett became'),
        'PDF native text was not substituted');
      assert(!after.includes('that even Bufet has experienced. Indeed, because Bufet became'),
        'old OCR text still in target Block');
      assert(after.includes('<!-- minerujson:block:v1:16:0 -->'));
      assert.equal(after.slice(after.indexOf('<!-- minerujson:source:v1:')),
        source.slice(source.indexOf('<!-- minerujson:source:v1:')),
        'sealed MinerU evidence must remain byte-identical');
      await page.locator('#undo').evaluate(el=>el.click());
      await page.waitForFunction(()=>document.querySelector('.ocr-pdf-status')?.textContent?.includes('已提取')||
        document.querySelector('#status')?.textContent?.includes('Undo'),null,{timeout:2000}).catch(()=>{});
      await page.locator('#save').evaluate(el=>el.click());
      await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('已保存'),
        null,{timeout:22000});
      assert.equal(readFileSync(doc,'utf8'),source,'one Undo must restore byte-identical CMD');
      assert.deepEqual(errors,[]);
      console.log('PDF_TEXT_EXTRACT_REPLACE_PASS',name,{block:'p16b0',
        before:source.length,after:after.length,undo:true,autoSave:false});
    }finally{await browser.close();writeFileSync(doc,source);}
  }
}finally{server.kill('SIGTERM');rmSync(temp,{recursive:true,force:true});}
