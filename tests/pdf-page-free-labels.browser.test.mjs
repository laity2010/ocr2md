/** Real first-page dense PDF 1.5x free-page labels: Chrome/WebKit.
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
const dir=mkdtempSync(join(tmpdir(),'ocr2md-page-free-labels-'));
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
  const groups=[...paper.querySelectorAll('button.ocr-pdf-rail-group')];
  const visible=[...labels].filter(el=>el.checkVisibility()&&
    getComputedStyle(el).visibility!=='hidden');
  const paths=[...paper.querySelectorAll('svg.ocr-pdf-label-leaders path')]
    .filter(path=>getComputedStyle(path).visibility!=='hidden');
  const ends=[...paper.querySelectorAll('svg.ocr-pdf-label-leaders circle')];
  const svg=paper.querySelector('svg.ocr-pdf-label-leaders');
  const leaderStyle=paths.length?{opacity:Number(getComputedStyle(paths[0]).opacity),
    width:Number.parseFloat(getComputedStyle(paths[0]).strokeWidth),
    layer:Number(getComputedStyle(svg).zIndex)}:null;
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
    groups:groups.length,represented:visible.length,
    leaders:paths.length,endpointCount:ends.length,leaderStyle,problems,
    sides:{left:visible.filter(el=>el.getBoundingClientRect().left<bounds.left+bounds.width*.45).length,
      right:visible.filter(el=>el.getBoundingClientRect().right>bounds.left+bounds.width*.55).length}};
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
        try{await page.waitForFunction(()=>document.querySelector('.ocr-pdf-status')?.textContent==='就绪',null,{timeout:95000});}
        catch(error){
          const diagnostic=await page.evaluate(()=>({
            status:document.querySelector('.ocr-pdf-status')?.textContent,
            title:document.title,
            pages:document.querySelectorAll('.page').length,
            covers:document.querySelectorAll('.ocr-pdf-block-cover').length,
            chips:document.querySelectorAll('.ocr-pdf-rail-label').length,
            labels:document.querySelectorAll('#module-select option').length,
            body:document.body.innerText.slice(0,900)})).catch(e=>({error:String(e)}));
          console.error('PDF_BROWSER_BOOT_DIAGNOSTIC',name,JSON.stringify({diagnostic,errors}));
          throw error;
        }
        await page.locator('#module-select').evaluate(el=>{el.value='text-block';el.dispatchEvent(new Event('change',{bubbles:true}));});
        await page.waitForFunction(()=>document.querySelector('#module-select')?.value==='text-block');
        await selectPreview(page,'pdf');
        const first=page.locator('.page[data-page-number="1"]');
        await first.waitFor({state:'attached',timeout:80000});
        await page.locator('.ocr-pdf-block-cover[data-block-id="p0b7"]').scrollIntoViewIfNeeded({timeout:60000});
        await page.waitForFunction(()=>document.querySelectorAll('.page[data-page-number="1"] .ocr-pdf-rail-label').length>15,
          null,{timeout:60000});
        const before=await inspect(page);
        assert(!before.error);assert(before.original>15);
        assert.equal(before.groups,0,'no label grouping UI may remain');
        assert.equal(before.visible,before.original,'every real block label is always visible');
        assert.equal(before.represented,before.original,'no PBS ID can disappear');
        assert.equal(before.leaders,before.visible,'every block has a direct leader');
        assert.equal(before.endpointCount,before.visible,'every connector ends at a marked OCR edge');
        assert(before.leaderStyle.opacity>=.78&&before.leaderStyle.width>=1.6,
          'unfocused leaders must remain readable at 1.5×');
        assert(before.leaderStyle.layer>5,'leader SVG must paint above OCR cover tint');
        assert.deepEqual(before.problems,[]);
        assert(before.sides.left>0&&before.sides.right>0,
          'dense page must use both sides of the paper, not one crowded rail');
        console.log('PDF_FREE_PAGE_LABELS_VISIBLE_PASS',name,JSON.stringify(before));
        if(process.env.OCR_PBS_VISUAL_CAPTURE)
          await page.screenshot({path:process.env.OCR_PBS_VISUAL_CAPTURE.replace(/\.png$/,
            `-${name}-all.png`),animations:'disabled'});
        const native=page.locator('.ocr-pdf-block-cover[data-block-id="p0b7"] > .ocr-pdf-block-ctrl');
        assert.equal(await native.evaluate(el=>getComputedStyle(el).visibility),'visible');
        await native.click({timeout:35000});
        const one=first.locator('svg.ocr-pdf-label-leaders path.ocr-pdf-rail-focused-line');
        assert.equal(await one.count(),1);
        assert.equal(await one.getAttribute('data-pbs-id'),'p0b7');
        assert.equal(await first.locator('svg.ocr-pdf-label-leaders circle.ocr-pdf-rail-focused-end').getAttribute('data-pbs-id'),
          'p0b7','focused leader must highlight its exact endpoint');
        assert(await native.evaluate(el=>el.classList.contains('ocr-pdf-rail-focused-label')));
        const child=first.locator('.ocr-pdf-block-fragment[data-subblock-id="p0b7s0"] > .ocr-pdf-subblock-chip');
        await child.click({timeout:35000});
        assert.equal(await one.getAttribute('data-pbs-id'),'p0b7s0');
        assert.equal(await first.locator('svg.ocr-pdf-label-leaders circle.ocr-pdf-rail-focused-end').getAttribute('data-pbs-id'),
          'p0b7s0','child focus must migrate its endpoint marker');
        assert.deepEqual((await inspect(page)).problems,[]);
        console.log('PDF_FREE_PAGE_FOCUS_PASS',name);
        assert.equal(readFileSync(doc,'utf8'),source,'PDF group selection cannot modify Markdown');
        assert.deepEqual(errors,[]);
        console.log('PDF_FREE_PAGE_BROWSER_PASS',name);
      }finally{await page.close();}
    }finally{await browser.close();}
  }
}finally{app.kill('SIGTERM');rmSync(dir,{recursive:true,force:true});}
