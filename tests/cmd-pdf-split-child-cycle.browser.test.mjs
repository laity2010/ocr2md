/** Real PDF/iPad-WebKit: attach -> click child -> 拆分子块 -> reattach
 * -> Undo x3. Disposable fixture and service, no user data ever written.
 */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {webkit,chromium,devices} from 'playwright';
import {chromeExecutable} from './platform.test-helper.mjs';
import {selectPreview} from './navigation-ui.test-helper.mjs';
import {toMarkdown,toMineruJSON} from '../packages/minerujson-md/dist/index.js';
const sourceJSON=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8');
const source=toMarkdown(sourceJSON);
const dir=mkdtempSync(join(tmpdir(),'ocr2md-pdf-split-child-'));
const doc=join(dir,'document.md');writeFileSync(doc,source);
const port=await new Promise((ok,fail)=>{
  const server=createServer();server.once('error',fail);
  server.listen(0,'127.0.0.1',()=>{const p=server.address().port;server.close(e=>e?fail(e):ok(p));});
});
const base='http://127.0.0.1:'+port+'/';
const server=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),
  env:{...process.env,V6_PORT:String(port),V6_BIND:'127.0.0.1',
    V6_LAB_ID:'',V6_LAN_TLS_HOST:'',V6_DOCUMENT_PATH:doc,
    V6_PDF_PATH:resolve('.v6/workspace/buffetts-alpha.original.pdf'),
    V6_STATIC_ROOT:resolve('dist'),V6_SETTINGS_PATH:join(dir,'settings.json'),
    V6_TOKEN_PATH:join(dir,'token')},stdio:'ignore'});
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
const center=rect=>({clientX:rect.x+rect.width/2,clientY:rect.y+rect.height/2});
try{
  let ready=false;
  for(let i=0;i<190;i++){
    try{if((await fetch(base+'healthz')).ok){ready=true;break;}}catch{}
    await sleep(175);
  }
  assert(ready,'disposable test service unavailable');
  for(const [name,engine,binary] of [
    ['Chrome',chromium,chromeExecutable()],
    ['iPad-WebKit',webkit,webkit.executablePath()]
  ]){
    if(process.env.ONE_BROWSER&&process.env.ONE_BROWSER!==name)continue;
    const browser=await engine.launch({headless:true,...(binary?{executablePath:binary}:{})});
    try{
      const page=await browser.newPage({...devices['iPad Pro 11 landscape'],
        viewport:{width:1032,height:900}});
      try{
        page.setDefaultTimeout(30000);
        const errors=[];page.on('pageerror',error=>errors.push(error.message));
        assert.equal((await page.goto(base,{waitUntil:'domcontentloaded',timeout:70000})).status(),200);
        await page.waitForFunction(()=>document.querySelector('.ocr-pdf-status')?.textContent==='就绪'&&
          document.querySelector('.ocr-pdf-scroller .page canvas')?.width>0,null,{timeout:85000});
        await page.locator('#module-select').evaluate(el=>{
          el.value='text-block';el.dispatchEvent(new Event('change',{bubbles:true}));
        });
        await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('PBS 267'),null,{timeout:70000});
        await selectPreview(page,'pdf');
        const split=page.locator('.ocr-pdf-promote-child');
        assert.equal(await split.textContent(),'拆分子块');
        assert.equal(await split.isVisible(),true);
        assert.equal(await split.isDisabled(),true);
        const drag=async(sourceId,targetId,pointerId)=>{
          const from=page.locator('.ocr-pdf-block-cover[data-block-id="'+sourceId+'"] > .ocr-pdf-block-ctrl');
          const to=page.locator('.ocr-pdf-block-cover[data-block-id="'+targetId+'"] > .ocr-pdf-block-ctrl');
          await from.waitFor({state:'attached',timeout:50000});
          await to.scrollIntoViewIfNeeded({timeout:40000});
          const fr=await from.boundingBox(),tr=await to.boundingBox();
          assert(fr&&tr,name+' physical PDF source/destination not visible');
          const touch={bubbles:true,pointerId,pointerType:'touch',button:0,isPrimary:true};
          await from.dispatchEvent('pointerdown',{...touch,...center(fr)});
          await page.locator('.ocr-pdf-block-drag-arrow').waitFor({state:'attached',timeout:6500});
          await page.locator('body').dispatchEvent('pointermove',{...touch,...center(tr)});
          const rail=page.locator('.ocr-pdf-block-drop-guide');
          await rail.waitFor({state:'attached',timeout:6500});
          const zone=rail.locator('[data-placement="child"]');
          const rect=await zone.boundingBox();assert(rect);
          await page.locator('body').dispatchEvent('pointermove',{...touch,...center(rect)});
          await page.locator('body').dispatchEvent('pointerup',{...touch,...center(rect)});
        };
        const originalRect=await page.locator('.ocr-pdf-block-cover[data-block-id="p1b3"]').boundingBox();
        await drag('p1b3','p1b5',501);
        await page.waitForFunction(()=>!document.querySelector('.ocr-pdf-block-cover[data-block-id="p1b3"]')&&
          document.querySelector('.ocr-pdf-block-cover[data-block-id="p1b5s1"][data-origin-id="p1b3s0"]'),
          null,{timeout:60000});
        const newChild=page.locator('.ocr-pdf-block-cover[data-block-id="p1b5s1"] > .ocr-pdf-block-ctrl');
        await newChild.waitFor({state:'attached',timeout:30000});
        await newChild.evaluate(el=>el.click());
        await page.waitForFunction(()=>!document.querySelector('.ocr-pdf-promote-child')?.disabled,
          null,{timeout:10000});
        await split.evaluate(el=>el.click());
        await page.waitForFunction(()=>document.querySelector(
          '.ocr-pdf-block-cover[data-block-id="p1b14"][data-origin-id="p1b3s0"]')&&
          !document.querySelector('.ocr-pdf-block-cover[data-block-id="p1b5s1"]'),
          null,{timeout:60000});
        await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes(
          '拆分子块 · p1b5s1 → p1b14'),null,{timeout:30000});
        const rect=await page.locator('.ocr-pdf-block-cover[data-block-id="p1b14"]').boundingBox();
        assert(rect&&originalRect);
        for(const key of ['x','y','width','height'])assert(Math.abs(rect[key]-originalRect[key])<2,
          name+' split moved bbox '+key);
        assert.equal(await split.isDisabled(),true,'parent cannot be split again');
        assert.equal(readFileSync(doc,'utf8'),source,'split wrote disk');
        console.log('PDF_SPLIT_CHILD_PASS',name,{source:'p1b5s1',to:'p1b14',origin:'p1b3s0',bboxPreserved:true});
        await drag('p1b14','p1b5',502);
        await page.waitForFunction(()=>!document.querySelector('.ocr-pdf-block-cover[data-block-id="p1b14"]')&&
          document.querySelector('.ocr-pdf-block-cover[data-block-id="p1b5s1"][data-origin-id="p1b3s0"]'),
          null,{timeout:60000});
        await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes(
          '已归入 p1b14 → p1b5s1'),null,{timeout:30000});
        console.log('PDF_SPLIT_REATTACH_PASS',name);
        for(const [step,have,missing] of [
          ['reattach','p1b14','p1b5s1'],
          ['split','p1b5s1','p1b14'],
          ['original','p1b3','p1b5s1']
        ]){
          await page.locator('#undo').evaluate(el=>el.click());
          await page.waitForFunction(([have,missing])=>
            document.querySelector('.ocr-pdf-block-cover[data-block-id="'+have+'"]')&&
            !document.querySelector('.ocr-pdf-block-cover[data-block-id="'+missing+'"]'),
            [have,missing],{timeout:60000});
          console.log('PDF_SPLIT_UNDO_PASS',name,step);
        }
        assert.deepEqual(errors,[],'browser JavaScript error');
        assert.equal(readFileSync(doc,'utf8'),source,'browser automatically saved');
        console.log('PDF_SPLIT_REATTACH_FULL_BROWSER_PASS',name);
      }finally{await page.close();}
    }finally{await browser.close();}
  }
}finally{server.kill('SIGTERM');rmSync(dir,{recursive:true,force:true});}
