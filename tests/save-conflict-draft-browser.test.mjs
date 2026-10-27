/** After a 412 save conflict the unsaved editor draft must stay in the editor and the
 * other editor's disk content must not be overwritten (Chromium + WebKit, production build).
 * Runs against an isolated temp copy; requires `npx vite build` (dist/) first. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {cpSync,existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium,webkit} from 'playwright';

const repo=process.cwd();
assert(existsSync(join(repo,'dist/index.html')),'production dist/ missing: run npx vite build');
const T=mkdtempSync(join(tmpdir(),'v6-save-conflict-'));
for(const p of ['scripts','dist','packages/minerujson-md/fixtures'])cpSync(join(repo,p),join(T,p),{recursive:true});
mkdirSync(join(T,'.v6/workspace'),{recursive:true});
const pdf=process.env.V6_PDF_PATH||join(repo,'.v6/workspace/buffetts-alpha.original.pdf');
if(existsSync(pdf))cpSync(pdf,join(T,'.v6/workspace/buffetts-alpha.original.pdf'));
const PORT=Number(process.env.V6_SAVE_CONFLICT_PORT||4793), O=`http://127.0.0.1:${PORT}`;
const DOC=join(T,'.v6/workspace/buffetts-alpha.minerujson.md');
const srv=spawn('python3',[join(T,'scripts/v6_serve.py')],{cwd:T,env:{...process.env,V6_PORT:String(PORT),V6_STATIC_ROOT:join(T,'dist'),V6_LAB_ID:''},stdio:'ignore'});
try{
  let up=false;
  for(let i=0;i<100&&!up;i++){try{up=(await fetch(O+'/api/session')).ok}catch{await new Promise(r=>setTimeout(r,150))}}
  assert(up,'isolated server failed to start');
  const key=readFileSync(join(T,'.v6/private/editor-token'),'utf8').trim();
  for(const [label,engine] of [['Chromium',chromium],['WebKit',webkit]]){
    const browser=await engine.launch({headless:true});
    try{
      const ctx=await browser.newContext();
      await ctx.addCookies([{name:'v6edit',value:key,domain:'127.0.0.1',path:'/',httpOnly:true,secure:false,sameSite:'Lax'}]);
      const page=await ctx.newPage();
      await page.goto(O+'/',{waitUntil:'load'});
      await page.waitForSelector('.cm-content',{timeout:30000});
      await page.waitForFunction(()=>!/正在加载/.test(document.getElementById('status').textContent),null,{timeout:30000});
      const marker=`DRAFT_${label}_${Date.now()}`;
      await page.click('.cm-content');
      await page.keyboard.press('Control+Home');
      await page.keyboard.type(marker);
      const g=await fetch(O+'/api/document');
      const other=(await g.text())+`\nOTHER_EDITOR_${label}\n`;
      const put=await fetch(O+'/api/document',{method:'PUT',headers:{Cookie:'v6edit='+key,Origin:O,'If-Match':g.headers.get('ETag')},body:other});
      assert.equal(put.status,200,label+' out-of-band save should succeed');
      await page.click('#save');
      await page.waitForFunction(()=>/保存冲突/.test(document.getElementById('status').textContent),null,{timeout:15000});
      assert(await page.evaluate(m=>document.querySelector('.cm-content').textContent.includes(m),marker),label+' draft must remain after 412');
      assert.equal(readFileSync(DOC,'utf8'),other,label+' disk must keep the other editor content');
      console.log('SAVE_CONFLICT_DRAFT_PASS',label);
    }finally{await browser.close();}
  }
}finally{srv.kill();rmSync(T,{recursive:true,force:true});}
