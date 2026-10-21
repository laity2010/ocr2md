/** Default CM6 MinerU comment folding: Chrome + iPad WebKit, isolated data. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,unlinkSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {homedir} from 'node:os';
import {chromium,webkit,devices} from 'playwright';
import {toMarkdown} from '../packages/minerujson-md/dist/index.js';
const raw=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8');
const sample=toMarkdown(raw);
const file=resolve(`.v6/tests/mineru-folding-${process.pid}.md`);
mkdirSync('.v6/tests',{recursive:true});mkdirSync('.v6/evidence',{recursive:true});
writeFileSync(file,sample);
const port=5263,url=`http://127.0.0.1:${port}/`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{
 cwd:process.cwd(),env:{...process.env,V6_DOCUMENT_PATH:file},stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const cases=[
 ['Chrome',chromium,{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'},{viewport:{width:1440,height:900}}],
 ['iPad WebKit',webkit,{executablePath:homedir()+'/Library/Caches/ms-playwright/webkit-2359/pw_run.sh'},
  {...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:642}}],
];
try{
 let started=false;
 for(let i=0;i<120;i++){
  try{if((await fetch(url)).ok){started=true;break}}catch{}
  await sleep(150);
 }
 assert(started,'isolated Vite server did not start');
 for(const [name,engine,launch,context] of cases){
  const browser=await engine.launch({headless:true,...launch});
  try{
   const page=await browser.newPage(context),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',route=>route.request().url().startsWith(url)?route.continue():route.abort());
   await page.goto(url,{waitUntil:'domcontentloaded',timeout:50000});
   await page.waitForFunction(()=>window.__v6cm6?.view?.state?.doc?.lines>=4800 &&
     document.querySelectorAll('#editor .cm-foldPlaceholder').length>=2,null,{timeout:90000});
   const initial=await page.evaluate(()=>({
    fileMatches:window.__v6cm6.view.state.doc.toString().length,
    placeholders:document.querySelectorAll('#editor .cm-foldPlaceholder').length,
    unfolded:document.querySelectorAll('#editor .cm-foldGutter span[title="Unfold line"]').length,
    startsWithAudit:window.__v6cm6.view.state.doc.sliceString(0,40).startsWith('<!-- minerujson:audit'),
    firstLineText:document.querySelector('#editor .cm-content')?.textContent?.slice(0,400),
    dirty:window.__v6cm6.dirty,
   }));
   assert.equal(initial.fileMatches,sample.length);
   assert(initial.startsWithAudit);
   assert(initial.unfolded>=2,'default fold gutter state missing');
   assert(!initial.firstLineText.includes('"_backend"'),'folded document meta is incorrectly visible');
   assert.equal(initial.dirty,false,'view folding should not modify source');
   // Click the native CM6 gutter marker, not a custom collapse widget.
   await page.locator('#editor .cm-foldGutter span[title="Unfold line"]:visible').first().click();
   await page.waitForFunction(()=>document.querySelector('#editor .cm-content')?.textContent?.includes('"_backend"'));
   const expanded=await page.evaluate(()=>({
    containsMeta:document.querySelector('#editor .cm-content')?.textContent?.includes('"_backend"'),
    dirty:window.__v6cm6.dirty,
   }));
   assert.equal(expanded.dirty,false);
   await page.locator('#editor .cm-foldGutter span[title="Fold line"]:visible').first().click();
   await page.waitForFunction(()=>!document.querySelector('#editor .cm-content')?.textContent?.includes('"_backend"'));
   assert.deepEqual(errors,[],`${name}: unexpected browser JS errors`);
   assert.equal(await page.evaluate(()=>window.__v6cm6.dirty),false,'fold toggling modified document');
   await page.screenshot({path:`.v6/evidence/mineru-comment-folded-${name.replaceAll(' ','-').toLowerCase()}.png`});
   console.log('MINERU_FOLDING_PASS',name,JSON.stringify({placeholders:initial.placeholders,
    unfoldedMarkers:initial.unfolded,manualExpand:expanded.containsMeta,dirty:false,errors:errors.length}));
  }finally{await browser.close()}
 }
 assert.equal(readFileSync(file,'utf8'),sample,'isolated document changed by UI');
}finally{server.kill('SIGTERM');unlinkSync(file)}
