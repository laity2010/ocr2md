/** Isolated real PDF + authoritative HTML table/image child scope verification.
 * Uses modern MinerU JSON conversion as expected, and repairs legacy
 * initialized CMD without touching any real selected user's workspace. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,mkdirSync}from'node:fs';
import{join,resolve}from'node:path';
import{tmpdir}from'node:os';
import{createServer}from'node:net';
import{spawn}from'node:child_process';
import{chromium,webkit,devices}from'playwright';
import{toMarkdown}from'../packages/minerujson-md/dist/index.js';
import{planCMDMigrateLegacyBlockChains,planCMDAbsorbReviewedParent}from'../ui/cmd-block-chains.js';
import{planCMDRecoverNativeSubblocks}from'../ui/cmd-native-subblock-repair.js';
import{chromeExecutable}from'./platform.test-helper.mjs';
import{selectPreview}from'./navigation-ui.test-helper.mjs';
const json=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8');
const legacy=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8');
const native=toMarkdown(json);
const first=planCMDMigrateLegacyBlockChains(legacy);
const migrated=[...first.edits].sort((a,b)=>b.from-a.from).reduce((s,e)=>s.slice(0,e.from)+e.insert+s.slice(e.to),legacy);
const absorbed=planCMDAbsorbReviewedParent(migrated,'p1b3','p1b5');
const edited=[...absorbed.edits].sort((a,b)=>b.from-a.from).reduce((s,e)=>s.slice(0,e.from)+e.insert+s.slice(e.to),migrated);
const recovered=(await planCMDRecoverNativeSubblocks(edited,legacy,native)).result;
const dir=mkdtempSync(join(tmpdir(),'ocr2md-subblock-alignment-'));
const doc=join(dir,'document.md');writeFileSync(doc,recovered);
const port=await new Promise((resolve,reject)=>{const s=createServer();s.once('error',reject);
  s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(e=>e?reject(e):resolve(p));});});
const base=`http://127.0.0.1:${port}/`;
const server=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),env:{...process.env,
  V6_PORT:String(port),V6_BIND:'127.0.0.1',V6_LAB_ID:'',V6_LAN_TLS_HOST:'',
  V6_DOCUMENT_PATH:doc,V6_PDF_PATH:resolve('.v6/workspace/buffetts-alpha.original.pdf'),
  V6_STATIC_ROOT:resolve('dist'),V6_SETTINGS_PATH:join(dir,'settings.json'),
  V6_TOKEN_PATH:join(dir,'token')},stdio:'ignore'});
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
try{
  let ready=false;for(let i=0;i<210;i++){
    try{if((await fetch(base+'healthz')).ok){ready=true;break;}}catch{}
    await sleep(150);
  }
  assert(ready,'isolated server failed');
  for(const [name,engine,path]of[['Chrome',chromium,chromeExecutable()],
    ['iPad-WebKit',webkit,webkit.executablePath()]]){
    if(process.env.ONE_BROWSER&&process.env.ONE_BROWSER!==name)continue;
    const browser=await engine.launch({headless:true,...(path?{executablePath:path}:{})});
    try{
      const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1250,height:920}});
      const errors=[];page.on('pageerror',err=>errors.push(err.message));
      page.setDefaultTimeout(50000);
      assert.equal((await page.goto(base,{waitUntil:'domcontentloaded',timeout:75000})).status(),200);
      await page.locator('#editor .cm-content').waitFor({state:'visible',timeout:85000});
      await page.locator('#module-select').evaluate(el=>{
        el.value='text-block';el.dispatchEvent(new Event('change',{bubbles:true}));});
      await page.waitForFunction(()=>document.querySelector('.ocr-text-block-grid .ag-row'),null,{timeout:85000});
      await selectPreview(page,'pdf');
      await page.waitForFunction(()=>document.querySelector('.ocr-pdf-status')?.textContent==='就绪',null,{timeout:95000});
      for(const [pageNum,id]of[[1,'p0b5s0'],[4,'p3b1s0'],[5,'p4b0s1']]){
        await page.locator('.ocr-pdf-page').evaluate((el,pageNum)=>{
          el.value=String(pageNum);el.dispatchEvent(new Event('change',{bubbles:true}));
        },pageNum);
        const chip=page.locator(`.ocr-pdf-block-fragment[data-subblock-id="${id}"] > .ocr-pdf-subblock-chip`);
        await chip.waitFor({state:'attached',timeout:65000});
        await page.waitForFunction(id=>{
          const chip=document.querySelector(`.ocr-pdf-block-fragment[data-subblock-id="${id}"] > .ocr-pdf-subblock-chip`);
          return chip?.dataset.sourceKind==='content';
        },id,{timeout:25000});
        assert.equal(await chip.getAttribute('data-source-kind'),'content',
          `${name} PDF ${id} must not remain dashed`);
        if(process.env.OCR_NATIVE_ALIGNMENT_SCREENSHOTS){
          mkdirSync(process.env.OCR_NATIVE_ALIGNMENT_SCREENSHOTS,{recursive:true});
          await page.screenshot({path:resolve(process.env.OCR_NATIVE_ALIGNMENT_SCREENSHOTS,
            `native-alignment-${name}-${id}.png`),animations:'disabled'});
        }
        console.log('NATIVE_PDF_CHILD_BADGE_ALIGNED',name,'page',pageNum,'block',id);
      }
      assert.equal(readFileSync(doc,'utf8'),recovered,'readonly preview must not mutate CMD');
      assert.deepEqual(errors,[]);
      console.log('NATIVE_SUBBLOCK_BROWSER_PASS',name,'image s0 & both HTML table halves, PDF chip content, AG live, source immutable');
      await page.close();
    }finally{await browser.close();}
  }
}finally{server.kill('SIGTERM');rmSync(dir,{recursive:true,force:true});}
