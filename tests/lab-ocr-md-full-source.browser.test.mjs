/** WCP54 actual CodeMirror 6 / AG Grid / PDF.js MD row view.
 * In-memory authorized API fixture: no user book, no Main/SQL mutations.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {chromium,webkit} from 'playwright';
import {makeLabOcrPdf} from './helpers/lab-ocr-pdf-fixture.mjs';
const port=5378,book='/isolated/wcp54-md';
const url=`http://127.0.0.1:${port}/labs/lab-ocr/`;
const vite=spawn('node',['node_modules/vite/bin/vite.js','--config',
  'labs/lab-ocr/vite.config.mjs','--host','127.0.0.1',
  '--port',String(port),'--strictPort'],{stdio:['ignore','pipe','pipe']});
let log='';
vite.stdout.on('data',c=>log+=c);vite.stderr.on('data',c=>log+=c);
const blockRows=[
 [1,'p1b0',null,0,0,'title',2,'Heading'],
 [2,'p1b1',null,1,0,'text',null,'Original paragraph'],
 [3,'p2b0',null,0,1,'text',null,'Last paragraph'],
].map(([block_id,pbs,parent_block_id,sibling_order,global_page,block_type,level,content])=>({
 block_id,pbs,parent_block_id,sibling_order,global_page,block_type,level,
 block_group:'para_blocks',source_name:'source.json',
 source_block_key:'immutable:'+block_id,block_path:'source:'+block_id,
 block_json:JSON.stringify({type:block_type,level,
  lines:[{spans:[{type:'text',content}]}]}),
 absorbed_into_block_id:null,block_bbox_json:'[40,70,190,145]',
 content_preview:content,line_count:1,span_count:1,span_types:'text',
}));
const originalLines=[
 [1,'md-a',1,'## Heading'],
 [2,'md-b',1,''],
 [3,'md-c',2,'Original paragraph'],
 [4,'md-d',2,''],
 [5,'md-e',3,'Last paragraph'],
 [6,'md-f',3,''],
].map(([line_no,line_id,block_id,text])=>({line_no,line_id,block_id,text}));
try{
 let ready=false;
 for(let i=0;i<100;i++){
  try{if((await fetch(url)).ok){ready=true;break;}}catch{}
  await sleep(180);
 }
 assert(ready,'Vite unavailable '+log.slice(-500));
 for(const [name,browserType] of [['Chromium',chromium],['iPad-WebKit',webkit]]
   .filter(([name])=>!process.env.LAB_OCR_TEST_BROWSER||name===process.env.LAB_OCR_TEST_BROWSER)){
  const browser=await browserType.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:{width:1180,height:860},hasTouch:true});
   page.setDefaultTimeout(20000);
   let revision=0,mdInitialized=false,mdRows=originalLines.map(row=>({...row}));
   let mdLoads=0,mdInit=0,saves=0,blocks=0,pdfs=0,visits=0;
   const receipts=new Map(),errors=[];
   page.on('pageerror',err=>errors.push(err.message));
   await page.addInitScript(({book})=>{
     localStorage.setItem('ocr2md.lab-ocr.settings.json.v1',JSON.stringify({settings:{
       'workspace.dataDirectory':{key:'dataDirectory',category1:'工作区',
         category2:'目录',comment:'isolated MD source',value:book,
         range:{kind:'server-directory'}},
     }}));
   },{book});
   await page.route('**/labs/lab-ocr/api/ocr/**',async route=>{
     const u=new URL(route.request().url()),op=u.pathname.split('/').at(-1);
     const body=route.request().method()==='POST'?
       JSON.parse(route.request().postData()||'{}'):null;
     const reply=obj=>route.fulfill({status:200,contentType:'application/json',
       body:JSON.stringify(obj)});
     if(op==='pdf'){pdfs++;return route.fulfill({status:200,
       contentType:'application/pdf',body:makeLabOcrPdf(2)});}
     if(op==='inspect'){visits++;return reply({status:'unchanged',blocks:3,pages:2,
       pdf:'fixture.pdf',sources:[{name:'source.json',pages:2}],mdSupported:true});}
     if(op==='minerujson2block')return reply({status:'ready',kind:'view',blocks:3});
     if(op==='rows'){
       if(u.searchParams.get('table')==='block'){
         blocks++;
         return reply({table:'block',total:3,rows:blockRows});
       }
       return reply({table:u.searchParams.get('table'),total:0,rows:[]});
     }
     if(op==='block-edit-state')return reply({revision:0,canUndo:false,canRedo:false,cursor:0,history:[]});
     if(op==='md-state'){mdLoads++;return reply(mdInitialized?
       {status:'ready',revision,rows:mdRows,total:mdRows.length}:
       {status:'missing',revision:null,rows:[],total:0});}
     if(op==='md-initialize'){
       mdInit++;assert.equal(body.workspace,book);
       if(!mdInitialized)mdInitialized=true;
       return reply({status:'created',revision,rows:mdRows,total:mdRows.length});
     }
     if(op==='md-save'){
       saves++;
       assert.equal(body.workspace,book);
       assert.equal(typeof body.requestId,'string');
       assert(body.requestId.length>8);
       if(receipts.has(body.requestId))return reply(receipts.get(body.requestId));
       assert.equal(body.expectedRevision,revision,'CAS must reference the loaded revision');
       assert(body.start>=1&&body.start<=mdRows.length+1);
       const next=[...mdRows.slice(0,body.start-1),
         ...body.insert.map(row=>({...row})),
         ...mdRows.slice(body.start-1+body.deleteCount)];
       mdRows=next.map((row,i)=>({...row,line_no:i+1}));
       revision++;
       const result={status:'saved',revision,total:mdRows.length};
       receipts.set(body.requestId,result);
       return reply(result);
     }
     if(op==='overlays'){
       const n=Number(u.searchParams.get('page'));
       return reply({page:n,level:u.searchParams.get('level'),pageSize:[595,842],
         boxes:blockRows.filter(r=>r.global_page===n-1)
          .map(r=>({id:'b'+r.block_id,blockId:String(r.block_id),
            pbs:r.pbs,parentBlockId:null,blockType:r.block_type,
            blockGroup:'para_blocks',bbox:[40,70,190,145]}))});
     }
     throw Error('Unexpected OCR API '+op);
   });
   await page.goto(url,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>document.querySelector(
     '#workspace select.ocr-source-file-select')?.value==='sql:md');
   const source=page.locator('.ocr-source-pane .cm-content');
   await page.waitForFunction(()=>
     [...document.querySelectorAll('.ocr-preview-md-scroll h2')].some(
       node=>node.textContent.trim()==='Heading'),null,{timeout:15000});
   await page.waitForFunction(()=>document.querySelectorAll(
     '.lab-ocr-pdf-pbs-tag').length>=2,null,{timeout:15000});
   await source.waitFor();
   assert.equal(await source.getAttribute('contenteditable'),'true');
   assert.equal(await page.locator('#workspace .ag-header-cell[col-id="line_no"]').count(),1);
   const agFields=await page.evaluate(()=>document.querySelector('.ocr-outline-grid')
     ?.ocrSqlGrid?.columnFields());
   assert.deepEqual(agFields.slice(0,4),['line_no','pbs','block_type','text']);
   for(const original of ['pbs','block_type','level','content_preview','global_page',
     'block_id','parent_block_id','block_bbox_json','line_count','span_count',
     'span_types','block_path','source_block_key','block_json']){
     assert(agFields.includes(original),'Prior Block AG column missing: '+original);
   }
   assert(agFields.includes('line_id'),'MD LineID must remain available');
   assert.equal(await page.locator('#workspace .ag-grid-container-wrapper .ag-header-cell[col-id="line_no"]').count(),1,
     'Line number must be a pinned left index column');
   assert.equal(await page.locator('#workspace .ag-grid-container-wrapper .ag-header-cell[col-id="pbs"]').count(),1,
     'PBS must be a pinned left index column');
   assert.equal(await page.locator('.ocr-cm-source .cm-foldGutter').count(),1,
     'Main folding gutter must be present');
   assert.equal(await page.locator('.ocr-cm-source .cm-ob-heading-line-2').count(),1,
     'Main Obsidian heading decoration must be active');
   const editorTheme=await page.locator('.ocr-cm-source .cm-editor').evaluate(el=>
     getComputedStyle(el).backgroundColor);
   assert.equal(editorTheme,'rgb(47, 56, 62)','Main Everforest dark background');
   // Review AG must keep its prior Block columns, toolbar and default filters.
   assert.equal(await page.locator('#workspace .ag-header-cell[col-id="block_type"]').count(),1,
     'Original Block Type column must remain in the MD row view');
   assert.equal(await page.locator('.ocr-ag-all-pages').isVisible(),true,
     'The original AG toolbar 全部 switch must not disappear in MD mode');
   const allPages=page.locator('.ocr-ag-all-pages input');
   assert.equal(await allPages.isChecked(),false,'全部 defaults to unchecked');
   await page.waitForFunction(()=>document.querySelectorAll(
     '#workspace .ag-row:not(.ag-opacity-zero)').length===2,
     null,{timeout:15000});
   assert.deepEqual(await page.locator('#workspace .ag-row:not(.ag-opacity-zero) .ag-cell[col-id="line_no"]').allTextContents(),
     ['1','3'],'Default MD AG view is current page, nonblank lines only');
   const filterButton=page.locator('#workspace .ag-header-cell[col-id="line_no"] .ag-header-cell-filter-button');
   await filterButton.click();
   const blankOption=page.locator('.ocr-enum-filter-option[data-filter-value="空行"] input');
   const nonblankOption=page.locator('.ocr-enum-filter-option[data-filter-value="非空行"] input');
   await blankOption.waitFor();
   assert.equal(await blankOption.isChecked(),false,'Blank lines must be filtered automatically');
   assert.equal(await nonblankOption.isChecked(),true);
   await allPages.check();
   await page.waitForFunction(()=>document.querySelectorAll(
     '#workspace .ag-row:not(.ag-opacity-zero)').length===3);
   assert.deepEqual(await page.locator('#workspace .ag-row:not(.ag-opacity-zero) .ag-cell[col-id="line_no"]').allTextContents(),
     ['1','3','5'],'全部 changes only the page filter; blank filter survives');
   // Restore blank lines using the existing row-number checkbox filter.
   if(!await page.locator('.ocr-enum-filter-option[data-filter-value="all"] input').isVisible())
     await filterButton.click();
   await page.locator('.ocr-enum-filter-option[data-filter-value="all"] input').check();
   await page.waitForFunction(()=>document.querySelectorAll(
     '#workspace .ag-row:not(.ag-opacity-zero)').length===6);
   assert.deepEqual((await page.locator('#workspace .ag-row:not(.ag-opacity-zero) .ag-cell[col-id="line_no"]').allTextContents()).sort((a,b)=>Number(a)-Number(b)),
     ['1','2','3','4','5','6'],'Restoring blanks must retain original MD line positions');
   assert.equal(await allPages.isChecked(),true);

   const view=()=>page.evaluate(()=>{
     const cm=document.querySelector('.ocr-cm-source')?.ocrCmTable;
     return {text:cm?.mdDocument(),md:cm?.mdRuntime(),
       table:cm?.rows().map(r=>[r.line_no,r.text]),selected:cm?.selected()};
   });
   let now=await view();
   assert.equal(now.text,'## Heading\n\nOriginal paragraph\n\nLast paragraph\n');
   assert.equal(now.md.rows.length,6);
   assert.deepEqual(now.md.rows.map(r=>r.line_no),[1,2,3,4,5,6]);
   assert.deepEqual(now.md.rows.map(r=>r.line_id),originalLines.map(r=>r.line_id));
   assert.equal(now.md.dirty,false);
   await page.locator('.lab-ocr-pdf-pbs-tag[data-block-id="2"]').click();
   await page.waitForFunction(()=>document.querySelector('.ocr-cm-source')
     ?.ocrCmTable?.selected()==='md-c');
   assert.equal((await view()).text,'## Heading\n\nOriginal paragraph\n\nLast paragraph\n',
     'PDF -> MD changes only the selection, never replaces Markdown with JSON');
   // AG picks one LineID, source CM scrolls without replacing the full doc.
   await page.locator('#workspace .ag-row .ag-cell[col-id="text"]')
      .filter({hasText:'Original paragraph'}).click();
   await page.waitForFunction(()=>document.querySelector('.ocr-cm-source')
     ?.ocrCmTable?.selected()==='md-c',null,{timeout:4500}).catch(async error=>{
       console.error('MD_AG_SELECTION_DIAG',name,JSON.stringify({
         status:await page.locator('#status').innerText(),
         nav:await page.locator('#workspace select.ocr-source-file-select').inputValue(),
         current:(await view()).selected,
         active:await page.evaluate(()=>document.activeElement?.outerHTML.slice(0,350)),
         errors,
       }));
       throw error;
     });
   now=await view();
   assert.equal(now.selected,'md-c');
   assert.equal(now.text.split('\n').length,6);
   const sourceText='## Heading\n\nCorrected paragraph\n\nLast paragraph\n';
   await source.click();
   await page.keyboard.press('ControlOrMeta+A');
   await page.keyboard.insertText(sourceText);
   await page.waitForFunction(expected=>
     document.querySelector('.ocr-cm-source')?.ocrCmTable?.mdDocument()===expected,
     sourceText).catch(async error=>{
       console.error('MD_SOURCE_EDIT_DIAG',name,JSON.stringify({
         actual:(await view()).text,
         focused:await page.evaluate(()=>document.activeElement?.outerHTML.slice(0,400)),
         errors,
       }));
       throw error;
     });
   now=await view();
   assert.equal(now.md.rows.length,6);
   assert.equal(now.md.rows[2].line_id,'md-c',
     'A corrected line keeps its stable identity');
   assert.equal(now.md.rows[2].text,'Corrected paragraph');
   assert.equal(now.md.dirty,true);
   await page.waitForFunction(()=>[...document.querySelectorAll(
     '#workspace .ag-row .ag-cell[col-id="text"]')].some(n=>n.textContent==='Corrected paragraph'));
   await page.waitForFunction(()=>
     document.querySelector('.ocr-preview-md-scroll')?.textContent
       ?.includes('Corrected paragraph'),null,{timeout:12000});
   await page.waitForFunction(()=>document.querySelector('.ocr-cm-source')?.ocrCmTable?.mdRuntime()?.dirty===false,
     null,{timeout:12000});
   assert.equal(saves,1,'An idle edit is written as exactly one CAS batch');
   assert.equal(revision,1);
   assert.equal(mdRows[2].text,'Corrected paragraph');
   assert.equal(mdRows[2].line_id,'md-c');
   await page.reload({waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>document.querySelector(
     '#workspace select.ocr-source-file-select')?.value==='sql:md');
   now=await view();
   assert.equal(now.text,sourceText,'Saved MD, not OCR source, must reopen');
   assert.equal(mdInit,1,'Existing document must not be reinitialized from OCR');
   assert.equal(saves,1);
   assert.equal(revision,1);
   assert.equal(mdLoads,2);
   // AG text editor cannot become a second writer: it calls the CM6 port,
   // then the same CM state projects the corrected text back to AG.
   // Reopening the MD view resets the existing AG toolbar to current page.
   assert.equal(await allPages.isChecked(),false);
   await allPages.check();
   const agCell=page.locator('#workspace .ag-cell[col-id="text"]')
     .filter({hasText:/^Last paragraph$/});
   await agCell.dblclick();
   const agInput=page.locator('#workspace .ag-cell-inline-editing input');
   await agInput.waitFor();
   await agInput.fill('Revised from AG');
   await agInput.press('Enter');
   await page.waitForFunction(()=>document.querySelector('.ocr-cm-source')?.ocrCmTable
     ?.mdRuntime()?.rows.find(r=>r.line_id==='md-e')?.text==='Revised from AG');
   assert((await view()).text.includes('Revised from AG'));
   assert.equal((await view()).md.rows.find(r=>r.line_id==='md-e').block_id,3);
   await page.locator('#global-save').click();
   await page.waitForFunction(()=>document.querySelector('.ocr-cm-source')?.ocrCmTable
     ?.mdRuntime()?.revision===2);
   assert.equal(saves,2);
   await page.reload({waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>document.querySelector(
     '#workspace select.ocr-source-file-select')?.value==='sql:md');
   assert((await view()).text.includes('Revised from AG'));
   assert.equal(mdInit,1);
   assert.equal(mdLoads,3);
   assert.deepEqual(errors,[]);
   console.log('LAB_OCR_MD_FULL_SOURCE_E2E_PASS',name,
     JSON.stringify({mdInit,mdLoads,saves,blocks,pdfs,revision,visits}));
  }finally{await browser.close();}
 }
}finally{vite.kill('SIGTERM');}
