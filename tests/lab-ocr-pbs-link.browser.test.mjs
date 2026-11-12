/** Public component contract: PBS rails, dedup aliases, PDF↔AG by stable Block ID.
 * Exercises the real AG Grid, PDF.js, Frame ports in Chromium and iPad WebKit.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
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
const dense=Array.from({length:62},(_,i)=>({
 id:'b-dense-'+i,blockId:String(i+5),pbs:'p2b'+i,group:'para_blocks',type:'text',
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
    if(op==='pdf'){pdfReads++;return route.fulfill({status:200,contentType:'application/pdf',body:makeLabOcrPdf()});}
    if(op==='overlays'){
      const level=parsed.searchParams.get('level'),number=Number(parsed.searchParams.get('page'));
      overlays.push(`${level}:${number}`);
      const source=number===1?blocks:number===2?dense:[];
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
        level,page:number,pageSize:[595,842],
        boxes:source.map(row=>({id:level==='block'?row.id:'span-'+row.id,
          blockId:row.blockId,pbs:row.pbs,parentBlockId:row.parentBlockId??null,
          blockGroup:row.group,blockType:row.type,bbox:row.bbox})),
      })});
    }
    if(op==='inspect')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
      status:'unchanged',blocks:66,pages:3,pdf:'book.pdf',sources:[{name:'source.json',pages:3}]})});
    if(op==='minerujson2block')return route.fulfill({status:200,contentType:'application/json',body:'{"blocks":66}'});
    if(op==='minerujson2span')return route.fulfill({status:200,contentType:'application/json',body:'{"spans":66}'});
    if(op==='rows'){
      rowsReads++;
      assert.equal(parsed.searchParams.get('table'),'block');
      const all=[...blocks.map(b=>rowOf(b,0)),...dense.map(b=>rowOf(b,1))];
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
   // PDF → AG works even when SQL Block navigation has not yet been opened.
   await page.locator('.lab-ocr-pdf-pbs-tag[data-block-id="4"]').click();
   await page.waitForFunction(()=>document.querySelector('#workspace .ag-row-selected .ag-cell[col-id="block_id"]')?.textContent.trim()==='4',
     null,{timeout:17000});
   assert.equal(rowsReads,1,'PDF selection should initialize AG block table once');
   assert.match(await page.locator('#status').innerText(),/PDF → AG · p1b1 · BlockID 4/);
   assert.match(await page.locator('.ocr-cm-source .cm-content').innerText(),/"blockId": "4"/);
   // AG → PDF: select an alias Block ID whose geometry was merged into
   // representative b-para (same PBS as ID 2, different processing group).
   await page.locator('#workspace .ag-row .ag-cell[col-id="block_id"]').filter({hasText:/^1$/}).click();
   await page.waitForFunction(()=>document.querySelector('.lab-ocr-pdf-overlay-box[data-id="b-para"]')?.dataset.selected==='true');
   assert.equal(await page.locator('.lab-ocr-pdf-pbs-tag[data-block-id="2"]').getAttribute('data-selected'),'true');
   assert.match(await page.locator('#status').innerText(),/Block 定位：p1b0 · BlockID 1/);
   // PDF → AG by ID must distinguish parent and child even when PBS is shared
   // across unrelated processing groups.
   await page.locator('.lab-ocr-pdf-pbs-tag[data-block-id="3"]').click();
   await page.waitForFunction(()=>document.querySelector('#workspace .ag-row-selected .ag-cell[col-id="block_id"]')?.textContent.trim()==='3');
   assert.match(await page.locator('.ocr-cm-source .cm-content').innerText(),/"blockId": "3"/);
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
   assert.equal(await page.locator('.lab-ocr-pdf-pbs-picker').count(),0,'No disclosure popup');
   assert.equal(await denseTags.filter({hasText:/\+/}).count(),0,'No +N collapsed labels');
   const layout=await denseTags.evaluateAll(nodes=>nodes.map(node=>{
     const rect=node.getBoundingClientRect(),pageRect=node.closest('.page').getBoundingClientRect();
     return {id:node.dataset.blockId,lane:Number(node.dataset.lane),side:node.dataset.side,
       text:node.textContent,top:rect.top-pageRect.top,left:rect.left-pageRect.left,
       right:rect.right-pageRect.left,height:rect.height};
   }));
   assert.equal(new Set(layout.map(x=>x.id)).size,62);
   assert(layout.some(x=>x.lane>=1),'Crowding must produce at least one outward lane');
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
   assert(originalLane1.right<originalLane0.right,
     'Left tags must move left when blocked');
   const scroller=await page.locator('.lab-ocr-pdf-scroller').evaluate(el=>({
     scrollWidth:el.scrollWidth,clientWidth:el.clientWidth}));
   assert(scroller.scrollWidth>scroller.clientWidth,
     'Long leader lines + outer labels must be horizontally scrollable '+JSON.stringify(scroller));
   // A far-out badge remains accessible through horizontal touch/scroll.
   await denseTags.filter({hasText:'p2b61'}).click();
   await page.waitForFunction(()=>document.querySelector('#workspace .ag-row-selected .ag-cell[col-id="block_id"]')?.textContent.trim()==='66');
   assert.match(await page.locator('#status').innerText(),/PDF → AG · p2b61 · BlockID 66/);
   assert.equal(pdfReads,1);
   assert.deepEqual(errors,[]);
   console.log('LAB_OCR_PBS_LINK_PASS',name,JSON.stringify({pdfReads,rowsReads,overlays:overlays.length,
     page1Tags:3,denseTags:await denseTags.count(),aliases:true}));
  }finally{await browser.close();}
 }
}finally{vite?.kill('SIGTERM');}
