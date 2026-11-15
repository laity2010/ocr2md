/** WCP49 AG Block page-scoped view: PBS p-value filter, default current-page,
 * header 全部 switch, PDF.js page-change link, preserved complete CM source.
 * Isolated API fixture; never touches any user's MinerU/SQLite/PDF.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {chromium,webkit} from 'playwright';
import {makeLabOcrPdf} from './helpers/lab-ocr-pdf-fixture.mjs';

const port=5374,book='/isolated/pbs-page-ag';
const url=`http://127.0.0.1:${port}/labs/lab-ocr/`;
const vite=spawn('node',['node_modules/vite/bin/vite.js','--config',
  'labs/lab-ocr/vite.config.mjs','--host','127.0.0.1','--port',String(port),
  '--strictPort'],{stdio:['ignore','pipe','pipe']});
let output='';
vite.stdout.on('data',chunk=>output+=chunk);
vite.stderr.on('data',chunk=>output+=chunk);
const source=[
 [1,'p1b0',0,null,0,'text'],
 [2,'p1b0s0',0,1,0,'text'],
 [3,'p1b1',0,null,1,'title'],
 [4,'p2b0',1,null,0,'text'],
 [5,'p2b1',1,null,1,'table'],
 [6,'p1b1s0',1,3,0,'text'],
].map(([block_id,pbs,global_page,parent_block_id,sibling_order,block_type])=>({
 block_id,pbs,global_page,parent_block_id,sibling_order,block_type,
 block_group:'para_blocks',source_name:'source.json',
 source_block_key:'immutable:'+block_id,block_path:'original:'+block_id,
 block_bbox_json:'[40,60,180,125]',block_json:JSON.stringify({originalBlockId:block_id}),
 line_count:1,span_count:1,span_types:'text',content_preview:'摘要-'+block_id,
 absorbed_into_block_id:null,
}));
const rowKeys=ids=>ids.sort((a,b)=>a-b);
try{
 let ready=false;
 for(let i=0;i<100;i++){
  try{if((await fetch(url)).ok){ready=true;break;}}catch{}
  await sleep(200);
 }
 assert(ready,'Vite unavailable '+output.slice(-700));
 for(const [name,engine] of [['Chromium',chromium],['iPad-WebKit',webkit]]){
  const browser=await engine.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:{width:1160,height:870},hasTouch:true});
   page.setDefaultTimeout(20000);
   let rowsReads=0,pdfReads=0,overlayReads=0,posted=0;
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(({book})=>{
    localStorage.setItem('ocr2md.lab-ocr.settings.json.v1',JSON.stringify({settings:{
      'workspace.dataDirectory':{key:'dataDirectory',category1:'工作区',category2:'目录',
      comment:'Isolated page-filter fixture',value:book,range:{kind:'server-directory'}},
    }}));
   },{book});
   await page.route('**/labs/lab-ocr/api/ocr/**',async route=>{
    const u=new URL(route.request().url()),op=u.pathname.split('/').at(-1);
    const reply=obj=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(obj)});
    if(op==='pdf'){pdfReads++;return route.fulfill({
      status:200,contentType:'application/pdf',body:makeLabOcrPdf(2)});}
    if(op==='inspect')return reply({status:'unchanged',blocks:6,pages:2,
      pdf:'fixture.pdf',sources:[{name:'source.json',pages:2}]});
    if(op==='minerujson2block')return reply({status:'ready',kind:'view',blocks:6});
    if(op==='rows'){
      rowsReads++;
      const t=u.searchParams.get('table');
      return reply(t==='block'?{table:'block',total:6,rows:source}:
        {table:t,total:0,rows:[]});
    }
    if(op==='block-edit-state')return reply({revision:0,canUndo:false,
      canRedo:false,cursor:0,history:[]});
    if(op==='overlays'){
      overlayReads++;
      return reply({page:Number(u.searchParams.get('page')),
        level:u.searchParams.get('level'),pageSize:[595,842],
        boxes:source.filter(r=>r.global_page===Number(u.searchParams.get('page'))-1)
        .map(r=>({id:'b'+r.block_id,blockId:String(r.block_id),pbs:r.pbs,
          parentBlockId:r.parent_block_id==null?null:String(r.parent_block_id),
          blockGroup:'para_blocks',blockType:r.block_type,bbox:[40,60,180,125]}))});
    }
    if(route.request().method()==='POST'){posted++;throw Error('Filter must never POST');}
    throw Error('Unexpected OCR API '+op);
   });
   await page.goto(url,{waitUntil:'domcontentloaded'});
   const toggle=page.locator('.ocr-ag-all-pages input[aria-label="全部"]');
   const allRows=()=>page.locator('#workspace .ag-row');
   const displayedIds=()=>page.locator('#workspace .ag-row').evaluateAll(nodes=>
     nodes.map(n=>Number(n.querySelector('[col-id="pbs"]')?.textContent?.match(/b(\d+)/)?.[1]??NaN)));
   const pbsCells=()=>page.locator('#workspace .ag-row .ag-cell[col-id="pbs"]').allInnerTexts();
   const expectPBS=async values=>{
     await page.waitForFunction(expected=>{
       const actual=[...document.querySelectorAll('#workspace .ag-row .ag-cell[col-id="pbs"]')]
         .map(n=>n.textContent.trim()).sort();
       return JSON.stringify(actual)===JSON.stringify([...expected].sort());
     },values);
     assert.deepEqual((await pbsCells()).sort(),[...values].sort());
   };
   await toggle.waitFor();
   await expectPBS(['p1b0','p1b0s0','p1b1','p1b1s0']);
   assert.equal(await toggle.isChecked(),false,'All pages must be off by default');
   assert.equal(await page.locator('.ag-header-cell[col-id="__all_pages"]').count(),1);
   assert.equal(await page.locator('.ag-header-cell[col-id="pbs"]').count(),1);
   // The default current-page rule must be the actual PBS column filter,
   // not a second hidden external predicate that contradicts its checkboxes.
   const pbsHeader=page.locator('.ag-header-cell[col-id="pbs"]');
   await pbsHeader.locator('.ag-header-cell-filter-button').click();
   const currentPopup=page.locator('.ocr-enum-filter:visible');
   await currentPopup.waitFor();
   assert.equal(await currentPopup.locator('[data-filter-value="p1"] input').isChecked(),true);
   assert.equal(await currentPopup.locator('[data-filter-value="p2"] input').isChecked(),false);
   assert.equal(await currentPopup.locator('[data-filter-value="all"] input').isChecked(),false);
   await pbsHeader.locator('.ag-header-cell-filter-button').click();
   const cm=await page.evaluate(()=>document.querySelector('.ocr-cm-source')?.ocrCmTable?.runtime());
   assert.equal(cm.rows.length,6,'CM6 owns all pages regardless of AG selection');
   assert.equal(cm.rows.find(r=>r.block_id===6).global_page,1,
     'Cross-page child retains physical page two and logical p1 PBS');
   // The public AG projection patch must re-evaluate the SAME PBS filter
   // when CM changes a Block's logical parent page, without a SQL fetch.
   await page.evaluate(()=>document.querySelector('.ocr-outline-grid')?.ocrSqlGrid?.patchBlockRows(
     [{block_id:4,pbs:'p1b2'}]));
   await expectPBS(['p1b0','p1b0s0','p1b1','p1b1s0','p1b2']);
   await page.evaluate(()=>document.querySelector('.ocr-outline-grid')?.ocrSqlGrid?.patchBlockRows(
     [{block_id:4,pbs:'p2b0'}]));
   await expectPBS(['p1b0','p1b0s0','p1b1','p1b1s0']);
   const pdfPage=page.locator('.lab-ocr-pdf-page');
   await pdfPage.fill('2');await pdfPage.press('Tab');
   await expectPBS(['p2b0','p2b1']);
   await pbsHeader.locator('.ag-header-cell-filter-button').click();
   assert.equal(await page.locator('.ocr-enum-filter:visible [data-filter-value="p2"] input').isChecked(),true);
   await pbsHeader.locator('.ag-header-cell-filter-button').click();
   const before={pdfReads,rowsReads};
   await toggle.check();await expectPBS(source.map(r=>r.pbs));
   assert.equal(await toggle.isChecked(),true);
   // Page navigation while 全部 is checked must not alter the all-pages view.
   await pdfPage.fill('1');await pdfPage.press('Tab');
   await expectPBS(source.map(r=>r.pbs));
   // PBS dropdown filter options are PAGE values, not full block numbers.
   const header=page.locator('.ag-header-cell[col-id="pbs"]');
   await header.locator('.ag-header-cell-filter-button').click();
   const panel=page.locator('.ocr-enum-filter:visible');
   await panel.waitFor();
   const values=await panel.locator('.ocr-enum-filter-option').evaluateAll(nodes=>
     nodes.map(n=>n.dataset.filterValue));
   assert.deepEqual(values.sort(),['all','p1','p2'].sort());
   assert(!values.includes('p1b0'),'Page filtering must not offer full PBS values');
   await panel.locator('.ocr-enum-filter-option[data-filter-value="all"] input').uncheck();
   await panel.locator('.ocr-enum-filter-option[data-filter-value="p2"] input').check();
   await expectPBS(['p2b0','p2b1']);
   await panel.locator('.ocr-enum-filter-option[data-filter-value="all"] input').check();
   await header.locator('.ag-header-cell-filter-button').click();
   await expectPBS(source.map(r=>r.pbs));
   await toggle.uncheck();await expectPBS(['p1b0','p1b0s0','p1b1','p1b1s0']);
   assert.deepEqual({rowsReads,pdfReads},before,
     'Switching header and PBS filter never rereads SQL or downloads PDF');
   assert.equal(posted,0);
   assert.deepEqual(errors,[]);
   console.log('LAB_OCR_AG_PBS_PAGE_FOLLOW_PASS',name,
     JSON.stringify({rowsReads,pdfReads,overlayReads,allCount:source.length}));
  }finally{await browser.close();}
 }
}finally{vite.kill('SIGTERM');}
