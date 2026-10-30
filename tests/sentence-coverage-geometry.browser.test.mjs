/** Safari regression: late-loaded image must not leave stale sentence rectangles on top of charts. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium,webkit} from 'playwright';
import {extractTextBlocks,segmentSentences,planSentenceMarks} from '../ui/cmd-sentences.js';
import {formatAnnotation,scanAnnotations} from '../ui/cmd-annotations.js';

const original=[
 '<!-- minerujson:block:v1:1:0 -->','',
 'Before the chart, this is the first complete sentence. A second sentence is here.','',
 '<!-- minerujson:block:v1:1:10 -->','',
 'An escaped \\# symbol must match its rendered text. This sentence is normal.','',
 '<!-- minerujson:block:v1:1:11 -->','',
 'We show that the portfolio performed well.<!--ocr2md:note-ref id="3"-->[^3] This finding is consistent with the expected trend.','',
 '<!-- minerujson:block:v1:1:1 -->','',
 '![chart](https://example.invalid/delayed-image.png)','',
 '<!-- minerujson:block:v1:1:2 -->','',
 'After the chart, the notes explain the result. Another complete sentence follows.','',
 '<!-- minerujson:block:v1:1:3 -->','',
 'The last paragraph remains independent of the preceding notes.','',
 '[^3]: Footnote explaining the results.','',
 '<!-- minerujson:source:v1','{"evidence":"preserve"}','-->',
].join('\n');
const rows=segmentSentences(extractTextBlocks(original,{bodyEnd:original.indexOf('<!-- minerujson:source:v1')}));
const ops=planSentenceMarks(original,rows,[]);
assert(rows.some(row=>row.text.startsWith('This finding is consistent')),
  'Footnote reference must not prefix the following sentence');
const marked=ops.sort((a,b)=>b.at-a.at).reduce((text,op)=>
 text.slice(0,op.at)+formatAnnotation(op.tag,op.attributes)+text.slice(op.at),original);
assert.equal(planSentenceMarks(marked,segmentSentences(extractTextBlocks(marked,{bodyEnd:marked.indexOf('<!-- minerujson:source:v1')})),
 scanAnnotations(marked)).length,0,'Re-entering annotated CMD must not duplicate anchors');
const dir=mkdtempSync(join(tmpdir(),'ocr2md-geometry-'));
const doc=join(dir,'document.md');writeFileSync(doc,marked);
const shots=join('.v6','evidence','sentence-geometry');mkdirSync(shots,{recursive:true});
const port=5991,base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{
 cwd:process.cwd(),stdio:'ignore',env:{...process.env,V6_DOCUMENT_PATH:doc}});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{
 let started=false;
 for(let i=0;i<160;i++){try{if((await fetch(base)).ok){started=true;break;}}catch{}await sleep(100)}
 assert(started,'isolated Vite did not start');
 for(const [name,engine,mobile] of [['Chrome',chromium,false],['iPad-WebKit',webkit,true]]){
  const browser=await engine.launch({headless:true});
  try{
   let releaseImage;
   const imageGate=new Promise(resolve=>{releaseImage=resolve;});
   const page=await browser.newPage({viewport:{width:1100,height:800},isMobile:mobile,hasTouch:mobile});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/delayed-image.png',async route=>{
     await imageGate;
     await route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#eef5f5"/><text x="20" y="70" font-size="40">Chart</text></svg>'});
   });
   await page.goto(base,{waitUntil:'domcontentloaded',timeout:70000});
   await page.locator('#editor .cm-content').waitFor();
   await page.locator('.ocr-lab-ag-toolbar .ocr-navigation-elements .ts-control').click();
   await page.locator('.ocr-navigation-popup-elements:visible [data-value="sentence"]').click();
   await page.waitForFunction(()=>/CMD 已标定 9 句/.test(document.querySelector('.ocr-sentence-state')?.textContent||''));
   await page.locator('#sentence-cover-all').check();
   await page.waitForFunction(()=>((CSS.highlights.get('ocr-covered-sentences')?.size||0)+
     document.querySelectorAll('.ocr-sentence-cover-span').length)>=4);
   const hasFootnoteCoverage=await page.evaluate(()=>{
     const all=[...(CSS.highlights.get('ocr-covered-sentences')||[])].map(x=>x.toString())
       .concat([...document.querySelectorAll('.ocr-sentence-cover-span')].map(n=>n.dataset.text||''));
     return all.some(text=>text.includes('This finding is consistent with the expected trend.'));
   });
   assert(hasFootnoteCoverage,'The footnote-following sentence must be visibly painted');
   await page.locator('.ocr-markdown p').filter({hasText:'This finding is consistent'}).scrollIntoViewIfNeeded();
   await page.screenshot({path:join(shots,`${name}-footnote-covered.png`)});
   await page.screenshot({path:join(shots,`${name}-01-before-image.png`)});
   releaseImage();
   await page.locator('.ocr-markdown img').evaluate(async img=>{img.loading='eager';await img.decode();});
   await page.waitForTimeout(550); // allow throttled ResizeObserver / image load recalculation
   const geometry=await page.evaluate(()=>{
     const body=document.querySelector('.ocr-markdown');
     const img=body.querySelector('img');
     const imgRect=img.getBoundingClientRect();
     const overlays=[...body.querySelectorAll('.ocr-sentence-cover-span')];
     const wrong=overlays.filter(node=>{
       const r=node.getBoundingClientRect();
       return r.width>0&&r.height>0&&r.left<imgRect.right&&r.right>imgRect.left&&
         r.top<imgRect.bottom-1&&r.bottom>imgRect.top+1;
     });
     const exact=[...body.querySelectorAll('p')].find(p=>p.textContent.includes('After the chart, the notes'));
     const range=document.createRange();range.selectNodeContents(exact);
     const rect=range.getClientRects()[0];
     const overlay=overlays.find(n=>n.dataset.text?.includes('After the chart, the notes'));
     const overlayRect=overlay?.getBoundingClientRect();
     return {imageHeight:imgRect.height,count:overlays.length,wrong:wrong.length,
       yDifference:overlayRect?Math.abs(overlayRect.top-rect.top):null,
       status:document.querySelector('.ocr-sentence-state')?.textContent};
   });
   console.log('IMAGE_GEOMETRY_DIAGNOSTIC',name,geometry);
   assert(geometry.imageHeight>=300,'image must load and grow substantially');
   assert.match(geometry.status,/覆盖 9\/9 句/,'Markdown escapes must be fully covered too');
   if(mobile){
     assert.equal(geometry.wrong,0,'Safari coverage must never float over newly loaded image');
     assert(geometry.count>=4,'Safari coverage lost note ranges');
     assert(geometry.yDifference<2.5,'Safari covered note must remain aligned to text');
   }
   await page.screenshot({path:join(shots,`${name}-02-after-image.png`)});
   await page.locator('.ocr-markdown p').filter({hasText:'After the chart, the notes'}).scrollIntoViewIfNeeded();
   await page.waitForTimeout(350);
   const afterScroll=await page.evaluate(()=>{
     const target=[...document.querySelectorAll('.ocr-markdown p')].find(p=>
       p.textContent.includes('After the chart, the notes'));
     const range=document.createRange();range.selectNodeContents(target);
     const rect=range.getClientRects()[0];
     const overlay=[...document.querySelectorAll('.ocr-sentence-cover-span')]
       .find(span=>span.dataset.text?.includes('After the chart, the notes'));
     const mark=overlay?.getBoundingClientRect();
     return {textY:rect.y,markY:mark?.y??null,difference:mark?Math.abs(mark.y-rect.y):null};
   });
   console.log('IMAGE_SCROLL_DIAGNOSTIC',name,afterScroll);
   if(mobile)assert(afterScroll.difference<2.5,'Safari highlight must track actual scrolled text');
   await page.screenshot({path:join(shots,`${name}-03-scrolled.png`)});
   assert.equal(readFileSync(doc,'utf8'),marked,'coverage wrote to CMD');
   assert.deepEqual(errors,[]);
   console.log('SENTENCE_IMAGE_GEOMETRY_PASS',name,geometry);
  }finally{await browser.close()}
 }
}finally{server.kill('SIGTERM');rmSync(dir,{recursive:true,force:true});}
