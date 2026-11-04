/** Real first-page dense PDF 1.5x badge expansion: Chrome/WebKit.
 * Disposable original document and settings, no CMD writes.
 */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {chromium,webkit,devices} from 'playwright';
import {chromeExecutable} from './platform.test-helper.mjs';
import {toMarkdown} from '../packages/minerujson-md/dist/index.js';
import {selectPreview} from './navigation-ui.test-helper.mjs';
const source=toMarkdown(readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8'));
const dir=mkdtempSync(join(tmpdir(),'ocr2md-rail-groups-'));
const doc=join(dir,'document.md');writeFileSync(doc,source);
const settingsFile=join(dir,'settings.json');
writeFileSync(settingsFile,JSON.stringify({settings:{'pdf.textBlocks.labelScale':{
  key:'labelScale',category1:'PDF',category2:'文本块',value:1.5,
  comment:'PDF block label scale',range:{min:.5,max:2.5,step:.1}}}},null,2));
const port=await new Promise((ok,fail)=>{const server=createServer();server.once('error',fail);
  server.listen(0,'127.0.0.1',()=>{const p=server.address().port;server.close(e=>e?fail(e):ok(p));});});
const base='http://127.0.0.1:'+port;
const app=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),env:{...process.env,
  V6_PORT:String(port),V6_BIND:'127.0.0.1',V6_LAB_ID:'',V6_LAN_TLS_HOST:'',
  V6_DOCUMENT_PATH:doc,V6_PDF_PATH:resolve('.v6/workspace/buffetts-alpha.original.pdf'),
  V6_STATIC_ROOT:resolve('dist'),V6_SETTINGS_PATH:settingsFile,V6_TOKEN_PATH:join(dir,'token')},stdio:'ignore'});
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
const inspect=page=>page.evaluate(()=>{
  const paper=document.querySelector('.page[data-page-number="1"]');
  if(!paper)return {error:'paper 1 missing'};
  const bounds=paper.getBoundingClientRect();
  const labels=[...paper.querySelectorAll('.ocr-pdf-rail-label')];
  const groups=[...paper.querySelectorAll('button.ocr-pdf-rail-group:not([hidden])')];
  const visible=[...labels,...groups].filter(el=>el.checkVisibility()&&
    getComputedStyle(el).visibility!=='hidden');
  const paths=[...paper.querySelectorAll('svg.ocr-pdf-label-leaders path')]
    .filter(path=>getComputedStyle(path).visibility!=='hidden');
  const covers=[...paper.querySelectorAll('.ocr-pdf-block-cover,.ocr-pdf-block-fragment:not([hidden])')];
  const collide=(a,b)=>a.left<b.right-.6&&b.left<a.right-.6&&a.top<b.bottom-.6&&b.top<a.bottom-.6;
  const problems=[];
  for(const el of visible){
    const a=el.getBoundingClientRect();
    if(a.left<bounds.left-.7||a.right>bounds.right+.7||a.top<bounds.top-.7||a.bottom>bounds.bottom+.7)
      problems.push('paper escape '+el.textContent.trim());
    for(const item of covers)if(collide(a,item.getBoundingClientRect()))
      problems.push('cover hit '+el.textContent.trim());
    for(const other of visible)if(other!==el&&collide(a,other.getBoundingClientRect()))
      problems.push('label collision '+el.textContent.trim()+' / '+other.textContent.trim());
  }
  return {paperWidth:bounds.width,original:labels.length,visible:visible.length,
    groups:groups.length,represented:visible.length-groups.length+
      groups.reduce((sum,g)=>sum+Number(g.dataset.memberCount),0),
    leaders:paths.length,problems,
    keys:groups.map(g=>({ids:g.dataset.memberIds,count:g.dataset.memberCount}))};
});
try{
  let ready=false;
  for(let i=0;i<200;i++){try{if((await fetch(base+'/healthz')).ok){ready=true;break;}}catch{}await sleep(150);}
  assert(ready,'isolated server missing');
  for(const [name,engine,binary] of [['Chrome',chromium,chromeExecutable()],['iPad-WebKit',webkit,webkit.executablePath()]]){
    if(process.env.ONE_BROWSER&&process.env.ONE_BROWSER!==name)continue;
    const browser=await engine.launch({headless:true,...(binary?{executablePath:binary}:{})});
    try{
      const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:900}});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      try{
        await page.goto(base,{waitUntil:'domcontentloaded',timeout:75000});
        await page.waitForFunction(()=>document.querySelector('.ocr-pdf-status')?.textContent==='就绪',null,{timeout:95000});
        await page.locator('#module-select').evaluate(el=>{el.value='text-block';el.dispatchEvent(new Event('change',{bubbles:true}));});
        await page.waitForFunction(()=>document.querySelector('#module-select')?.value==='text-block');
        await selectPreview(page,'pdf');
        const first=page.locator('.page[data-page-number="1"]');
        await first.waitFor({state:'attached',timeout:80000});
        await page.locator('.ocr-pdf-block-cover[data-block-id="p0b7"]').scrollIntoViewIfNeeded({timeout:60000});
        await page.waitForFunction(()=>document.querySelectorAll('.page[data-page-number="1"] .ocr-pdf-rail-label').length>15,
          null,{timeout:60000});
        let before=await inspect(page);
        assert(!before.error);assert(before.original>15);
        assert(before.groups>=2,'dense page must reduce visible labels with group badges');
        assert(before.visible<before.original,'summaries should materially reduce initial clutter');
        assert.equal(before.represented,before.original,'no ID may be lost when collapsed');
        assert.equal(before.leaders,before.visible-before.groups);
        assert.deepEqual(before.problems,[]);
        console.log('PDF_RAIL_GROUP_COLLAPSED_PASS',name,JSON.stringify(before));
        if(process.env.OCR_PBS_VISUAL_CAPTURE)
          await page.screenshot({path:process.env.OCR_PBS_VISUAL_CAPTURE.replace(/\.png$/,
            `-${name}-collapsed.png`),animations:'disabled'});
        const group=first.locator('button.ocr-pdf-rail-group:not([hidden])[data-member-ids~="p0b7"]');
        assert.equal(await group.count(),1);
        const included=(await group.getAttribute('data-member-ids')).split(' ');
        assert(included.length>=4);
        const native=page.locator('.ocr-pdf-block-cover[data-block-id="p0b7"] > .ocr-pdf-block-ctrl');
        assert.equal(await native.evaluate(el=>getComputedStyle(el).visibility),'hidden');
        await group.click({timeout:35000});
        assert.equal(await native.evaluate(el=>getComputedStyle(el).visibility),'visible');
        const expanded=await inspect(page);
        assert.equal(expanded.groups,before.groups-1);
        assert.equal(expanded.represented,expanded.original);
        assert.deepEqual(expanded.problems,[]);
        await native.click({timeout:35000});
        const one=first.locator('svg.ocr-pdf-label-leaders path.ocr-pdf-rail-focused-line');
        assert.equal(await one.count(),1);
        assert.equal(await one.getAttribute('data-pbs-id'),'p0b7');
        assert(await native.evaluate(el=>el.classList.contains('ocr-pdf-rail-focused-label')));
        console.log('PDF_RAIL_GROUP_EXPANDED_PASS',name,JSON.stringify(expanded));
        if(process.env.OCR_PBS_VISUAL_CAPTURE)
          await page.screenshot({path:process.env.OCR_PBS_VISUAL_CAPTURE.replace(/\.png$/,
            `-${name}-expanded.png`),animations:'disabled'});
        await page.locator('.ocr-pdf-scroller').press('Escape');
        const closed=await inspect(page);
        assert.equal(closed.groups,before.groups);assert.deepEqual(closed.problems,[]);
        assert.equal(readFileSync(doc,'utf8'),source,'PDF group selection cannot modify Markdown');
        assert.deepEqual(errors,[]);
        console.log('PDF_RAIL_GROUP_BROWSER_PASS',name);
      }finally{await page.close();}
    }finally{await browser.close();}
  }
}finally{app.kill('SIGTERM');rmSync(dir,{recursive:true,force:true});}
