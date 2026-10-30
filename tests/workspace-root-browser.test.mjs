/** Real Main shell: select book catalogue, choose a first-level book and save once. */
import {unlockCode,adoptLoopbackSessionCookie} from './v6-auth.test-helper.mjs';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {chromium,webkit} from 'playwright';
const source=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8');
const mineru=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const dynamicPort=()=>new Promise((resolve,reject)=>{
 const server=createServer();server.on('error',reject);server.listen(0,'127.0.0.1',()=>{
 const port=server.address().port;server.close(e=>e?reject(e):resolve(port));});
});
const minimalPDF=()=>{
 const objects=['<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R >>',
  '<< /Length 0 >>\nstream\n\nendstream'];
 let pdf='%PDF-1.4\n',offsets=[0];
 objects.forEach((obj,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${obj}\nendobj\n`;});
 const pos=Buffer.byteLength(pdf);
 pdf+=`xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
 for(const offset of offsets.slice(1))pdf+=`${String(offset).padStart(10,'0')} 00000 n \n`;
 return pdf+`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF\n`;
};
for(const [name,engine,device] of [['Chrome',chromium,{viewport:{width:1320,height:840}}],
 ['iPad-WebKit',webkit,{viewport:{width:1024,height:768},isMobile:true,hasTouch:true}]]){
 const scratch=mkdtempSync(join(tmpdir(),'ocr-book-ui-'+name+'-'));
 const from=join(scratch,'from'),catalog=join(scratch,'catalog');
 const work=join(catalog,'Book B'),unready=join(catalog,'Broken Book');
 for(const dir of [from,catalog,work,unready,join(work,'pdf'),join(work,'mineru json')])mkdirSync(dir);
 const originalName='mother.minerujson.md',targetName='Book B.minerujson.md';
 const destinationDoc=source+'\n<!-- BOOK_WORKSPACE_SELECTED -->\n';
 writeFileSync(join(from,originalName),source);
 writeFileSync(join(from,'evidence.pdf'),minimalPDF());
 writeFileSync(join(work,'mineru json','book.json'),mineru);
 writeFileSync(join(work,'pdf','book.pdf'),minimalPDF());
 writeFileSync(join(work,targetName),destinationDoc);
 const token=join(scratch,'auth'),settings=join(scratch,'settings.json');
 writeFileSync(token,'WORKROOT_UI_BROWSER_TEST_TOKEN_abcdefghijklmnopqrstuvwxyz');
 const port=await dynamicPort(),origin='http://127.0.0.1:'+port;
 const server=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),env:{...process.env,
 V6_BIND:'127.0.0.1',V6_PORT:String(port),V6_LAN_TLS_HOST:'',V6_LAB_ID:'',
 V6_DOCUMENT_PATH:join(from,originalName),V6_PDF_PATH:join(from,'evidence.pdf'),
 V6_TOKEN_PATH:token,V6_SETTINGS_PATH:settings,
 V6_WORKSPACE_ALLOWED_ROOTS:scratch,V6_STATIC_ROOT:resolve('dist')},stdio:'ignore'});
 let browser=null;
 try{
  let ready=false;
  for(let i=0;i<130;i++){try{if((await fetch(origin+'/healthz')).ok){ready=true;break}}catch{}await wait(120)}
  assert(ready,'isolated production Main not ready');
  browser=await engine.launch({headless:true});
  const context=await browser.newContext(device);
  const unlock=await context.request.post(origin+'/api/unlock',{headers:{Origin:origin},
   data:{code:unlockCode(readFileSync(token,'utf8'))}});assert.equal(unlock.status(),200);
  await adoptLoopbackSessionCookie(context,unlock,origin);
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin,{waitUntil:'domcontentloaded',timeout:60000});
  await page.locator('#editor .cm-editor').waitFor({state:'visible',timeout:60000});
  await page.locator('#module-select').evaluate(el=>{
   el.value='settings';el.dispatchEvent(new Event('change',{bubbles:true}));
  });
  const row=key=>page.locator('#settings-workspace .ag-row').filter({hasText:key}).first();
  await row('rootPath').waitFor({state:'visible',timeout:30000});await row('rootPath').click();
  const input=page.locator('#settings-workspace-root');
  await input.waitFor({state:'visible',timeout:20000});
  assert.equal(await input.inputValue(),'');
  const feedback=page.locator('.ocr-settings-directory-feedback');
  await input.fill('/etc');
  await page.getByRole('button',{name:'验证路径'}).click();
  await page.waitForFunction(()=>document.querySelector('.ocr-settings-directory-feedback')?.dataset.state==='error');
  assert.equal(await feedback.evaluate(el=>getComputedStyle(el).color),'rgb(255, 153, 153)');
  assert.equal(await input.getAttribute('aria-invalid'),'true');
  await input.fill(scratch);
  await page.getByRole('button',{name:'验证路径'}).click();
  await page.waitForFunction(()=>document.querySelector('.ocr-settings-directory-feedback')?.dataset.state==='warning');
  assert.equal(await feedback.evaluate(el=>getComputedStyle(el).color),'rgb(233, 196, 106)');
  await page.getByRole('button',{name:'浏览目录'}).click();
  await page.getByRole('button',{name:'📁 '+scratch,exact:true}).click();
  await page.getByRole('button',{name:'📁 catalog',exact:true}).click();
  await page.getByRole('button',{name:'设为工作根目录'}).click();
  assert.equal(await input.inputValue(),catalog);
  assert(!existsSync(settings),'root selection should not implicitly save');
  await row('bookName').click();
  const bookButton=page.getByRole('button',{name:/Book B.*已有转换文档/});
  await bookButton.waitFor({state:'visible',timeout:25000});await bookButton.click();
  assert(!existsSync(settings),'book selection should not implicitly save');
  await page.locator('#save').click();
  await page.waitForFunction(()=>document.querySelector('#module-select')?.value==='chapter-boundary'&&
   document.querySelector('#editor .cm-editor')!==null,null,{timeout:45000});
  await page.waitForFunction(async()=>{
   const response=await fetch('/api/document',{cache:'no-store'});
   return response.ok&&(await response.text()).includes('BOOK_WORKSPACE_SELECTED');
  },null,{timeout:28000});
  const result=(await (await context.request.get(origin+'/api/workspace/roots')).json());
  assert.equal(result.activeRoot,work);assert.equal(result.activeBook,'Book B');
  assert.equal(result.configuredRoot,catalog);
  assert.equal(readFileSync(join(from,originalName),'utf8'),source);
  assert.equal(readFileSync(join(work,targetName),'utf8'),destinationDoc);
  assert.equal(JSON.parse(readFileSync(settings,'utf8')).settings['workspace.files.bookName'].value,'Book B');
  // A newly typed catalogue invalidates the prior book choice before save.
  await page.locator('#module-select').evaluate(el=>{
   el.value='settings';el.dispatchEvent(new Event('change',{bubbles:true}));
  });
  await row('rootPath').click();
  await page.locator('#settings-workspace-root').fill(scratch);
  await page.getByRole('button',{name:'验证路径'}).click();
  await row('bookName').click();
  await page.getByText('尚未选中书籍，继续使用原工作文档').waitFor({state:'visible',timeout:20000});
  assert.equal(JSON.parse(readFileSync(settings,'utf8')).settings['workspace.files.bookName'].value,'Book B',
   'Unsaved root change must not mutate saved book');
  assert.equal(await page.locator('#build-version').count(),1);
  assert.deepEqual(errors,[]);
  console.log('WORKROOT_BROWSER_PASS',name,JSON.stringify({bookCatalog:true,
   bookSelected:true,rootNotDocument:true,saveReload:true,oldDocIntact:true,errors}));
 }finally{await browser?.close();server.kill('SIGTERM');rmSync(scratch,{recursive:true,force:true});}
}
