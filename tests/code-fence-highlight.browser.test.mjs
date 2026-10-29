/** Real Markdown preview: syntax colors, safe escaping, line maps and KaTeX coexist. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium,webkit,devices} from 'playwright';
const port=5278,url=`http://127.0.0.1:${port}/`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1',
  '--port',String(port),'--strictPort'],{cwd:process.cwd(),stdio:'ignore'});
const sleep=t=>new Promise(resolve=>setTimeout(resolve,t));
try{
 let up=false;
 for(let i=0;i<160;i++){try{up=(await fetch(url)).ok;if(up)break;}catch{}await sleep(150);}
 assert(up,'isolated Vite server unavailable');
 for(const [name,engine] of [['Chrome',chromium],['iPad WebKit',webkit]]){
  const browser=await engine.launch({headless:true});
  try{
   const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:642}});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',route=>route.request().url().startsWith(url)?route.continue():route.abort());
   await page.route('**/healthz',route=>route.fulfill({status:200,
      contentType:'application/json',body:'{}'}));
   await page.goto(url,{waitUntil:'domcontentloaded',timeout:50000});
   const result=await page.evaluate(async()=>{
     const {renderMarkdown}=await import('/markdown-preview.js');
     const source=[
       '```python','def greet():','    return 42','```','',
       '```json','{"answer": 42}','```','',
       '```html','<div>hello</div>','```','',
       '```javascript','const x = 7;','```','',
       '```unknown-tag','<script>alert(1)</script>','```','',
       '```','plain <b>& text','```','',
       '```math','x^2 + y^2','```','',
       '$$','\\sqrt{2}','$$',
     ].join('\n');
     const host=document.createElement('div');host.className='ocr-markdown';
     host.innerHTML=renderMarkdown(source);document.body.append(host);
     const root=host.querySelector('.ocr-source-block');
     const python=host.querySelector('code.language-python');
     const keywords=[...python.querySelectorAll('.hljs-keyword')].map(el=>el.textContent);
     const unknown=host.querySelector('code.language-unknown-tag');
     const plain=host.querySelector('pre.ocr-code-fence code.hljs:not([class*="language-"])');
     const text={python:python.textContent,json:host.querySelector('code.language-json')?.textContent,
       html:host.querySelector('code.language-html')?.textContent,
       javascript:host.querySelector('code.language-javascript')?.textContent,
       unknown:unknown?.textContent,plain:plain?.textContent};
     const keyword=python.querySelector('.hljs-keyword');
     const colored=Boolean(keyword)&&getComputedStyle(keyword).color!==getComputedStyle(python).color;
     const math=host.querySelectorAll('.ocr-math .katex').length;
     const actualHtml=host.innerHTML;
     const sourceStart=root?.dataset.sourceStart,sourceEnd=root?.dataset.sourceEnd;
     host.remove();
     return {text,keywords,colored,math,sourceStart,sourceEnd,
       hasUnsafeScript:Boolean(host.querySelector('script')),
       hasEscapedScript:actualHtml.includes('&lt;script&gt;'),
       coloredHTML:actualHtml.includes('hljs-tag')};
   });
   assert(result.keywords.includes('def')&&result.keywords.includes('return'),name+' Python tokens');
   assert(result.colored,name+' highlighted keywords have no distinct CSS color');
   assert.match(result.text.json,/answer/);
   assert.match(result.text.html,/<div>hello<\/div>/);
   assert.match(result.text.javascript,/const x = 7/);
   assert.match(result.text.unknown,/<script>alert\(1\)<\/script>/);
   assert.match(result.text.plain,/plain <b>& text/);
   assert(result.coloredHTML,name+' HTML tokens were not highlighted');
   assert(result.hasEscapedScript&&!result.hasUnsafeScript,name+' escaped unknown code');
   assert.equal(result.math,2,name+' math and KaTeX fences should remain intact');
   assert.equal(result.sourceStart,'1');assert.equal(result.sourceEnd,'5');
   assert.deepEqual(errors,[],name+' browser errors');
   console.log('CODE_FENCE_PREVIEW_PASS',name,JSON.stringify({python:true,json:true,html:true,
     javascript:true,unknownPlain:true,katex:true,sourceMaps:true,styled:true}));
  }finally{await browser.close();}
 }
}finally{server.kill('SIGTERM');}
