/** Lab OCR para-only review: mixed legacy OCR groups cannot reenter AG/PDF.
 * Uses actual AG Grid, PDF.js and Frame on Chromium and iPad WebKit.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {chromium,webkit} from 'playwright';
import {makeLabOcrPdf} from './helpers/lab-ocr-pdf-fixture.mjs';

const port=5331,book='/demo/filter-book';
const url=process.env.LAB_OCR_TEST_URL||`http://127.0.0.1:${port}/labs/lab-ocr/`;
const vite=process.env.LAB_OCR_TEST_URL?null:spawn('node',[
 'node_modules/vite/bin/vite.js','--config','labs/lab-ocr/vite.config.mjs',
 '--host','127.0.0.1','--port',String(port),'--strictPort'],{stdio:['ignore','pipe','pipe']});
let output='';vite?.stdout.on('data',chunk=>output+=chunk);vite?.stderr.on('data',chunk=>output+=chunk);
const blocks=[
 {id:'b-preproc-copy',group:'preproc_blocks',type:'text',bbox:[73,61,359,154]},
 {id:'b-para-text',group:'para_blocks',type:'text',bbox:[72,60,360,155]},
 {id:'b-para-table',group:'para_blocks',type:'table',bbox:[30,180,400,260]},
 {id:'b-preproc-table',group:'preproc_blocks',type:'table',bbox:[30,180,400,260]},
 {id:'b-discard',group:'discarded_blocks',type:'page_number',bbox:[40,310,420,380]},
 {id:'b-para-inner',group:'para_blocks',type:'title',bbox:[80,70,130,90]},
 {id:'b-preproc-only',group:'preproc_blocks',type:'image',bbox:[450,420,500,470]},
 {id:'b-para-text',group:'para_blocks',type:'text',bbox:[72,60,360,155]},
];
const spans=[
 {id:'s-preproc-copy',group:'preproc_blocks',type:'text',bbox:[73,60,140,90]},
 {id:'s-para-text',group:'para_blocks',type:'text',bbox:[72,60,140,90]},
 {id:'s-para-table',group:'para_blocks',type:'table',bbox:[30,180,140,210]},
 {id:'s-preproc-table',group:'preproc_blocks',type:'table',bbox:[30,180,140,210]},
 {id:'s-discard',group:'discarded_blocks',type:'page_number',bbox:[40,310,140,332]},
 {id:'s-para-inner',group:'para_blocks',type:'title',bbox:[80,70,105,81]},
 {id:'s-preproc-only',group:'preproc_blocks',type:'image',bbox:[450,420,490,450]},
];
try{
 let online=false;
 for(let i=0;i<90;i++){
  try{if((await fetch(url)).ok){online=true;break;}}catch{}
  await sleep(200);
 }
 assert(online,'Vite unavailable '+output.slice(-800));
 for(const [name,engine] of [['Chromium',chromium],['iPad-WebKit',webkit]]){
  const browser=await engine.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:{width:1120,height:820},hasTouch:true,ignoreHTTPSErrors:true});
   page.setDefaultTimeout(16000);
   const errors=[],overlayRequests=[];let pdfRequests=0,rowRequests=0;
   page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(({book})=>{
    localStorage.setItem('ocr2md.lab-ocr.settings.json.v1',JSON.stringify({settings:{
     'workspace.dataDirectory':{key:'dataDirectory',category1:'工作区',category2:'目录',
      comment:'Test',value:book,range:{kind:'server-directory'}},
    }}));
   },{book});
   await page.route('**/labs/lab-ocr/api/ocr/**',route=>{
    const parsed=new URL(route.request().url()),op=parsed.pathname.split('/').at(-1);
    if(op==='pdf'){pdfRequests++;return route.fulfill({status:200,contentType:'application/pdf',body:makeLabOcrPdf(3)});}
    if(op==='overlays'){
     const level=parsed.searchParams.get('level'),number=Number(parsed.searchParams.get('page'));
     overlayRequests.push(level+':'+number);
     // Deliberately return legacy mixed data: the workflow must still
     // keep non-para out of PDF on every mode and page.
     const source=level==='span'?spans:blocks;
     const boxes=number===1?source.map(x=>({id:x.id,blockType:x.type,blockGroup:x.group,bbox:x.bbox})):
       number===3?[{id:'forbidden-'+level,blockType:'title',blockGroup:'discarded_blocks',bbox:[80,60,200,100]}]:[];
     return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
      level,page:number,pageSize:[595,842],boxes,
     })});
    }
    if(op==='block-edit-state')return route.fulfill({status:200,contentType:'application/json',
      body:'{"revision":0,"canUndo":false,"canRedo":false}'});
    if(op==='inspect')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
      status:'unchanged',blocks:7,pages:3,pdf:'sample.pdf',sources:[{name:'source.json',pages:3}]})});
    if(op==='minerujson2block')return route.fulfill({status:200,contentType:'application/json',body:'{"blocks":3}'});
    if(op==='minerujson2span')return route.fulfill({status:200,contentType:'application/json',body:'{"spans":3}'});
    if(op==='rows'){
     rowRequests++;
     assert.equal(parsed.searchParams.get('table'),'block');
     // Simulate an OLD server returning three groups: UI must discard other
     // stages before putting rows into CM6/AG, regardless of hidden columns.
     const entries=blocks.filter((v,i)=>i!==7).map((item,i)=>({
      block_id:i+1,global_page:0,block_group:item.group,pbs:'p1b'+i,
      parent_block_id:null,block_type:item.type,block_bbox_json:JSON.stringify(item.bbox),
      source_block_key:'s0:p0:'+item.group+':b'+i,block_path:String(i),content_preview:item.type,
     }));
     return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
      table:'block',total:entries.length,rows:entries,
     })});
    }
    throw Error('Unexpected API '+op);
   });
   await page.goto(url,{waitUntil:'domcontentloaded'});
   const pageBoxes=(pageNum=1)=>page.locator(`.lab-ocr-pdf-overlay-layer[data-page="${pageNum}"] .lab-ocr-pdf-overlay-box`);
   const ids=async(n=1)=>pageBoxes(n).evaluateAll(nodes=>nodes.map(el=>el.dataset.id));
   const expectIds=async(expected,n=1)=>{
    await page.waitForFunction(([pageNumber,names])=>{
     const nodes=[...document.querySelectorAll(`.lab-ocr-pdf-overlay-layer[data-page="${pageNumber}"] .lab-ocr-pdf-overlay-box`)];
     return JSON.stringify(nodes.map(x=>x.dataset.id))===JSON.stringify(names);
    },[n,expected]);
    assert.deepEqual(await ids(n),expected);
   };
   await page.waitForFunction(()=>document.querySelector('select.ocr-source-file-select')?.value==='sql:block'&&
     document.querySelectorAll('#workspace .ag-row').length===3);
   await expectIds(['b-para-text','b-para-table','b-para-inner']);
   assert.equal(await page.locator('#workspace .ag-header-cell[col-id="block_group"]').count(),0,
     'Only para review rows are offered: no group checkbox can expose other stages');
   assert.equal(await page.locator('#workspace .ag-row').count(),3);
   assert.equal(rowRequests,1);
   const requestsBefore=overlayRequests.length;
   // Filtering the type column changes only the AG row model, never PDF.
   const typeHeader=page.locator('#workspace .ag-header-cell[col-id="block_type"]');
   await typeHeader.locator('.ag-header-cell-filter-button').click();
   const panel=page.locator('.ocr-enum-filter:visible');
   await panel.locator('.ocr-enum-filter-option[data-filter-value="all"] input').uncheck();
   await panel.locator('.ocr-enum-filter-option[data-filter-value="text"] input').check();
   await page.waitForFunction(()=>document.querySelectorAll('#workspace .ag-row').length===1);
   await expectIds(['b-para-text','b-para-table','b-para-inner']);
   await panel.locator('.ocr-enum-filter-option[data-filter-value="all"] input').check();
   await page.waitForFunction(()=>document.querySelectorAll('#workspace .ag-row').length===3);
   assert.equal(overlayRequests.length,requestsBefore);
   assert.equal(rowRequests,1);
   await typeHeader.locator('.ag-header-cell-filter-button').click();
   await page.locator('.lab-ocr-pdf-scale').selectOption('100');
   await expectIds(['b-para-text','b-para-table','b-para-inner']);
   const level=page.locator('.lab-ocr-pdf-overlay-level');
   await level.selectOption('span');
   await expectIds(['s-para-text','s-para-table','s-para-inner']);
   assert.equal(await page.locator('.lab-ocr-pdf-pbs-tag').count(),0);
   // Even on a different page containing only discarded_blocks, no box.
   await page.locator('.lab-ocr-pdf-page').fill('3');
   await page.locator('.lab-ocr-pdf-page').press('Tab');
   await page.waitForFunction(()=>!!document.querySelector('.lab-ocr-pdf-overlay-layer[data-page="3"][data-level="span"]'));
   await expectIds([],3);
   assert(overlayRequests.includes('span:3'));
   assert.equal(pdfRequests,1);
   assert.equal(rowRequests,1);
   assert.deepEqual(errors,[]);
   console.log('LAB_OCR_PARA_ONLY_OVERLAYS_PASS',name,JSON.stringify({
    rowRequests,pdfRequests,overlayRequests,
   }));
  }finally{await browser.close();}
 }
}finally{vite?.kill('SIGTERM');}
