/** One Lab static release reached from internal/public paths.
 * Read-only visual/browser smoke: no document saves, API writes or downloads.
 */
import assert from 'node:assert/strict';
import {chromium,webkit,devices} from 'playwright';
import {chromeExecutable} from './platform.test-helper.mjs';

const checks=[
  ['/labs/','Lab 实验工作台','a[href="/labs/translation-lab/translation-lab.html"]'],
  ['/labs/cm-html/','章节定界','body'],
  ['/labs/sentence-benchmark/sentence-benchmark.html','Sentence Benchmark Lab','#sample-select'],
  ['/labs/sentence-benchmark/translation-review.html','Translation Review Lab','body'],
  ['/labs/translation-lab/translation-lab.html','Lab 翻译','#provider-cards']
];
const locations=[
  ['loopback Chrome','http://127.0.0.1:4414',chromium,chromeExecutable()],
  ['LAN iPad-WebKit','https://192.168.1.10:4443',webkit,process.env.OCR2MD_WEBKIT_PATH||webkit.executablePath()],
  ['public Chrome','https://ocr2md.laity.bid',chromium,chromeExecutable()],
];
let successful=0;
for(const [label,origin,engine,binary] of locations){
  const browser=await engine.launch({headless:true,...(binary?{executablePath:binary}:{})});
  try{
    const page=await browser.newPage({...devices['iPad Pro 11 landscape'],
      viewport:{width:1194,height:834},ignoreHTTPSErrors:true});
    for(const [path,key,element] of checks){
      const failures=[];
      const onResponse=response=>{
        const request=response.url();
        if(response.status()>=400 && /\.(?:js|css|woff2?|html)(?:\?|$)/.test(request)
          && request.includes('/labs/'))failures.push(response.status()+': '+request);
      };
      page.on('response',onResponse);
      const response=await page.goto(origin+path,{waitUntil:'domcontentloaded',timeout:60000});
      assert.equal(response?.status(),200,label+' '+path);
      assert((await page.title()).includes(key),label+' wrong title '+(await page.title()));
      await page.locator(element).first().waitFor({timeout:20000});
      if(path.includes('translation-lab.html')){
        await page.waitForFunction(()=>document.querySelectorAll('#provider-cards button').length===3,
          null,{timeout:22000});
        await page.locator('[data-ai="grok"]').click();
        await page.waitForFunction(()=>document.querySelector('#work-ai-name')?.textContent?.includes('Grok'),
          null,{timeout:14000});
      }
      await page.waitForTimeout(500);
      assert.deepEqual(failures,[],label+' invalid static requests for '+path);
      page.off('response',onResponse);
      console.log('BROWSER_UNIFIED_RELEASE_PASS',label,path);
      successful++;
    }
    await page.close();
  }finally{await browser.close();}
}
assert.equal(successful,checks.length*locations.length);
console.log('BROWSER_UNIFIED_RELEASE_ALL_PASS',successful);
