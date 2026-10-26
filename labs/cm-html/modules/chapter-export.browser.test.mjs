// Legacy business contract test: dispatch a native selection on the hidden
// source select. Real Tom Select touch/menu interaction has its own E2E test.
const chooseNative=async(locator,value)=>locator.evaluate((el,v)=>{
  el.value=v;
  el.dispatchEvent(new Event('input',{bubbles:true}));
  el.dispatchEvent(new Event('change',{bubbles:true}));
},value);

/** End to end: export CMD chapters, list, read-only browse, preserve mother CM. */
import assert from 'node:assert/strict';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {chromium,webkit} from 'playwright';
const base=process.env.OCR_LAB_TEST_URL;
const directory=process.env.OCR_LAB_TEST_DATA;
if(!base||!directory)throw Error('Needs isolated OCR_LAB_TEST_URL and OCR_LAB_TEST_DATA');
for(const [name,engine,options] of [
  ['Chrome',chromium,{viewport:{width:1280,height:820}}],
  ['iPad WebKit',webkit,{viewport:{width:1024,height:768},isMobile:true,hasTouch:true,deviceScaleFactor:2}]
]){
  const browser=await engine.launch({headless:true});
  try{
    const page=await browser.newPage({...options});
    const jsErrors=[];page.on('pageerror',e=>jsErrors.push(e.message));
    await page.goto(base,{waitUntil:'domcontentloaded'});
    await chooseNative(page.locator('#module-select'),'chapter-boundary');
    await page.locator('.ocr-lab-ag-toolbar #export-chapters').waitFor({timeout:20000});
    const initial=await page.locator('#editor .cm-content').innerText();
    await page.locator('#export-chapters').click();
    await page.locator('#unlock-dialog').waitFor();
    await page.locator('#unlock-code').fill(readFileSync(join(directory,'test-unlock'),'utf8').trim().slice(0,12));
    await page.locator('#unlock-form button[type=submit]').click();
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('已导出'),null,{timeout:55000});
    await page.waitForFunction(()=>document.querySelectorAll('.ocr-source-pane .ocr-lab-file-select option[value^="chapter:"]').length>0,null,{timeout:10000});
    const manifest=await (await page.request.get(base+'api/chapters')).json();
    assert(manifest.files.length>0);
    assert(manifest.files.every(file=>/^\d{1,6}-[\w\p{L}\p{N}-]+\.cmd\.chapter\.md$/u.test(file.name)));
    const folder=join(directory,'chapter');
    assert(existsSync(join(folder,'manifest.json')),'Export did not land in chapter/');
    assert(readdirSync(folder).filter(name=>name.endsWith('.cmd.chapter.md')).length===manifest.files.length);
    const chapter=manifest.files[0].name;
    const menu=page.locator('.ocr-source-pane .ocr-lab-file-select');
    assert.equal(await menu.locator(`option[value="chapter:${chapter}"]`).textContent(),'章节chapter/'+chapter);
    const savedMother=readFileSync(join(directory,'document.md'),'utf8');
    const sibling=manifest.files[1]?.name;
    const savedSibling=sibling?readFileSync(join(folder,sibling),'utf8'):null;
    await chooseNative(menu,'chapter:'+chapter);
    await page.waitForURL(url=>url.searchParams.get('chapter')===chapter,{timeout:20000});
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('大纲'),null,{timeout:25000});
    assert.equal(await page.locator('#module-select').inputValue(),'chapter-boundary');
    assert.equal(await page.locator('#editor .cm-editor').count(),1,'Chapter must use original workbench CM6');
    assert.equal(await page.locator('.ocr-lab-chapter-reader').count(),0,'Old read-only shadow editor still active');
    assert((await page.locator('.ocr-outline-pane .ocr-outline-grid .ag-root-wrapper').count())>=1,'Native chapter AG was not mounted');
    assert.equal(await page.locator('.ocr-preview-pane').count()>0,true,'Native MD/PDF preview missing');
    assert.equal(await page.locator('.ocr-lab-ag-toolbar #export-chapters').count(),1);
    assert.equal(await page.locator('.ocr-source-pane .ocr-lab-file-select').inputValue(),'chapter:'+chapter);
    const nativeEditor=page.locator('#editor .cm-content');
    assert.equal(await nativeEditor.getAttribute('contenteditable'),'true');
    await nativeEditor.click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.insertText('\n\nCMD_CHAPTER_NATIVE_SAVE_TEST_'+name.replace(/\W/g,'_')+'\n');
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('未保存'));
    const editedSource=await nativeEditor.innerText();
    assert(editedSource.includes('CMD_CHAPTER_NATIVE_SAVE_TEST'));
    // The original undo/redo controls must remain functional in the chapter.
    await page.locator('#undo').click();
    assert(!(await nativeEditor.innerText()).includes('CMD_CHAPTER_NATIVE_SAVE_TEST'));
    await page.locator('#redo').click();
    assert((await nativeEditor.innerText()).includes('CMD_CHAPTER_NATIVE_SAVE_TEST'));
    await page.locator('#save').click();
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('已保存'),null,{timeout:10000});
    const storedChapter=readFileSync(join(folder,chapter),'utf8');
    assert(storedChapter.includes('CMD_CHAPTER_NATIVE_SAVE_TEST'));
    assert.equal(readFileSync(join(directory,'document.md'),'utf8'),savedMother,'Mother was overwritten by chapter save');
    if(sibling)assert.equal(readFileSync(join(folder,sibling),'utf8'),savedSibling,'Sibling chapter changed');
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('大纲'),null,{timeout:25000});
    // CM6 virtualizes offscreen source lines; verify full reloaded document via
    // the same explicitly selected document endpoint, not visible DOM text.
    const persisted=await page.request.get(base+'api/document?chapter='+encodeURIComponent(chapter));
    assert.equal(persisted.status(),200);
    assert((await persisted.text()).includes('CMD_CHAPTER_NATIVE_SAVE_TEST'));
    await chooseNative(page.locator('.ocr-source-pane .ocr-lab-file-select'),'document');
    await page.waitForURL(url=>!url.searchParams.has('chapter'),{timeout:20000});
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('大纲'),null,{timeout:25000});
    assert.equal(await page.locator('.ocr-source-pane .ocr-lab-file-select').inputValue(),'document');
    assert.equal(readFileSync(join(directory,'document.md'),'utf8'),savedMother);
    console.log('NATIVE_CHAPTER_EDIT_SAVE_PASS',name,JSON.stringify({chapter,independentSave:true,undoRedo:true,agPreview:true}));
    assert.deepEqual(jsErrors,[]);
    console.log('CMD_CHAPTER_EXPORT_PASS',name,JSON.stringify({files:manifest.files.length,folder:'chapter/',extension:'.cmd.chapter.md',sameWorkbench:true}));
  }finally{await browser.close();}
}
