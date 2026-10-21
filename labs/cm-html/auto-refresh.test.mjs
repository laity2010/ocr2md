/** Lab-only deployment watcher regression; mocked release version, real lab server. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,readFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {homedir} from 'node:os';
import {chromium,webkit,devices} from 'playwright';

const root=process.cwd(),lab=resolve('labs/cm-html');
const fixture=resolve('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md');
const mainDocument=resolve('.v6/workspace/buffetts-alpha.minerujson.md');
const mainRelease=resolve('.v6/release/index.html');
const hash=p=>existsSync(p)?createHash('sha256').update(readFileSync(p)).digest('hex'):null;
const baseline=[fixture,mainDocument,mainRelease].map(hash);
const newVersion='lab-cm-html-20990101-000000';
const engines=[
  ['Chrome',chromium,{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}],
  ['WebKit',webkit,{executablePath:homedir()+'/Library/Caches/ms-playwright/webkit-2359/pw_run.sh'}],
];
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let passed=0;
for(let index=0;index<engines.length;index++){
  const [name,engine,opts]=engines[index];
  if(process.env.V6_ONLY_CHROME&&name!=='Chrome')continue;
  if(process.env.V6_ONLY_WEBKIT&&name!=='WebKit')continue;
  const port=4420+index,base=`http://127.0.0.1:${port}/labs/cm-html/`;
  const savedName=`auto-refresh-${name.toLowerCase()}-${process.pid}.md`;
  const savedPath=join(lab,'.runtime',savedName);
  const server=spawn('/usr/bin/python3',['labs/cm-html/server.py'],{
    cwd:root,env:{...process.env,CMHTML_PORT:String(port),CMHTML_WORKFILE:savedName},
    stdio:'ignore',
  });
  let browser;
  try{
    let ready=false;
    for(let t=0;t<140;t++){
      try{if((await fetch(base+'healthz')).ok){ready=true;break;}}catch{}
      await wait(120);
    }
    assert(ready,'isolated lab server did not start');
    browser=await engine.launch({headless:true,...opts});
    const page=await browser.newPage({...devices['iPad Pro 11 landscape'],
      viewport:{width:1032,height:642}});
    const errors=[],rootCalls=[];
    page.on('pageerror',err=>errors.push(err.message));
    page.on('request',request=>{
      const pathname=new URL(request.url()).pathname;
      if(pathname.startsWith('/api/'))rootCalls.push(pathname);
    });
    await page.route('**/*',route=>route.request().url().startsWith(`http://127.0.0.1:${port}`)
      ?route.continue():route.abort());
    const load=()=>page.waitForFunction(()=>window.__cmHtmlLab?.view?.state.doc.length>300000 &&
      document.querySelector('#status')?.textContent.includes('已加载'),null,{timeout:35000});
    await page.goto(base,{waitUntil:'domcontentloaded'});
    await load();
    const pageVersion=await page.locator('#build-version').textContent();
    assert.notEqual(pageVersion,newVersion);
    await wait(300);

    // Clean editor: detect new deployment through the real six-second timer.
    let cleanProbeCount=0;
    await page.route('**/labs/cm-html/healthz',route=>{
      if(cleanProbeCount++===0)return route.fulfill({status:200,contentType:'application/json',
        body:JSON.stringify({service:'cm-html-lab',scope:'/labs/cm-html/',version:newVersion})});
      return route.continue();
    });
    const cleanReload=page.waitForEvent('framenavigated',{
      predicate:frame=>frame===page.mainFrame()&&frame.url()===base,timeout:15000,
    });
    await cleanReload;
    await load();
    assert(cleanProbeCount>=1,'release polling did not run');
    assert.equal(await page.locator('#build-version').textContent(),pageVersion);
    console.log('CM_HTML_CLEAN_AUTO_RELOAD_PASS',name,JSON.stringify({
      probeCount:cleanProbeCount,version:pageVersion}));
    await page.unroute('**/labs/cm-html/healthz');

    // Dirty editor: new release must never clobber an unsaved CM6 transaction.
    const dirtyText='\nLAB_UNSAVED_PROTECTION_'+name+'\n';
    await page.evaluate(text=>{
      const view=window.__cmHtmlLab.view;
      view.dispatch({changes:{from:view.state.doc.length,insert:text},userEvent:'input'});
    },dirtyText);
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('未保存'));
    const dirtyLength=await page.evaluate(()=>window.__cmHtmlLab.view.state.doc.length);
    let dirtyProbeCount=0;
    await page.route('**/labs/cm-html/healthz',route=>{
      if(dirtyProbeCount++===0)return route.fulfill({status:200,contentType:'application/json',
        body:JSON.stringify({service:'cm-html-lab',scope:'/labs/cm-html/',version:newVersion})});
      return route.continue();
    });
    await page.evaluate(()=>window.__cmHtmlLab.checkForUpdate());
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('新版已发布'));
    await wait(300);
    assert.equal(await page.evaluate(()=>window.__cmHtmlLab.view.state.doc.length),dirtyLength);
    assert(!existsSync(savedPath),'unsaved buffer was written before authorization');
    assert.equal(await page.locator('#build-version').textContent(),pageVersion);
    assert.equal(dirtyProbeCount,1);
    console.log('CM_HTML_DIRTY_UPDATE_BLOCKED',name,'OK');

    // Authorized save clears the dirty guard; pending release then reloads.
    const pendingReload=page.waitForEvent('framenavigated',{
      predicate:frame=>frame===page.mainFrame()&&frame.url()===base,timeout:20000,
    });
    await page.locator('#save').click();
    await page.locator('#unlock-dialog').waitFor({state:'visible'});
    const code=readFileSync(join(lab,'.runtime/private/save-token'),'utf8').trim().slice(0,12);
    await page.locator('#unlock-code').fill(code);
    await page.locator('#unlock-form button[type="submit"]').click();
    await pendingReload;
    await load();
    assert(existsSync(savedPath),'authorized lab save missing');
    assert(readFileSync(savedPath,'utf8').endsWith(dirtyText),'new release discarded unsaved changes');
    assert.equal(await page.locator('#build-version').textContent(),pageVersion);
    assert((await page.evaluate(()=>window.__cmHtmlLab.view.state.doc.toString())).endsWith(dirtyText));
    assert.deepEqual(errors,[],name+' page errors');
    assert.deepEqual(rootCalls,[],name+' consulted the mainline API');
    console.log('CM_HTML_SAVE_THEN_RELOAD_PASS',name,'OK');
    await browser.close();browser=null;
    passed++;
  }finally{
    if(browser)await browser.close();
    server.kill('SIGTERM');
  }
}
assert(passed>0,'No browser engines ran');
assert.deepEqual([fixture,mainDocument,mainRelease].map(hash),baseline,'V6 mainline was modified');
console.log('CM_HTML_UPDATE_ISOLATION_PASS',JSON.stringify({engines:passed}));
