/** Exact screenshot regression: page 5 p4b0 has three real PDF rectangles,
 * but only ONE original MinerU block and checkbox. Never write user's data. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium,webkit} from 'playwright';
import {planCMDSubblockAnnotations} from '../ui/cmd-text-blocks.js';
const original=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8');
const childPlan=await planCMDSubblockAnnotations(original);
const annotated=[...childPlan.edits].sort((a,b)=>b.from-a.from)
  .reduce((src,e)=>src.slice(0,e.from)+e.insert+src.slice(e.to),original).split('\n');
const markerLine=id=>annotated.findIndex(line=>line.includes(`id="${id}"`))+1;
const temp=mkdtempSync(join(tmpdir(),'ocr2md-pdf-parts-'));
const doc=join(temp,'document.md');writeFileSync(doc,original);
const port=5971,url=`http://127.0.0.1:${port}/`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1',
  '--port',String(port),'--strictPort'],{cwd:process.cwd(),stdio:'ignore',
  env:{...process.env,V6_DOCUMENT_PATH:doc,V6_SETTINGS_PATH:join(temp,'settings.json')}});
try{
  let ready=false;for(let i=0;i<240;i++){
    try{if((await fetch(url)).ok){ready=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,140));
  }
  assert(ready,'Isolated Vite server unavailable');
  for(const [name,engine,mobile] of [['Chrome',chromium,false],['iPad-WebKit',webkit,true]]){
    if(process.env.ONE_BROWSER&&process.env.ONE_BROWSER!==name)continue;
    const browser=await engine.launch({headless:true});
    try{
      const page=await browser.newPage({viewport:{width:1220,height:840},isMobile:mobile,hasTouch:mobile});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(url,{waitUntil:'domcontentloaded',timeout:50000});
      await page.locator('.ocr-preview-switchbar .ocr-navigation-preview .ts-control').evaluate(el=>el.click());
      await page.locator('.ocr-navigation-popup-preview:visible [data-value="pdf"]').evaluate(el=>el.click());
      await page.waitForFunction(()=>document.querySelectorAll('.ocr-pdf-block-cover').length===224,
        null,{timeout:40000});
      // p3b0 is the reported page-3 table: MinerU has two native children.
      // Both MUST have separate VISIBLE IDs at their own original bboxes.
      const table3=page.locator('.ocr-pdf-block-cover[data-block-id="p3b0"]');
      await table3.scrollIntoViewIfNeeded({timeout:24000});
      await page.waitForFunction(()=>document.querySelector(
        '.ocr-pdf-block-cover[data-block-id="p3b0"]')?.closest('.page')
        ?.querySelector('canvas')?.width>0,null,{timeout:25000});
      assert.deepEqual(await table3.locator(':scope > .ocr-pdf-block-fragment')
        .evaluateAll(parts=>parts.map(part=>({id:part.dataset.subblockId,
          role:part.dataset.partRole,chip:part.querySelector('.ocr-pdf-subblock-chip')?.textContent}))),[
        {id:'p3b0s0',role:'caption',chip:'p3b0s0'},
        {id:'p3b0s1',role:'body',chip:'p3b0s1'},
      ]);
      const assertParentRect=async(locator,expected,name)=>{
        const coords=await locator.evaluate(node=>{
          const b=node.getBoundingClientRect(),p=node.closest('.page').getBoundingClientRect();
          return [(b.left-p.left)/p.width*594,(b.top-p.top)/p.height*783,
            (b.right-p.left)/p.width*594,(b.bottom-p.top)/p.height*783];
        });
        coords.forEach((value,i)=>assert(Math.abs(value-expected[i])<3,
          `${name} parent must be the enclosing rectangle of child OCR boxes: ${coords}`));
      };
      await assertParentRect(table3,[68,89,538,458],'p3b0');
      // ALL native parent/child chips are visible without interaction.
      // Each label is laid out at a free Y anywhere along its own OCR bbox,
      // not forcibly adjacent to the top edge. Parent and child chip share
      // the SAME page-side collision solver and remain spatially distinct.
      assert.deepEqual(await table3.locator('.ocr-pdf-subblock-chip')
        .evaluateAll(nodes=>nodes.map(n=>getComputedStyle(n).display)),['block','block']);
      assert.equal(await page.locator('.ocr-pdf-children-menu').count(),0);
      const positioned=await table3.evaluate(node=>{
        const nodes=[node.querySelector(':scope > .ocr-pdf-block-ctrl'),
          ...node.querySelectorAll('.ocr-pdf-subblock-chip')];
        return nodes.map(el=>{
          const r=el.getBoundingClientRect();
          const box=el.classList.contains('ocr-pdf-block-ctrl')?node:
            el.closest('.ocr-pdf-block-fragment');
          const b=box.getBoundingClientRect();
          return {id:el.textContent,top:r.top,bottom:r.bottom,
            from:b.top,to:b.bottom,side:el.dataset.gutter,
            visible:r.width>2&&r.height>3,link:Boolean(getComputedStyle(el,'::after').content!== 'none')};
        });
      });
      assert(positioned.every(x=>x.visible),`${name} every parent and child label visible`);
      assert(positioned.some(x=>x.id==='p3b0s1'&&x.top-x.from>20),
        `${name} body label must be free to move down INSIDE its tall bbox`);
      assert(positioned.every(x=>x.top>=x.from-2&&x.bottom<=x.to+2),
        `${name} all p3b0 labels should fit inside their own Y ranges`);
      for(let i=0;i<positioned.length;i++)for(let j=i+1;j<positioned.length;j++){
        const a=positioned[i],b=positioned[j];
        assert(a.bottom<=b.top-1||b.bottom<=a.top-1,
          `${name} parent/child label collision ${a.id} vs ${b.id}`);
      }
      const childChip=table3.locator('.ocr-pdf-subblock-chip').first();
      await childChip.evaluate(el=>el.click());
      await page.waitForFunction(async expected=>{
        const {viewStore}=await import('/view-store.js');
        return viewStore.getState().focusTarget?.sourceLine===expected&&
          document.querySelector('.ocr-pdf-status')?.textContent?.includes('已自动补标');
      },markerLine('p3b0s0'),{timeout:28000});
      assert.equal(readFileSync(doc,'utf8'),original,'PDF child click must not save edits');
      for(const [index,id] of [[0,'p3b0s0'],[1,'p3b0s1']]){
        const rects=await table3.evaluate((node,index)=>{
          const frag=node.querySelectorAll(':scope > .ocr-pdf-block-fragment')[index];
          const b=frag.getBoundingClientRect();
          return {x:b.left+b.width/2,y:b.top+b.height/2};
        },index);

        await table3.evaluate((node,xy)=>{
          node.closest('.page').querySelector('canvas').dispatchEvent(new MouseEvent('click',
            {bubbles:true,clientX:xy.x,clientY:xy.y}));
        },rects);
        await page.waitForFunction(async expected=>{
          const {viewStore}=await import('/view-store.js');
          return viewStore.getState().focusTarget?.sourceLine===expected.line&&
            document.querySelector('.ocr-pdf-status')?.textContent?.includes(`源码第 ${expected.line} 行`);
        },{line:markerLine(id)},{timeout:16000});
      }
      const block=page.locator('.ocr-pdf-block-cover[data-block-id="p4b0"]');
      await block.scrollIntoViewIfNeeded({timeout:25000});
      await page.waitForFunction(()=>document.querySelector(
        '.ocr-pdf-block-cover[data-block-id="p4b0"]')?.closest('.page')
        ?.querySelector('canvas')?.width>0,null,{timeout:30000});
      await assertParentRect(block,[50,89,521,339],'p4b0');
      assert.equal(await block.locator('.ocr-pdf-block-ctrl input').count(),1);
      assert.deepEqual(await block.locator(':scope > .ocr-pdf-block-fragment')
        .evaluateAll(nodes=>nodes.map(el=>el.dataset.partRole)),['caption','body','note']);
      const observations=[];
      const bboxFor=async(partIndex)=>block.evaluate((node,partIndex)=>{
        const region=partIndex<0?node:node.querySelectorAll(':scope > .ocr-pdf-block-fragment')[partIndex];
        const b=region.getBoundingClientRect();
        return {x:(b.left+b.right)/2,y:(b.top+b.bottom)/2,
          width:b.width,height:b.height};
      },partIndex);
      for(const [partIndex,role] of [[0,'caption'],[1,'body'],[2,'note']]){
        const pt=await bboxFor(partIndex);
        await block.evaluate((node,{x,y})=>{
          node.closest('.page').querySelector('canvas').dispatchEvent(
            new MouseEvent('click',{bubbles:true,clientX:x,clientY:y}));
        },pt);
        await page.waitForFunction(expected=>document.querySelector('.ocr-pdf-region-overlay')
          ?.dataset.partRole===expected,role,{timeout:18000});
        await page.waitForFunction(async expected=>{
          const {viewStore}=await import('/view-store.js');
          return viewStore.getState().focusTarget?.sourceLine===expected;
        },markerLine(`p4b0s${partIndex}`),{timeout:16000});
        const overlay=page.locator('.ocr-pdf-region-overlay');
        assert.equal(await overlay.getAttribute('data-block-index'),'0');
        assert.equal(await overlay.getAttribute('data-pdf-page'),'5');
        const rect=await overlay.boundingBox();
        assert(rect,`${name} ${role} overlay missing`);
        const expected=await bboxFor(partIndex);
        assert(Math.abs(rect.width-expected.width)<3&&Math.abs(rect.height-expected.height)<3,
          `${name} ${role} highlight must match its own rectangle`);
        const button=page.locator('.ocr-pdf-extract-text');
        // PDF text layers may be empty for rasterized table body; the action
        // must describe current region and never borrow neighboring text.
        await page.waitForTimeout(450);
        observations.push({role,enabled:await button.isEnabled(),title:await button.getAttribute('title')});
      }
      assert.deepEqual(observations.map(x=>x.enabled),[true,true,true],
        'screenshot regions caption, body and notes each have independently extractable PDF text');
      // The source editor must actually render the target child tag, not
      // merely publish a correct but unconsumed focus event.
      await page.waitForFunction(id=>[...document.querySelectorAll('.cm-line')]
        .some(line=>line.textContent?.includes(`id="${id}"`)),
        'p4b0s2',{timeout:15000});
      assert.deepEqual(errors,[]);
      assert.equal(readFileSync(doc,'utf8'),original,
        'automatic legacy child annotation is unsaved until the user saves');
      await page.locator('#undo').evaluate(e=>e.click());
      await page.locator('#save').evaluate(e=>e.click());
      await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('已保存'),
        null,{timeout:23000});
      assert.equal(readFileSync(doc,'utf8'),original,
        'one Undo must reverse all automatically added CMD child tags');
      console.log('PDF_CHILD_REGION_SELECT_PASS',name,observations);
    }finally{await browser.close();writeFileSync(doc,original);}
  }
}finally{server.kill('SIGTERM');rmSync(temp,{recursive:true,force:true});}
