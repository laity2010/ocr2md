/** WCP44: loaded legacy grandchild is immediately flattened in CM6,
 * then durably persisted without modifying OCR source fields.
 * Real PDF.js + AG Grid; no user book touched.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {chromium,webkit} from 'playwright';
import {makeLabOcrPdf} from './helpers/lab-ocr-pdf-fixture.mjs';
import {planFlattenPageInMemory,planBlockMoveInMemory} from '../ui/lab-ocr/block-runtime.js';

const port=5349,book='/isolated/two-level';
const url=`http://127.0.0.1:${port}/labs/lab-ocr/`;
const vite=spawn('node',['node_modules/vite/bin/vite.js','--config',
 'labs/lab-ocr/vite.config.mjs','--host','127.0.0.1','--port',String(port),
 '--strictPort'],{stdio:['ignore','pipe','pipe']});
let serverLog='';
vite.stdout.on('data',chunk=>serverLog+=chunk);
vite.stderr.on('data',chunk=>serverLog+=chunk);
const base=[
 [100,null,0,'p1b0',[30,40,180,100]],
 [101,100,0,'p1b0s0',[35,45,125,95]],
 [102,101,0,'p1b0s0s0',[42,55,119,90]],
 [103,null,1,'p1b1',[320,220,515,305]],
 [104,103,0,'p1b1s0',[330,225,505,285]],
].map(([block_id,parent_block_id,sibling_order,pbs,bbox])=>({
 block_id,parent_block_id,sibling_order,pbs,bbox,
 global_page:0,block_group:'para_blocks',block_type:'text',
 source_block_key:'mineru-original:'+block_id,block_path:'original-'+block_id,
 block_json:JSON.stringify({type:'text',original_id:block_id}),
 block_bbox_json:JSON.stringify(bbox),source_name:'fixture.json',
 span_count:0,line_count:0,span_types:'',content_preview:'original:'+block_id,
}));
const origin=JSON.stringify(base);
const initial=base.map(r=>[r.block_id,r.parent_block_id,r.sibling_order,r.pbs]);
const snapshot=rows=>rows.map(r=>[r.block_id,r.parent_block_id,r.sibling_order,r.pbs])
  .sort((a,b)=>a[0]-b[0]);
const applySnapshot=(rows,after)=>{
 const byId=new Map(after.map(([id,parent,order,pbs])=>[id,{parent,order,pbs}]));
 for(const row of rows){
  const next=byId.get(row.block_id);
  row.parent_block_id=next.parent;row.sibling_order=next.order;row.pbs=next.pbs;
 }
};
try{
 let listening=false;
 for(let i=0;i<100;i++){try{if((await fetch(url)).ok){listening=true;break;}}catch{}
  await sleep(220);}
 assert(listening,'Vite did not start '+serverLog.slice(-500));
 for(const [name,browserType] of [['Chromium',chromium],['iPad-WebKit',webkit]]){
  const browser=await browserType.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:{width:1150,height:850},hasTouch:true});
   page.setDefaultTimeout(20000);
   let revision=0,sqlRows=base.map(row=>({...row})),batches=0,flattened=0,applies=0;
   let cursor=0;
   let history=[];
   let releaseFirstMigration;
   const firstMigrationGate=new Promise(resolve=>{releaseFirstMigration=resolve;});
   const errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.addInitScript(({book})=>{
    localStorage.setItem('ocr2md.lab-ocr.settings.json.v1',JSON.stringify({settings:{
     'workspace.dataDirectory':{key:'dataDirectory',category1:'工作区',category2:'目录',
      comment:'Isolated two-level regression',value:book,range:{kind:'server-directory'}},
    }}));
   },{book});
   await page.route('**/labs/lab-ocr/api/ocr/**',async route=>{
    const request=route.request(),u=new URL(request.url()),op=u.pathname.split('/').at(-1);
    const body=request.method()==='POST'?JSON.parse(request.postData()||'{}'):null;
    const reply=data=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
    if(op==='pdf')return route.fulfill({status:200,contentType:'application/pdf',body:makeLabOcrPdf(2)});
    if(op==='inspect')return reply({status:'unchanged',blocks:5,pages:2,
      pdf:'fixture.pdf',sources:[{name:'fixture.json',pages:2}]});
    if(op==='minerujson2block')return reply({status:'unchanged',blocks:5});
    if(op==='minerujson2span')return reply({status:'unchanged',spans:0});
    if(op==='rows'){
      const table=u.searchParams.get('table');
      return reply(table==='block'?{table,total:5,rows:sqlRows.map(r=>({...r}))}:
        {table,total:0,rows:[]});
    }
    if(op==='block-edit-state')return reply({revision,cursor,
      canUndo:cursor>0&&history[cursor-1]?.operation?.action!=='flatten',
      canRedo:cursor<history.length,
      history:history.map((r,i)=>({...r,seq:i+1}))});
    if(op==='overlays'){
      const p=Number(u.searchParams.get('page')),level=u.searchParams.get('level');
      return reply({page:p,level,pageSize:[595,842],boxes:level==='block'&&p===1?
        sqlRows.map(r=>({id:String(r.block_id),blockId:String(r.block_id),
          parentBlockId:r.parent_block_id==null?null:String(r.parent_block_id),
          pbs:r.pbs,blockGroup:'para_blocks',blockType:r.block_type,bbox:r.bbox})):[]});
    }
    if(op==='block-edit-batch'){
      assert.equal(body.expectedRevision,revision);
      // Freeze SQL while CM has already loaded/canonicalized the page.
      // This eliminates timer races: the test explicitly proves CM-first.
      if(revision===0&&body.operations.some(c=>c.action==='flatten'))
        await firstMigrationGate;
      batches++;
      for(const command of body.operations){
        const before=snapshot(sqlRows);
        if(command.action==='flatten'){
          assert.equal(command.page,1);
          const planned=planFlattenPageInMemory(sqlRows,1);
          assert(planned.changed);
          applySnapshot(sqlRows,planned.after);
          history=history.slice(0,cursor);
          history.push({page:1,before,after:snapshot(sqlRows),
            operation:{action:'flatten',page:1}});
          cursor=history.length;flattened++;
        }else if(command.action==='apply'){
          const planned=planBlockMoveInMemory(sqlRows,command.sourceBlockId,
            command.targetBlockId,command.placement);
          assert(planned.changed);
          applySnapshot(sqlRows,planned.after);
          history=history.slice(0,cursor);
          history.push({page:1,before,after:snapshot(sqlRows),
            operation:{sourceBlockId:command.sourceBlockId,
              targetBlockId:command.targetBlockId,placement:command.placement}});
          cursor=history.length;applies++;
        }else if(command.action==='undo'){
          assert(cursor>0);
          assert(history[cursor-1].operation.action!=='flatten');
          applySnapshot(sqlRows,history[cursor-1].before);cursor--;
        }else throw Error('Unexpected command '+command.action);
        revision++;
      }
      return reply({revision,appliedCount:body.operations.length,
        canUndo:cursor>0&&history[cursor-1]?.operation?.action!=='flatten',
        canRedo:cursor<history.length});
    }
    throw Error('Unexpected route '+op);
   });
   await page.goto(url,{waitUntil:'domcontentloaded'});
   const tag=id=>page.locator(`.lab-ocr-pdf-pbs-tag[data-block-id="${id}"]`);
   await page.waitForFunction(()=>document.querySelector('select.ocr-source-file-select')?.value==='sql:block'&&
     document.querySelector('.lab-ocr-pdf-pbs-tag[data-block-id="102"]')?.textContent==='p1b0s1');
   assert.equal(await tag(101).innerText(),'p1b0s0');
   assert.equal(await tag(102).innerText(),'p1b0s1');
   assert.equal(await tag(102).getAttribute('data-child'),'true');
   assert.equal(await page.locator('.lab-ocr-pdf-pbs-tag').count(),5);
   assert.equal(await page.locator('#undo').isEnabled(),false,'System flatten is not ordinary Undo');
   assert.equal(flattened,0,'CM correction is visible before SQL persistence');
   assert.equal(sqlRows[2].pbs,'p1b0s0s0');
   const cmState=await page.evaluate(()=>document.querySelector('.ocr-cm-source')?.ocrCmTable?.runtime());
   assert.equal(cmState.rows.find(r=>r.block_id===102).parent_block_id,100);
   assert.equal(cmState.rows.find(r=>r.block_id===102).source_block_key,'mineru-original:102');
   releaseFirstMigration();
   await page.locator('#global-save').click();
   await page.waitForFunction(()=>{
     const state=document.querySelector('.ocr-cm-source')?.ocrCmTable?.runtime();
     return state?.revision===1&&state.queue.length===0;
   });
   assert.equal(flattened,1,'Only one protective canonicalization write');
   assert.equal(sqlRows[2].pbs,'p1b0s1');
   assert.equal(sqlRows[2].parent_block_id,100);
   assert.equal(history[0].before.find(r=>r[0]===102)[3],'p1b0s0s0');
   assert.equal(await page.locator('#undo').isEnabled(),false);
   assert.equal(JSON.stringify(base),origin,'Original untouched fixture preserved');
   assert.equal(await tag(102).innerText(),'p1b0s1');
   // A root with existing children moves into another root; every original
   // child remains a FIRST-LEVEL sibling under the new root.
   const source=tag(100),target=page.locator(
     '.lab-ocr-pdf-overlay-layer[data-page="1"] .lab-ocr-pdf-overlay-box[data-block-ids~="103"]');
   const src=await source.boundingBox(),dest=await target.boundingBox();
   const pointer={pointerId:47,pointerType:'touch',isPrimary:true,button:0,bubbles:true};
   const start={x:src.x+src.width/2,y:src.y+src.height/2};
   const end={x:dest.x+dest.width*.4,y:dest.y+dest.height*.5};
   await source.dispatchEvent('pointerdown',{...pointer,clientX:start.x,clientY:start.y});
   await page.locator('.lab-ocr-pdf-drag-source').waitFor({state:'attached',timeout:1700});
   await page.locator('body').dispatchEvent('pointermove',{...pointer,clientX:end.x,clientY:end.y});
   await page.locator('.lab-ocr-pdf-drop-guide').waitFor({state:'visible'});
   assert.equal(await page.locator('.lab-ocr-pdf-drop-guide').getAttribute('data-placement'),'child');
   await page.locator('body').dispatchEvent('pointerup',{...pointer,clientX:end.x,clientY:end.y});
   await page.waitForFunction(()=>document.querySelector('.lab-ocr-pdf-pbs-tag[data-block-id="102"]')?.textContent==='p1b0s3');
   const rowsAfter=await page.evaluate(()=>document.querySelector('.ocr-cm-source')?.ocrCmTable?.runtime()?.rows);
   const byId=new Map(rowsAfter.map(r=>[r.block_id,r]));
   for(const id of [100,101,102])assert.equal(byId.get(id).parent_block_id,103);
   assert.equal(byId.get(102).pbs,'p1b0s3');
   assert.equal(await page.locator('#undo').isEnabled(),true);
   await page.locator('#global-save').click();
   await page.waitForFunction(()=>{
     const state=document.querySelector('.ocr-cm-source')?.ocrCmTable?.runtime();
     return state?.revision===2&&state.queue.length===0;
   });
   assert.equal(applies,1);
   assert.equal(sqlRows.find(r=>r.block_id===102).parent_block_id,103);
   assert.equal(sqlRows.find(r=>r.block_id===102).pbs,'p1b0s3');
   assert(sqlRows.every(r=>r.pbs.split('s').length<=2));
   await page.reload({waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>document.querySelector('.lab-ocr-pdf-pbs-tag[data-block-id="102"]')?.textContent==='p1b0s3');
   assert.equal(flattened,1,'Reload must not re-run migration');
   assert.equal(await page.locator('#undo').isEnabled(),true);
   assert.deepEqual(errors,[]);
   console.log('LAB_OCR_TWO_LEVEL_E2E_PASS',name,JSON.stringify({
     revision,batches,flattened,applies,pbs102:await tag(102).innerText()}));
  }finally{await browser.close();}
 }
}finally{vite.kill('SIGTERM');}
