/** Media image references must agree with the supported MD preview forms. */
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {chromium,webkit} from 'playwright';

const target='media/0ce612d66ff4d75e285466e3.png';
// A stable saved-adoption syntax sample, not the user's editable mother MD.
// Original OCR uses a quote prefix and Obsidian width; either may change later.
const adopted=`>![](${target}|32)`;
const source=[
  `![](${target})`,
  `![](${target}|300)`,
  `![[${target}|200x120]]`,
  `![Cover|400](${target})`,
  `![[${target}]]`,
  `<!-- minerujson:document-meta:v1\n![[media/${'f'.repeat(24)}.png|300]]\n-->`,
  '![other](https://cdn-mineru.openxlab.org.cn/a.png|240)',
].join('\n');
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1',
  '--port','5610','--strictPort'],{cwd:process.cwd(),stdio:'ignore'});
try{
  let started=false;
  for(let n=0;n<140;n++){
    try{if((await fetch('http://127.0.0.1:5610/')).ok){started=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,110));
  }
  assert(started,'isolated Vite server failed');
  // Portable browser launch: use Playwright-managed Chromium/WebKit binaries.
  const engines=[['Chrome',chromium,{}],['WebKit',webkit,{}]];
  for(const [label,engine,options] of engines){
    const browser=await engine.launch({headless:true,...options});
    try{
      const page=await browser.newPage();
      await page.goto('http://127.0.0.1:5610/',{waitUntil:'domcontentloaded'});
      const result=await page.evaluate(async inputs=>{
        const {findMedia}=await import('/media-module.js');
        return {examples:findMedia(inputs.source),adopted:findMedia(inputs.adopted)
          .filter(row=>row.url===inputs.target).map(row=>({url:row.url,line:row.line}))};
      },{source,adopted,target});
      assert.equal(result.examples.length,6,label+' should find five local image references and one remote');
      assert.deepEqual(result.examples.slice(0,5).map(row=>row.url),Array(5).fill(target));
      assert.deepEqual(result.examples.slice(0,5).map(row=>row.line),[1,2,3,4,5]);
      assert.equal(result.examples[5].url,'https://cdn-mineru.openxlab.org.cn/a.png');
      assert.deepEqual(result.adopted,[{url:target,line:1}],label+' misclassified quote-prefixed sized image');
      console.log('MEDIA_ADOPTION_SYNTAX_PASS',label,JSON.stringify({cases:6,adoptedQuoteAndWidth:true}));
    }finally{await browser.close();}
  }
  const check=spawnSync('python3',['-c',`import sys
sys.path.insert(0,'scripts')
from v6_media import chapter_media_references as refs
key='${target}'
chapter='![](../'+key+'|200)\\n![[../'+key+'|300x150]]\\n![alt](../'+key+')'
assert refs(chapter)=={key}, refs(chapter)
print('CHAPTER_ADOPTION_SYNTAX_PASS')`],{cwd:process.cwd(),encoding:'utf8'});
  assert.equal(check.status,0,check.stderr||check.stdout);
  console.log(check.stdout.trim());
}finally{server.kill('SIGTERM');}
