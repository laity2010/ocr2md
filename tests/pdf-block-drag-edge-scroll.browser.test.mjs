/** Original 22-page PDF: held parent drag must autoscroll UP and DOWN before
 * choosing an actual OCR COVER and explicit before/after landing. No old
 * gutter-as-drop-target and no implicit triple-click join. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {readFileSync} from 'node:fs';
import {chromium,webkit} from 'playwright';
import {toMineruJSON} from '../packages/minerujson-md/dist/index.js';
import {planCMDInsertPBSParentAt} from '../ui/cmd-block-chains.js';
import {ensureTextBlockSample} from './fixtures/text-block-sample.mjs';

const documentPath=ensureTextBlockSample();
const source=readFileSync(documentPath,'utf8');
const originalJSON=toMineruJSON(source);
const scenarios=[
  {name:'down-to-p16b8',from:'p16b0',to:'p16b8',landing:'after',edge:'down'},
  {name:'up-to-p16b0',from:'p16b8',to:'p16b0',landing:'before',edge:'up'}
];
const port=await new Promise((resolve,reject)=>{
  const server=createServer();server.once('error',reject);
  server.listen(0,'127.0.0.1',()=>{const p=server.address().port;
    server.close(error=>error?reject(error):resolve(p));});
});
const url=`http://127.0.0.1:${port}/`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1',
  '--port',String(port),'--strictPort'],{
  cwd:process.cwd(),env:{...process.env,V6_DOCUMENT_PATH:documentPath},stdio:'ignore'
});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const center=rect=>({clientX:rect.x+rect.width/2,clientY:rect.y+rect.height/2});
try{
  let ready=false;for(let n=0;n<250;n++){
    try{if((await fetch(url)).ok){ready=true;break;}}catch{}
    await delay(100);
  }
  assert(ready,'isolated PDF test server unavailable');
  for(const [name,browserType,mobile] of [['Chrome',chromium,false],['iPad-WebKit',webkit,true]]){
    if(process.env.ONE_BROWSER&&process.env.ONE_BROWSER!==name)continue;
    const browser=await browserType.launch({headless:true});
    try{
      for(const [index,scenario] of scenarios.entries()){
        const page=await browser.newPage({viewport:{width:1220,height:840},
          isMobile:mobile,hasTouch:mobile});
        try{
          const errors=[];page.on('pageerror',e=>errors.push(e.message));
          await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
          await page.locator('.ocr-lab-ag-toolbar .ocr-navigation-elements .ts-control').click();
          await page.locator('.ocr-navigation-popup-elements:visible [data-value="text-block"]').click();
          await page.waitForFunction(()=>/原始 224 块/.test(document.querySelector('#status')?.textContent||''),
            null,{timeout:45000});
          await page.locator('.ocr-preview-switchbar .ocr-navigation-preview .ts-control').click();
          await page.locator('.ocr-navigation-popup-preview:visible [data-value="pdf"]').click();
          await page.waitForFunction(()=>document.querySelectorAll('.ocr-pdf-block-cover').length===224,
            null,{timeout:40000});
          const src=page.locator(`.ocr-pdf-block-cover[data-block-id="${scenario.from}"] > .ocr-pdf-block-ctrl`);
          const targetCover=page.locator(`.ocr-pdf-block-cover[data-block-id="${scenario.to}"]`);
          const scroller=page.locator('.ocr-pdf-scroller');
          await src.scrollIntoViewIfNeeded({timeout:32000});
          const srcRect=await src.boundingBox(),pane=await scroller.boundingBox();
          const originalTarget=await targetCover.boundingBox();
          assert(srcRect&&pane&&originalTarget);
          assert(scenario.edge==='down'?
            originalTarget.y+originalTarget.height/2>pane.y+pane.height:
            originalTarget.y+originalTarget.height/2<pane.y,
            name+' '+scenario.name+' destination must start beyond the PDF viewport');
          const startScroll=await scroller.evaluate(el=>el.scrollTop);
          const pointer={bubbles:true,pointerId:410+index,pointerType:'touch',button:0,isPrimary:true};
          await src.dispatchEvent('pointerdown',{...pointer,...center(srcRect)});
          await page.locator('.ocr-pdf-block-drag-arrow').waitFor({state:'attached',timeout:5500});
          const edge={clientX:Math.min(pane.x+pane.width-18,Math.max(pane.x+18,srcRect.x+srcRect.width/2)),
            clientY:scenario.edge==='down'?pane.y+pane.height-9:pane.y+9};
          await page.locator('body').dispatchEvent('pointermove',{...pointer,...edge});
          await page.waitForFunction(({from,edge})=>{
            const scroller=document.querySelector('.ocr-pdf-scroller');
            return scroller&&(edge==='down'?scroller.scrollTop>from+40:scroller.scrollTop<from-40);
          },{from:startScroll,edge:scenario.edge},{timeout:15000});
          await page.waitForFunction(({id})=>{
            const pane=document.querySelector('.ocr-pdf-scroller')?.getBoundingClientRect();
            const bbox=document.querySelector(`.ocr-pdf-block-cover[data-block-id="${id}"]`)?.getBoundingClientRect();
            return pane&&bbox&&bbox.width>5&&bbox.height>5&&
              (bbox.top+bbox.bottom)/2>=pane.top+64&&
              (bbox.top+bbox.bottom)/2<=pane.bottom-64;
          },{id:scenario.to},{timeout:15000});
          // Exercise the real pointer handler, not a private hit-test helper.
          // In WebKit PDF auto-scroll may advance between two browser calls;
          // sample current COVER geometry for every pointer probe.
          let hit=null;
          for(const fy of [.5,.28,.72,.12,.88]){
            for(const fx of [.5,.28,.72,.12,.88]){
              const box=await targetCover.boundingBox();assert(box);
              const point={clientX:box.x+box.width*fx,clientY:box.y+box.height*fy};
              await page.locator('body').dispatchEvent('pointermove',{...pointer,...point});
              if(await targetCover.evaluate(el=>el.classList.contains('ocr-pdf-block-drop-target'))){
                hit=point;break;
              }
            }
            if(hit)break;
          }
          assert(hit,scenario.name+' must find a real parent OCR cover landing');
          await page.waitForFunction(id=>document.querySelector(
            `.ocr-pdf-block-cover[data-block-id="${id}"]`)?.classList.contains('ocr-pdf-block-drop-target'),
            scenario.to,{timeout:5500});
          const guide=page.locator('.ocr-pdf-block-drop-guide');
          await guide.waitFor({state:'visible',timeout:5500});
          const targetSlot=guide.locator(`[data-placement="${scenario.landing}"]`);
          const slotRect=await targetSlot.boundingBox();assert(slotRect);
          await page.locator('body').dispatchEvent('pointermove',{...pointer,...center(slotRect)});
          assert.equal(await targetCover.getAttribute('data-drop-placement'),scenario.landing,
            'pointer must commit chosen before/after rail slot');
          await page.locator('body').dispatchEvent('pointerup',{...pointer,...center(slotRect)});
          const plan=planCMDInsertPBSParentAt(source,scenario.from,scenario.to,scenario.landing);
          const expectedNewId=plan.newId;assert.equal(plan.renamed[scenario.from],expectedNewId);
          const originalCover=page.locator(`.ocr-pdf-block-cover[data-origin-id="${scenario.from}"]`);
          try{
            await page.waitForFunction(([origin,id])=>document.querySelector(
              `.ocr-pdf-block-cover[data-origin-id="${origin}"]`)?.dataset.blockId===id,
              [scenario.from,expectedNewId],{timeout:35000});
          }catch(error){
            console.error('EDGE_DROP_DIAGNOSTIC',name,scenario.name,JSON.stringify(
              await page.evaluate(({id,expected})=>({
                globalStatus:document.querySelector('#status')?.textContent,
                pdfStatus:document.querySelector('.ocr-pdf-status')?.textContent,
                original:document.querySelector(
                  `.ocr-pdf-block-cover[data-origin-id="${id}"]`)?.dataset.blockId,
                expected,arrow:!!document.querySelector('.ocr-pdf-block-drag-arrow'),
                guide:document.querySelector('.ocr-pdf-block-drop-guide')?.outerHTML?.slice(0,300)
              }),{id:scenario.from,expected:expectedNewId})));
            throw error;
          }
          const updated=await page.evaluate(()=>window.__v6cm6.cm.readSource());
          assert.notEqual(updated,source,'real parent drop must update one CM6 document');
          assert.equal(toMineruJSON(updated),originalJSON,'original OCR JSON must remain byte exact');
          assert.equal(readFileSync(documentPath,'utf8'),source,'drag must not autosave fixture');
          await page.locator('#undo').click();
          await page.waitForFunction(([origin,id])=>document.querySelector(
            `.ocr-pdf-block-cover[data-origin-id="${origin}"]`)?.dataset.blockId===id,
            [scenario.from,scenario.from],{timeout:45000});
          assert.equal(await page.evaluate(()=>window.__v6cm6.cm.readSource()),source,
            'one undo restores the sealed CMD document');
          assert.deepEqual(errors,[]);
          console.log('PDF_BLOCK_EDGE_SCROLL_PASS',name,scenario.name,
            {target:scenario.to,newId:expectedNewId,landing:scenario.landing,
              scroll:true,realCoverageHit:true,undo:true,noAutosave:true});
        }finally{await page.close();}
      }
    }finally{await browser.close();}
  }
}finally{server.kill('SIGTERM');}
