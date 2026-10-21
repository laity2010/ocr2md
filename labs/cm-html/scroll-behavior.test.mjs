/** Lab-only AG viewport regression: preserve position and reveal clipped rows minimally. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {homedir} from 'node:os';
import {chromium,webkit,devices} from 'playwright';

const root=process.cwd(),lab=resolve('labs/cm-html');
const protectedFiles=['packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md',
  '.v6/workspace/buffetts-alpha.minerujson.md','.v6/release/index.html']
  .map(p=>resolve(p));
const hash=p=>existsSync(p)?createHash('sha256').update(readFileSync(p)).digest('hex'):null;
const protectedHashes=protectedFiles.map(hash);
const engines=[
  ['Chrome',chromium,{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}],
  ['WebKit',webkit,{executablePath:homedir()+'/Library/Caches/ms-playwright/webkit-2359/pw_run.sh'}],
];
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let passed=0;
for(let i=0;i<engines.length;i++){
  const [name,engine,launch]=engines[i];
  if(process.env.V6_ONLY_CHROME&&name!=='Chrome')continue;
  if(process.env.V6_ONLY_WEBKIT&&name!=='WebKit')continue;
  const port=4440+i,base=`http://127.0.0.1:${port}/labs/cm-html/`;
  const server=spawn('python3',['labs/cm-html/server.py'],{
    cwd:root,env:{...process.env,CMHTML_PORT:String(port),
      CMHTML_WORKFILE:`scroll-regression-${name.toLowerCase()}-${process.pid}.md`},
    stdio:'ignore',
  });
  let browser;
  try{
    let available=false;
    for(let t=0;t<125;t++){
      try{if((await fetch(base+'healthz')).ok){available=true;break;}}catch{}
      await wait(120);
    }
    assert(available,'lab server not ready');
    browser=await engine.launch({headless:true,...launch});
    const page=await browser.newPage({...devices['iPad Pro 11 landscape'],
      viewport:{width:1032,height:642}});
    const errors=[],rootCalls=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('request',req=>{
      const path=new URL(req.url()).pathname;
      if(path.startsWith('/api/'))rootCalls.push(path);
    });
    await page.route('**/*',route=>route.request().url().startsWith(`http://127.0.0.1:${port}`)
      ?route.continue():route.abort());
    await page.goto(base,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.__cmHtmlLab?.outline?.rows?.length===21,
      null,{timeout:40000});

    const sample=()=>page.evaluate(()=>{
      const grid=document.querySelector('.ag-grid-viewport');
      const body=document.querySelector('.ag-body-vertical-scroll-viewport');
      const bar=document.querySelector('.ag-body-horizontal-scroll');
      const b=body.getBoundingClientRect();
      return {scrollTop:grid.scrollTop,top:b.top,bottom:bar?.getBoundingClientRect().top??b.bottom,
        rows:[...document.querySelectorAll('.ag-row[row-index]')].map(el=>{
          const r=el.getBoundingClientRect();
          return {index:Number(el.getAttribute('row-index')),id:el.getAttribute('row-id'),
            top:r.top,bottom:r.bottom,height:r.height};
        })};
    });
    const at=async index=> (await sample()).rows.find(r=>r.index===index);
    const scrollTo=async n=>{
      await page.evaluate(n=>{document.querySelector('.ag-grid-viewport').scrollTop=n;},n);
      await wait(160);
    };
    // A real touch on a fully visible title must not change AG scrollTop.
    const first=await sample();
    assert.equal(first.scrollTop,0);
    const target8=await at(8);
    assert(target8.top>=first.top && target8.bottom<=first.bottom,'initial test row is clipped');
    await page.touchscreen.tap(210,Math.floor((target8.top+target8.bottom)/2));
    await wait(350);
    let current=await sample();
    assert(Math.abs(current.scrollTop-first.scrollTop)<2,
      `${name} centered an already-visible row: ${current.scrollTop}`);
    console.log('AG_VISIBLE_ROW_STAYS_PASS',name,{scrollTop:current.scrollTop});

    // Checkbox editing is also a row navigation; it should not recenter AG.
    const target6=await at(6);
    await page.touchscreen.tap(370,Math.floor((target6.top+target6.bottom)/2));
    await page.waitForFunction(()=>window.__cmHtmlLab?.outline?.rows?.[6]?.independent===false,
      null,{timeout:16000});
    await wait(300);
    current=await sample();
    assert(Math.abs(current.scrollTop)<2,`${name} checkbox centered a visible row: ${current.scrollTop}`);
    console.log('AG_VISIBLE_CHECKBOX_STAYS_PASS',name,{scrollTop:current.scrollTop});

    // With row 2 clipped by the sticky header, tapping its visible piece
    // must reveal it with a small shift, not a center jump.
    await scrollTo(90);
    let before=await sample();
    const topRow=before.rows.find(r=>r.index===2);
    assert(topRow && topRow.top<before.top-2 && topRow.bottom>before.top+8,
      `${name} setup did not partially clip the top row`);
    await page.touchscreen.tap(210,Math.floor((before.top+topRow.bottom)/2));
    await wait(300);
    let after=await sample();
    const topNow=after.rows.find(r=>r.index===2);
    assert(topNow && topNow.top>=after.top-2,`${name} did not reveal clipped top`);
    assert(before.scrollTop-after.scrollTop>3 && before.scrollTop-after.scrollTop<65,
      `${name} did not minimally reveal top: ${before.scrollTop} -> ${after.scrollTop}`);
    console.log('AG_TOP_EDGE_MINIMAL_PASS',name,{before:before.scrollTop,after:after.scrollTop});

    // With row 13 partly covered by the bottom scrollbar, a tap should move
    // only enough to bring the entire row above that scrollbar.
    await scrollTo(90);
    before=await sample();
    const bottomRow=before.rows.find(r=>r.index===13);
    assert(bottomRow && bottomRow.top<before.bottom-8 && bottomRow.bottom>before.bottom+2,
      `${name} setup did not partially clip bottom row: ${JSON.stringify(bottomRow)}`);
    await page.touchscreen.tap(210,Math.floor((bottomRow.top+before.bottom)/2));
    await wait(300);
    after=await sample();
    const bottomNow=after.rows.find(r=>r.index===13);
    assert(bottomNow && bottomNow.bottom<=after.bottom+2,
      `${name} did not fully reveal bottom row: ${JSON.stringify(bottomNow)}`);
    assert(after.scrollTop-before.scrollTop>2 && after.scrollTop-before.scrollTop<65,
      `${name} did not minimally reveal bottom: ${before.scrollTop} -> ${after.scrollTop}`);
    console.log('AG_BOTTOM_EDGE_MINIMAL_PASS',name,{before:before.scrollTop,after:after.scrollTop});

    assert.deepEqual(errors,[],`${name} page errors`);
    assert.deepEqual(rootCalls,[],`${name} accessed mainline root API`);
    await browser.close();browser=null;
    passed++;
  }finally{
    if(browser)await browser.close();
    server.kill('SIGTERM');
  }
}
assert(passed>0,'No browser engines tested');
assert.deepEqual(protectedFiles.map(hash),protectedHashes,'V6 mainline changed');
console.log('AG_VIEWPORT_SCROLL_ISOLATION_PASS',JSON.stringify({engines:passed}));
