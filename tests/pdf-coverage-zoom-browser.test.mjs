/** Persistent preview toolbar owns MD/PDF/split lenses and stable PDF zoom anchor.
 * Isolated browser fixture: no user CMD/PDF data is written.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium,webkit} from 'playwright';

import {ensureTextBlockSample} from './fixtures/text-block-sample.mjs';
const sample=ensureTextBlockSample();
const original=readFileSync(sample,'utf8');
const port=5994,url=`http://127.0.0.1:${port}/`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1',
  '--port',String(port),'--strictPort'],{cwd:process.cwd(),stdio:['ignore','pipe','pipe'],
  env:{...process.env,V6_DOCUMENT_PATH:sample}});
const serverOutput=[];
for(const stream of [server.stdout,server.stderr])stream.on('data',chunk=>{
  serverOutput.push(String(chunk));
  if(serverOutput.length>25)serverOutput.shift();
});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try{
  let ready=false;
  for(let i=0;i<240;i++){
    try{if((await fetch(url)).ok){ready=true;break;}}catch{}
    await delay(120);
  }
  assert(ready,'V6 isolated fixture server unavailable: '+
    JSON.stringify({exitCode:server.exitCode,errors:serverOutput.join('').slice(-1500)}));
  for(const [name,engine,mobile] of [['Chrome',chromium,false],['iPad-WebKit',webkit,true]]){
    if(process.env.ONE_BROWSER&&name!==process.env.ONE_BROWSER)continue;
    const browser=await engine.launch({headless:true});
    try{
      const page=await browser.newPage({viewport:{width:1220,height:840},isMobile:mobile,hasTouch:mobile});
      const errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
      console.log('PDF_COVER_TEST_ENGINE_START',name);
      const cover=page.locator('.ocr-preview-switchbar .ocr-preview-block-toggle input');
      const selectElement=async value=>{
        await page.locator('.ocr-lab-ag-toolbar .ocr-navigation-elements .ts-control')
          .evaluate(el=>el.click());
        await page.locator(`.ocr-navigation-popup-elements:visible [data-value="${value}"]`)
          .evaluate(el=>el.click());
      };
      // DOMContentLoaded does not mean WCP's async editor/preview toolbar
      // has mounted (especially WebKit under simultaneous PDF.js load).
      // Keep the exact single-toolbar invariant after the actual attachment.
      try{await cover.waitFor({state:'attached',timeout:30000});}
      catch(error){
        console.error('PDF_COVER_TOOLBAR_INIT_DIAGNOSTIC',name,JSON.stringify({
          url:page.url(),errors,status:await page.locator('#status').textContent().catch(()=>null)
        }));
        throw error;
      }
      assert.equal(await page.locator('.ocr-lab-ag-toolbar [aria-label="PDF 文本块"]').count(),0);
      assert.equal(await cover.count(),1);
      assert.equal(await page.locator('.ocr-preview-block-toggle').innerText(),'文本块');
      assert.equal(await cover.isChecked(),false,'Markdown defaults to no text blocks');
      assert.equal(await page.locator('.ocr-md-block-covered').count(),0);
      // New requirement: the checkbox works BEFORE the AG text-block module
      // has ever been selected, and an edit is possible in the Title module.
      await page.waitForFunction(()=>document.querySelectorAll('.ocr-pdf-block-cover').length===224,
        null,{timeout:30000});
      assert(['text-block','chapter-boundary'].includes(
        await page.locator('.ocr-lab-element-select').inputValue()),
        'the first PDF edit must not depend on which AG view the browser initializes');
      // 9a375d9 contract: the checkbox is a read-only visual; three
      // clicks/taps on the parent control toggle the join.
      const joinTag=page.locator('.ocr-pdf-block-cover[data-block-id="p6b7"] .ocr-pdf-block-ctrl');
      // The PDF pane is not shown yet here (the old code also used a DOM
      // click), so deliver the same three DOM clicks the ctrl counts.
      await joinTag.evaluate(el=>{for(let i=0;i<3;i++)el.click();});
      try{
        await page.waitForFunction(()=>document.querySelector(
          '.ocr-pdf-block-cover[data-block-id="p6b7"] input')?.checked===false,
          null,{timeout:20000});
      }catch(error){
        const details=await page.evaluate(()=>({
          mode:document.querySelector('.ocr-lab-element-select')?.value,
          status:document.querySelector('#status')?.textContent,
          pdfStatus:document.querySelector('.ocr-pdf-status')?.textContent,
          total:document.querySelectorAll('.ocr-pdf-block-cover').length,
          joinInput:document.querySelector('.ocr-pdf-block-cover[data-block-id="p6b7"] input')?.checked,
          joinDisabled:document.querySelector('.ocr-pdf-block-cover[data-block-id="p6b7"] input')?.disabled,
          pdfReady:window.__v6cm6?.pdf?.ready,
          sourceJoinCount:(window.__v6cm6?.view?.state?.doc?.toString()?.match(/ocr2md:block-join/g)||[]).length,
          navType:performance.getEntriesByType('navigation').map(e=>e.type)
        })).catch(e=>({probeError:String(e)}));
        console.error('PDF_COVER_INITIAL_JOIN_DIAGNOSTIC',name,JSON.stringify({details,errors}));
        throw error;
      }
      await page.locator('#undo').click();
      await page.waitForFunction(()=>document.querySelector(
        '.ocr-pdf-block-cover[data-block-id="p6b7"] input')?.checked===true,
        null,{timeout:20000});
      // In single Markdown, this control changes ONLY Markdown coverage.
      await cover.evaluate(input=>input.click());
      await page.waitForFunction(()=>document.querySelectorAll('.ocr-md-block-covered').length>=150,
        null,{timeout:15000});
      assert.equal(await page.locator('.ocr-pdf-block-cover').count(),224);
      assert.equal(await cover.isChecked(),true);
      await cover.evaluate(input=>input.click());
      await page.waitForFunction(()=>document.querySelectorAll('.ocr-md-block-covered').length===0,
        null,{timeout:15000});
      await selectElement('media');
      assert.equal(await cover.isChecked(),false,'another AG module preserves MD off');
      assert.equal(await page.locator('.ocr-pdf-block-cover').count(),224);
      await selectElement('text-block');
      await page.waitForFunction(()=>document.querySelectorAll('.ocr-pdf-block-cover').length===224,
        null,{timeout:25000});
      assert(await cover.isChecked(),'selecting text-block AG module automatically enables PDF blocks');
      await selectElement('media');
      assert(await cover.isChecked(),'leaving text-block module must not hide PDF operations');
      assert.equal(await page.locator('.ocr-pdf-block-cover').count(),224);
      await page.locator('.ocr-preview-switchbar .ocr-navigation-preview .ts-control').evaluate(el=>el.click());
      await page.locator('.ocr-navigation-popup-preview:visible [data-value="pdf"]').evaluate(el=>el.click());
      assert(await cover.isChecked(),'PDF retains its independent ON preference');
      const scroller=page.locator('.ocr-pdf-scroller');
      await page.locator('.ocr-pdf-block-cover[data-block-id="p16b0"]')
        .scrollIntoViewIfNeeded({timeout:24000});
      await delay(650); // let native CSS scroll animations settle
      const location=()=>page.evaluate(()=>{
        const scroller=document.querySelector('.ocr-pdf-scroller');
        const view=scroller.getBoundingClientRect();
        const x=view.left+view.width/2,y=view.top+view.height/2;
        const pages=[...scroller.querySelectorAll('.page[data-page-number]')];
        const located=pages.map(node=>{
          const r=node.getBoundingClientRect();
          const dx=Math.max(r.left-x,0,x-r.right),dy=Math.max(r.top-y,0,y-r.bottom);
          return {page:node.dataset.pageNumber,
            y:(y-r.top)/r.height,x:(x-r.left)/r.width,distance:dx*dx+dy*dy};
        }).sort((a,b)=>a.distance-b.distance)[0];
        return {...located,scrollTop:scroller.scrollTop,
          zoom:document.querySelector('.ocr-pdf-zoom')?.textContent};
      });
      const start=await location();
      assert.equal(start.page,'17','test must anchor on the original PDF page 17');
      const zoomClicks=['.ocr-pdf-plus','.ocr-pdf-plus','.ocr-pdf-minus','.ocr-pdf-fit'];
      for(const selector of zoomClicks){
        await page.locator(selector).evaluate(el=>el.click());
        await delay(390);
        const after=await location();
        assert.equal(after.page,start.page,`zoom ${selector} jumped page: ${JSON.stringify({start,after})}`);
        assert(Math.abs(after.y-start.y)<.034,
          `zoom ${selector} moved reading position: ${JSON.stringify({start,after})}`);
        const visible=await page.locator('.ocr-pdf-block-cover').count();
        if(visible!==224){
          // Keep the original immediate PASS/FAIL gate. Capture whether the
          // canvas/page re-render has briefly detached coverage, or whether
          // the business-owned block inventory was actually lost.
          const before=await page.evaluate(()=>({
            coverChecked:document.querySelector('.ocr-preview-block-toggle input')?.checked,
            pages:document.querySelectorAll('.ocr-pdf-scroller .page').length,
            pdfMode:document.querySelector('.ocr-preview-mode')?.value,
            nodeInventory:window.__v6cm6?.pdf?.blockCoverageNodes?.size,
            documentMode:document.querySelector('#module-select')?.value,
          }));
          await delay(900);
          const later=await page.locator('.ocr-pdf-block-cover').count();
          console.error('PDF_COVER_ZOOM_REPAINT_DIAGNOSTIC',name,
            JSON.stringify({selector,visible,before,later}));
        }
        assert.equal(visible,224);
      }
      assert(await cover.isChecked());
      // PDF.js zoom/page-tree reflow may detach its original-block overlays
      // after the last cached canvas paint. Reproduce a loss of only DOM
      // coverage (never CMD data or PDF pages) and require automatic healing
      // with the *same* Block node, checked state and original geometry.
      const detached=await page.evaluate(()=>{
        const block=document.querySelector('.ocr-pdf-block-cover[data-block-id="p16b0"]');
        const page=block?.closest('.page');
        if(!page)return {count:0};
        const nodes=[...page.querySelectorAll('.ocr-pdf-block-cover')];
        window.__coverageNodeBeforeReflow=block;
        const checked=block.querySelector('input')?.checked;
        const rect=[block.style.left,block.style.top,block.style.width,block.style.height];
        nodes.forEach(node=>node.remove());
        return {count:nodes.length,checked,rect,remaining:document.querySelectorAll('.ocr-pdf-block-cover').length};
      });
      assert(detached.count>0&&detached.remaining<224,
        'exercise real DOM disconnection before the recovery gate');
      await page.waitForFunction(()=>document.querySelectorAll('.ocr-pdf-block-cover').length===224,
        null,{timeout:12000});
      const repaired=await page.evaluate(()=>{
        const block=document.querySelector('.ocr-pdf-block-cover[data-block-id="p16b0"]');
        return {sameNode:block===window.__coverageNodeBeforeReflow,
          checked:block?.querySelector('input')?.checked,
          rect:block?[block.style.left,block.style.top,block.style.width,block.style.height]:null};
      });
      assert.deepEqual(repaired,{sameNode:true,checked:detached.checked,rect:detached.rect},
        'PDF coverage must reattach the original DOM node with original CMD/bbox state');
      // Split: one persistent checkbox beside the preview navigation drives
      // Markdown and PDF overlay layers together (also on iPad Safari).
      await page.locator('.ocr-preview-split-toggle input').evaluate(el=>el.click());
      await page.waitForFunction(()=>document.querySelectorAll('.dv-groupview').length===4,
        null,{timeout:24000});
      assert.equal(await cover.count(),1,'split must NOT duplicate the switch');
      assert(await cover.isChecked());
      await page.waitForFunction(()=>document.querySelectorAll('.ocr-md-block-covered').length>=150&&
        document.querySelectorAll('.ocr-pdf-block-cover').length===224,
        null,{timeout:22000});
      await cover.evaluate(el=>el.click());
      await page.waitForFunction(()=>document.querySelectorAll(
        '.ocr-md-block-covered,.ocr-pdf-block-cover').length===0,
        null,{timeout:18000});
      assert.equal(await cover.isChecked(),false);
      await cover.evaluate(el=>el.click());
      await page.waitForFunction(()=>document.querySelectorAll('.ocr-md-block-covered').length>=150&&
        document.querySelectorAll('.ocr-pdf-block-cover').length===224,
        null,{timeout:22000});
      await page.locator('.ocr-preview-split-toggle input').evaluate(el=>el.click());
      await page.waitForFunction(()=>document.querySelectorAll('.dv-groupview').length===3,
        null,{timeout:24000});
      assert(await cover.isChecked(),'explicit split ON synchronizes both mode preferences');
      assert.deepEqual(errors,[]);
      assert.equal(readFileSync(sample,'utf8'),original,'coverage and zoom must never edit source');
      console.log('PDF_COVERAGE_ZOOM_PASS',name,{start,after:await location(),
        zoomClicks:zoomClicks.length,checkboxes:224,errors:errors.length});
    }finally{await browser.close();}
  }
}finally{server.kill('SIGTERM');}
