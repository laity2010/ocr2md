/** WP4 compatibility: legacy text-block candidate review without PDF fixture.
 * Only checks AG mode and existing review table; PDF dual boxes need a
 * separate sanctioned isolated original PDF fixture.
 */
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {chromium,webkit} from 'playwright';
import {chromeExecutable,webkitExecutable} from './platform.test-helper.mjs';
const original=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8');
const dir=mkdtempSync(join(tmpdir(),'ocr2md-wp4-legacy-')),path=join(dir,'legacy.md');writeFileSync(path,original);
const port=await new Promise((ok,fail)=>{const s=createServer();s.once('error',fail);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(e=>e?fail(e):ok(p));});});
const url=`http://127.0.0.1:${port}/`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{
 cwd:process.cwd(),env:{...process.env,V6_DOCUMENT_PATH:path,V6_PDF_PATH:join(dir,'absent.pdf')},stdio:'ignore'});
try{
 let ready=false;for(let i=0;i<150;i++){try{if((await fetch(url)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,150));}
 assert(ready);
 for(const [name,engine,executablePath] of [['Chrome',chromium,chromeExecutable()],['iPad-WebKit',webkit,webkitExecutable()]]){
  const browser=await engine.launch({headless:true,...(executablePath?{executablePath}:{})});
  try{
   const page=await browser.newPage({viewport:{width:1032,height:642}});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
   await page.waitForFunction(()=>Boolean(window.__v6cm6?.cm&&document.querySelector('#module-select')),null,{timeout:90000});
   await page.evaluate(()=>{const el=document.querySelector('#module-select');
     el.value='text-block';el.dispatchEvent(new Event('change',{bubbles:true}));});
   await page.waitForFunction(()=>/PBS 224（子块 0）/.test(document.querySelector('#status')?.textContent||''),null,{timeout:90000});
   await page.locator('#ag-functions-toggle').click();
   const menu=page.locator('#ag-functions-menu [data-module="text-block"]');
   assert.equal(await menu.getByRole('button').count(),13);
   assert.equal(await page.locator('[data-pbs-drag-handle]').count(),0,
     'legacy PBS requires explicit CMD migration before drag');
   assert.equal(await menu.getByRole('button',{name:'显式迁移旧版 MinerU 块链标签'}).isEnabled(),true);
   await menu.getByRole('button',{name:'查看跨页跨栏接续候选'}).click();
   await page.waitForFunction(()=>/候选 5 组 · 跨栏 4 · 跨页 1/.test(document.querySelector('#status')?.textContent||''),null,{timeout:45000});
   await page.locator('.ocr-text-block-grid .ag-row[row-id="p6b6--p6b7"]').first().waitFor({timeout:16000});
   assert.deepEqual(errors,[]);assert.equal(readFileSync(path,'utf8'),original);
   console.log('CMD_BC_WP4_LEGACY_REVIEW_PASS',name,{legacy:224,candidates:5,noAutomaticMigration:true});
  }finally{await browser.close();}
 }
}finally{server.kill('SIGTERM');rmSync(dir,{recursive:true,force:true});}
