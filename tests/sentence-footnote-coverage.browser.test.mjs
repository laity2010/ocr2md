/** Verify real AG/preview highlights across converted Obsidian footnotes and escaped Markdown. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium,webkit} from 'playwright';
import {extractTextBlocks,segmentSentences,planSentenceMarks,readSentenceMarks,reconstructSource} from '../ui/cmd-sentences.js';
import {scanAnnotations,formatAnnotation} from '../ui/cmd-annotations.js';
const original=[
 '<!-- minerujson:block:v1:1:0 -->','',
 'We show that value and quality stocks explain the results.<!--ocr2md:note-ref id="3"-->[^3] This finding is consistent with the idea that investors behave similarly.','',
 '<!-- minerujson:block:v1:1:1 -->','',
 'Open Access: The Creative Commons License (htp\\:// creativecommons.org/licenses/by/4.0/) permits distribution.','',
 '<!-- minerujson:block:v1:1:2 -->','',
 'However, Berkshire can deduct many dividends,<!--ocr2md:note-ref id="9"-->[^9] and minimize taxes by allocating earnings abroad.<!--ocr2md:note-ref id="10"-->[^10] Hence, assessing the tax advantage is difficult.','',
 '[^3]: Footnote three.','[^9]: Footnote nine.','[^10]: Footnote ten.','',
 '<!-- minerujson:source:v1','{"evidence":"untouched"}','-->',
].join('\n');
const projection=extractTextBlocks(original,{bodyEnd:original.indexOf('<!-- minerujson:source:v1')});
assert.equal(reconstructSource(projection),original);
const segments=segmentSentences(projection);
for(const needle of ['This finding is consistent','Open Access:','However, Berkshire','Hence, assessing']){
 assert(segments.some(row=>row.text.startsWith(needle)),`not separately segmented: ${needle}`);
}
const marks=planSentenceMarks(original,segments,scanAnnotations(original));
const marked=marks.sort((a,b)=>b.at-a.at).reduce((s,op)=>
 s.slice(0,op.at)+formatAnnotation(op.tag,op.attributes)+s.slice(op.at),original);
const saved=readSentenceMarks(marked,scanAnnotations(marked));
assert.equal(saved.rows.length,segments.length);
assert.equal(planSentenceMarks(marked,segmentSentences(extractTextBlocks(marked,{bodyEnd:marked.indexOf('<!-- minerujson:source:v1')})),scanAnnotations(marked)).length,0,'idempotent CMD marks');
const dir=mkdtempSync(join(tmpdir(),'ocr2md-note-coverage-'));
const doc=join(dir,'note.md');writeFileSync(doc,marked);
const port=5992,base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{
 cwd:process.cwd(),stdio:'ignore',env:{...process.env,V6_DOCUMENT_PATH:doc}});
const shots=join('.v6','evidence','sentence-footnote');mkdirSync(shots,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{
 let ready=false;for(let i=0;i<180;i++){try{if((await fetch(base)).ok){ready=true;break;}}catch{}await sleep(100)}
 assert(ready,'test server not ready');
 for(const [name,engine,mobile] of [['Chrome',chromium,false],['iPad-WebKit',webkit,true]]){
  const browser=await engine.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:{width:1100,height:850},isMobile:mobile,hasTouch:mobile});
   const errors=[];page.on('pageerror',err=>errors.push(err.message));
   await page.goto(base,{waitUntil:'domcontentloaded',timeout:45000});
   await page.locator('#editor .cm-content').waitFor();
   await page.locator('.ocr-lab-ag-toolbar .ocr-navigation-elements .ts-control').click();
   await page.locator('.ocr-navigation-popup-elements:visible [data-value="sentence"]').click();
   await page.locator('#sentence-cover-all').check();
   await page.waitForFunction(count=>document.querySelector('.ocr-sentence-state')?.textContent.includes(`覆盖 ${count}/${count} 句`),saved.rows.length,{timeout:22000});
   const observed=await page.evaluate(()=>{
    const text=[...(CSS.highlights.get('ocr-covered-sentences')||[])].map(range=>range.toString())
      .concat([...document.querySelectorAll('.ocr-sentence-cover-span')].map(n=>n.dataset.text||''));
    return ['This finding is consistent','Open Access:','However, Berkshire','and minimize taxes by allocating','Hence, assessing'].map(phrase=>({phrase,highlighted:text.some(t=>t.includes(phrase))}));
   });
   assert(observed.every(c=>c.highlighted),`${name}: missing rendered text highlight ${JSON.stringify(observed)}`);
   const paragraph=page.locator('.ocr-markdown p').filter({hasText:'This finding is consistent'}).first();
   await paragraph.screenshot({path:join(shots,`${name}-footnote-covered.png`)});
   assert.equal(readFileSync(doc,'utf8'),marked);
   assert.deepEqual(errors,[]);
   console.log('SENTENCE_FOOTNOTE_COVERAGE_PASS',name,{count:saved.rows.length,observed});
  }finally{await browser.close();}
 }
}finally{server.kill('SIGTERM');rmSync(dir,{recursive:true,force:true});}
