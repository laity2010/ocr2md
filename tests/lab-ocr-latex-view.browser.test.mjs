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
  spans:[span('interline_equation',String.raw`\frac{1}{`,[65,90,120,113])]},
 // A genuinely repeated inline formula: each physical Span has a separate
 // bbox but both have the same LaTeX. OCR + MD whole-paragraph exact match
 // proves their distinct character offsets without guessing by proximity.
 {id:4,page:1,pbs:'p2b1',type:'text',bbox:[40,190,440,240],
  spans:[span('text','before '),span('inline_equation','r_t',[205,205,230,225]),
    span('text',' between '),span('inline_equation','r_t',[335,205,360,225]),
    span('text',' after')]},
 // p7b1s0 regression: old OCR TeX is invalid, but the same stable BlockID
 // contains one corrected, explicit MD math span. The AG must show the CM6
 // revision and re-run KaTeX, while retaining the source PDF bbox.
 {id:5,page:1,pbs:'p2b2',type:'text',bbox:[40,270,430,322],
  spans:[span('inline_equation',String.raw`\badcommand{Equity}`,[80,285,320,305]),
    span('text',', then we found leverage.')]},
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
 [7,3,'Unrelated text'],[8,4,'before $r_t$ between $r_t$ after'],[9,4,''],
 [10,5,'$(Equity_t^{MV}+Debt_t+Float_t)/Equity_t^{MV}$, then we found leverage.'],
 [11,5,''],
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
     if(op==='inspect')return respond({status:'unchanged',blocks:5,pages:2,
       pdf:'fixture.pdf',sources:[{name:'fixture.json',pages:2}],mdSupported:true});
     if(op==='minerujson2block')return respond({status:'ready',kind:'view',blocks:5});
     if(op==='rows')return respond(u.searchParams.get('table')==='block'?
       {table:'block',total:5,rows:blocks}:{table:'minerujson',total:0,rows:[]});
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
   // A formula CDN URL may still exist in immutable MinerU metadata but
   // neither AG nor the source may ever request it.
   let remoteFormulaRequests=0;
   await page.route('https://formula.example.test/**',route=>{
     remoteFormulaRequests++;
     return route.fulfill({status:403,contentType:'text/plain',body:'Forbidden'});
   });
   await page.goto(base,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>document.querySelector(
     '#workspace select.ocr-source-file-select')?.value==='sql:md');
   await page.waitForFunction(()=>document.querySelectorAll('.lab-ocr-pdf-pbs-tag').length>=2);
   // The Lab's native $...$ opt-in renders ordinary math without requiring
   // legacy CMD review comments, while the Markdown source stays intact.
   await page.waitForFunction(()=>document.querySelectorAll(
     '.ocr-preview-md-scroll .ocr-reviewed-inline-latex .katex').length>=3,
     null,{timeout:14000});
   const picker=page.locator('.ocr-outline-pane .ocr-ag-module-select');
   assert.deepEqual(await picker.locator('option').allTextContents(),['MD 行','标题','LaTeX']);
   const originalText=await page.evaluate(()=>document.querySelector('.ocr-cm-source')
     ?.ocrCmTable?.mdDocument());
   await picker.selectOption('latex');
   await page.waitForFunction(()=>document.querySelector('#workspace .ag-header-cell[col-id="render_html"]'));
   assert.equal(await picker.inputValue(),'latex');
   const fields=await page.evaluate(()=>document.querySelector('.ocr-outline-grid')
     ?.ocrSqlGrid?.columnFields());
   assert.deepEqual(fields.slice(0,5),
     ['formula','render_status','kind','render_html','pdf_crop'],
     'LaTeX columns must be source / colored render / kind / preview / screenshot');
   for(const name of ['pbs','line_no','match_status','syntax'])
     assert(fields.includes(name),'Missing other LaTeX AG column '+name);
   const headers=await page.evaluate(()=>{
     const elements=[...document.querySelectorAll('.ocr-outline-grid .ag-header-cell')];
     return elements.filter(el=>!el.closest('[aria-hidden="true"]'))
       .map(el=>({field:el.getAttribute('col-id'),label:el.querySelector('.ag-header-cell-text')?.textContent}));
   });
   for(const [field,label] of [['formula','源码'],['render_status','渲染'],
       ['kind','类型'],['render_html','预览'],['pdf_crop','截图']]){
     const item=headers.find(x=>x.field===field);
     if(item)assert.equal(item.label,label,`Unexpected LaTeX header: ${field}`);
   }
   await page.waitForFunction(()=>document.querySelectorAll('#workspace .ag-row:not(.ag-opacity-zero)').length===8);
   assert.equal(await page.locator('.ocr-ag-all-pages input').isChecked(),true,
     'LaTeX view must initially list all PDF pages');
   assert.equal(await page.locator('.lab-ocr-latex-preview .katex').count()>=1,true);
   // New LaTeX-only visual layer marks *all* formulas (selected or not) in
   // three panes from the same current MD formula index/PDF source geometry.
   await page.waitForFunction(()=>document.querySelector('#workspace')
     ?.classList.contains('ocr-latex-all-active'));
   // CodeMirror splits one decoration at syntax tokens; concatenate their
   // visible text just like the selected-formula test below.
   await page.waitForFunction(()=>[...document.querySelectorAll(
     '.ocr-cm-source .ocr-latex-view-formula-all')]
       .map(el=>el.textContent).join('').includes('a+b'));
   await page.waitForFunction(()=>[...document.querySelectorAll(
     '.lab-ocr-pdf-formula-all')].length>=3);
   const allStyles=await page.evaluate(()=>{
     const pick=sel=>document.querySelector(sel);
     const source=pick('.ocr-cm-source .ocr-latex-view-formula-all');
     const pdf=pick('.lab-ocr-pdf-formula-all');
     const preview=pick('.ocr-preview-md-scroll .ocr-reviewed-inline-latex');
     const display=pick('.ocr-preview-md-scroll .ocr-math .katex');
     const rgba=el=>el&&getComputedStyle(el).backgroundColor;
     return {source:rgba(source),pdf:rgba(pdf),preview:rgba(preview),
       display:rgba(display),count:document.querySelectorAll('.lab-ocr-pdf-formula-all').length,
       pdfPointer:pdf&&getComputedStyle(pdf).pointerEvents};
   });
   assert(allStyles.source&&allStyles.preview&&allStyles.pdf&&allStyles.display,
     'CM6, PDF and MD preview must all highlight LaTeX');
   assert.equal(allStyles.source,allStyles.pdf);
   assert.equal(allStyles.source,allStyles.preview);
   assert.equal(allStyles.source,allStyles.display);
   assert.equal(allStyles.pdfPointer,'none');
   const allAlpha=Number(allStyles.source.match(/rgba?\([^)]*,\s*([\d.]+)\)$/)?.[1]);
   assert(allAlpha>=0.32&&allAlpha<=0.43,
     'All-formula tint must be stronger than inline 0.24 but not harsh');
   assert.equal(await page.locator('.lab-ocr-pdf-formula-all[data-formula-id="ocr:2:0:0"]').count(),1);
   assert.equal(await page.locator('.lab-ocr-pdf-formula-all[data-formula-id="ocr:2:0:1"]').count(),1);
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
   const success=page.locator('#workspace .ag-row-selected .ag-cell[col-id="render_status"] .lab-ocr-latex-render-ok');
   assert.equal(await success.textContent(),'成功');
   const successColor=await success.evaluate(el=>getComputedStyle(el).color);
   await page.waitForFunction(()=>{
     const cm=document.querySelector('.ocr-cm-source')?.ocrCmTable?.editorView();
     if(!cm)return false;
     const line=cm.state.doc.line(5);
     return cm.state.selection.main.head===line.from+9;
   },null,{timeout:9000});
   // CM6 splits a decorated formula into multiple DOM spans around math
   // syntax tokens. Compare the WHOLE formula decoration, not one span.
   await page.waitForFunction(()=>[...document.querySelectorAll(
     '.ocr-cm-source .ocr-four-pane-formula-active')]
       .map(node=>node.textContent).join('')==='a+b',null,{timeout:9000});
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
   // Inline formula uses one light, translucent fill for both source text
   // and PDF's physical Span. Do not cover characters with opaque amber.
   const inlineColors=await page.evaluate(()=>{
     const source=document.querySelector('.ocr-cm-source .ocr-four-pane-formula-inline');
     const pdf=document.querySelector('.lab-ocr-pdf-formula-focus');
     return {sourceClass:source?.className,pdfKind:pdf?.dataset.formulaKind,
       sourceFill:source&&getComputedStyle(source).backgroundColor,
       pdfFill:pdf&&getComputedStyle(pdf).backgroundColor,
       pdfBorder:pdf&&getComputedStyle(pdf).borderTopWidth,
       pdfShadow:pdf&&getComputedStyle(pdf).boxShadow};
   });
   assert(inlineColors.sourceClass?.includes('cm-selectionMatch'));
   assert.equal(inlineColors.pdfKind,'inline');
   assert.equal(inlineColors.sourceFill,inlineColors.pdfFill,
     'CM6 and PDF inline formulas must share the exact light fill');
   const alpha=Number(inlineColors.sourceFill.match(/rgba?\([^)]*,\s*([\d.]+)\)$/)?.[1]);
   assert(alpha>0&&alpha<0.35,'Inline fill must be light and translucent');
   assert.equal(inlineColors.pdfBorder,'1px');
   assert.equal(inlineColors.pdfShadow,'none');
   // Another formula on the SAME physical MD line must move the CM caret
   // to a different offset without rewriting any MD row.
   await exact('ocr:2:0:1');
   await page.waitForFunction(()=>{
     const cm=document.querySelector('.ocr-cm-source')?.ocrCmTable?.editorView();
     return cm?.state.selection.main.head===cm.state.doc.line(5).from+20;
   },null,{timeout:9000});
   assert.equal(await page.locator('.ocr-cm-source .ocr-four-pane-formula-active')
     .allTextContents().then(parts=>parts.join('')),'c+d');
   await exact('ocr:4:0:1');
   await page.waitForFunction(()=>{
     const cm=document.querySelector('.ocr-cm-source')?.ocrCmTable?.editorView();
     return cm?.state.selection.main.head===cm.state.doc.line(8).from+8;
   },null,{timeout:9000});
   await page.waitForFunction(()=>document.querySelector('.lab-ocr-pdf-formula-focus')
     ?.dataset.formulaBlockId==='4',null,{timeout:9000});
   await page.waitForFunction(()=>document.querySelectorAll(
     '.page[data-page-number="2"] .lab-ocr-pdf-formula-all').length>=4,
     null,{timeout:9000});
   const firstLeft=await page.locator('.lab-ocr-pdf-formula-focus')
     .evaluate(box=>parseFloat(box.style.left));
   assert.equal(await page.locator('.ocr-cm-source .ocr-four-pane-formula-active')
     .allTextContents().then(parts=>parts.join('')),'r_t');
   await exact('ocr:4:0:3');
   await page.waitForFunction(()=>{
     const cm=document.querySelector('.ocr-cm-source')?.ocrCmTable?.editorView();
     return cm?.state.selection.main.head===cm.state.doc.line(8).from+22;
   },null,{timeout:9000});
   const secondLeft=await page.locator('.lab-ocr-pdf-formula-focus')
     .evaluate(box=>parseFloat(box.style.left));
   assert(secondLeft>firstLeft+10,'Repeated formula must move to its own PDF Span');
   assert.equal(await page.locator('.ocr-cm-source .ocr-four-pane-formula-active')
     .allTextContents().then(parts=>parts.join('')),'r_t');
   // Inline LaTeX deliberately softens the built-in match fill, but
   // retains CM6's native match semantics and never adds an underline.
   // Select the second r_t with CM6; its native highlighter marks the first.
   const sourceColors=await page.evaluate(async()=>{
     const editor=document.querySelector('.ocr-cm-source')?.ocrCmTable?.editorView();
     const line=editor.state.doc.line(8);
     editor.dispatch({selection:{anchor:line.from+22,head:line.from+25}});
     await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
     const own=document.querySelector('.ocr-cm-source .ocr-four-pane-formula-active');
     const builtIn=document.querySelector('.ocr-cm-source .cm-selectionMatch:not(.ocr-four-pane-formula-active)');
     return {own:own&&{
       className:own.className,
       background:getComputedStyle(own).backgroundColor,
       boxShadow:getComputedStyle(own).boxShadow,
     },builtIn:builtIn&&{
       className:builtIn.className,
       background:getComputedStyle(builtIn).backgroundColor,
       boxShadow:getComputedStyle(builtIn).boxShadow,
     }};
   });
   assert(sourceColors.own?.className.includes('cm-selectionMatch'));
   assert(sourceColors.builtIn?.className.includes('cm-selectionMatch'),
     'CM6 stock highlightSelectionMatches must be active');
   assert.equal(sourceColors.own.background,inlineColors.pdfFill,
     'The inline LaTeX fill must match PDF, not the stronger stock CM6 match');
   assert.notEqual(sourceColors.own.background,sourceColors.builtIn.background,
     'Inline LaTeX must be softer than the default CM6 selection match');
   assert.equal(sourceColors.own.boxShadow,sourceColors.builtIn.boxShadow,
     'LaTeX highlight must not add a custom underline or shadow');
   await exact('ocr:1:0:0');
   await page.waitForFunction(()=>document.querySelector('.lab-ocr-pdf-formula-focus')
     ?.dataset.formulaBlockId==='1');
   const displayColors=await page.evaluate(()=>({
     sourceIsInline:!!document.querySelector('.ocr-cm-source .ocr-four-pane-formula-inline'),
     pdfKind:document.querySelector('.lab-ocr-pdf-formula-focus')?.dataset.formulaKind,
     pdfFill:getComputedStyle(document.querySelector('.lab-ocr-pdf-formula-focus')).backgroundColor,
   }));
   assert.equal(displayColors.sourceIsInline,false);
   assert.equal(displayColors.pdfKind,'display');
   assert.notEqual(displayColors.pdfFill,inlineColors.pdfFill,
     'Display formulas retain their previous independent highlight color');
   assert.equal(await page.locator('.lab-ocr-latex-image img').count()>0,true,
     'Source-backed formula image must be present');
   // The optional MinerU CDN may deny access (403). The viewer must render
   // a trusted local PDF.js crop of the physical Span without remote image IO.
   await page.evaluate(()=>document.querySelector('.ocr-outline-grid')
     ?.ocrSqlGrid?.selectById({field:'formula_id',id:'ocr:1:0:0',
       focusColumn:'pdf_crop',preserveFilters:true}));
   await page.waitForFunction(()=>[...document.querySelectorAll(
     '.lab-ocr-latex-image-figure img[src^="data:image/png;base64,"]')]
     .some(el=>el.isConnected&&el.complete&&el.naturalWidth>0),null,{timeout:15000});
   assert.equal(await page.locator('.lab-ocr-latex-image a[href]').count(),0,
     'PDF crop is the only user-visible formula image: no MinerU URL links');
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
   const failure=page.locator('#workspace .ag-row-selected .ag-cell[col-id="render_status"] .lab-ocr-latex-render-fail');
   assert.equal(await failure.textContent(),'失败');
   assert.notEqual(await failure.evaluate(el=>getComputedStyle(el).color),successColor,
     'Render success / failure must have distinct status colors');
   await page.waitForFunction(()=>document.querySelector('.lab-ocr-pdf-formula-focus')
     ?.dataset.formulaBlockId==='3',null,{timeout:10000});
   assert.equal(await page.evaluate(()=>document.querySelector('.ocr-cm-source')
     ?.ocrCmTable?.editorView()?.state.selection.main.head),caretBefore);
   assert.equal(await page.locator('.ocr-cm-source .cm-line.ocr-four-pane-source-active').count(),0,
     'Unmatched OCR formula must not fabricate a highlighted MD line');
   assert.equal(await page.locator('.ocr-cm-source .ocr-four-pane-formula-active').count(),0);
   // A corrected formula in the same one-formula Block is displayed
   // from the current CM6 source, not the immutable bad MinerU original.
   await exact('ocr:5:0:0');
   const corrected=page.locator('#workspace .ag-row-selected:not(.ag-opacity-zero)');
   await page.waitForFunction(()=>{
     const cell=document.querySelector('#workspace .ag-row-selected:not(.ag-opacity-zero) .ag-cell[col-id="render_status"]');
     return cell?.textContent?.trim()==='成功';
   },null,{timeout:9000});
   // AG Grid virtualizes columns to the right; inspect its public row
   // port rather than assuming "来源" and "预览" cells are in the DOM.
   const revisedData=await page.evaluate(()=>document.querySelector('.ocr-outline-grid')
     ?.ocrSqlGrid?.selectById({field:'formula_id',id:'ocr:5:0:0',focusColumn:'formula',
       preserveFilters:true}));
   assert.equal(revisedData.match_status,'已修订');
   assert.equal(revisedData.formula,'(Equity_t^{MV}+Debt_t+Float_t)/Equity_t^{MV}');
   assert.equal(revisedData.original_formula,String.raw`\badcommand{Equity}`);
   assert(revisedData.render_html?.includes('katex'));
   assert.equal(await corrected.locator('.ag-cell[col-id="render_status"] .lab-ocr-latex-render-ok').count(),1);
   await page.waitForFunction(()=>{
     const cm=document.querySelector('.ocr-cm-source')?.ocrCmTable?.editorView();
     return cm?.state.selection.main.head===cm.state.doc.line(10).from+1;
   },null,{timeout:9000});
   await page.waitForFunction(()=>document.querySelector('.lab-ocr-pdf-formula-focus')
     ?.dataset.formulaBlockId==='5',null,{timeout:9000});
   // The additional MD-only formula still navigates its actual characters,
   // without inventing a precise PDF Span bbox.
   const mdOnly=findLatex(md.map(r=>r.text).join('\n')).find(x=>x.content==='q^2');
   assert(mdOnly);await exact(`md:latex-md-5:${mdOnly.from}`);
   await page.waitForFunction(()=>{
     const cm=document.querySelector('.ocr-cm-source')?.ocrCmTable?.editorView();
     return cm?.state.selection.main.head===cm.state.doc.line(5).from+37;
   },null,{timeout:9000});
   assert.equal(await page.locator('.lab-ocr-pdf-formula-focus').count(),0);
   assert.equal(await page.locator('.ocr-cm-source .ocr-four-pane-formula-active')
     .allTextContents().then(parts=>parts.join('')),'q^2');
   assert.equal(await page.locator('.ocr-cm-source .cm-editor').count(),1);
   assert.equal(await page.evaluate(()=>document.querySelector('.ocr-cm-source')
     ?.ocrCmTable?.mdDocument()),originalText,'Formula selection cannot modify Markdown');
   assert.equal(await page.evaluate(()=>document.querySelector('.ocr-cm-source')
     ?.ocrCmTable?.mdRuntime()?.dirty),false);
   assert.equal(saves,0,'Read-only formula view cannot generate SQL writes');
   assert.equal(remoteFormulaRequests,0,'AG must not fetch MinerU formula image URLs');
   // Switching away from LaTeX cleans both the CM6 decoration and the PDF
   // overlay. Preview retains rendered math but without the view-only tint.
   await picker.selectOption('md');
   await page.waitForFunction(()=>!document.querySelector('#workspace')
     ?.classList.contains('ocr-latex-all-active'));
   assert.equal(await page.locator('.ocr-cm-source .ocr-latex-view-formula-all').count(),0);
   assert.equal(await page.locator('.lab-ocr-pdf-formula-all').count(),0);
   assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector(
      '.ocr-preview-md-scroll .ocr-reviewed-inline-latex')).backgroundColor),
     'rgba(0, 0, 0, 0)');
   assert.equal(saves,0,'Switching AG views must never save Markdown');
   assert.deepEqual(errors,[],'No browser page errors');
   console.log('LAB_OCR_LATEX_VIEW_E2E_PASS',label,JSON.stringify({
     formulas:8,matched:6,revised:1,ocrOnly:1,mdOnly:1,saves,loaded}));
  }finally{await browser.close();}
 }
}finally{vite.kill('SIGTERM');}
