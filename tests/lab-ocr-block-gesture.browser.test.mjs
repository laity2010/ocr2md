/** WP1–WP5 PDF gesture integration against a deterministic isolated block API.
 * Real PDF.js + AG Grid + CM6; no user's SQLite/PDF changes in this test.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {chromium,webkit} from 'playwright';
import {makeLabOcrPdf} from './helpers/lab-ocr-pdf-fixture.mjs';

const port=5346,book='/isolated/block-edit';
const url=process.env.LAB_OCR_TEST_URL||`http://127.0.0.1:${port}/labs/lab-ocr/`;
const vite=process.env.LAB_OCR_TEST_URL?null:spawn('node',[
 'node_modules/vite/bin/vite.js','--config','labs/lab-ocr/vite.config.mjs',
 '--host','127.0.0.1','--port',String(port),'--strictPort'],{stdio:['ignore','pipe','pipe']});
let output='';vite?.stdout.on('data',chunk=>output+=chunk);vite?.stderr.on('data',chunk=>output+=chunk);

const fixture=[
 {block_id:100,pbs:'p1b0',parent_block_id:null,sibling_order:0,block_type:'text',bbox:[60,60,180,125]},
 {block_id:101,pbs:'p1b1',parent_block_id:null,sibling_order:1,block_type:'table',bbox:[350,180,510,280]},
 {block_id:102,pbs:'p1b1s0',parent_block_id:101,sibling_order:0,block_type:'table_body',bbox:[350,180,510,280]},
 {block_id:103,pbs:'p1b2',parent_block_id:null,sibling_order:2,block_type:'text',bbox:[350,355,510,420]},
 {block_id:104,pbs:'p1b2s0',parent_block_id:103,sibling_order:0,block_type:'text',bbox:[365,370,500,410]},
];
const changed=[
 [100,101,1,'p1b0s1'],
 [101,null,0,'p1b0'],
 [102,101,0,'p1b0s0'],
 [103,null,1,'p1b1'],
 [104,103,0,'p1b1s0'],
];
const before=fixture.map(x=>[x.block_id,x.parent_block_id,x.sibling_order,x.pbs]);
function setSnapshot(records,snapshot){
 const byId=new Map(snapshot.map(([id,parent,sibling,pbs])=>[id,{parent,sibling,pbs}]));
 for(const row of records){
  const next=byId.get(row.block_id);
  row.parent_block_id=next.parent;row.sibling_order=next.sibling;row.pbs=next.pbs;
 }
}
function makeRows(records){
 return records.map(row=>({...row,global_page:0,block_group:'para_blocks',
  source_name:'fixture.json',source_block_key:'source:'+row.block_id,
  block_path:'original:'+row.block_id,
  block_bbox_json:JSON.stringify(row.bbox),block_json:JSON.stringify({type:row.block_type,id:row.block_id}),
  span_count:0,line_count:0,span_types:'',content_preview:row.block_type}));
}
try{
 let ready=false;
 for(let i=0;i<100;i++){
  try{if((await fetch(url)).ok){ready=true;break;}}catch{}
  await sleep(200);
 }
 assert(ready,'Vite not ready: '+output.slice(-600));
 for(const [name,engine] of [['Chromium',chromium],['iPad-WebKit',webkit]]){
  const browser=await engine.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:{width:1150,height:850},hasTouch:true});
   page.setDefaultTimeout(19000);
   const errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   let pdfReads=0,rowsReads=0,overlayReads=0,batches=0,postAttempts=0,
     applies=0,undos=0,redos=0,revision=0,cursor=0,lostOnce=false;
   const receipts=new Map();
   const records=fixture.map(x=>({...x}));
   await page.addInitScript(({book})=>{
    localStorage.setItem('ocr2md.lab-ocr.settings.json.v1',JSON.stringify({settings:{
     'workspace.dataDirectory':{key:'dataDirectory',category1:'工作区',category2:'目录',
       comment:'Isolated fixture',value:book,range:{kind:'server-directory'}},
    }}));
   },{book});
   await page.route('**/labs/lab-ocr/api/ocr/**',async route=>{
    const u=new URL(route.request().url()),op=u.pathname.split('/').at(-1);
    const body=route.request().method()==='POST'?JSON.parse(route.request().postData()||'{}'):null;
    const reply=data=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
    if(op==='pdf'){pdfReads++;return route.fulfill({status:200,contentType:'application/pdf',body:makeLabOcrPdf(2)});}
    if(op==='inspect')return reply({status:'unchanged',blocks:5,pages:2,pdf:'fixture.pdf',
      sources:[{name:'fixture.json',pages:2}]});
    if(op==='minerujson2block')return reply({status:'unchanged',blocks:5});
    if(op==='minerujson2span')return reply({status:'unchanged',spans:0});
    if(op==='rows'){rowsReads++;
      const table=u.searchParams.get('table');
      return reply(table==='block'?{table:'block',total:5,rows:makeRows(records)}:
        {table,total:0,rows:[]});
    }
    if(op==='block-edit-state')return reply({revision,canUndo:cursor===1,
      canRedo:cursor===0&&revision>0,cursor,
      history:revision?[{seq:1,page:1,before,after:changed,
        operation:{sourceBlockId:100,targetBlockId:101,placement:'child'}}]:[]});
    if(op==='block-edit-batch'){
      postAttempts++;
      assert.equal(body.workspace,book,'Authorization remains scoped to the current book');
      if(receipts.has(body.batchId))return reply(receipts.get(body.batchId));
      assert.equal(body.expectedRevision,revision,'Every batch uses the latest SQL revision');
      batches++;
      for(const command of body.operations){
        if(command.action==='apply'){
          assert.deepEqual([command.sourceBlockId,command.targetBlockId,command.placement],
            [100,101,'child']);
          applies++;cursor=1;setSnapshot(records,changed);
        }else if(command.action==='undo'){
          undos++;cursor=0;setSnapshot(records,before);
        }else if(command.action==='redo'){
          redos++;cursor=1;setSnapshot(records,changed);
        }else throw Error('unexpected deferred action '+command.action);
        revision++;
      }
      const response={revision,appliedCount:body.operations.length,canUndo:cursor===1,canRedo:cursor===0};
      receipts.set(body.batchId,response);
      // Simulate a lost HTTP response AFTER SQLite has durably committed.
      // Retrying with the same batch ID must not perform Undo/Redo twice.
      if(batches===2&&!lostOnce){
        lostOnce=true;
        return route.fulfill({status:503,contentType:'application/json',
          body:JSON.stringify({error:'connection lost after commit'})});
      }
      return reply(response);
    }
    if(op==='overlays'){
      overlayReads++;
      const p=Number(u.searchParams.get('page')),level=u.searchParams.get('level');
      return reply({level,page:p,pageSize:[595,842],
        boxes:level==='block'&&p===1?records.map(row=>({
          id:'b'+row.block_id,blockId:String(row.block_id),parentBlockId:row.parent_block_id==null?null:String(row.parent_block_id),
          pbs:row.pbs,blockGroup:'para_blocks',blockType:row.block_type,bbox:row.bbox})):[]});
    }
    throw Error('Unexpected OCR route '+op);
   });
   await page.goto(url,{waitUntil:'domcontentloaded'});
   const tag=id=>page.locator(`.lab-ocr-pdf-pbs-layer[data-page="1"] .lab-ocr-pdf-pbs-tag[data-block-id="${id}"]`);
   const paper=page.locator('.lab-ocr-pdf-overlay-layer[data-page="1"]');
   const source=tag(100),target=paper.locator('.lab-ocr-pdf-overlay-box[data-block-ids~="101"]');
   await page.waitForFunction(()=>document.querySelector('select.ocr-source-file-select')?.value==='sql:block'&&
      document.querySelectorAll('.lab-ocr-pdf-pbs-layer[data-page="1"] .lab-ocr-pdf-pbs-tag').length===5);
   assert.equal(await page.locator('#workspace .ag-row').count(),5);
   assert.equal(await tag(102).innerText(),'p1b1s0','Identical parent and child bbox preserve both tags');
   // Safari pinch-zoom can shift/scale fixed overlay coordinates relative
   // to the PDF label's client rectangle. Deterministically emulate that
   // mismatch in iPad WebKit; a correct arrow must start on the label still.
   if(name==='iPad-WebKit')await page.addStyleTag({content:`
     .lab-ocr-pdf-drag-arrow,.lab-ocr-pdf-drop-guide{
       transform:translate(131px,79px) scale(1.18);
       transform-origin:top left;
     }`});
   const readPdfViewport=()=>page.evaluate(()=>{
     const scroller=document.querySelector('.lab-ocr-pdf-scroller');
     const paper=scroller.querySelector('.page');
     const r=paper?.getBoundingClientRect();
     return {top:scroller.scrollTop,left:scroller.scrollLeft,
       maxTop:scroller.scrollHeight-scroller.clientHeight,
       maxLeft:scroller.scrollWidth-scroller.clientWidth,
       pageRect:r?{left:r.left,top:r.top,width:r.width,height:r.height}:null,
       zoom:document.querySelector('.lab-ocr-pdf-scale')?.value??null,
       page:document.querySelector('.lab-ocr-pdf-page')?.value??null};
   });
   const pointer={pointerId:65,pointerType:'touch',isPrimary:true,button:0,bubbles:true};
   // WP1: simple click selects, does not start a transaction.
   await source.click();
   assert.equal(applies,0);
   // Reproduce a user who has scrolled/zoomed within PDF before dropping.
   // The edit must not request another PDF 'focus' scroll or reset PDF.js.
   await page.evaluate(()=>{
     const s=document.querySelector('.lab-ocr-pdf-scroller');
     s.scrollTop=Math.min(40,Math.max(0,s.scrollHeight-s.clientHeight));
     s.scrollLeft=Math.min(65,Math.max(0,s.scrollWidth-s.clientWidth));
   });
   await sleep(120);
   const beforeDropViewport=await readPdfViewport();
   assert(beforeDropViewport.maxTop>70,'PDF viewport fixture must actually be scrollable');
   assert(beforeDropViewport.top>15,'The viewport must be offset before dragging');
   const src=await source.boundingBox(),dst=await target.boundingBox();
   assert(src&&dst,'Visible source and target');
   const start={x:src.x+src.width/2,y:src.y+src.height/2};
   const end={x:dst.x+dst.width*.4,y:dst.y+dst.height*.52};
   await source.dispatchEvent('pointerdown',{...pointer,clientX:start.x,clientY:start.y});
   await page.locator('.lab-ocr-pdf-drag-source').waitFor({state:'attached',timeout:2100});
   assert.equal(await page.locator('.lab-ocr-pdf-drag-arrow').count(),1);
   const arrowOrigin=await page.locator('.lab-ocr-pdf-drag-arrow').evaluate(svg=>{
     const path=svg.querySelector('path')?.getAttribute('d')||'';
     const match=/^M\s+([-\d.]+)\s+([-\d.]+)/.exec(path);
     if(!match)return null;
     const r=svg.getBoundingClientRect();
     return {x:r.left+Number(match[1])*r.width/svg.clientWidth,
       y:r.top+Number(match[2])*r.height/svg.clientHeight};
   });
   assert(arrowOrigin,'Drag arrow must have a valid source path');
   assert(Math.hypot(arrowOrigin.x-start.x,arrowOrigin.y-start.y)<2,
     'Arrow source must align to the actual PBS badge after Safari zoom and pan: '+JSON.stringify({arrowOrigin,start}));
   if(name==='iPad-WebKit'){
     await page.evaluate(()=>{
       // Safari can move the visual viewport *during* a long press. The
       // visualViewport scroll event must repaint from the live tag rect.
       const sheet=document.createElement('style');
       sheet.textContent='.lab-ocr-pdf-drag-arrow{transform:translate(72px,108px) scale(.91)!important}';
       document.head.append(sheet);
       window.visualViewport?.dispatchEvent(new Event('scroll'));
     });
     const shifted=await page.locator('.lab-ocr-pdf-drag-arrow').evaluate(svg=>{
       const m=/^M\s+([-\d.]+)\s+([-\d.]+)/.exec(svg.querySelector('path').getAttribute('d'));
       const rect=svg.getBoundingClientRect();
       return {x:rect.left+Number(m[1])*rect.width/svg.clientWidth,
         y:rect.top+Number(m[2])*rect.height/svg.clientHeight};
     });
     assert(Math.hypot(shifted.x-start.x,shifted.y-start.y)<2,
       'Visual viewport scroll must keep the source pinned to the fingered PBS label');
   }
   await page.locator('body').dispatchEvent('pointermove',{...pointer,clientX:end.x,clientY:end.y});
   await page.locator('.lab-ocr-pdf-drop-guide').waitFor({state:'attached',timeout:3000});
   assert.equal(await page.locator('.lab-ocr-pdf-drop-guide').getAttribute('data-block-id'),'101');
   assert.equal(await page.locator('.lab-ocr-pdf-drop-guide').getAttribute('data-placement'),'child');
   const overlayGeometry=await page.evaluate(()=>{
     const svg=document.querySelector('.lab-ocr-pdf-drag-arrow');
     const guide=document.querySelector('.lab-ocr-pdf-drop-guide');
     const target=document.querySelector('.lab-ocr-pdf-pbs-tag[data-block-id="101"]');
     const clip=target.closest('.lab-ocr-pdf-scroller').getBoundingClientRect();
     const badge=target.getBoundingClientRect(),menu=guide.getBoundingClientRect();
     const expectedLeft=Math.max(clip.left+3,Math.min(badge.left+(badge.width-menu.width)/2,
       clip.right-menu.width-3));
     const expectedTop=badge.bottom+menu.height+8<=clip.bottom?
       badge.bottom+4:Math.max(clip.top+3,badge.top-menu.height-4);
     const circle=svg.querySelector('circle'),rect=svg.getBoundingClientRect();
     const endpoint={x:rect.left+Number(circle.getAttribute('cx'))*rect.width/svg.clientWidth,
       y:rect.top+Number(circle.getAttribute('cy'))*rect.height/svg.clientHeight};
     const slot=[...guide.children].findIndex(item=>item.classList.contains('active'));
     return {menu:{left:menu.left,top:menu.top},expectedLeft,expectedTop,
       badge:{left:badge.left,top:badge.top,bottom:badge.bottom,width:badge.width},
       clip:{left:clip.left,top:clip.top,right:clip.right,bottom:clip.bottom},
       scrollers:[...document.querySelectorAll('.lab-ocr-pdf-scroller')].map(s=>{
         const r=s.getBoundingClientRect();return [r.left,r.right,r.top,r.bottom];}),
       fixedStyle:{left:guide.style.left,top:guide.style.top},
       endpoint,expectedEndpoint:{x:menu.left+(slot+.5)*menu.width/guide.children.length,
         y:(menu.top+menu.bottom)/2}};
   });
   assert(Math.hypot(overlayGeometry.menu.left-overlayGeometry.expectedLeft,
     overlayGeometry.menu.top-overlayGeometry.expectedTop)<2,
     'Drop guide must be placed in the target badge client coordinate frame: '+
      JSON.stringify(overlayGeometry));
   assert(Math.hypot(overlayGeometry.endpoint.x-overlayGeometry.expectedEndpoint.x,
     overlayGeometry.endpoint.y-overlayGeometry.expectedEndpoint.y)<2,
     'SVG arrow head must terminate at the actual, shifted drop guide: '+
      JSON.stringify(overlayGeometry));
   assert.equal(await target.evaluate(el=>el.classList.contains('lab-ocr-pdf-drop-target')),true);
   const dropColor=await target.evaluate(el=>{
     const css=getComputedStyle(el);
     return {color:css.outlineColor,width:css.outlineWidth,offset:css.outlineOffset,bg:css.backgroundColor};
   });
   const selectedColor=await paper.locator('.lab-ocr-pdf-overlay-box[data-block-ids~="100"]')
     .evaluate(el=>{
       const css=getComputedStyle(el);
       return {color:css.outlineColor,width:css.outlineWidth,offset:css.outlineOffset,bg:css.backgroundColor};
     });
   assert.deepEqual(dropColor,selectedColor,
     'Drag target bbox uses exactly the same selected orange outline/background as clicked bbox');
   await page.locator('body').dispatchEvent('pointerup',{...pointer,clientX:end.x,clientY:end.y});
   await page.waitForFunction(()=>document.querySelector('.lab-ocr-pdf-pbs-tag[data-block-id="100"]')?.textContent==='p1b0s1',
      null,{timeout:14000}).catch(async error=>{
     console.error('BLOCK_GESTURE_DIAG',name,JSON.stringify({
       batches,applies,undos,redos,revision,rowsReads,overlayReads,
       status:await page.locator('#status').innerText(),
       badges:await page.locator('.lab-ocr-pdf-pbs-tag').evaluateAll(nodes=>
         nodes.map(node=>({pbs:node.textContent,id:node.dataset.blockId,selected:node.dataset.selected}))),
       errors,
     }));
     throw error;
   });
   await sleep(280);
   const afterDropViewport=await readPdfViewport();
   assert(Math.abs(afterDropViewport.top-beforeDropViewport.top)<2&&
     Math.abs(afterDropViewport.left-beforeDropViewport.left)<2,
     'Moving a Block into a child must not auto-scroll the PDF: '+
     JSON.stringify({beforeDropViewport,afterDropViewport}));
   assert.deepEqual([afterDropViewport.zoom,afterDropViewport.page],
     [beforeDropViewport.zoom,beforeDropViewport.page],
     'Moving a Block must not change PDF zoom or page');
   if(beforeDropViewport.pageRect&&afterDropViewport.pageRect){
     const p=beforeDropViewport.pageRect,q=afterDropViewport.pageRect;
     assert(Math.hypot(q.left-p.left,q.top-p.top)<2,
       'The PDF paper should stay at the same screen coordinates after a local edit: '+
       JSON.stringify({p,q}));
   }
   assert.equal(applies,0,'CM6 applies the edit before any SQL batch exists');
   assert.equal(records[0].pbs,'p1b0','SQL still contains the original PBS before idle flush');
   assert.equal(await tag(100).getAttribute('data-child'),'true');
   assert.equal(await tag(100).getAttribute('data-family-selected'),'false');
   assert.equal(await tag(101).innerText(),'p1b0');
   assert.equal(await tag(102).innerText(),'p1b0s0');
   assert.equal(await page.locator('.lab-ocr-pdf-drag-arrow').count(),0);
   assert.equal(await page.locator('#undo').isEnabled(),true);
   assert.equal(rowsReads,1,'AG/CM6 must patch rows, not reload all SQL');
   assert.equal(pdfReads,1,'PDF bytes must remain loaded throughout drag');
   assert.equal(await page.locator('#workspace .ag-row-selected .ag-cell[col-id="block_id"]').innerText(),'100');
   await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('SQLite 已异步保存'),
     null,{timeout:9500});
   assert.deepEqual([batches,applies,revision],[1,1,1],
     'The idle batch persists CM changes in the background');
   // At explicit PDF.js zoom (not just CSS pinch zoom), Undo/Redo are still
   // structural changes and must NOT navigate or re-center the PDF.
   await page.locator('.lab-ocr-pdf-scale').selectOption('125');
   await sleep(400);
   await page.evaluate(()=>{
     const s=document.querySelector('.lab-ocr-pdf-scroller');
     s.scrollTop=Math.min(110,Math.max(0,s.scrollHeight-s.clientHeight));
     s.scrollLeft=Math.min(78,Math.max(0,s.scrollWidth-s.clientWidth));
   });
   await sleep(130);
   const beforeUndoViewport=await readPdfViewport();
   assert.equal(beforeUndoViewport.zoom,'125');
   assert(beforeUndoViewport.top>15);
   await page.locator('#undo').click();
   await page.waitForFunction(()=>document.querySelector('.lab-ocr-pdf-pbs-tag[data-block-id="100"]')?.textContent==='p1b0');
   await sleep(280);
   const afterUndoViewport=await readPdfViewport();
   assert(Math.abs(afterUndoViewport.top-beforeUndoViewport.top)<2&&
     Math.abs(afterUndoViewport.left-beforeUndoViewport.left)<2,
     'Undo after 125% zoom must preserve PDF scroll and pan: '+
     JSON.stringify({beforeUndoViewport,afterUndoViewport}));
   assert.equal(afterUndoViewport.zoom,beforeUndoViewport.zoom);
   assert.equal(undos,0,'Undo is immediately applied in CM, not via SQL');
   assert.equal(await page.locator('#redo').isEnabled(),true);
   // Switch SQL tables while CM has an unapplied undo. A re-opened Block
   // projection must NOT fetch stale SQL and erase the in-memory change.
   const changeTab=value=>page.evaluate(next=>{
     // Tom Select owns the visible picker. Its native <select> is intentionally
     // hidden, so dispatch the documented native change event directly.
     const element=document.querySelector('#workspace select.ocr-source-file-select');
     element.value=next;element.dispatchEvent(new Event('change',{bubbles:true}));
   },value);
   await changeTab('sql:span');
   await page.waitForFunction(()=>document.querySelector('select.ocr-source-file-select')?.value==='sql:span'&&
     document.querySelector('#status')?.textContent?.includes('CM6 · span'));
   await changeTab('sql:block');
   await page.waitForFunction(()=>document.querySelector('select.ocr-source-file-select')?.value==='sql:block'&&
     document.querySelector('.lab-ocr-pdf-pbs-tag[data-block-id="100"]')?.textContent==='p1b0');
   assert.equal(rowsReads,2,'Switching Span then Block reads Span but reuses the CM Block state');
   await page.locator('#redo').click();
   await page.waitForFunction(()=>document.querySelector('.lab-ocr-pdf-pbs-tag[data-block-id="100"]')?.textContent==='p1b0s1');
   assert.equal(redos,0);
   await page.locator('#global-save').click();
   // The 1050ms idle flush is allowed to race with navigation. In the slow
   // WebKit run, its second batch may fail before Save is clicked; in the
   // fast run the first Save initiates that failing request. Both must retry
   // with the same receipt and preserve CM's current relationship.
   for(let i=0;i<30&&postAttempts<2;i++)await sleep(100);
   await sleep(250);
   assert.equal(await tag(100).innerText(),'p1b0s1',
     'A failed response must not roll back valid CM in-memory edits');
   assert.equal(lostOnce,true,'A server-committed batch lost its HTTP response once');
   if(postAttempts===2)await page.locator('#global-save').click();
   await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('已持久化至 SQLite'),
      null,{timeout:9000});
   assert(batches>=2&&batches<=3,
     'Idle may flush Undo before Redo; both schedules must preserve command ordering');
   assert.equal(postAttempts,batches+1,
     'Exactly one lost HTTP response is retried using an existing receipt');
   assert.deepEqual([undos,redos,revision],[1,1,3],
     'No Undo or Redo may be replayed twice, regardless of idle/manual batch boundaries');
   assert.equal(receipts.size,batches,
     'Retry must NOT allocate an additional batch ID for an already committed operation');
   assert.equal(rowsReads,2);
   assert.equal(pdfReads,1);
   await page.reload({waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>document.querySelector('select.ocr-source-file-select')?.value==='sql:block'&&
     document.querySelector('.lab-ocr-pdf-pbs-tag[data-block-id="100"]')?.textContent==='p1b0s1');
   assert.equal(await page.locator('#undo').isEnabled(),true,
     'A new CM session hydrates persisted SQLite history once on reload');
   assert.equal(rowsReads,3,'Reload initializes a fresh CM session from persisted SQL');
   assert.deepEqual(errors,[]);
   console.log('LAB_OCR_CM_DEFERRED_GESTURE_E2E_PASS',name,JSON.stringify({batches,postAttempts,applies,undos,redos,
     pdfReads,rowsReads,overlayReads,revision,pbs100:await tag(100).innerText()}));
  }finally{await browser.close();}
 }
}finally{vite?.kill('SIGTERM');}
