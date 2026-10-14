/** IR-WP5: real Buffett book, no edits, authenticated Vault read-only browser proof. */
const assert=require('node:assert/strict');
const {chromium}=require('../../v2/node_modules/@playwright/test');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root='/Users/daisor/Library/Mobile Documents/iCloud~md~obsidian/Documents/ocr2md/ocr2md/Bufett’s Alpha';
const sources=['Buffett s Alpha.pdf','json/MinerU_Buffett s Alpha__20261008112941.json','.ocr2md/pdf-md-map.v1.json'];
const digest=x=>crypto.createHash('sha256').update(x).digest('hex');
const before=sources.map(relative=>({relative,sha:digest(fs.readFileSync(path.join(root,relative))),
  mtime:fs.statSync(path.join(root,relative)).mtimeMs}));
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1584,height:930}});
 const page=await context.newPage();const errors=[],mutations=[];
 page.on('pageerror',e=>errors.push(String(e)));
 page.on('request',r=>{if(r.url().includes('/__v3/fs')&&r.method()!=='GET')mutations.push(r.method());});
 try{
  await page.goto('http://127.0.0.1:4176/v3-directory/',{waitUntil:'domcontentloaded',timeout:30000});
  const open=async loc=>{
   await page.locator(`[data-open-path="${loc}"]`).waitFor({timeout:30000});
   await page.evaluate(p=>{const btn=document.querySelector(`[data-open-path="${p}"]`);
     for(let i=0;i<2;i++){
       btn.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch'}));
       btn.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:i+1}));
     }
   },loc);
  };
  /* default home is already /ocr2md */
  await page.waitForFunction(()=>document.querySelector('#directory-path')?.textContent==='Obsidian/ocr2md/ocr2md');
  await open('/ocr2md/Bufett’s Alpha');
  await page.waitForFunction(()=>document.querySelector('#directory-path')?.textContent==='Obsidian/ocr2md/ocr2md/Bufett’s Alpha');
  await page.getByTestId('set-working-directory').click();
  await page.getByTestId('tab-workbench').waitFor({state:'visible',timeout:30000});
  assert.equal(await page.getByTestId('workbench-mode-chapters').getAttribute('aria-pressed'),'true');
  await page.waitForFunction(()=>document.querySelector('#ir-status')?.textContent?.includes('IR 已加载 224 块'),null,{timeout:180000});
  assert.ok((await page.locator('#workbench-ir-grid').innerText()).includes('OCR 原文标题'));
  assert.equal(await page.getByTestId('ir-md-file').locator('option').count(),1,
    'even real OCR with many proposed chapters opens a continuous whole-book source');
  assert.equal(await page.getByTestId('ir-md-file').inputValue(),'dir:whole-book-draft');
  assert.equal(await page.getByTestId('ir-export-md').isHidden(),true);
  assert.equal(await page.getByTestId('ir-export-zip').isHidden(),true);
  await page.locator('#wb-module-menu > summary').click();
  await page.getByTestId('workbench-mode-ir').click();
  await page.waitForFunction(()=>document.querySelector('#ir-status')?.textContent?.includes('IR 已加载 224 块'),null,{timeout:180000});
  assert.equal(await page.locator('#workbench-ir-grid .ag-root').count(),1);
  assert.equal(await page.locator('#workbench-ir-grid .ag-row').count()>0,true);
  assert.equal(await page.getByTestId('ir-chapter-filter').locator('option').count(),20);
  await page.locator('#workbench-ir-grid .ag-row').first().click();
  await page.waitForFunction(()=>!!document.querySelector('#workbench-ir-source')?.dataset.irBlockId,null,{timeout:20000});
  const firstPage=await page.getByTestId('workbench-ir-source').getAttribute('data-ir-pages');
  assert.ok(firstPage?.includes('1'));
  const sourceText=await page.locator('#workbench-ir-source').innerText();
  assert.ok(sourceText.includes('<!-- ocr2md-ir:block='));
  assert.ok((await page.getByTestId('ir-md-file').locator('option').count())===6);
  assert.ok((await page.getByTestId('ir-source-evidence').textContent()).includes('mineru:'));
  await page.waitForFunction(()=>document.querySelector('.ocr2md-pdf-region-overlay')?.dataset.pdfPage==='1',null,{timeout:25000});
  // Chapter filter works on actual generated tree: select Appendix A leaf
  const sel=page.getByTestId('ir-chapter-filter');
  const opts=await sel.locator('option').allTextContents();
  const index=opts.findIndex(x=>x.includes('Appendix A: Data Sources and Methodology'));
  assert.ok(index>=0);
  await sel.selectOption({index});
  await page.waitForFunction(()=>document.querySelector('#workbench-ir-grid')?.innerText?.includes('Stock Return Data'),null,{timeout:10000});
  const filtered=await page.locator('#workbench-ir-grid .ag-row').count();
  assert.ok(filtered>0&&filtered<224,'chapter filter should shrink actual rows');
  await sel.selectOption({index:0});
  assert.equal(await page.getByTestId('ir-export').isEnabled(),true);
  assert.equal(await page.getByTestId('ir-export-zip').isEnabled(),true);
  assert.equal(await page.getByTestId('ir-export-md').isEnabled(),true);
  assert.equal(await page.getByTestId('workbench-file').isHidden(),true);
  await page.setViewportSize({width:834,height:1194});
  assert.ok((await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))<=0,'iPad overflow');
  assert.equal(await page.getByTestId('workbench-ir-panel').isVisible(),true);
  assert.deepEqual(errors,[]);assert.deepEqual(mutations,[]);
  assert.equal(fs.existsSync(path.join(root,'.ocr2md/document-ir.v1.json')),false);
  const after=sources.map(relative=>({relative,sha:digest(fs.readFileSync(path.join(root,relative))),
    mtime:fs.statSync(path.join(root,relative)).mtimeMs}));
  assert.deepEqual(after,before);
  console.log('IR_WP5_REAL_BROWSER_PASS',JSON.stringify({blocks:224,chapters:19,columns:6,
    PDFLocator:true,sourceProvenance:true,chapterFilterRows:filtered,
    iPadLayout:true,readOnlyVault:true,mdOfficialNotRequired:true,sourceHashUnchanged:true}));
 }finally{await context.close();await browser.close();}
})().catch(error=>{console.error('IR_WP5_REAL_BROWSER_FAIL',error);process.exitCode=1;});
