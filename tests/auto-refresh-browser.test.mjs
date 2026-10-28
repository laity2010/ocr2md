/** Main continuous deployment: new release reloads immediately without saving dirty buffers.
 * Uses isolated production HTTP service and real Chrome/iPad WebKit, never user data.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {chromium,webkit} from 'playwright';
const temp=mkdtempSync(join(tmpdir(),'ocr2md-main-auto-release-'));
const original=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8');
const doc=join(temp,'mother.minerujson.md'),settingsFile=join(temp,'settings.json');
const version=JSON.parse(readFileSync('dist/release-version.json')).version;
const newer='v6-20991231-235959';
writeFileSync(doc,original);
// Tiny but valid PDF prevents an unrelated viewer-load error on WebKit.
const objs=['<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R >>',
  '<< /Length 0 >>\nstream\n\nendstream'];
let pdf='%PDF-1.4\n';const offsets=[0];
for(let i=0;i<objs.length;i++){
  offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${objs[i]}\nendobj\n`;
}
const pos=Buffer.byteLength(pdf);
pdf+=`xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
for(const off of offsets.slice(1))pdf+=`${String(off).padStart(10,'0')} 00000 n \n`;
pdf+=`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF\n`;
const pdfPath=join(temp,'evidence.pdf');writeFileSync(pdfPath,pdf);
const auth=join(temp,'editor-token');writeFileSync(auth,'isolated-main-auto-release-token');
const port=await new Promise((ok,fail)=>{
  const socket=createServer();socket.on('error',fail);
  socket.listen(0,'127.0.0.1',()=>{const n=socket.address().port;socket.close(e=>e?fail(e):ok(n));});
});
const origin=`http://127.0.0.1:${port}`;
const server=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),env:{...process.env,
  V6_BIND:'127.0.0.1',V6_PORT:String(port),V6_LAB_ID:'',V6_LAN_TLS_HOST:'',
  V6_DOCUMENT_PATH:doc,V6_PDF_PATH:pdfPath,V6_SETTINGS_PATH:settingsFile,
  V6_TOKEN_PATH:auth,V6_STATIC_ROOT:resolve('dist')},stdio:'ignore'});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function runScenario(name,engine,device,scenario){
 const browser=await engine.launch({headless:true});
 try{
  const page=await browser.newPage(device);
  const errors=[],dialogs=[],writes=[];
  let navigations=0,reported=version;
  page.on('pageerror',error=>errors.push(error.message));
  page.on('dialog',async d=>{dialogs.push(d.type());await d.dismiss();});
  page.on('request',req=>{if(req.url().includes('/api/')&&!['GET','HEAD'].includes(req.method()))writes.push(req.method());});
  page.on('framenavigated',frame=>{
    if(frame===page.mainFrame()){
      navigations++;
      if(navigations>=2)reported=version; // prevent repeated reloads in the synthetic test
    }
  });
  await page.route('**/healthz',route=>route.fulfill({status:200,
    contentType:'application/json',body:JSON.stringify({version:reported})}));
  await page.goto(origin,{waitUntil:'domcontentloaded',timeout:60000});
  await page.locator('#editor .cm-editor').waitFor({state:'visible',timeout:60000});
  if(scenario==='markdown'){
    await page.locator('#editor .cm-content').click({position:{x:55,y:35}});
    await page.keyboard.type('UNSAVED_MAIN_RELEASE_BUFFER');
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('未保存'));
  }else{
    await page.locator('#module-select').evaluate(el=>{
      el.value='settings';el.dispatchEvent(new Event('change',{bubbles:true}));
    });
    const row=page.locator('#settings-workspace .ag-row').filter({hasText:'defaultFontSize'}).first();
    await row.waitFor({state:'visible',timeout:20000});await row.click();
    const slider=page.locator('#settings-font-slider');
    await slider.waitFor({state:'visible'});
    const before=Number(await slider.inputValue());
    await slider.evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));},before===12?13:12);
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('未保存'));
  }
  assert.equal(navigations,1);
  reported=newer;
  // The running page must detect the new build in <=5 seconds and replace itself,
  // even when both buffer and dialogs would formerly block updates.
  const deadline=Date.now()+28000;
  while(navigations<2&&Date.now()<deadline)await wait(250);
  assert(navigations>=2,`${name} ${scenario}: release reload blocked by unsaved state`);
  await page.locator('#editor .cm-editor').waitFor({state:'visible',timeout:30000});
  assert.deepEqual(dialogs,[],`${name} ${scenario}: automatic reload should not ask to save`);
  assert.deepEqual(writes,[],`${name} ${scenario}: automatic reload must not save drafts`);
  assert.equal(readFileSync(doc,'utf8'),original,'User data changed on release reload');
  assert.equal(readFileSync(settingsFile,'utf8').includes('UNSAVED_MAIN_RELEASE_BUFFER'),false);
  assert.deepEqual(errors,[],`${name} ${scenario}: unexpected browser errors`);
  console.log('MAIN_AUTO_RELEASE_PASS',name,scenario,JSON.stringify({navigations,autoReload:true,
    browserDraftDiscarded:true,serverDataUnmodified:true,dialogs,writes,errors}));
 }finally{await browser.close();}
}
try{
 let ready=false;
 for(let i=0;i<120;i++){
  try{if((await fetch(origin+'/healthz')).ok){ready=true;break}}catch{}
  await wait(100);
 }
 assert(ready,'isolated production server not ready');
 for(const [name,engine,device] of [['Chrome',chromium,{viewport:{width:1320,height:840}}],
  ['iPad-WebKit',webkit,{viewport:{width:1024,height:768},isMobile:true,hasTouch:true}]]){
  for(const scenario of ['markdown','settings'])await runScenario(name,engine,device,scenario);
 }
 console.log('MAIN_AUTO_RELEASE_4_OF_4_PASS');
}finally{server.kill('SIGTERM');rmSync(temp,{force:true,recursive:true});}
