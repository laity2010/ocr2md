/** Full real-Lab handoff: Sentence Lab's published 394 unit MD versus history. */
import assert from 'node:assert/strict';
import {chromium,webkit,devices} from 'playwright';
import {chromeExecutable} from './platform.test-helper.mjs';
const base=process.env.OCR2MD_REVIEW_URL||
  'http://127.0.0.1:4412/labs/sentence-benchmark/translation-review.html';
for(const [name,engine,binary] of [
  ['Chrome',chromium,chromeExecutable()],
  ['iPad-WebKit',webkit,process.env.OCR2MD_WEBKIT_PATH||webkit.executablePath()]
]){
  if(process.env.OCR2MD_REVIEW_BROWSER && !name.toLowerCase().includes(process.env.OCR2MD_REVIEW_BROWSER.toLowerCase()))continue;
  const browser=await engine.launch({headless:true,...(binary?{executablePath:binary}:{})});
  try{
    const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1130,height:820}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base,{waitUntil:'domcontentloaded',timeout:90000});
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('新版审阅 MD · 394 条'),null,{timeout:120000});
    assert.equal(await page.locator('#revision-mode').inputValue(),'reviewed');
    assert.equal(await page.locator('#record-picker option').count(),394);
    assert.equal(await page.locator('.ocr-tr-reader-unit-id').count(),394);
    assert.equal(await page.locator('.ocr-sb-pane[data-engine="translation"]').count(),0,
      'historical GPT/Grok panes must NEVER appear as current 394-unit translations');
    const body=await page.evaluate(()=>{
      const article=document.querySelector('.ocr-tr-reader-scroll article');
      const correct=[...article.querySelectorAll('p')].some(p=>p.textContent.includes(
        'Table 3 shows that the estimated average annual cost of Berkshire’s insurance float is only 1.72%, about 3 percentage points below the average T-bill rate.'));
      return {correct,images:article.querySelectorAll('img').length,math:article.querySelectorAll('.katex').length,
        label:document.querySelector('#ai-summary').textContent};
    });
    assert(body.correct,'original reader must render joined linebreak as ONE actual Markdown paragraph');
    assert(body.label.includes('已合并断行 8 处'));
    assert.equal(body.images,18);
    assert(body.math>=40);
    await page.locator('#record-picker').selectOption('p6b6s0-s003');
    assert.equal(await page.locator('.ocr-tr-reader-marker-current [data-gutter-unit]').getAttribute('data-gutter-unit'),'p6b6s0-s003');
    await page.locator('#revision-mode').selectOption('historical');
    await page.waitForFunction(()=>document.querySelector('#record-picker')?.options.length===402,null,{timeout:60000});
    assert.equal(await page.locator('.ocr-sb-pane[data-engine="translation"]').count(),2);
    assert((await page.locator('#status').textContent()).includes('仅供历史对照'));
    await page.locator('#revision-mode').selectOption('reviewed');
    assert.equal(await page.locator('#record-picker option').count(),394);
    assert.equal(await page.locator('.ocr-sb-pane[data-engine="translation"]').count(),0);
    assert.deepEqual(errors,[]);
    console.log(name,'REVIEWED_394_MD_LIVE_PASS',JSON.stringify(body));
  }finally{await browser.close()}
}
