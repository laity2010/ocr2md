/** Regression: resident Workspace must never recolor Settings' AG Grid.
 * Black-box live-browser test; never reads Vault content or edits settings.
 */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const require=createRequire(import.meta.url);
const {chromium,webkit}=require(resolve(import.meta.dirname,'../../../../../../web-component-platform/node_modules/playwright'));
const origin=process.env.OCR2MD_V5_PUBLIC_ORIGIN||'https://192.168.1.10:4443';
const color=async page=>page.evaluate(()=>{
 const panel=document.querySelector('laity-settings-panel');
 const root=panel?.querySelector('.ag-root-wrapper');
 if(!root)return null;
 const style=getComputedStyle(root);
 return {color:style.color,background:style.backgroundColor,rows:panel.getComponentRows().length,
  version:panel.version,source:panel.sourceText};
});
const rgb=component=>{
 const m=component?.match(/^rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)/);
 return m?[+m[1],+m[2],+m[3]]:null;
};
for(const [engine,browserType] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await browserType.launch(engine==='chromium'?{channel:'chrome'}:{});
 try{
  const page=await browser.newPage({viewport:{width:1024,height:768},
   ignoreHTTPSErrors:true,deviceScaleFactor:1});
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(origin+'/',{waitUntil:'domcontentloaded',timeout:35000});
  const settings=page.getByRole('tab',{name:'设置'});
  const workspace=page.getByRole('tab',{name:'工作目录'});
  await settings.click();
  await page.locator('laity-settings-panel').waitFor({state:'visible',timeout:35000});
  await page.waitForFunction(()=>document.querySelector('laity-settings-panel')?.isLayoutReady,
   null,{timeout:40000});
  const baseline=await color(page);
  assert.equal(baseline.version,'0.1.18');
  assert.equal(baseline.rows,8);
  assert(rgb(baseline.background)?.every(x=>x<100),
   'Settings starts with a dark AG Grid: '+JSON.stringify(baseline));
  for(let i=0;i<2;i++){
   await workspace.click();
   await page.locator('#ocr2md-workspace-resident [data-testid=workspace-component]')
    .waitFor({state:'visible',timeout:25000});
   assert.equal(await page.locator('#ocr2md-workspace-resident link[href*="ag-grid-base"]')
    .getAttribute('media'),'all');
   await settings.click();
   await page.locator('laity-settings-panel').waitFor({state:'visible',timeout:25000});
   await page.waitForTimeout(200);
   const after=await color(page);
   const media=await page.locator('#ocr2md-workspace-resident link[href*="ag-grid-base"]')
    .getAttribute('media');
   assert.equal(media,'not all','inactive workspace AG CSS must not alter Settings');
   assert.equal(after.background,baseline.background,'Settings AG background changed on tab switch');
   assert.equal(after.color,baseline.color,'Settings AG text color changed on tab switch');
   assert.equal(after.rows,baseline.rows,'Settings rows changed on tab switch');
   assert.equal(after.source,baseline.source,'Settings source changed on tab switch');
   assert.deepEqual(errors,[]);
   console.log('AEL_SETTINGS_RUNTIME_STYLE_ISOLATED',JSON.stringify({
    engine,cycle:i+1,background:after.background,color:after.color,rows:after.rows,media}));
  }
 }finally{await browser.close();}
}
