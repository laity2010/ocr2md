/** Real global Settings slider -> PDF rail magnification, collision-free,
 * source unaffected, persisted JSON and reload. Disposable data only.
 */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {chromium,webkit,devices} from 'playwright';
import {chromeExecutable} from './platform.test-helper.mjs';
import {selectModule,selectPreview} from './navigation-ui.test-helper.mjs';
import {toMarkdown} from '../packages/minerujson-md/dist/index.js';
import {PDF_BLOCK_LABEL_SCALE_KEY as KEY} from '../ui/pdf-block-label-setting.js';
const source=toMarkdown(readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8'));
const dir=mkdtempSync(join(tmpdir(),'ocr2md-pdf-label-scale-'));
const doc=join(dir,'document.md'),settingsFile=join(dir,'settings.json'),token=join(dir,'token');
writeFileSync(doc,source);
const port=await new Promise((ok,fail)=>{const socket=createServer();socket.once('error',fail);
  socket.listen(0,'127.0.0.1',()=>{const p=socket.address().port;socket.close(e=>e?fail(e):ok(p));});});
const base='http://127.0.0.1:'+port;
const server=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),env:{...process.env,
  V6_PORT:String(port),V6_BIND:'127.0.0.1',V6_LAB_ID:'',V6_LAN_TLS_HOST:'',
  V6_DOCUMENT_PATH:doc,V6_PDF_PATH:resolve('.v6/workspace/buffetts-alpha.original.pdf'),
  V6_STATIC_ROOT:resolve('dist'),V6_SETTINGS_PATH:settingsFile,V6_TOKEN_PATH:token},stdio:'ignore'});
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
const tag=(page,id)=>page.locator(`.ocr-pdf-block-cover[data-block-id="${id}"] > .ocr-pdf-block-ctrl`);
const readWidth=async page=>{
  await tag(page,'p1b3').scrollIntoViewIfNeeded({timeout:35000});
  const bbox=await tag(page,'p1b3').boundingBox();assert(bbox);
  return bbox.width;
};
const cleanRails=page=>page.evaluate(()=>{
  const root=document.querySelector('.ocr-pdf-block-cover[data-block-id="p1b3"]')?.closest('.page');
  if(!root)return {error:'PDF page 2 not found'};
  const chips=[...root.querySelectorAll('.ocr-pdf-rail-label')].filter(n=>n.checkVisibility());
  const boxes=[...root.querySelectorAll('.ocr-pdf-block-cover,.ocr-pdf-block-fragment:not([hidden])')]
    .filter(n=>n.checkVisibility());
  const r=n=>n.getBoundingClientRect();
  const overlap=(a,b)=>a.left<b.right-.5&&b.left<a.right-.5&&a.top<b.bottom-.5&&b.top<a.bottom-.5;
  const colliding=[];
  for(const chip of chips){
    for(const item of boxes)if(overlap(r(chip),r(item)))
      colliding.push(`${chip.textContent} overlaps PDF ${item.dataset.blockId||item.dataset.subblockId}`);
    for(const other of chips)if(other!==chip&&overlap(r(chip),r(other)))
      colliding.push(`${chip.textContent} overlaps ${other.textContent}`);
  }
  return {labels:chips.length,colliding,leaders:root.querySelectorAll('svg.ocr-pdf-label-leaders path').length};
});
try{
  let ready=false;
  for(let i=0;i<190;i++){try{if((await fetch(base+'/healthz')).ok){ready=true;break;}}catch{}await sleep(160);}
  assert(ready,'disposable PDF settings server not ready');
  for(const [name,engine,binary] of [['Chrome',chromium,chromeExecutable()],
    ['iPad-WebKit',webkit,webkit.executablePath()]]){
    if(process.env.ONE_BROWSER&&name!==process.env.ONE_BROWSER)continue;
    // One isolated settings file per browser, no cross-engine leakage.
    writeFileSync(settingsFile,JSON.stringify({settings:{}},null,2)+'\n');
    const browser=await engine.launch({headless:true,...(binary?{executablePath:binary}:{})});
    try{
      const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:900}});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      try{
        await page.goto(base,{waitUntil:'domcontentloaded',timeout:75000});
        await page.waitForFunction(()=>document.querySelector('.ocr-pdf-status')?.textContent==='就绪',
          null,{timeout:95000});
        await selectModule(page,'text-block');await selectPreview(page,'pdf');
        const normal=await readWidth(page);
        await selectModule(page,'settings');
        const settingRow=page.locator('#settings-workspace .ag-row').filter({hasText:'labelScale'}).first();
        await settingRow.waitFor({state:'visible',timeout:50000});await settingRow.click();
        await page.waitForFunction(()=>document.querySelector('.ocr-settings-control label')?.textContent==='labelScale',
          null,{timeout:30000});
        const slider=page.locator('#settings-font-slider');
        assert.equal(await slider.inputValue(),'1');
        assert.equal(await page.locator('.ocr-settings-breadcrumb').textContent(),
          'PDF / 文本块 / labelScale');
        assert.equal(await slider.getAttribute('min'),'0.5');
        assert.equal(await slider.getAttribute('max'),'2.5');
        const set=async value=>slider.evaluate((el,next)=>{el.value=String(next);
          el.dispatchEvent(new Event('input',{bubbles:true}));},value);
        await set(0.6);
        await page.waitForFunction(()=>document.querySelector('#settings-font-slider')?.value==='0.6');
        await selectModule(page,'text-block');await selectPreview(page,'pdf');
        const small=await readWidth(page);
        assert(small<normal*.85,`0.6x must shrink PDF chip (${normal} -> ${small})`);
        await selectModule(page,'settings');
        await settingRow.click();await slider.waitFor({state:'visible'});
        assert.equal(await slider.inputValue(),'0.6');
        await set(1.5);
        await page.waitForFunction(()=>document.querySelector('#settings-font-slider')?.value==='1.5');
        await selectModule(page,'text-block');await selectPreview(page,'pdf');
        const enlarged=await readWidth(page);
        assert(enlarged>small*1.3,`1.5x must enlarge PDF chip visibly (${small} -> ${enlarged})`);
        const rail=await cleanRails(page);assert(!rail.error);
        assert(rail.labels>=10);assert.equal(rail.leaders,rail.labels);
        assert.deepEqual(rail.colliding,[],`${name} scaled PDF labels must avoid source boxes`);
        if(process.env.OCR_PBS_VISUAL_CAPTURE)
          await page.screenshot({path:process.env.OCR_PBS_VISUAL_CAPTURE.replace(/\.png$/,
            `-${name}.png`),animations:'disabled'});
        // Settings owns its own save, independent from document editing.
        await selectModule(page,'settings');
        await settingRow.click();
        const response=page.waitForResponse(r=>r.url().endsWith('/api/settings')&&
          r.request().method()==='PUT',{timeout:25000});
        await page.locator('#save').click();assert.equal((await response).status(),200);
        const persisted=JSON.parse(readFileSync(settingsFile,'utf8')).settings[KEY];
        assert.equal(persisted.value,1.5);assert.equal(persisted.category1,'PDF');
        assert.equal(persisted.category2,'文本块');
        assert.deepEqual(persisted.range,{min:0.5,max:2.5,step:0.1});
        assert.equal(readFileSync(doc,'utf8'),source,'Settings cannot modify the Markdown document');
        await page.reload({waitUntil:'domcontentloaded',timeout:75000});
        await page.waitForFunction(()=>document.querySelector('.ocr-pdf-status')?.textContent==='就绪',
          null,{timeout:95000});
        await selectModule(page,'text-block');await selectPreview(page,'pdf');
        const restored=await readWidth(page);
        assert(Math.abs(restored-enlarged)<3,`saved label multiplier must survive reload (${enlarged} vs ${restored})`);
        assert.deepEqual((await cleanRails(page)).colliding,[]);
        assert.deepEqual(errors,[]);
        console.log('PDF_GLOBAL_LABEL_SCALE_BROWSER_PASS',name,{normal,small,enlarged,restored,
          labels:rail.labels,leaders:rail.leaders,persisted:1.5});
      }finally{await page.close();}
    }finally{await browser.close();}
  }
}finally{server.kill('SIGTERM');rmSync(dir,{recursive:true,force:true});}
