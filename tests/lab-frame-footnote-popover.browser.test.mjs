/** Shared Main footnote reader on the Frame's actual Markdown preview DOM.
 * No real document, CMD/SQL, AG, PDF or user workspace changes.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {chromium,webkit} from 'playwright';
const port=5299;
const url=`http://127.0.0.1:${port}/labs/lab-frame/`;
const server=spawn('node',['node_modules/vite/bin/vite.js','--config',
 'labs/lab-frame/vite.config.mjs','--host','127.0.0.1','--port',String(port),
 '--strictPort'],{stdio:['ignore','pipe','pipe']});
let output='';server.stdout.on('data',x=>output+=x);server.stderr.on('data',x=>output+=x);
const lines=['# Chapter','',
 'Source footnote[^7] in a sentence, and repeated footnote[^7].','',
 ...Array.from({length:28},(_,i)=>`Paragraph ${i+1}: a long passage repeats to fill the document. `.repeat(6)),
 '', '## Notes','',
 '[^7]: Here is the **original footnote** with a [link](https://example.org).',
 '    It continues on another physical Markdown line.',''];
const source=lines.join('\n');const sourceLine=3;
const definitionLine=lines.findIndex(x=>x.startsWith('[^7]:'))+1;
try{
 let ready=false;
 for(let i=0;i<120;i++){
   try{if((await fetch(url)).ok){ready=true;break;}}catch{}await sleep(160);
 }
 assert(ready,'Lab Frame preview unavailable: '+output.slice(-800));
 for(const [name,engine] of [['Chromium',chromium],['iPad-WebKit',webkit]]
   .filter(([name])=>!process.env.LAB_OCR_TEST_BROWSER||process.env.LAB_OCR_TEST_BROWSER===name)){
   const browser=await engine.launch({headless:true});
   try{
     const page=await browser.newPage({viewport:{width:1160,height:920},hasTouch:true});
     const errors=[];page.on('pageerror',e=>errors.push(e.message));
     await page.goto(url,{waitUntil:'domcontentloaded'});
     await page.evaluate(source=>{
       const holder=document.createElement('div');holder.id='footnote-test-host';
       holder.style.cssText='position:fixed;left:36px;top:28px;width:1020px;height:820px;z-index:1000;background:#2f383e';
       document.body.append(holder);
       window.__noteTestPromise=import('./layout.js').then(({createFrameWorkspace})=>{
         const frame=createFrameWorkspace(holder,{defaultPreview:'md'});
         frame.setSplit(false);
         window.__footnoteFrame=frame;window.__footnoteNavigations=[];
         frame.setMdPreviewNavigation(line=>window.__footnoteNavigations.push(line));
         frame.setMarkdownPreview(source);
       });
     },source);
     await page.evaluate(()=>window.__noteTestPromise);
     const preview=page.locator('#footnote-test-host .ocr-preview-md-scroll');
     const ref=preview.locator('sup.footnote-ref a[href="#fn1"]').first();
     await ref.waitFor({state:'visible',timeout:25000});
     assert.equal(await preview.locator('li.footnote-item[id="fn1"]').count(),1);
     const popupCount=await page.locator('.ocr-footnote-popover').count();
     assert(popupCount>=1);
     const card=page.locator('.ocr-footnote-popover').last();
     assert.equal(await preview.locator('li#fn1').getAttribute('data-source-start'),String(definitionLine));
     await ref.scrollIntoViewIfNeeded();
     if(name==='Chromium'){
       await ref.hover();
       await card.waitFor({state:'visible',timeout:3000});
       await page.mouse.move(0,0);
       await card.waitFor({state:'hidden',timeout:3000});
     }
     const original=await page.evaluate(()=>({
       hash:location.hash,
       top:document.querySelector('#footnote-test-host .ocr-preview-md-scroll').scrollTop,
       navigations:[...window.__footnoteNavigations],
     }));
     await ref.click();
     await card.waitFor({state:'visible'});
     assert.match(await card.textContent(),/Here is the original footnote/);
     assert.equal(await card.locator('.ocr-footnote-card-content strong').textContent(),'original footnote');
     assert.equal(await card.locator('a.footnote-backref').count(),0);
     const after=await page.evaluate(()=>({
       hash:location.hash,
       top:document.querySelector('#footnote-test-host .ocr-preview-md-scroll').scrollTop,
       navigations:[...window.__footnoteNavigations],
       rect:(()=>{const rect=document.querySelector('.ocr-footnote-popover').getBoundingClientRect();
         return {left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom};})(),
     }));
     assert.equal(after.hash,original.hash);
     assert.equal(after.top,original.top,'Card open must not scroll Markdown');
     assert.deepEqual(after.navigations,original.navigations,'Card open must not navigate any pane');
     assert(after.rect.left>=0&&after.rect.right<=1160&&
       after.rect.top>=0&&after.rect.bottom<=920,'Floating UI card stays inside viewport');
     await card.getByRole('button',{name:'定位注文'}).click();
     await page.waitForFunction(expected=>window.__footnoteNavigations?.at(-1)===expected,
       definitionLine,{timeout:12000});
     assert.equal(await card.isVisible(),false);
     const back=page.locator('#footnote-test-host .ocr-preview-return-note');
     assert.equal(await back.isVisible(),true);
     const arrived=await preview.evaluate(el=>{
       const note=el.querySelector('li#fn1').getBoundingClientRect();
       const bounds=el.getBoundingClientRect();
       return {scrollTop:el.scrollTop,visible:note.top>=bounds.top-24&&note.top<bounds.bottom};
     });
     assert(arrived.scrollTop>original.top+40,'Locate must scroll preview to note');
     assert(arrived.visible,'The located footnote must be in the preview viewport');
     await back.click();
     await page.waitForFunction(expected=>window.__footnoteNavigations?.at(-1)===expected,
       sourceLine,{timeout:12000});
     assert.equal(await back.isVisible(),false);
     const restored=await preview.evaluate(el=>el.scrollTop);
     assert(Math.abs(restored-original.top)<3,'Return must restore exact previous preview scroll');
     // Clicking a second time must reopen the exact Main card; Escape closes it.
     await ref.click();await card.waitFor({state:'visible'});
     await page.keyboard.press('Escape');await card.waitFor({state:'hidden'});
     await ref.click();await card.waitFor({state:'visible'});
     await page.evaluate(()=>window.__footnoteFrame.setMarkdownPreview('# New content without a footnote'));
     await card.waitFor({state:'hidden'});
     await page.waitForFunction(()=>document.querySelector('#footnote-test-host .ocr-preview-md-scroll')
       ?.textContent.includes('New content without a footnote'),null,{timeout:9000});
     assert.equal(await back.isVisible(),false);
     await page.evaluate(()=>window.__footnoteFrame.dispose());
     assert.equal(await page.locator('.ocr-footnote-popover').count(),popupCount-1);
     assert.deepEqual(errors,[]);
     console.log('LAB_FRAME_MAIN_FOOTNOTE_POPOVER_PASS',name,{definitionLine,sourceLine});
   }finally{await browser.close();}
 }
}finally{server.kill('SIGTERM');}
