/** Default Main build (NO V6_LAB_ID) must expose integrated WCP/AG/CMD UI.
 * Isolated production Python app serves the actual Main dist; no user writes.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {chromium,webkit} from 'playwright';
const dir=mkdtempSync(join(tmpdir(),'ocr2md-main-promoted-'));
const fixture=readFileSync(process.env.OCR_MAIN_USE_CURRENT_COPY==='1'?'.v6/workspace/buffetts-alpha.minerujson.md':'packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8');
// Isolate navigation from any real Main workspace/book selection.
// Hermetic: untracked .v6/settings.json may not exist in a clean checkout.
const settingsData=existsSync('.v6/settings.json')?JSON.parse(readFileSync('.v6/settings.json','utf8')):{settings:{}};
for(const key of ['workspace.files.rootPath','workspace.files.bookName']){
 if(settingsData.settings?.[key])settingsData.settings[key].value='';
}
const settings=JSON.stringify(settingsData,null,2)+'\n';
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
   // Chapter boundary is the mother document. Its AG "全部" must be
   // checked, visibly disabled and impossible to change in any element type.
   const all=p.locator('input[aria-label="章节所有"]');
   const agRows=async()=>Number(await p.locator('.ocr-outline-grid [role="grid"]').getAttribute('aria-rowcount'))-1;
   const totalRows=await agRows();
   assert.equal(await sourceSelect.inputValue(),'document');
   const chapterMarkers=p.locator('.ocr-outline-grid .ocr-outline-checkbox');
   const editableMarker=p.locator('.ocr-outline-grid .ag-row[row-index="1"] .ocr-outline-checkbox');
   assert(await p.locator('.ocr-outline-grid .ag-row[row-index="0"] .ocr-outline-checkbox').isDisabled(),'First mother chapter is always independent');
   assert(await editableMarker.isEnabled(),'Only mother chapter-boundary permits changing 独立成章');
   assert.equal(await all.isChecked(),true,'Mother AG 全部 must start checked');
   assert.equal(await all.isDisabled(),true,'Mother AG 全部 must be disabled');
   await all.evaluate(el=>{el.checked=false;el.dispatchEvent(new Event('change',{bubbles:true}));});
   assert.equal(await all.isChecked(),true,'Mother AG 全部 cannot be unchecked even by synthetic change');
   assert.equal(await agRows(),totalRows,'Mother AG must keep all heading rows');
   // The element category can change on the mother; chapter scope cannot.
   await choose(p.locator('.ocr-lab-element-select'),'media');
   const mediaRows=async()=>Number(await p.locator('.ocr-media-grid [role="grid"]').getAttribute('aria-rowcount'))-1;
   await p.waitForFunction(()=>document.querySelector('#module-select')?.value==='media',null,{timeout:10000});
   const mediaFull=await mediaRows();
   assert.equal(await all.isChecked(),true);
   assert.equal(await all.isDisabled(),true,'Mother media AG 全部 must remain disabled');
   await choose(p.locator('.ocr-lab-element-select'),'chapter-boundary');
   console.log('MAIN_AG_MOTHER_LOCKED_PASS',name,JSON.stringify({totalRows,mediaFull}));
   await p.screenshot({path:`.v6/evidence/main-promoted-${name}-initial.png`,animations:'disabled',timeout:45000});
   const target=await sourceSelect.locator('option[value^="virtual:"]').nth(1).getAttribute('value');
   await choose(sourceSelect,target);
   await p.waitForFunction(expected=>new URLSearchParams(location.search).get('view')===expected,
    target.slice('virtual:'.length),{timeout:16000});
   // Chapter files alone allow AG "全部" toggling. Default is scoped, and
   // checking shows all chapter rows without changing the selected file.
   assert.equal(await all.isDisabled(),false,'Chapter file must allow AG 全部 changes');
   assert.equal(await all.isChecked(),false,'Chapter file defaults to current-chapter AG');
   const chapterFileMarker=p.locator('.ocr-outline-grid .ocr-outline-checkbox').first();
   await chapterFileMarker.waitFor({state:'attached',timeout:12000});
   assert(await chapterFileMarker.isDisabled(),'独立成章 must be read-only in chapter files');
   const chapterRows=await agRows();
   assert(chapterRows>=0&&chapterRows<totalRows,'Chapter file must initially filter heading rows');
   await all.check();
   await p.waitForFunction(total=>Number(document.querySelector('.ocr-outline-grid [role="grid"]')?.getAttribute('aria-rowcount'))===total+1,totalRows,{timeout:12000});
   assert(await editableMarker.isDisabled(),
    '独立成章 must remain disabled when chapter-file 全部 shows all rows');
   assert.equal(await sourceSelect.inputValue(),target,'AG 全部 changed selected chapter file');
   await all.uncheck();
   await p.waitForFunction(total=>Number(document.querySelector('.ocr-outline-grid [role="grid"]')?.getAttribute('aria-rowcount'))<total+1,totalRows,{timeout:12000});
   assert.equal(await sourceSelect.inputValue(),target);
   await p.locator('.ocr-lab-element-select').waitFor({state:'attached'});
   await choose(p.locator('.ocr-lab-element-select'),'media');
   await p.waitForFunction(()=>document.querySelector('#module-select')?.value==='media',null,{timeout:10000});
   await p.locator('#ag-functions-toggle').click();
   await p.locator('#media-refresh').waitFor({state:'visible',timeout:10000});
   await p.locator('#media-download-all').waitFor({state:'visible',timeout:10000});
   assert.equal(await all.isDisabled(),false,'Chapter-file media AG 全部 must be enabled');
   await all.check();
   await all.uncheck();
   // Returning to the chapter-boundary mother must restore checked + gray.
   await choose(sourceSelect,'document');
   await p.waitForFunction(()=>!new URLSearchParams(location.search).has('view'),null,{timeout:16000});
   assert.equal(await all.isChecked(),true,'Returning to mother must restore checked 全部');
   assert.equal(await all.isDisabled(),true,'Returning to mother must lock 全部');
   await p.waitForFunction(()=>document.querySelector('#module-select')?.value==='chapter-boundary'&&
     !document.querySelector('.ocr-outline-grid .ag-row[row-index="1"] .ocr-outline-checkbox')?.disabled,
     null,{timeout:10000});
   assert(await editableMarker.isEnabled(),
    'Returning to chapter-boundary mother must re-enable 独立成章');
   await choose(sourceSelect,target);
   await p.waitForFunction(expected=>new URLSearchParams(location.search).get('view')===expected,
    target.slice('virtual:'.length),{timeout:16000});
   assert.equal(await all.isDisabled(),false,'Returning to chapter file must unlock 全部');
   // Returning through 章节定界 intentionally reset the element picker to 标题;
   // the chapter-file editor must still allow selecting 媒体 independently.
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
