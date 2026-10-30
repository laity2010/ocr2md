/** Independent acceptance of the V6 core fork: same modules, lab-only I/O. */
import {chromeExecutable,webkitExecutable} from '../../tests/platform.test-helper.mjs';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,readFileSync,mkdtempSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {homedir} from 'node:os';
import {chromium,webkit} from 'playwright';
const root=process.cwd(),lab=resolve('labs/cm-html');
const buildDir=process.env.CMHTML_STATIC_DIR||join(lab,'dist');
const prodDoc=join(root,'.v6/workspace/buffetts-alpha.minerujson.md');
const prodRelease=join(root,'.v6/release/index.html');
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const before={doc:hash(prodDoc),release:hash(prodRelease)};
const engines=[['Chrome',chromium,{executablePath:chromeExecutable()}],
 ['WebKit',webkit,{executablePath:webkitExecutable()}]];
const pause=ms=>new Promise(r=>setTimeout(r,ms));
for(const [i,[name,engine,launch]] of engines.entries()){
 const port=4540+i,base=`http://127.0.0.1:${port}/labs/cm-html/`;
 const temp=mkdtempSync(join(lab,'.runtime','acceptance-'));
 const doc=join(temp,'document.md'),settings=join(temp,'settings.json'),token=join(temp,'token');
 const server=spawn('python3',['scripts/v6_serve.py'],{cwd:root,stdio:'ignore',env:{...process.env,
   V6_LAB_ID:'cm-html',V6_PORT:String(port),V6_STATIC_ROOT:buildDir,V6_DOCUMENT_PATH:doc,V6_SETTINGS_PATH:settings,V6_TOKEN_PATH:token,V6_LAB_UNLOCK_TOKEN_PATH:token,
   V6_PDF_PATH:join(lab,'.runtime/reference.pdf')}});
 let browser;
 try{
   let ready=false;
   for(let k=0;k<140;k++){try{if((await fetch(base+'healthz')).ok){ready=true;break;}}catch{}await pause(100);}
   assert(ready,`${name}: fork server unavailable`);
   assert.equal((await fetch(`http://127.0.0.1:${port}/api/document`)).status,404,'Root API escaped lab');
   const unauthorized=await fetch(base+'api/document',{method:'PUT',body:'MUST_NOT_WRITE',headers:{Origin:`http://127.0.0.1:${port}`}});
   assert.equal(unauthorized.status,403);assert(!existsSync(doc));
   browser=await engine.launch({headless:true,...launch});
   const page=await browser.newPage({viewport:{width:1200,height:780}});
   const outside=[],errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   page.on('request',request=>{
     const url=new URL(request.url());
     if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/media/')||
        (url.hostname==='127.0.0.1' &&url.port!==String(port)))outside.push(url.pathname);
   });
   await page.goto(base,{waitUntil:'domcontentloaded'});
   assert.equal((await page.context().cookies()).filter(c=>c.name==='v6edit').length,0);
   await page.waitForFunction(()=>document.querySelectorAll('.ocr-outline-pane .ag-row').length>0&&
     document.querySelector('#status')?.textContent.includes('大纲21项'),null,{timeout:45000});
   const outline=await page.evaluate(()=>({rows:document.querySelectorAll('.ocr-outline-pane .ag-row').length,
      menus:[...document.querySelector('#module-select').options].map(x=>x.value),
      title:document.querySelector('.ocr-outline-h1')?.textContent||'',
      saved:document.querySelector('#status')?.textContent,
      release:document.querySelector('#build-version')?.textContent}));
   assert.deepEqual(outline.menus,['chapter-boundary','media','latex','settings']);
   assert(outline.title.includes('Alpha'));
   await page.locator('#module-select').selectOption('settings');
   await page.waitForFunction(()=>document.querySelectorAll('#settings-workspace .ag-row').length>=2,
     null,{timeout:25000});
   await page.locator('#module-select').selectOption('latex');
   await page.locator('#module-select').selectOption('media');
   await page.locator('#module-select').selectOption('chapter-boundary');
   await page.locator('#save').click();
   await page.waitForFunction(()=>document.querySelector('#unlock-dialog')?.open);
   assert(!existsSync(doc),'Unauthenticated save created a document');
   // Authorized write must only touch this fresh test scope.
   await page.locator('#unlock-code').fill(readFileSync(token,'utf8').trim().slice(0,12));
   await page.locator('#unlock-form button[type=submit]').click();
   await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('已保存'),null,{timeout:12000});
   assert(existsSync(doc),'Lab authorized save did not persist locally');
   const cookies=await page.context().cookies();
   assert(cookies.some(c=>c.name==='v6lab_cm_html'&&c.path==='/labs/cm-html/'));
   assert(!cookies.some(c=>c.name==='v6edit'));
   assert.equal(readFileSync(doc,'utf8').startsWith('<!-- minerujson:'),true);
   await page.reload({waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('大纲21项'),null,{timeout:30000});
   assert.equal(errors.length,0,errors.join(';'));
   assert.deepEqual(outside,[],'Unexpected unscoped requests');
   console.log('V6_LAB_FORK_PASS',name,JSON.stringify({outline,authorizedLabSave:true,unscopedRequests:outside.length,pageErrors:errors.length}));
   await page.close();
 } finally{if(browser)await browser.close();server.kill('SIGTERM');}
}
assert.deepEqual({doc:hash(prodDoc),release:hash(prodRelease)},before,'Mainline data or release changed');
console.log('V6_LAB_MAINLINE_ISOLATION_PASS');
