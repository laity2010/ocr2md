/** Regression: long PBS drag across a PDF.js page change (p14b1 -> p13b5).
 * The previous small-zoom tests had both PDF pages visible without scrolling.
 * Here scrolling while the pointer is held must NOT erase the drag source.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {chromium,webkit} from 'playwright';
import {makeLabOcrPdf} from './helpers/lab-ocr-pdf-fixture.mjs';

const port=5371,book='/isolated/cross-page-autoscroll';
const url=`http://127.0.0.1:${port}/labs/lab-ocr/`;
const vite=spawn('node',['node_modules/vite/bin/vite.js','--config',
 'labs/lab-ocr/vite.config.mjs','--host','127.0.0.1','--port',String(port),
 '--strictPort'],{stdio:['ignore','pipe','pipe']});
let output='';vite.stdout.on('data',chunk=>output+=chunk);vite.stderr.on('data',chunk=>output+=chunk);
const records=[
 ...Array.from({length:6},(_,i)=>[1300+i,12,null,i,`p13b${i}`,i===5?[320,640,510,740]:[60,60+i*80,170,125+i*80]]),
 [1400,13,null,0,'p14b0',[360,200,510,280]],
 [1401,13,null,1,'p14b1',[70,65,220,145]],
].map(([block_id,global_page,parent_block_id,sibling_order,pbs,bbox])=>({
 block_id,global_page,parent_block_id,sibling_order,pbs,bbox,
 block_group:'para_blocks',block_type:'text',source_name:'fixture.json',
 source_block_key:'original:'+block_id,block_path:'original:'+block_id,
 block_bbox_json:JSON.stringify(bbox),block_json:JSON.stringify({type:'text'}),
 span_count:1,line_count:1,span_types:'text',content_preview:'test '+pbs,
 absorbed_into_block_id:null,
}));
try{
 let ready=false;
 for(let i=0;i<100;i++){try{if((await fetch(url)).ok){ready=true;break;}}catch{}
  await sleep(200);}
 assert(ready,'Vite unavailable: '+output.slice(-400));
 for(const [name,engine] of [['Chromium',chromium],['iPad-WebKit',webkit]]
   .filter(([n])=>!process.env.LAB_OCR_TEST_BROWSER||n===process.env.LAB_OCR_TEST_BROWSER)){
  const browser=await engine.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:{width:1800,height:850},hasTouch:true});
   page.setDefaultTimeout(15000);
   let revision=0,applies=0;
   const errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.addInitScript(({book})=>{
    localStorage.setItem('ocr2md.lab-ocr.settings.json.v1',JSON.stringify({settings:{
     'workspace.dataDirectory':{key:'dataDirectory',category1:'工作区',category2:'目录',
      value:book,range:{kind:'server-directory'}},
    }}));
   },{book});
   await page.route('**/labs/lab-ocr/api/ocr/**',async route=>{
    const u=new URL(route.request().url()),op=u.pathname.split('/').at(-1);
    const body=route.request().method()==='POST'?JSON.parse(route.request().postData()||'{}'):null;
    const reply=obj=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(obj)});
    if(op==='pdf')return route.fulfill({status:200,contentType:'application/pdf',body:makeLabOcrPdf(14)});
    if(op==='inspect')return reply({status:'unchanged',blocks:records.length,pages:14,
      pdf:'fixture.pdf',sources:[{name:'fixture.json',pages:14}]});
    if(op==='minerujson2block')return reply({status:'ready',kind:'view',blocks:records.length});
    if(op==='block-edit-state')return reply({revision,cursor:0,canUndo:false,canRedo:false,history:[]});
    if(op==='rows'){
      const table=u.searchParams.get('table');
      return reply(table==='block'?{table,total:records.length,rows:records}:
        {table,total:0,rows:[]});
    }
    if(op==='overlays'){
      const p=Number(u.searchParams.get('page')),level=u.searchParams.get('level');
      return reply({level,page:p,pageSize:[595,842],
        boxes:records.filter(r=>r.global_page===p-1).map(r=>({
          id:'b'+r.block_id,blockId:String(r.block_id),pbs:r.pbs,
          parentBlockId:r.parent_block_id==null?null:String(r.parent_block_id),
          absorbedIntoBlockId:null,blockGroup:'para_blocks',blockType:'text',bbox:r.bbox,
        }))});
    }
    if(op==='block-edit-batch'){
      for(const cmd of body.operations){
        assert.deepEqual([cmd.sourceBlockId,cmd.targetBlockId,cmd.placement],
          [1401,1305,'child']);
        applies++;revision++;
      }
      return reply({revision,appliedCount:body.operations.length,canUndo:true,canRedo:false});
    }
    throw Error('Unexpected '+op);
   });
   await page.goto(url,{waitUntil:'domcontentloaded'});
   const pdf=page.locator('.lab-ocr-pdf-scroller');
   await page.locator('.lab-ocr-pdf-scale').selectOption('100');
   await page.locator('.lab-ocr-pdf-page').fill('14');
   await page.locator('.lab-ocr-pdf-page').press('Enter');
   const source=page.locator('.lab-ocr-pdf-pbs-layer[data-page="14"] .lab-ocr-pdf-pbs-tag[data-block-id="1401"]');
   const target=page.locator('.lab-ocr-pdf-overlay-layer[data-page="13"] .lab-ocr-pdf-overlay-box[data-id="b1305"]');
   // WebKit can replace the page's overlay once more after selecting page 14.
   // Wait for a *visible* source rect, not merely a transient attached node.
   let sourceBox=null;
   for(let i=0;i<100;i++){
     sourceBox=await source.boundingBox();
     if(sourceBox&&sourceBox.width>0&&sourceBox.height>0)break;
     await sleep(80);
   }
   assert(sourceBox,'p14b1 source label never appeared on PDF: '+
     JSON.stringify({name,page:await page.locator('.lab-ocr-pdf-page').inputValue(),
       tags:await page.locator('.lab-ocr-pdf-pbs-tag').allInnerTexts()}));
   const initialClip=await pdf.boundingBox();
   assert(sourceBox.y>=initialClip.y&&
     sourceBox.y+sourceBox.height<=initialClip.y+initialClip.height,
     'p14b1 source tag must initially be visible');
   assert(sourceBox.x>=initialClip.x&&
     sourceBox.x+sourceBox.width<=initialClip.x+initialClip.width,
     'p14b1 source label must remain inside the PDF clipping region');
   await page.mouse.move(sourceBox.x+sourceBox.width/2,sourceBox.y+sourceBox.height/2);
   await page.mouse.down();await sleep(465);
   await page.waitForFunction(()=>!!document.querySelector('.lab-ocr-pdf-drag-arrow'));
   // Hold pointer at the top gutter until PDF.js crosses from page 14 into
   // page 13. This calls pagechanging/showOverlayPages while dragging.
   const area=await pdf.boundingBox();
   await page.mouse.move(area.x+area.width*.48,area.y+8,{steps:12});
   let crossed=false;
   for(let i=0;i<140;i++){
     const current=Number(await page.locator('.lab-ocr-pdf-page').inputValue());
     if(current===13){crossed=true;break;}
     await sleep(45);
   }
   assert(crossed,'Autoscroll did not cross page 14 -> 13');
   assert(await page.locator('.lab-ocr-pdf-drag-arrow').count(),
     'PDF.js pagechanging incorrectly canceled an active drag');
   await target.waitFor({state:'attached'});
   // pagechanging fires as soon as PDF.js selects page 13; its bottommost
   // block may not have entered the scroller's visible clipping region yet.
   let targetBox=null,within=false;
   for(let i=0;i<160;i++){
     targetBox=await target.boundingBox();
     const scrollerBox=await pdf.boundingBox();
     const x=targetBox?.x+targetBox?.width*.5,y=targetBox?.y+targetBox?.height*.5;
     within=!!targetBox&&x>=scrollerBox.x&&x<=scrollerBox.x+scrollerBox.width&&
       y>=scrollerBox.y+18&&y<=scrollerBox.y+scrollerBox.height-18;
     if(within)break;
     await sleep(45);
   }
   assert(targetBox);
   assert(within,'Target bbox did not become visible while holding at top edge: '+
     JSON.stringify({targetBox,scroller:await pdf.boundingBox(),
       page:await page.locator('.lab-ocr-pdf-page').inputValue()}));
   // Autoscroll continues until the pointer leaves the edge. Recheck the
   // moving target rect after placing the pointer rather than using a stale
   // rectangle captured while PDF.js was still scrolling.
   let guided=false;
   for(let i=0;i<7;i++){
     const box=await target.boundingBox();
     await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);
     await sleep(90);
     if(await page.locator('.lab-ocr-pdf-drop-guide').count()){guided=true;break;}
   }
   assert(guided,'No cross-page drop guide: '+JSON.stringify({
     name,status:await page.locator('#status').innerText(),
     arrow:await page.locator('.lab-ocr-pdf-drag-arrow').count(),
     page:await page.locator('.lab-ocr-pdf-page').inputValue(),
     target:await target.boundingBox(),scroller:await pdf.boundingBox()}));
   await page.mouse.up();
   await page.waitForFunction(()=>document.querySelector(
     '.lab-ocr-pdf-pbs-layer[data-page="14"] .lab-ocr-pdf-pbs-tag[data-block-id="1401"]')?.textContent==='p13b5s0');
   for(let i=0;i<100&&!applies;i++)await sleep(50);
   assert.equal(applies,1);
   assert.deepEqual(errors,[]);
   console.log('LAB_OCR_CROSS_PAGE_AUTOSCROLL_PASS',name);
  }finally{await browser.close();}
 }
}finally{vite.kill('SIGTERM');}
