/** Live CMD annotation -> PDF subregion source navigation, isolated fixture.
 * This test must never modify the actual user mother document. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium,webkit} from 'playwright';
const original=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8');
const temp=mkdtempSync(join(tmpdir(),'ocr2md-subblock-browser-'));
const doc=join(temp,'document.md');writeFileSync(doc,original);
const port=5978,url=`http://127.0.0.1:${port}/`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1',
  '--port',String(port),'--strictPort'],{cwd:process.cwd(),stdio:'ignore',
  env:{...process.env,V6_DOCUMENT_PATH:doc,V6_SETTINGS_PATH:join(temp,'settings.json')}});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try{
  let ready=false;
  for(let i=0;i<230;i++){
    try{if((await fetch(url)).ok){ready=true;break;}}catch{}
    await delay(150);
  }
  assert(ready,'isolated fixture server unavailable');
  for(const [name,engine,mobile] of [['Chrome',chromium,false],['iPad-WebKit',webkit,true]]){
    if(process.env.ONE_BROWSER&&process.env.ONE_BROWSER!==name)continue;
    const browser=await engine.launch({headless:true});
    try{
      const page=await browser.newPage({viewport:{width:1220,height:840},isMobile:mobile,hasTouch:mobile});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(url,{waitUntil:'domcontentloaded',timeout:50000});
      await page.locator('.ocr-lab-ag-toolbar .ocr-navigation-elements .ts-control').evaluate(e=>e.click());
      await page.locator('.ocr-navigation-popup-elements:visible [data-value="text-block"]').evaluate(e=>e.click());
      await page.waitForFunction(()=>document.querySelectorAll('.ocr-pdf-block-cover').length===224,
        null,{timeout:40000});
      await page.locator('#ag-functions-toggle').evaluate(e=>e.click());
      const annotate=page.locator('#ag-functions-menu button').filter({hasText:'标定原始子块'});
      assert.equal(await annotate.count(),1);
      await annotate.evaluate(e=>e.click());
      // Status messages are transient on iPad Safari; assert operation
      // completion and persisted source rather than polling UI status text.
      await page.waitForFunction(()=>{
        const b=[...document.querySelectorAll('#ag-functions-menu button')]
          .find(el=>el.textContent.includes('标定原始子块'));
        return b&&!b.disabled;
      },null,{timeout:32000});
      assert.equal(readFileSync(doc,'utf8'),original,'marking CMD is unsaved and cannot edit disk');
      await page.locator('#save').evaluate(e=>e.click());
      await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('已保存'),
        null,{timeout:23000});
      const after=readFileSync(doc,'utf8');
      for(const path of ['0','1','2']){
        assert(after.includes(`<!-- minerujson:subblock:v1:4:0:${path} -->`));
      }
      assert.equal((after.match(/<!-- minerujson:subblock:v1:/g)||[]).length,43);
      assert.equal((after.match(/<!-- minerujson:block:v1:/g)||[]).length,224);
      // Actual PDF click must navigate to each distinct child marker in CMD,
      // with its own highlight, while retaining exactly one parent checkbox.
      await page.locator('.ocr-preview-switchbar .ocr-navigation-preview .ts-control').evaluate(e=>e.click());
      await page.locator('.ocr-navigation-popup-preview:visible [data-value="pdf"]').evaluate(e=>e.click());
      const region=page.locator('.ocr-pdf-block-cover[data-block-id="p4b0"]');
      await region.scrollIntoViewIfNeeded({timeout:24000});
      await page.waitForFunction(()=>document.querySelector(
        '.ocr-pdf-block-cover[data-block-id="p4b0"]')?.closest('.page')
        ?.querySelector('canvas')?.width>0,null,{timeout:27000});
      assert.equal(await region.locator('.ocr-pdf-block-ctrl input').count(),1);
      const lines=after.split('\n');
      for(const [role,partIndex,pathIndex] of [
        ['caption',0,0],['body',-1,1],['note',1,2]]){
        const expected=lines.findIndex(line=>line.includes(
          `<!-- minerujson:subblock:v1:4:0:${pathIndex} -->`))+1;
        assert(expected>0);
        const coords=await region.evaluate((node,index)=>{
          const element=index<0?node:node.querySelectorAll(':scope > .ocr-pdf-block-fragment')[index];
          const r=element.getBoundingClientRect();
          return {x:r.left+r.width/2,y:r.top+r.height/2};
        },partIndex);
        await region.evaluate((node,xy)=>{
          node.closest('.page').querySelector('canvas').dispatchEvent(
            new MouseEvent('click',{bubbles:true,clientX:xy.x,clientY:xy.y}));
        },coords);
        await page.waitForFunction(expectedRole=>document.querySelector('.ocr-pdf-region-overlay')
          ?.dataset.partRole===expectedRole,role,{timeout:12000});
        const location=await page.evaluate(async()=>{
          const {viewStore}=await import('/view-store.js');
          return viewStore.getState().focusTarget;
        });
        assert.equal(location?.sourceLine,expected,`${name} PDF ${role} did not locate exact subblock tag`);
      }
      // Undo exactly one CMD transaction; no hidden edits or OCR changes.
      await page.locator('#undo').evaluate(e=>e.click());
      await page.locator('#save').evaluate(e=>e.click());
      await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('已保存'),
        null,{timeout:23000});
      assert.equal(readFileSync(doc,'utf8'),original,'one Undo restores byte-identical CMD source');
      assert.deepEqual(errors,[]);
      console.log('PDF_SUBBLOCK_ANNOTATION_PASS',name,{children:43,parents:20,undo:true,
        originalUnchanged:true,autoSave:false});
    }finally{await browser.close();writeFileSync(doc,original);}
  }
}finally{server.kill('SIGTERM');rmSync(temp,{recursive:true,force:true});}
