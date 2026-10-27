/** Default Main build (NO V6_LAB_ID) must expose integrated WCP/AG/CMD UI.
 * Isolated production Python app serves the actual Main dist; no user writes.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {chromium,webkit} from 'playwright';
const dir=mkdtempSync(join(tmpdir(),'ocr2md-main-promoted-'));
const fixture=readFileSync(process.env.OCR_MAIN_USE_CURRENT_COPY==='1'?'.v6/workspace/buffetts-alpha.minerujson.md':'packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8');
const settings=readFileSync('.v6/settings.json','utf8');
writeFileSync(join(dir,'document.md'),fixture);
writeFileSync(join(dir,'settings.json'),settings);
const port=5996,origin=`http://127.0.0.1:${port}`;
const server=spawn('/usr/bin/python3',['scripts/v6_serve.py'],{cwd:process.cwd(),env:{...process.env,
 V6_BIND:'127.0.0.1',V6_PORT:String(port),V6_LAN_TLS_HOST:'',
 V6_STATIC_ROOT:resolve('dist'),V6_DOCUMENT_PATH:join(dir,'document.md'),
 V6_SETTINGS_PATH:join(dir,'settings.json'),V6_TOKEN_PATH:join(dir,'does-not-exist-token')},stdio:'ignore'});
const choose=async (locator,value)=>locator.evaluate((el,v)=>{
 el.value=v;el.dispatchEvent(new Event('change',{bubbles:true}));
},value);
try{
 let running=false;
 for(let i=0;i<130;i++){
  try{const r=await fetch(origin+'/healthz');if(r.ok){running=true;break;}}catch{}
  await new Promise(r=>setTimeout(r,125));
 }
 assert(running,'isolated Main production server failed');
 for(const [name,engine,ctx] of [['Chrome',chromium,{viewport:{width:1440,height:900}}],
  ['iPad-WebKit',webkit,{viewport:{width:1024,height:768},isMobile:true,hasTouch:true,deviceScaleFactor:2}]]){
  if(process.env.OCR_TEST_BROWSER&&process.env.OCR_TEST_BROWSER!==name)continue;
  const b=await engine.launch({headless:true});
  try{
   const p=await b.newPage(ctx);
   const errors=[],writes=[];
   p.on('pageerror',e=>errors.push(e.message));
   p.on('request',r=>{if(r.url().includes('/api/')&&!['GET','HEAD'].includes(r.method()))writes.push(r.url())});
   await p.goto(origin,{waitUntil:'domcontentloaded',timeout:60000});
   const nav=p.locator('.ocr-source-pane .ocr-navigation-files .ts-control');
   await nav.waitFor({state:'visible',timeout:55000});
   const element=p.locator('.ocr-lab-ag-toolbar .ocr-navigation-elements .ts-control');
   await element.waitFor({state:'visible',timeout:20000});
   await p.locator('.ocr-preview-switchbar .ocr-navigation-preview .ts-control').waitFor({state:'visible',timeout:20000});
   const sourceSelect=p.locator('.ocr-source-pane .ocr-lab-file-select');
   await p.waitForFunction(()=>document.querySelectorAll('.ocr-source-pane option[value^="virtual:"]').length>=3,null,{timeout:30000});
   const chapters=await sourceSelect.locator('option[value^="virtual:"]').count();
   // Regression: Main's unbounded mother view previously disabled a checked
   // "全部" checkbox. The checkbox must be usable and AG-only even here.
   const all=p.locator('input[aria-label="章节所有"]');
   const agRows=async()=>Number(await p.locator('.ocr-outline-grid [role="grid"]').getAttribute('aria-rowcount'))-1;
   assert.equal(await all.isDisabled(),false,'AG 全部 must not be disabled on mother');
   assert.equal(await all.isChecked(),true);
   const totalRows=await agRows();
   await all.uncheck();
   await p.waitForFunction(full=>Number(document.querySelector('.ocr-outline-grid [role="grid"]')?.getAttribute('aria-rowcount'))<full+1,totalRows,{timeout:11000});
   const motherFiltered=await agRows();
   assert(motherFiltered>=0&&motherFiltered<totalRows,'Unchecking 全部 did not filter AG');
   assert.equal(await sourceSelect.inputValue(),'document','AG filter changed mother source view');
   assert.equal(new URL(p.url()).searchParams.has('view'),false,'AG filter navigated source');
   assert.equal(await all.isChecked(),false);
   await p.screenshot({path:`.v6/evidence/main-all-unchecked-${name}.png`,animations:'disabled',timeout:45000});
   await all.check();
   await p.waitForFunction(full=>Number(document.querySelector('.ocr-outline-grid [role="grid"]')?.getAttribute('aria-rowcount'))===full+1,totalRows,{timeout:11000});
   assert.equal(await agRows(),totalRows);
   // A second element owner must obey the same control without changing CMD
   // source/Markdown and without writing any business API.
   await choose(p.locator('.ocr-lab-element-select'),'media');
   const mediaRows=async()=>Number(await p.locator('.ocr-media-grid [role="grid"]').getAttribute('aria-rowcount'))-1;
   await p.waitForFunction(()=>document.querySelector('#module-select')?.value==='media',null,{timeout:10000});
   const mediaFull=await mediaRows();
   await all.uncheck();
   await p.waitForFunction(full=>Number(document.querySelector('.ocr-media-grid [role="grid"]')?.getAttribute('aria-rowcount'))<full+1,mediaFull,{timeout:11000});
   const mediaFiltered=await mediaRows();
   assert.equal(await sourceSelect.inputValue(),'document');
   await all.check();
   await p.waitForFunction(full=>Number(document.querySelector('.ocr-media-grid [role="grid"]')?.getAttribute('aria-rowcount'))===full+1,mediaFull,{timeout:11000});
   await choose(p.locator('.ocr-lab-element-select'),'chapter-boundary');
   console.log('MAIN_AG_ALL_MOTHER_PASS',name,JSON.stringify({totalRows,motherFiltered,mediaFull,mediaFiltered}));
   await p.screenshot({path:`.v6/evidence/main-promoted-${name}-initial.png`,animations:'disabled',timeout:45000});
   const target=await sourceSelect.locator('option[value^="virtual:"]').nth(1).getAttribute('value');
   await choose(sourceSelect,target);
   await p.waitForFunction(expected=>new URLSearchParams(location.search).get('view')===expected,
    target.slice('virtual:'.length),{timeout:16000});
   await p.locator('.ocr-lab-element-select').waitFor({state:'attached'});
   await choose(p.locator('.ocr-lab-element-select'),'media');
   await p.waitForFunction(()=>document.querySelector('#module-select')?.value==='media',null,{timeout:10000});
   const mode=await p.locator('#module-select').inputValue();
   await nav.click();
   await p.locator('body>.ocr-navigation-popup-files:visible [data-selectable][data-value="settings"]').click();
   await p.locator('#settings-workspace .ocr-navigation-files .ts-control').waitFor({state:'visible',timeout:18000});
   const settingSelection=await p.locator('#settings-workspace .ocr-lab-file-select').inputValue();
   const hiddenSelection=await sourceSelect.inputValue();
   await p.screenshot({path:`.v6/evidence/main-promoted-${name}-settings.png`,animations:'disabled',timeout:45000});
   assert.equal(settingSelection,'settings');assert.equal(hiddenSelection,'settings');
   assert(chapters>=3);assert.equal(mode,'media');
   assert.deepEqual(errors,[],'Main UI JS errors');assert.deepEqual(writes,[],'Main integration test wrote user data');
   console.log('DEFAULT_MAIN_LAB_UI_PASS',name,JSON.stringify({chapters,mode,settingSelection,hiddenSelection,errors,writes}));
  }finally{await b.close()}
 }
}finally{
 server.kill('SIGTERM');
 assert.equal(readFileSync(join(dir,'document.md'),'utf8'),fixture);
 assert.equal(readFileSync(join(dir,'settings.json'),'utf8'),settings);
}
