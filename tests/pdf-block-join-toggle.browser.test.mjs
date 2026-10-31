import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium,webkit} from 'playwright';
const sample=resolve('.v6/tests/text-blocks/buffett-reinitialized.minerujson.md');
const original=readFileSync(sample,'utf8');
const port=5995,url=`http://127.0.0.1:${port}/`;
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
   await page.getByRole('checkbox',{name:'文本块覆盖显示'}).check();
   await page.waitForFunction(()=>document.querySelectorAll('.ocr-pdf-block-cover').length===224,null,{timeout:24000});
   const first=page.locator('.ocr-pdf-block-ctrl input[aria-label="文本块 p0b0 独立"]');
   const empty=page.locator('.ocr-pdf-block-ctrl input[aria-label="文本块 p2b8 独立"]');
   const target=page.locator('.ocr-pdf-block-ctrl input[aria-label="文本块 p6b7 独立"]');
   assert(await first.isDisabled());assert(await empty.isDisabled());
   assert(await target.isChecked());assert(await target.isEnabled());
   assert.equal(await page.locator('.ocr-pdf-block-ctrl').count(),224);
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
     const checkbox=label.querySelector('input').getBoundingClientRect();
     const id=label.querySelector('span').getBoundingClientRect();
     const bounds=label.getBoundingClientRect();
     return {id:node.dataset.blockId,page:node.dataset.pdfPage,gutter:node.dataset.gutter,
       bounds:{left:bounds.left,right:bounds.right,top:bounds.top,bottom:bounds.bottom},
       sameLine:Math.abs((checkbox.top+checkbox.bottom)/2-(id.top+id.bottom)/2)<3,
       height:bounds.height};
   }));
   assert.equal(inline.length,224);
   assert.equal(inline.filter(x=>!x.sameLine).length,0,
     'checkbox and Block ID must render on same baseline for every Block');
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
   await page.locator('.ocr-preview-switchbar .ocr-navigation-preview .ts-control').click();
   await page.locator('.ocr-navigation-popup-preview:visible [data-value="pdf"]').click();
   await target.scrollIntoViewIfNeeded({timeout:18000});
   await page.screenshot({path:`.v6/evidence/block-join-toggle/${name}-side-gutters.png`,animations:'disabled'});
   await page.waitForTimeout(500); // allow PDF.js lazy page canvas paint
   await target.click({timeout:15000});
   await page.waitForFunction(()=>/已接续 1 · 逻辑块 223/.test(document.querySelector('#status')?.textContent||''),null,{timeout:25000});
   assert.equal(await target.isChecked(),false);
   assert.match(await page.locator('#status').innerText(),/已接续 1/);
   assert.equal(await page.locator('.ocr-pdf-block-cover').count(),224);
   await page.screenshot({path:`.v6/evidence/block-join-toggle/${name}-joined-checkbox.png`,animations:'disabled'});
   await target.scrollIntoViewIfNeeded({timeout:15000});
   await target.click({timeout:15000});
   await page.waitForFunction(()=>/已接续 0 · 逻辑块 224/.test(document.querySelector('#status')?.textContent||''),null,{timeout:25000});
   assert(await target.isChecked());
   assert.equal(await page.locator('.ocr-pdf-block-cover').count(),224);
   await page.screenshot({path:`.v6/evidence/block-join-toggle/${name}-restored-checkbox.png`,animations:'disabled'});
   assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
   assert.equal(readFileSync(sample,'utf8'),original,'mother/fixture must not be autosaved');
   console.log('PDF_BLOCK_JOIN_TOGGLE_PASS',name,{originalBlocks:224,joinedLogicalBlocks:223,
     restoredBlocks:224,emptyDisabled:true,requests:requests.length,errors:errors.length});
  }finally{await browser.close();}
 }
}finally{server.kill('SIGTERM');}
