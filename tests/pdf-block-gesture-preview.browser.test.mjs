/** Original-PDF before/after drag TARGETS: immutable OCR cover hit,
 * transient guide placement, then CANCEL without a CMD edit. Actual
 * before/after mutations are validated separately by CMD operation suites.
 * Disposable server/document. No persistent user data is ever edited.
 */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {chromium,webkit,devices} from 'playwright';
import {chromeExecutable} from './platform.test-helper.mjs';
import {selectPreview} from './navigation-ui.test-helper.mjs';
import {toMarkdown} from '../packages/minerujson-md/dist/index.js';
const source=toMarkdown(readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8'));
const dir=mkdtempSync(join(tmpdir(),'ocr2md-pdf-gesture-intent-'));
const doc=join(dir,'document.md');
writeFileSync(doc,source);
const port=await new Promise((ok,fail)=>{
  const srv=createServer();srv.once('error',fail);srv.listen(0,'127.0.0.1',()=>{
    const p=srv.address().port;srv.close(e=>e?fail(e):ok(p));
  });
});
const base='http://127.0.0.1:'+port+'/';
const server=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),
  env:{...process.env,V6_PORT:String(port),V6_BIND:'127.0.0.1',V6_LAB_ID:'',V6_LAN_TLS_HOST:'',
  V6_DOCUMENT_PATH:doc,V6_PDF_PATH:resolve('.v6/workspace/buffetts-alpha.original.pdf'),
  V6_STATIC_ROOT:resolve('dist'),V6_SETTINGS_PATH:join(dir,'settings.json'),
  V6_TOKEN_PATH:join(dir,'token')},stdio:'ignore'});
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
const center=r=>({clientX:r.x+r.width/2,clientY:r.y+r.height/2});
try{
  let listening=false;
  for(let i=0;i<200;i++){
    try{if((await fetch(base+'healthz')).ok){listening=true;break;}}catch{}
    await sleep(160);
  }
  assert(listening,'isolated service unavailable');
  for(const [name,engine,path] of [['Chrome',chromium,chromeExecutable()],
    ['iPad-WebKit',webkit,webkit.executablePath()]]){
    if(process.env.ONE_BROWSER&&process.env.ONE_BROWSER!==name)continue;
    const browser=await engine.launch({headless:true,...(path?{executablePath:path}:{})});
    try{
      const page=await browser.newPage({...devices['iPad Pro 11 landscape'],
        viewport:{width:1032,height:900}});
      try{
        page.setDefaultTimeout(25000);
        const errors=[];page.on('pageerror',e=>errors.push(e.message));
        assert.equal((await page.goto(base,{waitUntil:'domcontentloaded',timeout:70000})).status(),200);
        await page.waitForFunction(()=>document.querySelector('.ocr-pdf-status')?.textContent==='就绪'&&
          document.querySelector('.ocr-pdf-scroller .page canvas')?.width>0,
          null,{timeout:85000});
        await page.locator('#module-select').evaluate(el=>{
          el.value='text-block';el.dispatchEvent(new Event('change',{bubbles:true}));
        });
        await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('PBS 267'),
          null,{timeout:65000});
        await selectPreview(page,'pdf');
        const cases=[
          {source:'p1b3',target:'p1b5',placement:'before',text:'拟移至 p1b5 之前'},
          {source:'p1b3',target:'p1b5',placement:'after',text:'拟移至 p1b5 之后'}
        ];
        for(let index=0;index<cases.length;index++){
          const c=cases[index],touch={
            bubbles:true,pointerId:800+index,pointerType:'touch',button:0,isPrimary:true
          };
          const from=page.locator('.ocr-pdf-block-cover[data-block-id="'+c.source+'"] > .ocr-pdf-block-ctrl');
          // Drop targets are the immutable OCR COVER, never the label.
          // Labels now float freely around the page and are not hit regions.
          const destCover=c.target.includes('s')?
            page.locator('.ocr-pdf-block-fragment[data-subblock-id="'+c.target+'"]'):
            page.locator('.ocr-pdf-block-cover[data-block-id="'+c.target+'"]');
          await from.waitFor({state:'attached',timeout:45000});
          await destCover.scrollIntoViewIfNeeded({timeout:30000});
          const fr=await from.boundingBox(),dr=await destCover.boundingBox();assert(fr&&dr);
          await from.dispatchEvent('pointerdown',{...touch,...center(fr)});
          await page.locator('.ocr-pdf-block-drag-arrow').waitFor({state:'attached',timeout:5000});
          await page.locator('body').dispatchEvent('pointermove',{...touch,...center(dr)});
          const guide=page.locator('.ocr-pdf-block-drop-guide');
          await guide.waitFor({state:'attached',timeout:7000});
          const zone=guide.locator('[data-placement="'+c.placement+'"]');
          const zr=await zone.boundingBox();assert(zr);
          await page.locator('body').dispatchEvent('pointermove',{...touch,...center(zr)});
          const hover=await page.locator('.ocr-pdf-status').textContent();
          assert(hover.includes(c.target),name+' hover target '+hover);
          assert(hover.includes(c.placement==='before'?'之前':'之后'),
            name+' expected '+c.placement+' rail '+hover);
          assert.equal(await zone.evaluate(el=>el.classList.contains('active')),true,
            'the exact before/after landing zone must be selected');
          // Cancel rather than release: this test owns pointer targeting,
          // while the real CMD integration suite owns document mutation.
          await page.locator('body').dispatchEvent('pointercancel',{...touch,...center(zr)});
          assert.equal(await page.locator('.ocr-pdf-block-drag-arrow').count(),0);
          assert.equal(await page.locator('.ocr-pdf-block-drop-guide').count(),0);
          assert.equal(await page.locator('.ocr-pdf-block-cover[data-block-id="p1b3"]').count(),1);
          assert.equal(await page.locator('.ocr-pdf-block-cover[data-block-id="p1b5"]').count(),1);
          assert.equal(await page.locator('.ocr-pdf-block-fragment[data-subblock-id="p1b3s0"]').count(),1);
          assert.equal(readFileSync(doc,'utf8'),source,'gesture wrote source file');
          console.log('PDF_GESTURE_COVER_TARGET_CANCEL_PASS',name,c.placement,
            c.source,'->',c.target);
        }
        assert.deepEqual(errors,[]);
        console.log('PDF_GESTURE_COVER_TARGET_BROWSER_ALL_PASS',name);
      }finally{await page.close();}
    }finally{await browser.close();}
  }
}finally{server.kill('SIGTERM');rmSync(dir,{recursive:true,force:true});}
