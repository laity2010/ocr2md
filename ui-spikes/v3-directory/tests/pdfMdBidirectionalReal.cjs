/** WP6 real vault E2E: PDF↔ chapter working MD through Sidecar, read-only. */
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {chromium}=require('../../v2/node_modules/@playwright/test');
const caseRoot=process.argv[2]||'/Users/daisor/Library/Mobile Documents/iCloud~md~obsidian/Documents/ocr2md/ocr2md/Bufett’s Alpha';
const map=JSON.parse(readFileSync(caseRoot+'/.ocr2md/pdf-md-map.v1.json','utf8'));
const root='/ocr2md/Bufett’s Alpha';
const regionHasPoint=(r,p,x,y)=>r.pdfRegions.some(a=>a.pdfPageNumber===p&&a.normalizedBBox[0]<=x&&a.normalizedBBox[2]>=x&&a.normalizedBBox[1]<=y&&a.normalizedBBox[3]>=y);
const canNavigate=r=>r.parts.some(p=>p.workingAnchors.some(a=>a.state==='unique'&&a.rangesUtf16.length===1));
const first=map.relations.find(r=>r.pdfRegions[0].pdfPageNumber===1 && r.matchStatus==='candidate-complete' && canNavigate(r) &&
  ((x,y)=>map.relations.filter(a=>regionHasPoint(a,1,x,y)).length===1)(
    (r.pdfRegions[0].normalizedBBox[0]+r.pdfRegions[0].normalizedBBox[2])/2,
    (r.pdfRegions[0].normalizedBBox[1]+r.pdfRegions[0].normalizedBBox[3])/2));
assert.ok(first,'Expected an unambiguous page-one PDF target');
const firstWorking=first.parts.flatMap(p=>p.workingAnchors).find(a=>a.state==='unique'&&a.rangesUtf16.length===1);
assert.ok(firstWorking);
const expectedFile=firstWorking.path;
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1200,height:950}});
 const page=await context.newPage();const errors=[];const writes=[];
 page.on('pageerror',e=>errors.push(String(e)));
 page.on('request',req=>{if(req.url().includes('/__v3/fs')&&req.method()!=='GET')writes.push(req.method()+' '+req.url());});
 try{
  await page.goto('http://127.0.0.1:4176/v3-directory/',{waitUntil:'domcontentloaded',timeout:30000});
  const open=async path=>{
    await page.locator(`[data-open-path="${path}"]`).waitFor({timeout:30000});
    await page.evaluate(p=>{
      const button=document.querySelector(`[data-open-path="${p}"]`);
      for(let i=0;i<2;i++){
        button.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch'}));
        button.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:i+1}));
      }
    },path);
  };
  /* default home is already /ocr2md */
  await page.waitForFunction(()=>document.querySelector('#directory-path')?.textContent==='Obsidian/ocr2md/ocr2md',null,{timeout:30000});
  await open(root);
  await page.waitForFunction(p=>document.querySelector('#directory-path')?.textContent==='Obsidian/ocr2md'+p,root,{timeout:30000});
  await page.getByTestId('set-working-directory').click();
  await page.waitForFunction(()=>document.querySelector('#workbench-pdf-status')?.textContent?.includes('22 页'),null,{timeout:60000});
  await page.waitForFunction(()=>document.querySelector('#pdf-element-locator-status')?.textContent?.includes('已校验映射 224 项'),null,{timeout:90000});
  await page.getByTestId('workbench-file').locator(`option[value="${expectedFile}"]`).waitFor({state:'attached'});
  assert.ok((await page.getByTestId('workbench-file').locator('option').count())>=14,'nested mapping sources listed');
  // PDF click itself (not just a toolbar) chooses a unique block and navigates.
  const b=first.pdfRegions[0].normalizedBBox;
  const cx=(b[0]+b[2])/2,cy=(b[1]+b[3])/2;
  await page.locator('.pdfViewer .page[data-page-number="1"] canvas').waitFor({state:'visible',timeout:30000});
  await page.locator('.pdfViewer .page[data-page-number="1"] canvas').evaluate((canvas,p)=>{
    const r=canvas.getBoundingClientRect();
    canvas.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:r.left+r.width*p.x,clientY:r.top+r.height*p.y}));
  },{x:cx,y:cy});
  await page.waitForFunction(({path,id})=>document.querySelector('#workbench-file')?.value===path&&
    document.querySelector('#workbench-source')?.dataset.pdfMdElementId===id,
    {path:expectedFile,id:first.elementId},{timeout:30000});
  assert.equal(await page.getByTestId('workbench-source').getAttribute('data-pdf-md-anchor-path'),expectedFile);
  const coords=await page.getByTestId('workbench-source').evaluate(node=>[Number(node.dataset.pdfMdFrom),Number(node.dataset.pdfMdTo)]);
  assert.deepEqual(coords,firstWorking.rangesUtf16[0]);
  assert.equal(await page.locator('.ocr2md-pdf-region-overlay').getAttribute('data-element-id'),first.elementId,
    'PDF click must retain the visual source marker when Markdown opens');
  assert.equal(await page.getByTestId('workbench-file').inputValue(),expectedFile);
  assert.equal(await page.getByTestId('workbench-status').textContent().then(t=>t.includes('只读')),true);
  // CodeMirror mouse/caret selection routes through the same UTF-16 anchor,
  // independently of toolbar button choice.
  await page.getByTestId('workbench-source').dispatchEvent('mouseup');
  await page.waitForFunction(()=>document.querySelector('#md-pdf-status')?.textContent?.includes('MD → PDF'),null,{timeout:30000});
  assert.equal(await page.locator('.ocr2md-pdf-region-overlay').getAttribute('data-element-id'),first.elementId);
  await page.locator('#wb-pdf-details summary').click();
  await page.getByTestId('pdf-element-clear').click();
  assert.equal(await page.locator('.ocr2md-pdf-region-overlay').count(),0,
    'clearing visual source marker must not change the MD file');
  // Source -> PDF: the element dropdown now points to the same element.
  await page.locator('#wb-md-details summary').click();
  await page.getByTestId('md-element-select').selectOption(first.elementId);
  await page.getByTestId('md-jump-pdf').click();
  await page.waitForFunction(id=>document.querySelector('.ocr2md-pdf-region-overlay')?.dataset.elementId===id,
    first.elementId,{timeout:30000});
  await page.waitForFunction(()=>document.querySelector('#md-pdf-status')?.textContent?.includes('MD → PDF'),null,{timeout:30000});
  // PDF -> MD from the toolbar, explicit anchor path + UTF-16 selection.
  // The PDF tools menu remains open from the explicit clear action above.
  await page.getByTestId('pdf-jump-md').click();
  await page.waitForFunction(id=>document.querySelector('#workbench-source')?.dataset.pdfMdElementId===id,
    first.elementId,{timeout:30000});
  assert.equal(await page.locator('.ocr2md-pdf-region-overlay').count(),1,'PDF marker remains visible during MD navigation');
  assert.deepEqual(writes,[],'WP6 navigation must never issue POST to WorkspaceFS');
  assert.deepEqual(errors,[]);
  console.log('WP6_REAL_PDF_MD_BIDIRECTIONAL_BROWSER_PASS',JSON.stringify({
    elementId:first.elementId,page:1,mdPath:expectedFile,utf16Range:coords,
    mappedOptions:await page.getByTestId('workbench-file').locator('option').count(),
    pdfClickToWorkingMd:true,mdCursorToPdf:true,mdSelectorToPdf:true,pdfToolbarToMd:true,zeroVaultWrites:true}));
 }finally{await context.close();await browser.close();}
})().catch(e=>{console.error('WP6_REAL_PDF_MD_BIDIRECTIONAL_BROWSER_FAIL',e);process.exitCode=1});
