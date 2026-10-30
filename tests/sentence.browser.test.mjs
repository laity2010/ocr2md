/** Real AG sentence view: CMD single transaction, preserved Markdown, reload. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium,webkit} from 'playwright';
import {extractTextBlocks,reconstructSource,segmentSentences} from '../ui/cmd-sentences.js';
const original=[
 '<!-- minerujson:block:v1:6:6 -->','',
 'The average cost is about','','<!-- minerujson:block:v1:6:7 -->','',
 '3 percentage points lower. It matters.','','',
 '<!-- minerujson:block:v1:8:3 -->','',
 'We refreshed the shares on the basis of the latest','','<!-- minerujson:block:v1:8:4 -->','',
 '13F, and the portfolio was rebalanced.','','',
 '<!-- minerujson:block:v1:9:0 -->','',
 'The formula $x=\\frac{a}{b}$ was used. The result is clear.','',
 '```python','x = "Hello. Do not segment me."','```','','',
 '<!-- minerujson:source:v1','{"raw":"cannot change"}','-->',
].join('\n');
const proj=extractTextBlocks(original,{bodyEnd:original.indexOf('<!-- minerujson:source:v1')});
assert.equal(reconstructSource(proj),original);
const expected=segmentSentences(proj);
assert(expected.some(x=>x.text.includes('about 3 percentage points')&&x.crossBlock));
assert(expected.some(x=>x.text.includes('latest 13F')&&x.crossBlock));
const dir=mkdtempSync(join(tmpdir(),'ocr2md-sentence-ag-'));
const doc=join(dir,'document.md'),settings=join(dir,'settings.json'),auth=join(dir,'token');
writeFileSync(settings,'{}');writeFileSync(auth,'sentence-ag-test');
const port=5974,base=`http://127.0.0.1:${port}`,production=process.env.SENTENCE_PRODUCTION==='1';
const server=production
 ?spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),stdio:'ignore',env:{...process.env,
  V6_PORT:String(port),V6_BIND:'127.0.0.1',V6_LAN_TLS_HOST:'',V6_DOCUMENT_PATH:doc,
  V6_SETTINGS_PATH:settings,V6_TOKEN_PATH:auth,V6_STATIC_ROOT:resolve('dist')}})
 :spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{
  cwd:process.cwd(),stdio:'ignore',env:{...process.env,V6_DOCUMENT_PATH:doc}});
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
const shots=join('.v6','evidence','sentence');mkdirSync(shots,{recursive:true});
async function select(page,value){
 await page.locator('.ocr-lab-ag-toolbar .ocr-navigation-elements .ts-control').click();
 await page.locator(`.ocr-navigation-popup-elements:visible [data-value="${value}"]`).click();
 await page.waitForFunction(v=>document.querySelector('#module-select')?.value===v,value);
}
try{
 let ready=false;for(let k=0;k<150;k++){try{if((await fetch(base)).ok){ready=true;break;}}catch{}await sleep(100)}
 assert(ready,'service did not start');
 for(const [name,engine,mobile] of [['Chrome',chromium,false],['iPad-WebKit',webkit,true]]){
  writeFileSync(doc,original);
  const browser=await engine.launch({headless:true});
  try{
   const context=await browser.newContext({viewport:{width:1100,height:800},isMobile:mobile,hasTouch:mobile});
   if(production)await context.addCookies([{name:'v6edit',value:'sentence-ag-test',domain:'127.0.0.1',path:'/'}]);
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
   await page.goto(base,{waitUntil:'domcontentloaded',timeout:50000});
   await page.locator('#editor .cm-content').waitFor({state:'visible',timeout:40000});
   await select(page,'sentence');
   await page.waitForFunction(n=>document.querySelectorAll('.ocr-sentence-grid .ag-row').length===n,expected.length,{timeout:50000});
   assert.equal(await page.locator('.ocr-sentence-grid .ag-row').count(),expected.length);
   await page.screenshot({path:join(shots,name+'-marked.png')});
   const text=await page.locator('.ocr-sentence-grid .ag-cell[col-id="text"]').allTextContents();
   assert(text.some(x=>x.includes('about 3 percentage points')));
   assert(text.some(x=>x.includes('latest 13F')));
   assert.equal(readFileSync(doc,'utf8'),original,'module silently saved');
   // Real pointer/touch clicks in a rendered text node, never invoking an
   // internal view/store API from tests. Needed for same-source-line sentences.
   async function tapWord(container,needle){
     const locate=()=>page.evaluate(({container,needle})=>{
       const root=document.querySelector(container);
       if(!root)throw Error('Missing click container '+container);
       const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
       let node;
       while((node=walker.nextNode())){
         const start=node.textContent.indexOf(needle);
         if(start<0)continue;
         const range=document.createRange();
         range.setStart(node,start);range.setEnd(node,start+needle.length);
         const r=range.getBoundingClientRect();
         return {x:r.left+r.width/2,y:r.top+r.height/2,
           viewport:innerHeight,text:node.textContent.slice(0,85)};
       }
       throw Error('Missing visible word '+needle+' in '+container);
     },{container,needle});
     if(container.includes('#editor')){
       const scroller=await page.locator('#editor .cm-scroller').boundingBox();
       if(mobile)await page.touchscreen.tap(scroller.x+scroller.width/2,scroller.y+scroller.height/2);
       else{
         await page.mouse.move(scroller.x+scroller.width/2,scroller.y+scroller.height/2);
         await page.mouse.wheel(0,1); // Explicit CM6 user-scroll ownership.
       }
     }
     await page.evaluate(({container,needle})=>{
       const root=document.querySelector(container);
       const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
       let node;
       while((node=walker.nextNode())){
         if(node.textContent.includes(needle)){
           (node.parentElement.closest('.cm-line')||node.parentElement.closest('p')||node.parentElement)
             .scrollIntoView({block:'center',inline:'nearest'});
           return;
         }
       }
     },{container,needle});
     await page.waitForTimeout(100);
     if(container.includes('#editor')){
       await page.evaluate(needle=>{
         const scroller=document.querySelector('#editor .cm-scroller');
         const walker=document.createTreeWalker(scroller,NodeFilter.SHOW_TEXT);
         let node;
         while((node=walker.nextNode())){
           const start=node.textContent.indexOf(needle);
           if(start<0)continue;
           const range=document.createRange();range.setStart(node,start);range.setEnd(node,start+needle.length);
           const a=range.getBoundingClientRect(),b=scroller.getBoundingClientRect();
           if(a.top<b.top+20||a.bottom>b.bottom-20)
             scroller.scrollTop+=a.top-b.top-b.height/2;
           return;
         }
       },needle);
       await page.waitForTimeout(100);
     }
     const rect=await locate();
     if(container.includes('#editor')){
       const scroller=await page.locator('#editor .cm-scroller').boundingBox();
       assert(rect.y>=scroller.y&&rect.y<=scroller.y+scroller.height,
         `source word not visible: ${needle}, at ${rect.y}, pane ${scroller.y}-${scroller.y+scroller.height}`);
     }
     if(mobile)await page.touchscreen.tap(rect.x,rect.y);
     else await page.mouse.click(rect.x,rect.y);


   }
   const chosenRow=()=>page.locator('.ocr-sentence-grid .ag-row-selected .ag-cell[col-id="text"]').allTextContents();
   const expectChosen=async (text)=>{
     await page.waitForFunction(needle=>[...document.querySelectorAll('.ocr-sentence-grid .ag-row-selected .ag-cell[col-id="text"]')]
       .some(el=>el.textContent.includes(needle)),text,{timeout:12000});
     const selected=await chosenRow();
     assert.equal(selected.length,1,'AG must select one exact sentence');
     assert(selected[0].includes(text),`wrong AG row ${selected[0]} for ${text}`);
   };
   const highlightState=()=>page.evaluate(()=>{
     const native=[...(CSS.highlights.get('ocr-selected-sentence')||[])].map(range=>range.toString());
     const nativeStop=[...(CSS.highlights.get('ocr-selected-sentence-stop')||[])].map(range=>range.toString());
     const underlines=[...document.querySelectorAll('.ocr-sentence-overlay-underline')];
     const visible=[...new Map(underlines.map(el=>[el.dataset.fragment,el.dataset.text])).values()];
     const punctuation=[...document.querySelectorAll('.ocr-sentence-overlay-stop')].map(el=>el.dataset.text);
     return {selected:native.length?native:visible,punctuation:nativeStop.length?nativeStop:punctuation};
   });
   const waitForUnderlines=(count)=>page.waitForFunction(n=>
     (CSS.highlights.get('ocr-selected-sentence')?.size||
      new Set([...document.querySelectorAll('.ocr-sentence-overlay-underline')].map(x=>x.dataset.fragment)).size)===n,
     count,{timeout:12000});
   await page.locator('.ocr-sentence-jump').first().click();
   await waitForUnderlines(2);
   assert.deepEqual(await highlightState(),{selected:['The average cost is about','3 percentage points lower.'],
     punctuation:['.']},'cross-block sentence underline and exact terminal period');
   await page.screenshot({path:join(shots,name+'-sentence-highlight.png')});
   // Reverse navigation from preview: the second physical OCR block belongs
   // to the first logical sentence, despite the next sentence on same line.
   await tapWord('.ocr-markdown','lower.');
   await expectChosen('The average cost is about');
   await tapWord('.ocr-markdown','matters.');
   await expectChosen('It matters.');
   await tapWord('.ocr-markdown','latest');
   await expectChosen('We refreshed the shares');
   await tapWord('.ocr-markdown','rebalanced.');
   await expectChosen('We refreshed the shares');
   // Reverse navigation from CM6: the same source line has two CMD sentence
   // fragments and two independent AG rows. A line-number-only lookup fails.
   await tapWord('#editor .cm-content','lower.');
   await expectChosen('The average cost is about');
   await tapWord('#editor .cm-content','matters.');
   await expectChosen('It matters.');
   await tapWord('#editor .cm-content','latest');
   await expectChosen('We refreshed the shares');
   await tapWord('#editor .cm-content','rebalanced.');
   await expectChosen('We refreshed the shares');

   await page.locator('.ocr-sentence-grid .ag-row').filter({hasText:'It matters.'}).click();
   await waitForUnderlines(1);
   assert.deepEqual(await highlightState(),{selected:['It matters.'],punctuation:['.']},
     'select only second sentence in same preview paragraph');
   await page.locator('.ocr-sentence-grid .ag-row').filter({hasText:'We refreshed the shares'}).click();
   await waitForUnderlines(2);
   assert.deepEqual((await highlightState()).punctuation,['.'],'cross-block terminal period');
   await page.locator('.ocr-sentence-grid .ag-row').filter({hasText:'The formula'}).click();
   await waitForUnderlines(1);
   assert.deepEqual((await highlightState()).punctuation,['.'],'math embedded sentence stop');
   await select(page,'media');
   // An old Focus event must never repaint a sentence when another AG module
   // owns the review surface, including after a Markdown preview rerender.
   await page.locator('#editor .cm-content').click();
   await page.keyboard.insertText('x');
   await page.waitForTimeout(400);
   assert.deepEqual(await highlightState(),{selected:[],punctuation:[]},
     'source rerender under Media must not revive previous sentence selection');
   await page.locator('#undo').click();
   await select(page,'sentence');
   await page.locator('.ocr-sentence-jump').first().click();
   await waitForUnderlines(2);
   await select(page,'media');
   assert.deepEqual(await highlightState(),{selected:[],punctuation:[]},
     'highlights must clear when leaving sentence module');
   await select(page,'sentence');
   await page.locator('.ocr-sentence-jump').first().click();
   assert.deepEqual((await highlightState()).punctuation,['.']);
   await page.locator('.ocr-markdown p').first().click();
   assert.deepEqual(await highlightState(),{selected:[],punctuation:[]},
     'regular preview navigation must clear sentence emphasis');
   await page.locator('.ocr-sentence-jump').first().click();
   const tagCount=(await page.locator('#editor .cm-content').textContent()).split('ocr2md:sentence').length-1;
   assert(tagCount>3,'markers missing from CM6');
   await page.locator('#undo').click();
   await page.waitForFunction(()=>!document.querySelector('#editor .cm-content')?.textContent.includes('ocr2md:sentence'),null,{timeout:18000});
   await page.locator('#redo').click();
   await page.waitForFunction(()=>document.querySelector('#editor .cm-content')?.textContent.includes('ocr2md:sentence'),null,{timeout:18000});
   await page.locator('.ocr-sentence-jump').first().click();
   await waitForUnderlines(2);
   await page.locator('#save').click();
   for(let i=0;i<80&&!readFileSync(doc,'utf8').includes('ocr2md:sentence');i++)await sleep(100);
   const saved=readFileSync(doc,'utf8');assert(saved.includes('ocr2md:sentence'));
   assert(saved.includes('<!-- minerujson:source:v1'),'original evidence lost');
   await page.reload({waitUntil:'domcontentloaded'});
   await page.locator('#editor .cm-content').waitFor({state:'visible',timeout:40000});
   await select(page,'sentence');
   await page.waitForFunction(n=>document.querySelectorAll('.ocr-sentence-grid .ag-row').length===n,expected.length,{timeout:25000});
   assert.equal(await page.locator('.ocr-sentence-grid .ag-row').count(),expected.length);
   await page.locator('.ocr-sentence-jump').first().click();
   await waitForUnderlines(2);
   assert.deepEqual(await highlightState(),{selected:['The average cost is about','3 percentage points lower.'],
      punctuation:['.']},'reload should still map sentence spans to preview DOM');
   assert.deepEqual(errors,[],name+' errors');
   console.log('SENTENCE_AG_PASS',name,{sentences:expected.length,sourceRecovered:true,loaded:true});
  }finally{await browser.close();}
 }
}finally{server.kill('SIGTERM');await sleep(150);rmSync(dir,{recursive:true,force:true});}
