/** WCP48 real PDF.js/AG/CM6: parent+parent yields ONE parent + FOUR children.
 * Source parent is a retained, inactive review atom: never deleted from SQL.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {chromium,webkit} from 'playwright';
import {makeLabOcrPdf} from './helpers/lab-ocr-pdf-fixture.mjs';
import {planBlockMoveInMemory} from '../ui/lab-ocr/block-runtime.js';

const port=5369,book='/isolated/parent-parent-merge';
const url=`http://127.0.0.1:${port}/labs/lab-ocr/`;
const vite=spawn('node',['node_modules/vite/bin/vite.js','--config',
  'labs/lab-ocr/vite.config.mjs','--host','127.0.0.1','--port',String(port),
  '--strictPort'],{stdio:['ignore','pipe','pipe']});
let startup='';vite.stdout.on('data',chunk=>startup+=chunk);vite.stderr.on('data',chunk=>startup+=chunk);
const initial=[
 [10,null,0,'p1b0',[40,70,220,190]],
 [11,10,0,'p1b0s0',[52,80,125,122]],
 [12,10,1,'p1b0s1',[52,133,125,178]],
 [20,null,1,'p1b1',[340,210,520,345]],
 [21,20,0,'p1b1s0',[350,220,420,265]],
 [22,20,1,'p1b1s1',[350,275,420,330]],
].map(([block_id,parent_block_id,sibling_order,pbs,bbox])=>({
 block_id,parent_block_id,sibling_order,pbs,bbox,absorbed_into_block_id:null,
 global_page:0,block_group:'para_blocks',block_type:'table',
 source_name:'fixture.json',source_block_key:'immutable:'+block_id,
 block_path:'original:'+block_id,block_bbox_json:JSON.stringify(bbox),
 block_json:JSON.stringify({type:'table',originalBlockId:block_id}),
 span_count:0,line_count:0,span_types:'',content_preview:'body '+block_id,
}));
const original=JSON.stringify(initial);
const snapshot=rows=>rows.map(r=>[r.block_id,r.parent_block_id,r.sibling_order,
  r.pbs,r.absorbed_into_block_id]).sort((a,b)=>a[0]-b[0]);
function restore(rows,changes){
 const changesById=new Map(changes.map(row=>[row[0],row]));
 for(const row of rows){
  const change=changesById.get(row.block_id);
  if(!change)continue;
  row.parent_block_id=change[1];row.sibling_order=change[2];
  row.pbs=change[3];row.absorbed_into_block_id=change[4];
 }
}
try{
 let ready=false;
 for(let i=0;i<100;i++){try{if((await fetch(url)).ok){ready=true;break;}}
  catch{}await sleep(180);}
 assert(ready,'Vite did not start '+startup.slice(-450));
 for(const [name,engine] of [['Chromium',chromium],['iPad-WebKit',webkit]]
   .filter(([n])=>!process.env.LAB_OCR_TEST_BROWSER||n===process.env.LAB_OCR_TEST_BROWSER)){
  const browser=await engine.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:{width:1150,height:850},hasTouch:true});
   page.setDefaultTimeout(20000);
   let revision=0,cursor=0,applies=0,undos=0,redos=0,pdfReads=0;
   const rows=initial.map(row=>({...row})),history=[];
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(({book})=>{
    localStorage.setItem('ocr2md.lab-ocr.settings.json.v1',JSON.stringify({settings:{
     'workspace.dataDirectory':{key:'dataDirectory',category1:'工作区',category2:'目录',
      comment:'Isolated parent merge',value:book,range:{kind:'server-directory'}},
    }}));
   },{book});
   await page.route('**/labs/lab-ocr/api/ocr/**',async route=>{
    const u=new URL(route.request().url()),op=u.pathname.split('/').at(-1);
    const body=route.request().method()==='POST'?
      JSON.parse(route.request().postData()||'{}'):null;
    const reply=v=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(v)});
    if(op==='pdf'){pdfReads++;return route.fulfill({
      status:200,contentType:'application/pdf',body:makeLabOcrPdf(2)});}
    if(op==='inspect')return reply({status:'unchanged',blocks:6,pages:2,
      pdf:'fixture.pdf',sources:[{name:'fixture.json',pages:2}]});
    if(op==='minerujson2block')return reply({status:'ready',kind:'view',blocks:6});
    if(op==='rows'){
      const table=u.searchParams.get('table');
      return reply(table==='block'?{table,total:6,rows}: {table,total:0,rows:[]});
    }
    if(op==='block-edit-state')return reply({revision,cursor,
      canUndo:cursor>0,canRedo:cursor<history.length,
      history:history.map((h,i)=>({seq:i+1,page:1,pages:[1],
        before:h.before,after:h.after,operation:h.operation}))});
    if(op==='overlays'){
      const pageNum=Number(u.searchParams.get('page')),level=u.searchParams.get('level');
      return reply({level,page:pageNum,pageSize:[595,842],
        boxes:level==='block'&&pageNum===1?rows
          .map(r=>({id:'b'+r.block_id,blockId:String(r.block_id),pbs:r.pbs,
            parentBlockId:r.parent_block_id==null?null:String(r.parent_block_id),
            absorbedIntoBlockId:r.absorbed_into_block_id==null?null:String(r.absorbed_into_block_id),
            blockGroup:'para_blocks',blockType:r.block_type,bbox:r.bbox})):[]});
    }
    if(op==='block-edit-batch'){
      assert.equal(body.expectedRevision,revision);
      for(const command of body.operations){
       if(command.action==='apply'){
         const plan=planBlockMoveInMemory(rows,command.sourceBlockId,
           command.targetBlockId,command.placement);
         assert.equal(plan.absorbsParent,true);
         history.splice(cursor);
         history.push({before:plan.before,after:plan.after,
           operation:{scope:'delta',pages:[1],absorbsParent:true,
             sourceBlockId:20,targetBlockId:10,placement:'child'}});
         restore(rows,plan.after);cursor=history.length;applies++;
       }else if(command.action==='undo'){
         assert(cursor>0);
         restore(rows,history[cursor-1].before);cursor--;undos++;
       }else if(command.action==='redo'){
         assert(cursor<history.length);
         restore(rows,history[cursor].after);cursor++;redos++;
       }else throw Error('Unexpected command '+command.action);
       revision++;
      }
      return reply({revision,appliedCount:body.operations.length,canUndo:cursor>0,
        canRedo:cursor<history.length});
    }
    throw Error('Unexpected API '+op);
   });
   await page.goto(url,{waitUntil:'domcontentloaded'});
   const tag=id=>page.locator(`.lab-ocr-pdf-pbs-tag[data-block-id="${id}"]`);
   await page.waitForFunction(()=>document.querySelectorAll('.lab-ocr-pdf-pbs-tag').length===6);
   assert.equal(await page.locator('#workspace .ag-row').count(),6);
   const source=tag(20),target=page.locator(
     '.lab-ocr-pdf-overlay-layer[data-page="1"] .lab-ocr-pdf-overlay-box[data-block-ids~="10"]');
   const src=await source.boundingBox(),dest=await target.boundingBox();
   assert(src&&dest,'Both parent bboxes should be visible');
   const pointer={pointerId:53,pointerType:'touch',isPrimary:true,button:0,bubbles:true};
   const start={x:src.x+src.width/2,y:src.y+src.height/2};
   const end={x:dest.x+dest.width*.85,y:dest.y+dest.height*.65};
   await source.dispatchEvent('pointerdown',{...pointer,clientX:start.x,clientY:start.y});
   await page.locator('.lab-ocr-pdf-drag-source').waitFor({state:'attached',timeout:2200});
   await page.locator('body').dispatchEvent('pointermove',{...pointer,clientX:end.x,clientY:end.y});
   await page.locator('.lab-ocr-pdf-drop-guide').waitFor({state:'visible'});
   assert.equal(await page.locator('.lab-ocr-pdf-drop-guide').getAttribute('data-placement'),'child');
   await page.locator('body').dispatchEvent('pointerup',{...pointer,clientX:end.x,clientY:end.y});
   await page.waitForFunction(()=>document.querySelectorAll('.lab-ocr-pdf-pbs-tag').length===5&&
     document.querySelectorAll('#workspace .ag-row').length===5);
   assert.equal(await tag(20).count(),0,'Absorbed parent must not paint an extra label');
   assert.deepEqual((await page.locator('.lab-ocr-pdf-pbs-tag').allInnerTexts()).sort(),
     ['p1b0','p1b0s0','p1b0s1','p1b0s2','p1b0s3'].sort());
   assert.equal(await page.locator('.lab-ocr-pdf-overlay-box').count(),5);
   const cm=await page.evaluate(()=>document.querySelector('.ocr-cm-source')?.ocrCmTable?.runtime());
   assert.equal(cm.rows.length,6,'CM keeps all original identities and audit rows');
   assert.equal(cm.rows.find(r=>r.block_id===20).absorbed_into_block_id,10);
   assert.equal(cm.rows.find(r=>r.block_id===20).block_json,
     JSON.stringify({type:'table',originalBlockId:20}));
   assert.equal(JSON.stringify(initial),original);
   await page.locator('#global-save').click();
   await page.waitForFunction(()=>document.querySelector('.ocr-cm-source')?.ocrCmTable?.runtime()?.revision===1);
   assert.equal(applies,1);
   await page.reload({waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>document.querySelectorAll('.lab-ocr-pdf-pbs-tag').length===5&&
     document.querySelectorAll('#workspace .ag-row').length===5);
   assert.equal(await tag(20).count(),0);
   await page.locator('#undo').click();
   await page.waitForFunction(()=>document.querySelectorAll('.lab-ocr-pdf-pbs-tag').length===6&&
     document.querySelectorAll('#workspace .ag-row').length===6);
   assert.equal(await tag(20).innerText(),'p1b1');
   await page.locator('#redo').click();
   await page.waitForFunction(()=>document.querySelectorAll('.lab-ocr-pdf-pbs-tag').length===5&&
     document.querySelectorAll('#workspace .ag-row').length===5).catch(async e=>{
       console.error('PARENT_MERGE_REDO_DIAG',name,JSON.stringify({
         status:await page.locator('#status').innerText(),
         ag:await page.locator('#workspace .ag-row').count(),
         tags:await page.locator('.lab-ocr-pdf-pbs-tag').allInnerTexts(),
         cm:await page.evaluate(()=>{const s=document.querySelector('.ocr-cm-source')?.ocrCmTable?.runtime();
           return {revision:s?.revision,cursor:s?.cursor,pending:s?.queue,
             rows:s?.rows?.map(r=>[r.block_id,r.parent_block_id,r.pbs,r.absorbed_into_block_id])};}),
         applies,undos,redos,revision,errors,
       }));
       throw e;
     });
   assert.equal(await tag(20).count(),0);
   await page.locator('#global-save').click();
   await page.waitForFunction(()=>document.querySelector('.ocr-cm-source')?.ocrCmTable?.runtime()?.revision===3);
   assert.equal(undos,1);assert.equal(redos,1);
   assert.equal(pdfReads,2,'One PDF read per page load; no drag re-download');
   assert.deepEqual(errors,[]);
   console.log('LAB_OCR_PARENT_MERGE_E2E_PASS',name,
     JSON.stringify({applies,undos,redos,revision,pdfReads}));
  }finally{await browser.close();}
 }
}finally{vite.kill('SIGTERM');}
