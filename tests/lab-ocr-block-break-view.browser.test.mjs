/** WP1: actual AG block-break view, CM6 focus, page filter and no writes.
 * Isolated Vite + mocked OCR API, with no access to any real book database.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {chromium,webkit} from 'playwright';
import {makeLabOcrPdf} from './helpers/lab-ocr-pdf-fixture.mjs';
const port=5407,book='/isolated/wcp43-block-break';
const url=`http://127.0.0.1:${port}/labs/lab-ocr/`;
const vite=spawn('node',['node_modules/vite/bin/vite.js','--config',
  'labs/lab-ocr/vite.config.mjs','--host','127.0.0.1',
  '--port',String(port),'--strictPort'],{stdio:['ignore','pipe','pipe']});
let log='';vite.stdout.on('data',x=>log+=x);vite.stderr.on('data',x=>log+=x);
const raw=[
  [436,'p1b4',null,4,0,'We then asked why the structure provides a steady'],
  [437,'p1b4s0',436,0,1,'source of financing that allows his investment strategy.'],
  [438,'p1b5',null,5,0,'Another paragraph entirely.'],
  [439,'p2b1',null,1,1,'The pattern permits a second'],
  [440,'p2b1s0',439,0,1,'example showing a split phrase.'],
];
const blocks=raw.map(([block_id,pbs,parent_block_id,sibling_order,global_page,text])=>({
  block_id,pbs,parent_block_id,sibling_order,global_page,block_type:'text',
  block_group:'para_blocks',absorbed_into_block_id:null,
  source_name:'fixture.json',source_block_key:'sample:'+block_id,
  block_path:'source:'+block_id,
  block_json:JSON.stringify({type:'text',lines:[{spans:[{type:'text',content:text}]}]}),
  block_bbox_json:'[40,70,420,145]',content_preview:text,
  line_count:1,span_count:1,span_types:'text',page_size_json:'[595,842]',
}));
const md=[
  [1,436,raw[0][5]],[2,437,raw[1][5]],[3,437,''],
  [4,438,raw[2][5]],[5,438,''],[6,439,raw[3][5]],
  [7,440,raw[4][5]],[8,440,''],
].map(([line_no,block_id,text])=>({line_no,line_id:'break-md-'+line_no,
  block_id,text}));
try{
 let up=false;
 for(let i=0;i<120;i++){
   try{if((await fetch(url)).ok){up=true;break;}}catch{}
   await sleep(160);
 }
 assert(up,'Vite failed '+log.slice(-500));
 for(const [name,engine] of [['Chromium',chromium],['iPad-WebKit',webkit]]
   .filter(([name])=>!process.env.LAB_OCR_TEST_BROWSER||name===process.env.LAB_OCR_TEST_BROWSER)){
  const browser=await engine.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:{width:1250,height:900},hasTouch:true});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   let mdLoads=0,mdSaves=0,blockSaves=0;
   await page.addInitScript(({book})=>localStorage.setItem(
     'ocr2md.lab-ocr.settings.json.v1',JSON.stringify({settings:{
       'workspace.dataDirectory':{key:'dataDirectory',category1:'工作区',
         category2:'目录',comment:'isolated block-break test',value:book,
         range:{kind:'server-directory'}}}})),{book});
   await page.route('**/labs/lab-ocr/api/ocr/**',async route=>{
     const req=route.request(),u=new URL(req.url()),op=u.pathname.split('/').at(-1);
     const json=obj=>route.fulfill({status:200,contentType:'application/json',
       body:JSON.stringify(obj)});
     if(op==='pdf')return route.fulfill({status:200,contentType:'application/pdf',
       body:makeLabOcrPdf(2)});
     if(op==='inspect')return json({status:'unchanged',blocks:5,pages:2,
       pdf:'test.pdf',sources:[{name:'fixture.json',pages:2}],mdSupported:true});
     if(op==='minerujson2block')return json({status:'ready',kind:'view',blocks:5});
     if(op==='rows')return json(u.searchParams.get('table')==='block'?
       {table:'block',total:5,rows:blocks}:{table:'minerujson',total:0,rows:[]});
     if(op==='block-edit-state')return json({revision:0,cursor:0,history:[],
       canUndo:false,canRedo:false});
     if(op==='md-state'){mdLoads++;return json({status:'ready',revision:0,
       rows:md,total:md.length});}
     if(op==='md-save'){mdSaves++;return json({status:'blocked'});}
     if(op==='block-edit-batch'){blockSaves++;return json({status:'blocked'});}
     if(op==='overlays'){
       const pageNo=Number(u.searchParams.get('page'));
       return json({page:pageNo,level:u.searchParams.get('level'),pageSize:[595,842],
         boxes:blocks.filter(b=>b.global_page===pageNo-1).map(b=>({
           id:String(b.block_id),blockId:String(b.block_id),pbs:b.pbs,
           parentBlockId:b.parent_block_id===null?null:String(b.parent_block_id),
           blockGroup:'para_blocks',blockType:'text',bbox:[40,70,420,145],
           sourceEmpty:false}))});
     }
     throw Error('Unexpected OCR API '+op);
   });
   await page.goto(url,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>document.querySelector(
     '#workspace select.ocr-source-file-select')?.value==='sql:md',null,{timeout:18000});
   const picker=page.locator('.ocr-outline-pane .ocr-ag-module-select');
   assert.deepEqual(await picker.locator('option').allTextContents(),
     ['MD 行','标题','LaTeX','断块']);
   const original=await page.evaluate(()=>document.querySelector('.ocr-cm-source')
     ?.ocrCmTable?.mdDocument());
   await picker.selectOption('block-break');
   await page.waitForFunction(()=>document.querySelector('#workspace .ag-header-cell[col-id="after_pbs"]'),null,{timeout:7000}).catch(async err=>{
     console.error('WP2_VIEW_FAIL',name,JSON.stringify({errors,status:await page.locator('#status').textContent(),
       grid:await page.evaluate(()=>document.querySelector('.ocr-outline-grid')?.ocrSqlGrid?.columnFields()),
       picker:await picker.inputValue()}));throw err;
   });
   const cols=await page.evaluate(()=>document.querySelector('.ocr-outline-grid')
     ?.ocrSqlGrid?.columnFields());
   assert.deepEqual(cols.slice(0,6),
     ['pbs','before_pbs','after_pbs','before_line_no','line_no','kind']);
   assert(cols.includes('join_preview')&&cols.includes('reason'));
   assert.equal(await page.locator('.ocr-ag-all-pages input').isChecked(),true);
   const count=()=>page.locator('.ocr-outline-grid .ag-row:not(.ag-opacity-zero)').count();
   await page.waitForFunction(()=>document.querySelectorAll(
     '.ocr-outline-grid .ag-row:not(.ag-opacity-zero)').length===2);
   assert.equal(await count(),2,'Only two within-parent seams');
   // Reuse AG page checkbox (no second view filter implementation).
   await page.locator('.ocr-ag-all-pages input').uncheck();
   await page.waitForFunction(()=>document.querySelectorAll(
     '.ocr-outline-grid .ag-row:not(.ag-opacity-zero)').length===1);
   await page.locator('.ocr-ag-all-pages input').check();
   await page.waitForFunction(()=>document.querySelectorAll(
     '.ocr-outline-grid .ag-row:not(.ag-opacity-zero)').length===2);
   const picked=await page.evaluate(()=>document.querySelector('.ocr-outline-grid')
     ?.ocrSqlGrid?.selectById({field:'line_id',id:'break-md-2',focusColumn:'pbs'}));
   assert(picked&&picked.issue_id==='block-break:436:437');
   await page.locator('.ocr-outline-grid .ag-row-selected .ag-cell[col-id="pbs"]').click();
   await page.waitForFunction(()=>document.querySelector('.ocr-cm-source')
     ?.ocrCmTable?.selected()==='break-md-2',null,{timeout:10000});
   await page.waitForFunction(()=>[...document.querySelectorAll(
     '.ocr-cm-source .cm-line.ocr-four-pane-source-active')]
       .some(el=>el.textContent.includes('source of financing')),null,{timeout:10000});
   await page.waitForFunction(()=>[...document.querySelectorAll(
     '.lab-ocr-pdf-pbs-tag[data-selected="true"]')]
       .some(el=>el.dataset.blockId==='437'),null,{timeout:10000});
   // WP2: source marks exact boundary tokens, the actual Markdown DOM
   // receives pair provenance, and the derived card lets users read across
   // the source split without writing any Markdown or PDF geometry.
   await page.waitForFunction(()=>
     document.querySelector('.ocr-cm-source .ocr-block-break-source-before')?.textContent==='steady'&&
     document.querySelector('.ocr-cm-source .ocr-block-break-source-after')?.textContent==='source');
   await page.waitForFunction(()=>document.querySelector('.ocr-review-pair-card')
     ?.textContent.includes('steady source of financing'));
   await page.waitForFunction(()=>document.querySelector(
     '.ocr-preview-md-scroll [data-ocr-review-pair]'));
   // The first seam spans physical PDF pages 1 → 2 but stays in logical p1b4.
   await page.waitForFunction(()=>['436','437'].every(id=>[...document.querySelectorAll(
     '.lab-ocr-pdf-pbs-tag[data-review-pair-side]')]
       .some(el=>el.dataset.blockId===id)),null,{timeout:12000});
   const marks=await page.evaluate(()=>({
     before:document.querySelector('.ocr-block-break-source-before')?.textContent,
     after:document.querySelector('.ocr-block-break-source-after')?.textContent,
     side436:document.querySelector('.lab-ocr-pdf-pbs-tag[data-block-id="436"]')?.dataset.reviewPairSide,
     side437:document.querySelector('.lab-ocr-pdf-pbs-tag[data-block-id="437"]')?.dataset.reviewPairSide,
     card:document.querySelector('.ocr-review-pair-card')?.textContent,
     source:document.querySelector('.ocr-cm-source')?.ocrCmTable?.mdDocument(),
   }));
   assert.equal(marks.before,'steady');assert.equal(marks.after,'source');
   assert.equal(marks.side436,'before');assert.equal(marks.side437,'after');
   assert.deepEqual(await page.evaluate(()=>['436','437'].map(id=>{
     const tag=document.querySelector(`.lab-ocr-pdf-pbs-tag[data-block-id="${id}"]`);
     return Number(tag?.closest('.page[data-page-number]')?.dataset.pageNumber);
   })),[1,2],'Cross-page pair uses physical PDF pages without mutating logical PBS');
   assert(marks.card.includes('steady source'));
   assert.equal(marks.source,original);
   assert.equal((await page.locator('#status').textContent()).includes('断块'),true);

   // A second candidate on the next PDF page must replace, not stack,
   // A/B marks; the shared PDF.js viewer retains page-scoped geometry.
   const second=await page.evaluate(()=>document.querySelector('.ocr-outline-grid')
     ?.ocrSqlGrid?.selectById({field:'line_id',id:'break-md-7',focusColumn:'pbs'}));
   assert(second&&second.issue_id==='block-break:439:440');
   await page.locator('.ocr-outline-grid .ag-row-selected .ag-cell[col-id="pbs"]').click();
   await page.waitForFunction(()=>
     document.querySelector('.ocr-cm-source .ocr-block-break-source-before')?.textContent==='second'&&
     document.querySelector('.ocr-cm-source .ocr-block-break-source-after')?.textContent==='example');
   await page.waitForFunction(()=>['439','440'].every(id=>[...document.querySelectorAll(
     '.lab-ocr-pdf-pbs-tag[data-review-pair-side]')]
       .some(el=>el.dataset.blockId===id)),null,{timeout:12000});
   assert.equal(await page.locator('.ocr-review-pair-card').count(),1,
     'Selection never appends stale review cards');
   assert.equal(await page.locator('.ocr-cm-source .ocr-block-break-source-before').count(),1);
   // Changing zoom repaints original page overlays but retains both sides.
   await page.locator('.lab-ocr-pdf-scale').selectOption('125');
   await page.waitForFunction(()=>['439','440'].every(id=>[...document.querySelectorAll(
     '.lab-ocr-pdf-pbs-tag[data-review-pair-side]')]
       .some(el=>el.dataset.blockId===id)),null,{timeout:12000});

   await picker.selectOption('md');
   await page.waitForFunction(()=>document.querySelector('#workspace .ag-header-cell[col-id="text"]'));
   await page.waitForFunction(()=>!document.querySelector('.ocr-review-pair-card')&&
     !document.querySelector('.ocr-cm-source .ocr-block-break-source-before')&&
     !document.querySelector('.lab-ocr-pdf-pbs-tag[data-review-pair-side]'));

   await picker.selectOption('block-break');
   await page.waitForFunction(()=>document.querySelectorAll(
     '.ocr-outline-grid .ag-row:not(.ag-opacity-zero)').length===2);
   // Return to a candidate and simulate an ordinary source text edit. CM6
   // clears its own Decoration during docChanged, while workflow clears
   // derived PDF/preview marks WITHOUT nested CodeMirror transactions.
   await page.evaluate(()=>document.querySelector('.ocr-outline-grid')
     ?.ocrSqlGrid?.selectById({field:'line_id',id:'break-md-2',focusColumn:'pbs'}));
   await page.locator('.ocr-outline-grid .ag-row-selected .ag-cell[col-id="pbs"]').click();
   await page.waitForFunction(()=>Boolean(document.querySelector('.ocr-review-pair-card')));
   const editCleared=await page.evaluate(()=>{
     const editor=document.querySelector('.ocr-cm-source')?.ocrCmTable?.editorView();
     if(!editor)return false;
     const from=editor.state.doc.toString().indexOf('steady');
     if(from<0)return false;
     editor.dispatch({changes:{from,to:from+6,insert:'Steady'}});
     const cleared=!document.querySelector('.ocr-review-pair-card')&&
       !document.querySelector('.ocr-cm-source .ocr-block-break-source-before')&&
       !document.querySelector('.lab-ocr-pdf-pbs-tag[data-review-pair-side]');
     editor.dispatch({changes:{from,to:from+6,insert:'steady'}});
     return cleared;
   });
   assert(editCleared,'Changing source text clears stale pair without nested CM6 dispatch');
   await page.waitForTimeout(1350);
   assert.equal(mdSaves,0,'Transient review and no-op edit/revert must not persist SQL');
   assert.equal(await page.evaluate(()=>document.querySelector('.ocr-cm-source')
     ?.ocrCmTable?.mdDocument()),original,'View never changes Markdown');
   assert.equal(mdLoads,1,'Switching AG view never reopens MD SQL');
   assert.equal(mdSaves,0,'Read-only view never saves Markdown');
   assert.equal(blockSaves,0,'Read-only view never edits block structure');
   assert.deepEqual(errors,[],'Browser runtime should have no errors');
   console.log('LAB_OCR_BLOCK_BREAK_BROWSER_PASS',name);
  }finally{await browser.close();}
 }
}finally{vite.kill('SIGTERM');}
