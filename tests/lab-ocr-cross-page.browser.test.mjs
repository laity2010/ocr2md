/** WCP47 real PDF.js+AG+CM6 cross-page dragging in Chromium & iPad WebKit. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {chromium,webkit} from 'playwright';
import {makeLabOcrPdf} from './helpers/lab-ocr-pdf-fixture.mjs';

const port=5365,book='/isolated/cross-page';
const url=`http://127.0.0.1:${port}/labs/lab-ocr/`;
const vite=spawn('node',['node_modules/vite/bin/vite.js','--config',
 'labs/lab-ocr/vite.config.mjs','--host','127.0.0.1','--port',String(port),
 '--strictPort'],{stdio:['ignore','pipe','pipe']});
let output='';vite.stdout.on('data',chunk=>output+=chunk);vite.stderr.on('data',chunk=>output+=chunk);
const originals=[
 [10,0,null,0,'p1b0',[70,60,200,120]],
 [11,0,null,1,'p1b1',[350,180,500,260]],
 [12,0,11,0,'p1b1s0',[360,200,450,235]],
 [20,1,null,0,'p2b0',[70,60,200,120]],
 [21,1,null,1,'p2b1',[350,180,510,260]],
].map(([block_id,global_page,parent_block_id,sibling_order,pbs,bbox])=>({
 block_id,global_page,parent_block_id,sibling_order,pbs,bbox,
 source_name:'isolated.json',source_block_key:'immutable:'+block_id,
 block_group:'para_blocks',block_path:'original:'+block_id,
 block_bbox_json:JSON.stringify(bbox),block_type:'text',line_count:1,span_count:1,
 span_types:'text',content_preview:'Block '+block_id,
 block_json:JSON.stringify({type:'text',lines:[{spans:[{type:'text',content:'Block '+block_id}]}]}),
}));
const snapshot=rows=>rows.map(row=>[row.block_id,row.parent_block_id,row.sibling_order,row.pbs]);
function applySnapshot(rows,snap){
 const map=new Map(snap.map(([id,parent,order,pbs])=>[id,{parent,order,pbs}]));
 for(const row of rows){
  const info=map.get(row.block_id);if(!info)continue;
  row.parent_block_id=info.parent;row.sibling_order=info.order;row.pbs=info.pbs;
 }
}
const prior=snapshot(originals);
const after=[
 [10,null,0,'p1b0'],[11,null,1,'p1b1'],[12,11,0,'p1b1s0'],
 [20,11,1,'p1b1s1'],[21,null,0,'p2b0'],
];
try{
 let ready=false;
 for(let i=0;i<100;i++){try{if((await fetch(url)).ok){ready=true;break;}}catch{}
  await sleep(200);}
 assert(ready,'Vite not available '+output.slice(-500));
 for(const [name,engine] of [['Chromium',chromium],['iPad-WebKit',webkit]]
   .filter(([n])=>!process.env.LAB_OCR_TEST_BROWSER||n===process.env.LAB_OCR_TEST_BROWSER)){
  const browser=await engine.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:{width:1200,height:950},hasTouch:true});
   page.setDefaultTimeout(21000);
   const rows=originals.map(r=>({...r}));
   const errors=[];page.on('pageerror',err=>errors.push(err.message));
   let revision=0,cursor=0,applies=0,undos=0,redos=0,overlayReads=0;
   const history={seq:1,page:2,pages:[1,2],
     before:prior.filter(x=>[20,21].includes(x[0])),
     after:after.filter(x=>[20,21].includes(x[0])),
     operation:{sourceBlockId:20,targetBlockId:11,placement:'child',scope:'delta',pages:[1,2]}};
   await page.addInitScript(({book})=>{
    localStorage.setItem('ocr2md.lab-ocr.settings.json.v1',JSON.stringify({settings:{
     'workspace.dataDirectory':{key:'dataDirectory',category1:'工作区',category2:'目录',
       comment:'Fixture',value:book,range:{kind:'server-directory'}},
    }}));
   },{book});
   await page.route('**/labs/lab-ocr/api/ocr/**',async route=>{
    const u=new URL(route.request().url()),op=u.pathname.split('/').at(-1);
    const body=route.request().method()==='POST'?JSON.parse(route.request().postData()||'{}'):null;
    const reply=obj=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(obj)});
    if(op==='pdf')return route.fulfill({status:200,contentType:'application/pdf',body:makeLabOcrPdf(2)});
    if(op==='inspect')return reply({status:'unchanged',blocks:5,pages:2,pdf:'fixture.pdf',sources:[{name:'isolated.json',pages:2}]});
    if(op==='minerujson2block')return reply({status:'ready',kind:'view',blocks:5});
    if(op==='block-edit-state')return reply({revision,cursor,
      canUndo:cursor===1,canRedo:cursor===0&&revision>0,history:revision?[history]:[]});
    if(op==='rows'){
      const t=u.searchParams.get('table');return reply(t==='block'?
        {table:'block',total:5,rows}: {table:t,total:0,rows:[]});
    }
    if(op==='overlays'){
      overlayReads++;
      const p=Number(u.searchParams.get('page')),level=u.searchParams.get('level');
      return reply({level,page:p,pageSize:[595,842],
        boxes:rows.filter(r=>r.global_page===p-1).map(r=>({
          id:'b'+r.block_id,blockId:String(r.block_id),pbs:r.pbs,
          parentBlockId:r.parent_block_id==null?null:String(r.parent_block_id),
          blockGroup:'para_blocks',blockType:'text',bbox:r.bbox,
        }))});
    }
    if(op==='block-edit-batch'){
      assert.equal(body.expectedRevision,revision);
      for(const cmd of body.operations){
        if(cmd.action==='apply'){
          assert.deepEqual([cmd.sourceBlockId,cmd.targetBlockId,cmd.placement],[20,11,'child']);
          applies++;cursor=1;applySnapshot(rows,after);
        }else if(cmd.action==='undo'){undos++;cursor=0;applySnapshot(rows,prior);}
        else if(cmd.action==='redo'){redos++;cursor=1;applySnapshot(rows,after);}
        else throw Error('unexpected cmd '+cmd.action);
        revision++;
      }
      return reply({revision,appliedCount:body.operations.length,canUndo:cursor===1,canRedo:cursor===0&&revision>0});
    }
    throw Error('Unexpected API '+op);
   });
   await page.goto(url,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>document.querySelectorAll('.lab-ocr-pdf-pbs-tag').length>=5);
   const source=page.locator('.lab-ocr-pdf-pbs-layer[data-page="2"] .lab-ocr-pdf-pbs-tag[data-block-id="20"]');
   const target=page.locator('.lab-ocr-pdf-overlay-layer[data-page="1"] .lab-ocr-pdf-overlay-box[data-id="b11"]');
   await page.locator('.lab-ocr-pdf-scale').selectOption('25');
   await page.waitForFunction(()=>!!document.querySelector('.lab-ocr-pdf-overlay-layer[data-page="1"]')&&
     !!document.querySelector('.lab-ocr-pdf-pbs-layer[data-page="2"]'));
   await sleep(180);
   const beforeViewport=await page.locator('.lab-ocr-pdf-scroller').evaluate(e=>({
     top:e.scrollTop,left:e.scrollLeft}));
   let src=await source.boundingBox(),dst=await target.boundingBox();
   assert(src&&dst,JSON.stringify({src,dst}));
   await page.mouse.move(src.x+src.width/2,src.y+src.height/2);
   await page.mouse.down();await sleep(465);
   // Parent & child bbox overlap: choose the parent-only bottom-right
   // quadrant rather than the child coverage nested in its center.
   await page.mouse.move(dst.x+dst.width*.88,dst.y+dst.height*.84,{steps:14});
   await sleep(110);
   const guide=page.locator('.lab-ocr-pdf-drop-guide');
   await guide.waitFor({state:'visible'});
   assert.deepEqual(await guide.locator('[data-placement]').evaluateAll(nodes=>
     nodes.map(node=>node.dataset.placement)),['child']);
   await page.mouse.up();
   await page.waitForFunction(()=>document.querySelector(
     '.lab-ocr-pdf-pbs-layer[data-page="2"] .lab-ocr-pdf-pbs-tag[data-block-id="20"]')?.textContent==='p1b1s1');
   assert.equal(await page.locator('.lab-ocr-pdf-pbs-layer[data-page="2"] .lab-ocr-pdf-pbs-tag[data-block-id="20"]').getAttribute('data-child'),'true');
   assert.equal(await page.locator('.lab-ocr-pdf-pbs-layer[data-page="2"] .lab-ocr-pdf-pbs-tag[data-block-id="21"]').textContent(),'p2b0');
   const afterViewport=await page.locator('.lab-ocr-pdf-scroller').evaluate(e=>({
     top:e.scrollTop,left:e.scrollLeft}));
   assert(Math.abs(afterViewport.top-beforeViewport.top)<2&&Math.abs(afterViewport.left-beforeViewport.left)<2,
     'Cross-page drop must not navigate the PDF: '+JSON.stringify({beforeViewport,afterViewport}));
   await page.waitForFunction(()=>/SQLite 已异步保存/.test(document.querySelector('#status')?.textContent||''),
     null,{timeout:12000});
   assert.equal(applies,1);
   await page.locator('.lab-ocr-pdf-pbs-layer[data-page="1"] .lab-ocr-pdf-pbs-tag[data-block-id="11"]').click();
   await page.waitForFunction(()=>document.querySelector(
     '.lab-ocr-pdf-pbs-layer[data-page="2"] .lab-ocr-pdf-pbs-tag[data-block-id="20"]')?.dataset.familySelected==='true');
   assert.equal(await page.locator('.lab-ocr-pdf-overlay-layer[data-page="2"] .lab-ocr-pdf-overlay-box[data-id="b20"]')
     .getAttribute('data-family-selected'),'true','Selecting a parent highlights its child across the PDF page boundary');
   await page.locator('#undo').click();
   await page.waitForFunction(()=>document.querySelector('.lab-ocr-pdf-pbs-layer[data-page="2"] .lab-ocr-pdf-pbs-tag[data-block-id="20"]')?.textContent==='p2b0');
   await page.locator('#redo').click();
   await page.waitForFunction(()=>document.querySelector('.lab-ocr-pdf-pbs-layer[data-page="2"] .lab-ocr-pdf-pbs-tag[data-block-id="20"]')?.textContent==='p1b1s1');
   for(let i=0;i<80&&(undos!==1||redos!==1);i++)await sleep(100);
   assert.equal(undos,1);assert.equal(redos,1);
   // The physical geometry still belongs to page two.
   assert.equal(await page.locator('.lab-ocr-pdf-overlay-layer[data-page="1"] .lab-ocr-pdf-overlay-box[data-id="b20"]').count(),0);
   assert.equal(await page.locator('.lab-ocr-pdf-overlay-layer[data-page="2"] .lab-ocr-pdf-overlay-box[data-id="b20"]').count(),1);
   assert.deepEqual(errors,[]);
   console.log('LAB_OCR_CROSS_PAGE_BROWSER_PASS',name,
      JSON.stringify({applies,undos,redos,revision,overlayReads}));
  }finally{await browser.close();}
 }
}finally{vite.kill('SIGTERM')}
