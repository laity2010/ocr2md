/** Real AG block_group checkbox model drives a single deduplicated PDF overlay.
 * Mixed groups are a set union: identical and nearly identical OCR stage
 * rectangles only paint once; nested structures are preserved.
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
 {id:'b-para-text',group:'para_blocks',type:'text',bbox:[72,60,360,155]}, // repeated ID
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
 assert(online,'Vite unavailable '+output.slice(-1000));
 for(const [name,engine] of [['Chromium',chromium],['iPad-WebKit',webkit]]){
  const browser=await engine.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:{width:1120,height:820},hasTouch:true,ignoreHTTPSErrors:true});
   page.setDefaultTimeout(14000);
   const errors=[],overlayRequests=[];
   let pdfRequests=0,rowRequests=0;
   page.on('pageerror',error=>errors.push(error.message));
   await page.addInitScript(({book})=>{
    localStorage.setItem('ocr2md.lab-ocr.settings.json.v1',JSON.stringify({settings:{
      'workspace.dataDirectory':{key:'dataDirectory',category1:'工作区',category2:'目录',
        comment:'通用资料目录绑定；不检查 OCR、MinerU 或 PDF',value:book,
        range:{kind:'server-directory'}},
    }}));
   },{book});
   await page.route('**/labs/lab-ocr/api/ocr/**',route=>{
    const parsed=new URL(route.request().url()),op=parsed.pathname.split('/').at(-1);
    if(op==='pdf'){
      pdfRequests++;
      return route.fulfill({status:200,contentType:'application/pdf',body:makeLabOcrPdf()});
    }
    if(op==='overlays'){
      const level=parsed.searchParams.get('level'),pageNumber=Number(parsed.searchParams.get('page'));
      overlayRequests.push(level+':'+pageNumber);
      const source=level==='span'?spans:blocks;
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
        level,page:pageNumber,pageSize:[595,842],
        boxes:pageNumber===1?source.map(x=>({id:x.id,blockType:x.type,blockGroup:x.group,bbox:x.bbox})):
          pageNumber===3?[{id:'p3-'+level,blockType:'title',blockGroup:'discarded_blocks',bbox:[80,60,200,100]}]:[],
      })});
    }
    if(op==='inspect')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
      status:'unchanged',blocks:7,pages:3,pdf:'sample.pdf',sources:[{name:'source.json',pages:3}]})});
    if(op==='minerujson2block')return route.fulfill({status:200,contentType:'application/json',body:'{"blocks":7}'});
    if(op==='minerujson2span')return route.fulfill({status:200,contentType:'application/json',body:'{"spans":7}'});
    if(op==='rows'){
      rowRequests++;
      const table=parsed.searchParams.get('table');
      assert.equal(table,'block','Only Block AG rows should be requested');
      const rows=blocks.filter((v,i)=>i!==7).map((b,i)=>({
        block_id:i+1,global_page:0,block_group:b.group,pbs:'p1b'+i,
        parent_block_id:i===5?2:null,block_type:b.type,
        block_bbox_json:JSON.stringify(b.bbox),source_block_key:'s0:p0:'+b.group+':b'+i,
        block_path:String(i),content_preview:b.type,
      }));
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({table,total:rows.length,rows})});
    }
    throw Error('Unexpected API '+op);
   });
   const loaded=await page.goto(url,{waitUntil:'domcontentloaded'});
   assert.equal(loaded.status(),200);
   const pageBoxes=()=>page.locator('.lab-ocr-pdf-overlay-layer[data-page="1"] .lab-ocr-pdf-overlay-box');
   const ids=async()=>pageBoxes().evaluateAll(nodes=>nodes.map(node=>node.dataset.id));
   const expectIds=async expected=>{
     await page.waitForFunction(expected=>{
       const actual=[...document.querySelectorAll('.lab-ocr-pdf-overlay-layer[data-page="1"] .lab-ocr-pdf-overlay-box')]
         .map(node=>node.dataset.id);
       return JSON.stringify(actual)===JSON.stringify(expected);
     },expected,{timeout:9000}).catch(async error=>{
       console.error('FILTER_DIAGNOSTIC',name,JSON.stringify(await page.evaluate(()=>({
         selectedPage:document.querySelector('.lab-ocr-pdf-page')?.value,
         zoom:document.querySelector('.lab-ocr-pdf-scale')?.value,
         level:document.querySelector('.lab-ocr-pdf-overlay-level')?.value,
         boxes:[...document.querySelectorAll('.lab-ocr-pdf-overlay-layer')].map(node=>({
           page:node.dataset.page,level:node.dataset.level,
           ids:[...node.querySelectorAll('.lab-ocr-pdf-overlay-box')].map(n=>n.dataset.id),
         })),
         pageElements:[...document.querySelectorAll('.lab-ocr-pdf-scroller .page')].map(node=>({page:node.dataset.pageNumber,children:node.children.length})),
         status:document.querySelector('#status')?.innerText,
       }))));throw error;
     });
     assert.deepEqual(await ids(),expected);
   };
   await page.waitForFunction(()=>document.querySelectorAll('.lab-ocr-pdf-overlay-layer[data-level="block"][data-page="1"] .lab-ocr-pdf-overlay-box').length===5);
   await expectIds(['b-para-text','b-para-table','b-para-inner','b-discard','b-preproc-only']); // all groups deduplicated
   await page.locator('#workspace .ocr-navigation-files .ts-control').click();
   await page.locator('.ocr-navigation-popup-files:visible .option').filter({hasText:'block'}).click();
   await page.waitForFunction(()=>document.querySelectorAll('#workspace .ag-row').length===7);
   assert.equal(rowRequests,1);
   // Block group comes near the start of the table: do not select Block Type.
   const header=page.locator('#workspace .ag-header-cell[col-id="block_group"]');
   for(const left of [0,200,400,600,800]){
     if(await header.count())break;
     await page.locator('#workspace .ag-body-horizontal-scroll-viewport').evaluate((el,n)=>{el.scrollLeft=n;el.dispatchEvent(new Event('scroll'));},left);
     await page.waitForTimeout(120);
   }
   await header.waitFor({state:'visible',timeout:9500}).catch(async error=>{
     console.error('BLOCK_GROUP_HEADER',name,await page.locator('#workspace .ag-header-cell').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('col-id'))));
     throw error;
   });
   await header.locator('.ag-header-cell-filter-button').click();
   const panel=page.locator('.ocr-enum-filter:visible');
   await panel.waitFor({state:'visible'});
   assert.equal(await panel.getAttribute('aria-label'),'块组 筛选');
   const checkbox=type=>panel.locator(`.ocr-enum-filter-option[data-filter-value="${type}"] input`);
   const stableRequests=overlayRequests.length;
   await checkbox('all').uncheck();
   await expectIds([]);
   await checkbox('para_blocks').check();
   await expectIds(['b-para-text','b-para-table','b-para-inner']);
   await checkbox('preproc_blocks').check();
   await expectIds(['b-para-text','b-para-table','b-para-inner','b-preproc-only']);
   assert.equal(await pageBoxes().count(),4,'Nearly identical cross-group geometry must not stack');
   await checkbox('discarded_blocks').check();
   await expectIds(['b-para-text','b-para-table','b-para-inner','b-discard','b-preproc-only']);
   await checkbox('para_blocks').uncheck();
   await expectIds(['b-discard','b-preproc-copy','b-preproc-table','b-preproc-only']);
   await checkbox('discarded_blocks').uncheck();
   await expectIds(['b-preproc-copy','b-preproc-table','b-preproc-only']);
   await checkbox('preproc_blocks').uncheck();
   await expectIds([]);
   assert.equal(overlayRequests.length,stableRequests,'Group filter must reuse cached page geometry');
   assert.equal(rowRequests,1,'Group filter must NOT refresh SQLite AG rows');
   assert.equal(pdfRequests,1,'Group filter must NOT reload PDF');
   await checkbox('all').check();
   await expectIds(['b-para-text','b-para-table','b-para-inner','b-discard','b-preproc-only']);
   // `block_type` filter is independent and never drives PDF visibility.
   // Keep the group model untouched while selecting text in the type column.
   await header.locator('.ag-header-cell-filter-button').click();
   const typeHeader=page.locator('#workspace .ag-header-cell[col-id="block_type"]');
   await typeHeader.locator('.ag-header-cell-filter-button').click();
   const typePanel=page.locator('.ocr-enum-filter:visible');
   await typePanel.locator('.ocr-enum-filter-option[data-filter-value="all"] input').uncheck();
   await typePanel.locator('.ocr-enum-filter-option[data-filter-value="text"] input').check();
   await expectIds(['b-para-text','b-para-table','b-para-inner','b-discard','b-preproc-only']);
   await typePanel.locator('.ocr-enum-filter-option[data-filter-value="all"] input').check();
   const scale=page.locator('.lab-ocr-pdf-scale');
   await scale.selectOption('100');
   await expectIds(['b-para-text','b-para-table','b-para-inner','b-discard','b-preproc-only']);
   const overlaySelect=page.locator('.lab-ocr-pdf-overlay-level');
   await overlaySelect.selectOption('span');
   await expectIds(['s-para-text','s-para-table','s-para-inner','s-discard','s-preproc-only']);
   const spanRequests=overlayRequests.length;
   await typeHeader.locator('.ag-header-cell-filter-button').click();
   await header.locator('.ag-header-cell-filter-button').click();
   await checkbox('para_blocks').uncheck();
   assert.equal(await overlaySelect.inputValue(),'span','AG group filter cannot reset Span mode');
   await expectIds(['s-discard','s-preproc-copy','s-preproc-table','s-preproc-only']);
   await checkbox('preproc_blocks').uncheck();
   await expectIds(['s-discard']);
   await checkbox('all').check();
   await expectIds(['s-para-text','s-para-table','s-para-inner','s-discard','s-preproc-only']);
   assert.equal(overlayRequests.length,spanRequests,'Span group filter must reuse page cache');
   await page.locator('.lab-ocr-pdf-page').fill('3');
   await page.locator('.lab-ocr-pdf-page').press('Tab');
   await page.waitForFunction(()=>document.querySelector('.lab-ocr-pdf-overlay-layer[data-level="span"][data-page="3"] .lab-ocr-pdf-overlay-box'));
   assert(overlayRequests.includes('span:3'),'Page change fetches only the missing page');
   assert.equal(pdfRequests,1);
   assert.deepEqual(errors,[]);
   console.log('LAB_OCR_BLOCK_GROUP_OVERLAY_FILTER_PASS',name,JSON.stringify({rowRequests,pdfRequests,overlayRequests}));
  }finally{await browser.close();}
 }
}finally{vite?.kill('SIGTERM');}
