/** User-visible Tom Select navigation for Main/Lab browser regressions.
 * The hidden native selects remain the business owners; tests must click the
 * actual rendered picker rather than directly synthesizing change events.
 */
import assert from 'node:assert/strict';

async function choose(page, trigger, popup, value) {
  const control=page.locator(trigger).filter({visible:true}).first();
  await control.waitFor({state:'visible',timeout:20000});
  await control.click().catch(async error=>{
    // Diagnostic only (no retry): record why actionability failed, then rethrow.
    const samples=[];
    for(let i=0;i<8;i++){
      samples.push(await control.evaluate(el=>{const r=el.getBoundingClientRect();
        const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
        return {x:+r.x.toFixed(2),y:+r.y.toFixed(2),w:+r.width.toFixed(2),h:+r.height.toFixed(2),
          hit:hit?(hit.className||hit.tagName).toString().slice(0,60):null,
          anims:document.getAnimations().length,vv:visualViewport?[visualViewport.offsetTop,visualViewport.scale]:null};
      }).catch(e=>String(e.message).slice(0,80)));
      await page.waitForTimeout(100);
    }
    console.log('AUDIT_NAV_CLICK_DIAG',trigger,JSON.stringify(samples));
    throw error;
  });
  const item=page.locator(`${popup}:visible [data-value="${value}"]`).first();
  await item.waitFor({state:'visible',timeout:12000});
  await item.click();
}

export async function selectModule(page, value) {
  assert(['settings','chapter-boundary','media','latex'].includes(value), 'Unrecognized WCP module');
  const current=await page.locator('#module-select').inputValue();
  if(current===value)return;
  if(value==='settings') {
    const from=current==='settings'?'#settings-workspace':'.ocr-source-pane';
    await choose(page,`${from} .ocr-navigation-files .ts-control`,'.ocr-navigation-popup-files','settings');
  }else{
    if(current==='settings') {
      await choose(page,'#settings-workspace .ocr-navigation-files .ts-control',
        '.ocr-navigation-popup-files','document');
    }
    if(value!=='chapter-boundary'||(await page.locator('#module-select').inputValue())!==value){
      await choose(page,'.ocr-lab-ag-toolbar .ocr-navigation-elements .ts-control',
        '.ocr-navigation-popup-elements',value);
    }
  }
  await page.waitForFunction(v=>document.querySelector('#module-select')?.value===v,
    value,{timeout:16000});
  assert.equal(await page.locator('#module-select').inputValue(),value);
}

export async function selectPreview(page, value) {
  assert(['md','pdf'].includes(value),'Unknown preview kind');
  if(await page.locator('.ocr-preview-mode').inputValue()===value)return;
  await choose(page,'.ocr-preview-switchbar .ocr-navigation-preview .ts-control',
    '.ocr-navigation-popup-preview',value);
  await page.waitForFunction(v=>document.querySelector('.ocr-preview-mode')?.value===v,
    value,{timeout:16000});
  assert.equal(await page.locator('.ocr-preview-mode').inputValue(),value);
}
