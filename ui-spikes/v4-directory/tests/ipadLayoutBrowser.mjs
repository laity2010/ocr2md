/** V4 iPad visible-height UIC regression, real hosted modules + WebKit.
 * Optional V4_LAYOUT_CSS_CANDIDATE=1 intercepts only V4 CSS before publication.
 */
import {webkit} from '../../../../web-component-platform/node_modules/playwright/index.mjs';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const candidate=process.env.V4_LAYOUT_CSS_CANDIDATE==='1';
const css=candidate?await readFile('ui-spikes/v4-directory/assets/v4.css','utf8'):null;
const browser=await webkit.launch({headless:true});
try{
 for(const [name,width,height] of [['landscape',1032,740],['portrait',768,1050]]){
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  try{
   if(css)await page.route('**/v4-directory/assets/v4.css',route=>route.fulfill({status:200,contentType:'text/css',body:css}));
   await page.goto('https://ocr2md.laity.bid/v4-directory/?layout=412',{waitUntil:'domcontentloaded',timeout:45000});
   await page.waitForFunction(()=>window.__ocr2mdV4?.phase==='ready',null,{timeout:65000});
   await page.locator('#settings-shared[data-ready="true"]').waitFor({timeout:65000});
   const measure=async()=>page.evaluate(()=>{
    const box=id=>{const el=document.querySelector(id),r=el?.getBoundingClientRect();return {top:r?.top,bottom:r?.bottom,height:r?.height,width:r?.width}};
    return {viewport:innerHeight,body:box('body'),tabs:box('.v3-top-row'),panel:box('#panel-modules'),
      layout:box('#v3-shared-config-layout'),mount:box('#v4-module-mount'),status:getComputedStyle(document.querySelector('#status')).position};
   });
   const settings=await measure();
   assert.ok(settings.panel.height>=height*0.75,JSON.stringify(settings));
   assert.ok(settings.panel.bottom>=height-16,JSON.stringify(settings));
   assert.ok(settings.layout.height>=settings.panel.height-2,JSON.stringify(settings));
   assert.equal(settings.status,'absolute');
   await page.locator('#tab-workspace').click();
   await page.locator('[data-testid="workspace-component"]').waitFor({timeout:55000});
   const workspace=await measure();
   assert.ok(workspace.panel.bottom>=height-16,JSON.stringify(workspace));
   const module=await page.locator('[data-testid="workspace-component"]').boundingBox();
   assert.ok(module.height>=workspace.panel.height-12,JSON.stringify({module,workspace}));
   await page.locator('#tab-settings').click();
   await page.locator('#settings-shared[data-ready="true"]').waitFor({timeout:45000});
   console.log('V4_IPAD_LAYOUT_PASS',JSON.stringify({name,viewport:[width,height],settings,workspace,moduleHeight:module.height}));
  }finally{await page.close()}
 }
}finally{await browser.close()}
