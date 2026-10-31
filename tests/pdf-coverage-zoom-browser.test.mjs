/** PDF toolbar owns the default-on coverage lens and stable zoom anchor.
 * Isolated browser fixture: no user CMD/PDF data is written.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium,webkit} from 'playwright';

const sample=resolve('.v6/tests/text-blocks/buffett-reinitialized.minerujson.md');
const original=readFileSync(sample,'utf8');
const port=5994,url=`http://127.0.0.1:${port}/`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1',
  '--port',String(port),'--strictPort'],{cwd:process.cwd(),stdio:'ignore',
  env:{...process.env,V6_DOCUMENT_PATH:sample}});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try{
  let ready=false;
  for(let i=0;i<240;i++){
    try{if((await fetch(url)).ok){ready=true;break;}}catch{}
    await delay(120);
  }
  assert(ready,'V6 isolated fixture server unavailable');
  for(const [name,engine,mobile] of [['Chrome',chromium,false],['iPad-WebKit',webkit,true]]){
    if(process.env.ONE_BROWSER&&name!==process.env.ONE_BROWSER)continue;
    const browser=await engine.launch({headless:true});
    try{
      const page=await browser.newPage({viewport:{width:1220,height:840},isMobile:mobile,hasTouch:mobile});
      const errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
      await page.locator('.ocr-lab-ag-toolbar .ocr-navigation-elements .ts-control').evaluate(el=>el.click());
      await page.locator('.ocr-navigation-popup-elements:visible [data-value="text-block"]').evaluate(el=>el.click());
      await page.waitForFunction(()=>/原始 224 块/.test(document.querySelector('#status')?.textContent||''),
        null,{timeout:30000});
      const cover=page.locator('.ocr-pdf-tools .ocr-pdf-cover-toggle input');
      assert.equal(await page.locator('.ocr-lab-ag-toolbar [aria-label="文本块覆盖显示"]').count(),0);
      assert.equal(await cover.count(),1);
      assert(await cover.isChecked(),'PDF coverage must default to checked');
      await page.waitForFunction(()=>document.querySelectorAll('.ocr-pdf-block-cover').length===224,
        null,{timeout:25000});
      // The PDF toolbar, not AG, is the only source of this view state.
      await cover.evaluate(input=>input.click());
      await page.waitForFunction(()=>document.querySelectorAll('.ocr-pdf-block-cover').length===0,
        null,{timeout:15000});
      assert.equal(await cover.isChecked(),false);
      await cover.evaluate(input=>input.click());
      await page.waitForFunction(()=>document.querySelectorAll('.ocr-pdf-block-cover').length===224,
        null,{timeout:25000});
      assert(await cover.isChecked());
      await page.locator('.ocr-preview-switchbar .ocr-navigation-preview .ts-control').evaluate(el=>el.click());
      await page.locator('.ocr-navigation-popup-preview:visible [data-value="pdf"]').evaluate(el=>el.click());
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
        assert.equal(await page.locator('.ocr-pdf-block-cover').count(),224);
      }
      assert(await cover.isChecked());
      assert.deepEqual(errors,[]);
      assert.equal(readFileSync(sample,'utf8'),original,'coverage and zoom must never edit source');
      console.log('PDF_COVERAGE_ZOOM_PASS',name,{start,after:await location(),
        zoomClicks:zoomClicks.length,checkboxes:224,errors:errors.length});
    }finally{await browser.close();}
  }
}finally{server.kill('SIGTERM');}
