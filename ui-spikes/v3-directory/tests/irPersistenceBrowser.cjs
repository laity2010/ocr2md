/** WP7 isolated browser, real HTTP FS, two editors conflict, reload and readback.
 * No mutations to the real Obsidian book. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {chromium}=require('../../v2/node_modules/@playwright/test');
const {testPdf}=require('./fixturePdf.cjs');
const repo=path.resolve(__dirname,'../../..');const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ocr2md-ir7-browser-'));
const root=path.join(temp,'ocr2md'),staticRoot=path.join(temp,'site'),
  port=41000+parseInt(crypto.createHash('sha256').update(temp).digest('hex').slice(0,6),16)%16000;
const base=`http://127.0.0.1:${port}`;
const book=path.join(root,'ocr2md','IRFixture');fs.mkdirSync(path.join(book,'json'),{recursive:true});
const blocks=[{type:'title',level:1,bbox:[40,50,380,105],lines:[{spans:[{type:'text',content:'WP7 Fixture Book'}]}]},
 {type:'text',bbox:[40,120,490,180],lines:[{spans:[{type:'text',content:'Original persisted paragraph.'}]}]},
 {type:'text',bbox:[40,210,490,260],lines:[{spans:[{type:'text',content:'Second paragraph to verify snapshot range.'}]}]}];
const ocr={_version_name:'3.4.4',pdf_info:[{page_idx:0,page_size:[612,792],preproc_blocks:[],discarded_blocks:[],para_blocks:blocks}]};
fs.writeFileSync(path.join(book,'original.pdf'),testPdf());fs.writeFileSync(path.join(book,'json','MinerU_fixture.json'),JSON.stringify(ocr));
fs.mkdirSync(path.join(staticRoot,'v3-directory','dist'),{recursive:true});
for(const file of ['index.html','sw.js'])fs.copyFileSync(path.join(repo,'ui-spikes/v3-directory',file),path.join(staticRoot,'v3-directory',file));
for(const file of fs.readdirSync(path.join(repo,'ui-spikes/v3-directory/dist'))){
 const from=path.join(repo,'ui-spikes/v3-directory/dist',file);if(fs.statSync(from).isFile())fs.copyFileSync(from,path.join(staticRoot,'v3-directory/dist',file));
}
fs.copyFileSync(path.join(repo,'ui-spikes/v2/node_modules/pdfjs-dist/build/pdf.worker.min.mjs'),path.join(staticRoot,'v3-directory/dist/pdf.worker.min.mjs'));
const server=spawn('python3',[path.join(repo,'ui-spikes/v2/tests/v3MacVaultServeFixture.py'),
 '--root',root,'--static',staticRoot,'--port',String(port)],{stdio:'ignore'});
async function ready(){for(let i=0;i<120;i++){try{const r=await fetch(base+'/__v3/fs?op=status');if(r.status) return;}catch{}await new Promise(r=>setTimeout(r,150));}throw Error('fixture server failed to start');}
async function openBook(page,key){
 await page.goto(base+'/v3-directory/',{waitUntil:'domcontentloaded'});
 await page.getByTestId('tab-settings').click();await page.locator('#vault-key').fill(key);
 await page.getByTestId('connect-vault').click();await page.getByTestId('tab-workspace').click();
 const open=async target=>{
   await page.locator(`[data-open-path="${target}"]`).waitFor({timeout:30000});
   await page.evaluate(p=>{const b=document.querySelector(`[data-open-path="${p}"]`);for(let i=0;i<2;i++){
     b.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch'}));b.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:i+1}));
   }},target);
 };
 /* default home is already /ocr2md */await page.waitForFunction(()=>document.querySelector('#directory-path')?.textContent==='Obsidian/ocr2md/ocr2md');
 await open('/ocr2md/IRFixture');await page.waitForFunction(()=>document.querySelector('#directory-path')?.textContent==='Obsidian/ocr2md/ocr2md/IRFixture');
 await page.getByTestId('set-working-directory').click();await page.getByTestId('tab-workbench').waitFor({state:'visible',timeout:30000});
 await page.locator('#wb-module-menu > summary').click();
    await page.getByTestId('workbench-mode-ir').click();
 await page.waitForFunction(()=>/^(IR 已加载 [34] 块|已恢复保存的 DIRjson)/.test(document.querySelector('#ir-status')?.textContent??''),null,{timeout:80000});
}
async function edit(page,newText){
 await page.locator('#workbench-ir-grid .ag-row').nth(1).click();
 await page.locator('#wb-ir-details > summary').click();
 await page.getByTestId('ir-edit-text').fill(newText);
 await page.getByTestId('ir-edit-reason').fill('WP7 浏览器并发测试的人工修改说明');
 await page.getByTestId('ir-apply-text').click();
 await page.waitForFunction(()=>document.querySelector('#ir-dirty-indicator')?.textContent?.includes('未保存'));
}
(async()=>{
 let browser;try{
 await ready();const key=fs.readFileSync(path.join(temp,'private/access-key'),'utf8').trim();
 const before=crypto.createHash('sha256').update(fs.readFileSync(path.join(book,'json','MinerU_fixture.json'))).digest('hex');
 browser=await chromium.launch({channel:'chrome',headless:true});const ctx=await browser.newContext({viewport:{width:1584,height:930}});
 const p1=await ctx.newPage(),p2=await ctx.newPage();p1.on('dialog',d=>d.accept());p2.on('dialog',d=>d.accept());
 await openBook(p1,key);await openBook(p2,key);
 assert.equal(await p1.getByTestId('ir-save').isEnabled(),true,
   'initial DIRjson can be explicitly persisted before any edit');
 assert.equal(fs.existsSync(path.join(book,'.ocr2md','ir-current.v1.json')),false,
   'initialization must not write the original book');
 await edit(p1,'Persisted editor A');await edit(p2,'Conflicting editor B');
 // Save a manually transcribed title (there was no OCR block for it) in the
 // same immutable WP7 snapshot, then verify its PDF-only provenance survives.
 await p1.getByTestId('workbench-mode-chapters').click();
 const gutter=p1.locator('#workbench-ir-source .cm-lineNumbers .cm-gutterElement')
   .filter({hasText:/^\s*2\s*$/}).first();
 await gutter.click();
 await p1.getByTestId('ir-line-add-title').click();
 await p1.getByTestId('ir-line-title-text').fill('Manually Restored Chapter From PDF');
 await p1.getByTestId('ir-line-title-page').fill('1');
 await p1.getByTestId('ir-line-title-confirm').check();
 await p1.getByTestId('ir-line-title-commit').click();
 await p1.waitForFunction(()=>document.querySelector('#ir-status')?.textContent?.includes('新标题已补入'),null,{timeout:15000});
 assert.ok((await p1.locator('#workbench-ir-grid').innerText()).includes('Manually Restored Chapter From PDF'));
 // Persist a joined output file, preserving the actual # title and its root depth.
 const child=p1.locator('#workbench-ir-grid .ag-row')
   .filter({hasText:'Manually Restored Chapter From PDF'}).first();
 const childIndependent=child.getByTestId('ir-v2-standalone');
 assert.equal(await childIndependent.isChecked(),true);
 const uncutSource=await p1.getByTestId('workbench-ir-source').innerText();
 await childIndependent.uncheck();
 assert.equal(await childIndependent.isChecked(),false);
 assert.equal(await p1.getByTestId('workbench-ir-source').innerText(),uncutSource);
 assert.ok((await child.locator('.v3-heading-cell').innerText()).startsWith('# '));
 const transcribedTitle=p1.locator('#workbench-ir-source .cm-line')
   .filter({hasText:'# Manually Restored Chapter From PDF'}).first();
 await transcribedTitle.click();await p1.keyboard.press('End');
 await p1.keyboard.insertText('\n\nPDF transcript pasted into restored chapter.');
 await p1.waitForFunction(()=>document.querySelector('#ir-status')?.textContent?.includes('源码修正已同步'),null,{timeout:20000});
 assert.ok((await p1.getByTestId('workbench-ir-source').innerText()).includes('PDF transcript pasted into restored chapter.'));
 assert.equal(await p1.getByTestId('ir-save').isEnabled(),true);
 // UIC-V3-SAVE-CARET-001: Save must not remove the native iOS insertion caret.
 // The editor is focused on the just-pasted paragraph immediately before Save.
 const caretState=()=>p1.locator('#workbench-ir-source').evaluate(root=>{
   const input=root.querySelector('.cm-content');
   const s=document.getSelection();
   const el=s?.anchorNode instanceof Element?s.anchorNode:s?.anchorNode?.parentElement;
   return {focused:document.activeElement===input,
     editable:input?.getAttribute('contenteditable'),
     line:el?.closest('.cm-line')?.textContent??'',
     offset:s?.anchorOffset??-1,
     scrollTop:root.querySelector('.cm-scroller')?.scrollTop??0};
 });
 const beforeSaveCaret=await caretState();
 assert.equal(beforeSaveCaret.focused,true,'source editor focused before save');
 assert.ok(beforeSaveCaret.line.includes('PDF transcript pasted into restored chapter.'));
 await p1.getByTestId('ir-save').click();
 await p1.waitForFunction(()=>document.querySelector('#ir-status')?.textContent?.includes('已保存到 Obsidian'),null,{timeout:70000});
 const afterSaveCaret=await caretState();
 assert.equal(afterSaveCaret.focused,true,'native caret must remain visible after save/readback');
 assert.equal(afterSaveCaret.editable,'true','saving must not strand contenteditable=false');
 assert.equal(afterSaveCaret.line,beforeSaveCaret.line,'cursor stays on the same paragraph');
 assert.equal(afterSaveCaret.offset,beforeSaveCaret.offset,'cursor stays at original character offset');
 assert.ok(Math.abs(afterSaveCaret.scrollTop-beforeSaveCaret.scrollTop)<=4,'source viewport stays in place');
 assert.equal(await p1.getByTestId('ir-save').isDisabled(),true,'verified save clears dirty');
 assert.equal(await p1.getByTestId('ir-undo').isEnabled(),true,'saving preserves the undo trail');
 await p1.getByTestId('ir-undo').click();
 assert.equal(await p1.getByTestId('ir-save').isEnabled(),true,'undo away from saved snapshot is dirty');
 assert.equal(await p1.getByTestId('ir-redo').isEnabled(),true);
 await p1.getByTestId('ir-redo').click();
 assert.equal(await p1.getByTestId('ir-save').isDisabled(),true,'redo to saved snapshot is clean');
 assert.equal(await p1.getByTestId('ir-redo').isDisabled(),true);
 // UIC regression: same browser tab exits by the real Switch Directory button,
 // then opens the same folder again. This must restore DIRjson, never regenerate OCR.
 await p1.getByTestId('tab-workspace').click();
 assert.equal(await p1.getByTestId('tab-workspace').getAttribute('aria-selected'),'true');
 await p1.getByTestId('set-working-directory').click();
 await p1.getByTestId('tab-workbench').waitFor({state:'visible',timeout:30000});
 await p1.waitForFunction(()=>document.querySelector('#ir-status')?.textContent?.includes('已恢复保存的 DIRjson'),null,{timeout:80000});
 assert.ok((await p1.getByTestId('workbench-ir-grid').innerText()).includes('Manually Restored Chapter From PDF'),
   'same-tab Switch Directory must reload the saved manually restored heading');
 assert.equal(await p1.getByTestId('ir-save').isDisabled(),true);
 const pointer=path.join(book,'.ocr2md','ir-current.v1.json');
 const saved=JSON.parse(fs.readFileSync(pointer,'utf8'));
 assert.equal(saved.kind,'ocr2md/ir-pointer');
 assert.equal(fs.readdirSync(path.join(book,'.ocr2md','ir-versions')).length,1);
 const current=await (await fetch(base+'/__v3/ir?book=/ocr2md/IRFixture',{headers:{'X-OCR2MD-V3-Key':key}})).json();
 assert.equal(current.sourcesCurrent,true);assert.equal(current.generation,saved.archiveSha256);
 assert.ok(JSON.parse(Buffer.from(current.irBase64,'base64')).blocks.some(b=>b.text==='Persisted editor A'),
   'existing OCR source text remains after inserting a manual title');
 const persisted=JSON.parse(Buffer.from(current.irBase64,'base64'));
 assert.equal(persisted.manualHeadings.length,1);
 assert.equal(persisted.chapterFileLayout?.find(c=>c.blockId===persisted.manualHeadings[0].blockId)?.standalone,false);
 assert.equal(persisted.chapters.find(c=>c.anchorBlockId===persisted.manualHeadings[0].blockId)?.depth,1,
   'merged output file cannot change title/chapter depth');
 assert.equal(persisted.manualTexts?.length,1);
 assert.equal(persisted.manualTexts[0].pdfPageNumber,1);
 assert.equal(persisted.blocks.find(b=>b.blockId===persisted.manualTexts[0].blockId).text,
   'PDF transcript pasted into restored chapter.');
 assert.equal(persisted.manualHeadings[0].method,'manual-pdf-page');
 const manual=persisted.blocks.find(b=>b.blockId===persisted.manualHeadings[0].blockId);
 assert.equal(manual.text,'Manually Restored Chapter From PDF');
 assert.deepEqual(manual.sources,[]);
 assert.equal(persisted.sourceElements.length,3);
 const generatedDir=path.join(book,'ir-generated','versions',saved.archiveSha256);
 const allGenerated=fs.readdirSync(generatedDir).filter(name=>name.endsWith('.md'))
   .map(name=>fs.readFileSync(path.join(generatedDir,name),'utf8')).join('\n');
 assert.ok(allGenerated.includes('# Manually Restored Chapter From PDF'));
 assert.ok(allGenerated.includes('PDF transcript pasted into restored chapter.'));

 await p2.getByTestId('ir-save').click();
 await p2.waitForFunction(()=>document.querySelector('#ir-status')?.textContent?.includes('发生冲突'),null,{timeout:70000});
 assert.ok((await p2.locator('#workbench-ir-grid').innerText()).includes('Conflicting editor B'),
  'conflicting draft must remain in browser');
 assert.equal(JSON.parse(fs.readFileSync(pointer,'utf8')).archiveSha256,saved.archiveSha256,
  'stale editor must not replace pointer');
 // Fresh session must restore saved IR rather than replay original OCR defaults.
 const p3=await ctx.newPage();
 // Saved snapshot must restore EVEN WHEN the nested OCR directory cannot be
 // listed (for example a temporarily unavailable iCloud directory listing).
 let blockedOcrLists=0;
 await p3.route('**/__v3/fs?*',async route=>{
   const req=new URL(route.request().url());
   if(req.searchParams.get('op')==='list' && req.searchParams.get('path')==='/ocr2md/IRFixture/json'){
     blockedOcrLists++;
     await route.fulfill({status:503,contentType:'application/json',
       body:JSON.stringify({code:'EOFFLINE',error:'OCR listing temporarily unavailable'})});
   }else await route.continue();
 });
 const p3Reads=[];
 p3.on('request',r=>{
   if(r.url().includes('/__v3/fs?')){
     const u=new URL(r.url());
     if(u.searchParams.get('op')==='read'&&u.searchParams.get('path')?.includes('/json/'))
       p3Reads.push(r.url());
   }
 });
 await openBook(p3,key);
 assert.equal(blockedOcrLists,0,'saved-first restore must not enumerate nested OCR files at all');
 assert.equal(p3Reads.length,0,'saved DIRjson reopen must not re-read original OCR JSON through generic FS (PDF Viewer reads PDF as needed)');
 assert.ok((await p3.getByTestId('ir-status').textContent()).includes('已恢复保存的 DIRjson'));
 assert.ok((await p3.locator('#workbench-ir-grid').innerText()).includes('Persisted editor A'));
 await p3.getByTestId('workbench-mode-chapters').click();
 assert.ok((await p3.locator('#workbench-ir-grid').innerText()).includes('Manually Restored Chapter From PDF'));
 await p3.locator('#wb-module-menu > summary').click();
 await p3.getByTestId('workbench-mode-ir').click();
 assert.equal(await p3.getByTestId('ir-save').isDisabled(),true);
 await p3.setViewportSize({width:1200,height:880});
 await p3.locator('#workbench-ir-grid .ag-row').nth(1).click();
 await p3.locator('#wb-ir-details > summary').click({timeout:8000});
 assert.equal(await p3.getByTestId('ir-edit-text').isVisible(),true,
   '1200px width toolbar must not be obscured by adjacent source pane');

 const after=crypto.createHash('sha256').update(fs.readFileSync(path.join(book,'json','MinerU_fixture.json'))).digest('hex');
 assert.equal(after,before);assert.equal(fs.existsSync(path.join(book,'ir-generated','versions',saved.archiveSha256)),true);
 const savedMdNames=fs.readdirSync(path.join(book,'ir-generated','versions',saved.archiveSha256))
   .filter(n=>n.endsWith('.md')&&n!=='README.md');
 assert.deepEqual(savedMdNames,['01 WP7 Fixture Book.md'],
   'named file boundary saves a cleaning-ready MD without claiming OCR title approval');
 const manifest=JSON.parse(fs.readFileSync(path.join(book,'ir-generated','versions',saved.archiveSha256,
   'document-ir.markdown-manifest.v1.json'),'utf8'));
 assert.equal(manifest.projectionState,'chapter-files-for-cleaning');
 assert.ok(persisted.chapterStructure.candidates.some(c=>c.status!=='confirmed'),
   'OCR review state must remain explicitly pending');
 assert.equal(fs.readdirSync(path.join(book,'.ocr2md','ir-versions')).length,1);
 // UIC: removal of a saved manual title is itself persistable and survives
 // reopening. User-transcribed body is preserved with its PDF page number.
 await p3.getByTestId('workbench-mode-chapters').click();
 const titleLine=p3.locator('#workbench-ir-source .cm-line')
   .filter({hasText:'# Manually Restored Chapter From PDF'}).first();
 const number=await titleLine.evaluate(node=>
   [...node.closest('.cm-content').querySelectorAll('.cm-line')].indexOf(node)+1);
 const headingGutter=p3.locator('#workbench-ir-source .cm-lineNumbers .cm-gutterElement')
   .filter({hasText:new RegExp('^\\s*'+number+'\\s*$')}).first();
 await headingGutter.click();
 assert.equal(await p3.getByTestId('ir-line-delete-title').isVisible(),true);
 p3.on('dialog',dialog=>dialog.accept());
 await p3.getByTestId('ir-line-delete-title').click();
 await p3.waitForFunction(()=>!document.querySelector('#workbench-ir-grid')?.innerText?.includes('Manually Restored Chapter From PDF'),null,{timeout:15000});
 assert.ok((await p3.getByTestId('workbench-ir-source').innerText()).includes('PDF transcript pasted into restored chapter.'));
 await p3.getByTestId('ir-save').click();
 await p3.waitForFunction(()=>document.querySelector('#ir-status')?.textContent?.includes('已保存到 Obsidian'),null,{timeout:70000});
 const removedPointer=JSON.parse(fs.readFileSync(pointer,'utf8'));
 assert.notEqual(removedPointer.archiveSha256,saved.archiveSha256);
 const removedSnapshot=await (await fetch(base+'/__v3/ir?book=/ocr2md/IRFixture',
   {headers:{'X-OCR2MD-V3-Key':key}})).json();
 const removed=JSON.parse(Buffer.from(removedSnapshot.irBase64,'base64'));
 assert.equal(removed.manualHeadings?.length,0);
 assert.ok(!removed.chapterFileLayout?.some(c=>c.blockId===persisted.manualHeadings[0].blockId),
   'deleting a manual title must discard its obsolete output-file cut');
 assert.equal(removed.manualTexts?.length,1);
 assert.equal(removed.manualTexts[0].pdfPageNumber,1);
 assert.ok(removed.blocks.some(b=>b.text==='PDF transcript pasted into restored chapter.'));
 await p3.getByTestId('tab-workspace').click();
 await p3.getByTestId('set-working-directory').click();
 await p3.waitForFunction(()=>document.querySelector('#ir-status')?.textContent?.includes('已恢复保存的 DIRjson'),null,{timeout:80000});
 assert.ok(!(await p3.getByTestId('workbench-ir-source').innerText()).includes('Manually Restored Chapter From PDF'));
 assert.ok((await p3.getByTestId('workbench-ir-source').innerText()).includes('PDF transcript pasted into restored chapter.'));
 assert.equal(fs.readdirSync(path.join(book,'.ocr2md','ir-versions')).length,2);
 console.log('IR_WP7_BROWSER_PERSISTENCE_PASS',JSON.stringify({persisted:true,readBack:true,
  restoredSession:true,noOcrReinitialization:true,staleEditorRejected:true,conflictingDraftRetained:true,
  originalOcrUnchanged:true,hiddenOnly:true,oneSnapshot:true,unsplitDraftOnly:true,manualTitleRoundtrip:true,manualTitleDeletionPersisted:true}));
 await ctx.close();
 }finally{if(browser)await browser.close();server.kill('SIGTERM');fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error('IR_WP7_BROWSER_PERSISTENCE_FAIL',e);process.exitCode=1;});
