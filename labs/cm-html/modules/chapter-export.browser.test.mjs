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
    await page.locator('#module-select').selectOption('chapter-boundary');
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
    await menu.selectOption('chapter:'+chapter);
    await page.locator('.ocr-lab-chapter-reader .cm-editor').waitFor({timeout:16000});
    assert.equal(await page.locator('.ocr-lab-chapter-reader .cm-content').getAttribute('contenteditable'),'false');
    const chapterText=await page.locator('.ocr-lab-chapter-reader .cm-content').innerText();
    assert(chapterText.length>30);
    assert.equal(await page.locator('#editor').isVisible(),false);
    await menu.selectOption('document');
    assert.equal(await page.locator('#editor').isVisible(),true);
    assert.equal(await page.locator('#editor .cm-content').innerText(),initial);
    assert.deepEqual(jsErrors,[]);
    console.log('CMD_CHAPTER_EXPORT_PASS',name,JSON.stringify({files:manifest.files.length,folder:'chapter/',extension:'.cmd.chapter.md',readonly:true}));
  }finally{await browser.close();}
}
