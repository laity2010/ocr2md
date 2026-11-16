/** WP1-3 end-to-end: source span -> LaTeX AG -> CM6 offset + PDF bbox.
 * Authorized in-memory fixture; no user book/SQL edits or network images.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {chromium,webkit} from 'playwright';
import {makeLabOcrPdf} from './helpers/lab-ocr-pdf-fixture.mjs';
import {findLatex} from '../ui/latex-scan.js';
const port=5396,book='/isolated/lab-ocr-latex';
const base=`http://127.0.0.1:${port}/labs/lab-ocr/`;
const vite=spawn('node',['node_modules/vite/bin/vite.js','--config',
  'labs/lab-ocr/vite.config.mjs','--host','127.0.0.1',
  '--port',String(port),'--strictPort'],{stdio:['ignore','pipe','pipe']});
let log='';vite.stdout.on('data',x=>log+=x);vite.stderr.on('data',x=>log+=x);
const span=(type,content,bbox,image_path)=>({type,content,bbox,
  ...(image_path?{image_path}:{})});
const blocks=[
 {id:1,page:0,pbs:'p1b0',type:'interline_equation',bbox:[40,75,340,140],
  spans:[span('interline_equation','E=mc^2',[70,95,190,120],
    'https://formula.example.test/original.jpg')]},
 {id:2,page:0,pbs:'p1b1',type:'text',bbox:[40,180,410,260],
  spans:[span('inline_equation','a+b',[100,205,140,221]),
         span('inline_equation','c+d',[210,205,260,221])]},
 {id:3,page:1,pbs:'p2b0',type:'interline_equation',bbox:[50,75,360,135],
  spans:[span('interline_equation','z=3',[65,90,120,113])]},
].map(item=>({block_id:item.id,global_page:item.page,pbs:item.pbs,
  parent_block_id:null,sibling_order:item.id,block_type:item.type,
  block_group:'para_blocks',level:null,source_name:'fixture.json',
  page_size_json:'[595,842]',
  source_block_key:'immutable:'+item.id,block_path:String(item.id),
  block_json:JSON.stringify({type:item.type,lines:[{spans:item.spans}]}),
  absorbed_into_block_id:null,block_bbox_json:JSON.stringify(item.bbox),
  content_preview:item.spans.map(s=>s.content).join(' '),line_count:1,
  span_count:item.spans.length,span_types:item.spans.map(s=>s.type).join(','),
  bbox:item.bbox}));
const md=[
 [1,1,'$$'],[2,1,'E=mc^2'],[3,1,'$$'],[4,1,''],
 [5,2,'Formula $a+b$ plus $c+d$ and manual $q^2$.'],[6,2,''],
 [7,3,'Unrelated text'],[8,3,''],
].map(([line_no,block_id,text])=>({line_no,line_id:'latex-md-'+line_no,
  block_id,text}));
try{
 let ok=false;
 for(let i=0;i<110;i++){
  try{if((await fetch(base)).ok){ok=true;break;}}catch{}
  await sleep(170);
 }
 assert(ok,`Vite unavailable ${log.slice(-400)}`);
 for(const [label,engine] of [['Chromium',chromium],['iPad-WebKit',webkit]]
   .filter(([name])=>!process.env.LAB_OCR_TEST_BROWSER||name===process.env.LAB_OCR_TEST_BROWSER)){
  const browser=await engine.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:{width:1300,height:930},hasTouch:true});
   const errors=[];page.on('pageerror',error=>errors.push(error.message));
   let saves=0,loaded=0;
   await page.addInitScript(({book})=>{
     localStorage.setItem('ocr2md.lab-ocr.settings.json.v1',JSON.stringify({settings:{
       'workspace.dataDirectory':{key:'dataDirectory',category1:'工作区',
         category2:'目录',comment:'read-only formula fixture',value:book,
         range:{kind:'server-directory'}}}}));
   },{book});
   await page.route('**/labs/lab-ocr/api/ocr/**',async route=>{
     const req=route.request(),u=new URL(req.url()),op=u.pathname.split('/').at(-1);
     const respond=body=>route.fulfill({status:200,contentType:'application/json',
       body:JSON.stringify(body)});
     if(op==='pdf')return route.fulfill({status:200,
       contentType:'application/pdf',body:makeLabOcrPdf(2,[
         'BT /F1 20 Tf 80 733 Td (E=mc2) Tj ET\n',
         'BT /F1 20 Tf 75 742 Td (z=3) Tj ET\n'])});
     if(op==='inspect')return respond({status:'unchanged',blocks:3,pages:2,
       pdf:'fixture.pdf',sources:[{name:'fixture.json',pages:2}],mdSupported:true});
     if(op==='minerujson2block')return respond({status:'ready',kind:'view',blocks:3});
     if(op==='rows')return respond(u.searchParams.get('table')==='block'?
       {table:'block',total:3,rows:blocks}:{table:'minerujson',total:0,rows:[]});
     if(op==='block-edit-state')return respond({revision:0,cursor:0,history:[],
       canUndo:false,canRedo:false});
     if(op==='md-state'){loaded++;return respond({status:'ready',revision:0,
       rows:md,total:md.length});}
     if(op==='md-save'){saves++;throw Error('Read-only LaTeX view must never POST md-save');}
     if(op==='overlays'){
       const n=Number(u.searchParams.get('page'));
       return respond({page:n,level:u.searchParams.get('level'),pageSize:[595,842],
         boxes:blocks.filter(r=>r.global_page===n-1).map(r=>({id:String(r.block_id),
           blockId:String(r.block_id),pbs:r.pbs,parentBlockId:null,
           blockGroup:'para_blocks',blockType:r.block_type,
           bbox:r.bbox,sourceEmpty:false}))});
     }
     throw Error('Unexpected OCR endpoint '+op);
   });
   // Prove the PDF crop works even when MinerU's remote CDN denies access.
   await page.route('https://formula.example.test/**',route=>route.fulfill({
     status:403,contentType:'text/plain',body:'Forbidden'}));
   await page.goto(base,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>document.querySelector(
     '#workspace select.ocr-source-file-select')?.value==='sql:md');
   await page.waitForFunction(()=>document.querySelectorAll('.lab-ocr-pdf-pbs-tag').length>=2);
   const picker=page.locator('.ocr-outline-pane .ocr-ag-module-select');
   assert.deepEqual(await picker.locator('option').allTextContents(),['MD 行','标题','LaTeX']);
   const originalText=await page.evaluate(()=>document.querySelector('.ocr-cm-source')
     ?.ocrCmTable?.mdDocument());
   await picker.selectOption('latex');
   await page.waitForFunction(()=>document.querySelector('#workspace .ag-header-cell[col-id="render_html"]'));
   assert.equal(await picker.inputValue(),'latex');
   const fields=await page.evaluate(()=>document.querySelector('.ocr-outline-grid')
     ?.ocrSqlGrid?.columnFields());
   for(const name of ['pbs','formula','render_html','original_image','match_status'])
     assert(fields.includes(name),'Missing LaTeX AG column '+name);
   await page.waitForFunction(()=>document.querySelectorAll('#workspace .ag-row:not(.ag-opacity-zero)').length===5);
   assert.equal(await page.locator('.ocr-ag-all-pages input').isChecked(),true,
     'LaTeX view must initially list all PDF pages');
   assert.equal(await page.locator('.lab-ocr-latex-preview .katex').count()>=1,true);
   // Select the FIRST inline OCR Span by the public AG semantic ID, then
   // click the displayed row (not a programmatic selection shortcut).
   const exact=async id=>{
     const selected=await page.evaluate(id=>document.querySelector('.ocr-outline-grid')
       ?.ocrSqlGrid?.selectById({field:'formula_id',id,focusColumn:'formula'}),id);
     assert(selected,'AG must locate formula '+id);
     const active=page.locator('#workspace .ag-row-selected:not(.ag-opacity-zero) .ag-cell[col-id="formula"]');
     await active.first().click();
   };
   await exact('ocr:2:0:0');
   await page.waitForFunction(()=>{
     const cm=document.querySelector('.ocr-cm-source')?.ocrCmTable?.editorView();
     if(!cm)return false;
     const line=cm.state.doc.line(5);
     return cm.state.selection.main.head===line.from+9;
   },null,{timeout:9000});
   await page.waitForFunction(()=>{
     const box=document.querySelector('.lab-ocr-pdf-formula-focus');
     return box?.dataset.formulaBlockId==='2';
   },null,{timeout:9000});
   const pos=await page.locator('.lab-ocr-pdf-formula-focus').evaluate(node=>({
     left:parseFloat(node.style.left),top:parseFloat(node.style.top),
     width:parseFloat(node.style.width)}));
   assert(Math.abs(pos.left-100/595*100)<.05);
   assert(Math.abs(pos.top-205/842*100)<.05);
   assert.equal((await page.locator('.lab-ocr-pdf-formula-focus').evaluate(
     el=>getComputedStyle(el).pointerEvents)),'none');
   // Another formula on the SAME physical MD line must move the CM caret
   // to a different offset without rewriting any MD row.
   await exact('ocr:2:0:1');
   await page.waitForFunction(()=>{
     const cm=document.querySelector('.ocr-cm-source')?.ocrCmTable?.editorView();
     return cm?.state.selection.main.head===cm.state.doc.line(5).from+20;
   },null,{timeout:9000});
   await exact('ocr:1:0:0');
   await page.waitForFunction(()=>document.querySelector('.lab-ocr-pdf-formula-focus')
     ?.dataset.formulaBlockId==='1');
   assert.equal(await page.locator('.lab-ocr-latex-image img').count()>0,true,
     'Source-backed formula image must be present');
   // The optional MinerU CDN may deny access (403). The viewer must render
   // a trusted local PDF.js crop of the physical Span without remote image IO.
   await page.evaluate(()=>document.querySelector('.ocr-outline-grid')
     ?.ocrSqlGrid?.selectById({field:'formula_id',id:'ocr:1:0:0',
       focusColumn:'original_image',preserveFilters:true}));
   await page.waitForFunction(()=>[...document.querySelectorAll(
     '.lab-ocr-latex-image-figure img[src^="data:image/png;base64,"]')]
     .some(el=>el.isConnected&&el.complete&&el.naturalWidth>0),null,{timeout:15000});
   assert.equal(await page.locator('.lab-ocr-latex-original-link').count()>0,true,
     'A PDF crop should retain the exact MinerU original image link');
   const crop=await page.locator('.lab-ocr-latex-image-figure img[src^="data:image/png;base64,"]')
      .first().evaluate(el=>({width:el.naturalWidth,height:el.naturalHeight}));
   assert(crop.width>20&&crop.height>10&&crop.width<=520&&crop.height<=250,
     'PDF source crop has bounded, visible pixels');
   const ink=await page.locator('.lab-ocr-latex-image-figure img[src^="data:image/png;base64,"]')
     .first().evaluate(el=>{
       const canvas=document.createElement('canvas');canvas.width=el.naturalWidth;
       canvas.height=el.naturalHeight;const ctx=canvas.getContext('2d');
       ctx.drawImage(el,0,0);
       const rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data;
       let dark=0;for(let i=0;i<rgba.length;i+=4)
         if((rgba[i]+rgba[i+1]+rgba[i+2])<630)dark++;
       return dark;
     });
   assert(ink>5,'PDF crop must contain glyph ink, not only a blank white PNG');
   // The OCR-only formula on page 2 has no exact MD character range.
   // Navigation must show its PDF Span but NEVER place the caret in an
   // unrelated paragraph from the same Block.
   const caretBefore=await page.evaluate(()=>document.querySelector('.ocr-cm-source')
     ?.ocrCmTable?.editorView()?.state.selection.main.head);
   await exact('ocr:3:0:0');
   await page.waitForFunction(()=>document.querySelector('.lab-ocr-pdf-formula-focus')
     ?.dataset.formulaBlockId==='3',null,{timeout:10000});
   assert.equal(await page.evaluate(()=>document.querySelector('.ocr-cm-source')
     ?.ocrCmTable?.editorView()?.state.selection.main.head),caretBefore);
   assert.equal(await page.locator('.ocr-cm-source .cm-line.ocr-four-pane-source-active').count(),0,
     'Unmatched OCR formula must not fabricate a highlighted MD line');
   // The additional MD-only formula still navigates its actual characters,
   // without inventing a precise PDF Span bbox.
   const mdOnly=findLatex(md.map(r=>r.text).join('\n')).find(x=>x.content==='q^2');
   assert(mdOnly);await exact(`md:latex-md-5:${mdOnly.from}`);
   await page.waitForFunction(()=>{
     const cm=document.querySelector('.ocr-cm-source')?.ocrCmTable?.editorView();
     return cm?.state.selection.main.head===cm.state.doc.line(5).from+37;
   },null,{timeout:9000});
   assert.equal(await page.locator('.lab-ocr-pdf-formula-focus').count(),0);
   assert.equal(await page.locator('.ocr-cm-source .cm-editor').count(),1);
   assert.equal(await page.evaluate(()=>document.querySelector('.ocr-cm-source')
     ?.ocrCmTable?.mdDocument()),originalText,'Formula selection cannot modify Markdown');
   assert.equal(await page.evaluate(()=>document.querySelector('.ocr-cm-source')
     ?.ocrCmTable?.mdRuntime()?.dirty),false);
   assert.equal(saves,0,'Read-only formula view cannot generate SQL writes');
   assert.deepEqual(errors,[],'No browser page errors');
   console.log('LAB_OCR_LATEX_VIEW_E2E_PASS',label,JSON.stringify({
     formulas:5,matched:3,ocrOnly:1,mdOnly:1,saves,loaded}));
  }finally{await browser.close();}
 }
}finally{vite.kill('SIGTERM');}
