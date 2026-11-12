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
   let pdfReads=0,rowsReads=0,overlayReads=0,plans=0,applies=0,undos=0,redos=0,revision=0,cursor=0;
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
      return reply({table:'block',total:5,rows:makeRows(records)});
    }
    if(op==='block-edit-state')return reply({revision,canUndo:cursor===1,canRedo:cursor===0&&revision>0});
    if(op==='block-edit'){
      assert.equal(body.workspace,book,'Authorization remains scoped to the current book');
      if(body.action==='plan'){plans++;
        assert.deepEqual([body.sourceBlockId,body.targetBlockId,body.placement],[100,101,'child']);
        return reply({revision,changed:true,sourceBlockId:100,targetBlockId:101,placement:'child',page:1});
      }
      assert.equal(body.expectedRevision,revision,'Every mutation must use the latest CAS revision');
      if(body.action==='apply'){
        applies++;revision++;cursor=1;setSnapshot(records,changed);
      }else if(body.action==='undo'){
        undos++;revision++;cursor=0;setSnapshot(records,before);
      }else if(body.action==='redo'){
        redos++;revision++;cursor=1;setSnapshot(records,changed);
      }else throw Error('unexpected block action '+body.action);
      return reply({revision,changed:true,changedRows:makeRows(records).map(row=>({
        block_id:row.block_id,parent_block_id:row.parent_block_id,
        sibling_order:row.sibling_order,pbs:row.pbs
      })),page:1,canUndo:cursor===1,canRedo:cursor===0});
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
   const src=await source.boundingBox(),dst=await target.boundingBox();
   assert(src&&dst,'Visible source and target');
   const pointer={pointerId:65,pointerType:'touch',isPrimary:true,button:0,bubbles:true};
   const start={x:src.x+src.width/2,y:src.y+src.height/2};
   const end={x:dst.x+dst.width*.4,y:dst.y+dst.height*.52};
   // WP1: simple click selects, does not start a transaction.
   await source.click();
   assert.equal(applies,0);
   await source.dispatchEvent('pointerdown',{...pointer,clientX:start.x,clientY:start.y});
   await page.locator('.lab-ocr-pdf-drag-source').waitFor({state:'attached',timeout:2100});
   assert.equal(await page.locator('.lab-ocr-pdf-drag-arrow').count(),1);
   await page.locator('body').dispatchEvent('pointermove',{...pointer,clientX:end.x,clientY:end.y});
   await page.locator('.lab-ocr-pdf-drop-guide').waitFor({state:'attached',timeout:3000});
   assert.equal(await page.locator('.lab-ocr-pdf-drop-guide').getAttribute('data-block-id'),'101');
   assert.equal(await page.locator('.lab-ocr-pdf-drop-guide').getAttribute('data-placement'),'child');
   assert.equal(await target.evaluate(el=>el.classList.contains('lab-ocr-pdf-drop-target')),true);
   await page.locator('body').dispatchEvent('pointerup',{...pointer,clientX:end.x,clientY:end.y});
   await page.waitForFunction(()=>document.querySelector('.lab-ocr-pdf-pbs-tag[data-block-id="100"]')?.textContent==='p1b0s1',
      null,{timeout:14000}).catch(async error=>{
     console.error('BLOCK_GESTURE_DIAG',name,JSON.stringify({
       plans,applies,undos,redos,revision,rowsReads,overlayReads,
       status:await page.locator('#status').innerText(),
       badges:await page.locator('.lab-ocr-pdf-pbs-tag').evaluateAll(nodes=>
         nodes.map(node=>({pbs:node.textContent,id:node.dataset.blockId,selected:node.dataset.selected}))),
       errors,
     }));
     throw error;
   });
   assert.deepEqual([plans,applies],[1,1]);
   assert.equal(await tag(100).getAttribute('data-child'),'true');
   assert.equal(await tag(100).getAttribute('data-family-selected'),'false');
   assert.equal(await tag(101).innerText(),'p1b0');
   assert.equal(await tag(102).innerText(),'p1b0s0');
   assert.equal(await page.locator('.lab-ocr-pdf-drag-arrow').count(),0);
   assert.equal(await page.locator('#undo').isEnabled(),true);
   assert.equal(rowsReads,1,'AG/CM6 must patch rows, not reload all SQL');
   assert.equal(pdfReads,1,'PDF bytes must remain loaded throughout drag');
   assert.equal(await page.locator('#workspace .ag-row-selected .ag-cell[col-id="block_id"]').innerText(),'100');
   await page.locator('#undo').click();
   await page.waitForFunction(()=>document.querySelector('.lab-ocr-pdf-pbs-tag[data-block-id="100"]')?.textContent==='p1b0');
   assert.equal(undos,1);
   assert.equal(await page.locator('#redo').isEnabled(),true);
   await page.locator('#redo').click();
   await page.waitForFunction(()=>document.querySelector('.lab-ocr-pdf-pbs-tag[data-block-id="100"]')?.textContent==='p1b0s1');
   assert.equal(redos,1);
   assert.equal(rowsReads,1);
   assert.equal(pdfReads,1);
   assert.deepEqual(errors,[]);
   console.log('LAB_OCR_BLOCK_GESTURE_E2E_PASS',name,JSON.stringify({plans,applies,undos,redos,
     pdfReads,rowsReads,overlayReads,revision,pbs100:await tag(100).innerText()}));
  }finally{await browser.close();}
 }
}finally{vite?.kill('SIGTERM');}
