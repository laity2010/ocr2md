/** Persist a three-choice LaTeX review as separate JSON, without altering MD.
 * Run in fully isolated documents and auth tokens; Chrome + WebKit.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {homedir} from 'node:os';
import {chromium,webkit,devices} from 'playwright';
const fixture=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8');
const pause=ms=>new Promise(done=>setTimeout(done,ms));
const engines=[['Chrome',chromium,{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}],
  ['WebKit',webkit,{executablePath:homedir()+'/Library/Caches/ms-playwright/webkit-2359/pw_run.sh'}]];
mkdirSync('.v6/evidence',{recursive:true});
for(const [index,[name,engine,options]] of engines.entries()){
  const dir=resolve(`.v6/tests/latex-review-${process.pid}-${index}`);
  mkdirSync(dir,{recursive:true});
  const doc=resolve(dir,'book.md'),token=resolve(dir,'token');
  const key=`local-only-review-${index}`;
  writeFileSync(doc,fixture);writeFileSync(token,key);
  const sidecar=doc+'.latex-review.json';
  const port=5660+index,url=`http://127.0.0.1:${port}`;
  const server=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),stdio:'ignore',
    env:{...process.env,V6_PORT:String(port),V6_DOCUMENT_PATH:doc,
      V6_TOKEN_PATH:token,V6_STATIC_ROOT:resolve('dist')}});
  let browser;
  try{
    let ready=false;
    for(let i=0;i<130;i++){
      try{if((await fetch(url+'/healthz')).ok){ready=true;break;}}catch{}
      await pause(110);
    }
    assert(ready,'isolated LaTeX review server unavailable');
    assert.deepEqual((await (await fetch(url+'/api/latex/reviews')).json()).reviews,{});
    const body={key:'0123456789abcdef:1',review:'latex'};
    const headers={'Origin':url,'Content-Type':'application/json'};
    assert.equal((await fetch(url+'/api/latex/review',{
      method:'POST',headers,body:JSON.stringify(body)})).status,403,
      'unauthorized review must be rejected');
    assert.equal((await fetch(url+'/api/latex/review',{
      method:'POST',headers:{...headers,Cookie:'v6edit='+key},
      body:JSON.stringify({...body,review:'invalid'})})).status,422);
    assert.equal((await fetch(url+'/api/latex/review',{
      method:'POST',headers:{...headers,Cookie:'v6edit='+key,Origin:'https://evil.example'},
      body:JSON.stringify(body)})).status,403);
    assert(!existsSync(sidecar),'invalid writes must not create a sidecar');
    browser=await engine.launch({headless:true,...options});
    const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:642}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',route=>route.request().url().startsWith(url)?route.continue():route.abort());
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
    await page.locator('#module-select').selectOption('latex');
    const first=page.locator('.ocr-latex-grid .ag-row[row-index="0"] .ocr-latex-review-select');
    await page.waitForFunction(()=>document.querySelector('.ocr-latex-review-select:not([disabled])'),
      null,{timeout:30000});
    assert.deepEqual(await first.locator('option').allTextContents(),['待复核','latex','忽略']);
    assert.equal(await first.inputValue(),'待复核');
    await first.selectOption('latex');
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('需先取得编辑授权'),
      null,{timeout:11000});
    assert.equal(await first.inputValue(),'待复核','failed auth must restore previous state');
    assert(!existsSync(sidecar),'failed authorization cannot persist a review');
    await page.context().addCookies([{name:'v6edit',value:key,domain:'127.0.0.1',path:'/'}]);
    await first.selectOption('latex');
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('latex 1'),null,{timeout:11000});
    await page.waitForFunction(()=>document.querySelector('.ocr-latex-review-select:not([disabled])'),null,{timeout:11000});
    const snapshot=JSON.parse(readFileSync(sidecar,'utf8'));
    assert.equal(snapshot.version,1);
    assert.deepEqual(Object.values(snapshot.reviews),['latex']);
    // Row 1 differs from row 0; both annotations persist independently.
    const second=page.locator('.ocr-latex-grid .ag-row[row-index="1"] .ocr-latex-review-select');
    await second.selectOption('忽略');
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('忽略 1'),null,{timeout:11000});
    await page.locator('#latex-refresh').click();
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('latex 1 / 忽略 1'),null,{timeout:11000});
    assert.equal(await first.inputValue(),'latex');
    assert.equal(await second.inputValue(),'忽略');
    await page.reload({waitUntil:'domcontentloaded',timeout:45000});
    await page.locator('#module-select').selectOption('latex');
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('latex 1 / 忽略 1'),null,{timeout:30000});
    assert.equal(await first.inputValue(),'latex','reload must restore confirmed latex');
    assert.equal(await second.inputValue(),'忽略','reload must restore ignored mark');
    // Reset one row without changing its sibling; default never persists.
    await first.selectOption('待复核');
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('latex 0 / 忽略 1'),null,{timeout:12000});
    assert.deepEqual(Object.values(JSON.parse(readFileSync(sidecar,'utf8')).reviews),['忽略']);
    assert.equal(readFileSync(doc,'utf8'),fixture,'annotation must not rewrite the mother Markdown');
    await page.screenshot({path:`.v6/evidence/latex-review-${name.toLowerCase()}.png`});
    assert.deepEqual(errors,[],name+' page errors');
    console.log('LATEX_REVIEW_PASS',name,JSON.stringify({choices:3,auth:true,
      persist:true,refresh:true,reload:true,reset:true,markdownUnchanged:true}));
  }finally{await browser?.close();server.kill('SIGTERM');}
}
