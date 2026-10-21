/** CM6 wrapper and authenticated real MinerU converter, Chrome + WebKit. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {homedir} from 'node:os';
import {chromium,webkit,devices} from 'playwright';

const root=process.cwd(),lab=resolve('labs/cm-html');
const raw=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8');
const markdown=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8');
const protectedFiles=['packages/minerujson-md/fixtures/buffetts-alpha.mineru.json',
  'packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md',
  '.v6/workspace/buffetts-alpha.minerujson.md','.v6/release/index.html'].map(p=>resolve(p));
const sha=file=>existsSync(file)?createHash('sha256').update(readFileSync(file)).digest('hex'):null;
const hashes=protectedFiles.map(sha);
const engines=[['Chrome',chromium,{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}],
  ['WebKit',webkit,{executablePath:homedir()+'/Library/Caches/ms-playwright/webkit-2359/pw_run.sh'}]];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let passed=0;
for(const [index,[name,engine,opts]] of engines.entries()){
  if(process.env.V6_ONLY_CHROME&&name!=='Chrome')continue;
  if(process.env.V6_ONLY_WEBKIT&&name!=='WebKit')continue;
  const port=4470+index,base=`http://127.0.0.1:${port}/labs/cm-html/`;
  const filename=`wrapper-test-${name.toLowerCase()}-${process.pid}.md`;
  const workFile=join(lab,'.runtime',filename);
  assert(!existsSync(workFile));
  const server=spawn('python3',['labs/cm-html/server.py'],{
    cwd:root,env:{...process.env,CMHTML_PORT:String(port),CMHTML_WORKFILE:filename},stdio:'ignore',
  });
  let browser;
  try {
    let ready=false;
    for(let t=0;t<110;t++){
      try{if((await fetch(base+'healthz')).ok){ready=true;break;}}catch{}
      await sleep(150);
    }
    assert(ready,'isolated server not ready');
    const wrongPath=await fetch(base+'api/convert-mineru',{method:'POST',body:'{}',
      headers:{Origin:base.slice(0,-14)}});
    assert.equal(wrongPath.status,403,'unauthorized converter request must be blocked');
    browser=await engine.launch({headless:true,...opts});
    const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:642}});
    const errors=[],rootCalls=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))rootCalls.push(r.url());});
    await page.route('**/*',route=>route.request().url().startsWith(`http://127.0.0.1:${port}`)
      ?route.continue():route.abort());
    await page.goto(base,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.__cmHtmlLab?.outline?.rows?.length===21,
      null,{timeout:35000});
    const before=await page.evaluate(()=>{
      const l=window.__cmHtmlLab;
      return {sameView:l.cm.view===l.view,docs:l.cm.markdown.length,
        titleLine:l.outline.rows[1].sourceLine};
    });
    assert(before.sameView);assert.equal(before.docs,markdown.length);

    // Both comment and tag are ordinary HTML in the same CM6 transaction path.
    const comment=await page.evaluate(()=>{
      const l=window.__cmHtmlLab;
      const line=l.outline.rows[1].sourceLine;
      const where=l.cm.writeComment({text:'cmwrapper:check:v1 id="probe"',beforeLine:line});
      return {where,read:l.cm.readHtml(where.line),id:l.outline.rows[1].id};
    });
    assert.match(comment.read.html,/^<!-- cmwrapper:check:v1/);
    assert(comment.read.syntax.includes('CommentBlock'));
    const tag=await page.evaluate(line=>{
      const l=window.__cmHtmlLab;
      l.cm.writeHtml({html:'<ocr2md-test data-id="probe"></ocr2md-test>',
        beforeLine:line+1,replaceLine:line});
      return l.cm.readHtml(line);
    },comment.where.line);
    assert(tag.syntax.includes('HTMLTag'),`tag not recognized: ${tag.syntax}`);
    await page.locator('#undo').click();
    await page.waitForFunction(()=>window.__cmHtmlLab.cm.markdown.includes('<!-- cmwrapper:check:v1'));
    await page.locator('#undo').click();
    await page.waitForFunction(n=>window.__cmHtmlLab.cm.markdown.length===n,before.docs);
    assert.equal(await page.evaluate(()=>window.__cmHtmlLab.cm.markdown),markdown);
    await page.locator('#redo').click();
    await page.waitForFunction(()=>window.__cmHtmlLab.cm.markdown.includes('<!-- cmwrapper:check:v1'));
    await page.locator('#undo').click();
    console.log('CM_WRAPPER_HTML_TRANSACTION_PASS',name,JSON.stringify({comment:comment.read.syntax,tag:tag.syntax}));

    // Rejection leaves CM6 text intact, including when a converter fails.
    const denied=await page.evaluate(async input=>{
      const cm=window.__cmHtmlLab.cm,before=cm.markdown;
      let rejected=false;
      try{await cm.loadMineruJson(input);}catch{rejected=true;}
      return {rejected,unchanged:cm.markdown===before};
    },raw);
    assert(denied.rejected&&denied.unchanged);
    const code=readFileSync(join(lab,'.runtime/private/save-token'),'utf8').trim().slice(0,12);
    const unlock=await page.evaluate(async token=>fetch('/labs/cm-html/api/unlock',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:token}),
    }).then(r=>r.status),code);
    assert.equal(unlock,200);
    const converted=await page.evaluate(async input=>{
      const cm=window.__cmHtmlLab.cm,before=cm.markdown;
      const result=await cm.loadMineruJson(input);
      return {sameView:cm.view===window.__cmHtmlLab.view,
        sameDoc:result===cm.view.state.doc,
        changed:cm.markdown!==before,
        lines:cm.view.state.doc.lines,markdown:cm.markdown};
    },raw);
    assert(converted.sameDoc&&converted.sameView);
    assert.equal(converted.markdown,markdown,'real converter must reproduce the fixed MinerU projection');
    assert.equal(converted.lines,3560);
    assert.equal(converted.changed,false,'identical original document conversion should match');
    const failure=await page.evaluate(async()=>{
      const cm=window.__cmHtmlLab.cm,before=cm.markdown;
      let rejected=false;
      try{await cm.loadMineruJson('{"invalid":true}');}catch{rejected=true;}
      return {rejected,unchanged:cm.markdown===before};
    });
    assert(failure.rejected&&failure.unchanged);
    assert(!existsSync(workFile),'Wrapper is not authorized to save the mother file implicitly');
    assert.deepEqual(errors,[],name+' browser errors');
    assert.deepEqual(rootCalls,[],name+' production API was called');
    console.log('CM_WRAPPER_REAL_MINERU_CONVERSION_PASS',name,JSON.stringify({bytes:raw.length,markdown:markdown.length,lines:converted.lines}));
    passed++;
  }finally{
    if(browser)await browser.close();
    server.kill('SIGTERM');
  }
}
assert(passed>0);
assert.deepEqual(protectedFiles.map(sha),hashes,'Source or production files modified');
console.log('CM_WRAPPER_ISOLATION_PASS',JSON.stringify({engines:passed}));
