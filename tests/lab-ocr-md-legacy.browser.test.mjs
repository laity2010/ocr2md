/** Real Chromium/iPad WebKit: an existing revision-0 OCR book, isolated API.
 * The user source is never touched. Test semantic AG category page expansion,
 * opt-in upgrade of exact old formula & sibling separators, CM undo/redo,
 * CAS save/reload and rendered $$ + source-image link.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {chromium,webkit} from 'playwright';
import {makeLabOcrPdf} from './helpers/lab-ocr-pdf-fixture.mjs';
const port=5389,book='/isolated/legacy-md',url=`http://127.0.0.1:${port}/labs/lab-ocr/`;
const vite=spawn('node',['node_modules/vite/bin/vite.js','--config','labs/lab-ocr/vite.config.mjs',
  '--host','127.0.0.1','--port',String(port),'--strictPort'],{stdio:['ignore','pipe','pipe']});
let log='';vite.stdout.on('data',c=>log+=c);vite.stderr.on('data',c=>log+=c);
const image='https://example.org/original-formula.png';
const blockRows=[
  [1,'p1b0',null,0,0,'text','We can compute leverage:',null],
  [2,'p1b0s0',1,0,0,'interline_equation','E = mc^2',image],
  [3,'p1b0s1',1,1,0,'text','where E is energy.',null],
  [4,'p2b0',null,0,1,'text','Another parent.',null],
].map(([block_id,pbs,parent_block_id,sibling_order,global_page,block_type,content,picture])=>({
  block_id,pbs,parent_block_id,sibling_order,global_page,block_type,
  block_group:'para_blocks',source_name:'source.json',
  source_block_key:'original:'+block_id,block_path:'original:'+block_id,
  block_json:JSON.stringify({type:block_type,lines:[{spans:[{
    type:block_type,content,...(picture?{image_path:picture}:{})}]}]}),
  absorbed_into_block_id:null,block_bbox_json:'[40,70,190,145]',
  content_preview:content,line_count:1,span_count:1,span_types:block_type,
}));
const beforeTexts=[
  [1,'We can compute leverage:'],[1,''],
  [2,'```math'],[2,`![image](<${image}>)`],[2,'```'],[2,''],
  [3,'where E is energy.'],[3,''],[4,'Another parent.'],[4,''],
];
const originalRows=beforeTexts.map(([block_id,text],i)=>({
  line_id:'legacy-'+i,line_no:i+1,block_id,text}));
const oldDoc=originalRows.map(r=>r.text).join('\n');
const upgradedDoc=`We can compute leverage:\n$$\nE = mc^2\n$$\n`+
  `[原始公式图](<${image}>)\nwhere E is energy.\n\nAnother parent.\n`;
try{
 let available=false;
 for(let i=0;i<120;i++){
  try{if((await fetch(url)).ok){available=true;break;}}catch{}
  await sleep(160);
 }
 assert(available,'Vite unavailable '+log.slice(-600));
 for(const [name,engine] of [['Chromium',chromium],['iPad-WebKit',webkit]]
   .filter(([engine])=>!process.env.LAB_OCR_TEST_BROWSER||engine===process.env.LAB_OCR_TEST_BROWSER)){
  const browser=await engine.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:{width:1180,height:860},hasTouch:true});
   page.setDefaultTimeout(16000);
   let mdRows=originalRows.map(r=>({...r})),revision=0,mdLoads=0,posted=0,readBlocks=0;
   const errors=[],receipts=new Map();
   page.on('pageerror',e=>errors.push(e.message));
   page.on('dialog',async d=>d.accept());
   await page.addInitScript(({book})=>localStorage.setItem(
     'ocr2md.lab-ocr.settings.json.v1',JSON.stringify({settings:{
      'workspace.dataDirectory':{key:'dataDirectory',category1:'工作区',category2:'目录',
        comment:'isolated legacy MD',value:book,range:{kind:'server-directory'}},
   }})),{book});
   await page.route('**/labs/lab-ocr/api/ocr/**',async route=>{
    const u=new URL(route.request().url()),op=u.pathname.split('/').at(-1),
      payload=route.request().method()==='POST'?
        JSON.parse(route.request().postData()||'{}'):null;
    const respond=data=>route.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify(data)});
    if(op==='pdf')return route.fulfill({status:200,
      contentType:'application/pdf',body:makeLabOcrPdf(2)});
    if(op==='inspect')return respond({status:'unchanged',blocks:4,pages:2,
      pdf:'fixture.pdf',sources:[{name:'source.json',pages:2}],mdSupported:true});
    if(op==='minerujson2block')return respond({status:'ready',kind:'view',blocks:4});
    if(op==='rows'){
      if(u.searchParams.get('table')==='block'){
        readBlocks++;return respond({table:'block',total:4,rows:blockRows});
      }
      return respond({table:u.searchParams.get('table'),total:0,rows:[]});
    }
    if(op==='block-edit-state')return respond({revision:0,canUndo:false,canRedo:false,cursor:0,history:[]});
    if(op==='overlays')return respond({page:Number(u.searchParams.get('page')),
      level:u.searchParams.get('level'),pageSize:[595,842],
      boxes:blockRows.filter(b=>b.global_page+1===Number(u.searchParams.get('page'))).map(b=>({
        id:'b'+b.block_id,blockId:String(b.block_id),pbs:b.pbs,
        parentBlockId:b.parent_block_id==null?null:String(b.parent_block_id),
        blockGroup:'para_blocks',blockType:b.block_type,bbox:[40,70,190,145]}))});
    if(op==='md-state'){
      mdLoads++;return respond({status:'ready',revision,rows:mdRows,total:mdRows.length});
    }
    if(op==='md-save'){
      posted++;
      if(receipts.has(payload.requestId))return respond(receipts.get(payload.requestId));
      assert.equal(payload.expectedRevision,revision);
      assert.equal(payload.blockRevision,0);
      const next=[...mdRows.slice(0,payload.start-1),
        ...payload.insert.map(row=>({...row})),
        ...mdRows.slice(payload.start-1+payload.deleteCount)];
      mdRows=next.map((row,i)=>({...row,line_no:i+1}));
      const result={status:'saved',revision:++revision,total:mdRows.length};
      receipts.set(payload.requestId,result);return respond(result);
    }
    throw Error('Unexpected OCR API '+op);
   });
   await page.goto(url,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>document.querySelector('.ocr-cm-source')
     ?.ocrCmTable?.mdDocument()?.includes('```math'));
   assert.equal(await page.evaluate(()=>document.querySelector('.ocr-cm-source')
     ?.ocrCmTable?.mdDocument()),oldDoc,'Existing MD must not be silently changed on load');
   const migration=page.locator('.ocr-source-upgrade-legacy');
   await migration.waitFor();assert.equal(await migration.isVisible(),true);
   const allPages=page.locator('.ocr-ag-all-pages input');
   assert.equal(await allPages.isChecked(),false);
   // A PDF navigation to page 2 hides the page-1 formula by default.
   await page.locator('.lab-ocr-pdf-page').fill('2');
   await page.locator('.lab-ocr-pdf-page').press('Tab');
   await page.waitForFunction(()=>[...document.querySelectorAll(
     '#workspace .ag-row:not(.ag-opacity-zero) .ag-cell[col-id="block_type"]')]
       .every(e=>e.textContent==='text'));
   assert.equal(await allPages.isChecked(),false);
   // Choosing interline_equation is a semantic book-wide search; it must
   // clear only the implicit p2 filter and retain the category selection.
   await page.locator('#workspace .ag-header-cell[col-id="block_type"] .ag-header-cell-filter-button').click();
   const option=page.locator('.ocr-enum-filter:visible .ocr-enum-filter-option[data-filter-value="interline_equation"] input');
   await option.waitFor();
   await page.locator('.ocr-enum-filter:visible .ocr-enum-filter-option[data-filter-value="all"] input').uncheck();
   await option.check();
   await page.waitForFunction(()=>document.querySelector('.ocr-ag-all-pages input')?.checked===true,
     null,{timeout:3500}).catch(async error=>{
       console.log('CATEGORY_FILTER_DIAG',JSON.stringify(await page.evaluate(()=>({
         checkbox:document.querySelector('.ocr-ag-all-pages input')?.checked,
         model:[...document.querySelectorAll('.ocr-enum-filter input')].filter(x=>x.checked).map(x=>x.closest('[data-filter-value]')?.dataset.filterValue),
         rows:[...document.querySelectorAll('.ag-row:not(.ag-opacity-zero)')].map(x=>x.textContent.slice(0,100)),
         agStatus:document.querySelector('.ocr-ag-toolbar')?.textContent,
       }))));throw error;
     });
   await page.waitForFunction(()=>document.querySelectorAll(
     '#workspace .ag-row:not(.ag-opacity-zero)').length===3);
   assert.deepEqual(await page.locator('#workspace .ag-row:not(.ag-opacity-zero) .ag-cell[col-id="pbs"]')
     .allTextContents(),['p1b0s0','p1b0s0','p1b0s0']);
   // The search result must actually navigate back to the formula's PDF page.
   await page.locator('#workspace .ag-row:not(.ag-opacity-zero) .ag-cell[col-id="text"]')
     .filter({hasText:'```math'}).click();
   await page.waitForFunction(()=>document.querySelector('.lab-ocr-pdf-page')?.value==='1');
   assert.equal(await allPages.isChecked(),true,'AG formula navigation keeps the book-wide filter');
   await page.locator('.lab-ocr-pdf-page').fill('2');
   await page.locator('.lab-ocr-pdf-page').press('Tab');
   await allPages.uncheck();
   await page.waitForFunction(()=>document.querySelectorAll(
     '#workspace .ag-row:not(.ag-opacity-zero)').length===0);
   assert.equal(await allPages.isChecked(),false,
     'A deliberate manual page restriction must not be overridden');
   await allPages.check();
   await page.waitForFunction(()=>document.querySelectorAll(
     '#workspace .ag-row:not(.ag-opacity-zero)').length===3);
   await migration.click();
   await page.waitForFunction(expected=>document.querySelector('.ocr-cm-source')
     ?.ocrCmTable?.mdDocument()===expected,upgradedDoc,{timeout:12000});
   await page.waitForFunction(expected=>[...document.querySelectorAll('.ocr-preview-md-scroll a[href]')]
     .some(a=>a.href===expected),image,{timeout:10000}).catch(async error=>{
       console.log('LEGACY_RENDER_DIAG',JSON.stringify(await page.evaluate(()=>({
         html:document.querySelector('.ocr-preview-md-scroll')?.innerHTML?.slice(0,1800),
         text:document.querySelector('.ocr-preview-md-scroll')?.textContent?.slice(0,1200),
       }))));throw error;
     });
   assert.equal(await page.locator('.ocr-preview-md-scroll .ocr-math .katex').count(),1,
     'The upgraded formula must be parsed/rendered, even without an empty sibling separator');
   assert.equal(await page.locator('.ocr-preview-md-scroll a[href="'+image+'"]').count(),1);
   assert.equal(await page.locator('.ocr-preview-md-scroll img[src="'+image+'"]').count(),0);
   const afterState=await page.evaluate(()=>document.querySelector('.ocr-cm-source')?.ocrCmTable?.mdRuntime());
   assert.deepEqual(afterState.rows.filter(r=>r.text==='$$').map(r=>r.block_id),[2,2]);
   assert.equal(afterState.rows.find(r=>r.text==='Another parent.')?.line_id,'legacy-8');
   assert.equal(afterState.rows.find(r=>r.text==='where E is energy.')?.line_id,'legacy-6');
   await page.locator('#undo').click();
   await page.waitForFunction(expected=>document.querySelector('.ocr-cm-source')
     ?.ocrCmTable?.mdDocument()===expected,oldDoc,{timeout:7000});
   assert.deepEqual(await page.evaluate(()=>document.querySelector('.ocr-cm-source')
     ?.ocrCmTable?.mdRuntime()?.rows),originalRows,
     'Undo restores ALL previous LineIDs, BlockIDs and physical blank rows');
   await page.locator('#redo').click();
   await page.waitForFunction(expected=>document.querySelector('.ocr-cm-source')
     ?.ocrCmTable?.mdDocument()===expected,upgradedDoc,{timeout:7000});
   await page.locator('#global-save').click();
   await page.waitForFunction(()=>document.querySelector('.ocr-cm-source')
     ?.ocrCmTable?.mdRuntime()?.dirty===false,{timeout:12000});
   assert.equal(mdRows.map(r=>r.text).join('\n'),upgradedDoc);
   // Reversal is still a normal CAS update even after the first save Ack.
   await page.locator('#undo').click();
   await page.waitForFunction(expected=>document.querySelector('.ocr-cm-source')
     ?.ocrCmTable?.mdDocument()===expected,oldDoc,{timeout:7000});
   await page.locator('#global-save').click();
   await page.waitForFunction(()=>document.querySelector('.ocr-cm-source')
     ?.ocrCmTable?.mdRuntime()?.dirty===false,null,{timeout:12000});
   assert.deepEqual(mdRows,originalRows,'Post-save Undo must restore all SQL LineIDs/BlockIDs');
   await page.locator('#redo').click();
   await page.waitForFunction(expected=>document.querySelector('.ocr-cm-source')
     ?.ocrCmTable?.mdDocument()===expected,upgradedDoc,{timeout:7000});
   await page.locator('#global-save').click();
   await page.waitForFunction(()=>document.querySelector('.ocr-cm-source')
     ?.ocrCmTable?.mdRuntime()?.dirty===false,null,{timeout:12000});
   assert.equal(mdRows.map(r=>r.text).join('\n'),upgradedDoc);
   assert.equal(posted>=3,true);
   assert.equal(readBlocks>=1,true);
   await page.reload({waitUntil:'domcontentloaded'});
   await page.waitForFunction(expected=>document.querySelector('.ocr-cm-source')
     ?.ocrCmTable?.mdDocument()===expected,upgradedDoc,{timeout:12000});
   assert.equal(mdRows.find(r=>r.text==='E = mc^2')?.block_id,2);
   assert.deepEqual(errors,[]);
   console.log('LAB_OCR_LEGACY_BROWSER_PASS',name,
     JSON.stringify({posted,revision,mdLoads,readBlocks,lines:mdRows.length}));
  }finally{await browser.close();}
 }
}finally{vite.kill('SIGTERM');}
