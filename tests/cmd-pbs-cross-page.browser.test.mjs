/** Only enabled PDF structural gesture: p1b5 onto p2b0 child landing.
 * Actual Chrome/WebKit UI, disposable document, exact saved Markdown,
 * original PDF position, disappearance from PDF/AG and group highlighting.
 */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {chromium,webkit,devices} from 'playwright';
import {chromeExecutable} from './platform.test-helper.mjs';
import {selectPreview} from './navigation-ui.test-helper.mjs';
import {toMarkdown} from '../packages/minerujson-md/dist/index.js';
import {planCMDAbsorbReviewedParent,readCMDBlockChains} from '../ui/cmd-block-chains.js';

const raw=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8');
const original=toMarkdown(raw),plan=planCMDAbsorbReviewedParent(original,'p1b5','p2b0');
const expected=[...plan.edits].sort((a,b)=>b.from-a.from).reduce((s,e)=>{
  assert.equal(s.slice(e.from,e.to),e.expected);return s.slice(0,e.from)+e.insert+s.slice(e.to);
},original);
for(const id of ['p2b0','p2b0s0','p2b0s1']){
  assert.equal(readCMDBlockChains(expected).atoms.find(a=>a.id===id)?.rawLine,
    `<!-- cmd:block:v1 id="${id}" -->`);
}
assert(!expected.includes('<!-- cmd:block:v1 id="p1b5"'));
assert(!expected.includes('<!-- cmd:absorbed-parent:v1 origin="p1b5"'));
const dir=mkdtempSync(join(tmpdir(),'ocr2md-only-p1b5-to-p2b0-'));
const doc=join(dir,'document.md'), token=join(dir,'token');
const port=await new Promise((ok,fail)=>{
  const s=createServer();s.once('error',fail);
  s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(e=>e?fail(e):ok(p));});
});
const base='http://127.0.0.1:'+port+'/';
const server=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),env:{...process.env,
  V6_PORT:String(port),V6_BIND:'127.0.0.1',V6_LAB_ID:'',V6_LAN_TLS_HOST:'',
  V6_DOCUMENT_PATH:doc,V6_PDF_PATH:resolve('.v6/workspace/buffetts-alpha.original.pdf'),
  V6_STATIC_ROOT:resolve('dist'),V6_SETTINGS_PATH:join(dir,'settings.json'),
  V6_TOKEN_PATH:token},stdio:'ignore'});
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
const center=r=>({clientX:r.x+r.width/2,clientY:r.y+r.height/2});
try{
  let ready=false;
  for(let i=0;i<185;i++){try{if((await fetch(base+'healthz')).ok){ready=true;break;}}catch{}await sleep(180);}
  assert(ready,'isolated OCR2MD server not ready');
  for(const [name,engine,binary] of [['Chrome',chromium,chromeExecutable()],['iPad-WebKit',webkit,webkit.executablePath()]]){
    if(process.env.ONE_BROWSER&&process.env.ONE_BROWSER!==name)continue;
    writeFileSync(doc,original);
    const browser=await engine.launch({headless:true,...(binary?{executablePath:binary}:{})});
    try{
      const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:900}});
      page.setDefaultTimeout(28000);
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      try{
        assert.equal((await page.goto(base,{waitUntil:'domcontentloaded',timeout:75000})).status(),200);
        await page.waitForFunction(()=>document.querySelector('.ocr-pdf-status')?.textContent==='就绪',null,{timeout:95000});
        await page.locator('#module-select').evaluate(el=>{el.value='text-block';el.dispatchEvent(new Event('change',{bubbles:true}));});
        await page.waitForFunction(n=>document.querySelector('#status')?.textContent?.includes('PBS '+n),
          readCMDBlockChains(original).atoms.length,{timeout:65000});
        await selectPreview(page,'pdf');
        console.log('CROSS_B5_TO_P2B0_READY',name);
        const from=page.locator('.ocr-pdf-block-cover[data-block-id="p1b5"] > .ocr-pdf-block-ctrl');
        const to=page.locator('.ocr-pdf-block-cover[data-block-id="p2b0"] > .ocr-pdf-block-ctrl');
        await from.waitFor({state:'attached',timeout:50000});
        await from.scrollIntoViewIfNeeded({timeout:35000});
        const fr=await from.boundingBox();assert(fr);
        const sourcePage=await from.evaluate(el=>el.closest('.ocr-pdf-block-cover').dataset.pdfPage);
        assert.equal(sourcePage,'2','p1b5 must begin on original PDF page 2');
        const oldCover=page.locator('.ocr-pdf-block-cover[data-block-id="p1b5"]');
        const old=await oldCover.boundingBox();
        const originalGeometry=await oldCover.evaluate(el=>({left:el.style.left,top:el.style.top,
          width:el.style.width,height:el.style.height,pdfPage:el.dataset.pdfPage}));
        const touch={bubbles:true,pointerId:345,pointerType:'touch',button:0,isPrimary:true};
        await from.dispatchEvent('pointerdown',{...touch,...center(fr)});
        await page.locator('.ocr-pdf-block-drag-source').waitFor({state:'attached',timeout:7500});
        // A held pointer must remain alive while PDF scroll crosses a page
        // boundary. Check edge auto-scroll, then bring page 3's target into
        // view without releasing the source long-press gesture.
        const scroll=page.locator('.ocr-pdf-scroller');
        const pane=await scroll.boundingBox();assert(pane);
        const before=await scroll.evaluate(el=>el.scrollTop);
        await page.locator('body').dispatchEvent('pointermove',{
          ...touch,clientX:pane.x+pane.width/2,clientY:pane.y+pane.height-6});
        await page.waitForFunction(old=>document.querySelector('.ocr-pdf-scroller')?.scrollTop>old+15,
          before,{timeout:12000});
        // A real user moves their finger away from the edge before aiming
        // at the new page's label. Stop auto-scroll explicitly before the
        // test's programmatic scroll-to-target or the label will drift.
        await page.locator('body').dispatchEvent('pointermove',{
          ...touch,clientX:pane.x+pane.width/2,clientY:pane.y+pane.height/2});
        await to.scrollIntoViewIfNeeded({timeout:35000});
        const tr=await to.boundingBox();assert(tr);
        assert.equal(await to.evaluate(el=>el.closest('.ocr-pdf-block-cover').dataset.pdfPage),'3');
        const targetCover=page.locator('.ocr-pdf-block-cover[data-block-id="p2b0"]');
        const bbox=await targetCover.boundingBox();assert(bbox);
        await page.locator('body').dispatchEvent('pointermove',{...touch,...center(bbox)});
        assert.equal(await targetCover.evaluate(el=>el.classList.contains('ocr-pdf-block-drop-target')),true);
        assert.equal(await targetCover.evaluate(el=>getComputedStyle(el).outlineWidth),'3px');
        const rail=page.locator('.ocr-pdf-block-drop-guide');
        await rail.waitFor({state:'attached',timeout:7500});
        const aimedStatus=await page.locator('.ocr-pdf-status').textContent();
        console.log('CROSS_PAGE_LANDING_TARGET',name,aimedStatus);
        assert(aimedStatus.includes('p2b0'),name+' target label drifted: '+aimedStatus);
        const zr=await rail.locator('[data-placement="child"]').boundingBox();assert(zr);
        await page.locator('body').dispatchEvent('pointermove',{...touch,...center(zr)});
        await page.locator('body').dispatchEvent('pointerup',{...touch,...center(zr)});
        await page.waitForFunction(()=>
          !document.querySelector('.ocr-pdf-block-cover[data-block-id="p1b5"]')&&
          document.querySelector('.ocr-pdf-block-cover[data-block-id="p2b0s1"][data-origin-id="p1b5"]')&&
          document.querySelector('.ocr-pdf-block-fragment[data-subblock-id="p2b0s0"]'),
          null,{timeout:75000});
        const transferred=page.locator('.ocr-pdf-block-cover[data-block-id="p2b0s1"]');
        const movedGeometry=await transferred.evaluate(el=>({left:el.style.left,top:el.style.top,
          width:el.style.width,height:el.style.height,pdfPage:el.dataset.pdfPage}));
        assert.deepEqual(movedGeometry,originalGeometry,name+' cross-page moved physical bbox');
        assert.equal(movedGeometry.pdfPage,'2','new p2 label must STAY on physical PDF page 2');
        assert.equal(readFileSync(doc,'utf8'),original,'gesture must not autosave');
        const parent=page.locator('.ocr-pdf-block-cover[data-block-id="p2b0"]');
        await parent.locator(':scope > .ocr-pdf-block-ctrl').evaluate(el=>el.click());
        await page.waitForFunction(()=>{
          const a=document.querySelector('.ocr-pdf-block-cover[data-block-id="p2b0"]');
          const b=document.querySelector('.ocr-pdf-block-cover[data-block-id="p2b0s1"]');
          const body=document.querySelector('.ocr-pdf-block-fragment[data-subblock-id="p2b0s0"]');
          return a?.classList.contains('ocr-pdf-block-group-active')&&
            b?.classList.contains('ocr-pdf-block-group-active')&&
            body?.classList.contains('ocr-pdf-block-group-child');
        },null,{timeout:25000});
        // A DOM node with the right data-block-id is NOT a visual pass:
        // the user reads the chip text, which must show the exact same id.
        for(const id of ['p2b0','p2b0s1']){
          const chip=page.locator(`.ocr-pdf-block-cover[data-block-id="${id}"] > .ocr-pdf-block-ctrl span`);
          assert.equal(await chip.textContent(),id,`Visible PDF label must be ${id}`);
          assert(await chip.isVisible(),`PDF label ${id} must actually be visible`);
        }
        const bodyChip=page.locator('.ocr-pdf-block-fragment[data-subblock-id="p2b0s0"] .ocr-pdf-subblock-chip');
        assert.equal(await bodyChip.textContent(),'p2b0s0');
        // Compare REAL computed label colors, not just CSS class presence.
        const childChip=transferred.locator(':scope > .ocr-pdf-block-ctrl');
        const appearance=el=>({background:getComputedStyle(el).backgroundColor,
          color:getComputedStyle(el).color,border:getComputedStyle(el).borderTopColor});
        assert.deepEqual(await childChip.evaluate(appearance),await bodyChip.evaluate(appearance),
          name+' moved child label must match existing body/native child blue');
        assert.notDeepEqual(await childChip.evaluate(appearance),
          await parent.locator(':scope > .ocr-pdf-block-ctrl').evaluate(appearance),
          'parent label should retain its distinct color');
        const former=await page.locator('.ocr-pdf-block-ctrl span').allTextContents();
        assert(!former.includes('p1b5'),'Old parent p1b5 must not survive as visible chip text');
        console.log('CROSS_B5_TO_P2B0_VISIBLE_LABELS',name,{parent:'p2b0',body:'p2b0s0',child:'p2b0s1',oldGone:true});
        console.log('CROSS_B5_TO_P2B0_HIGHLIGHT',name);
        if(process.env.OCR_PBS_VISUAL_CAPTURE){
          // Two actual screenshots because a cross-page group cannot fit in
          // a single viewport: B on page 3 and new child on page 2.
          await parent.scrollIntoViewIfNeeded();
          await page.screenshot({path:process.env.OCR_PBS_VISUAL_CAPTURE.replace('.png','-parent.png'),animations:'disabled'});
          const locator=page.locator('.ocr-pdf-block-cover[data-block-id="p2b0s1"]');
          await locator.scrollIntoViewIfNeeded();
          const visible=await page.evaluate(()=>[...document.querySelectorAll(
            '.ocr-pdf-block-cover[data-block-id^="p1b"]')].filter(el=>
              /p1b[34]/.test(el.dataset.blockId)).map(el=>{
              const rect=el.getBoundingClientRect();const chip=el.querySelector(':scope > .ocr-pdf-block-ctrl');
              const cr=chip?.getBoundingClientRect();const style=chip?getComputedStyle(chip):null;
              return {id:el.dataset.blockId,origin:el.dataset.originId,
                label:chip?.textContent,cover:{x:rect.x,y:rect.y,w:rect.width,h:rect.height},
                chip:{x:cr?.x,y:cr?.y,w:cr?.width,h:cr?.height},
                display:style?.display,visibility:style?.visibility,opacity:style?.opacity};
            }));
          console.log('CROSS_B5_TO_P2B0_VISUAL_LAYOUT',name,JSON.stringify(visible));
          await page.screenshot({path:process.env.OCR_PBS_VISUAL_CAPTURE,animations:'disabled'});
        }
        await page.locator('#undo').evaluate(el=>el.click());
        await page.waitForFunction(()=>document.querySelector('.ocr-pdf-block-cover[data-block-id="p1b5"]')&&
          !document.querySelector('.ocr-pdf-block-cover[data-block-id="p2b0s1"]'),null,{timeout:60000});
        await page.locator('#redo').evaluate(el=>el.click());
        await page.waitForFunction(()=>!document.querySelector('.ocr-pdf-block-cover[data-block-id="p1b5"]')&&
          document.querySelector('.ocr-pdf-block-cover[data-block-id="p2b0s1"]'),null,{timeout:60000});
        await page.locator('#save').evaluate(el=>el.click());
        await page.waitForFunction(()=>document.querySelector('#unlock-dialog')?.open,null,{timeout:18000});
        await page.locator('#unlock-code').fill(readFileSync(token,'utf8').trim().slice(0,12));
        await page.locator('#unlock-form button[type=submit]').click();
        await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('已保存'),null,{timeout:35000});
        assert.equal(readFileSync(doc,'utf8'),expected,'browser saved source must equal expected exact bytes');
        // Reload from the saved id-only CMD: physical PDF aliases must be
        // reconstructed, not kept in a transient browser memory table.
        await page.reload({waitUntil:'domcontentloaded',timeout:75000});
        console.log('CROSS_PAGE_RELOAD_DOM',name);
        try{
          await page.waitForFunction(()=>document.querySelector('.ocr-pdf-status')?.textContent==='就绪',
            null,{timeout:95000});
        }catch(error){
          console.log('CROSS_PAGE_RELOAD_FAILURE',name,
            await page.evaluate(()=>({pdfStatus:document.querySelector('.ocr-pdf-status')?.textContent,
              globalStatus:document.querySelector('#status')?.textContent,
              pages:document.querySelectorAll('.ocr-pdf-scroller .page').length})),errors);
          throw error;
        }
        await page.locator('#module-select').evaluate(el=>{
          el.value='text-block';el.dispatchEvent(new Event('change',{bubbles:true}));
        });
        await selectPreview(page,'pdf');
        const surviving=page.locator('.ocr-pdf-block-cover[data-block-id="p2b0s1"][data-origin-id="p1b5"]');
        await surviving.waitFor({state:'attached',timeout:60000});
        assert.equal(await page.locator('.ocr-pdf-block-cover[data-block-id="p1b5"]').count(),0);
        const reloadedGeometry=await surviving.evaluate(el=>({left:el.style.left,top:el.style.top,
          width:el.style.width,height:el.style.height,pdfPage:el.dataset.pdfPage}));
        // Scrolling and zoom may differ after reload: compare coordinates
        // relative to the PDF page, not global browser-screen y offsets.
        assert.deepEqual(reloadedGeometry,originalGeometry,name+' reload changed original PDF bbox');
        await page.locator('.ocr-pdf-block-cover[data-block-id="p2b0"] > .ocr-pdf-block-ctrl')
          .evaluate(el=>el.click());
        assert.equal(await surviving.evaluate(el=>el.classList.contains('ocr-pdf-block-group-active')),true);
        assert.equal(await surviving.evaluate(el=>el.dataset.pdfPage),'2');
        assert.deepEqual(await surviving.locator(':scope > .ocr-pdf-block-ctrl').evaluate(appearance),
          await page.locator('.ocr-pdf-block-fragment[data-subblock-id="p2b0s0"] .ocr-pdf-subblock-chip').evaluate(appearance));
        assert.equal(await surviving.locator(':scope > .ocr-pdf-block-ctrl span').textContent(),'p2b0s1');
        assert.equal(await page.locator('.ocr-pdf-block-cover[data-block-id="p2b0"] > .ocr-pdf-block-ctrl span').textContent(),'p2b0');
        assert.equal(await page.locator('.ocr-pdf-block-fragment[data-subblock-id="p2b0s0"] .ocr-pdf-subblock-chip').textContent(),'p2b0s0');
        assert.equal(errors.length,0,'JavaScript errors: '+errors.join(';'));
        console.log('P1B5_INTO_P2B0_BROWSER_PASS',name,{oldParentGone:true,b4Parent:true,
          body:'p2b0s0',child:'p2b0s1',bboxUnchanged:true,groupHighlight:true,
          undo:true,redo:true,savedByteExact:true,noAutoSave:true,noAbsorbedMarker:true});
      }finally{await page.close();}
    }finally{await browser.close();}
  }
}finally{server.kill('SIGTERM');rmSync(dir,{recursive:true,force:true});}
