/** Full Buffett source scale: all filtered AG sentences must paint in preview. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium,webkit} from 'playwright';
import {extractTextBlocks,segmentSentences,planSentenceMarks} from '../ui/cmd-sentences.js';
import {formatAnnotation} from '../ui/cmd-annotations.js';
const original=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8');
const rows=segmentSentences(extractTextBlocks(original,{bodyEnd:original.indexOf('<!-- minerujson:source:v1')}));
const operations=planSentenceMarks(original,rows,[]);
const marked=operations.sort((a,b)=>b.at-a.at).reduce((s,op)=>
 s.slice(0,op.at)+formatAnnotation(op.tag,op.attributes)+s.slice(op.at),original);
const dir=mkdtempSync(join(tmpdir(),'ocr2md-full-coverage-'));
const doc=join(dir,'book.md');writeFileSync(doc,marked);
const port=5975,base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{
 cwd:process.cwd(),stdio:'ignore',env:{...process.env,V6_DOCUMENT_PATH:doc}});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{
 let started=false;for(let i=0;i<200;i++){try{if((await fetch(base)).ok){started=true;break;}}catch{}await sleep(100)}
 assert(started,'Vite startup failed');
 for(const [name,engine,mobile] of [['Chrome',chromium,false],['iPad-WebKit',webkit,true]]){
  const browser=await engine.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:{width:1100,height:800},hasTouch:mobile,isMobile:mobile});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base,{waitUntil:'domcontentloaded',timeout:80000});
   await page.locator('#editor .cm-content').waitFor({state:'visible',timeout:60000});
   await page.locator('.ocr-lab-ag-toolbar .ocr-navigation-elements .ts-control').click();
   await page.locator('.ocr-navigation-popup-elements:visible [data-value="sentence"]').click();
   await page.locator('.ocr-sentence-state').waitFor({state:'visible',timeout:60000});
   await page.waitForFunction(()=>/CMD 已标定 4\d\d 句/.test(document.querySelector('.ocr-sentence-state')?.textContent||''),null,{timeout:45000});
   const initialText=readFileSync(doc,'utf8');
   const toggle=page.locator('#sentence-cover-all');await toggle.check();
   await page.waitForFunction(()=>((CSS.highlights.get('ocr-covered-sentences')?.size||0)+
     document.querySelectorAll('.ocr-sentence-cover-span').length)>=200,null,{timeout:60000});
   const painted=await page.evaluate(()=>({
     native:CSS.highlights.get('ocr-covered-sentences')?.size||0,
     safari:document.querySelectorAll('.ocr-sentence-cover-span').length,
     nativeStops:CSS.highlights.get('ocr-covered-sentence-stops')?.size||0,
     safariStops:document.querySelectorAll('.ocr-sentence-cover-stop').length,
   }));
   assert(painted.native+painted.safari>=200,'large document coverage unexpectedly sparse');
   const status=await page.locator('.ocr-sentence-state').textContent();
   assert.match(status,/覆盖 \d+\/440 句/,'AG must distinguish displayed vs actually mapped sentences');
   assert.match(status,/句未映射到预览/,'unmappable OCR text must not be silently counted as painted');
   assert(painted.nativeStops+painted.safariStops>=150,'sentence ends missing at scale');
   assert.equal(readFileSync(doc,'utf8'),initialText,'coverage must not save or edit the original file');
   await toggle.uncheck();
   await page.waitForFunction(()=>!(CSS.highlights.get('ocr-covered-sentences')?.size||0)&&
      !document.querySelector('.ocr-sentence-cover-overlay'),null,{timeout:20000});
   assert.deepEqual(errors,[]);
   console.log('SENTENCE_COVERAGE_REAL_PASS',name,{candidates:rows.length,painted});
  }finally{await browser.close();}
 }
}finally{server.kill('SIGTERM');rmSync(dir,{recursive:true,force:true});}
