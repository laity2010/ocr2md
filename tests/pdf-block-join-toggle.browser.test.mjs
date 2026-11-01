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
   assert(await crossHead.isEnabled(),'page first p9b0 must merge into previous page last p8b8');
   assert(await empty.isEnabled(),'OCR empty placeholders must be selectable');
   assert(await page.locator('.ocr-pdf-block-ctrl input[aria-label="文本块 p0b1 独立"]').isEnabled(),
     'title block must be selectable');
   assert(await page.locator('.ocr-pdf-block-ctrl input[aria-label="文本块 p0b5 独立"]').isEnabled(),
     'image block must be selectable');
   assert(await page.locator('.ocr-pdf-block-ctrl input[aria-label="文本块 p8b6 独立"]').isEnabled(),
     'formula block must be selectable');
   assert(await page.locator('.ocr-pdf-block-ctrl input[aria-label="文本块 p21b2 独立"]').isEnabled(),
     'reference block must be selectable');
   const checkboxStatus=await page.locator('.ocr-pdf-block-ctrl input').evaluateAll(inputs=>({
     checked:inputs.filter(x=>x.checked).length,
     enabled:inputs.filter(x=>!x.disabled).length,
     disabled:inputs.filter(x=>x.disabled).length,
   }));
   assert.deepEqual(checkboxStatus,{checked:224,enabled:223,disabled:1});
   assert(await target.isChecked());
   assert(await target.isEnabled());
   assert.equal(await page.locator('.ocr-pdf-block-ctrl').count(),224);
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
   await page.locator('.ocr-pdf-block-cover[data-block-id="p13b1"]').scrollIntoViewIfNeeded();
   await page.screenshot({path:`.v6/evidence/block-join-toggle/${name}-chart-caption-notes.png`,animations:'disabled'});
   await target.scrollIntoViewIfNeeded({timeout:18000});
   await page.screenshot({path:`.v6/evidence/block-join-toggle/${name}-side-gutters.png`,animations:'disabled'});
   await page.waitForTimeout(500); // allow PDF.js lazy page canvas paint
   // Instrument the OTHER pages' existing chips. A single join must neither
   // replace nodes nor restyle/relabel/reposition 200 unrelated controls.
   await page.evaluate(()=>{
     const nodes=[...document.querySelectorAll('.ocr-pdf-block-cover')].filter(x=>x.dataset.pdfPage!=='7');
     const captures=nodes.map(node=>({node,chip:node.querySelector('.ocr-pdf-block-ctrl'),
       label:node.querySelector('.ocr-pdf-block-ctrl span'),
       checked:node.querySelector('input')?.checked,
       labelText:node.querySelector('span')?.textContent}));
     const mutations=[];const observers=captures.map(({node})=>{
       const observer=new MutationObserver(records=>mutations.push(...records));
       observer.observe(node,{subtree:true,attributes:true,childList:true,characterData:true});
       return observer;
     });
     window.__blockJoinRefreshProbe={captures,mutations,observers};
   });
   await page.waitForTimeout(1000); // settle PDF.js page virtualization before measuring join
   console.log('PROBE_BEFORE_CLICK',name,await page.evaluate(()=>{
     const p=window.__blockJoinRefreshProbe;
     const initial=p.mutations.length;
     p.observers.forEach(o=>o.takeRecords());p.mutations.length=0;
     return {connected:p.captures.filter(x=>x.node.isConnected).length,
       preClickMutations:initial,
       pageNodes:document.querySelectorAll('.ocr-pdf-block-cover').length};
   }));
   const targetTag=page.locator('.ocr-pdf-block-cover[data-block-id="p6b7"] .ocr-pdf-block-ctrl');
   const tapOnce=tag=>mobile?tag.tap({timeout:16000}):tag.click({timeout:16000});
   const tapThree=async tag=>{
     if(mobile){
       // Genuine WebKit touch events: each click.detail stays 1 on iPad.
       for(let i=0;i<3;i++)await tag.tap({timeout:16000});
     }else await tag.click({clickCount:3,delay:60,timeout:16000});
   };
   // First tap/checkbox tap navigates the PARENT, never silently joins it.
   await tapOnce(targetTag);
   const focus=await page.evaluate(async()=>{
     const {viewStore}=await import('/view-store.js');
     return viewStore.getState().focusTarget;
   });
   assert.equal(focus?.elementId,'mineru:6:7:parent');
   assert(await target.isChecked(),'single parent tag click cannot toggle its checkbox');
   await tapOnce(targetTag);
   assert(await target.isChecked(),'double tap must not toggle checkbox');
   await page.waitForTimeout(1300); // new triple gesture, not a continuation of double tap
   await tapThree(targetTag);
   await page.waitForFunction(()=>/已接续 1 · 逻辑块 223/.test(document.querySelector('#status')?.textContent||''),null,{timeout:25000});
   assert.equal(await target.isChecked(),false);
   assert.equal(await page.locator('.ocr-pdf-block-cover[data-block-id="p6b7"] .ocr-pdf-block-ctrl span').innerText(),'p6b6',
     'unchecked block uses previous logical number');
   assert.equal(await page.locator('.ocr-pdf-block-cover[data-block-id="p6b8"] .ocr-pdf-block-ctrl span').innerText(),'p6b7',
     'following block renumbers only this page');
   assert.equal(await page.locator('.ocr-pdf-block-cover[data-block-id="p5b1"] .ocr-pdf-block-ctrl span').innerText(),'p5b1',
     'other page numbering cannot change');
   assert.match(await page.locator('#status').innerText(),/已接续 1/);
   assert.equal(await page.locator('.ocr-pdf-block-cover').count(),224);
   await page.waitForTimeout(850); // include delayed CMD requery, not only click-time changes
   const untouched=await page.evaluate(()=>{
     const p=window.__blockJoinRefreshProbe;
     const count=p.mutations.length;
     const survivors=p.captures.filter(({node,chip,label,checked,labelText})=>
       node.isConnected&&node.querySelector('.ocr-pdf-block-ctrl')===chip&&
       chip.querySelector('span')===label&&node.querySelector('input')?.checked===checked&&
       label.textContent===labelText).length;
     const disconnected=p.captures.filter(({node})=>!node.isConnected).length;
     const changedLabels=p.captures.filter(({label,labelText})=>label.textContent!==labelText).length;
     const changedChecked=p.captures.filter(({node,checked})=>node.querySelector('input')?.checked!==checked).length;
     p.observers.forEach(o=>o.disconnect());delete window.__blockJoinRefreshProbe;
     return {count,survivors,total:p.captures.length,disconnected,changedLabels,changedChecked,
       mutations:p.mutations.slice(0,4).map(x=>({type:x.type,name:x.attributeName,target:x.target?.className}))};
   });
   console.log('BLOCK_JOIN_REFRESH_PROBE',name,untouched);
   assert.equal(untouched.total,224-12,'other 21 PDF pages should contain original controls');
   assert.equal(untouched.survivors,untouched.total,'other page controls must not be recreated/rechecked');
   assert.equal(untouched.count,0,'single join must not mutate unrelated PDF page chips');
   console.log('BLOCK_JOIN_LOCAL_REFRESH_PASS',name,untouched);
   await page.screenshot({path:`.v6/evidence/block-join-toggle/${name}-joined-checkbox.png`,animations:'disabled'});
   await target.scrollIntoViewIfNeeded({timeout:15000});
   await tapThree(targetTag);
   await page.waitForFunction(()=>/已接续 0 · 逻辑块 224/.test(document.querySelector('#status')?.textContent||''),null,{timeout:25000});
   assert(await target.isChecked());
   assert.equal(await page.locator('.ocr-pdf-block-cover[data-block-id="p6b8"] .ocr-pdf-block-ctrl span').innerText(),'p6b8');
   assert.equal(await page.locator('.ocr-pdf-block-cover').count(),224);
   await page.screenshot({path:`.v6/evidence/block-join-toggle/${name}-restored-checkbox.png`,animations:'disabled'});
   // A real OCR-empty placeholder joins the preceding block just like text;
   // only logical numbering on that same page moves one position.
   await empty.scrollIntoViewIfNeeded({timeout:17000});
   await tapThree(page.locator('.ocr-pdf-block-cover[data-block-id="p2b8"] .ocr-pdf-block-ctrl'));
   await page.waitForFunction(()=>/已接续 1 · 逻辑块 223/.test(
     document.querySelector('#status')?.textContent||''),null,{timeout:25000});
   assert.equal(await empty.isChecked(),false);
   assert.equal(await page.locator('.ocr-pdf-block-cover[data-block-id="p2b9"] .ocr-pdf-block-ctrl span').innerText(),'p2b8');
   assert.equal(await page.locator('.ocr-pdf-block-cover[data-block-id="p6b8"] .ocr-pdf-block-ctrl span').innerText(),'p6b8');
   await page.screenshot({path:`.v6/evidence/block-join-toggle/${name}-blank-block-joined.png`,animations:'disabled'});
   await page.evaluate(()=>{
     window.__emptyCtrlClicks=[];
     document.querySelector('.ocr-pdf-block-cover[data-block-id="p2b8"] .ocr-pdf-block-ctrl')
       ?.addEventListener('click',e=>window.__emptyCtrlClicks.push({
         at:Math.round(performance.now()),detail:e.detail,checked:e.currentTarget.querySelector('input')?.checked
       }));
   });
   await tapThree(page.locator('.ocr-pdf-block-cover[data-block-id="p2b8"] .ocr-pdf-block-ctrl'));
   try{
     await page.waitForFunction(()=>/已接续 0 · 逻辑块 224/.test(
       document.querySelector('#status')?.textContent||''),null,{timeout:25000});
   }catch(error){
     console.error('PDF_EMPTY_TRIPLE_RESTORE_DIAGNOSTIC',name,JSON.stringify(await page.evaluate(()=>({
       clicks:window.__emptyCtrlClicks, status:document.querySelector('#status')?.textContent,
       checked:document.querySelector('.ocr-pdf-block-cover[data-block-id="p2b8"] input')?.checked,
       disabled:document.querySelector('.ocr-pdf-block-cover[data-block-id="p2b8"] input')?.disabled
     }))));
     throw error;
   }
   assert(await empty.isChecked());
   assert.equal(await page.locator('.ocr-pdf-block-cover[data-block-id="p2b9"] .ocr-pdf-block-ctrl span').innerText(),'p2b9');

   // The actual p9b0 continues p8b8. Its unchecked label must use the
   // previous page's logical ID; following labels change on page 10 only.
   // The page-9 (zero-indexed 8) chip must remain untouched and connected.
   const previousChip=page.locator('.ocr-pdf-block-cover[data-block-id="p8b8"]');
   const previousIdentity=await previousChip.evaluate(node=>{
     window.__previousPageJoinChip=node;return node.querySelector('span').textContent;
   });
   assert.equal(previousIdentity,'p8b8');
   await crossHead.scrollIntoViewIfNeeded({timeout:17000});
   await tapThree(page.locator('.ocr-pdf-block-cover[data-block-id="p9b0"] .ocr-pdf-block-ctrl'));
   await page.waitForFunction(()=>/已接续 1 · 逻辑块 223/.test(
     document.querySelector('#status')?.textContent||''),null,{timeout:25000});
   assert.equal(await crossHead.isChecked(),false);
   assert.equal(await page.locator('.ocr-pdf-block-cover[data-block-id="p9b0"] .ocr-pdf-block-ctrl span').innerText(),'p8b8');
   assert.equal(await page.locator('.ocr-pdf-block-cover[data-block-id="p9b1"] .ocr-pdf-block-ctrl span').innerText(),'p9b0');
   assert.equal(await page.locator('.ocr-pdf-block-cover[data-block-id="p8b8"] .ocr-pdf-block-ctrl span').innerText(),'p8b8');
   assert(await previousChip.evaluate(node=>node===window.__previousPageJoinChip),
     'cross-page join must not replace predecessor PDF page DOM');
   await page.screenshot({path:`.v6/evidence/block-join-toggle/${name}-cross-page-p9b0.png`,animations:'disabled'});
   await tapThree(page.locator('.ocr-pdf-block-cover[data-block-id="p9b0"] .ocr-pdf-block-ctrl'));
   await page.waitForFunction(()=>/已接续 0 · 逻辑块 224/.test(
     document.querySelector('#status')?.textContent||''),null,{timeout:25000});
   assert(await crossHead.isChecked());
   assert.equal(await page.locator('.ocr-pdf-block-cover[data-block-id="p9b1"] .ocr-pdf-block-ctrl span').innerText(),'p9b1');

   assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
   assert.equal(readFileSync(sample,'utf8'),original,'mother/fixture must not be autosaved');
   console.log('PDF_BLOCK_JOIN_TOGGLE_PASS',name,{originalBlocks:224,joinedLogicalBlocks:223,
     restoredBlocks:224,emptySelectable:true,crossPage:'p8b8→p9b0',
     enabled:223,requests:requests.length,errors:errors.length});
  }finally{await browser.close();}
 }
}finally{server.kill('SIGTERM');}
