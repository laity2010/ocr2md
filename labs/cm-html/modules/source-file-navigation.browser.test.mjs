/** Experimental source selectors must navigate only real open CM files. */
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
const base=process.env.OCR_LAB_TEST_URL||'https://192.168.1.10:4443/labs/cm-html/';
for(const [name,browserType,options] of [['Chrome',chromium,{viewport:{width:1300,height:820}}],['iPad WebKit',webkit,{viewport:{width:1024,height:768},hasTouch:true,isMobile:true,deviceScaleFactor:2}]]){
 const browser=await browserType.launch({headless:true});
 try{
  const page=await browser.newPage({ignoreHTTPSErrors:base.startsWith('https:'),...options});
  const pageErrors=[],unscoped=[];
  page.on('pageerror',err=>pageErrors.push(err.message));
  page.on('request',request=>{const path=new URL(request.url()).pathname;if(path.startsWith('/api/')||path.startsWith('/media/'))unscoped.push(path);});
  await page.goto(base,{waitUntil:'domcontentloaded'});
  const markdown=page.locator('.ocr-source-pane .ocr-lab-file-select');
  await markdown.waitFor({timeout:22000});
  assert.equal(await markdown.inputValue(),'document');
  assert.deepEqual(await markdown.locator('option').allTextContents(),['章节定界/Buffett’s Alpha.minerujson.md','全局设置/settings.json']);
  await page.locator('#module-select').selectOption('media');
  assert.equal(await markdown.locator('option[value="document"]').textContent(),'媒体/Buffett’s Alpha.minerujson.md');
  await markdown.selectOption('settings');
  assert.equal(await page.locator('#module-select').inputValue(),'settings');
  const settings=page.locator('#settings-workspace .ocr-lab-file-select');
  await settings.waitFor({timeout:18000});
  assert.equal(await settings.inputValue(),'settings');
  assert.deepEqual(await settings.locator('option').allTextContents(),
    ['媒体/Buffett’s Alpha.minerujson.md','全局设置/settings.json']);
  assert.equal(await page.locator('#settings-workspace .cm-editor').count(),1);
  assert.equal(await page.locator('#editor .cm-editor').count(),1);
  await settings.selectOption('document');
  assert.equal(await page.locator('#module-select').inputValue(),'media', 'Must restore previous Markdown module');
  assert.equal(await markdown.inputValue(),'document');
  // Editing the mother file and then navigating must preserve the actual CM
  // value and undo history. Only do a transient change, never hit Save.
  await page.locator('#module-select').selectOption('latex');
  assert.equal(await markdown.locator('option[value="document"]').textContent(),'LaTeX/Buffett’s Alpha.minerujson.md');
  await page.locator('#module-select').selectOption('chapter-boundary');
  assert.equal(await markdown.locator('option[value="document"]').textContent(),'章节定界/Buffett’s Alpha.minerujson.md');
  const edit=page.locator('#editor .cm-content');
  await edit.click();await page.keyboard.insertText('CM_NAV_DRAFT_ONLY');
  const valueBefore=await edit.innerText();
  assert(valueBefore.includes('CM_NAV_DRAFT_ONLY'));
  await markdown.selectOption('settings');
  await settings.selectOption('document');
  assert.equal(await page.locator('#module-select').inputValue(),'chapter-boundary');
  assert((await edit.innerText()).includes('CM_NAV_DRAFT_ONLY'),'Navigating lost unsaved editor data');
  assert.equal(await page.locator('#editor .cm-editor').count(),1);
  assert.deepEqual(pageErrors,[]);
  assert.deepEqual(unscoped,[]);
  console.log('SOURCE_FILE_NAV_PASS',name,JSON.stringify({files:2,unsavedPreserved:true,currentFilenames:true,unscopedRequests:unscoped.length}));
 }finally{await browser.close();}
}
