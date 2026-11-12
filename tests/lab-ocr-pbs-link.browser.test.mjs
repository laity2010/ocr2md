/** Public component contract: PBS rails, dedup aliases, PDF↔AG by stable Block ID.
 * Exercises the real AG Grid, PDF.js, Frame ports in Chromium and iPad WebKit.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {setTimeout as sleep} from 'node:timers/promises';
import {chromium,webkit} from 'playwright';
import {makeLabOcrPdf} from './helpers/lab-ocr-pdf-fixture.mjs';
const port=5338,book='/demo/pbs-book';
const url=process.env.LAB_OCR_TEST_URL||`http://127.0.0.1:${port}/labs/lab-ocr/`;
const vite=process.env.LAB_OCR_TEST_URL?null:spawn('node',[
 'node_modules/vite/bin/vite.js','--config','labs/lab-ocr/vite.config.mjs',
 '--host','127.0.0.1','--port',String(port),'--strictPort'],{stdio:['ignore','pipe','pipe']});
let output='';vite?.stdout.on('data',chunk=>output+=chunk);vite?.stderr.on('data',chunk=>output+=chunk);
const blocks=[
 {id:'b-preproc',blockId:'1',pbs:'p1b0',group:'preproc_blocks',type:'text',bbox:[73,61,359,154]},
 {id:'b-para',blockId:'2',pbs:'p1b0',group:'para_blocks',type:'text',bbox:[72,60,360,155]},
 {id:'b-child',blockId:'3',pbs:'p1b0s0',parentBlockId:'2',group:'para_blocks',type:'table_caption',bbox:[80,70,130,93]},
 {id:'b-right',blockId:'4',pbs:'p1b1',group:'para_blocks',type:'table',bbox:[420,310,540,382]},
];
// Page 11 regression: near-coincident parent and original block-01, same
// source group (so the overlay dedup is not allowed to drop either ID).
const page11=[
 {id:'p11-a',blockId:'101',pbs:'p11b0',group:'para_blocks',type:'text',bbox:[72,60,300,128]},
 {id:'p11-b',blockId:'102',pbs:'p11b01',parentBlockId:'101',group:'para_blocks',type:'text',bbox:[73,61,301,129]},
 {id:'p11-c',blockId:'103',pbs:'p11b02',parentBlockId:'102',group:'para_blocks',type:'text',bbox:[77,62,240,131]},
 {id:'p11-return',blockId:'104',pbs:'p11b3',group:'para_blocks',type:'title',bbox:[74,220,220,256]},
 {id:'p11-right',blockId:'105',pbs:'p11b4',group:'para_blocks',type:'table',bbox:[410,60,560,127]},
 {id:'p11-right2',blockId:'106',pbs:'p11b05',parentBlockId:'105',group:'para_blocks',type:'table',bbox:[411,61,561,129]},
 {id:'p11-cross',blockId:'107',pbs:'p11b07s1',parentBlockId:'2',group:'para_blocks',type:'text',bbox:[72,332,240,390]},
];
const dense=Array.from({length:62},(_,i)=>({
 id:'b-dense-'+i,blockId:String(i+5),pbs:i===25?'p2b25s123456789':'p2b'+i,group:'para_blocks',type:'text',
 bbox:[70,40+i*11,190,48+i*11],
}));
const rowOf=(item,page)=>({block_id:Number(item.blockId),pbs:item.pbs,global_page:page,
 block_group:item.group,block_type:item.type,block_bbox_json:JSON.stringify(item.bbox),
 parent_block_id:item.parentBlockId?Number(item.parentBlockId):null,
 source_block_key:'source:'+item.blockId,block_path:item.pbs,content_preview:'type '+item.type,
 block_json:JSON.stringify({type:item.type,blockId:item.blockId})});
try{
 let ready=false;
 for(let i=0;i<100;i++){
  try{if((await fetch(url)).ok){ready=true;break;}}catch{}
  await sleep(200);
 }
 assert(ready,'Vite unavailable '+output.slice(-800));
 for(const [name,engine] of [['Chromium',chromium],['iPad-WebKit',webkit]]){
  const browser=await engine.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:{width:1130,height:850},hasTouch:true,ignoreHTTPSErrors:true});
   page.setDefaultTimeout(19000);
   const errors=[],overlays=[];let pdfReads=0,rowsReads=0;
   page.on('pageerror',error=>errors.push(error.message));
   await page.addInitScript(({book})=>{
    localStorage.setItem('ocr2md.lab-ocr.settings.json.v1',JSON.stringify({settings:{
      'workspace.dataDirectory':{key:'dataDirectory',category1:'工作区',category2:'目录',
       comment:'Test book',value:book,range:{kind:'server-directory'}},
    }}));
   },{book});
   await page.route('**/labs/lab-ocr/api/ocr/**',route=>{
    const parsed=new URL(route.request().url()),op=parsed.pathname.split('/').at(-1);
    if(op==='pdf'){pdfReads++;return route.fulfill({status:200,contentType:'application/pdf',body:makeLabOcrPdf(11)});}
    if(op==='overlays'){
      const level=parsed.searchParams.get('level'),number=Number(parsed.searchParams.get('page'));
      overlays.push(`${level}:${number}`);
      const source=number===1?blocks:number===2?dense:number===11?page11:[];
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
        level,page:number,pageSize:[595,842],
        boxes:source.map(row=>({id:level==='block'?row.id:'span-'+row.id,
          blockId:row.blockId,pbs:row.pbs,parentBlockId:row.parentBlockId??null,
          blockGroup:row.group,blockType:row.type,bbox:row.bbox})),
      })});
    }
    if(op==='inspect')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
      status:'unchanged',blocks:73,pages:11,pdf:'book.pdf',sources:[{name:'source.json',pages:11}]})});
    if(op==='minerujson2block')return route.fulfill({status:200,contentType:'application/json',body:'{"blocks":73}'});
    if(op==='minerujson2span')return route.fulfill({status:200,contentType:'application/json',body:'{"spans":73}'});
    if(op==='rows'){
      rowsReads++;
      assert.equal(parsed.searchParams.get('table'),'block');
      const all=[...blocks.map(b=>rowOf(b,0)),...dense.map(b=>rowOf(b,1)),...page11.map(b=>rowOf(b,10))];
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
        table:'block',total:all.length,rows:all})});
    }
    throw Error('Unexpected '+op);
   });
   await page.goto(url,{waitUntil:'domcontentloaded'});
   const tags=page.locator('.lab-ocr-pdf-pbs-layer[data-page="1"] .lab-ocr-pdf-pbs-tag');
   const boxes=page.locator('.lab-ocr-pdf-overlay-layer[data-page="1"] .lab-ocr-pdf-overlay-box');
   await page.waitForFunction(()=>document.querySelectorAll('.lab-ocr-pdf-pbs-layer[data-page="1"] .lab-ocr-pdf-pbs-tag').length===3,
     null,{timeout:17000}).catch(async e=>{console.error('PBS_INITIAL',name,await page.locator('#status').innerText(),await tags.count(),await boxes.count());throw e;});
   assert.deepEqual(await boxes.evaluateAll(nodes=>nodes.map(n=>n.dataset.id)),['b-para','b-child','b-right']);
   assert.equal(await page.locator('.lab-ocr-pdf-pbs-tag[data-child="true"]').count(),1);
   const inactivePalette=await page.evaluate(()=>{
     const parent=document.querySelector('.lab-ocr-pdf-pbs-tag[data-block-id="2"]');
     const child=document.querySelector('.lab-ocr-pdf-pbs-tag[data-block-id="3"]');
     return {parentBg:getComputedStyle(parent).backgroundColor,
       childBg:getComputedStyle(child).backgroundColor,
       childBorder:getComputedStyle(child).borderTopStyle};
   });
   // Exact Main CSS palette (ui/pdf-preview.css): parent sage, child
   // blue-gray; both are solid, independent of selection state.
   assert.equal(inactivePalette.parentBg,'rgba(39, 63, 60, 0.94)');
   assert.equal(inactivePalette.childBg,'rgba(34, 56, 70, 0.95)');
   assert.equal(inactivePalette.childBorder,'solid');
   assert.deepEqual((await tags.allTextContents()).sort(),['p1b0','p1b0s0','p1b1'].sort());
   const geom=await tags.evaluateAll(nodes=>nodes.map(n=>{
     const r=n.getBoundingClientRect(),paper=n.closest('.page').getBoundingClientRect();
     return {side:n.dataset.side,pbs:n.textContent,x1:r.left,x2:r.right,
       paperLeft:paper.left,paperRight:paper.right,width:r.width,height:r.height};
   }));
   assert(geom.some(x=>x.side==='left')&&geom.some(x=>x.side==='right'));
   assert(geom.every(x=>x.side==='left'?x.x2<=x.paperLeft+2:x.x1>=x.paperRight-2),
     'Tags must remain outside paper '+JSON.stringify(geom));
   assert(geom.every(x=>Math.abs(x.height-23)<1));
   // The border hugs the actual rendered PBS glyphs, not a fixed 78px chip.
   const fitted=await tags.evaluateAll(nodes=>nodes.map(node=>{
     const text=document.createRange();text.selectNodeContents(node);
     const outer=node.getBoundingClientRect(),ink=text.getBoundingClientRect();
     return {pbs:node.textContent,width:outer.width,inkWidth:ink.width,
       horizontalPadding:outer.width-ink.width,left:outer.left,right:outer.right};
   }));
   assert(fitted.every(x=>x.horizontalPadding>=7&&x.horizontalPadding<=13),
     'PBS badges should have only a small text-fitting inset: '+JSON.stringify(fitted));
   const short=fitted.find(x=>x.pbs==='p1b0'),long=fitted.find(x=>x.pbs==='p1b0s0');
   assert(long.width>short.width+8,'Long PBS must get a wider badge: '+JSON.stringify(fitted));
   assert(short.width<60,'Short PBS should no longer reserve the old 78px frame');
   // PDF → AG works even when SQL Block navigation has not yet been opened.
   await page.locator('.lab-ocr-pdf-pbs-tag[data-block-id="4"]').click();
   await page.waitForFunction(()=>document.querySelector('#workspace .ag-row-selected .ag-cell[col-id="block_id"]')?.textContent.trim()==='4',
     null,{timeout:17000});
   assert.equal(rowsReads,1,'PDF selection should initialize AG block table once');
   assert.match(await page.locator('#status').innerText(),/PDF → AG · p1b1 · BlockID 4/);
   assert.match(await page.locator('.ocr-cm-source .cm-content').innerText(),/"blockId": "4"/);
   // Default AG/PDF show only para_blocks. Explicitly include other groups
   // before exercising the old cross-group deduplicated alias selection.
   await page.locator('#workspace .ag-header-cell[col-id="block_group"] .ag-header-cell-filter-button').click();
   const groupFilter=page.locator('.ocr-enum-filter:visible');
   assert.equal(await groupFilter.locator('.ocr-enum-filter-option[data-filter-value="para_blocks"] input').isChecked(),true);
   assert.equal(await groupFilter.locator('.ocr-enum-filter-option[data-filter-value="preproc_blocks"] input').isChecked(),false);
   await groupFilter.locator('.ocr-enum-filter-option[data-filter-value="all"] input').check();
   await page.waitForFunction(()=>document.querySelector('.lab-ocr-pdf-overlay-box[data-id="b-para"]')?.dataset.blockIds.split(' ').includes('1')); // AG virtualizes rows
   await page.locator('#workspace .ag-header-cell[col-id="block_group"] .ag-header-cell-filter-button').click();
   // AG → PDF: select an alias Block ID whose geometry was merged into
   // representative b-para (same PBS as ID 2, different processing group).
   await page.locator('#workspace .ag-row .ag-cell[col-id="block_id"]').filter({hasText:/^1$/}).click();
   await page.waitForFunction(()=>document.querySelector('.lab-ocr-pdf-overlay-box[data-id="b-para"]')?.dataset.selected==='true');
   assert.equal(await page.locator('.lab-ocr-pdf-pbs-tag[data-block-id="2"]').getAttribute('data-selected'),'true');
   assert.match(await page.locator('#status').innerText(),/Block 定位：p1b0 · BlockID 1/);
   // The real representative para block (ID 2) is parent of ID 3.
   // An unrelated dedup alias (ID 1) must NOT inherit ID 2's children.
   assert.equal(await page.locator('.lab-ocr-pdf-pbs-tag[data-block-id="3"]').getAttribute('data-family-selected'),'false');
   await page.locator('#workspace .ag-row .ag-cell[col-id="block_id"]').filter({hasText:/^2$/}).click();
   await page.waitForFunction(()=>document.querySelector('.lab-ocr-pdf-pbs-tag[data-block-id="2"]')?.dataset.selected==='true'&&
     document.querySelector('.lab-ocr-pdf-pbs-tag[data-block-id="3"]')?.dataset.familySelected==='true');
   assert.equal(await page.locator('.lab-ocr-pdf-overlay-box[data-id="b-child"]').getAttribute('data-family-selected'),'true');
   assert.equal(await page.locator('.lab-ocr-pdf-overlay-box[data-id="b-right"]').getAttribute('data-family-selected'),'false');
   // The PDF BOX highlight remains the established amber/orange, distinct
   // from the family-colored PBS labels and their leader lines.
   const colors=await page.evaluate(()=>{
     const box=id=>document.querySelector(`.lab-ocr-pdf-overlay-box[data-id="${id}"]`);
     const badge=id=>document.querySelector(`.lab-ocr-pdf-pbs-tag[data-block-id="${id}"]`);
     const parentLine=document.querySelector('.lab-ocr-pdf-pbs-leaders polyline[data-child="false"]');
     const childLine=document.querySelector('.lab-ocr-pdf-pbs-leaders polyline[data-child="true"]');
     return {
       directOutline:getComputedStyle(box('b-para')).outlineColor,
       familyOutline:getComputedStyle(box('b-child')).outlineColor,
       directFill:getComputedStyle(box('b-para')).backgroundColor,
       familyFill:getComputedStyle(box('b-child')).backgroundColor,
       parentLabel:getComputedStyle(badge('2')).backgroundColor,
       childLabel:getComputedStyle(badge('3')).backgroundColor,
       parentLine:getComputedStyle(parentLine).stroke,
       childLine:getComputedStyle(childLine).stroke,
       childLineStyle:getComputedStyle(childLine).strokeDasharray,
     };
   });
   assert.equal(colors.directOutline,'rgb(255, 212, 108)','Direct Block restores original orange');
   assert.equal(colors.familyOutline,'rgb(232, 170, 85)','Family Block uses softer orange');
   assert.match(colors.directFill,/231, 183, 83/);
   assert.match(colors.familyFill,/231, 183, 83/);
   assert.equal(colors.parentLabel,'rgba(39, 63, 60, 0.94)','Main parent background survives selection');
   assert.equal(colors.childLabel,'rgba(34, 56, 70, 0.95)','Main child background survives selection');
   assert.equal(colors.parentLine,'rgb(140, 182, 163)','Main parent leader color');
   assert.equal(colors.childLine,'rgb(138, 181, 218)','Main child leader color');
   assert.equal(colors.childLineStyle,'none','Main child leader is solid');
   const selectedBorders=await page.evaluate(()=>[...document.querySelectorAll('.lab-ocr-pdf-pbs-tag')].map(el=>({
     kind:el.dataset.child,selected:el.dataset.selected,family:el.dataset.familySelected,
     border:getComputedStyle(el).borderTopStyle,
     background:getComputedStyle(el).backgroundColor,
   })));
   assert(selectedBorders.every(x=>x.border==='solid'),
     'All PBS labels must use solid borders, including selected descendants');
   // PDF → AG by ID must distinguish parent and child even when PBS is shared
   // across unrelated processing groups.
   await page.locator('.lab-ocr-pdf-pbs-tag[data-block-id="3"]').click();
   await page.waitForFunction(()=>document.querySelector('#workspace .ag-row-selected .ag-cell[col-id="block_id"]')?.textContent.trim()==='3');
   assert.match(await page.locator('.ocr-cm-source .cm-content').innerText(),/"blockId": "3"/);
   assert.equal(await page.locator('.lab-ocr-pdf-pbs-tag[data-block-id="2"]').getAttribute('data-selected'),'false',
     'Child selection must not directly select its parent');
   assert.equal(await page.locator('.lab-ocr-pdf-pbs-tag[data-block-id="2"]').getAttribute('data-family-selected'),'false');
   assert.equal(await page.locator('.lab-ocr-pdf-pbs-tag[data-block-id="3"]').getAttribute('data-selected'),'true');
   // Re-select parent and verify a distant descendant lights when its page
   // becomes visible, without querying another SQL relationship endpoint.
   await page.locator('.lab-ocr-pdf-pbs-tag[data-block-id="2"]').click();
   assert.equal(await page.locator('.lab-ocr-pdf-pbs-tag[data-block-id="3"]').getAttribute('data-family-selected'),'true');
   // Zoom + split reuse one viewer and keep tags legible (fixed pixel size).
   await page.locator('.lab-ocr-pdf-scale').selectOption('100');
   await page.waitForFunction(()=>document.querySelector('.lab-ocr-pdf-pbs-tag[data-block-id="3"]'));
   assert(Math.abs(await page.locator('.lab-ocr-pdf-pbs-tag[data-block-id="3"]').evaluate(node=>node.getBoundingClientRect().height)-23)<1);
   await page.locator('.ocr-preview-split-toggle input').check();
   await page.waitForFunction(()=>!!document.querySelector('.ocr-detached-pdf-pane .lab-ocr-pdf-root'));
   await page.locator('.ocr-preview-split-toggle input').uncheck();
   await page.locator('#workspace .ocr-preview-mode').selectOption('pdf');
   assert.equal(pdfReads,1);
   // In Span inspection mode PBS badges are not duplicated for every Span.
   await page.locator('.lab-ocr-pdf-overlay-level').selectOption('span');
   await page.waitForFunction(()=>document.querySelector('.lab-ocr-pdf-overlay-layer[data-level="span"][data-page="1"]'));
   assert.equal(await page.locator('.lab-ocr-pdf-pbs-tag').count(),0);
   // Selecting a Block in AG while viewing Spans returns to Block mode and
   // navigates to its page/selection, preserving the same PDF instance.
   await page.locator('#workspace .ag-row .ag-cell[col-id="block_id"]').filter({hasText:/^5$/}).click();
   await page.waitForFunction(()=>document.querySelector('.lab-ocr-pdf-overlay-level')?.value==='block'&&
     document.querySelector('.lab-ocr-pdf-page')?.value==='2'&&
     document.querySelector('.lab-ocr-pdf-overlay-layer[data-page="2"] .lab-ocr-pdf-overlay-box[data-id="b-dense-0"]')?.dataset.selected==='true');
   assert.equal(pdfReads,1);
   // All 62 dense PBS badges stay visible as independent clickable labels.
   // Each side chooses the nearest free X rail, never moving original Y.
   await page.locator('.lab-ocr-pdf-page').fill('2');
   await page.locator('.lab-ocr-pdf-page').press('Tab');
   await page.waitForFunction(()=>document.querySelectorAll('.lab-ocr-pdf-overlay-layer[data-page="2"] .lab-ocr-pdf-overlay-box').length===62);
   const denseTags=page.locator('.lab-ocr-pdf-pbs-layer[data-page="2"] .lab-ocr-pdf-pbs-tag');
   await page.waitForFunction(()=>document.querySelectorAll('.lab-ocr-pdf-pbs-layer[data-page="2"] .lab-ocr-pdf-pbs-tag').length===62);
   assert.equal(await denseTags.count(),62,'No PBS labels may be grouped or suppressed');
   const denseCount=await denseTags.count();
   assert.equal(await page.locator('.lab-ocr-pdf-pbs-picker').count(),0,'No disclosure popup');
   assert.equal(await denseTags.filter({hasText:/\+/}).count(),0,'No +N collapsed labels');
   const layout=await denseTags.evaluateAll(nodes=>nodes.map(node=>{
     const rect=node.getBoundingClientRect(),pageRect=node.closest('.page').getBoundingClientRect();
     return {id:node.dataset.blockId,lane:Number(node.dataset.lane),side:node.dataset.side,
       text:node.textContent,top:rect.top-pageRect.top,left:rect.left-pageRect.left,
       right:rect.right-pageRect.left,height:rect.height};
   }));
   assert.equal(new Set(layout.map(x=>x.id)).size,62);
   const densePadding=await denseTags.evaluateAll(nodes=>nodes.map(node=>{
     const range=document.createRange();range.selectNodeContents(node);
     return node.getBoundingClientRect().width-range.getBoundingClientRect().width;
   }));
   assert(densePadding.every(value=>value>=7&&value<=13),
     'Each dense tag must fit its own full text, including multi-digit PBS');
   const superlong=await denseTags.filter({hasText:'p2b25s123456789'}).evaluate(node=>{
     const range=document.createRange();range.selectNodeContents(node);
     const b=node.getBoundingClientRect(),ink=range.getBoundingClientRect();
     return {width:b.width,textWidth:ink.width,scrollWidth:node.scrollWidth,clientWidth:node.clientWidth};
   });
   assert(superlong.width>78&&superlong.width-superlong.textWidth<13,
     'Long PBS must expand beyond the old fixed-width badge, without text truncation: '+JSON.stringify(superlong));
   assert(superlong.scrollWidth<=superlong.clientWidth+1,'Long PBS content must fit in the chip');
   assert(layout.some(x=>x.lane>=1),'Crowding must produce at least one outward lane');
   // Both sides must also avoid cross-lane horizontal collisions for
   // labels of different lengths, not just vertically separated labels.
   for(let i=0;i<layout.length;i++)for(let j=i+1;j<layout.length;j++){
     const a=layout[i],b=layout[j];
     if(a.side!==b.side||a.lane===b.lane)continue;
     const verticalOverlap=a.top<b.top+b.height&&b.top<a.top+a.height;
     const horizontalOverlap=a.left<b.right&&b.left<a.right;
     assert(!(verticalOverlap&&horizontalOverlap),
       'Cross-lane badges of differing widths overlap: '+JSON.stringify([a,b]));
   }
   for(const side of ['left','right']){
     const sideTags=layout.filter(x=>x.side===side);
     for(const lane of new Set(sideTags.map(x=>x.lane))){
       const track=sideTags.filter(x=>x.lane===lane).sort((a,b)=>a.top-b.top);
       for(let i=1;i<track.length;i++)
         assert(track[i].top>=track[i-1].top+23+2,
           'Overlapping labels in '+side+' lane '+lane+': '+JSON.stringify([track[i-1],track[i]]));
     }
     for(const badge of sideTags){
       const near=sideTags.find(other=>other.lane===0&&other.top<=badge.top&&other.top+26>badge.top);
       if(badge.lane>0)assert(near||sideTags.some(other=>other.lane===badge.lane-1&&
         other.top<=badge.top&&other.top+26>badge.top),
         'Outer lane should have an occupied nearer lane: '+JSON.stringify(badge));
     }
   }
   const originalLane0=layout.find(tag=>tag.id==='5');
   const originalLane1=layout.find(tag=>tag.id==='6');
   assert.equal(originalLane0.lane,0);
   assert(originalLane1.lane>=1);
   assert(originalLane1.right<=originalLane0.left-6,
     'Left tags of differing width must not overlap across outward rails');
   const scroller=await page.locator('.lab-ocr-pdf-scroller').evaluate(el=>({
     scrollWidth:el.scrollWidth,clientWidth:el.clientWidth}));
   assert(scroller.scrollWidth>scroller.clientWidth,
     'Long leader lines + outer labels must be horizontally scrollable '+JSON.stringify(scroller));
   // A far-out badge remains accessible through horizontal touch/scroll.
   await denseTags.filter({hasText:'p2b61'}).click();
   await page.waitForFunction(()=>document.querySelector('#workspace .ag-row-selected .ag-cell[col-id="block_id"]')?.textContent.trim()==='66');
   assert.match(await page.locator('#status').innerText(),/PDF → AG · p2b61 · BlockID 66/);
   assert.equal(pdfReads,1);
   // Page 11 concrete regression: p11b0/p11b01/p11b02 have almost the
   // same bbox, but each must remain a separate visible non-overlapping PBS.
   await page.locator('.lab-ocr-pdf-page').fill('1');
   await page.locator('.lab-ocr-pdf-page').press('Tab');
   await page.locator('.lab-ocr-pdf-pbs-layer[data-page="1"] .lab-ocr-pdf-pbs-tag[data-block-id="2"]').click();
   await page.locator('.lab-ocr-pdf-page').fill('11');
   await page.locator('.lab-ocr-pdf-page').press('Tab');
   const p11=page.locator('.lab-ocr-pdf-pbs-layer[data-page="11"] .lab-ocr-pdf-pbs-tag');
   await page.waitForFunction(()=>document.querySelectorAll('.lab-ocr-pdf-pbs-layer[data-page="11"] .lab-ocr-pdf-pbs-tag').length===7,
     null,{timeout:19000});
   const verifyNoOverlap=async(label)=>{
     const rects=await p11.evaluateAll(nodes=>nodes.map(n=>{
       const b=n.getBoundingClientRect();return {name:n.textContent,side:n.dataset.side,
         left:b.left,top:b.top,right:b.right,bottom:b.bottom,width:b.width};
     }));
     for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){
       const a=rects[i],b=rects[j];
       const ix=Math.min(a.right,b.right)-Math.max(a.left,b.left);
       const iy=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top);
       if(ix>0&&iy>0){
         const detail=await p11.evaluateAll(nodes=>nodes.map(n=>({name:n.textContent,
           left:n.style.left,right:n.style.right,cssWidth:n.getBoundingClientRect().width,
           offsetWidth:n.offsetWidth,offsetTop:n.offsetTop,scale:n.closest('.page').getBoundingClientRect().width/n.closest('.page').offsetWidth})));
         console.error('PBS_OVERLAP_DEBUG',name,label,JSON.stringify(detail));
       }
       assert(!(ix>0&&iy>0),`${label}: PBS labels overlap: ${JSON.stringify([a,b])}`);
     }
     return rects;
   };
   const p11Original=await verifyNoOverlap('page 11 initial');
   const badge=bid=>page.locator(`.lab-ocr-pdf-pbs-layer[data-page="11"] .lab-ocr-pdf-pbs-tag[data-block-id="${bid}"]`);
   const box11=bid=>page.locator(`.lab-ocr-pdf-overlay-layer[data-page="11"] .lab-ocr-pdf-overlay-box[data-block-ids~="${bid}"]`);
   // A parent selected on page 1 already highlights its cross-page child.
   assert.equal(await badge(107).getAttribute('data-family-selected'),'true');
   assert.equal(await box11(107).getAttribute('data-family-selected'),'true');
   await badge(101).click();
   await page.waitForFunction(()=>document.querySelector('.lab-ocr-pdf-pbs-tag[data-block-id="103"]')?.dataset.familySelected==='true');
   for(const child of [102,103]){
     assert.equal(await badge(child).getAttribute('data-family-selected'),'true');
     assert.equal(await box11(child).getAttribute('data-family-selected'),'true');
     assert.equal(await badge(child).getAttribute('data-selected'),'false');
   }
   for(const unrelated of [104,105,106,107]){
     assert.equal(await badge(unrelated).getAttribute('data-family-selected'),'false');
   }
   assert.equal(await badge(101).getAttribute('data-selected'),'true');
   assert.equal(await box11(101).getAttribute('data-selected'),'true');
   const style=await page.evaluate(()=>{
     const parent=document.querySelector('.lab-ocr-pdf-pbs-tag[data-block-id="101"]');
     const child=document.querySelector('.lab-ocr-pdf-pbs-tag[data-block-id="102"]');
     return {parentBase:getComputedStyle(parent).backgroundColor,childBase:getComputedStyle(child).backgroundColor,
       childBorder:getComputedStyle(child).borderTopStyle};
   });
   assert.equal(style.parentBase,'rgba(39, 63, 60, 0.94)');
   assert.equal(style.childBase,'rgba(34, 56, 70, 0.95)');
   assert.equal(style.childBorder,'solid','Child border must match Main scheme without dashes');
   await badge(102).click();
   assert.equal(await badge(101).getAttribute('data-family-selected'),'false');
   assert.equal(await badge(101).getAttribute('data-selected'),'false');
   assert.equal(await badge(102).getAttribute('data-selected'),'true');
   assert.equal(await badge(103).getAttribute('data-family-selected'),'true','Child is parent of its grandchild');
   assert.equal(await badge(106).getAttribute('data-family-selected'),'false');
   await badge(101).click();
   assert.deepEqual(p11Original.map(x=>x.name).sort(),page11.map(x=>x.pbs).sort());
   await mkdir('.runtime/pbs-overlap-evidence',{recursive:true});
   await page.evaluate(()=>{
     const button=document.querySelector('.lab-ocr-pdf-pbs-layer[data-page="11"] .lab-ocr-pdf-pbs-tag[data-block-id="102"]');
     const scroller=document.querySelector('.lab-ocr-pdf-scroller');
     if(button&&scroller)scroller.scrollLeft+=button.getBoundingClientRect().left-scroller.getBoundingClientRect().left-90;
   });
   await page.screenshot({path:`.runtime/pbs-overlap-evidence/page11-${name.replace(/[^a-z0-9-]/gi,'_')}-baseline.png`});
   // Simulate a delayed font-metric update after the first layout. Previously
   // the measured tag widths were never recomputed and could overlap.
   await page.addStyleTag({content:'.lab-ocr-pdf-pbs-tag {font-size:19px !important}'});
   await page.waitForFunction(oldWidth=>{
     const a=document.querySelector('.lab-ocr-pdf-pbs-layer[data-page="11"] .lab-ocr-pdf-pbs-tag[data-block-id="101"]');
     return a&&getComputedStyle(a).fontSize==='19px'&&a.getBoundingClientRect().width>oldWidth*1.15;
   },p11Original.find(x=>x.name==='p11b0').width);
   await page.waitForTimeout(250);
   const p11Resized=await verifyNoOverlap('page 11 after font change');
   await page.locator('.lab-ocr-pdf-scale').selectOption('150');
   await page.waitForFunction(()=>document.querySelectorAll('.lab-ocr-pdf-pbs-layer[data-page="11"] .lab-ocr-pdf-pbs-tag').length===7);
   await page.waitForTimeout(350);
   await verifyNoOverlap('page 11 at 150% zoom');
   await page.evaluate(()=>{
     const button=document.querySelector('.lab-ocr-pdf-pbs-layer[data-page="11"] .lab-ocr-pdf-pbs-tag[data-block-id="102"]');
     const scroller=document.querySelector('.lab-ocr-pdf-scroller');
     if(button&&scroller)scroller.scrollLeft+=button.getBoundingClientRect().left-scroller.getBoundingClientRect().left-90;
   });
   await page.screenshot({path:`.runtime/pbs-overlap-evidence/page11-${name.replace(/[^a-z0-9-]/gi,'_')}-stress.png`});
   await p11.filter({hasText:'p11b01'}).click();
   await page.waitForFunction(()=>document.querySelector('#workspace .ag-row-selected .ag-cell[col-id="block_id"]')?.textContent.trim()==='102');
   assert.match(await page.locator('.ocr-cm-source .cm-content').innerText(),/\"blockId\": \"102\"/); // status can be replaced by async version check
   assert.deepEqual(errors,[]);
   console.log('LAB_OCR_PBS_PAGE11_NON_OVERLAP_PASS',name,JSON.stringify({initial:p11Original.length,
     resized:p11Resized.length,secondLabelX:p11Resized.find(x=>x.name==='p11b01').left}));
   console.log('LAB_OCR_PBS_LINK_PASS',name,JSON.stringify({pdfReads,rowsReads,overlays:overlays.length,
     page1Tags:3,denseTags:denseCount,aliases:true}));
  }finally{await browser.close();}
 }
}finally{vite?.kill('SIGTERM');}
