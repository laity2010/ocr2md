/** Only enabled PDF structural gesture: p1b3 onto p1b4 child landing.
 * Actual Chrome/WebKit UI, disposable document, exact saved Markdown,
 * original PDF position, disappearance from PDF/AG and group highlighting.
 */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {chromium,webkit,devices} from 'playwright';
import {chromeExecutable} from './platform.test-helper.mjs';
import {selectPreview} from './navigation-ui.test-helper.mjs';
import {toMarkdown} from '../packages/minerujson-md/dist/index.js';
import {planCMDJoinP1B3IntoP1B4,readCMDBlockChains} from '../ui/cmd-block-chains.js';

const raw=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8');
const original=toMarkdown(raw),plan=planCMDJoinP1B3IntoP1B4(original);
const expected=[...plan.edits].sort((a,b)=>b.from-a.from).reduce((s,e)=>{
  assert.equal(s.slice(e.from,e.to),e.expected);return s.slice(0,e.from)+e.insert+s.slice(e.to);
},original);
for(const id of ['p1b4','p1b4s0','p1b4s1']){
  assert.equal(readCMDBlockChains(expected).atoms.find(a=>a.id===id)?.rawLine,
    `<!-- cmd:block:v1 id="${id}" -->`);
}
assert(!expected.includes('<!-- cmd:block:v1 id="p1b3"'));
assert(!expected.includes('<!-- cmd:absorbed-parent:v1 origin="p1b3"'));
const dir=mkdtempSync(join(tmpdir(),'ocr2md-only-p1b3-to-p1b4-'));
const doc=join(dir,'document.md'), token=join(dir,'token');
const port=await new Promise((ok,fail)=>{
  const s=createServer();s.once('error',fail);
  s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(e=>e?fail(e):ok(p));});
});
const base='http://127.0.0.1:'+port+'/';
const server=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),env:{...process.env,
  V6_PORT:String(port),V6_BIND:'127.0.0.1',V6_LAB_ID:'',V6_LAN_TLS_HOST:'',
  V6_DOCUMENT_PATH:doc,V6_PDF_PATH:resolve('.v6/workspace/buffetts-alpha.original.pdf'),
  V6_STATIC_ROOT:resolve('dist'),V6_SETTINGS_PATH:join(dir,'settings.json'),
  V6_TOKEN_PATH:token},stdio:'ignore'});
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
const center=r=>({clientX:r.x+r.width/2,clientY:r.y+r.height/2});
try{
  let ready=false;
  for(let i=0;i<185;i++){try{if((await fetch(base+'healthz')).ok){ready=true;break;}}catch{}await sleep(180);}
  assert(ready,'isolated OCR2MD server not ready');
  for(const [name,engine,binary] of [['Chrome',chromium,chromeExecutable()],['iPad-WebKit',webkit,webkit.executablePath()]]){
    if(process.env.ONE_BROWSER&&process.env.ONE_BROWSER!==name)continue;
    writeFileSync(doc,original);
    const browser=await engine.launch({headless:true,...(binary?{executablePath:binary}:{})});
    try{
      const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:900}});
      page.setDefaultTimeout(28000);
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      try{
        assert.equal((await page.goto(base,{waitUntil:'domcontentloaded',timeout:75000})).status(),200);
        await page.waitForFunction(()=>document.querySelector('.ocr-pdf-status')?.textContent==='就绪',null,{timeout:95000});
        await page.locator('#module-select').evaluate(el=>{el.value='text-block';el.dispatchEvent(new Event('change',{bubbles:true}));});
        await page.waitForFunction(n=>document.querySelector('#status')?.textContent?.includes('PBS '+n),
          readCMDBlockChains(original).atoms.length,{timeout:65000});
        await selectPreview(page,'pdf');
        console.log('ONLY_B3_B4_READY',name);
        const from=page.locator('.ocr-pdf-block-cover[data-block-id="p1b3"] > .ocr-pdf-block-ctrl');
        const to=page.locator('.ocr-pdf-block-cover[data-block-id="p1b4"] > .ocr-pdf-block-ctrl');
        await from.waitFor({state:'attached',timeout:50000});
        await to.scrollIntoViewIfNeeded({timeout:35000});
        const fr=await from.boundingBox(),tr=await to.boundingBox();assert(fr&&tr);
        const old=await page.locator('.ocr-pdf-block-cover[data-block-id="p1b3"]').boundingBox();
        const touch={bubbles:true,pointerId:345,pointerType:'touch',button:0,isPrimary:true};
        await from.dispatchEvent('pointerdown',{...touch,...center(fr)});
        await page.locator('.ocr-pdf-block-drag-source').waitFor({state:'attached',timeout:7500});
        await page.locator('body').dispatchEvent('pointermove',{...touch,...center(tr)});
        const rail=page.locator('.ocr-pdf-block-drop-guide');
        await rail.waitFor({state:'attached',timeout:7500});
        assert((await page.locator('.ocr-pdf-status').textContent()).includes('p1b4'));
        const zr=await rail.locator('[data-placement="child"]').boundingBox();assert(zr);
        await page.locator('body').dispatchEvent('pointermove',{...touch,...center(zr)});
        await page.locator('body').dispatchEvent('pointerup',{...touch,...center(zr)});
        await page.waitForFunction(()=>
          !document.querySelector('.ocr-pdf-block-cover[data-block-id="p1b3"]')&&
          document.querySelector('.ocr-pdf-block-cover[data-block-id="p1b4s1"][data-origin-id="p1b3s0"]')&&
          document.querySelector('.ocr-pdf-block-fragment[data-subblock-id="p1b4s0"]'),
          null,{timeout:75000});
        const moved=await page.locator('.ocr-pdf-block-cover[data-block-id="p1b4s1"]').boundingBox();
        for(const key of ['x','y','width','height'])
          assert(Math.abs(old[key]-moved[key])<2,name+' PDF original bbox changed '+key+': '+old[key]+' → '+moved[key]);
        assert.equal(readFileSync(doc,'utf8'),original,'gesture must not autosave');
        const parent=page.locator('.ocr-pdf-block-cover[data-block-id="p1b4"]');
        await parent.locator(':scope > .ocr-pdf-block-ctrl').evaluate(el=>el.click());
        await page.waitForFunction(()=>{
          const a=document.querySelector('.ocr-pdf-block-cover[data-block-id="p1b4"]');
          const b=document.querySelector('.ocr-pdf-block-cover[data-block-id="p1b4s1"]');
          const body=document.querySelector('.ocr-pdf-block-fragment[data-subblock-id="p1b4s0"]');
          return a?.classList.contains('ocr-pdf-block-group-active')&&
            b?.classList.contains('ocr-pdf-block-group-active')&&
            body?.classList.contains('ocr-pdf-block-group-child');
        },null,{timeout:25000});
        console.log('ONLY_B3_B4_HIGHLIGHT',name);
        await page.locator('#undo').evaluate(el=>el.click());
        await page.waitForFunction(()=>document.querySelector('.ocr-pdf-block-cover[data-block-id="p1b3"]')&&
          !document.querySelector('.ocr-pdf-block-cover[data-block-id="p1b4s1"]'),null,{timeout:60000});
        await page.locator('#redo').evaluate(el=>el.click());
        await page.waitForFunction(()=>!document.querySelector('.ocr-pdf-block-cover[data-block-id="p1b3"]')&&
          document.querySelector('.ocr-pdf-block-cover[data-block-id="p1b4s1"]'),null,{timeout:60000});
        await page.locator('#save').evaluate(el=>el.click());
        await page.waitForFunction(()=>document.querySelector('#unlock-dialog')?.open,null,{timeout:18000});
        await page.locator('#unlock-code').fill(readFileSync(token,'utf8').trim().slice(0,12));
        await page.locator('#unlock-form button[type=submit]').click();
        await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('已保存'),null,{timeout:35000});
        assert.equal(readFileSync(doc,'utf8'),expected,'browser saved source must equal expected exact bytes');
        // Reload from the saved id-only CMD: physical PDF aliases must be
        // reconstructed, not kept in a transient browser memory table.
        await page.reload({waitUntil:'domcontentloaded',timeout:75000});
        await page.waitForFunction(()=>document.querySelector('.ocr-pdf-status')?.textContent==='就绪',null,{timeout:95000});
        await page.locator('#module-select').evaluate(el=>{
          el.value='text-block';el.dispatchEvent(new Event('change',{bubbles:true}));
        });
        await selectPreview(page,'pdf');
        const surviving=page.locator('.ocr-pdf-block-cover[data-block-id="p1b4s1"][data-origin-id="p1b3s0"]');
        await surviving.waitFor({state:'attached',timeout:60000});
        assert.equal(await page.locator('.ocr-pdf-block-cover[data-block-id="p1b3"]').count(),0);
        const reloaded=await surviving.boundingBox();assert(reloaded);
        for(const key of ['x','y','width','height'])
          assert(Math.abs(old[key]-reloaded[key])<2,name+' reload changed original PDF bbox '+key);
        await page.locator('.ocr-pdf-block-cover[data-block-id="p1b4"] > .ocr-pdf-block-ctrl')
          .evaluate(el=>el.click());
        assert.equal(await surviving.evaluate(el=>el.classList.contains('ocr-pdf-block-group-active')),true);
        assert.equal(errors.length,0,'JavaScript errors: '+errors.join(';'));
        console.log('P1B3_INTO_P1B4_BROWSER_PASS',name,{oldParentGone:true,b4Parent:true,
          body:'p1b4s0',child:'p1b4s1',bboxUnchanged:true,groupHighlight:true,
          undo:true,redo:true,savedByteExact:true,noAutoSave:true,noAbsorbedMarker:true});
      }finally{await page.close();}
    }finally{await browser.close();}
  }
}finally{server.kill('SIGTERM');rmSync(dir,{recursive:true,force:true});}
