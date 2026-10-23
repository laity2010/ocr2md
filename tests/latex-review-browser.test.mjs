/** LaTeX review = CM6 Markdown comments, no separate document persistence.
 * Tests fenced and undelimited inline formulas, Undo/Redo, save/reload.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {homedir} from 'node:os';
import {chromium,webkit,devices} from 'playwright';
import {findLatex} from '../ui/latex-scan.js';
import {findReviewMarkers,planReviewEdit} from '../ui/latex-review-markers.js';
const fixture=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8');
const pause=ms=>new Promise(done=>setTimeout(done,ms));
const first=findLatex(fixture)[0];
assert.equal(first.kind,'独立');
// Unit proof that applying a pair of insertions and their removal are lossless.
const original={...first,raw:fixture.slice(first.from,first.to)};
const edits=planReviewEdit(fixture,original,'latex','0123456789abcdef');
function apply(value,changes){for(const edit of [...changes].reverse()){
 assert.equal(value.slice(edit.from,edit.to),edit.expected);
 value=value.slice(0,edit.from)+edit.insert+value.slice(edit.to);
}return value;}
let changed=apply(fixture,edits);
let candidates=findLatex(changed).map(r=>({...r,raw:changed.slice(r.from,r.to)}));
findReviewMarkers(changed,candidates);
assert.equal(candidates[0].status,'latex');
changed=apply(changed,planReviewEdit(changed,candidates[0],'待复核'));
assert.equal(changed,fixture,'pure comment insertion/removal must round-trip');

const engines=[['Chrome',chromium,{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}],
 ['WebKit',webkit,{executablePath:homedir()+'/Library/Caches/ms-playwright/webkit-2359/pw_run.sh'}]];
mkdirSync('.v6/evidence',{recursive:true});
for(const [index,[name,engine,options]] of engines.entries()){
 const root=resolve(`.v6/tests/latex-cm-review-${process.pid}-${index}`);
 mkdirSync(root,{recursive:true});
 const doc=resolve(root,'book.md'),token=resolve(root,'auth');
 const key=`local-latex-cm-review-${index}`;
 writeFileSync(doc,fixture);writeFileSync(token,key);
 const port=5660+index,base=`http://127.0.0.1:${port}`;
 const server=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),stdio:'ignore',
  env:{...process.env,V6_PORT:String(port),V6_DOCUMENT_PATH:doc,V6_TOKEN_PATH:token,
   V6_STATIC_ROOT:resolve('dist')}});
 let browser;
 try{
  let ready=false;
  for(let i=0;i<120;i++){
   try{if((await fetch(base+'/healthz')).ok){ready=true;break;}}catch{}
   await pause(110);
  }
  assert(ready,'isolated test service unavailable');
  assert.equal((await fetch(base+'/api/latex/reviews')).status,404);
  assert.equal((await fetch(base+'/api/latex/review',{method:'POST'})).status,404);
  browser=await engine.launch({headless:true,...options});
  const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:642}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:45000});
  await page.locator('#module-select').selectOption('latex');
  await page.waitForFunction(()=>document.querySelectorAll('.ocr-latex-review-select').length>1,
    null,{timeout:23000});
  const display=page.locator('.ocr-latex-grid .ag-row[row-index="0"] .ocr-latex-review-select');
  const inline=page.locator('.ocr-latex-grid .ag-row[row-index="1"] .ocr-latex-review-select');
  assert.deepEqual(await display.locator('option').allTextContents(),['待复核','latex','忽略']);
  assert.equal(await display.inputValue(),'待复核');
  await display.selectOption('latex');
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('latex 1'),
    null,{timeout:10000});
  assert.equal(await inline.inputValue(),'待复核');
  // Fenced formula: marker comments are placed on their own lines, outside the TeX fence.
  let current=await page.evaluate(async()=> (await fetch('/api/document')).text());
  assert.equal(current,fixture,'no implicit server write before global CMD Save');
  await page.locator('#undo').click();
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('latex 0'),
    null,{timeout:10000});
  assert.equal(await display.inputValue(),'待复核');
  await page.locator('#redo').click();
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('latex 1'),
    null,{timeout:10000});
  await inline.selectOption('忽略');
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('忽略 1'),
    null,{timeout:10000});
  // Inspect live source by selecting the CMS-visible source, not a parallel model.
  assert.equal(await inline.inputValue(),'忽略');
  const chosen=await page.locator('#status').textContent();
  assert(chosen.includes('latex 1')&&chosen.includes('忽略 1'));
  await page.screenshot({path:`.v6/evidence/latex-cm-review-${name.toLowerCase()}.png`});
  // Only global CMD Save persists the inline/standalone audit markers.
  await page.context().addCookies([{name:'v6edit',value:key,domain:'127.0.0.1',path:'/'}]);
  await page.locator('#save').click();
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('已保存'),
    null,{timeout:18000});
  const saved=readFileSync(doc,'utf8');
  assert(saved.includes('<!--ocr2md:latex id='));
  assert(saved.includes('review=latex-->')&&saved.includes('review=忽略-->'));
  assert.equal(findLatex(saved).length,42,'source scanner should still find all formulas');
  const marked=findLatex(saved).map(x=>({...x,raw:saved.slice(x.from,x.to)}));
  findReviewMarkers(saved,marked);
  assert.equal(marked.filter(x=>x.status==='latex').length,1);
  assert.equal(marked.filter(x=>x.status==='忽略').length,1);
  assert.equal(marked[0].content,findLatex(fixture)[0].content,'standalone formula unchanged');
  assert.equal(marked[1].content,findLatex(fixture)[1].content,'inline formula unchanged');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#module-select').selectOption('latex');
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('latex 1 / 忽略 1'),
    null,{timeout:25000});
  assert.equal(await display.inputValue(),'latex');
  assert.equal(await inline.inputValue(),'忽略');
  await inline.selectOption('待复核');
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('latex 1 / 忽略 0'),
    null,{timeout:10000});
  assert.equal(readFileSync(doc,'utf8'),saved,'reset remains unsaved until global Save');
  await page.locator('#save').click();
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('已保存'),
    null,{timeout:18000});
  assert.equal(findReviewMarkers(readFileSync(doc,'utf8'),findLatex(readFileSync(doc,'utf8')))
    .filter(x=>x.status==='忽略').length,0);
  assert.deepEqual(errors,[],name+' page errors');
  console.log('LATEX_CM_REVIEW_PASS',name,JSON.stringify({inline:true,standalone:true,undoRedo:true,
    saveReload:true,deltaApiRemoved:true,sourceSingle:true}));
 }finally{await browser?.close();server.kill('SIGTERM');}
}
