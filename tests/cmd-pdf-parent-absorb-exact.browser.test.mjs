/** Same-ID PDF Safari regression: p1b3 is an OCR image parent with native
 * p1b3s0; it must disappear and its child must become p1b5sN whether the
 * drop is on the parent chip or an already-existing child chip.
 * Uses a disposable isolated document/server, NEVER saves user data. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {webkit,chromium,devices} from 'playwright';
import {chromeExecutable} from './platform.test-helper.mjs';
import {selectPreview} from './navigation-ui.test-helper.mjs';
import {toMarkdown,toMineruJSON} from '../packages/minerujson-md/dist/index.js';
import {planCMDReparentPBS,readCMDBlockChains} from '../ui/cmd-block-chains.js';

const originalJSON=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8');
const initial=toMarkdown(originalJSON);
const apply=(src,p)=>[...p.edits].sort((a,b)=>b.from-a.from).reduce((s,e)=>{
  assert.equal(s.slice(e.from,e.to),e.expected);
  return s.slice(0,e.from)+e.insert+s.slice(e.to);
},src);
const withChild=apply(initial,planCMDReparentPBS(initial,'p1b6','p1b5'));
assert.equal(toMineruJSON(withChild),originalJSON);
const dir=mkdtempSync(join(tmpdir(),'ocr2md-parent-absorb-exact-'));
const doc=join(dir,'document.md'),pdf=resolve('.v6/workspace/buffetts-alpha.original.pdf');
const port=await new Promise((ok,fail)=>{const s=createServer();s.once('error',fail);
  s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(e=>e?fail(e):ok(p));});});
const base='http://127.0.0.1:'+port+'/';
const server=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),env:{...process.env,
  V6_PORT:String(port),V6_BIND:'127.0.0.1',V6_LAB_ID:'',V6_LAN_TLS_HOST:'',
  V6_DOCUMENT_PATH:doc,V6_PDF_PATH:pdf,V6_STATIC_ROOT:resolve('dist'),
  V6_SETTINGS_PATH:join(dir,'settings.json'),V6_TOKEN_PATH:join(dir,'token')},stdio:'ignore'});
const pause=ms=>new Promise(ok=>setTimeout(ok,ms));
const center=b=>({clientX:b.x+b.width/2,clientY:b.y+b.height/2});
try{
  writeFileSync(doc,initial);
  let ok=false;for(let i=0;i<200;i++){try{if((await fetch(base+'healthz')).ok){ok=true;break;}}catch{}await pause(160);}
  assert(ok,'isolated PDF service unavailable');
  for(const [name,engine,binary] of [['Chrome',chromium,chromeExecutable()],['iPad-WebKit',webkit,webkit.executablePath()]]){
    if(process.env.ONE_BROWSER&&process.env.ONE_BROWSER!==name)continue;
    const browser=await engine.launch({headless:true,...(binary?{executablePath:binary}:{})});
    try{
      for(const testCase of [
        {name:'parent-chip',source:initial,target:'p1b5',out:'p1b5s1'},
        {name:'existing-body-chip',source:withChild,target:'p1b5s0',out:'p1b5s2'}
      ]){
        writeFileSync(doc,testCase.source);
        const page=await browser.newPage({...devices['iPad Pro 11 landscape'],
          viewport:{width:1032,height:900}});
        try{
          page.setDefaultTimeout(28000);
          const errors=[];page.on('pageerror',e=>errors.push(e.message));
          const response=await page.goto(base,{waitUntil:'domcontentloaded',timeout:70000});
          assert.equal(response.status(),200);
          await page.waitForFunction(()=>document.querySelector('.ocr-pdf-status')?.textContent==='就绪',
            null,{timeout:90000});
          await page.locator('#module-select').evaluate(el=>{
            el.value='text-block';el.dispatchEvent(new Event('change',{bubbles:true}));
          });
          const count=readCMDBlockChains(testCase.source).atoms.length;
          await page.waitForFunction(n=>document.querySelector('#status')?.textContent.includes('PBS '+n),
            count,{timeout:65000});
          await selectPreview(page,'pdf');
          const from=page.locator('.ocr-pdf-block-cover[data-block-id="p1b3"] > .ocr-pdf-block-ctrl');
          const to=testCase.target.includes('s')?
            page.locator('.ocr-pdf-block-fragment[data-subblock-id="'+testCase.target+'"] > .ocr-pdf-subblock-chip'):
            page.locator('.ocr-pdf-block-cover[data-block-id="'+testCase.target+'"] > .ocr-pdf-block-ctrl');
          await from.waitFor({state:'attached',timeout:50000});
          await to.scrollIntoViewIfNeeded({timeout:35000});
          const fr=await from.boundingBox(),tr=await to.boundingBox();
          assert(fr&&tr,name+' '+testCase.name+' source/target visible');
          const old=page.locator('.ocr-pdf-block-cover[data-origin-id="p1b3"]');
          const oldRect=await old.boundingBox();
          const touch={bubbles:true,pointerId:63,pointerType:'touch',button:0,isPrimary:true};
          await from.dispatchEvent('pointerdown',{...touch,...center(fr)});
          await page.locator('.ocr-pdf-block-drag-source').waitFor({state:'attached',timeout:6500});
          await page.locator('body').dispatchEvent('pointermove',{...touch,...center(tr)});
          const rail=page.locator('.ocr-pdf-block-drop-guide');
          await rail.waitFor({state:'attached',timeout:6500});
          const hit=await page.evaluate(()=>({kind:document.querySelector('.ocr-pdf-block-drop-guide')?.dataset.kind,
            status:document.querySelector('.ocr-pdf-status')?.textContent}));
          assert(hit.status.includes(testCase.target),name+' '+testCase.name+' pointed wrong target: '+JSON.stringify(hit));
          const zone=rail.locator('[data-placement="child"]');
          const zr=await zone.boundingBox();assert(zr);
          await page.locator('body').dispatchEvent('pointermove',{...touch,...center(zr)});
          await page.locator('body').dispatchEvent('pointerup',{...touch,...center(zr)});
          await page.waitForFunction(out=>!document.querySelector('.ocr-pdf-block-cover[data-block-id="p1b3"]')&&
            document.querySelector('.ocr-pdf-block-cover[data-block-id="'+out+'"][data-origin-id="p1b3s0"]'),
            testCase.out,{timeout:60000});
          await page.waitForFunction(out=>{
            const status=document.querySelector('#status')?.textContent||'';
            return status.includes('已归入 p1b3 → '+out)&&status.includes('可 Undo');
          },testCase.out,{timeout:30000});
          const newRect=await page.locator('.ocr-pdf-block-cover[data-block-id="'+testCase.out+'"]').boundingBox();
          for(const key of ['x','y','width','height'])
            assert(Math.abs(oldRect[key]-newRect[key])<2,name+' PDF bbox moved '+key);
          const inventory=await page.locator('#status').textContent();
          const ag=page.locator('.ocr-text-block-grid .ag-row[row-id="'+testCase.out+'"]').first();
          await ag.waitFor({state:'attached',timeout:25000});
          assert(!(await page.locator('.ocr-text-block-grid .ag-row[row-id="p1b3"]').count()),
            name+' old parent still in AG');
          assert(inventory.includes('已归入 p1b3'),name+' global status not updated: '+inventory);
          assert.equal(errors.length,0,'page errors: '+errors.join(';'));
          await page.locator('#undo').evaluate(el=>el.click());
          await page.waitForFunction(out=>document.querySelector('.ocr-pdf-block-cover[data-block-id="p1b3"]')&&
            !document.querySelector('.ocr-pdf-block-cover[data-block-id="'+out+'"]'),
            testCase.out,{timeout:55000});
          assert.equal(readFileSync(doc,'utf8'),testCase.source,'no automatic file write');
          console.log('PDF_EXACT_PARENT_ABSORB_PASS',name,testCase.name,
            {from:'p1b3',target:testCase.target,child:testCase.out,fixedBBox:true,undo:true,noAutoSave:true});
        }finally{await page.close();}
      }
    }finally{await browser.close();}
  }
}finally{server.kill('SIGTERM');rmSync(dir,{recursive:true,force:true});}
