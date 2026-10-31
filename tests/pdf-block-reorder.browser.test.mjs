/** Test the actual PDF UI long-press → arrow → CMD single move → join → undo. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium,webkit} from 'playwright';
const sample=resolve('.v6/tests/text-blocks/buffett-reinitialized.minerujson.md');
const source=readFileSync(sample,'utf8'),port=5997,url=`http://127.0.0.1:${port}/`;
mkdirSync('.v6/evidence/block-reorder',{recursive:true});
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1',
  '--port',String(port),'--strictPort'],{cwd:process.cwd(),stdio:'ignore',
  env:{...process.env,V6_DOCUMENT_PATH:sample}});
try{
  let ready=false;
  for(let i=0;i<250;i++){
    try{if((await fetch(url)).ok){ready=true;break;}}catch{}
    await new Promise(r=>setTimeout(r,100));
  }
  assert(ready,'V6 test UI unavailable');
  for(const [name,engine,mobile] of [['Chrome',chromium,false],['iPad-WebKit',webkit,true]]){
    if(process.env.ONE_BROWSER&&process.env.ONE_BROWSER!==name)continue;
    const browser=await engine.launch({headless:true});
    try{
      const page=await browser.newPage({viewport:{width:1220,height:840},
        isMobile:mobile,hasTouch:mobile});
      const errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
      await page.locator('.ocr-lab-ag-toolbar .ocr-navigation-elements .ts-control').evaluate(el=>el.click());
      await page.locator('.ocr-navigation-popup-elements:visible [data-value="text-block"]').evaluate(el=>el.click());
      await page.waitForFunction(()=>/原始 224 块/.test(document.querySelector('#status')?.textContent||''),
        null,{timeout:30000});
      await page.getByRole('checkbox',{name:'文本块覆盖显示'}).evaluate(el=>{if(!el.checked)el.click();});
      await page.waitForFunction(()=>document.querySelectorAll('.ocr-pdf-block-cover').length===224,
        null,{timeout:26000});
      await page.locator('.ocr-preview-switchbar .ocr-navigation-preview .ts-control').evaluate(el=>el.click());
      await page.locator('.ocr-navigation-popup-preview:visible [data-value="pdf"]').evaluate(el=>el.click());
      const src=page.locator('.ocr-pdf-block-cover[data-block-id="p6b7"] .ocr-pdf-block-ctrl');
      const dst=page.locator('.ocr-pdf-block-cover[data-block-id="p6b8"] .ocr-pdf-block-ctrl');
      await src.scrollIntoViewIfNeeded();
      const a=await src.boundingBox(),b=await dst.boundingBox();
      assert(a&&b,'source/target must be visible');
      const start={x:a.x+a.width*.75,y:a.y+a.height/2};
      const end={x:b.x+b.width*.75,y:b.y+b.height/2};
      assert(end.x>0&&end.y>0&&end.y<840,'drag target must be visible');
      // Synthetic pointer stream exercises both Chrome and iPad WebKit input
      // handlers without depending on OS gestures/screen coordinates.
      const pointer={pointerId:31,pointerType:'touch',button:0,isPrimary:true};
      await src.dispatchEvent('pointerdown',{...pointer,clientX:start.x,clientY:start.y});
      await page.locator('.ocr-pdf-block-drag-source').waitFor({timeout:2000});
      assert(await page.locator('.ocr-pdf-block-drag-arrow').count()===1);
      await src.dispatchEvent('pointermove',{...pointer,clientX:end.x,clientY:end.y});
      await page.locator('.ocr-pdf-block-cover[data-block-id="p6b8"].ocr-pdf-block-drop-target')
        .waitFor({timeout:1500});
      await page.screenshot({path:`.v6/evidence/block-reorder/${name}-arrow.png`,
        animations:'disabled'});
      await src.dispatchEvent('pointerup',{...pointer,clientX:end.x,clientY:end.y});
      await page.waitForFunction(()=>
        document.querySelector('.ocr-pdf-block-cover[data-block-id="p6b7"] .ocr-pdf-block-ctrl span')
          ?.textContent==='p6b8',null,{timeout:25000});
      assert.equal(await page.locator('.ocr-pdf-block-cover[data-block-id="p6b8"] .ocr-pdf-block-ctrl span').innerText(),'p6b7');
      assert.equal(await page.locator('.ocr-pdf-block-cover[data-block-id="p6b9"] .ocr-pdf-block-ctrl span').innerText(),'p6b9');
      assert.equal(await page.locator('.ocr-pdf-block-cover[data-block-id="p5b1"] .ocr-pdf-block-ctrl span').innerText(),'p5b1');
      assert.equal(await page.locator('.ocr-pdf-block-ctrl input:checked').count(),224,
        'drag must not automatically uncheck a Block');
      assert.equal(await page.locator('.ocr-pdf-block-drag-arrow').count(),0);
      await page.screenshot({path:`.v6/evidence/block-reorder/${name}-reordered.png`,
        animations:'disabled'});
      // Uncheck the moved block: its CMD predecessor must now be p6b8.
      await page.locator('.ocr-pdf-block-cover[data-block-id="p6b7"] input').click();
      await page.waitForFunction(()=>/已接续 1/.test(document.querySelector('#status')?.textContent||''),
        null,{timeout:25000});
      assert.equal(await page.locator('.ocr-pdf-block-cover[data-block-id="p6b7"] .ocr-pdf-block-ctrl span').innerText(),'p6b7');
      // CMD Undo #1 cancels the join; Undo #2 restores original source order.
      await page.locator('#undo').click();
      await page.waitForFunction(()=>document.querySelector('.ocr-pdf-block-cover[data-block-id="p6b7"] input')?.checked,
        null,{timeout:16000});
      await page.locator('#undo').click();
      await page.waitForFunction(()=>document.querySelector('.ocr-pdf-block-cover[data-block-id="p6b7"] .ocr-pdf-block-ctrl span')
        ?.textContent==='p6b7',null,{timeout:25000});
      assert.equal(await page.locator('.ocr-pdf-block-cover[data-block-id="p6b9"] .ocr-pdf-block-ctrl span').innerText(),'p6b9');
      assert.equal(await page.locator('.ocr-pdf-block-ctrl').count(),224);
      // Regression: an already unchecked Block is itself draggable. Its
      // join marker must follow the Block, not remain attached to old source
      // neighborhood. This is the case previously blocked on page 17.
      const joined=page.locator('.ocr-pdf-block-cover[data-block-id="p6b7"] input');
      await joined.click();
      await page.waitForFunction(()=>document.querySelector('.ocr-pdf-block-cover[data-block-id="p6b7"] input')
        ?.checked===false,null,{timeout:22000});
      await src.scrollIntoViewIfNeeded();
      const fromBox=await src.boundingBox(),toBox=await dst.boundingBox();
      const from={x:fromBox.x+fromBox.width*.75,y:fromBox.y+fromBox.height/2};
      const to={x:toBox.x+toBox.width*.75,y:toBox.y+toBox.height/2};
      await src.dispatchEvent('pointerdown',{...pointer,clientX:from.x,clientY:from.y});
      await page.locator('.ocr-pdf-block-drag-source').waitFor({timeout:2000});
      await src.dispatchEvent('pointermove',{...pointer,clientX:to.x,clientY:to.y});
      await page.locator('.ocr-pdf-block-cover[data-block-id="p6b8"].ocr-pdf-block-drop-target')
        .waitFor({timeout:1800});
      await src.dispatchEvent('pointerup',{...pointer,clientX:to.x,clientY:to.y});
      await page.waitForFunction(()=>document.querySelector('.ocr-pdf-block-cover[data-block-id="p6b7"] .ocr-pdf-block-ctrl span')
        ?.textContent==='p6b7',null,{timeout:25000});
      assert.equal(await page.locator('.ocr-pdf-block-cover[data-block-id="p6b7"] input').isChecked(),false);
      assert.equal(await page.locator('.ocr-pdf-block-cover[data-block-id="p6b8"] .ocr-pdf-block-ctrl span').innerText(),'p6b7');
      assert(!((await page.locator('#status').innerText()).includes('排序失败')));
      await page.locator('#undo').click();
      await page.waitForFunction(()=>document.querySelector('.ocr-pdf-block-cover[data-block-id="p6b7"] .ocr-pdf-block-ctrl span')
        ?.textContent==='p6b6',null,{timeout:25000});
      await page.locator('#undo').click();
      await page.waitForFunction(()=>document.querySelector('.ocr-pdf-block-cover[data-block-id="p6b7"] input')
        ?.checked===true,null,{timeout:25000});
      assert.equal(await page.locator('.ocr-pdf-block-ctrl input:checked').count(),224);
      // Same-row across-column case reported on page 17: p16b9 (right)
      // moved before earlier p16b0 (left), not just nearby chips.
      const acrossFrom=page.locator('.ocr-pdf-block-cover[data-block-id="p16b9"] .ocr-pdf-block-ctrl');
      const acrossTo=page.locator('.ocr-pdf-block-cover[data-block-id="p16b0"] .ocr-pdf-block-ctrl');
      await acrossFrom.scrollIntoViewIfNeeded();
      const fromCross=await acrossFrom.boundingBox(),toCross=await acrossTo.boundingBox();
      assert(fromCross&&toCross);
      const crossStart={x:fromCross.x+fromCross.width*.75,y:fromCross.y+fromCross.height/2};
      const crossEnd={x:toCross.x+toCross.width*.75,y:toCross.y+toCross.height/2};
      const hit=await page.evaluate(({x,y})=>{
        const element=document.elementFromPoint(x,y);
        return {node:element?.tagName,chip:element?.closest('.ocr-pdf-block-cover')?.dataset.blockId,
          viewport:[window.innerWidth,window.innerHeight]};
      },crossEnd);
      console.log('CROSS_COLUMN_HIT',name,{crossStart,crossEnd,hit});
      assert.equal(hit.chip,'p16b0','the left gutter label must be a real hit target');
      const fingerEnd={x:toCross.x+toCross.width+17,y:crossEnd.y};
      assert.notEqual(await page.evaluate(({x,y})=>
        document.elementFromPoint(x,y)?.closest('.ocr-pdf-block-ctrl')?.closest('.ocr-pdf-block-cover')?.dataset.blockId,
        fingerEnd),'p16b0','the test must release outside the 9px label');
      await acrossFrom.dispatchEvent('pointerdown',{...pointer,clientX:crossStart.x,clientY:crossStart.y});
      await page.locator('.ocr-pdf-block-drag-source').waitFor({timeout:2000});
      // Move event is dispatched to the DOCUMENT (as can happen on iPad
      // after losing original source-label pointer capture).
      await page.locator('body').dispatchEvent('pointermove',
        {...pointer,clientX:fingerEnd.x,clientY:fingerEnd.y});
      await page.locator('.ocr-pdf-block-cover[data-block-id="p16b0"].ocr-pdf-block-drop-target')
        .waitFor({timeout:1500});
      await page.locator('body').dispatchEvent('pointerup',
        {...pointer,clientX:fingerEnd.x,clientY:fingerEnd.y});
      await page.waitForFunction(()=>document.querySelector('.ocr-pdf-block-cover[data-block-id="p16b9"] .ocr-pdf-block-ctrl span')?.textContent==='p16b0',
        null,{timeout:25000});
      assert.equal(await page.locator('.ocr-pdf-block-cover[data-block-id="p16b0"] .ocr-pdf-block-ctrl span').innerText(),'p16b1');
      assert.equal(await page.locator('.ocr-pdf-block-cover[data-block-id="p16b1"] .ocr-pdf-block-ctrl span').innerText(),'p16b2');
      await page.locator('#undo').click();
      await page.waitForFunction(()=>document.querySelector('.ocr-pdf-block-cover[data-block-id="p16b9"] .ocr-pdf-block-ctrl span')?.textContent==='p16b9',
        null,{timeout:25000});
      // User screenshot: physical p16b10 displays logical b8; p16b11 is
      // unchecked and joined into b8. Moving b8 ahead of b0 must carry its
      // child and preserve every other logical block / checkbox state.
      for(const id of ['p16b3','p16b5','p16b11']){
        await page.locator(`.ocr-pdf-block-cover[data-block-id="${id}"] input`).click();
        await page.waitForFunction(id=>document.querySelector(
          `.ocr-pdf-block-cover[data-block-id="${id}"] input`)?.checked===false,
          id,{timeout:24000});
      }
      await page.waitForFunction(()=>document.querySelector(
        '.ocr-pdf-block-cover[data-block-id="p16b10"] .ocr-pdf-block-ctrl span')
        ?.textContent==='p16b8',null,{timeout:24000});
      const groupedFrom=page.locator('.ocr-pdf-block-cover[data-block-id="p16b10"] .ocr-pdf-block-ctrl');
      const groupedTo=page.locator('.ocr-pdf-block-cover[data-block-id="p16b0"] .ocr-pdf-block-ctrl');
      const pdfScroller=page.locator('.ocr-pdf-scroller');
      await groupedFrom.scrollIntoViewIfNeeded();
      const sourceBox=await groupedFrom.boundingBox();assert(sourceBox);
      const pointer43={...pointer,pointerId:43};
      const groupStart={x:sourceBox.x+sourceBox.width*.75,y:sourceBox.y+sourceBox.height/2};
      await groupedFrom.dispatchEvent('pointerdown',{
        ...pointer43,clientX:groupStart.x,clientY:groupStart.y});
      await page.locator('.ocr-pdf-block-drag-source').waitFor({timeout:2200});
      const pane=await pdfScroller.boundingBox(),groupTargetBox=await groupedTo.boundingBox();
      assert(pane&&groupTargetBox);
      if(groupTargetBox.y<pane.y+9||groupTargetBox.y+groupTargetBox.height>pane.y+pane.height-9){
        const atBottom=groupTargetBox.y>pane.y+pane.height;
        await page.locator('body').dispatchEvent('pointermove',{
          ...pointer43,clientX:Math.max(pane.x+15,Math.min(pane.x+pane.width-15,groupStart.x)),
          clientY:atBottom?pane.y+pane.height-9:pane.y+9});
        await page.waitForFunction(()=>{
          const pane=document.querySelector('.ocr-pdf-scroller')?.getBoundingClientRect();
          const target=document.querySelector(
            '.ocr-pdf-block-cover[data-block-id="p16b0"] .ocr-pdf-block-ctrl')?.getBoundingClientRect();
          return pane&&target&&target.top>pane.top+8&&target.bottom<pane.bottom-8;
        },null,{timeout:8500});
      }
      const finalBox=await groupedTo.boundingBox();assert(finalBox);
      const groupEnd={x:finalBox.x+finalBox.width*.75,y:finalBox.y+finalBox.height/2};
      await page.locator('body').dispatchEvent('pointermove',{
        ...pointer43,clientX:groupEnd.x,clientY:groupEnd.y});
      await page.locator('.ocr-pdf-block-cover[data-block-id="p16b0"].ocr-pdf-block-drop-target')
        .waitFor({timeout:2300});
      assert.match(await page.locator('.ocr-pdf-status').innerText(),/目标 p16b0 · 松手将当前块排到其前/);
      await page.locator('body').dispatchEvent('pointerup',{
        ...pointer43,clientX:groupEnd.x,clientY:groupEnd.y});
      await page.waitForFunction(()=>{
        const label=id=>document.querySelector(
          `.ocr-pdf-block-cover[data-block-id="${id}"] .ocr-pdf-block-ctrl span`)?.textContent;
        return label('p16b10')==='p16b0'&&label('p16b11')==='p16b0'&&
          label('p16b0')==='p16b1';
      },null,{timeout:26000});
      assert.equal(await page.locator('.ocr-pdf-block-ctrl input:checked').count(),221);
      await page.locator('#undo').click();
      await page.waitForFunction(()=>document.querySelector(
        '.ocr-pdf-block-cover[data-block-id="p16b10"] .ocr-pdf-block-ctrl span')
        ?.textContent==='p16b8',null,{timeout:22000});
      assert.equal(await page.locator('.ocr-pdf-block-cover[data-block-id="p16b11"] input').isChecked(),false);
      for(const id of ['p16b11','p16b5','p16b3']){
        await page.locator('#undo').click();
        await page.waitForFunction(id=>document.querySelector(
          `.ocr-pdf-block-cover[data-block-id="${id}"] input`)?.checked===true,
          id,{timeout:22000});
      }
      assert.equal(await page.locator('.ocr-pdf-block-ctrl input:checked').count(),224);
      console.log('PDF_LOGICAL_B8_TO_B0_PASS',name,{joinedChild:'p16b11',
        source:'p16b10',target:'p16b0',originalCheckStateRestored:true});
      assert.deepEqual(errors,[]);
      assert.equal(readFileSync(sample,'utf8'),source,'unsaved edits must never alter fixture');
      console.log('PDF_BLOCK_REORDER_PASS',name,{moved:'p6b7 after p6b8',
        crossColumn:'p16b9 before p16b0 (+17px touch tolerance)',
        arrow:true,checkCount:224,joinAfterMove:true,undoRestores:true,errors:errors.length});
    }finally{await browser.close();}
  }
}finally{server.kill('SIGTERM');}
