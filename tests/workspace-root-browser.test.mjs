/** Real Main release UI, isolated Python server, browser save/reload boundary. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {chromium,webkit} from 'playwright';
const fixture=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const dynamicPort=()=>new Promise((resolve,reject)=>{
 const server=createServer();server.on('error',reject);server.listen(0,'127.0.0.1',()=>{
 const port=server.address().port;server.close(e=>e?reject(e):resolve(port));
 });
});
for(const [name,engine,device] of [['Chrome',chromium,{viewport:{width:1340,height:840}}],
 ['iPad-WebKit',webkit,{viewport:{width:1024,height:768},isMobile:true,hasTouch:true}]]){
 const scratch=mkdtempSync(join(tmpdir(),'ocr2md-root-browser-'+name+'-'));
 const from=join(scratch,'from'),to=join(scratch,'to');
 for(const dir of [from,to])mkdirSync(dir);
 const docName='mother.minerujson.md';
 const destinationDoc=fixture+'\n<!-- WORKROOT_CHANGED_FOR_BROWSER -->\n';
 writeFileSync(join(from,docName),fixture);writeFileSync(join(to,docName),destinationDoc);
 // One-page PDF fixture prevents unrelated viewer 503 and long full-document rendering.
 const objects=['<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R >>',
  '<< /Length 0 >>\nstream\n\nendstream'];
 let pdf='%PDF-1.4\n',offsets=[0];
 objects.forEach((obj,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${obj}\nendobj\n`;});
 const xref=Buffer.byteLength(pdf);
 pdf+=`xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
 for(const offset of offsets.slice(1))pdf+=`${String(offset).padStart(10,'0')} 00000 n \n`;
 pdf+=`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
 for(const directory of [from,to])writeFileSync(join(directory,'buffetts-alpha.original.pdf'),pdf);

 const auth=join(scratch,'auth'),settings=join(scratch,'settings.json');
 writeFileSync(auth,'WORKROOT_UI_BROWSER_TEST_TOKEN_abcdefghijklmnopqrstuvwxyz');
 const port=await dynamicPort(),origin='http://127.0.0.1:'+port;
 const server=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),env:{...process.env,
 V6_BIND:'127.0.0.1',V6_PORT:String(port),V6_LAN_TLS_HOST:'',V6_LAB_ID:'',
 V6_DOCUMENT_PATH:join(from,docName),V6_TOKEN_PATH:auth,V6_SETTINGS_PATH:settings,
 V6_WORKSPACE_ALLOWED_ROOTS:scratch,V6_STATIC_ROOT:resolve('dist')},stdio:'ignore'});
 let browser=null;
 try{
  let running=false;
  for(let i=0;i<130;i++){try{if((await fetch(origin+'/healthz')).ok){running=true;break}}catch{}await wait(120)}
  assert(running,'isolated production Main not ready');
  browser=await engine.launch({headless:true});
  const context=await browser.newContext(device);
  const unlock=await context.request.post(origin+'/api/unlock',{headers:{Origin:origin},
   data:{code:readFileSync(auth,'utf8').slice(0,12)}});
  assert.equal(unlock.status(),200);
  console.log('WORKROOT_UI_STEP',name,'const page=await context.newPage');
  const page=await context.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  console.log('WORKROOT_UI_STEP',name,'await page.goto');
  await page.goto(origin,{waitUntil:'domcontentloaded',timeout:60000});
  await page.locator('#editor .cm-editor').waitFor({state:'visible',timeout:60000});
  console.log('WORKROOT_UI_STEP',name,'await page.locator');
  await page.locator('#module-select').evaluate(el=>{el.value='settings';el.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.locator('#settings-workspace .ag-row').filter({hasText:'rootPath'}).first().waitFor({state:'visible',timeout:30000});
  await page.locator('#settings-workspace .ag-row').filter({hasText:'rootPath'}).first().click();
  const input=page.locator('#settings-workspace #settings-workspace-root');
  await input.waitFor({state:'visible',timeout:20000});
  assert.equal(await input.inputValue(),'');
  console.log('WORKROOT_UI_STEP',name,'await page.getByRole');
  await page.getByRole('button',{name:'浏览目录'}).click();
  const choice=page.getByRole('button',{name:'📁 '+scratch,exact:true});
  await choice.waitFor({state:'visible'});await choice.click();
  await page.locator('.ocr-settings-directory-list button').filter({hasText:'📁 to'}).click();
  await page.getByRole('button',{name:'选用当前目录'}).click();
  assert.equal(await input.inputValue(),to);
  assert(!existsSync(settings),'directory choice should not implicitly save settings');
  assert.equal(await (await context.request.get(origin+'/api/workspace/roots')).json().then(x=>x.activeRoot),from);
  assert.equal(readFileSync(join(from,docName),'utf8'),fixture);
  console.log('WORKROOT_UI_STEP',name,'await page.locator');
  await page.locator('#save').click();
  await page.waitForFunction(()=>document.querySelector('#module-select')?.value==='chapter-boundary'&&
   document.querySelector('#editor .cm-editor')!==null,null,{timeout:35000});
  await page.waitForFunction(async()=>{
   const response=await fetch('/api/document',{cache:'no-store'});
   return response.ok&&(await response.text()).includes('WORKROOT_CHANGED_FOR_BROWSER');
  },null,{timeout:25000});
  assert.equal((await (await context.request.get(origin+'/api/workspace/roots')).json()).activeRoot,to);
  assert.equal(readFileSync(join(from,docName),'utf8'),fixture);
  assert.equal(readFileSync(join(to,docName),'utf8'),destinationDoc);
  assert.equal(JSON.parse(readFileSync(settings,'utf8')).settings['workspace.files.rootPath'].value,to);
  console.log('WORKROOT_UI_STEP',name,'assert.deepEqual');
  assert.deepEqual(errors,[]);
  console.log('WORKROOT_BROWSER_PASS',name,JSON.stringify({directoryBrowser:true,explicitSave:true,
    reloaded:true,oldDocumentIntact:true,errors}));
 }finally{await browser?.close();server.kill('SIGTERM');rmSync(scratch,{recursive:true,force:true});}
}
