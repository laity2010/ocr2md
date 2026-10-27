/** Chapter title font multiplier: registered global setting and isolated Chrome/WebKit rendering. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium,webkit} from 'playwright';
const key='chapterBoundary.ag.titleFontScale';
const pause=n=>new Promise(r=>setTimeout(r,n));
// Use Playwright-managed binaries, not one developer's Mac absolute paths.
const engines=[['Chrome',chromium,{}],['WebKit',webkit,{}]];
for(const [i,[name,engine,options]]of engines.entries()){
  const temp=mkdtempSync(join(tmpdir(),'ocr-title-scale-'));
  const path=join(temp,'settings.json');
  const port=5894+i,base=`http://127.0.0.1:${port}`;
  const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1',
    '--port',String(port),'--strictPort'],{cwd:process.cwd(),stdio:'ignore',env:{...process.env,
    V6_SETTINGS_PATH:path,V6_DOCUMENT_PATH:join(temp,'book.md')}});
  let browser;
  try{
    let ready=false;
    for(let j=0;j<120;j++){try{if((await fetch(base)).ok){ready=true;break;}}catch{}await pause(100);}
    assert(ready,'Vite server not ready');
    browser=await engine.launch({headless:true,...options});
    const page=await browser.newPage({viewport:{width:1365,height:840}});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(base,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.querySelector('.ocr-outline-h1')!==null);
    await page.locator('#module-select').selectOption('settings');
    await page.waitForFunction(()=>document.querySelectorAll('#settings-workspace .ag-row').length===2);
    const row=page.locator('#settings-workspace .ag-row').filter({hasText:'titleFontScale'});
    await row.click();
    const slider=page.locator('#settings-font-slider');
    await page.waitForFunction(()=>document.querySelector('.ocr-settings-breadcrumb')?.textContent.includes('titleFontScale'));
    assert.equal(await slider.getAttribute('min'),'0.2');
    assert.equal(await slider.getAttribute('max'),'2');
    assert.equal(await slider.getAttribute('step'),'0.1');
    assert.equal(await slider.inputValue(),'1');
    const set=async value=>slider.evaluate((e,v)=>{e.value=String(v);e.dispatchEvent(new Event('input',{bubbles:true}));},value);
    const layout=()=>page.evaluate(()=>{
      const title=document.querySelector('.ocr-outline-h1'),level=document.querySelector('.ocr-outline-pane .ag-cell[col-id="level"]');
      return {font:parseFloat(getComputedStyle(title).fontSize),
        other:parseFloat(getComputedStyle(level).fontSize),height:title.closest('.ag-row').getBoundingClientRect().height};
    });
    await set(2);
    await page.locator('#module-select').selectOption('chapter-boundary');
    await page.waitForFunction(()=>Math.abs(parseFloat(getComputedStyle(document.querySelector('.ocr-outline-h1')).fontSize)-68)<.1);
    const big=await layout();
    assert(big.height>=80,'H1 row must grow for large font');
    await page.locator('#module-select').selectOption('settings');
    await row.click();await set(.2);
    await page.locator('#module-select').selectOption('chapter-boundary');
    await page.waitForFunction(()=>Math.abs(parseFloat(getComputedStyle(document.querySelector('.ocr-outline-h1')).fontSize)-6.8)<.1);
    const tiny=await layout();
    assert.equal(tiny.other,big.other,'Other AG columns stay unchanged');
    await page.locator('#module-select').selectOption('settings');
    await row.click();
    const activeSlider=await slider.evaluate(e=>{window.__settingSliderIdentity=e;return e.value;});
    assert.equal(activeSlider,'0.2');
    await set(1.7);
    await page.waitForFunction(k=>JSON.parse(window.__v6cm6.settings.source.getText()).settings[k].value===1.7,key);
    assert.equal(await slider.evaluate(e=>e===window.__settingSliderIdentity),true,
      'Scalar change must not remount the active setting control');
    assert.equal(await page.evaluate(k=>JSON.parse(window.__v6cm6.settings.source.getText()).settings[k].value,key),1.7);
    const saved=page.waitForResponse(r=>r.url().endsWith('/api/settings')&&r.request().method()==='PUT');
    await page.locator('#save').click();
    assert.equal((await saved).status(),200);
    assert.equal(JSON.parse(readFileSync(path,'utf8')).settings[key].value,1.7);
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.querySelector('.ocr-outline-h1')&&
      Math.abs(parseFloat(getComputedStyle(document.querySelector('.ocr-outline-h1')).fontSize)-57.8)<.15,
      null,{timeout:20000});
    assert.equal(errors.length,0,errors.join(';'));
    console.log('OUTLINE_TITLE_SCALE_PASS',name,JSON.stringify({min:.2,max:2,step:.1,default:1,
      bigTitle:big.font,tinyTitle:tiny.font,bigRow:big.height,persisted:1.7}));
    await page.close();
  }finally{if(browser)await browser.close();server.kill('SIGTERM');}
}
