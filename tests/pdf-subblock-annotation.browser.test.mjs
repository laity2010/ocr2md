/** Live CMD annotation -> PDF subregion source navigation, isolated fixture.
 * This test must never modify the actual user mother document. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium,webkit} from 'playwright';
import {toMarkdown,toMineruJSON} from '../packages/minerujson-md/dist/index.js';
const raw=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8');
const original=toMarkdown(raw);
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
      await page.locator('.ocr-preview-switchbar .ocr-navigation-preview .ts-control').evaluate(e=>e.click());
      await page.locator('.ocr-navigation-popup-preview:visible [data-value="pdf"]').evaluate(e=>e.click());
      const coverToggle=page.locator('.ocr-preview-switchbar .ocr-preview-block-toggle input');
      if(!await coverToggle.isChecked())await coverToggle.evaluate(e=>e.click());
      await page.waitForFunction(()=>document.querySelectorAll('.ocr-pdf-block-cover').length===224,
        null,{timeout:40000});
      // Current sealed CMD conversion already contains native child anchors.
      // The retired PDF '自动补标' action must NOT be resurrected: all 43
      // child IDs exist before any gesture, with their sealed OCR source
      // unchanged. Child-region navigation is still live and independently
      // testable in PDF.js on both browser engines.
      assert.equal(await page.locator('.ocr-pdf-mark-subblocks').count(),0,
        'read-only milestone must not expose legacy automatic child writing');
      const after=await page.evaluate(()=>window.__v6cm6.cm.readSource());
      assert.equal(after,original,'opening PDF must not mutate sealed CMD');
      assert.equal(toMineruJSON(after),raw,'native child annotation must preserve original MinerU JSON');
      assert.equal((after.match(/<!-- cmd:block:v1 id="p\d+b\d+s\d+"/g)||[]).length,43);
      assert.equal((after.match(/<!-- cmd:block:v1 id="p\d+b\d+"/g)||[]).length,224);
      assert.equal(readFileSync(doc,'utf8'),original,'PDF navigation must not auto-save');
      // Real PDF clicks still navigate to three independent child source
      // scopes and each highlights its own original subregion rectangle.
      const region=page.locator('.ocr-pdf-block-cover[data-block-id="p4b0"]');
      await region.scrollIntoViewIfNeeded({timeout:24000});
      await page.waitForFunction(()=>document.querySelector(
        '.ocr-pdf-block-cover[data-block-id="p4b0"]')?.closest('.page')
        ?.querySelector('canvas')?.width>0,null,{timeout:27000});
      assert.equal(await region.locator('.ocr-pdf-block-ctrl input').count(),1);
      const lines=after.split('\n');
      for(const [role,partIndex,pathIndex] of [
        ['caption',0,0],['body',1,1],['note',2,2]]){
        const anchor=lines.findIndex(line=>line.includes(
          `<!-- cmd:block:v1 id="p4b0s${pathIndex}" -->`));
        assert(anchor>=0);
        const next=lines.findIndex((line,i)=>i>anchor&&/^<!-- cmd:block:v1 id="p\d+b\d+/.test(line));
        const first=lines.findIndex((line,i)=>i>anchor&&(next<0||i<next)&&
          line.trim()&&!line.trim().startsWith('<!--'));
        assert(first>anchor,`${name} ${role} must own real OCR-visible child content`);
        const expected=first+1;
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
        assert.equal(location?.sourceLine,expected,
          `${name} PDF ${role} did not locate exact first child content line`);
      }
      assert.equal(await page.evaluate(()=>window.__v6cm6.cm.readSource()),original,
        'none of the PDF native child clicks may write to CMD');
      assert.equal(readFileSync(doc,'utf8'),original,'source must remain byte-identical on disk');
      assert.deepEqual(errors,[]);
      console.log('PDF_SUBBLOCK_ANNOTATION_PASS',name,{children:43,parents:224,exactContentLines:true,
        originalUnchanged:true,autoSave:false,readOnly:true});
    }finally{await browser.close();writeFileSync(doc,original);}
  }
}finally{server.kill('SIGTERM');rmSync(temp,{recursive:true,force:true});}
