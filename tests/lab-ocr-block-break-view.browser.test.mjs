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
  [441,'p9b3',null,3,8,'The stocks were refreshed on the basis of the latest'],
  [442,'p9b3s0',441,0,8,'13F, and the portfolio was rebalanced monthly.'],
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
  [9,441,raw[5][5]],[10,442,raw[6][5]],[11,442,''],
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
   let mdLoads=0,mdSaves=0,blockSaves=0,reviewWrites=0,reviewLoads=0,mdRevision=0;
   const savedReviews=new Map();
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
       body:makeLabOcrPdf(22)});
     if(op==='inspect')return json({status:'unchanged',blocks:7,pages:22,
       pdf:'test.pdf',sources:[{name:'fixture.json',pages:22}],mdSupported:true});
     if(op==='minerujson2block')return json({status:'ready',kind:'view',blocks:7});
     if(op==='rows')return json(u.searchParams.get('table')==='block'?
       {table:'block',total:7,rows:blocks}:{table:'minerujson',total:0,rows:[]});
     if(op==='block-edit-state')return json({revision:0,cursor:0,history:[],
       canUndo:false,canRedo:false});
     if(op==='md-state'){mdLoads++;return json({status:'ready',revision:mdRevision,
       rows:md,total:md.length});}
     if(op==='block-break-reviews'){
       reviewLoads++;
       return json({status:'ready',reviews:[...savedReviews.values()].map(item=>{
         const a=md.find(row=>row.line_id===item.before_line_id);
         const b=md.find(row=>row.line_id===item.after_line_id);
         if(a&&b&&b.text===''&&item.joinedText===a.text)
           return {...item,merged:true,split_offset:item.split_offset,merge_glue:item.merge_glue};
         return {...item,merged:false};
       })});
     }
     if(op==='block-break-review-set'){
       reviewWrites++;
       const body=req.postDataJSON();
       const issue_id=`block-break:${body.beforeBlockId}:${body.afterBlockId}`;
       const before=md.find(line=>line.line_id===body.beforeLineId);
       const after=md.find(line=>line.line_id===body.afterLineId);
       if(!before||!after||before.text!==body.beforeText||after.text!==body.afterText)
         return route.fulfill({status:422,contentType:'application/json',body:JSON.stringify({error:'证据失效'})});
       const prior=savedReviews.get(issue_id);
       if((prior?.decision??'待定')!==body.expectedDecision)
         return route.fulfill({status:422,contentType:'application/json',body:JSON.stringify({error:'并发状态冲突'})});
       if(body.decision==='待定')savedReviews.delete(issue_id);
       else {
         const split=body.beforeText.trimEnd().endsWith('-');
         const left=split?body.beforeText.trimEnd().slice(0,-1):body.beforeText.trimEnd();
         const glue=split?'':' ';
         savedReviews.set(issue_id,{issue_id,
           before_line_id:body.beforeLineId,after_line_id:body.afterLineId,
           decision:body.decision,joinedText:left+glue+body.afterText.trimStart(),
           split_offset:left.length,merge_glue:glue});
       }
       return json({status:'saved',issue_id,decision:body.decision});
     }
     if(op==='md-save'){
       mdSaves++;
       const body=req.postDataJSON();
       assert.equal(body.expectedRevision,mdRevision);
       const newRows=[...md.slice(0,body.start-1),
         ...body.insert.map(row=>({...row})),
         ...md.slice(body.start-1+body.deleteCount)];
       md.splice(0,md.length,...newRows.map((row,index)=>({...row,line_no:index+1})));
       mdRevision++;
       return json({status:'saved',revision:mdRevision,total:md.length});
     }
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
   assert.deepEqual(cols.slice(0,3),['pbs','join_preview','before_pbs']);
   assert(cols.includes('review'),'The pinned-right review column exists even outside horizontal scroll');
   assert(cols.includes('join_preview')&&cols.includes('reason'));
   assert.equal(reviewLoads,1,'Open break View reads review state once');
   assert.equal(await page.locator('.ocr-ag-all-pages input').isChecked(),true);
   const count=()=>page.locator('.ocr-outline-grid .ag-row:not(.ag-opacity-zero)').count();
   await page.waitForFunction(()=>document.querySelectorAll(
     '.ocr-outline-grid .ag-row:not(.ag-opacity-zero)').length===3,null,{timeout:12000}).catch(async err=>{
     console.error('WEBKIT_BLOCK_BREAK_ROWS_DIAG',name,JSON.stringify({
       status:await page.locator('#status').textContent(),errors,
       count:await count(),
       rows:await page.evaluate(()=>({
         displayed:document.querySelector('.ocr-outline-grid')?.ocrSqlGrid?.columnFields(),
         rowIds:[...document.querySelectorAll('.ocr-outline-grid .ag-row')].map(x=>x.dataset.rowId),
         md:document.querySelector('.ocr-cm-source')?.ocrCmTable?.mdRuntime()?.rows.length,
       }))}));throw err;
   });
   assert.equal(await count(),3,'Three within-parent seams include latest / 13F');
   assert.equal(await page.locator('.ocr-outline-grid .ocr-break-review-trigger').count(),3);
   await page.waitForFunction(()=>document.querySelectorAll('.ocr-outline-grid .ag-row .ocr-block-break-ag-join').length===3);
   // Reuse AG page checkbox (no second view filter implementation).
   await page.locator('.ocr-ag-all-pages input').uncheck();
   await page.waitForFunction(()=>document.querySelectorAll(
     '.ocr-outline-grid .ag-row:not(.ag-opacity-zero)').length===1);
   await page.locator('.ocr-ag-all-pages input').check();
   await page.waitForFunction(()=>document.querySelectorAll(
     '.ocr-outline-grid .ag-row:not(.ag-opacity-zero)').length===3);
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
   // User correction: A/B joined-color preview must be inside AG, not the
   // Markdown / PDF pane. Keep only regular Markdown highlighting there.
   await page.waitForFunction(()=>
     document.querySelector('.ocr-cm-source .ocr-block-break-source-before')?.textContent==='steady'&&
     document.querySelector('.ocr-cm-source .ocr-block-break-source-after')?.textContent==='source');
   await page.waitForFunction(()=>{
     const selected=document.querySelector('.ocr-outline-grid .ag-row-selected');
     return selected?.querySelector('.ocr-block-break-ag-before-token')?.textContent==='steady'&&
       selected?.querySelector('.ocr-block-break-ag-after-token')?.textContent==='source';
   });
   assert.equal(await page.locator('.ocr-preview-pane .ocr-review-pair-card').count(),0);
   assert.equal(await page.locator('.ocr-preview-md-scroll [data-ocr-review-pair]').count(),0);
   const agJoin=await page.locator('.ocr-outline-grid .ag-row-selected .ocr-block-break-ag-join').textContent();
   assert(agJoin.includes('steady source of financing'),
     'AG, not Markdown preview, hosts continuous A/B color preview');
   // The first seam spans physical PDF pages 1 → 2 but stays in logical p1b4.
   await page.waitForFunction(()=>['436','437'].every(id=>[...document.querySelectorAll(
     '.lab-ocr-pdf-pbs-tag[data-review-pair-side]')]
       .some(el=>el.dataset.blockId===id)),null,{timeout:12000});
   const marks=await page.evaluate(()=>({
     before:document.querySelector('.ocr-block-break-source-before')?.textContent,
     after:document.querySelector('.ocr-block-break-source-after')?.textContent,
     side436:document.querySelector('.lab-ocr-pdf-pbs-tag[data-block-id="436"]')?.dataset.reviewPairSide,
     side437:document.querySelector('.lab-ocr-pdf-pbs-tag[data-block-id="437"]')?.dataset.reviewPairSide,
     agJoined:document.querySelector('.ocr-outline-grid .ag-row-selected .ocr-block-break-ag-join')?.textContent,
     source:document.querySelector('.ocr-cm-source')?.ocrCmTable?.mdDocument(),
   }));
   assert.equal(marks.before,'steady');assert.equal(marks.after,'source');
   assert.equal(marks.side436,'before');assert.equal(marks.side437,'after');
   assert.deepEqual(await page.evaluate(()=>['436','437'].map(id=>{
     const tag=document.querySelector(`.lab-ocr-pdf-pbs-tag[data-block-id="${id}"]`);
     return Number(tag?.closest('.page[data-page-number]')?.dataset.pageNumber);
   })),[1,2],'Cross-page pair uses physical PDF pages without mutating logical PBS');
   assert(marks.agJoined.includes('steady source'));
   assert.equal(marks.source,original);
   // WP3 review-only choices: ignore and pending persist without any MD save.
   let trigger=page.locator('.ocr-outline-grid .ag-row-selected .ocr-break-review-trigger');
   await trigger.click();
   const choices=page.locator('body > .ocr-break-review-menu .ocr-break-review-option');
   await choices.first().waitFor();
   assert.deepEqual(await choices.allTextContents(),['待定','断块合并','忽略']);
   const palette=await choices.evaluateAll(nodes=>nodes.map(node=>getComputedStyle(node).backgroundColor));
   assert.equal(new Set(palette).size,3);
   await choices.nth(2).click();
   await page.waitForFunction(()=>document.querySelector('.ocr-outline-grid .ag-row-selected .ocr-break-review-trigger')
     ?.dataset.review==='忽略');
   assert.equal(reviewWrites,1);
   assert.equal(await page.evaluate(()=>document.querySelector('.ocr-cm-source')?.ocrCmTable?.mdDocument()),original);
   await picker.selectOption('md');
   await page.waitForFunction(()=>document.querySelector('#workspace .ag-header-cell[col-id="text"]'));
   await picker.selectOption('block-break');
   await page.waitForFunction(()=>document.querySelector('.ocr-outline-grid')?.ocrSqlGrid?.columnFields()?.includes('review'));
   const ignored=await page.evaluate(()=>document.querySelector('.ocr-outline-grid')
     ?.ocrSqlGrid?.selectById({field:'line_id',id:'break-md-2',focusColumn:'review'}));
   assert.equal(ignored?.review,'忽略');
   await page.locator('.ocr-outline-grid .ag-row-selected .ocr-break-review-trigger').click();
   await page.locator('body > .ocr-break-review-menu .ocr-break-review-option[data-review="待定"]').click();
   await page.waitForFunction(()=>document.querySelector('.ocr-outline-grid .ag-row-selected .ocr-break-review-trigger')
     ?.dataset.review==='待定');
   assert.equal(reviewWrites,2);assert.equal(savedReviews.size,0);
   assert.equal(mdSaves,0,'Ignore/pending only write review, not MD');
   assert.equal(blockSaves,0);

   // A second candidate on the next PDF page must replace, not stack,
   // A/B marks; the shared PDF.js viewer retains page-scoped geometry.
   const second=await page.evaluate(()=>document.querySelector('.ocr-outline-grid')
     ?.ocrSqlGrid?.selectById({field:'line_id',id:'break-md-7',focusColumn:'join_preview'}));
   assert(second&&second.issue_id==='block-break:439:440');
   await page.locator('.ocr-outline-grid .ag-row-selected .ag-cell[col-id="pbs"]').click();
   await page.waitForFunction(()=>
     document.querySelector('.ocr-cm-source .ocr-block-break-source-before')?.textContent==='second'&&
     document.querySelector('.ocr-cm-source .ocr-block-break-source-after')?.textContent==='example');
   await page.waitForFunction(()=>['439','440'].every(id=>[...document.querySelectorAll(
     '.lab-ocr-pdf-pbs-tag[data-review-pair-side]')]
       .some(el=>el.dataset.blockId===id)),null,{timeout:12000});
   assert.equal(await page.locator('.ocr-review-pair-card').count(),0,
     'Markdown preview must not contain continuation cards');
   assert.equal(await page.locator('.ocr-outline-grid .ag-row-selected .ocr-block-break-ag-before-token').textContent(),'second');
   assert.equal(await page.locator('.ocr-cm-source .ocr-block-break-source-before').count(),1);
   // Changing zoom repaints original page overlays but retains both sides.
   await page.locator('.lab-ocr-pdf-scale').selectOption('125');
   await page.waitForFunction(()=>['439','440'].every(id=>[...document.querySelectorAll(
     '.lab-ocr-pdf-pbs-tag[data-review-pair-side]')]
       .some(el=>el.dataset.blockId===id)),null,{timeout:12000});
   // Real WCP43 missing case: numeric+uppercase opening token '13F'.
   const filing=await page.evaluate(()=>document.querySelector('.ocr-outline-grid')
     ?.ocrSqlGrid?.selectById({field:'line_id',id:'break-md-10',focusColumn:'pbs'}));
   assert(filing&&filing.issue_id==='block-break:441:442'&&
     filing.boundary==='latest / 13F');
   await page.locator('.ocr-outline-grid .ag-row-selected .ag-cell[col-id="pbs"]').click();
   await page.waitForFunction(()=>
     document.querySelector('.ocr-cm-source .ocr-block-break-source-before')?.textContent==='latest'&&
     document.querySelector('.ocr-cm-source .ocr-block-break-source-after')?.textContent==='13F',
     null,{timeout:10000});
   await page.waitForFunction(()=>{
     const selected=document.querySelector('.ocr-outline-grid .ag-row-selected');
     return selected?.querySelector('.ocr-block-break-ag-before-token')?.textContent==='latest'&&
       selected?.querySelector('.ocr-block-break-ag-after-token')?.textContent==='13F';
   });
   assert.equal(await page.locator('.ocr-outline-grid .ag-row-selected .ocr-block-break-ag-after-token')
     .textContent(),'13F');
   assert.equal(await page.locator('.ocr-review-pair-card').count(),0);
   await page.waitForFunction(()=>['441','442'].every(id=>[...document.querySelectorAll(
     '.lab-ocr-pdf-pbs-tag[data-review-pair-side]')]
       .some(el=>el.dataset.blockId===id)),null,{timeout:12000});
   if(!process.env.LAB_OCR_SKIP_PDF_16){
   // iPad screenshot regression: the unsplit "PDF 原文" mode on page 16/22
   // must show a REAL PDF.js canvas and its text, not a blank dark pane.
   const split=page.locator('.ocr-preview-split-toggle input');
   await split.uncheck();
   await page.locator('.ocr-preview-mode').selectOption('pdf');
   await page.locator('.lab-ocr-pdf-page').fill('16');
   await page.locator('.lab-ocr-pdf-page').dispatchEvent('change');
   await page.waitForFunction(()=>document.querySelector('.lab-ocr-pdf-page')?.value==='16');
   await page.waitForFunction(()=>{
     const pane=document.querySelector('.ocr-preview-pane');
     const paper=pane?.querySelector('.lab-ocr-pdf-scroller .page[data-page-number="16"]');
     const canvas=paper?.querySelector('canvas');
     const scroller=pane?.querySelector('.lab-ocr-pdf-scroller');
     if(!canvas||!scroller||!paper)return false;
     const bounds=canvas.getBoundingClientRect(),view=scroller.getBoundingClientRect();
     return canvas.width>20&&canvas.height>20&&bounds.width>20&&bounds.height>20&&
       bounds.top<view.bottom&&bounds.bottom>view.top&&view.height>100;
   },null,{timeout:18000});
   const pdfState=await page.evaluate(()=>{
     const pane=document.querySelector('.ocr-preview-pane');
     const canvas=pane?.querySelector('.lab-ocr-pdf-scroller .page[data-page-number="16"] canvas');
     return {mode:pane?.dataset.previewMode,grid:getComputedStyle(pane).gridTemplateRows,
       canvasWidth:canvas?.width,canvasHeight:canvas?.height,
       text:pane?.querySelector('.lab-ocr-pdf-scroller .page[data-page-number="16"] .textLayer')?.textContent,
       nonWhitePixels:(()=>{if(!canvas)return -1;const c=canvas.getContext('2d',{willReadFrequently:true});
         if(!c)return -1;const pixels=c.getImageData(0,0,canvas.width,canvas.height).data;
         let count=0;for(let y=0;y<canvas.height;y+=5)for(let x=0;x<canvas.width;x+=5){
           const i=(y*canvas.width+x)*4;if(pixels[i]+pixels[i+1]+pixels[i+2]<700)count++;}
         return count;})(),
       pairCardCount:pane?.querySelectorAll('.ocr-review-pair-card').length,
       staleThirdRow:pane?.classList.contains('ocr-review-pair-visible')};
   });
   assert.equal(pdfState.mode,'pdf');
   assert.equal(pdfState.pairCardCount,0);
   assert.equal(pdfState.staleThirdRow,false);
   assert(pdfState.canvasWidth>20&&pdfState.canvasHeight>20);
   assert(pdfState.nonWhitePixels>10,
     'The Safari page 16 canvas must contain actually painted PDF text, not a blank canvas: '+JSON.stringify(pdfState));
   if(pdfState.text!==undefined)assert(pdfState.text.includes('OCR Lab PDF page 16'));
   await page.locator('.ocr-preview-mode').selectOption('md');
   await split.check();


   }
   await picker.selectOption('md');
   await page.waitForFunction(()=>document.querySelector('#workspace .ag-header-cell[col-id="text"]'));
   await page.waitForFunction(()=>!document.querySelector('.ocr-cm-source .ocr-block-break-source-before')&&
     !document.querySelector('.lab-ocr-pdf-pbs-tag[data-review-pair-side]'));

   await picker.selectOption('block-break');
   await page.waitForFunction(()=>document.querySelectorAll(
     '.ocr-outline-grid .ag-row:not(.ag-opacity-zero)').length===3);
   // Return to a candidate and simulate an ordinary source text edit. CM6
   // clears its own Decoration during docChanged, while workflow clears
   // derived PDF/preview marks WITHOUT nested CodeMirror transactions.
   await page.evaluate(()=>document.querySelector('.ocr-outline-grid')
     ?.ocrSqlGrid?.selectById({field:'line_id',id:'break-md-2',focusColumn:'pbs'}));
   await page.locator('.ocr-outline-grid .ag-row-selected .ag-cell[col-id="pbs"]').click();
   await page.waitForFunction(()=>Boolean(document.querySelector('.ocr-cm-source .ocr-block-break-source-before')));
   const editCleared=await page.evaluate(()=>{
     const editor=document.querySelector('.ocr-cm-source')?.ocrCmTable?.editorView();
     if(!editor)return false;
     const from=editor.state.doc.toString().indexOf('steady');
     if(from<0)return false;
     editor.dispatch({changes:{from,to:from+6,insert:'Steady'}});
     const cleared=!document.querySelector('.ocr-cm-source .ocr-block-break-source-before')&&
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
   // WCP43 actual merge: one CM6 change joins A+B and leaves B's stable
   // LineID/BlockID on a blank physical row. Preview and PDF derive from it.
   await page.evaluate(()=>document.querySelector('.ocr-outline-grid')
     ?.ocrSqlGrid?.selectById({field:'line_id',id:'break-md-2',focusColumn:'review'}));
   await page.locator('.ocr-outline-grid .ag-row-selected .ocr-break-review-trigger').click();
   await page.locator('body > .ocr-break-review-menu .ocr-break-review-option[data-review="断块合并"]').click();
   await page.waitForFunction(()=>{
     const runtime=document.querySelector('.ocr-cm-source')?.ocrCmTable?.mdRuntime();
     const a=runtime?.rows.find(row=>row.line_id==='break-md-1');
     const b=runtime?.rows.find(row=>row.line_id==='break-md-2');
     return a?.text.endsWith('steady source of financing that allows his investment strategy.')&&
       b?.text===''&&b?.block_id===437;
   },null,{timeout:13000});
   await page.waitForFunction(()=>[...document.querySelectorAll('.lab-ocr-pdf-pbs-tag')]
     .some(node=>node.dataset.blockId==='437'&&node.dataset.mdEmpty==='true'),
     null,{timeout:12000});
   await page.waitForFunction(()=>[...document.querySelectorAll('.lab-ocr-pdf-overlay-box')]
     .some(node=>node.dataset.mdEmpty==='true'&&node.dataset.blockIds?.split(' ').includes('437')),
     null,{timeout:12000});
   const dashed=await page.evaluate(()=>({
     tag:getComputedStyle(document.querySelector('.lab-ocr-pdf-pbs-tag[data-block-id="437"]')).borderTopStyle,
     bbox:getComputedStyle([...document.querySelectorAll('.lab-ocr-pdf-overlay-box')]
       .find(node=>node.dataset.blockIds?.split(' ').includes('437'))).borderTopStyle,
     originalSourceEmpty:document.querySelector('.lab-ocr-pdf-pbs-tag[data-block-id="437"]')?.dataset.sourceEmpty,
   }));
   assert.equal(dashed.tag,'dashed');
   assert.equal(dashed.bbox,'dashed');
   assert.equal(dashed.originalSourceEmpty,'false','Editable MD must not falsify OCR sourceEmpty');
   await page.waitForFunction(()=>document.querySelector('.ocr-outline-grid .ocr-break-review-trigger[data-review="断块合并"]')?.disabled===true);
   await page.waitForFunction(()=>{
     const text=document.querySelector('.ocr-preview-md-scroll')?.textContent;
     return text?.includes('steady source of financing')&&!text?.includes('steady\nsource');
   },null,{timeout:13000});
   await page.waitForTimeout(400);
   assert.equal(mdSaves,1,'Real merge uses exactly one existing CM6 md-save splice');
   assert.equal(blockSaves,0,'Real merge does not rewrite Block relations');
   assert.equal(md.find(row=>row.line_id==='break-md-2')?.text,'');
   assert.equal(md.find(row=>row.line_id==='break-md-2')?.block_id,437);
   // SQLite-reloaded AG decision must still recognize the merged result.
   await picker.selectOption('md');
   await page.waitForFunction(()=>document.querySelector('.ocr-outline-grid')?.ocrSqlGrid?.columnFields()?.includes('text'));
   await picker.selectOption('block-break');
   await page.waitForFunction(()=>document.querySelector('.ocr-outline-grid .ocr-break-review-trigger[data-review="断块合并"]')?.disabled===true);
   // One Undo restores both source lines and eliminates the PDF empty marker.
   const undone=await page.evaluate(()=>document.querySelector('.ocr-cm-source')?.ocrCmTable?.undoMarkdown());
   assert(undone,'One CM6 Undo must restore both sides');
   await page.waitForFunction(()=>{
     const runtime=document.querySelector('.ocr-cm-source')?.ocrCmTable?.mdRuntime();
     return runtime?.rows.find(row=>row.line_id==='break-md-1')?.text.endsWith('steady')&&
       runtime?.rows.find(row=>row.line_id==='break-md-2')?.text.startsWith('source of financing')&&
       !document.querySelector('.lab-ocr-pdf-pbs-tag[data-block-id="437"][data-md-empty="true"]');
   });
   const redone=await page.evaluate(()=>document.querySelector('.ocr-cm-source')?.ocrCmTable?.redoMarkdown());
   assert(redone,'One CM6 Redo reapplies the same merge');
   await page.waitForFunction(()=>{
     const runtime=document.querySelector('.ocr-cm-source')?.ocrCmTable?.mdRuntime();
     return runtime?.rows.find(row=>row.line_id==='break-md-2')?.text===''&&
       !!document.querySelector('.lab-ocr-pdf-pbs-tag[data-block-id="437"][data-md-empty="true"]');
   });
   assert.deepEqual(errors,[],'Browser runtime should have no errors');
   console.log('LAB_OCR_BLOCK_BREAK_BROWSER_PASS',name);
  }finally{await browser.close();}
 }
}finally{vite.kill('SIGTERM');}
