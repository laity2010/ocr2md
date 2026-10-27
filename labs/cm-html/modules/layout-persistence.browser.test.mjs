// Legacy business contract test: dispatch a native selection on the hidden
// source select. Real Tom Select touch/menu interaction has its own E2E test.
const chooseNative=async(locator,value)=>locator.evaluate((el,v)=>{
  el.value=v;
  el.dispatchEvent(new Event('input',{bubbles:true}));
  el.dispatchEvent(new Event('change',{bubbles:true}));
},value);

/** Dockview dividers stay fixed when switching virtual chapter views. */
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
const base=process.env.OCR_LAB_TEST_URL||'https://192.168.1.10:4443/labs/cm-html/';
const storageKey='ocr2md:lab:cm-html:workspace-divider:v1';
for(const [name,engine,context] of [
  ['Chrome',chromium,{viewport:{width:1300,height:830}}],
  ['iPad WebKit',webkit,{viewport:{width:1024,height:768},isMobile:true,hasTouch:true,deviceScaleFactor:2}],
]){
 const browser=await engine.launch({headless:true});
 try{
  const page=await browser.newPage({ignoreHTTPSErrors:base.startsWith('https:'),...context});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base,{waitUntil:'domcontentloaded'});
  const selector=page.locator('.ocr-source-pane .ocr-lab-file-select');
  await selector.waitFor({state:'attached',timeout:30000});
  await page.waitForFunction(()=>document.querySelectorAll('.ocr-source-pane .ocr-lab-file-select option[value^="virtual:"]').length>0,null,{timeout:17000});
  const chapter=await selector.locator('option[value^="virtual:"]').first().getAttribute('value');
  const sizes=()=>page.evaluate(()=>{
    const outline=document.querySelector('.ocr-outline-pane').getBoundingClientRect();
    const source=document.querySelector('.ocr-source-pane').getBoundingClientRect();
    const preview=document.querySelector('.ocr-preview-pane').getBoundingClientRect();
    return {ag: outline.width/(outline.width+source.width),source:source.height/(source.height+preview.height),
      sashes:[...document.querySelectorAll('.dv-sash.dv-enabled')].map(e=>{const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,width:r.width,height:r.height};})};
  });
  await page.waitForTimeout(500);
  const initial=await sizes();
  const sash=initial.sashes.filter(r=>r.width<r.height).sort((a,b)=>b.height-a.height)[0];
  const hsash=initial.sashes.filter(r=>r.height<r.width).sort((a,b)=>b.width-a.width)[0];
  assert(sash&&hsash,`Missing Dockview drag handles: ${JSON.stringify(initial.sashes)}`);
  async function drag(handle,toX,toY){
    await page.mouse.move(handle.x,handle.y);
    await page.mouse.down();
    await page.mouse.move(toX,toY,{steps:16});
    await page.mouse.up();
    await page.waitForTimeout(450);
  }
  await drag({...sash,y:sash.y-sash.height*0.28},sash.x-115,sash.y-sash.height*0.28);
  await drag(hsash,hsash.x,hsash.y+85);
  const changed=await sizes();
  assert(Math.abs(changed.ag-initial.ag)>0.06,`AG sash did not move: ${JSON.stringify({initial,changed})}`);
  assert(Math.abs(changed.source-initial.source)>0.06,`Preview sash did not move: ${JSON.stringify({initial,changed})}`);
  await page.waitForTimeout(350);
  const stored=await page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)||'null'),storageKey);
  assert(stored&&Math.abs(stored.agRatio-changed.ag)<0.035,'Saved AG proportion is stale');
  assert(Math.abs(stored.sourceRatio-changed.source)<0.035,'Saved source proportion is stale');
  await chooseNative(selector,chapter);
  await page.waitForURL(u=>u.searchParams.has('view'),{timeout:16000});
  await page.locator('.ocr-source-pane .ocr-lab-file-select').waitFor({state:'attached',timeout:24000});
  await page.waitForTimeout(800);
  const inChapter=await sizes();
  assert(Math.abs(inChapter.ag-changed.ag)<0.035,`AG divider reset in chapter: ${JSON.stringify({changed,inChapter})}`);
  assert(Math.abs(inChapter.source-changed.source)<0.035,`Source divider reset in chapter: ${JSON.stringify({changed,inChapter})}`);
  await chooseNative(page.locator('.ocr-source-pane .ocr-lab-file-select'),'document');
  await page.waitForURL(u=>!u.searchParams.has('view'),{timeout:16000});
  await page.locator('.ocr-source-pane .ocr-lab-file-select').waitFor({state:'attached',timeout:24000});
  await page.waitForTimeout(800);
  const back=await sizes();
  assert(Math.abs(back.ag-changed.ag)<0.035&&Math.abs(back.source-changed.source)<0.035,`Divider reset returning to mother: ${JSON.stringify({changed,back})}`);
  assert.deepEqual(errors,[]);
  console.log('LAB_DIVIDER_RETENTION_PASS',name,JSON.stringify({before:initial,modified:changed,chapter:inChapter,back}));
 }finally{await browser.close();}
}
