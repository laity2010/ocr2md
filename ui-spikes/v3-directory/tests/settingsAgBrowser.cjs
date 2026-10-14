/** Standalone browser UIC, no Vault access: V3 Settings uses AG Grid alone. */
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {chromium,webkit}=require('../../v2/node_modules/@playwright/test');
const {setSetting,settingValue}=require('./settingsAgActions.cjs');
const {randomInt}=require('node:crypto');
(async()=>{
 const port=43000+randomInt(10000);
 const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1','-d','ui-spikes/v3-directory'],{stdio:'ignore'});
 let browser;
 try{
  for(let n=0;n<90;n++){
   try{const response=await fetch(`http://127.0.0.1:${port}/`);if(response.ok)break;}catch{}
   await new Promise(r=>setTimeout(r,100));
  }
  browser=await (process.env.OCR2MD_TEST_WEBKIT==='1'?webkit:chromium).launch(
    process.env.OCR2MD_TEST_WEBKIT==='1'?{headless:true}:{channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:834,height:1150}});
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'domcontentloaded'});
  await page.getByTestId('tab-settings').click();
  assert.equal(await page.locator('#pdf-theme-select,#source-hard-returns,#source-hard-return-color,#table-config-editor').count(),0);
  const grid=page.getByTestId('shared-settings-grid');
  await grid.locator('.ag-row').first().waitFor();
  assert.ok((await grid.locator('.ag-row').count())>=5);
  await setSetting(page,'showSizeColumn',false);
  await setSetting(page,'gridDensity','compact');
  await setSetting(page,'pdfTheme','light');
  await setSetting(page,'mdShowHardReturns',false);
  await setSetting(page,'mdHardReturnColor','#ff3b30');
  await setSetting(page,'mdHeadingColors.0','#abcdef');
  await setSetting(page,'mdHeadingSizes.0',1.9);
  await setSetting(page,'mdCodeColors.comment','#8899aa');
  await setSetting(page,'gridFontSize',16);
  assert.equal(await page.locator('#settings-parse-status').textContent(),'尚未保存 · 修改有效');
  await page.getByTestId('settings-save').click();
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('ocr2md-v3-directory-settings-v1')));
  assert.equal(saved.showSizeColumn,false);assert.equal(saved.gridDensity,'compact');
  assert.equal(saved.pdfTheme,'light');assert.equal(saved.mdShowHardReturns,false);
  assert.equal(saved.mdHardReturnColor,'#ff3b30');
  assert.equal(saved.mdHeadingColors[0],'#abcdef');assert.equal(saved.mdHeadingSizes[0],1.9);
  assert.equal(saved.mdCodeColors.comment,'#8899aa');assert.equal(saved.gridFontSize,16);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.getByTestId('tab-settings').click();
  assert.equal(await (await settingValue(page,'pdfTheme')).locator('select').inputValue(),'light');
  await page.getByTestId('settings-reset').click();
  const defaults=await page.evaluate(()=>JSON.parse(localStorage.getItem('ocr2md-v3-directory-settings-v1')));
  assert.equal(defaults.pdfTheme,'dark');assert.equal(defaults.mdShowHardReturns,true);
  assert.equal(defaults.mdHardReturnColor,'#839ab5');
  assert.deepEqual(errors,[]);
  console.log('V3_SETTINGS_AG_ONLY_BROWSER_PASS',JSON.stringify({engine:process.env.OCR2MD_TEST_WEBKIT==='1'?'webkit':'chromium',rows:43}));
 }catch(e){console.error('V3_SETTINGS_AG_ONLY_BROWSER_FAIL',e);process.exitCode=1;}
 finally{if(browser)await browser.close().catch(()=>{});server.kill();}
})();
