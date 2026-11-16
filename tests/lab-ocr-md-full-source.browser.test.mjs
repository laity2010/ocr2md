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
 [3,'p2b0',null,0,1,'title',3,'Last paragraph'],
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
   // Four-pane semantic navigation: each user origin drives the other three
   // through one stable ID event. Selection, page and persistent orange marks.
   const synchronized=async(blockId,lineId,sourceLine)=>{
     await page.waitForFunction(({blockId,lineId,sourceLine})=>{
       const picked=document.querySelector('.ocr-cm-source')?.ocrCmTable?.selected();
       const source=[...document.querySelectorAll('.ocr-cm-source .cm-line.ocr-four-pane-source-active')]
         .some(el=>el.textContent.includes(sourceLine));
       const preview=[...document.querySelectorAll('.ocr-preview-md-scroll [data-ocr-sync-selected="true"]')]
         .some(el=>el.textContent.includes(sourceLine.replace(/^#{1,6}\s+/,'')));
       const pdf=[...document.querySelectorAll('.lab-ocr-pdf-pbs-tag[data-selected="true"]')]
         .some(el=>el.dataset.blockId===String(blockId));
       return picked===lineId&&source&&preview&&pdf;
     },{blockId,lineId,sourceLine},{timeout:12000}).catch(async error=>{
       console.error('FOUR_PANE_SYNC_DIAG',name,JSON.stringify(await page.evaluate(()=>({
         selected:document.querySelector('.ocr-cm-source')?.ocrCmTable?.selected(),
         source:[...document.querySelectorAll('.ocr-cm-source .cm-line.ocr-four-pane-source-active')].map(n=>n.textContent),
         preview:[...document.querySelectorAll('.ocr-preview-md-scroll [data-ocr-sync-selected="true"]')].map(n=>n.textContent),
         pdf:[...document.querySelectorAll('.lab-ocr-pdf-pbs-tag[data-selected="true"]')].map(n=>n.dataset.blockId),
         pdfPages:[...document.querySelectorAll('.lab-ocr-pdf-pbs-tag')].map(n=>n.dataset.blockId),
         ag:[...document.querySelectorAll('.ag-row:not(.ag-opacity-zero) .ag-cell[col-id="line_no"]')].map(n=>n.textContent),
         previewMode:document.querySelector('.ocr-preview-pane')?.dataset.previewMode,
         status:document.querySelector('#status')?.textContent,
       }))));throw error;
     });
   };
   // Check the rendered CSS, not merely the four semantic selection flags.
   // All direct focus targets must have identical gold edge and amber fill,
   // including AG Grid's native row selection and actual PDF box geometry.
   const assertUnifiedFocus=async()=>{
     await page.waitForFunction(()=>Boolean(document.querySelector(
       '#workspace .ag-row-selected:not(.ag-opacity-zero)')),{},{timeout:6000});
     const styles=await page.evaluate(()=>{
       const el=selector=>document.querySelector(selector);
       const style=selector=>{
         const node=el(selector);
         if(!node)return null;
         const css=getComputedStyle(node);
         return {background:css.backgroundColor,outline:css.outlineColor,
           outlineWidth:css.outlineWidth,outlineStyle:css.outlineStyle,
           boxShadow:css.boxShadow,opacity:css.opacity};
       };
       return {
         root:el('#workspace')?.classList.contains('ocr-review-focus-unified'),
         ag:style('#workspace .ag-row-selected:not(.ag-opacity-zero)'),
         cm:style('#workspace .cm-line.ocr-four-pane-source-active'),
         md:style('#workspace .ocr-preview-md-scroll [data-ocr-sync-selected="true"]'),
         pdf:style('#workspace .lab-ocr-pdf-overlay-box[data-selected="true"]'),
         label:style('#workspace .lab-ocr-pdf-pbs-tag[data-selected="true"]'),
         layer:style('#workspace .lab-ocr-pdf-overlay-layer:has(.lab-ocr-pdf-overlay-box[data-selected="true"])'),
         mutedPdf:style('#workspace .lab-ocr-pdf-overlay-box[data-selected="false"][data-family-selected="false"]'),
       };
     });
     const expectedEdge='rgb(255, 212, 108)',expectedFill='rgba(231, 183, 83, 0.2)';
     assert.equal(styles.root,true,'Four-pane focus palette must be Lab-scoped');
     for(const name of ['ag','cm','md','pdf']){
       assert(styles[name],name+' direct focus surface must exist');
       assert.equal(styles[name].background,expectedFill,name+' amber focus fill');
     }
     for(const name of ['cm','md','pdf']){
       assert.equal(styles[name].outline,expectedEdge,name+' gold focus ring');
       assert.equal(styles[name].outlineWidth,'2px',name+' 2px focus ring');
       assert.equal(styles[name].outlineStyle,'solid',name+' solid focus ring');
     }
     assert(styles.ag.boxShadow.includes(expectedEdge),'AG row gold 2px inset ring');
     assert(styles.label.boxShadow.includes(expectedEdge),'PDF label gold focus ring');
     assert.equal(styles.layer.opacity,'1','Selected PDF geometry must not inherit transparency fade');
     if(styles.mutedPdf)assert(Number(styles.mutedPdf.opacity)<1,
       'Unselected PDF coverage must retain global transparency');
   };
   // External navigation moves the source caret to the first PHYSICAL
   // line of the highlighted Block, without focusing the source editor or
   // editing its Markdown. The user can then continue at that source start.
   const caretStart=async lineNo=>page.waitForFunction(lineNo=>{
     const cm=document.querySelector('.ocr-cm-source')?.ocrCmTable?.editorView();
     return cm&&cm.state.selection.main.head===cm.state.doc.line(lineNo).from;
   },lineNo,{timeout:7000});
   const unchanged=await page.evaluate(()=>document.querySelector('.ocr-cm-source')
     ?.ocrCmTable?.mdRuntime()?.version);
   // PDF -> AG / CM6 / rendered Markdown.
   await page.locator('.lab-ocr-pdf-pbs-tag[data-block-id="2"]').click();
   await synchronized(2,'md-c','Original paragraph');
   await caretStart(3);
   await assertUnifiedFocus();
   // Markdown preview -> other three, including a different PDF page.
   await page.locator('.ocr-preview-md-scroll p[data-source-start="5"]').click();
   await synchronized(3,'md-e','Last paragraph');
   await caretStart(5);
   await assertUnifiedFocus();
   assert.equal(await page.locator('.ocr-ag-all-pages input').isChecked(),false);
   // AG -> CM6 / preview / PDF, returning to page 1 without clearing filters.
   await page.locator('.ocr-preview-md-scroll p[data-source-start="3"]').click();
   await synchronized(2,'md-c','Original paragraph');
   await page.locator('#workspace .ag-row:not(.ag-opacity-zero) .ag-cell[col-id="text"]')
     .filter({hasText:/^Original paragraph$/}).click();
   await synchronized(2,'md-c','Original paragraph');
   await caretStart(3);
   await assertUnifiedFocus();
   assert.equal(await page.evaluate(()=>document.querySelector('.ocr-cm-source')
     ?.ocrCmTable?.mdRuntime()?.version),unchanged,
     'External navigation must never generate an MD edit / SQL write');
   // CM6 user click -> the remaining three panels, not a programmatic echo.
   await page.locator('.ocr-cm-source .cm-line').filter({hasText:'## Heading'}).click();
   await synchronized(1,'md-a','## Heading');
   await page.keyboard.press('End');
   await page.waitForFunction(()=>{
     const cm=document.querySelector('.ocr-cm-source')?.ocrCmTable?.editorView();
     return cm&&cm.state.selection.main.head===cm.state.doc.line(1).to;
   },null,{timeout:7000});
   await assertUnifiedFocus();
   await page.locator('.ocr-preview-md-scroll p[data-source-start="3"]').click();
   await synchronized(2,'md-c','Original paragraph');
   await caretStart(3);
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
   // A PDF selection must never silently clear the default nonblank filter.
   await page.locator('.lab-ocr-pdf-pbs-tag[data-block-id="2"]').click();
   assert.deepEqual(await page.locator('#workspace .ag-row:not(.ag-opacity-zero) .ag-cell[col-id="line_no"]').allTextContents(),
     ['1','3'],'PDF navigation must preserve MD blank-line filter');
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
   // Cross-page category search uses the existing AG filter/全部 switch:
   // a title on page 1 must be findable while the PDF displays page 2.
   await page.locator('.lab-ocr-pdf-page').fill('2');
   await page.locator('.lab-ocr-pdf-page').press('Tab');
   await allPages.uncheck();
   await page.waitForFunction(()=>document.querySelectorAll(
     '#workspace .ag-row:not(.ag-opacity-zero)').length===2);
   const typeFilter=page.locator('#workspace .ag-header-cell[col-id="block_type"] .ag-header-cell-filter-button');
   await typeFilter.click();
   await page.locator('.ocr-enum-filter:visible [data-filter-value="all"] input').uncheck();
   await page.locator('.ocr-enum-filter:visible [data-filter-value="title"] input').check();
   await page.waitForFunction(()=>document.querySelector('.ocr-ag-all-pages input')?.checked===true);
   assert.deepEqual(await page.locator('#workspace .ag-row:not(.ag-opacity-zero) .ag-cell[col-id="line_no"]').allTextContents(),['1'],
     'Selecting title category expands to all pages to show remote matching rows');
   await allPages.uncheck();
   await page.waitForFunction(()=>document.querySelectorAll(
     '#workspace .ag-row:not(.ag-opacity-zero)').length===0);
   assert.equal(await allPages.isChecked(),false,
     'Explicit manual return to current-page scope must remain respected');
   await allPages.check();
   if(!await page.locator('.ocr-enum-filter:visible [data-filter-value="all"] input').isVisible())
     await typeFilter.click();
   await page.locator('.ocr-enum-filter:visible [data-filter-value="all"] input').check();
   await page.waitForFunction(()=>document.querySelectorAll(
     '#workspace .ag-row:not(.ag-opacity-zero)').length===6);
   await page.locator('.lab-ocr-pdf-page').fill('1');
   await page.locator('.lab-ocr-pdf-page').press('Tab');
   assert.equal(await page.locator('.ocr-source-upgrade-legacy').count(),0,
     'No user-unrequested legacy migration button is installed');

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
   // AG Grid retains opacity-zero recycling rows during filtering. Only
   // interact with the rendered row, never a stale virtual DOM duplicate.
   const agCell=page.locator('#workspace .ag-row:not(.ag-opacity-zero) .ag-cell[col-id="text"]')
     .filter({hasText:/^Last paragraph$/}).first();
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
   // WCP55 AG toolbar uses its EXISTING dropdown, not a second control.
   // Outline is computed from current Markdown ATX headings, not OCR Block type.
   const agView=page.locator('#workspace .ocr-outline-pane .ocr-ag-module-select');
   assert.equal(await agView.getAttribute('aria-label'),'选择 AG 过滤视图');
   assert.deepEqual(await agView.locator('option').allTextContents(),['MD 行','标题']);
   await agView.selectOption('title');
   assert.equal(await agView.inputValue(),'title');
   assert.deepEqual(await page.evaluate(()=>document.querySelector('.ocr-outline-grid')
     ?.ocrSqlGrid?.columnFields()),['text','line_no','pbs','level'],
     'Outline must show MD 行, 行号, PBS, Level in that order');
   // Lab Frame has a fixed-column wrapper rather than a second selection
   // store. Check the *displayed* pinned order as well as the columnDefs.
   const pinnedHeaders=await page.locator('#workspace .ag-grid-container-wrapper .ag-header-cell')
     .evaluateAll(nodes=>nodes.map(node=>node.getAttribute('col-id')));
   assert.deepEqual(pinnedHeaders,['text'],
     'Only MD 行 is left-fixed; line_no/PBS/Level must scroll as metadata');
   assert.equal(await page.locator('#workspace .ag-grid-container-wrapper .ag-cell[col-id="text"]').count()>0,true,
     'Outline source cells must remain in the left-fixed region');
   assert.equal(await allPages.isChecked(),true,
     'Title view shows every page of the document by default');
   await page.waitForFunction(()=>document.querySelectorAll(
     '#workspace .ag-row:not(.ag-opacity-zero)').length===1);
   assert.deepEqual(await page.locator('#workspace .ag-row:not(.ag-opacity-zero) .ag-cell[col-id="line_no"]').allTextContents(),
     ['1'],'Plain MD line stays out even if its original OCR Block is title');
   assert.equal(await page.locator('#workspace .ag-row:not(.ag-opacity-zero) .ag-cell[col-id="text"]')
     .filter({hasText:'Corrected paragraph'}).count(),0,'Non-title blocks must be absent');
   await page.waitForFunction(()=>[...document.querySelectorAll(
     '#workspace .ag-grid-container-wrapper .ag-cell[col-id="text"]')].some(node=>
       node.textContent.includes('## Heading')),null,{timeout:9000});
   const visibleOrder=await page.locator('#workspace .ag-header-cell[col-id]')
     .evaluateAll(nodes=>nodes.filter(el=>el.getBoundingClientRect().width>0)
       .map(el=>({id:el.getAttribute('col-id'),left:el.getBoundingClientRect().left}))
       .sort((a,b)=>a.left-b.left).map(item=>item.id));
   assert.deepEqual(visibleOrder,['text','line_no','pbs','level'],
     'The actual displayed outline columns, not just schema defs, follow the requested order');
   const titleStyles=await page.evaluate(()=>{
     // Pinned cells live in a separate AG region; DOM order can differ
     // between Chromium and iPad WebKit. Match by actual source text.
     const ag=[...document.querySelectorAll('#workspace .ag-row:not(.ag-opacity-zero) .ag-cell[col-id="text"]')]
       .find(el=>el.textContent.includes('## Heading'));
     const marker=ag?.querySelector('.cm-ob-heading-marker-2');
     const heading=document.querySelector('.ocr-cm-source .cm-ob-heading-marker-2');
     const sourceLine=document.querySelector('.ocr-cm-source .cm-ob-heading-line-2');
     const title=ag?.querySelector('.ocr-ag-title-source');
     const cmHost=document.querySelector('.ocr-cm-source');
     const palette=[];
     for(let n=1;n<=6;n++){
       const cm=document.createElement('div');cm.className='cm-ob-heading-line-'+n;
       const outline=document.createElement('span');outline.className='ocr-ag-title-source cm-ob-heading-line-'+n;
       cmHost?.append(cm);ag?.append(outline);
       palette.push({level:n,cm:cmHost?getComputedStyle(cm).color:null,
         ag:ag?getComputedStyle(outline).color:null,
         agSize:ag?getComputedStyle(outline).fontSize:null});
       cm.remove();outline.remove();
     }
     return {font:ag?getComputedStyle(ag).fontSize:null,
       actualFont:marker?getComputedStyle(marker).fontSize:null,
       regularFont:ag?getComputedStyle(ag).fontSize:null,
       marker:marker?.textContent,sourceColor:heading?getComputedStyle(heading).color:null,
       agColor:marker?getComputedStyle(marker).color:null,
       sourceLineColor:sourceLine?getComputedStyle(sourceLine).color:null,
       titleTextColor:title?getComputedStyle(title).color:null,palette};
   });
   assert.equal(titleStyles.marker,'##','MD line remains literal Markdown source');
   assert.equal(titleStyles.actualFont,titleStyles.regularFont,
     'Title row styling must keep default AG font size');
   assert.equal(titleStyles.agColor,titleStyles.sourceColor,
     'MD title marker must match the installed CM6 Obsidian heading palette');
   assert.equal(titleStyles.titleTextColor,titleStyles.sourceLineColor,
     'Full outline title, not only the hash marks, must match the CM6 source H2');
   for(const {level,cm,ag,agSize} of titleStyles.palette){
     assert.equal(ag,cm,'H'+level+' outline text matches CM6 source color');
     assert.equal(agSize,titleStyles.regularFont,
       'H'+level+' outline text keeps default AG font size');
   }
   // An OCR title lacking MD # does not appear, even when viewing all pages.
   // Switching the existing page checkbox back to the current PDF page only
   // narrows the outline; it does not change Block metadata or create a row.
   await allPages.uncheck();
   await page.waitForFunction(()=>document.querySelectorAll(
     '#workspace .ag-row:not(.ag-opacity-zero)').length===1);
   assert.deepEqual(await page.locator('#workspace .ag-row:not(.ag-opacity-zero) .ag-cell[col-id="line_no"]')
     .allTextContents(),['1']);
   // Returning to the original view must restore ALL original columns and
   // its default current-page/nonblank filters, with no SQL/CM6 reload.
   await agView.selectOption('md');
   assert.deepEqual((await page.evaluate(()=>document.querySelector('.ocr-outline-grid')
     ?.ocrSqlGrid?.columnFields())).slice(0,4),['line_no','pbs','block_type','text']);
   assert.deepEqual(await page.locator('#workspace .ag-grid-container-wrapper .ag-header-cell')
     .evaluateAll(nodes=>nodes.map(node=>node.getAttribute('col-id'))),['line_no','pbs'],
     'Returning to normal MD must restore its original left-pinned indexes');
   assert.equal(await allPages.isChecked(),false);
   await page.waitForFunction(()=>document.querySelectorAll(
     '#workspace .ag-row:not(.ag-opacity-zero)').length===2);
   assert.deepEqual(await page.locator('#workspace .ag-row:not(.ag-opacity-zero) .ag-cell[col-id="line_no"]')
     .allTextContents(),['1','3'],
     'Normal AG view restores current-page nonblank rows, including demoted OCR title');
   assert.equal(mdLoads,3,'AG view switching must not read MD from SQLite');
   assert.equal(mdInit,1,'AG view switching cannot reinitialize the document');
   assert.equal(saves,2,'AG view switching is read-only');
   assert((await view()).text.includes('Revised from AG'),
     'AG title view switching must not alter the authoritative Markdown');
   // Live semantic edit regression: removing title syntax must remove it
   // immediately from the existing AG outline and reset its effective Level.
   // The title's OCR Block type/Level remain untouched as audit evidence.
   const replaceMarkdown=async text=>{
     await source.click();
     await page.keyboard.press('ControlOrMeta+A');
     await page.keyboard.insertText(text);
     await page.waitForFunction(expected=>document.querySelector('.ocr-cm-source')
       ?.ocrCmTable?.mdDocument()===expected,text);
   };
   await agView.selectOption('title');
   await page.waitForFunction(()=>document.querySelectorAll(
     '#workspace .ag-row:not(.ag-opacity-zero)').length===1);
   await replaceMarkdown('Heading\n\nCorrected paragraph\n\nRevised from AG\n');
   await page.waitForFunction(()=>document.querySelectorAll(
     '#workspace .ag-row:not(.ag-opacity-zero)').length===0,null,{timeout:8000});
   assert.equal(await agView.inputValue(),'title');
   // The non-title row is still in the full MD view, with ordinary type/Level.
   await agView.selectOption('md');
   await allPages.check();
   await page.waitForFunction(()=>document.querySelectorAll(
     '#workspace .ag-row:not(.ag-opacity-zero)').length===3);
   assert.deepEqual(await page.locator('#workspace .ag-row:not(.ag-opacity-zero) .ag-cell[col-id="block_type"]')
     .allTextContents(),['text','text','text'],
     'Removing # reclassifies an OCR title as ordinary MD text');
   await agView.selectOption('title');
   await replaceMarkdown('#### Heading\n\nCorrected paragraph\n\nRevised from AG\n');
   await page.waitForFunction(()=>document.querySelectorAll(
     '#workspace .ag-row:not(.ag-opacity-zero)').length===1);
   assert.deepEqual(await page.locator('#workspace .ag-row:not(.ag-opacity-zero) .ag-cell[col-id="level"]')
     .allTextContents(),['4'],'Heading Level comes from edited ####, not OCR Level 2');
   await replaceMarkdown('#### Heading\n\n### Corrected paragraph\n\nRevised from AG\n');
   await page.waitForFunction(()=>document.querySelectorAll(
     '#workspace .ag-row:not(.ag-opacity-zero)').length===2);
   assert.deepEqual(await page.locator('#workspace .ag-row:not(.ag-opacity-zero) .ag-cell[col-id="line_no"]')
     .allTextContents(),['1','3'],'Adding # to OCR plain text promotes that MD row into outline');
   assert.deepEqual(await page.locator('#workspace .ag-row:not(.ag-opacity-zero) .ag-cell[col-id="level"]')
     .allTextContents(),['4','3']);
   assert.equal(mdInit,1,'Live outline changes cannot reinitialize the document');
   assert.equal(mdLoads,3,'Live outline changes cannot query SQLite');
   await page.locator('#global-save').click();
   await page.waitForFunction(()=>document.querySelector('.ocr-cm-source')
     ?.ocrCmTable?.mdRuntime()?.dirty===false,null,{timeout:12000});
   assert.equal(mdRows[0].text,'#### Heading');
   assert.equal(mdRows[2].text,'### Corrected paragraph');
   assert.equal(blockRows[0].block_type,'title','OCR block provenance remains immutable');
   assert.equal(blockRows[0].level,2,'OCR Level remains original evidence');
   assert.equal(blockRows[1].block_type,'text');
   await page.reload({waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>document.querySelector(
     '#workspace select.ocr-source-file-select')?.value==='sql:md');
   await agView.selectOption('title');
   await page.waitForFunction(()=>document.querySelectorAll(
     '#workspace .ag-row:not(.ag-opacity-zero)').length===2);
   assert.deepEqual(await page.locator('#workspace .ag-row:not(.ag-opacity-zero) .ag-cell[col-id="level"]')
     .allTextContents(),['4','3'],'Saved title changes persist after browser reload');
   assert.equal(mdInit,1);
   assert.equal(mdLoads,4);
   // The shared Obsidian Markdown preview recognizes $$ display LaTeX and
   // keeps the original OCR image as a clickable reference, not a second IMG.
   // The synthetic fixture is the only edited book; real user data untouched.
   // Real new-book projection puts siblings back-to-back without blank.
   const mathDocument='#### Heading\n\nIntroductory text\n$$\nE = mc^2\n$$\n'
     +'[原始公式图](<https://example.org/formula-ocr.jpg>)\n\n'
     +'### Corrected paragraph\n\nRevised from AG\n';
   await replaceMarkdown(mathDocument);
   await page.waitForFunction(()=>{
     const preview=document.querySelector('.ocr-preview-md-scroll');
     return Boolean(preview?.querySelector('.ocr-math .katex')&&
       [...preview.querySelectorAll('a[href]')].some(el=>el.textContent==='原始公式图'&&
         el.href==='https://example.org/formula-ocr.jpg'));
   },null,{timeout:15000});
   assert.equal(await page.locator('.ocr-preview-md-scroll img[src*="formula-ocr"]').count(),0,
     'OCR equation picture is a reference link, not an embedded duplicated formula');
   assert.equal(await page.locator('.ocr-preview-md-scroll .ocr-math .katex').count(),1,
     'Display TeX renders once through KaTeX');
   await page.locator('#global-save').click();
   await page.waitForFunction(()=>document.querySelector('.ocr-cm-source')
     ?.ocrCmTable?.mdRuntime()?.dirty===false,null,{timeout:12000});
   assert.equal(mdRows.some(row=>row.text==='$$'),true,
     'Formula delimiter is a persisted CM physical line');
   assert.deepEqual(errors,[]);
   console.log('LAB_OCR_MD_FULL_SOURCE_E2E_PASS',name,
     JSON.stringify({mdInit,mdLoads,saves,blocks,pdfs,revision,visits}));
  }finally{await browser.close();}
 }
}finally{vite.kill('SIGTERM');}
