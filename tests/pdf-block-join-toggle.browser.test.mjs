import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium,webkit} from 'playwright';
import {ensureTextBlockSample} from './fixtures/text-block-sample.mjs';
const sample=ensureTextBlockSample();
const original=readFileSync(sample,'utf8');
const port=process.env.ONE_BROWSER==='iPad-WebKit'?5996:5995;
const url=`http://127.0.0.1:${port}/`;
mkdirSync('.v6/evidence/block-join-toggle',{recursive:true});
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{
  cwd:process.cwd(),stdio:'ignore',env:{...process.env,V6_DOCUMENT_PATH:sample}});
try{
 let ready=false;for(let i=0;i<250;i++){
  try{if((await fetch(url)).ok){ready=true;break;}}catch{}
  await new Promise(r=>setTimeout(r,100));
 }assert(ready,'test frontend unavailable');
 for(const [name,engine,mobile] of [['Chrome',chromium,false],['iPad-WebKit',webkit,true]]){
  if(process.env.ONE_BROWSER&&name!==process.env.ONE_BROWSER)continue;
  const browser=await engine.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:{width:1220,height:840},isMobile:mobile,hasTouch:mobile});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   const requests=[];await page.route('**/api/pdf-map',route=>{requests.push(route.request().url());return route.abort();});
   await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
   await page.locator('.ocr-lab-ag-toolbar .ocr-navigation-elements .ts-control').click();
   await page.locator('.ocr-navigation-popup-elements:visible [data-value="text-block"]').click();
   await page.waitForFunction(()=>/原始 224 块/.test(document.querySelector('#status')?.textContent||''),null,{timeout:30000});
   assert.equal(await page.locator('.ocr-preview-switchbar .ocr-preview-block-toggle input').count(),1,
        'shared preview toolbar must contain exactly one text-block toggle');
   await page.waitForFunction(()=>document.querySelectorAll('.ocr-pdf-block-cover').length===224,null,{timeout:24000});
   const first=page.locator('.ocr-pdf-block-ctrl input[aria-label="文本块 p0b0 独立"]');
   const empty=page.locator('.ocr-pdf-block-ctrl input[aria-label="文本块 p2b8 独立"]');
   const target=page.locator('.ocr-pdf-block-ctrl input[aria-label="文本块 p6b7 独立"]');
   const crossHead=page.locator('.ocr-pdf-block-ctrl input[aria-label="文本块 p9b0 独立"]');
   assert(await first.isDisabled(),'only document first has no predecessor');
   assert(await crossHead.isDisabled(),'cross-page block checkbox is read-only even where a predecessor exists');
   assert(await empty.isDisabled(),'empty OCR source box must remain structurally read-only');
   assert(await page.locator('.ocr-pdf-block-ctrl input[aria-label="文本块 p0b1 独立"]').isDisabled(),
     'title block may not be implicitly joined');
   assert(await page.locator('.ocr-pdf-block-ctrl input[aria-label="文本块 p0b5 独立"]').isDisabled(),
     'image block may not be implicitly joined');
   assert(await page.locator('.ocr-pdf-block-ctrl input[aria-label="文本块 p8b6 独立"]').isDisabled(),
     'formula block may not be implicitly joined');
   assert(await page.locator('.ocr-pdf-block-ctrl input[aria-label="文本块 p21b2 独立"]').isDisabled(),
     'reference block may not be implicitly joined');
   const checkboxStatus=await page.locator('.ocr-pdf-block-ctrl input').evaluateAll(inputs=>({
     checked:inputs.filter(x=>x.checked).length,
     enabled:inputs.filter(x=>!x.disabled).length,
     disabled:inputs.filter(x=>x.disabled).length,
   }));
   assert.deepEqual(checkboxStatus,{checked:224,enabled:0,disabled:224});
   assert(await target.isChecked());
   assert(await target.isDisabled());
   assert.equal(await page.locator('.ocr-pdf-block-ctrl').count(),224);
   // Measure rendered page geometry only after switching PDF to the active
   // preview. Hidden PDF.js panes have zero/ghost CSS rectangles.
   await page.locator('.ocr-preview-switchbar .ocr-navigation-preview .ts-control').click();
   await page.locator('.ocr-navigation-popup-preview:visible [data-value="pdf"]').click();
   await page.waitForFunction(()=>document.querySelector('.ocr-pdf-block-cover')?.getBoundingClientRect().width>3,
     null,{timeout:25000});
   // MinerU stores chart/table captions and notes as children of the same
   // original Block, frequently OUTSIDE the parent body bbox. They must be
   // visibly covered at their exact OCR coordinates, never get fake checkboxes.
   const childRects=await page.locator('.ocr-pdf-block-cover[data-block-id="p13b1"]').evaluate(node=>{
     const paper=node.closest('.page').getBoundingClientRect();
     return [...node.querySelectorAll(':scope > .ocr-pdf-block-fragment')].map(fragment=>{
       const b=fragment.getBoundingClientRect();
       return {type:fragment.dataset.partType,role:fragment.dataset.partRole,
         rect:[(b.left-paper.left)/paper.width*594,(b.top-paper.top)/paper.height*783,
           (b.right-paper.left)/paper.width*594,(b.bottom-paper.top)/paper.height*783],
         pointer:getComputedStyle(fragment).pointerEvents,
         background:getComputedStyle(fragment).backgroundColor};
     });
   });
   assert.deepEqual(childRects.map(x=>x.type),['chart_caption','chart_body','chart_caption']);
   assert.deepEqual(childRects.map(x=>x.role),['caption','body','note']);
   for(const [i,expected] of [[0,[217,82,494,107]],[1,[219,108,529,357]],[2,[206,371,539,490]]]){
     assert.equal(childRects[i].pointer,'none');
     if(i===1)assert.equal(childRects[i].background,'rgba(0, 0, 0, 0)',
       'body child already inherits tinted union parent: avoid painting twice');
     else assert.notEqual(childRects[i].background,'rgba(0, 0, 0, 0)',
       'caption/note outside body must remain visibly shaded');
     childRects[i].rect.forEach((value,j)=>
       assert(Math.abs(value-expected[j])<3,
         `chart child bbox ${i}/${j}: expected ${expected[j]}, got ${value}`));
   }
   const tableParts=page.locator('.ocr-pdf-block-cover[data-block-id="p14b0"] > .ocr-pdf-block-fragment');
   assert.deepEqual(await tableParts.evaluateAll(nodes=>nodes.map(n=>n.dataset.partType)),
     ['table_caption','table_body','table_footnote']);
   assert.deepEqual(await page.locator('.ocr-pdf-block-cover[data-block-id="p3b1"] > .ocr-pdf-block-fragment').evaluateAll(nodes=>nodes.map(n=>n.dataset.partType)),['table_body'],
     'real p3b1 body renders, but false Notes overlay must not appear');
   assert.deepEqual(await page.locator('.ocr-pdf-block-cover[data-block-id="p3b0"] > .ocr-pdf-block-fragment')
     .evaluateAll(nodes=>nodes.map(node=>node.dataset.partType)),['table_caption','table_body'],
     'genuine p3b0 caption still renders');
   assert.equal(await page.locator('.ocr-pdf-block-ctrl input').count(),224,
     'captions and notes must never create independent Block controls');
   // The right/left gutter chips MUST NOT overlap their own OCR text.
   // Measure the rendered DOM, not just declared CSS or coordinates.
   const placements=await page.locator('.ocr-pdf-block-cover').evaluateAll(nodes=>nodes.map(node=>{
     const label=node.querySelector('.ocr-pdf-block-ctrl');
     const region=node.getBoundingClientRect(),chip=label.getBoundingClientRect();
     const side=node.dataset.gutter;
     const page=node.closest('.page')?.getBoundingClientRect();
     return {id:node.dataset.blockId,side,region:{left:region.left,right:region.right},
       chip:{left:chip.left,right:chip.right},page:{left:page?.left,right:page?.right},
       gap:side==='left'?region.left-chip.right:chip.left-region.right,
       inside:chip.left>=page.left-2&&chip.right<=page.right+2};
   }));
   assert.equal(placements.length,224);
   assert.equal(placements.filter(p=>p.gap<1).length,0,
     'block checkbox must be outside its own text bbox');
   const inline=await page.locator('.ocr-pdf-block-cover').evaluateAll(nodes=>nodes.map(node=>{
     const label=node.querySelector('.ocr-pdf-block-ctrl');
     const checkbox=label.querySelector('input');
     const id=label.querySelector('span').getBoundingClientRect();
     const bounds=label.getBoundingClientRect();
     return {id:node.dataset.blockId,page:node.dataset.pdfPage,gutter:node.dataset.gutter,
       bounds:{left:bounds.left,right:bounds.right,top:bounds.top,bottom:bounds.bottom},
       checkboxHidden:getComputedStyle(checkbox).display==='none',
       sameLine:Math.abs((id.top+id.bottom)/2-(bounds.top+bounds.bottom)/2)<3,
       height:bounds.height};
   }));
   assert.equal(inline.length,224);
   assert.equal(inline.filter(x=>!x.checkboxHidden).length,0,
     'sealed OCR source has no visible interactive checkbox');
   assert.equal(inline.filter(x=>!x.sameLine).length,0,
     'visible Block ID must be centered in its single-line label');
   assert(inline.every(x=>x.height<22),'chip must be single-row, not tall');
   const colliding=[];
   for(let i=0;i<inline.length;i++)for(let j=i+1;j<inline.length;j++){
     const a=inline[i],b=inline[j];
     if(a.page!==b.page)continue;
     const ax=a.bounds,bx=b.bounds;
     if(Math.min(ax.right,bx.right)-Math.max(ax.left,bx.left)>2&&
        Math.min(ax.bottom,bx.bottom)-Math.max(ax.top,bx.top)>2)
       colliding.push([a.id,b.id]);
   }
   assert.equal(colliding.length,0,`gutter labels must not collide: ${JSON.stringify(colliding)}`);
   console.log('PDF_INLINE_LABEL_GEOMETRY',name,{sameRow:inline.length,
     minHeight:Math.min(...inline.map(x=>x.height)),maxHeight:Math.max(...inline.map(x=>x.height)),
     colliding:colliding.slice(0,25),collisionCount:colliding.length});

   for(const [id,expectedSide] of [['p6b6','left'],['p6b7','right'],
      ['p2b7','left'],['p2b8','right'],['p15b5','left'],['p15b6','right']]){
     const item=placements.find(p=>p.id===id);
     assert.equal(item?.side,expectedSide,`wrong column side ${id}`);
     assert(item.gap>=2,`gutter spacing insufficient for ${id}`);
     assert(item.inside,`checkbox ${id} must be in page whitespace, not off the page`);
   }
   console.log('PDF_GUTTER_GEOMETRY',name,{total:placements.length,
     left:placements.filter(p=>p.side==='left').length,
     right:placements.filter(p=>p.side==='right').length,
     overlap:placements.filter(p=>p.gap<1).length,
     offPage:placements.filter(p=>!p.inside).map(p=>p.id),
     page7:placements.filter(p=>['p6b6','p6b7'].includes(p.id))});
   // The user-approved sealed CMD milestone requires explicit reparent or
   // parent insertion. Old triple-click checkbox auto-join is prohibited:
   // every original OCR parent is a read-only source of physical evidence.
   const before=await page.evaluate(()=>({
     source:window.__v6cm6.cm.readSource(),
     labels:Object.fromEntries(['p2b8','p2b9','p6b7','p6b8','p8b8','p9b0','p9b1']
       .map(id=>[id,document.querySelector(
         `.ocr-pdf-block-cover[data-block-id="${id}"] .ocr-pdf-block-ctrl span`)?.textContent])),
     checked:document.querySelectorAll('.ocr-pdf-block-ctrl input:checked').length,
     disabled:document.querySelectorAll('.ocr-pdf-block-ctrl input:disabled').length
   }));
   assert.equal(before.checked,224);
   assert.equal(before.disabled,224);
   for(const id of ['p6b7','p2b8','p9b0']){
     const tag=page.locator(`.ocr-pdf-block-cover[data-block-id="${id}"] > .ocr-pdf-block-ctrl`);
     await tag.scrollIntoViewIfNeeded({timeout:30000});
     const input=tag.locator('input');
     assert(await input.isDisabled(),id+' inherited readonly guard');
     await tag.click({timeout:18000});
     assert(await input.isChecked(),id+' single click cannot join');
     if(mobile){for(let i=0;i<3;i++)await tag.tap({timeout:18000});}
     else await tag.click({clickCount:3,delay:60,timeout:18000});
     assert(await input.isChecked(),id+' triple click cannot silently join');
     assert.equal(await page.locator('.ocr-pdf-block-cover').count(),224);
     await page.screenshot({path:`.v6/evidence/block-join-toggle/${name}-${id}-readonly.png`,animations:'disabled'});
   }
   const after=await page.evaluate(()=>({
     source:window.__v6cm6.cm.readSource(),
     labels:Object.fromEntries(['p2b8','p2b9','p6b7','p6b8','p8b8','p9b0','p9b1']
       .map(id=>[id,document.querySelector(
         `.ocr-pdf-block-cover[data-block-id="${id}"] .ocr-pdf-block-ctrl span`)?.textContent])),
     checked:document.querySelectorAll('.ocr-pdf-block-ctrl input:checked').length,
     disabled:document.querySelectorAll('.ocr-pdf-block-ctrl input:disabled').length
   }));
   assert.deepEqual(after,before,
     'multiple original-parent clicks must not alter source, label order or checkboxes');
   assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
   assert.equal(readFileSync(sample,'utf8'),original,'no implicit autosave');
   console.log('PDF_BLOCK_JOIN_TOGGLE_READONLY_PASS',name,
     {originalBlocks:224,unchangedIds:Object.keys(after.labels).length,
       checked:after.checked,disabled:after.disabled,
       noImplicitCrossPageJoin:true,unchangedSource:true,
       noLegacyApiRequests:true,errors:errors.length});
  }finally{await browser.close();}
 }
}finally{server.kill('SIGTERM');}
