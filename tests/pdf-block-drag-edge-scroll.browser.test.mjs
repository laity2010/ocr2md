/** Long-range PDF drag: from page-17 b0, pull pointed b8 ahead of b0.
 * Uses an isolated fixture; never edits the user's saved CMD document.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium,webkit} from 'playwright';

const sample=resolve('.v6/tests/text-blocks/buffett-reinitialized.minerujson.md');
const original=readFileSync(sample,'utf8'),port=5998,url=`http://127.0.0.1:${port}/`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1',
  '--port',String(port),'--strictPort'],{cwd:process.cwd(),stdio:'ignore',
  env:{...process.env,V6_DOCUMENT_PATH:sample}});
try{
  let ready=false;
  for(let i=0;i<260;i++){
    try{if((await fetch(url)).ok){ready=true;break;}}catch{}
    await new Promise(r=>setTimeout(r,100));
  }
  assert(ready,'test frontend unavailable');
  for(const [name,engine,mobile] of [['Chrome',chromium,false],['iPad-WebKit',webkit,true]]){
    if(process.env.ONE_BROWSER&&name!==process.env.ONE_BROWSER)continue;
    const browser=await engine.launch({headless:true});
    try{
      const page=await browser.newPage({viewport:{width:1220,height:840},
        isMobile:mobile,hasTouch:mobile});
      const errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
      await page.locator('.ocr-lab-ag-toolbar .ocr-navigation-elements .ts-control').click();
      await page.locator('.ocr-navigation-popup-elements:visible [data-value="text-block"]').click();
      await page.waitForFunction(()=>/原始 224 块/.test(
        document.querySelector('#status')?.textContent||''),null,{timeout:30000});
      assert.equal(await page.locator('.ocr-preview-switchbar .ocr-preview-block-toggle input').count(),1,
        'shared preview toolbar must contain exactly one text-block toggle');
      await page.waitForFunction(()=>document.querySelectorAll('.ocr-pdf-block-cover').length===224,
        null,{timeout:30000});
      await page.locator('.ocr-preview-switchbar .ocr-navigation-preview .ts-control').click();
      await page.locator('.ocr-navigation-popup-preview:visible [data-value="pdf"]').click();
      const scroller=page.locator('.ocr-pdf-scroller');
      const src=page.locator('.ocr-pdf-block-cover[data-block-id="p16b0"] .ocr-pdf-block-ctrl');
      const dst=page.locator('.ocr-pdf-block-cover[data-block-id="p16b8"] .ocr-pdf-block-ctrl');
      await src.scrollIntoViewIfNeeded();
      const origin=await src.boundingBox(),pane=await scroller.boundingBox();
      const to=await dst.boundingBox();
      assert(origin&&pane&&to);
      assert(to.y+to.height>pane.y+pane.height,
        'target must start outside the visible PDF pane to test edge-scroll');
      const start={x:origin.x+origin.width*.75,y:origin.y+origin.height/2};
      const edge={x:Math.max(pane.x+15,Math.min(pane.x+pane.width-15,start.x)),
        y:pane.y+pane.height-9};
      const initialScroll=await scroller.evaluate(el=>el.scrollTop);
      const pointer={pointerId:41,pointerType:'touch',button:0,isPrimary:true};
      await src.dispatchEvent('pointerdown',{...pointer,clientX:start.x,clientY:start.y});
      await page.locator('.ocr-pdf-block-drag-source').waitFor({timeout:1900});
      await page.locator('body').dispatchEvent('pointermove',
        {...pointer,clientX:edge.x,clientY:edge.y});
      await page.waitForFunction(value=>
        document.querySelector('.ocr-pdf-scroller')?.scrollTop>value+40,
        initialScroll,{timeout:6500});
      try{
        await page.waitForFunction(()=>{
          const p=document.querySelector('.ocr-pdf-scroller')?.getBoundingClientRect();
          const t=document.querySelector('.ocr-pdf-block-cover[data-block-id="p16b8"] .ocr-pdf-block-ctrl')
            ?.getBoundingClientRect();
          return p&&t&&t.top>p.top+8&&t.bottom<p.bottom-8;
        },null,{timeout:6500});
      }catch(error){
        console.log('EDGE_SCROLL_DIAG',name,await page.evaluate(initialScroll=>{
          const r=selector=>{const e=document.querySelector(selector);if(!e)return null;
            const b=e.getBoundingClientRect();return {top:b.top,bottom:b.bottom,left:b.left,right:b.right};};
          const scroller=document.querySelector('.ocr-pdf-scroller');
          const cover=document.querySelector('.ocr-pdf-block-cover[data-block-id="p16b0"]');
          return {scrollTop:scroller?.scrollTop,initialScroll,scrollHeight:scroller?.scrollHeight,
            viewport:r('.ocr-pdf-scroller'),
            target:r('.ocr-pdf-block-cover[data-block-id="p16b8"] .ocr-pdf-block-ctrl'),
            source:r('.ocr-pdf-block-cover[data-block-id="p16b0"] .ocr-pdf-block-ctrl'),
            page:(()=>{const b=cover?.closest('.page')?.getBoundingClientRect();
              return b?{top:b.top,bottom:b.bottom}:null})(),
            dragging:!!document.querySelector('.ocr-pdf-block-drag-source'),
            arrow:!!document.querySelector('.ocr-pdf-block-drag-arrow')};
        },initialScroll));
        throw error;
      }
      const actualAutoScroll=await scroller.evaluate(el=>el.scrollTop)-initialScroll;
      assert(actualAutoScroll>40,'drag must visibly scroll PDF to reveal the offscreen target');
      const target=await dst.boundingBox();
      assert(target);
      const end={x:target.x+target.width*.75,y:target.y+target.height/2};
      await page.locator('body').dispatchEvent('pointermove',
        {...pointer,clientX:end.x,clientY:end.y});
      await page.locator('.ocr-pdf-block-cover[data-block-id="p16b8"].ocr-pdf-block-drop-target')
        .waitFor({timeout:2000});
      await page.locator('body').dispatchEvent('pointerup',
        {...pointer,clientX:end.x,clientY:end.y});
      await page.waitForFunction(()=>document.querySelector(
        '.ocr-pdf-block-cover[data-block-id="p16b0"] .ocr-pdf-block-ctrl span')
        ?.textContent==='p16b1',null,{timeout:25000});
      // Entire affected interval shifts together, without changing identities.
      const shifted=await page.evaluate(()=>Array.from({length:16},(_,i)=>{
        const node=document.querySelector(`.ocr-pdf-block-cover[data-block-id="p16b${i}"]`);
        return {id:node?.dataset.blockId,
          label:node?.querySelector('.ocr-pdf-block-ctrl span')?.textContent,
          checked:node?.querySelector('input')?.checked};
      }));
      assert.deepEqual(shifted,Array.from({length:16},(_,i)=>({
        id:`p16b${i}`,label:`p16b${i===8?0:i<8?i+1:i}`,checked:true,
      })), 'pointed b8 becomes b0; old b0..b7 each +1, b9+ unchanged');
      await page.waitForFunction(()=>/跨越 8 块，区间编号整体 \+1/.test(
        document.querySelector('.ocr-pdf-status')?.textContent||''),null,{timeout:9000});
      assert.equal(await page.locator('.ocr-pdf-block-cover[data-block-id="p16b8"] .ocr-pdf-block-ctrl span')
        .innerText(),'p16b0',"pointed b8 becomes the new b0");
      assert.equal(await page.locator('.ocr-pdf-block-ctrl input:checked').count(),224);
      await page.locator('.ocr-pdf-block-cover[data-block-id="p16b0"] input').click();
      await page.waitForFunction(()=>{
        const node=document.querySelector('.ocr-pdf-block-cover[data-block-id="p16b0"]');
        return node?.querySelector('input')?.checked===false&&
          node.querySelector('.ocr-pdf-block-ctrl span')?.textContent==='p16b0';
      },null,{timeout:22000});
      assert.equal(await page.locator('.ocr-pdf-block-cover[data-block-id="p16b0"] .ocr-pdf-block-ctrl span')
        .innerText(),'p16b0','unchecking joins the moved original b8');
      await page.locator('#undo').click();
      await page.waitForFunction(()=>document.querySelector(
        '.ocr-pdf-block-cover[data-block-id="p16b0"] input')?.checked===true&&
        document.querySelector('.ocr-pdf-block-cover[data-block-id="p16b0"] .ocr-pdf-block-ctrl span')
          ?.textContent==='p16b1',null,{timeout:20000});
      // Opposite-direction gesture: from the new b0 (physical b8), point
      // to former b0 (now b1). Pulling that ONE block forward is not Undo:
      // it yields old b0, old b8, old b1..b7; all labels remain contiguous.
      await dst.scrollIntoViewIfNeeded();
      const reverseFrom=await dst.boundingBox(),reversePane=await scroller.boundingBox();
      const reverseTo=await src.boundingBox();
      assert(reverseFrom&&reversePane&&reverseTo);
      assert(reverseTo.y+reverseTo.height<reversePane.y,
        'the earlier b0 target must start above the visible PDF pane');
      const reverseStart={x:reverseFrom.x+reverseFrom.width*.75,
        y:reverseFrom.y+reverseFrom.height/2};
      const reverseEdge={x:Math.max(reversePane.x+15,
        Math.min(reversePane.x+reversePane.width-15,reverseStart.x)),
        y:reversePane.y+9};
      const beforeScroll=await scroller.evaluate(el=>el.scrollTop);
      await dst.dispatchEvent('pointerdown',{...pointer,pointerId:42,
        clientX:reverseStart.x,clientY:reverseStart.y});
      await page.locator('.ocr-pdf-block-drag-source').waitFor({timeout:1900});
      await page.locator('body').dispatchEvent('pointermove',{...pointer,pointerId:42,
        clientX:reverseEdge.x,clientY:reverseEdge.y});
      await page.waitForFunction(previous=>document.querySelector('.ocr-pdf-scroller')
        ?.scrollTop<previous-40,beforeScroll,{timeout:7500});
      await page.waitForFunction(()=>{
        const viewport=document.querySelector('.ocr-pdf-scroller')?.getBoundingClientRect();
        const target=document.querySelector(
          '.ocr-pdf-block-cover[data-block-id="p16b0"] .ocr-pdf-block-ctrl')?.getBoundingClientRect();
        return viewport&&target&&target.top>viewport.top+8&&target.bottom<viewport.bottom-8;
      },null,{timeout:7500});
      const beforeTarget=await src.boundingBox();
      const dropBefore={x:beforeTarget.x+beforeTarget.width*.75,
        y:beforeTarget.y+beforeTarget.height/2};
      await page.locator('body').dispatchEvent('pointermove',{...pointer,pointerId:42,
        clientX:dropBefore.x,clientY:dropBefore.y});
      await page.locator('.ocr-pdf-block-cover[data-block-id="p16b0"].ocr-pdf-block-drop-target')
        .waitFor({timeout:2000});
      assert.match(await page.locator('.ocr-pdf-status').innerText(),/松手将它移到起点.*前面/);
      await page.locator('body').dispatchEvent('pointerup',{...pointer,pointerId:42,
        clientX:dropBefore.x,clientY:dropBefore.y});
      await page.waitForFunction(()=>document.querySelector(
        '.ocr-pdf-block-cover[data-block-id="p16b0"] .ocr-pdf-block-ctrl span')
        ?.textContent==='p16b0',null,{timeout:24000});
      const beforeLabels=await page.evaluate(()=>Array.from({length:16},(_,i)=>{
        const node=document.querySelector(`.ocr-pdf-block-cover[data-block-id="p16b${i}"]`);
        return {id:node?.dataset.blockId,
          label:node?.querySelector('.ocr-pdf-block-ctrl span')?.textContent,
          checked:node?.querySelector('input')?.checked};
      }));
      assert.deepEqual(beforeLabels,Array.from({length:16},(_,i)=>({
        id:`p16b${i}`,label:`p16b${i===0?0:i===8?1:i<8?i+1:i}`,checked:true
      })),'pulling the pointed b1 before current b0 moves only b1');
      await page.waitForFunction(()=>/跨越 1 块，区间编号整体 \+1/.test(
        document.querySelector('.ocr-pdf-status')?.textContent||''),null,{timeout:9000});
      await page.locator('#undo').click();
      await page.waitForFunction(()=>document.querySelector(
        '.ocr-pdf-block-cover[data-block-id="p16b8"] .ocr-pdf-block-ctrl span')
        ?.textContent==='p16b0',null,{timeout:22000});
      await page.locator('#undo').click();
      await page.waitForFunction(()=>document.querySelector(
        '.ocr-pdf-block-cover[data-block-id="p16b8"] .ocr-pdf-block-ctrl span')
        ?.textContent==='p16b8',null,{timeout:22000});
      assert.equal(await page.locator('.ocr-pdf-block-ctrl input:checked').count(),224);
      assert.equal(readFileSync(sample,'utf8'),original,'fixture must remain byte-exact');
      assert.deepEqual(errors,[]);
      console.log('PDF_BLOCK_EDGE_SCROLL_PASS',name,{source:'p16b0',
        target:'p16b8',scrollDelta:actualAutoScroll,
        checkboxes:224,undo:true,errors:errors.length});
    }finally{await browser.close();}
  }
}finally{server.kill('SIGTERM');}
