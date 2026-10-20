import assert from 'node:assert/strict';
import {chromium,webkit,devices} from 'playwright';
import {homedir} from 'node:os';

const url=process.env.V6_TEST_URL || 'https://192.168.1.10:4443/';
const sample='## Andrea Frazzini, David Kabiller & Lasse Heje Pedersen';
const runtimes=[
  ['Chrome',chromium,{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}],
  ['WebKit',webkit,{executablePath:homedir()+'/Library/Caches/ms-playwright/webkit-2359/pw_run.sh'}]
];
for (const [label,type,launchOptions] of runtimes) {
  const browser=await type.launch({headless:true,...launchOptions});
  try {
    const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:642}});
    const errors=[];
    const fonts=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('response',response=>{if(response.url().includes('ocr2md-sarasa-'))fonts.push({status:response.status(),url:response.url()});});
    await page.goto(url+'?fontcheck=1',{waitUntil:'domcontentloaded',timeout:35000});
    await page.locator('#v6-fontcheck').waitFor({timeout:25000});
    await page.evaluate(()=>document.fonts.ready);
    const result=await page.evaluate(sample=>{
      function measure(family,weight){const span=document.createElement('span');span.textContent=sample;span.style.cssText=`position:fixed;left:-99999px;white-space:pre;font-family:${family};font-size:16px;font-weight:${weight}`;document.body.append(span);const n=span.getBoundingClientRect().width;span.remove();return n;}
      const editor=document.querySelector('.cm-content');
      return {width:measure('"OCR2MD Sarasa"',400),boldWidth:measure('"OCR2MD Sarasa"',700),actualWidth:measure(getComputedStyle(editor).fontFamily,400),fontSize:getComputedStyle(editor).fontSize,uiFont:getComputedStyle(document.querySelector('.brand')).fontFamily,viewport:[innerWidth,innerHeight],panel:document.querySelector('#v6-fontcheck').textContent};
    },sample);
    assert.equal(result.fontSize,'16px');
    assert.deepEqual(result.viewport,[1032,642]);
    assert(Math.abs(result.width-448)<2,`${label} Sarasa regular unexpected width ${result.width}`);
    assert(Math.abs(result.boldWidth-448)<2,`${label} Sarasa bold unexpected width ${result.boldWidth}`);
    assert(Math.abs(result.actualWidth-448)<2,`${label} editor fallback detected ${result.actualWidth}`);
    assert(result.panel.includes('Web字体：已匹配'));
    assert(fonts.filter(r=>r.status===200).length>=2,`${label} webfont not loaded: ${JSON.stringify(fonts)}`);
    assert.equal(errors.length,0,errors.join('\n'));
    console.log('V6_SARASA_WEBFONT_PASS',JSON.stringify({browser:label,metrics:result,assets:fonts.map(f=>f.status)}));
  } finally {await browser.close();}
}
