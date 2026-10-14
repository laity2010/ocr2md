/** WP7: isolated temporary Mac Vault browser validation. NEVER writes to user Vault. */
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
const {spawn}=require('node:child_process');const {createHash}=require('node:crypto');
const {chromium}=require('../../v2/node_modules/@playwright/test');
const {testPdf}=require('./fixturePdf.cjs');
const repo=path.resolve(__dirname,'../../..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ocr2md-wp7-'));
const vault=path.join(temp,'ocr2md'),book=path.join(vault,'ocr2md','Trial'),staticRoot=path.join(temp,'static');
const url='http://127.0.0.1:4397/v3-directory/';const hash=x=>createHash('sha256').update(x).digest('hex');
const logical='/ocr2md/Trial';const sha='f'.repeat(64);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 fs.mkdirSync(path.join(staticRoot,'v3-directory','dist'),{recursive:true});
 for(const item of ['index.html','sw.js'])fs.copyFileSync(path.join(repo,'ui-spikes/v3-directory',item),path.join(staticRoot,'v3-directory',item));
 for(const item of fs.readdirSync(path.join(repo,'ui-spikes/v3-directory/dist')))fs.copyFileSync(path.join(repo,'ui-spikes/v3-directory/dist',item),path.join(staticRoot,'v3-directory/dist',item));
 fs.copyFileSync(path.join(repo,'ui-spikes/v2/node_modules/pdfjs-dist/build/pdf.worker.min.mjs'),path.join(staticRoot,'v3-directory','dist','pdf.worker.min.mjs'));
 fs.mkdirSync(path.join(book,'.ocr2md'),{recursive:true});fs.mkdirSync(path.join(book,'md'));
 fs.mkdirSync(path.join(book,'json'));
 const pdf=testPdf({paddingBytes:5000});const md=Buffer.from('# Intro\nhello from OCR\nMore text\n','utf8');const json=Buffer.from('{"mineru":"fixture"}');
 for(const [name,bytes] of [['book.pdf',pdf],['md/original.md',md],['json/source.json',json]])fs.writeFileSync(path.join(book,name),bytes);
 const part=(idx)=>({partIndex:0,partKind:'paragraph',originalState:'unique',originalMdRangesUtf16:[[idx*10,idx*10+7]],originalMdFragmentEvidenceUtf16:[],chapterAnchors:[],workingAnchors:[]});
 const rel=(idx)=>({elementId:`mineru:${hash(json)}:p0:para_blocks:${idx}`,type:'text',pdfRegions:[{pageIndex:0,pdfPageNumber:1,
    pageSize:[612,792],bbox:[60,100+idx*70,400,135+idx*70],normalizedBBox:[60/612,(100+idx*70)/792,400/612,(135+idx*70)/792]}],
    originalMdState:'unique',matchStatus:'candidate-complete',chapters:[],parts:[part(idx)],manuallyVerified:false});
 const map={kind:'ocr2md/pdf-md-map',schemaVersion:1,workspaceId:'obsidian-ocr2md',pdf:{path:logical+'/book.pdf',sha256:hash(pdf)},
  ocr:{path:logical+'/json/source.json',sha256:hash(json)},originalMd:{path:logical+'/md/original.md',sha256:hash(md)},
  chapterVersions:[],ocrSourceSha256:hash(json),ignoredDiscardedCount:0,relations:[rel(0),rel(1)],
  summary:{'candidate-complete':2,'candidate-partial':0,ambiguous:0,unmatched:0,unavailable:0}};
 const sidecar=path.join(book,'.ocr2md','pdf-md-map.v1.json');fs.writeFileSync(sidecar,JSON.stringify(map,null,2)+'\n');
 const mapHash=hash(fs.readFileSync(sidecar));
 const target=path.join(book,'.ocr2md','pdf-md-review.v1.json');
 const server=spawn('python3',[path.join(repo,'ui-spikes/v2/tests/v3MacVaultServeFixture.py'),
    '--root',vault,'--static',staticRoot,'--port','4397'],{stdio:'ignore'});
 let browser;
 try{
   for(let i=0;i<80;i++){try{if((await fetch('http://127.0.0.1:4397/__v3/fs?op=status')).ok)break;}catch{}await wait(100)}
   const key=fs.readFileSync(path.join(temp,'private/access-key'),'utf8').trim();
   browser=await chromium.launch({channel:'chrome',headless:true});
   const context=await browser.newContext({viewport:{width:1200,height:940}});
   const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(url,{waitUntil:'domcontentloaded'});
   await page.getByTestId('tab-settings').click();
   await page.locator('#vault-key').fill(key);await page.getByTestId('connect-vault').click();
   await page.getByTestId('tab-workspace').click();
   const open=async p=>{
     await page.locator(`[data-open-path="${p}"]`).waitFor();
     await page.evaluate(path=>{const b=document.querySelector(`[data-open-path="${path}"]`);
       for(let i=0;i<2;i++){b.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch'}));
         b.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:i+1}));}},p);
   };
   /* default home is already /ocr2md */await page.waitForFunction(()=>document.querySelector('#directory-path')?.textContent==='Obsidian/ocr2md/ocr2md');
   await open(logical);await page.waitForFunction(()=>document.querySelector('#directory-path')?.textContent==='Obsidian/ocr2md/ocr2md/Trial');
   await page.getByTestId('set-working-directory').click();
   await page.waitForFunction(()=>document.querySelector('#pdf-element-locator-status')?.textContent?.includes('已校验映射 2 项'),null,{timeout:60000});
   await page.locator('#wb-module-menu > summary').click();
    await page.getByTestId('workbench-mode-review').click();
   await page.getByTestId('workbench-review-grid').locator('.ag-row').first().waitFor();
   await page.waitForFunction(()=>document.querySelector('#pdf-md-review-status')?.textContent?.includes('已审核 0 / 2 项'),null,{timeout:30000});
   await page.locator('#workbench-review-grid .ag-header-cell[col-id="audit"] .ag-header-cell-filter-button').click();
   const auditFilter=page.locator('.config-enum-filter:visible');
   assert.equal(await auditFilter.locator('input[aria-label="All"]').isChecked(),true);
   await auditFilter.locator('input[aria-label="All"]').uncheck();
   assert.equal(await page.getByTestId('workbench-review-grid').getByRole('row').count(),1,
     'only header remains when no values are chosen');
   await auditFilter.locator('input[aria-label="未审核"]').check();
   assert.equal(await page.getByTestId('workbench-review-grid').getByRole('row').count(),3);
   await auditFilter.locator('input[aria-label="All"]').check();
   await page.keyboard.press('Escape');
   const option=page.locator(`[data-element-id="${rel(0).elementId}"]`).first();
   await option.selectOption('OCR错误');
   await page.waitForFunction(()=>document.querySelector('#pdf-md-review-status')?.textContent?.includes('有未保存改动'));
   assert.equal(fs.existsSync(target),false,'draft must not persist before clicking Save');
   await page.getByTestId('pdf-md-review-save').click();
   await page.waitForFunction(()=>document.querySelector('#pdf-md-review-status')?.textContent?.includes('已安全保存'),null,{timeout:40000});
   assert.equal(fs.existsSync(target),true,'Save creates review only');
   const loaded=JSON.parse(fs.readFileSync(target,'utf8'));
   assert.equal(loaded.mappingSha256,mapHash);assert.equal(loaded.decisions.length,1);
   assert.equal(loaded.decisions[0].status,'OCR错误');
   assert.equal(hash(fs.readFileSync(sidecar)),mapHash,'mapping source immutable');
   // Selecting a review row opens both PDF evidence and the original MD.
   await page.getByTestId('workbench-review-grid').getByRole('row').nth(1).click();
   await page.waitForFunction(v=>document.querySelector('#workbench-file')?.value===v,
     logical+'/md/original.md',{timeout:35000});
   await page.getByTestId('workbench-source').locator('.cm-line').first().click({clickCount:3});
   await page.locator('#wb-review-details summary').click();
   await page.getByTestId('pdf-md-review-capture').click();
   await page.waitForFunction(()=>[...document.querySelectorAll('.pdf-md-review-cell-status')].some(s=>s.value==='已校正'),null,{timeout:12000});
   await page.getByTestId('pdf-md-review-note').fill('人工关联校正，来源已逐字检查');
   await page.getByTestId('pdf-md-review-note').dispatchEvent('change');
   await page.getByTestId('pdf-md-review-save').click();
   await page.waitForFunction(()=>document.querySelector('#pdf-md-review-status')?.textContent?.includes('已安全保存'),null,{timeout:50000});
   const correction=JSON.parse(fs.readFileSync(target,'utf8')).decisions[0];
   assert.equal(correction.status,'已校正');
   assert.equal(correction.correctedAnchor.path,logical+'/md/original.md');
   assert.equal(correction.correctedAnchor.sha256,hash(md));
   assert.ok(correction.correctedAnchor.to>correction.correctedAnchor.from);
   assert.ok(correction.note.includes('人工关联校正'));
   // Simulate another device replacing review after this page loaded it.
   const external={...loaded,decisions:[]};fs.writeFileSync(target,JSON.stringify(external));
   await option.selectOption('缺失');
   await page.getByTestId('pdf-md-review-save').click();
   await page.waitForFunction(()=>document.querySelector('#pdf-md-review-status')?.textContent?.includes('保存被拒绝'),null,{timeout:40000});
   assert.equal(JSON.parse(fs.readFileSync(target,'utf8')).decisions.length,0,'CAS blocks stale overwrite');
   assert.equal(hash(fs.readFileSync(sidecar)),mapHash);
   assert.deepEqual(errors,[]);
   console.log('WP7_REVIEW_BROWSER_FIXTURE_PASS statusFilterAll=1 stagedOnly=1 created=1 correctedAnchor=1 updated=1 readback=1 staleCASBlocked=1 originalMapUnchanged=1');
   await context.close();
 }finally{
   if(browser)await browser.close();server.kill('SIGTERM');
   fs.rmSync(temp,{recursive:true,force:true});
 }
})().catch(e=>{console.error('WP7_REVIEW_BROWSER_FIXTURE_FAIL',e);process.exitCode=1;});
