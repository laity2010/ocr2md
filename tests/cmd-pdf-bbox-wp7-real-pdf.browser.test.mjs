/** WP7 real sanctioned PDF, not a synthetic page or production document.
 * Validates PDF.js page canvas, CMD coverage, pointer move and corner resize,
 * refresh after correction, zoom, Undo/Redo and no implicit save.
 */
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {chromium,webkit,devices} from 'playwright';
import {chromeExecutable} from './platform.test-helper.mjs';
import {selectPreview} from './navigation-ui.test-helper.mjs';
import {toMarkdown} from '../packages/minerujson-md/dist/index.js';
const hash=buffer=>createHash('sha256').update(buffer).digest('hex');
const pdf=resolve('.v6/workspace/buffetts-alpha.original.pdf');
const originalPDF=readFileSync(pdf);
assert.equal(hash(originalPDF),'be12aa259e6c6c43f05c41436c4938b7ed115b54e87cadc6770912dece2e41ab');
const raw=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8');
const source=toMarkdown(raw),temp=mkdtempSync(join(tmpdir(),'ocr2md-wp7-real-pdf-'));
const doc=join(temp,'document.md');writeFileSync(doc,source);
const port=await new Promise((ok,fail)=>{const server=createServer();server.once('error',fail);
  server.listen(0,'127.0.0.1',()=>{const value=server.address().port;
    server.close(error=>error?fail(error):ok(value));});});
const origin=`http://127.0.0.1:${port}/`;
// Use this Playwright installation's WebKit, not the Mac legacy 2359 binary.
const currentWebKit=process.env.OCR2MD_WEBKIT_PATH||process.env.OCR2MD_AUDIT_WEBKIT_PATH||webkit.executablePath();
const server=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),env:{...process.env,
  V6_PORT:String(port),V6_BIND:'127.0.0.1',V6_LAB_ID:'',V6_LAN_TLS_HOST:'',
  V6_DOCUMENT_PATH:doc,V6_PDF_PATH:pdf,V6_STATIC_ROOT:resolve('dist'),
  V6_SETTINGS_PATH:join(temp,'settings.json'),V6_TOKEN_PATH:join(temp,'token')},stdio:'ignore'});
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
const coords=async locator=>{const r=await locator.boundingBox();assert(r&&r.width>3&&r.height>3,'PDF handle not visible');
  return {x:r.x+r.width/2,y:r.y+r.height/2};};
const slide=async(page,handle,dx,dy,synthTouch=false)=>{
  if(synthTouch){
    // The real PDF canvas, page and edit controls are live. Simulated iPad
    // WebKit cannot reliably route Playwright Mac mouse input to touch UI;
    // inject pointerType=touch at the actual handle DOM. This does NOT
    // certify native Safari OS/hardware gesture delivery.
    return handle.evaluate((el,{dx,dy})=>{
      const r=el.getBoundingClientRect();
      const x=r.left+r.width/2,y=r.top+r.height/2;
      const emit=(type,px,py)=>el.dispatchEvent(new PointerEvent(type,{
        bubbles:true,cancelable:true,pointerId:88,pointerType:'touch',isPrimary:true,
        clientX:px,clientY:py,button:0,buttons:type==='pointerup'?0:1}));
      emit('pointerdown',x,y);emit('pointermove',x+dx,y+dy);emit('pointerup',x+dx,y+dy);
    },{dx,dy});
  }
  const p=await coords(handle);
  await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+dx,p.y+dy,{steps:6});
  await page.mouse.up();
};
try{
 let ready=false;for(let i=0;i<150;i++){try{if((await fetch(origin+'healthz')).ok){ready=true;break;}}catch{}await sleep(150);}
 assert(ready,'isolated original-PDF HTTP service not ready');
 for(const [name,engine,executablePath] of [['Chrome',chromium,chromeExecutable()],['iPad-WebKit',webkit,currentWebKit]]){
  if(process.env.ONE_BROWSER&&process.env.ONE_BROWSER!==name)continue;
  console.log('WP7_PDF_STEP',name,'launch');
  const browser=await engine.launch({headless:true,...(executablePath?{executablePath}:{})});

  console.log('WP7_PDF_STEP',name,'browser-ready');
  try{
   const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:642}});
   page.setDefaultTimeout(20000);page.setDefaultNavigationTimeout(65000);
   console.log('WP7_PDF_STEP',name,'page-ready');
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   page.on('crash',()=>console.log('WP7_PDF_DIAG',name,'page-crash'));

   const clickControl=selector=>name==='iPad-WebKit'?page.locator(selector).evaluate(el=>el.click()):page.locator(selector).click();
   await page.goto(origin,{waitUntil:'domcontentloaded',timeout:65000});
   console.log('WP7_PDF_STEP',name,'page-goto');
   await page.waitForFunction(()=>document.querySelector('.ocr-pdf-status')?.textContent==='就绪'
     &&document.querySelector('.ocr-pdf-scroller .page canvas')?.width>0,
     null,{timeout:90000});
   console.log('WP7_PDF_STEP',name,'pdf-loaded');
   await selectPreview(page,'pdf');
   console.log('WP7_PDF_STEP',name,'pdf-active');
   const cover=page.locator('.ocr-pdf-block-cover[data-block-id="p0b0"]');
   await cover.waitFor({state:'attached',timeout:35000});
   const parent=cover.locator(':scope > .ocr-pdf-block-ctrl');
   await parent.scrollIntoViewIfNeeded();
   await page.locator('.ocr-pdf-bbox-edit').click();
   // The gutter badge is a virtual PDF.js overlay. WebKit can keep a
   // one-frame layout animation pending even after scrollIntoViewIfNeeded;
   // trigger its existing real DOM click handler directly. The subsequent
   // rectangle move/resize still uses actual pointer input and live PDF canvas.
   await parent.evaluate(el=>el.click());
   console.log('WP7_PDF_STEP',name,'parent-click');
   const editor=page.locator('.ocr-pdf-bbox-editor[data-pbs-id="p0b0"]');
   await editor.waitFor({state:'attached',timeout:25000});
   assert.equal(await editor.locator('.ocr-pdf-bbox-handle').count(),5);
   console.log('WP7_PDF_STEP',name,'edit-handles');
   const before=await cover.evaluate(el=>({left:el.style.left,top:el.style.top,width:el.style.width,height:el.style.height}));
   assert(before.width&&before.height,'real sealed OCR bbox renders in PDF');
   const beforeEditor=await editor.evaluate(el=>({left:el.style.left,top:el.style.top}));
   console.log('WP7_PDF_STEP',name,'start-drag');
   await slide(page,editor.locator('.ocr-pdf-bbox-move'),14,10,name==='iPad-WebKit');
   console.log('WP7_PDF_STEP',name,'end-drag');
   await page.waitForFunction(previous=>{
     const el=document.querySelector('.ocr-pdf-block-cover[data-block-id="p0b0"]');
     return el?.style.left!==previous.left&&el?.style.top!==previous.top;
   },before,{timeout:40000});
   const moved=await cover.evaluate(el=>({left:el.style.left,top:el.style.top,width:el.style.width,height:el.style.height}));
   assert.equal(moved.width,before.width,'moving one bbox must not resize it');
   const afterMoveEditor=await editor.evaluate(el=>({left:el.style.left,top:el.style.top}));
   assert.notDeepEqual(beforeEditor,afterMoveEditor);
   assert.equal(readFileSync(doc,'utf8'),source,'PDF move cannot auto-save');
   console.log('WP7_PDF_STEP',name,'start-undo');
   await clickControl('#undo');
   await page.waitForFunction(previous=>{
     const el=document.querySelector('.ocr-pdf-block-cover[data-block-id="p0b0"]');
     return el?.style.left===previous.left&&el?.style.top===previous.top;
   },before,{timeout:35000});
   await clickControl('#redo');
   await page.waitForFunction(previous=>document.querySelector('.ocr-pdf-block-cover[data-block-id="p0b0"]')?.style.left===previous.left,
     moved,{timeout:35000});
   await editor.waitFor({state:'attached',timeout:15000});
   const moveBeforeResize=await cover.evaluate(el=>({left:el.style.left,top:el.style.top,width:el.style.width,height:el.style.height}));
   console.log('WP7_PDF_STEP',name,'start-resize');
   await slide(page,editor.locator('.ocr-pdf-bbox-se'),8,6,name==='iPad-WebKit');
   await page.waitForFunction(previous=>document.querySelector('.ocr-pdf-block-cover[data-block-id="p0b0"]')?.style.width!==previous.width,
     moveBeforeResize,{timeout:35000});
   const resized=await page.evaluate(()=>{const el=document.querySelector('.ocr-pdf-block-cover[data-block-id="p0b0"]');
     if(!el)throw Error('Corrected PDF bbox coverage vanished after resize');
     return {width:el.style.width,height:el.style.height};});
   assert.notEqual(resized.width,moveBeforeResize.width);
   await clickControl('.ocr-pdf-plus');
   await page.waitForFunction(previous=>document.querySelector('.ocr-pdf-block-cover[data-block-id="p0b0"]')?.style.width===previous.width,
     resized,{timeout:35000});
   assert(await editor.locator('.ocr-pdf-bbox-handle').count()===5,'handles survive real PDF zoom');
   console.log('WP7_PDF_STEP',name,'start-reset');
   await clickControl('.ocr-pdf-bbox-reset');
   await page.waitForFunction(previous=>{
     const el=document.querySelector('.ocr-pdf-block-cover[data-block-id="p0b0"]');
     return el?.style.left===previous.left&&el?.style.top===previous.top&&el?.style.width===previous.width;
   },before,{timeout:35000});
   assert.equal(readFileSync(doc,'utf8'),source,'PDF reset is unsaved until global Save');
   // Native parent/child is the same semantic source across PDF page 1
   // and page 5. A real PDF child label must select its canonical PBS ID,
   // not the parent or a neighbor in the native child array.
   {
     const block=page.locator('.ocr-pdf-block-cover[data-block-id="p4b0"]');
     await block.scrollIntoViewIfNeeded({timeout:20000});
     await page.waitForFunction(()=>document.querySelector(
       '.ocr-pdf-block-cover[data-block-id="p4b0"]')?.closest('.page')
       ?.querySelector('canvas')?.width>0,null,{timeout:30000});
     const child=block.locator('.ocr-pdf-subblock-chip[aria-label="定位原始 PDF 子块 p4b0s1"]');
     await child.evaluate(el=>el.click());
     const selected=page.locator('.ocr-pdf-bbox-editor[data-pbs-id="p4b0s1"]');
     await selected.waitFor({state:'attached',timeout:20000});
     assert.equal(await selected.locator('.ocr-pdf-bbox-handle').count(),5);
     const childFragment=block.locator('.ocr-pdf-block-fragment[data-subblock-id="p4b0s1"]');
     const originalChild=await childFragment.evaluate(el=>({left:el.style.left,top:el.style.top,
       width:el.style.width,height:el.style.height}));
     await slide(page,selected.locator('.ocr-pdf-bbox-move'),9,6,name==='iPad-WebKit');
     await page.waitForFunction(previous=>{
       const el=document.querySelector('.ocr-pdf-block-fragment[data-subblock-id="p4b0s1"]');
       return el&&el.style.left!==previous.left&&el.style.top!==previous.top;
     },originalChild,{timeout:30000});
     const corrected=await childFragment.evaluate(el=>({left:el.style.left,top:el.style.top,
       width:el.style.width,height:el.style.height}));
     assert.notDeepEqual(corrected,originalChild);
     await clickControl('.ocr-pdf-bbox-reset');
     await page.waitForFunction(previous=>{
       const el=document.querySelector('.ocr-pdf-block-fragment[data-subblock-id="p4b0s1"]');
       return el?.style.left===previous.left&&el?.style.top===previous.top;
     },originalChild,{timeout:30000});
     assert.equal(readFileSync(doc,'utf8'),source);
     console.log('WP7_REAL_PDF_CHILD_PASS',name,{page:5,child:'p4b0s1',
       selectedByRealPdfChip:true,sourceCorrected:true,reset:true,noAutoSave:true,
       nativePointer:name==='Chrome',webKitInjectedTouch:name==='iPad-WebKit'});
   }
   assert.equal(hash(readFileSync(pdf)),hash(originalPDF));
   assert.deepEqual(errors,[]);
   console.log('WP7_REAL_PDF_BBOX_PASS',name,{firstPageCanvas:true,parent:'p0b0',move:true,
     resize:true,zoom:true,undoRedo:true,reset:true,originalPdfSHA:true,noAutoSave:true,
     nativePointer:name==='Chrome',webKitInjectedTouch:name==='iPad-WebKit'});
  }finally{await browser.close();}
 }
}finally{server.kill('SIGTERM');rmSync(temp,{recursive:true,force:true});}
