/** UIC SETTINGS-AG-01: Shared Settings AG remains dark/Sarasa inside the
 * OCR2MD settings instance after Workspace's GLOBAL AG structural stylesheet
 * loads, and after switching away/back. Intercepts only settings adapter JS;
 * no real Vault key, book, or write API is accessed. */
import {webkit,chromium} from '../../../../web-component-platform/node_modules/playwright/index.mjs';
import {readFile} from 'node:fs/promises';
import {resolve,join,extname} from 'node:path';
import assert from 'node:assert/strict';
const base=process.env.SETTINGS_TEST_BASE??'http://127.0.0.1:4176/v4-wp3-candidate/';
const source=await readFile('ui-spikes/v4-directory/plugins/settings/settings.js','utf8');
const publishedWcp=resolve('../web-component-platform/published/components/v1');
const wcpManifest=JSON.parse(await readFile(join(publishedWcp,'manifest.json'),'utf8'));
const allowedWcpFiles=new Set(['loader.js','manifest.json',`releases/${wcpManifest.stable}/wcp-workbench.js`]);
const engines=[['webkit',webkit],['chromium',chromium]];
for(const [name,driver] of engines){
 const browser=await driver.launch(name==='chromium'?{channel:'chrome',headless:true}:{headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1024,height:900},hasTouch:true});
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  // WCP production-published assets, read byte-for-byte from the project's
  // immutable local release store. Eliminate sporadic external 403 from this
  // CSS-specific test without mocking or changing WCP implementation.
  await page.route('https://wcp.laity.bid/components/v1/**',async route=>{
    const name=new URL(route.request().url()).pathname.slice('/components/v1/'.length);
    if(!allowedWcpFiles.has(name))throw Error('SETTINGS_THEME_UNEXPECTED_WCP_ASSET '+name);
    const bytes=await readFile(join(publishedWcp,name));
    return route.fulfill({status:200,headers:{'access-control-allow-origin':'*'},
      contentType:name.endsWith('.json')?'application/json':'text/javascript',body:bytes});
  });
  let intercepted=0;
  await page.route('**/plugins/settings/settings.js*',route=>{
    intercepted++;
    return route.fulfill({status:200,contentType:'text/javascript',body:source});
  });
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:35000});
  try{
  await page.waitForFunction(()=>window.__ocr2mdV4?.phase==='ready',null,{timeout:60000});
  }catch(error){console.log('SETTINGS_THEME_BOOT_DIAGNOSTIC',name,JSON.stringify({intercepted,errors,state:await page.evaluate(()=>({phase:window.__ocr2mdV4?.phase,boot:window.__v4Startup?.state(),status:document.querySelector('#status')?.innerText?.slice(0,300),body:document.body.innerText.slice(0,200)}))}));throw error}
  console.log('SETTINGS_AG_TEST_BOOT_READY',name);
  await page.locator('#tab-settings').click();
  await page.waitForFunction(()=>{
    const panel=document.querySelector('#settings-shared');
    return panel?.dataset.ready==='true'&&panel.dataset.wcpLayout==='tripane'&&
      panel.querySelector('.las-grid-col .ag-root-wrapper');
  },null,{timeout:85000});
  console.log('SETTINGS_AG_TEST_PANEL_READY',name);
  const inspect=async()=>page.evaluate(()=>{
    const panel=document.querySelector('#settings-shared');
    const root=panel.querySelector('.las-grid-col .ag-root-wrapper');
    const ag=panel.querySelector('.las-grid-col .ag-styled-root');
    const computed=element=>{const css=getComputedStyle(element);return {
      bg:css.backgroundColor,fg:css.color,font:css.fontFamily,
      bgToken:css.getPropertyValue('--ag-background-color').trim(),
      textToken:css.getPropertyValue('--ag-foreground-color').trim(),
      headToken:css.getPropertyValue('--ag-header-background-color').trim(),
      fontToken:css.getPropertyValue('--ag-font-family').trim()
    }};
    const style=panel.querySelector('[data-wcp-settings-layout="true"]');
    return {root:computed(root),ag:computed(ag),rows:panel.querySelectorAll('.ag-row').length,
      hasWorkspaceStructuralCss:[...document.querySelectorAll('link[rel=stylesheet]')].some(x=>x.href.includes('ag-grid-base.min.css')),
      themeCssPresent:!!style?.textContent.includes('SETTINGS_AG_SCOPED_DARK_THEME'),
      workingSource:panel.dataset.sourceReady==='true'&&!!panel.querySelector('.las-source-col'),
      selectorText:[...panel.querySelectorAll('[data-testid]')].map(x=>x.dataset.testid).slice(0,5)
    };
  });
  const verify=(data,stage)=>{
    const context=JSON.stringify({engine:name,stage,data,errors});
    assert.equal(data.root.bg,'rgb(29, 39, 50)',context);
    assert.equal(data.root.bgToken,'#1d2732',context);
    assert.equal(data.root.headToken,'#253343',context);
    assert.equal(data.root.textToken,'#dbe5f0',context);
    assert.match(data.ag.fontToken,/Sarasa/,context);
    assert.ok(data.rows>=5,context);
    assert.equal(data.hasWorkspaceStructuralCss,true,context);
    assert.ok(data.themeCssPresent,context);
    assert.ok(data.workingSource,context);
    assert.deepEqual(errors,[],context);
    console.log('SETTINGS_AG_THEME_ISOLATION_PASS',context);
  };
  verify(await inspect(),'initial');
  await page.locator('#tab-workspace').click();
  await page.locator('#tab-settings').click();
  await page.waitForFunction(()=>document.querySelector('#settings-shared')?.dataset.wcpLayout==='tripane',null,{timeout:25000});
  verify(await inspect(),'after module switches');
  assert.ok(intercepted>=1,'local settings source was not used');
  await page.close();
 }finally{await browser.close()}
}
