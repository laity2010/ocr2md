/** Direct public loadPdf browser contract, with a genuine PDF.js text layer. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as pause} from 'node:timers/promises';
import {chromium,webkit} from 'playwright';
import {makeLabOcrPdf} from './helpers/lab-ocr-pdf-fixture.mjs';
const port=5328,host=`http://127.0.0.1:${port}`,url=process.env.LAB_OCR_TEST_URL||host+'/labs/lab-ocr/';
const book='/demo/ocr-book';
const dev=process.env.LAB_OCR_TEST_URL?null:spawn('node',['node_modules/vite/bin/vite.js','--config','labs/lab-ocr/vite.config.mjs',
 '--host','127.0.0.1','--port',String(port),'--strictPort'],{stdio:['ignore','pipe','pipe']});
let log='';dev?.stdout.on('data',b=>log+=b);dev?.stderr.on('data',b=>log+=b);
try{
 let ready=false;
 for(let i=0;i<120;i++){
  try{if((await fetch(url)).ok){ready=true;break;}}catch{}
  await pause(200);
 }
 assert(ready,'OCR Vite failed: '+log.slice(-800));
 for(const [name,engine] of [['Chromium',chromium],['iPad-WebKit',webkit]]){
  const browser=await engine.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:{width:1032,height:768},hasTouch:true,ignoreHTTPSErrors:true});
   page.setDefaultTimeout(18000);
   const errors=[];let pdfRequests=0;const overlayRequests=[];
   page.on('pageerror',error=>errors.push(error.message));
   page.on('console',message=>{if(message.type()==='error')console.error('BROWSER_ERROR',message.text());});
   await page.addInitScript(({book})=>{
    if(!localStorage.getItem('ocr2md.lab-ocr.settings.json.v1'))
      localStorage.setItem('ocr2md.lab-ocr.settings.json.v1',JSON.stringify({settings:{
      'workspace.dataDirectory':{key:'dataDirectory',category1:'工作区',category2:'目录',
        comment:'通用资料目录绑定；不检查 OCR、MinerU 或 PDF',
        value:book,range:{kind:'server-directory'}},
    }}));
   },{book});
   await page.route('**/api/workspace/browse?*',route=>{
     const path=new URL(route.request().url()).searchParams.get('path');
     return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({path,children:[]})});
   });
   await page.route('**/labs/lab-ocr/api/ocr/**',route=>{
    const operation=new URL(route.request().url()).pathname.split('/').pop();
    if(operation==='pdf'){
      pdfRequests++;
      assert.equal(new URL(route.request().url()).searchParams.get('workspace'),book);
      return route.fulfill({status:200,contentType:'application/pdf',body:makeLabOcrPdf()});
    }
    if(operation==='overlays'){
      const params=new URL(route.request().url()).searchParams;
      assert.equal(params.get('workspace'),book);
      const level=params.get('level'),number=Number(params.get('page'));
      assert(['span','block'].includes(level)&&number>=1&&number<=3);
      overlayRequests.push(level+':'+number);
      const fixtures={
        block:{1:[{id:'block-1',bbox:[72,60,360,155]},{id:'block-2',bbox:[30,180,400,260]}],
          3:[{id:'block-3',bbox:[90,130,240,200]}]},
        span:{1:[{id:'span-1',bbox:[72,60,210,90]},{id:'span-2',bbox:[225,60,360,90]}],
          3:[{id:'span-3',bbox:[90,130,150,150]}]},
      };
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
        level,page:number,pageSize:[595,842],boxes:(fixtures[level][number]||[]).map(box=>({...box,blockGroup:'para_blocks'}))})});
    }
    if(operation==='block-edit-state')return route.fulfill({status:200,contentType:'application/json',
      body:'{"revision":0,"canUndo":false,"canRedo":false}'});
    if(operation==='inspect')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
      status:'unchanged',blocks:2,pages:3,pdf:'original.pdf',sources:[{name:'mineru.json',pages:3}]})});
    if(operation==='minerujson2block')return route.fulfill({status:200,contentType:'application/json',body:'{"blocks":2}'});
    if(operation==='minerujson2span')return route.fulfill({status:200,contentType:'application/json',body:'{"spans":2}'});
    if(operation==='rows'){
      assert.equal(new URL(route.request().url()).searchParams.get('table'),'block');
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({table:'block',total:2,rows:[
        {block_id:1,global_page:0,block_group:'para_blocks',pbs:'p1b0',parent_block_id:null,block_type:'text',
          block_bbox_json:'[72,60,360,155]',block_json:'{"type":"text"}'},
        {block_id:2,global_page:0,block_group:'para_blocks',pbs:'p1b1',parent_block_id:null,block_type:'text',
          block_bbox_json:'[30,180,400,260]',block_json:'{"type":"text"}'},
      ]})});
    }
    throw Error('Unexpected OCR API: '+operation);
   });
   const response=await page.goto(url,{waitUntil:'domcontentloaded'});
   assert.equal(response.status(),200);
   await page.waitForFunction(()=>document.querySelector('.lab-ocr-pdf-root canvas')&&
     document.querySelector('.lab-ocr-pdf-placeholder')?.hidden&&
     document.querySelector('.lab-ocr-pdf-count')?.textContent==='/ 3',null,{timeout:17000}).catch(async error=>{
       console.error('PDF_DIAGNOSTIC',JSON.stringify(await page.evaluate(()=>({
         status:document.querySelector('#status')?.textContent,
         pdfRoot:!!document.querySelector('.lab-ocr-pdf-root'),
         placeholder:document.querySelector('.lab-ocr-pdf-placeholder')?.textContent,
         pages:document.querySelectorAll('.lab-ocr-pdf-scroller .page').length,
         canvas:document.querySelectorAll('.lab-ocr-pdf-root canvas').length,
         workspaceHidden:document.querySelector('#workspace')?.hidden,
         frameStatus:document.querySelector('.ocr-detached-pdf-pane')?.innerText?.slice(0,220),
       }))));console.error('REQUESTS',pdfRequests,'JS_ERRORS',errors);throw error;
     });
   assert.equal(await page.locator('.lab-ocr-pdf-scroller .page').count(),3);
   assert.ok(await page.locator('.lab-ocr-pdf-scroller .textLayer').count()>=1);
   assert.equal(pdfRequests,1,'PDF must warm up via one authenticated request');
   assert.equal(await page.locator('.lab-ocr-pdf-surface').getAttribute('data-pdf-theme'),'dark');
   assert.equal(await page.locator('.lab-ocr-pdf-controls button').count(),0,'No extra PDF buttons');
   assert.equal(await page.locator('.lab-ocr-pdf-controls input').count(),1);
   assert.equal(await page.locator('.lab-ocr-pdf-controls select').count(),2);
   const previewMode=page.locator('#workspace .ocr-preview-mode');
   const split=page.locator('.ocr-preview-split-toggle input');
   const detached=page.locator('.ocr-detached-pdf-host');
   const scale=page.locator('.lab-ocr-pdf-scale');
   const pageInput=page.locator('.lab-ocr-pdf-page');
   assert.equal(await split.isChecked(),false,'Lab OCR starts unsplit');
   assert.equal(await previewMode.inputValue(),'pdf','Lab OCR defaults to PDF original');
   assert.equal(await previewMode.locator('option[value="pdf"]').isEnabled(),true);
   assert.equal(await detached.count(),0,'No detached pane on initial load');
   assert.equal(await page.locator('.ocr-preview-pane>.ocr-preview-pdf-host .lab-ocr-pdf-root').count(),1);
   assert.equal(await page.locator('.ocr-preview-mode-tools .lab-ocr-pdf-scale').isVisible(),true);
   const overlaySelect=page.locator('.lab-ocr-pdf-overlay-level');
   await page.waitForFunction(()=>document.querySelector('.lab-ocr-pdf-overlay-level')?.value==='block'&&
     document.querySelectorAll('.lab-ocr-pdf-overlay-layer[data-level="block"][data-page="1"] .lab-ocr-pdf-overlay-box').length===2);
   assert.equal(await overlaySelect.isEnabled(),true);
   assert.equal(await overlaySelect.inputValue(),'block');
   assert.equal(await page.locator('.lab-ocr-pdf-overlay-layer[data-page="1"][data-level="block"] .lab-ocr-pdf-overlay-box').count(),2);
   const geometry=await page.locator('.lab-ocr-pdf-overlay-layer[data-page="1"] .lab-ocr-pdf-overlay-box').first().evaluate(el=>{
     const b=el.getBoundingClientRect(),p=el.closest('.page').getBoundingClientRect();
     return {left:(b.left-p.left)/p.width,top:(b.top-p.top)/p.height,
       width:b.width/p.width,height:b.height/p.height,
       pointer:getComputedStyle(el).pointerEvents};
   });
   assert(Math.abs(geometry.left-72/595)<.005&&Math.abs(geometry.top-60/842)<.005,
     'Overlay must use MinerU pageSize coordinates: '+JSON.stringify(geometry));
   assert(Math.abs(geometry.width-288/595)<.005&&Math.abs(geometry.height-95/842)<.005);
   assert.equal(geometry.pointer,'none','Coverage overlay cannot block PDF text selection');
   const appearance=()=>page.locator('.lab-ocr-pdf-overlay-layer[data-page="1"] .lab-ocr-pdf-overlay-box').first()
     .evaluate(box=>({stroke:getComputedStyle(box).boxShadow.match(/(\d+(?:\.\d+)?)px inset/)?.[1]||null,
       opacity:getComputedStyle(box.closest('.lab-ocr-pdf-overlay-layer')).opacity}));
   assert.deepEqual(await appearance(),{stroke:'0.75',opacity:'0.35'},
     'Default settings apply without opening global settings');
   // Validate actual paper pixels rather than trusting the dark toolbar.
   const screenshot=await page.locator('.lab-ocr-pdf-scroller .page canvas').first().screenshot();
   const visual=await page.evaluate(async base64=>{
     const picture=new Image();picture.src='data:image/png;base64,'+base64;
     await picture.decode();
     const sample=document.createElement('canvas');
     sample.width=picture.naturalWidth;sample.height=picture.naturalHeight;
     const ctx=sample.getContext('2d',{willReadFrequently:true});ctx.drawImage(picture,0,0);
     const pixel=(x,y)=>Array.from(ctx.getImageData(x,y,1,1).data).slice(0,3);
     let bright=0,peak=0;
     const span=Math.min(180,sample.height);
     for(let y=25;y<span;y+=2)for(let x=25;x<Math.min(sample.width,240);x+=2){
       const rgb=pixel(x,y);
       const level=Math.max(...rgb);
       if(level>160)bright++;
       peak=Math.max(peak,level);
     }
     const canvas=document.querySelector('.lab-ocr-pdf-scroller .page canvas');
     const pageEl=document.querySelector('.lab-ocr-pdf-scroller .page');
     return {paper:pixel(20,20),peak,bright,filter:getComputedStyle(canvas).filter,
       pageBg:getComputedStyle(pageEl).backgroundColor};
   },screenshot.toString('base64'));
   assert(visual.paper.every(channel=>channel>=10&&channel<55),
     'Paper should be charcoal, not pure black: '+JSON.stringify(visual));
   assert(visual.bright>4&&visual.peak>=160&&visual.peak<220,
     'Ink must stay legible, but no dazzling white: '+JSON.stringify(visual));
   assert.match(visual.filter,/invert\(1\).*brightness\(0\.82\).*contrast\(0\.84\)/,
     'PDF should use muted dark-paper filter, not just dark chrome');
   console.log('LAB_OCR_PDF_DARK_PAPER_PASS',name,JSON.stringify(visual));
   const originalRoot=await page.locator('.lab-ocr-pdf-root').evaluate(node=>{
     window.__labPdfRoot=node;return node.isConnected;
   });
   assert.equal(originalRoot,true);
   assert.deepEqual(await scale.locator('option').allTextContents(),
     ['适宽','25%','50%','75%','100%','125%','150%','200%','300%','400%']);
   assert.equal(await scale.inputValue(),'page-width');
   await pageInput.fill('3');await pageInput.press('Tab');
   await page.waitForFunction(()=>document.querySelector('.lab-ocr-pdf-page')?.value==='3');
   assert.equal(await page.locator('.lab-ocr-pdf-count').innerText(),'/ 3');
   await page.waitForFunction(()=>document.querySelector('.lab-ocr-pdf-overlay-layer[data-page="3"] .lab-ocr-pdf-overlay-box'));
   assert(overlayRequests.includes('block:3'),'Page navigation should lazily load page 3');
   await overlaySelect.selectOption('span');
   await page.waitForFunction(()=>document.querySelector('.lab-ocr-pdf-overlay-layer[data-page="3"][data-level="span"] .lab-ocr-pdf-overlay-box'));
   assert.equal(await page.locator('.lab-ocr-pdf-overlay-layer[data-page="3"] .lab-ocr-pdf-overlay-box').count(),1);
   assert(overlayRequests.includes('span:3'));
   assert.equal(await page.locator('.lab-ocr-pdf-overlay-layer[data-page="3"][data-level="span"] .lab-ocr-pdf-overlay-box').first()
     .evaluate(box=>getComputedStyle(box).boxShadow.includes('0.75px')),true,
     'Span should share the Block border-width setting');
   await overlaySelect.selectOption('off');
   assert.equal(await page.locator('.lab-ocr-pdf-overlay-layer').count(),0,'Off removes all coverage');
   await overlaySelect.selectOption('block');
   await page.waitForFunction(()=>document.querySelector('.lab-ocr-pdf-overlay-layer[data-page="3"][data-level="block"] .lab-ocr-pdf-overlay-box'));
   await scale.selectOption('100');
   assert.equal(await scale.inputValue(),'100');
   await page.waitForFunction(()=>document.querySelector('.lab-ocr-pdf-scroller .page')?.getBoundingClientRect().width>650);
   const widthAt100=await page.locator('.lab-ocr-pdf-scroller .page').first().evaluate(el=>el.getBoundingClientRect().width);
   await scale.selectOption('page-width');
   assert.equal(await scale.inputValue(),'page-width');
   await previewMode.selectOption('md');
   assert.equal(await previewMode.inputValue(),'md');
   await previewMode.selectOption('pdf');
   await page.waitForFunction(()=>document.querySelector('.ocr-preview-pane')?.dataset.previewMode==='pdf');
   assert.equal(await page.locator('.ocr-preview-mode-tools .lab-ocr-pdf-scale').isVisible(),true);
   assert.equal(await page.locator('.ocr-preview-pane>.ocr-preview-pdf-host canvas').count()>0,true);
   assert.equal(await page.evaluate(()=>document.querySelector('.lab-ocr-pdf-root')===window.__labPdfRoot),true,
     'Single preview must reuse the warmed PDFViewer, not rebuild it');
   assert.equal(pdfRequests,1,'Unsplit PDF must NOT request bytes again');
   await page.locator('.ocr-preview-mode-tools .lab-ocr-pdf-scale').selectOption('75');
   await page.waitForFunction(width=>Math.abs(document.querySelector('.lab-ocr-pdf-scroller .page')?.getBoundingClientRect().width-width*.75)<5,widthAt100);
   await previewMode.selectOption('md');
   await page.waitForFunction(()=>document.querySelector('.ocr-preview-pane')?.dataset.previewMode==='md');
   await previewMode.selectOption('pdf');
   assert.equal(await page.locator('.ocr-preview-pane>.ocr-preview-pdf-host canvas').count()>0,true);
   await split.check();
   await page.waitForFunction(()=>!!document.querySelector('.ocr-detached-pdf-pane'));
   assert.equal(await previewMode.inputValue(),'md');
   assert.equal(await previewMode.locator('option[value="pdf"]').isDisabled(),true);
   assert.equal(await page.locator('.ocr-detached-pdf-host .lab-ocr-pdf-root').count(),1);
   assert.equal(await page.evaluate(()=>document.querySelector('.lab-ocr-pdf-root')===window.__labPdfRoot),true);
   assert.equal(await page.locator('.lab-ocr-pdf-scale').inputValue(),'75','Zoom selection must persist');
   assert.equal(pdfRequests,1,'Re-splitting must not re-request PDF');
   assert.equal(await page.locator('.ocr-detached-pdf-pane .lab-ocr-pdf-overlay-level').inputValue(),'block');
   await split.uncheck();
   await previewMode.selectOption('pdf');
   assert.equal(await page.locator('.ocr-preview-mode-tools .lab-ocr-pdf-controls').count(),1);
   assert.equal(pdfRequests,1);
   assert(overlayRequests.length<=12,'Coverage fetches should be page-scoped, not full-document: '+overlayRequests);
   // Exercise the EXISTING global Settings AG -> slider -> source transaction.
   await page.locator('.ocr-ag-module-select').first().selectOption('settings');
   await page.locator('#settings-workspace .ag-row').filter({hasText:'borderWidth'}).first().waitFor({state:'visible'});
   const changeSetting=async(key,label,value)=>{
     await page.locator('#settings-workspace .ag-row').filter({hasText:key}).first().click();
     const slider=page.locator('#settings-workspace input[type="range"][aria-label="'+label+'"]');
     await slider.waitFor({state:'visible'});
     await slider.evaluate((el,next)=>{el.value=String(next);el.dispatchEvent(new Event('input',{bubbles:true}));},value);
   };
   await changeSetting('borderWidth','覆盖框边框粗细',0.5);
   await page.waitForFunction(()=>document.querySelector('#workspace')?.style.getPropertyValue('--lab-ocr-pdf-overlay-border-width')==='0.5px');
   await changeSetting('transparency','覆盖框透明度',80);
   await page.waitForFunction(()=>document.querySelector('#workspace')?.style.getPropertyValue('--lab-ocr-pdf-overlay-opacity')==='0.2');
   // PDF may be hidden and virtualized while the Settings workspace is open;
   // the same CSS variables already apply to both types without reloading.
   assert.equal(pdfRequests,1,'CSS appearance change cannot re-download PDF');
   await page.locator('#global-save').click();
   await page.waitForFunction(()=>{
     const data=JSON.parse(localStorage.getItem('ocr2md.lab-ocr.settings.json.v1')||'{}');
     return data.settings?.['pdf.overlay.borderWidth']?.value===0.5&&
       data.settings?.['pdf.overlay.transparency']?.value===80;
   });
   await page.waitForFunction(()=>document.querySelector('#workspace')&&!document.querySelector('#workspace').hidden);
   await page.waitForFunction(()=>document.querySelector('.lab-ocr-pdf-overlay-box'),null,{timeout:22000});
   assert.deepEqual(await appearance(),{stroke:'0.5',opacity:'0.2'},'Live settings must affect visible PDF');
   await page.reload({waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>document.querySelector('.lab-ocr-pdf-overlay-box')&&
     document.querySelector('.lab-ocr-pdf-placeholder')?.hidden,null,{timeout:19000});
   assert.deepEqual(await appearance(),{stroke:'0.5',opacity:'0.2'},'Style must survive reload');
   assert.deepEqual(errors,[]);
   console.log('LAB_OCR_PDF_API_PASS',name,JSON.stringify({pages:3,pdfRequests,overlayRequests,previewMode:'pdf',singleViewer:true}));
  }finally{await browser.close();}
 }
}finally{dev?.kill('SIGTERM');}
