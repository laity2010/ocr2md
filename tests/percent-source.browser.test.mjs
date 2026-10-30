/** Guard CM6 math highlighter: literal % remains prose outside real math. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium,webkit,devices} from 'playwright';
const full=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8');
const at=full.indexOf('Empirically, we found that Berkshire owned 65%');
assert(at>=0,'real Buffett 65% fixture missing');
const prose=full.slice(at,full.indexOf('\n',at));
const source=[
  '# Percent syntax',
  '<!-- minerujson:block:v1:9:6 -->',
  '$$x=\\frac{a}{b}$$',
  '<!-- minerujson:block:v1:9:7 -->','',prose,'',
  // Simulate a malformed OCR math span accidentally covering a different
  // MinerU block. Source syntax MUST NOT treat this prose as TeX comments.
  '$$','a=b',
  '<!-- minerujson:block:v1:9:8 -->','',
  'Plain prose states that the value is 65% private and 35% public.','$$','',
  // Genuine formula percent comments must remain valid inside real math.
  '$$','x=65% an actual TeX comment','$$',
].join('\n');
const dir=mkdtempSync(join(tmpdir(),'ocr2md-percent-source-'));
const doc=join(dir,'percent.md');writeFileSync(doc,source);
const port=5987,base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{
  cwd:process.cwd(),stdio:'ignore',env:{...process.env,V6_DOCUMENT_PATH:doc}});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{
 let ready=false;for(let i=0;i<150;i++){try{if((await fetch(base)).ok){ready=true;break}}catch{}await sleep(100)}
 assert(ready,'isolated browser service unavailable');
 for(const [name,engine,opts] of [['Chrome',chromium,{viewport:{width:1100,height:780}}],
   ['iPad-WebKit',webkit,{...devices['iPad Pro 11 landscape'],viewport:{width:1100,height:780}}]]){
  const browser=await engine.launch({headless:true});
  try{
   const page=await browser.newPage(opts),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   await page.goto(base,{waitUntil:'domcontentloaded'});
   await page.locator('#editor .cm-content').waitFor({state:'visible',timeout:40000});
   async function inspect(needle){
    await page.evaluate(needle=>{const v=window.__v6cm6.view;
      const at=v.state.doc.toString().indexOf(needle);
      if(at<0)throw Error('Missing text: '+needle);
      v.dispatch({selection:{anchor:at},scrollIntoView:true});v.requestMeasure();
    },needle);
    await page.waitForFunction(needle=>[...document.querySelectorAll('#editor .cm-line')]
      .some(x=>x.textContent.includes(needle)),needle,{timeout:15000});
    return page.evaluate(needle=>{
      const line=[...document.querySelectorAll('#editor .cm-line')].find(x=>x.textContent.includes(needle));
      return {text:line.textContent,
        mainColor:getComputedStyle(line).color,
        fragments:[...line.querySelectorAll('span')].map(x=>({text:x.textContent,cls:x.className,
          color:getComputedStyle(x).color,fontStyle:getComputedStyle(x).fontStyle})).filter(x=>x.text.trim())};
    },needle);
   }
   const real=await inspect('Empirically, we found');
   const falseMath=await inspect('Plain prose states that the value');
   const validMath=await inspect('x=65% an actual TeX comment');
   console.log('PERCENT_SOURCE',name,JSON.stringify({real:real.fragments,falseMath:falseMath.fragments,validMath:validMath.fragments}));
   assert.equal(real.fragments.length,0,'ordinary Buffett 65% prose should have no math token spans');
   assert.equal(falseMath.fragments.length,0,'OCR math crossing a MinerU block colored plain % as TeX comment');
   assert(validMath.fragments.length>0,'genuine TeX percent comments should be syntax colored');
   assert.equal(await page.evaluate(()=>window.__v6cm6.view.state.doc.toString()),source);
   assert.deepEqual(errors,[]);
   console.log('PERCENT_MARKDOWN_SYNTAX_PASS',name);
  }finally{await browser.close();}
 }
}finally{server.kill('SIGTERM');rmSync(dir,{recursive:true,force:true});}
