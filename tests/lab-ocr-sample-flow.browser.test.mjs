/** End-to-end Lab: 1 MinerU JSON (<200 pages) + 1 PDF -> minerujson + block + span. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as pause} from 'node:timers/promises';
import {chromium,webkit} from 'playwright';
const port=5318,host=`http://127.0.0.1:${port}`,url=process.env.LAB_OCR_TEST_URL||host+'/labs/lab-ocr/';
const BOOK='/demo/sample';
const vite=process.env.LAB_OCR_TEST_URL?null:spawn('node',['node_modules/vite/bin/vite.js','--config','labs/lab-ocr/vite.config.mjs',
 '--host','127.0.0.1','--port',String(port),'--strictPort'],{stdio:['ignore','pipe','pipe']});
let log='';vite?.stdout.on('data',b=>log+=b);vite?.stderr.on('data',b=>log+=b);
try{
 let online=false;
 for(let i=0;i<90;i++){try{if((await fetch(url)).ok){online=true;break}}catch{} await pause(200)}
 assert(online,log.slice(-850));
 for(const [name,engine] of [['Chrome',chromium],['iPad-WebKit',webkit]]){
  const browser=await engine.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:{width:1032,height:768},hasTouch:true,ignoreHTTPSErrors:true});
   page.setDefaultTimeout(6500);
   let inspectCount=0,importCount=0,rowsCount=0,spanCreateCount=0,blockCreateCount=0,hasDb=false;
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/api/workspace/roots',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({allowedRoots:['/demo']})}));
   await page.route('**/api/workspace/browse?*',r=>{
    const path=new URL(r.request().url()).searchParams.get('path');
    return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({path,children:path==='/demo'?[{path:BOOK,name:'sample'}]:[]})});
   });
   await page.route('**/labs/lab-ocr/api/ocr/**',r=>{
    const path=new URL(r.request().url()).pathname;
    const operation=path.split('/').pop();
    if(operation==='inspect'){
     inspectCount++;
     return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
      status:hasDb?'unchanged':'ready',sources:[{name:'source.json',pages:22}],pdf:'sample.pdf',pages:22,
      blocks:hasDb?539:0,ordering:'single'})});
    }
    if(operation==='import'){
     importCount++;hasDb=true;
     return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({status:'imported',pages:22,blocks:539})});
    }
    if(operation==='minerujson2block'){
     blockCreateCount++;
     return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({table:'block',blocks:4,status:blockCreateCount===1?'created':'unchanged'})});
    }
    if(operation==='minerujson2span'){
     spanCreateCount++;
     return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({table:'span',spans:3,status:spanCreateCount===1?'created':'unchanged'})});
    }
    if(operation==='rows'){
     const table=new URL(r.request().url()).searchParams.get('table');
     if(table==='block'){
      rowsCount++;
      return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({table:'block',total:4,rows:[
        {block_id:1,pbs:'p1b0',parent_pbs:null,source_block_key:'s0:p0:para_blocks:b0',source_name:'source.json',global_page:0,local_page:0,block_group:'para_blocks',parent_block_id:null,block_path:'0',block_type:'text',block_bbox_json:'[1,2,3,4]',line_count:1,span_count:2,span_types:'text,inline_equation',content_preview:'Block text x^2',has_blocks_field:0,block_json:JSON.stringify({type:'text',bbox:[1,2,3,4],lines:[{spans:[{type:'text',content:'Block text '},{type:'inline_equation',content:'x^2'}]}]})},
        {block_id:2,pbs:'p2b1',parent_pbs:null,source_block_key:'s0:p1:para_blocks:b1',source_name:'source.json',global_page:1,local_page:1,block_group:'para_blocks',parent_block_id:null,block_path:'1',block_type:'table',block_bbox_json:'[5,6,7,8]',line_count:0,span_count:0,span_types:'',content_preview:'',has_blocks_field:1,block_json:'{"type":"table","bbox":[5,6,7,8]}'},
        {block_id:3,pbs:'p2b1s0',parent_pbs:'p2b1',source_block_key:'s0:p1:para_blocks:b1.0',source_name:'source.json',global_page:1,local_page:1,block_group:'para_blocks',parent_block_id:2,block_path:'1.0',block_type:'table_body',block_bbox_json:'[5,6,7,8]',line_count:1,span_count:1,span_types:'table',content_preview:'<table>...',has_blocks_field:0,block_json:JSON.stringify({type:'table_body',lines:[{spans:[{type:'table',html:'<table><tr><td>Cell</td></tr></table>',image_path:'image.jpg'}]}]})},
        {block_id:4,pbs:'p2b0',parent_pbs:null,source_block_key:'s0:p1:discarded_blocks:b0',source_name:'source.json',global_page:1,local_page:1,block_group:'discarded_blocks',parent_block_id:null,block_path:'0',block_type:'page_number',block_bbox_json:'[1,1,2,2]',line_count:1,span_count:1,span_types:'text',content_preview:'35',has_blocks_field:0,block_json:'{"type":"page_number","lines":[{"spans":[{"type":"text","content":"35"}]}]}'},
      ]})});
     }
     if(table==='span'){
      rowsCount++;
      return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({table:'span',total:3,
       rows:[
         {span_id:'s0:p0:para_blocks:b0:l0:s0',source_name:'source.json',global_page:0,local_page:0,block_group:'para_blocks',block_id:'s0:p0:para_blocks:b0',parent_block_id:null,block_path:'0',block_type:'title',block_bbox_json:'[1,2,3,4]',line_index:0,span_index:0,span_type:'text',span_bbox_json:'[1,2,3,4]',content:'Span heading',content_preview:'Span heading'},
         {span_id:'s0:p1:para_blocks:b1.0:l0:s0',source_name:'source.json',global_page:1,local_page:1,block_group:'para_blocks',block_id:'s0:p1:para_blocks:b1.0',parent_block_id:'s0:p1:para_blocks:b1',block_path:'1.0',block_type:'image_body',block_bbox_json:'[2,3,4,5]',line_index:0,span_index:0,span_type:'image',span_bbox_json:'[2,3,4,5]',image_path:'https://example.org/p.jpg',content_preview:'https://example.org/p.jpg'},
         {span_id:'s0:p1:discarded_blocks:b0:l0:s0',source_name:'source.json',global_page:1,local_page:1,block_group:'discarded_blocks',block_id:'s0:p1:discarded_blocks:b0',parent_block_id:null,block_path:'0',block_type:'page_number',block_bbox_json:'[5,6,7,8]',line_index:0,span_index:0,span_type:'text',span_bbox_json:'[5,6,7,8]',content:'35',content_preview:'35'}]})});
     }

     rowsCount++;
     const offset=Number(new URL(r.request().url()).searchParams.get('offset'));
     return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({table:'minerujson',total:2,
      rows:offset?[]:[{id:1,source_name:'source.json',global_page:0,local_page:0,
       block_group:'para_blocks',block_index:0,block_type:'title',bbox_json:'[1,2,3,4]',
       text_preview:'First heading',block_json:'{"type":"title"}'},
       {id:2,source_name:'source.json',global_page:1,local_page:1,
       block_group:'para_blocks',block_index:0,block_type:'text',bbox_json:'[2,3,4,5]',
       text_preview:'Second paragraph',block_json:'{"type":"text"}'}]})});
    }
    throw Error('Unexpected OCR API operation '+operation);
   });
   await page.goto(url,{waitUntil:'domcontentloaded'});
   await page.locator('#settings-workspace').waitFor({state:'visible',timeout:23000});
   assert.equal(await page.locator('#workspace').isVisible(),false,'Unbound OCR must open Settings');
   await page.waitForFunction(()=>/绑定书籍工作目录|绑定工作区/.test(document.querySelector('#status')?.textContent||''),null,{timeout:23000});
   assert.equal(await page.locator('optgroup[label="SQLite"] option').count(),0);
   await page.locator('#settings-workspace .ag-row').filter({hasText:'dataDirectory'}).first().click();
   await page.getByRole('button',{name:'打开目录树'}).click();
   const item=page.locator('wa-tree-item[data-path="'+BOOK+'"]');
   await item.waitFor({state:'attached',timeout:18000});
   await item.locator('[part="item"]').first().click();
   await page.getByRole('button',{name:'采用选中目录'}).click();
   assert.equal(await page.evaluate(()=>localStorage.getItem('ocr2md.lab-ocr.settings.json.v1')),null);
   await page.locator('#global-save').click();
   await page.waitForFunction(()=>document.querySelector('#workspace')&&!document.querySelector('#workspace').hidden&&
     !!document.querySelector('select.ocr-source-file-select option[value="sql:minerujson"]'),null,{timeout:20000});
   assert.equal(await page.locator('#workspace').isVisible(),true);
   assert.equal(importCount,1,'First book should import just once');
   const nav=page.locator('#workspace select.ocr-source-file-select');
   assert.deepEqual(await nav.locator('optgroup[label="SQLite"] option').allInnerTexts(),['minerujson','block','span']);
   // Exercise the real visible Tom Select dropdown, not only the hidden
   // HTMLSelectElement business port.
   await page.locator('#workspace .ocr-navigation-files .ts-control').click();
   const dropdown=page.locator('.ocr-navigation-popup-files:visible');
   await dropdown.locator('.optgroup-header').filter({hasText:'SQLite'}).waitFor({state:'visible'});
   await dropdown.locator('.option').filter({hasText:'minerujson'}).click();
   await page.waitForFunction(()=>document.querySelectorAll('#workspace .ag-row').length>=2);
   assert.equal(await page.locator('#workspace .ag-row').count(),2);
   assert.match(await page.locator('#workspace .ag-row').first().innerText(),/source.json/);
   assert.match(await page.locator('#status').innerText(),/2 行/);
   // SQL AG every column uses Main's checkbox enum popup, not text/number
   // input filters. The 'all' checkbox and distinct values support multi-select.
   const header=page.locator('#workspace .ag-header-cell[col-id="global_page"]');
   await header.locator('.ag-header-cell-filter-button').click();
   const pop=page.locator('.ocr-enum-filter:visible');
   await pop.waitFor({state:'visible'});
   const box=value=>pop.locator('.ocr-enum-filter-option[data-filter-value="'+value+'"] input');
   assert.equal(await pop.getAttribute('aria-label'),'页（0起） 筛选');
   assert.equal(await box('all').isChecked(),true);
   assert.equal(await box('0').isChecked(),true);
   assert.equal(await box('1').isChecked(),true);
   await box('1').uncheck();
   await page.waitForFunction(()=>document.querySelectorAll('#workspace .ag-row').length===1);
   assert.equal(await box('all').isChecked(),false);
   assert.equal(await box('0').isChecked(),true);
   assert.equal(await box('1').isChecked(),false);
   await box('0').uncheck();
   await page.waitForFunction(()=>document.querySelectorAll('#workspace .ag-row').length===0);
   await box('1').check();
   await page.waitForFunction(()=>document.querySelectorAll('#workspace .ag-row').length===1);
   assert.match(await page.locator('#workspace .ag-row').first().innerText(),/1/);
   await box('0').check();
   await page.waitForFunction(()=>document.querySelectorAll('#workspace .ag-row').length===2);
   assert.equal(await box('all').isChecked(),true);
   // Filtering is entirely client-side and never writes to the SQL backend.
   assert.equal(rowsCount,1,'Checkbox filtering must not reread or mutate SQLite');
   // New SQL → span uses CM6 as the row-state owner, AG only as its projection.
   await page.locator('#workspace .ocr-navigation-files .ts-control').click();
   const spanDropdown=page.locator('.ocr-navigation-popup-files:visible');
   await spanDropdown.locator('.option').filter({hasText:'span'}).click();
   await page.waitForFunction(()=>document.querySelectorAll('#workspace .ag-row').length===3);
   assert.match(await page.locator('#status').innerText(),/span：CM6 已加载 3 行/);
   assert.equal(await page.locator('#workspace .ag-header-cell[col-id="block_group"]').count(),1);
   const spanHeader=page.locator('#workspace .ag-header-cell[col-id="block_group"]');
   await spanHeader.locator('.ag-header-cell-filter-button').click();
   const spanFilter=page.locator('.ocr-enum-filter:visible');
   await spanFilter.waitFor({state:'visible'});
   await spanFilter.locator('.ocr-enum-filter-option[data-filter-value="discarded_blocks"] input').uncheck();
   await page.waitForFunction(()=>document.querySelectorAll('#workspace .ag-row').length===2);
   await page.locator('#workspace .ag-row').first().click();
   await page.waitForFunction(()=>document.querySelector('#workspace .ocr-cm-source .cm-content')?.textContent?.includes('Span heading'));
   assert.match(await page.locator('#status').innerText(),/Span 定位：P0/);
   // Block has one SQL/AG row per Block, while Line/Span remain in block_json.
   await page.locator('#workspace .ocr-navigation-files .ts-control').click();
   const blockDropdown=page.locator('.ocr-navigation-popup-files:visible');
   await blockDropdown.locator('.option').filter({hasText:'block'}).click();
   await page.waitForFunction(()=>document.querySelectorAll('#workspace .ag-row').length===4);
   assert.match(await page.locator('#status').innerText(),/block：CM6 已加载 4 行/);
   assert.equal(await page.locator('#workspace .ag-header-cell[col-id="pbs"]').count(),1);
   assert.equal(await page.locator('#workspace .ag-header-cell[col-id="block_id"]').count(),1);
   assert.match(await page.locator('#workspace .ag-row').first().innerText(),/p1b0/);
   await page.waitForTimeout(450); // WebKit: let AG finish virtualizing headers after the table switch.
   const groupHeader=page.locator('#workspace .ag-header-cell[col-id="block_group"]');
   await groupHeader.locator('.ag-header-cell-filter-button').click();
   const blockFilter=page.locator('.ocr-enum-filter:visible');
   await blockFilter.locator('.ocr-enum-filter-option[data-filter-value="discarded_blocks"] input').uncheck();
   await page.waitForFunction(()=>document.querySelectorAll('#workspace .ag-row').length===3);
   await page.locator('#workspace .ag-row').first().click();
   await page.waitForFunction(()=>document.querySelector('#workspace .ocr-cm-source .cm-content')?.textContent?.includes('Block text'));
   assert.match(await page.locator('#workspace .ocr-cm-source .cm-content').innerText(),/inline_equation/);
   assert.match(await page.locator('#status').innerText(),/Block 定位：p1b0 · ID 1/);
   assert.equal(await page.evaluate(()=>document.querySelector('#workspace .ocr-cm-source').ocrCmTable.selected()),1);
   assert.equal(rowsCount,3,'Block and Span filtering must not query SQL again');
   assert.equal(blockCreateCount,1,'Block table created once');
   assert.equal(spanCreateCount,1,'span generation must be idempotent at initialization');

   await page.reload({waitUntil:'domcontentloaded'});
   await page.locator('#workspace .dv-content-container').first().waitFor({timeout:18000});
   await page.waitForFunction(()=>!!document.querySelector('select.ocr-source-file-select option[value="sql:minerujson"]')&&!!document.querySelector('select.ocr-source-file-select option[value="sql:block"]')&&!!document.querySelector('select.ocr-source-file-select option[value="sql:span"]'),null,{timeout:20000});
   assert.equal(importCount,1,'Reload must not re-import unchanged JSON');
   assert(importCount>0&&inspectCount>=2&&rowsCount>0&&spanCreateCount>=2&&blockCreateCount>=2);
   assert.deepEqual(errors,[]);
   console.log('LAB_OCR_SAMPLE_FLOW_PASS',name,JSON.stringify({inspectCount,importCount,spanCreateCount,blockCreateCount,rowsCount}));
  }finally{await browser.close()}
 }
}finally{vite?.kill('SIGTERM')}
