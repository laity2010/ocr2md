/** Lab LaTeX AG review control lifecycle, source changes are UNSAVED and
 * undone before leaving; no business HTTP writes. */
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
const base=process.env.OCR_LAB_TEST_URL||'http://127.0.0.1:4408/labs/cm-html/';
for(const [name,engine,options] of [
  ['Chrome',chromium,{viewport:{width:1300,height:860}}],
  ['iPad WebKit',webkit,{viewport:{width:1040,height:780},isMobile:true,hasTouch:true,deviceScaleFactor:2}],
]){
 const browser=await engine.launch({headless:true});
 try{
  const page=await browser.newPage(options),errors=[],writes=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{
    if(!['GET','HEAD'].includes(r.method())&&new URL(r.url()).pathname.includes('/api/'))
      writes.push(r.method()+' '+new URL(r.url()).pathname);
  });
  await page.addInitScript(()=>{
    document.addEventListener('ocr2md:wp3-ag-ready',e=>{
      window.__latexTest={views:e.detail.views,read:e.detail.getMarkdown};
    });
  });
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:55000});
  await page.waitForFunction(()=>window.__latexTest?.views?.latex?.api,null,{timeout:26000});
  const original=await page.evaluate(()=>window.__latexTest.read());
  await page.locator('.ocr-lab-element-select').evaluate(el=>{
    el.value='latex';el.dispatchEvent(new Event('change',{bubbles:true}));
  });
  const s=page.locator('.ocr-latex-grid .ag-row[row-index="1"] .ocr-latex-review-select');
  await s.waitFor({state:'visible',timeout:18000});
  const data=await page.evaluate(()=>{
    const host=document.querySelector('.ocr-latex-grid');
    const dropdown=host.querySelector('.ag-row[row-index="1"] .ocr-latex-review-select');
    const sibling=host.querySelector('.ag-row[row-index="2"] .ocr-latex-review-select');
    // Capture every rendered cell below the changed row, not just its review
    // selector. AG may preserve <select> yet rebuild every KaTeX preview.
    const afterRows=[...host.querySelectorAll('.ag-row[row-index]')]
      .filter(node=>Number(node.getAttribute('row-index'))>1);
    const lowerCells=afterRows.flatMap(row=>[...row.querySelectorAll('.ag-cell')]
      .map(cell=>({index:row.getAttribute('row-index'),column:cell.getAttribute('col-id'),
        cell,child:cell.firstElementChild}))).filter(x=>x.child);
    window.__reviewBefore={lowerCells,dropdown,sibling,root:host.querySelector('.ag-center-cols-container'),
      scroller:host.querySelector('.ag-body-viewport'), scroll:host.querySelector('.ag-body-viewport')?.scrollTop};
    const api=window.__latexTest.views.latex.api;
    return {current:dropdown.value,other:sibling?.value,count:api.getDisplayedRowCount(),
      sourceLen:window.__latexTest.read().length};
  });
  const changedTo=process.env.OCR_LATEX_REVIEW_CHOICE||(data.current==='latex'?'忽略':'latex');
  await s.selectOption(changedTo);
  await page.waitForFunction(({before,choice})=>
    window.__latexTest.read().length!==before&&
    document.querySelector('.ocr-latex-grid .ag-row[row-index="1"] .ocr-latex-review-select')?.value===choice,
    {before:original.length,choice:changedTo},{timeout:13000});
  await page.waitForTimeout(750);
  const after=await page.evaluate(()=>{
    const host=document.querySelector('.ocr-latex-grid'),before=window.__reviewBefore;
    const current=host.querySelector('.ag-row[row-index="1"] .ocr-latex-review-select');
    const lower=before.lowerCells.map(x=>({index:x.index,column:x.column,
      sameCell:x.cell.isConnected,
      sameChild:x.child===host.querySelector(`.ag-row[row-index="${x.index}"] .ag-cell[col-id="${x.column}"]`)?.firstElementChild}));
    return {lowerCellsInspected:lower.length,lowerReplaced:lower.filter(x=>!x.sameChild).length,
      sameDropdown:before.dropdown===current,
      oldConnected:before.dropdown.isConnected,
      sameSibling:before.sibling===host.querySelector('.ag-row[row-index="2"] .ocr-latex-review-select'),
      sameContainer:before.root===host.querySelector('.ag-center-cols-container'),
      scrollBefore:before.scroll,scrollAfter:host.querySelector('.ag-body-viewport')?.scrollTop,
      value:current?.value,focused:document.activeElement===current,
      count:window.__latexTest.views.latex.api.getDisplayedRowCount()};
  });
  console.log('REVIEW_REFRESH_DIAG',name,JSON.stringify({data,after}));
  await page.locator('#undo').click();
  await page.waitForFunction(text=>window.__latexTest.read()===text,original,{timeout:17000});
  assert.deepEqual(errors,[]);
  assert.deepEqual(writes,[]);
  assert.equal(await page.evaluate(()=>window.__latexTest.read()),original);
  // User-visible acceptance: no redraw of the active control or its sibling.
  assert(after.sameDropdown,'Review select remounted during value change');
  assert(after.sameSibling,'Other row review select remounted');
  assert(after.lowerCellsInspected>2,'Need visible lower-row cells to check churn');
  assert.equal(after.lowerReplaced,0,'Lower rows were unnecessarily re-rendered');
  assert(after.sameContainer,'AG whole grid was recreated');
  assert.equal(after.value,changedTo);
  console.log('LATEX_REVIEW_REFRESH_PASS',name);
 }finally{await browser.close();}
}
