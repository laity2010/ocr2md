/** Real data regression: chapter/001 has images, chapter/002 has none.
 * Media AG must display only current chapter references, never local inventory.
 * Browser tests are read-only and don't change the user's chapter files.
 */
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';

const base=process.env.OCR_LAB_TEST_URL||'https://192.168.1.10:4443/labs/cm-html/';
for(const [browserName,engine,options] of [
  ['Chrome',chromium,{viewport:{width:1250,height:820}}],
  ['iPad WebKit',webkit,{viewport:{width:1024,height:768},isMobile:true,hasTouch:true,deviceScaleFactor:2}],
]){
 const browser=await engine.launch({headless:true});
 try{
   const page=await browser.newPage({ignoreHTTPSErrors:base.startsWith('https:'),...options});
   const errors=[]; let documentRequests=0;
   page.on('pageerror',e=>errors.push(e.message));
   page.on('request',r=>{if(r.resourceType()==='document')documentRequests++;});
   await page.goto(base,{waitUntil:'domcontentloaded'});
   const nav=page.locator('.ocr-source-pane .ocr-lab-file-select');
   await page.waitForFunction(()=>document.querySelectorAll('.ocr-source-pane .ocr-lab-file-select option[value^="chapter:"]').length>=3,null,{timeout:28000});
   const entries=await nav.locator('option[value^="chapter:"]').evaluateAll(items=>items.map(i=>({name:i.textContent,value:i.value})));
   const chapter001=entries.find(item=>/^章节chapter\/001-/.test(item.name));
   const chapter002=entries.find(item=>/^章节chapter\/002-/.test(item.name));
   assert(chapter001&&chapter002,'Need chapters 001 and 002');
   // Confirm the source fixture rather than assuming zero media by filename.
   const src001=await (await page.request.get(base+'api/document?chapter='+encodeURIComponent(chapter001.value.slice(8)))).text();
   const src002=await (await page.request.get(base+'api/document?chapter='+encodeURIComponent(chapter002.value.slice(8)))).text();
   assert(/!\[[^\n]*\]\(/.test(src001),'001 must contain a Markdown image');
   assert(!/!\[[^\n]*\]\(/.test(src002)&&!/!\[\[media\//.test(src002),'002 must have no Markdown images');
   const picker=page.locator('.ocr-lab-ag-toolbar .ocr-lab-element-select');
   const rows=page.locator('.ocr-media-pane .ocr-media-grid .ocr-media-url');
   async function openMedia(entry){
     await nav.selectOption(entry.value);
     await page.waitForURL(u=>u.searchParams.get('chapter')===entry.value.slice(8),{timeout:15000});
     await picker.selectOption('media');
     await page.locator('.ocr-media-pane').waitFor({state:'visible',timeout:12000});
   }
   await openMedia(chapter001);
   await page.waitForFunction(()=>document.querySelectorAll('.ocr-media-pane .ocr-media-url').length>=1,null,{timeout:10000});
   const before=await rows.allTextContents();
   assert(before.length>0,'001 must show its referenced images');
   // Thumbnail markup alone is not proof of preview: image requests once
   // contained a literal ${scoped} and silently fell back to 無预览.
   await page.waitForFunction(prefix=>{
     const images=[...document.querySelectorAll('.ocr-media-pane .ocr-media-thumb')];
     return images.length===5 && images.every(img=>img.complete && img.naturalWidth>0 &&
       !img.hidden && img.src.startsWith(prefix+'media/') &&
       !img.src.includes('%7Bscoped%7D') && !img.src.includes('${scoped}'));
   },base,{timeout:18000});
   const previews=await page.locator('.ocr-media-pane .ocr-media-preview-link').evaluateAll(items=>
     items.map(link=>({href:link.href,src:link.querySelector('img')?.src,
       width:link.querySelector('img')?.naturalWidth,
       noPreview:!link.querySelector('.ocr-media-thumb-fallback')?.hidden})));
   assert(previews.every(p=>p.width>0&&!p.noPreview),'Local media thumbnails must actually load');
   await openMedia(chapter002);
   await page.waitForFunction(()=>document.querySelectorAll('.ocr-media-pane .ocr-media-url').length===0,null,{timeout:9000});
   await page.waitForTimeout(1100); // late inventory and status network responses
   assert.equal(await rows.count(),0,'002 must stay empty after async inventory/status');
   assert.equal(await page.locator('.ocr-media-pane .ocr-media-thumb').count(),0,'Old image previews leaked from 001');
   await openMedia(chapter001);
   await page.waitForFunction(()=>document.querySelectorAll('.ocr-media-pane .ocr-media-url').length>=1,null,{timeout:9000});
   await page.waitForTimeout(550);
   const after=await rows.allTextContents();
   assert(after.some(url=>before.includes(url)),'001 images did not return');
   assert.equal(documentRequests,1,'File switching unexpectedly reloaded the page');
   assert.deepEqual(errors,[]);
   console.log('CHAPTER_EMPTY_MEDIA_PASS',browserName,JSON.stringify({chapter001Images:before.length,loadedPreviewImages:previews.length,chapter002Images:0,afterReturn:after.length,documentRequests}));
 }finally{await browser.close();}
}
