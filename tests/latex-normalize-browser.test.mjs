/** Full shell -> Layout -> LaTeX -> CMD normalization contract.
 * Uses an isolated writable file seeded by immutable frozen legacy source.
 * Never touches the user's actual Buffett's Alpha workspace document.
 */
import {selectModule} from './navigation-ui.test-helper.mjs';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {homedir} from 'node:os';
import {chromium,webkit,devices} from 'playwright';
import {findLatex} from '../ui/latex-scan.js';
import {findReviewMarkers} from '../ui/latex-review-markers.js';
import {scanAnnotations} from '../ui/cmd-annotations.js';
const source=readFileSync('tests/fixtures/latex-legacy-display.md','utf8');
function parse(text){
  const rows=findLatex(text).map(item=>({...item,raw:text.slice(item.from,item.to)}));
  findReviewMarkers(text,rows);
  return rows;
}
const before=parse(source);
assert.equal(before.filter(x=>x.status==='latex').length,8);
const engines=[['Chrome',chromium,{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}],
  ['WebKit',webkit,{executablePath:homedir()+'/Library/Caches/ms-playwright/webkit-2359/pw_run.sh'}]];
const sleep=t=>new Promise(done=>setTimeout(done,t));
mkdirSync('.v6/tests',{recursive:true});
mkdirSync('.v6/evidence',{recursive:true});
for(let i=0;i<engines.length;i++){
  const [name,engine,options]=engines[i];
  const documentPath=resolve('.v6/tests/latex-normalize-'+process.pid+'-'+i+'.md');
  const tokenPath=resolve('.v6/tests/latex-normalize-'+process.pid+'-'+i+'.token');
  const secret='latex-normalize-isolated-'+process.pid+'-'+i;
  writeFileSync(documentPath,source);writeFileSync(tokenPath,secret);
  const port=5790+i,base='http://127.0.0.1:'+port;
  const server=spawn('python3',['scripts/v6_serve.py'],{
    cwd:process.cwd(),stdio:'ignore',
    env:{...process.env,V6_PORT:String(port),V6_DOCUMENT_PATH:documentPath,
      V6_SETTINGS_PATH:resolve('.v6/tests/latex-normalize-'+process.pid+'-'+i+'.settings.json'),
      V6_TOKEN_PATH:tokenPath,V6_STATIC_ROOT:resolve('dist')}});
  let browser;
  try{
    let ready=false;
    for(let n=0;n<100;n++){
      try{if((await fetch(base+'/healthz')).ok){ready=true;break}}catch{}
      await sleep(130);
    }
    assert(ready,'isolated server not ready');
    browser=await engine.launch({headless:true,...options});
    const context=await browser.newContext({...devices['iPad Pro 11 landscape'],
      viewport:{width:1032,height:642}});
    await context.addCookies([{name:'v6edit',value:secret,domain:'127.0.0.1',path:'/'}]);
    const page=await context.newPage();
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(base+'/',{waitUntil:'domcontentloaded',timeout:45000});
    await selectModule(page,'latex');
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('latex 8'),
      null,{timeout:30000});
    assert.equal(readFileSync(documentPath,'utf8'),source);
    await page.locator('#ag-functions-toggle').click();
    await page.locator('#latex-normalize').click();
    await page.waitForFunction(()=>document.querySelector('#undo')?.disabled===false&&
      document.querySelector('#status')?.textContent.includes('未保存'),null,{timeout:25000});
    assert.equal(readFileSync(documentPath,'utf8'),source,'normalized before Save');
    await page.screenshot({path:'.v6/evidence/latex-normalize-'+name.toLowerCase()+'.png'});
    await page.locator('#save').click();
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('已保存'),
      null,{timeout:25000});
    const saved=readFileSync(documentPath,'utf8');
    const annotations=scanAnnotations(saved);
    assert.equal(annotations.filter(a=>a.tag==='ocr2md:latex').length,8);
    assert.equal(annotations.filter(a=>a.tag==='/ocr2md:latex').length,0);
    const after=parse(saved);
    assert.equal(after.filter(row=>row.status==='latex').length,8);
    assert.equal(after.filter(row=>row.syntax==='$$').length,6);
    assert.deepEqual(after.map(row=>row.content),before.map(row=>row.content));
    assert.deepEqual(after.map(row=>row.reviewMarker?.id),before.map(row=>row.reviewMarker?.id));
    assert(after.filter(r=>r.status==='latex').every(r=>
      saved.slice(r.reviewMarker.openTo,r.from)===(r.kind==='独立'?'\n':'')));
    assert(after.filter(r=>r.kind==='独立'&&r.status==='latex').every(r=>
      /^\$\$\n[^]*\n\$\$$/.test(saved.slice(r.from,r.to)) &&
      saved[r.from-1]==='\n' &&
      (r.to===saved.length||saved[r.to]==='\n')),
      'Obsidian display math delimiters must start their own source lines');
    await page.reload({waitUntil:'domcontentloaded'});
    await selectModule(page,'latex');
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('latex 8'),
      null,{timeout:30000});
    await page.locator('#ag-functions-toggle').click();
    await page.locator('#latex-normalize').click();
    await sleep(180);
    assert.equal(readFileSync(documentPath,'utf8'),saved,'second normalization changed saved file');
    assert.deepEqual(errors,[]);
    console.log('LATEX_NORMALIZE_API_PASS',name,JSON.stringify({
      marked:8,display:6,inline:2,closing:0,saveReload:true,idempotent:true,
      source:'isolated',errors:0}));
  }finally{await browser?.close();server.kill('SIGTERM');}
}
