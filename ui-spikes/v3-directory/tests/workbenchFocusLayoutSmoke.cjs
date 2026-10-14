/** V3 Focus layout: real Buffett vault, browser read-only DOM & viewport geometry. */
const assert=require('node:assert/strict');
const {chromium}=require('../../v2/node_modules/@playwright/test');
const path=require('node:path');const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1584,height:930},deviceScaleFactor:1});
 const page=await context.newPage();const errors=[],mutations=[];
 page.on('pageerror',e=>errors.push(String(e)));
 page.on('request',r=>{if(r.url().includes('/__v3/fs')&&r.method()!=='GET')mutations.push(r.method());});
 try{
  await page.goto('http://127.0.0.1:4176/v3-directory/',{waitUntil:'domcontentloaded',timeout:30000});
  const open=async p=>{
    await page.locator(`[data-open-path="${p}"]`).waitFor({timeout:30000});
    await page.evaluate(path=>{const node=document.querySelector(`[data-open-path="${path}"]`);
      for(let i=0;i<2;i++){
        node.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch'}));
        node.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:i+1}));
      }
    },p);
  };
  /* default home is already /ocr2md */
  await page.waitForFunction(()=>document.querySelector('#directory-path')?.textContent==='Obsidian/ocr2md/ocr2md',null,{timeout:30000});
  await open('/ocr2md/Bufett’s Alpha');
  await page.waitForFunction(()=>document.querySelector('#directory-path')?.textContent?.endsWith('Bufett’s Alpha'),null,{timeout:30000});
  await page.getByTestId('set-working-directory').click();
  await page.waitForFunction(()=>document.querySelector('#pdf-element-locator-status')?.textContent?.includes('已校验映射 224 项'),null,{timeout:90000});
  await page.locator('#wb-module-menu > summary').click();
    await page.getByTestId('workbench-mode-review').click();
  await page.waitForFunction(()=>document.querySelector('#pdf-md-review-status')?.textContent?.includes('224 项'),null,{timeout:30000});
  await page.locator('#workbench-pdf-canvas .pdfViewer canvas').first().waitFor({state:'visible',timeout:30000});
  const md='/ocr2md/Bufett’s Alpha/chapters/00 Bufett’s Alpha/00 Bufett’s Alpha.working.md';
  await page.getByTestId('workbench-file').selectOption(md);
  await page.waitForFunction(()=>document.querySelector('#workbench-source .cm-content')?.textContent?.trim().length>60,
    null,{timeout:30000});
  const inspect=async(label)=>{
    const m=await page.evaluate(()=>{
      const box=id=>{let e=document.querySelector(id);let r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
      const area=['#workbench-layout','#workbench-calibration-grid','#workbench-review-grid','#workbench-source','#workbench-pdf-canvas','#wb-pdf-tools','#workbench-bookbar'].map(id=>{
        const e=document.querySelector(id);return [id,e?box(id):null];});
      return {measurements:Object.fromEntries(area),vw:innerWidth,vh:innerHeight,
        overflow:document.documentElement.scrollWidth-innerWidth,
        panelHidden:document.querySelector('#workbench-review-panel').hidden,
        gridVisible:!document.querySelector('#workbench-review-panel').hidden,
        sourceFileVisible:getComputedStyle(document.querySelector('#workbench-file')).display!=='none',
        pdfNavVisible:!document.querySelector('#wb-pdf-tools').hidden,
        extrasCollapsed:['#wb-review-details','#wb-md-details','#wb-pdf-details'].map(id=>!document.querySelector(id).open)};
    });
    assert.ok(m.measurements['#workbench-layout'].height>=560,'workbench should use the actual viewport');
    assert.ok(m.measurements['#workbench-review-grid'].height>=195,'AG review table must have enough vertical space');
    assert.ok(m.measurements['#workbench-source'].height>=120,'source pane not crushed');
    assert.ok(m.measurements['#workbench-pdf-canvas'].height>=180,'PDF canvas not crushed');
    assert.ok(m.overflow<=2,'unexpected horizontal overflow '+m.overflow);
    assert.ok(m.pdfNavVisible&&m.sourceFileVisible&&m.gridVisible);
    assert.deepEqual(m.extrasCollapsed,[true,true,true]);
    console.log('FOCUS_LAYOUT_VIEWPORT',label,JSON.stringify(m));
    return m;
  };
  const desktop=await inspect('desktop');
  assert.ok(desktop.measurements['#workbench-pdf-canvas'].height>=310,'desktop PDF needs real space');
  assert.ok(desktop.measurements['#workbench-review-grid'].height>=470,'desktop AG needs real space');
  const out=path.resolve(__dirname,'../../../.tmp/wp7/workbench-focus-desktop.png');
  fs.mkdirSync(path.dirname(out),{recursive:true});
  await page.screenshot({path:out});
  // Test the workbench's on-demand controls, without consuming permanent height.
  await page.locator('#wb-review-details summary').click();
  await page.getByTestId('pdf-md-review-note').waitFor({state:'visible'});
  await page.locator('#wb-review-details summary').click();
  await page.locator('#wb-md-details summary').click();
  await page.getByTestId('md-element-select').waitFor({state:'visible'});
  await page.locator('#wb-md-details summary').click();
  await page.locator('#wb-pdf-details summary').click();
  await page.getByTestId('workbench-pdf-file').waitFor({state:'visible'});
  await page.locator('#wb-pdf-details summary').click();
  await page.setViewportSize({width:834,height:1194});await page.waitForTimeout(420);
  const tablet=await inspect('tablet-portrait');
  assert.ok(tablet.measurements['#workbench-review-grid'].height>=220);
  const ip=path.resolve(__dirname,'../../../.tmp/wp7/workbench-focus-ipad.png');await page.screenshot({path:ip});
  assert.deepEqual(errors,[]);assert.deepEqual(mutations,[]);
  console.log('V3_WORKBENCH_FOCUS_LAYOUT_PASS screenshots='+out+','+ip);
 }finally{await context.close();await browser.close();}
})().catch(e=>{console.error('V3_WORKBENCH_FOCUS_LAYOUT_FAIL',e);process.exitCode=1;});
