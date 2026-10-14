/** WP5 live read-only acceptance. No vault writes. Locates actual OCR bbox via
 * authenticated WorkspaceFS + official PDF.js viewer, including rotated pages. */
const assert=require('node:assert/strict');
const {readFileSync,mkdirSync}=require('node:fs');
const {chromium}=require('../../v2/node_modules/@playwright/test');
const caseRoot=process.argv[2]||'/Users/daisor/Library/Mobile Documents/iCloud~md~obsidian/Documents/ocr2md/ocr2md/Bufett’s Alpha';
const sidecar=JSON.parse(readFileSync(caseRoot+'/.ocr2md/pdf-md-map.v1.json','utf8'));
const firstPage=sidecar.relations[0].pdfRegions[0].pdfPageNumber;
const pages=[firstPage,4,8,11,22];
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1200,height:950}});
 const page=await context.newPage();
 const errors=[];const writeRequests=[];page.on('pageerror',e=>errors.push(String(e)));
 page.on('request',req=>{if(req.method()!=='GET'&&req.url().includes('/__v3/fs'))writeRequests.push(req.method()+' '+req.url());});
 try{
  await page.goto('http://127.0.0.1:4176/v3-directory/',{waitUntil:'domcontentloaded',timeout:30000});
  await page.getByTestId('directory-path').waitFor();
  const open=async path=>{
    await page.locator(`[data-open-path="${path}"]`).waitFor({timeout:30000});
    await page.evaluate(p=>{
      const button=document.querySelector(`[data-open-path="${p}"]`);
      if(!button)throw Error('path missing: '+p);
      for(let i=0;i<2;i++){
        button.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch'}));
        button.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:i+1}));
      }
    },path);
  };
  /* default home is already /ocr2md */
  await page.waitForFunction(()=>document.querySelector('#directory-path')?.textContent==='Obsidian/ocr2md/ocr2md',null,{timeout:30000});
  await open('/ocr2md/Bufett’s Alpha');
  await page.waitForFunction(()=>document.querySelector('#directory-path')?.textContent==='Obsidian/ocr2md/ocr2md/Bufett’s Alpha',null,{timeout:30000});
  await page.getByTestId('set-working-directory').click();
  await page.getByTestId('tab-workbench').waitFor({state:'visible',timeout:30000});
  await page.waitForFunction(()=>document.querySelector('#workbench-pdf-status')?.textContent?.includes('22 页'),null,{timeout:60000});
  await page.waitForFunction(()=>document.querySelector('#pdf-element-locator-status')?.textContent?.includes('已校验映射 224 项'),null,{timeout:90000});
  await page.locator('#wb-pdf-details summary').click();
  const observations=[];
  for(const targetPage of pages){
    await page.getByTestId('pdf-page-number').fill(String(targetPage));
    await page.getByTestId('pdf-page-number').dispatchEvent('change');
    await page.waitForFunction(p=>document.querySelector('#pdf-page-number')?.value===String(p),targetPage,{timeout:20000});
    const opts=await page.getByTestId('pdf-element-select').locator('option').count();
    assert.ok(opts>1,'Expected OCR elements on page '+targetPage);
    await page.getByTestId('pdf-element-select').selectOption({index:1});
    const id=await page.getByTestId('pdf-element-select').inputValue();
    const relation=sidecar.relations.find(x=>x.elementId===id);
    assert.ok(relation,'selected exact sidecar element exists');
    await page.getByTestId('pdf-element-focus').click();
    await page.waitForFunction(elementId=>document.querySelector('.ocr2md-pdf-region-overlay')?.dataset.elementId===elementId,id,{timeout:20000});
    const region=relation.pdfRegions.find(x=>x.pdfPageNumber===targetPage);
    const geom=await page.locator('.ocr2md-pdf-region-overlay').evaluate(overlay=>{
      const container=overlay.parentElement;
      const r=overlay.getBoundingClientRect(); const p=container.getBoundingClientRect();
      return {left:r.left-p.left,top:r.top-p.top,width:r.width,height:r.height,
        pageWidth:container.clientWidth,pageHeight:container.clientHeight,
        parentWidth:p.width,parentHeight:p.height,elementId:overlay.dataset.elementId,
        page:overlay.dataset.pdfPage};
    });
    assert.equal(geom.page,String(targetPage));
    for(const [coordinate,expected] of [
      [geom.left/geom.pageWidth,region.normalizedBBox[0]],
      [geom.top/geom.pageHeight,region.normalizedBBox[1]],
      [geom.width/geom.pageWidth,region.normalizedBBox[2]-region.normalizedBBox[0]],
      [geom.height/geom.pageHeight,region.normalizedBBox[3]-region.normalizedBBox[1]]]){
      assert.ok(Math.abs(coordinate-expected)<0.02,`page ${targetPage} overlay differs from OCR bbox: ${coordinate} vs ${expected}`);
    }
    const canvas=page.locator(`.pdfViewer .page[data-page-number="${targetPage}"] canvas`).first();
    await canvas.waitFor({state:"visible",timeout:30000});
    const alignment=await page.locator('.ocr2md-pdf-region-overlay').evaluate(overlay=>{
      const c=overlay.parentElement.querySelector('canvas').getBoundingClientRect();
      const o=overlay.getBoundingClientRect();
      return {left:(o.left-c.left)/c.width,top:(o.top-c.top)/c.height,
        width:o.width/c.width,height:o.height/c.height,canvasWidth:c.width,canvasHeight:c.height};
    });
    for(const [coordinate,expected] of [
      [alignment.left,region.normalizedBBox[0]],
      [alignment.top,region.normalizedBBox[1]],
      [alignment.width,region.normalizedBBox[2]-region.normalizedBBox[0]],
      [alignment.height,region.normalizedBBox[3]-region.normalizedBBox[1]]]){
      assert.ok(Math.abs(coordinate-expected)<0.02,`page ${targetPage} OCR bbox misaligned with real canvas: ${coordinate} vs ${expected}`);
    }
    const rendered=await page.locator(`.pdfViewer .page[data-page-number="${targetPage}"] canvas`).count();
    observations.push({page:targetPage,id:id.split(':').at(-1),region:region.normalizedBBox,
      overlay:geom,canvas:alignment,canvasCount:rendered});
  }
  // Changing the page or manually clearing removes the previous marker.
  await page.getByTestId('pdf-element-clear').click();
  assert.equal(await page.locator('.ocr2md-pdf-region-overlay').count(),0);
  await page.setViewportSize({width:834,height:1194});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
  assert.ok(overflow<=0,'iPad viewport horizontal overflow '+overflow);
  assert.deepEqual(writeRequests,[],"visual positioning must not mutate the Vault");
  assert.deepEqual(errors,[]);
  console.log('WP5_REAL_PDF_OVERLAY_BROWSER_PASS',JSON.stringify({pages:observations.map(x=>x.page),
    rotatedPages:[8,11],exactCoordinateCheck:true,sourceSidecar:224,
    zeroSourceWrites:true,iPadOverflow:overflow,observations}));
 }finally{await context.close();await browser.close();}
})().catch(error=>{console.error('WP5_REAL_PDF_OVERLAY_BROWSER_FAIL',error);process.exitCode=1;});
