/** Standalone WebKit cold-reopen of an already-saved cross-page CMD document. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {chromium,webkit,devices} from 'playwright';
import {chromeExecutable} from './platform.test-helper.mjs';
import {toMarkdown} from '../packages/minerujson-md/dist/index.js';
import {planCMDAbsorbReviewedParent} from '../ui/cmd-block-chains.js';
const source=toMarkdown(readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8'));
const plan=planCMDAbsorbReviewedParent(source,'p1b5','p2b0');
const saved=[...plan.edits].sort((a,b)=>b.from-a.from).reduce((s,e)=>s.slice(0,e.from)+e.insert+s.slice(e.to),source);
const dir=mkdtempSync(join(tmpdir(),'ocr2md-cross-page-reopen-'));
writeFileSync(join(dir,'document.md'),saved);
const port=await new Promise((ok,bad)=>{const sock=createServer();sock.on('error',bad);sock.listen(0,'127.0.0.1',()=>{const v=sock.address().port;sock.close(()=>ok(v));});});
const base='http://127.0.0.1:'+port+'/';
const server=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),env:{...process.env,
  V6_PORT:String(port),V6_BIND:'127.0.0.1',V6_LAB_ID:'',V6_LAN_TLS_HOST:'',
  V6_DOCUMENT_PATH:join(dir,'document.md'),V6_PDF_PATH:resolve('.v6/workspace/buffetts-alpha.original.pdf'),
  V6_STATIC_ROOT:resolve('dist'),V6_SETTINGS_PATH:join(dir,'settings.json'),V6_TOKEN_PATH:join(dir,'token')},stdio:'ignore'});
try{
  let available=false;for(let n=0;n<100;n++){try{if((await fetch(base+'healthz')).ok){available=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}assert(available);
  for(const [name,engine,binary] of [['Chrome',chromium,chromeExecutable()],['iPad-WebKit',webkit,webkit.executablePath()]]){
    if(process.env.ONE_BROWSER&&name!==process.env.ONE_BROWSER)continue;
    const browser=await engine.launch({headless:true,...(binary?{executablePath:binary}:{})});
    try{
      const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:900}});
      const errors=[],failed=[];
      page.on('pageerror',e=>errors.push(e.message));
      page.on('requestfailed',request=>failed.push(request.url()+': '+request.failure()?.errorText));
      await page.goto(base,{waitUntil:'domcontentloaded',timeout:65000});
      const check=()=>page.evaluate(()=>({pdf:document.querySelector('.ocr-pdf-status')?.textContent,
        status:document.querySelector('#status')?.textContent,
        mode:document.querySelector('#module-select')?.value,
        pdfPages:document.querySelectorAll('.ocr-pdf-scroller .page').length,
        body:document.body?.innerText?.slice(0,250)}));
      try{await page.waitForFunction(()=>document.querySelector('.ocr-pdf-status')?.textContent==='就绪',null,{timeout:55000});}
      catch(e){console.log('COLD_REOPEN_FAIL',name,JSON.stringify(await check()),JSON.stringify(errors),JSON.stringify(failed));throw e;}
      console.log('COLD_REOPEN_READY',name,JSON.stringify(await check()),errors,failed);
      await page.locator('#module-select').evaluate(el=>{el.value='text-block';el.dispatchEvent(new Event('change',{bubbles:true}));});
      await page.waitForFunction(()=>document.querySelector('.ocr-pdf-block-cover[data-block-id="p2b0s1"][data-origin-id="p1b5"]'),null,{timeout:60000});
      console.log('COLD_REOPEN_GROUP_OK',name);
      await page.reload({waitUntil:'domcontentloaded',timeout:65000});
      try{await page.waitForFunction(()=>document.querySelector('.ocr-pdf-status')?.textContent==='就绪',null,{timeout:55000});}
      catch(e){console.log('SECOND_REOPEN_FAIL',name,JSON.stringify(await check()),JSON.stringify(errors),JSON.stringify(failed));throw e;}
      console.log('SECOND_REOPEN_OK',name,JSON.stringify(await check()),errors,failed);
      await page.close();
    }finally{await browser.close();}
  }
}finally{server.kill('SIGTERM');rmSync(dir,{recursive:true,force:true});}
