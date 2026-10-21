/** End-to-end: CM6 chapter toggles => AG planned paths => authorized lab-only exports. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,existsSync,mkdirSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {homedir} from 'node:os';
import {chromium,webkit,devices} from 'playwright';
import {buildOutline} from '../../ui/outline-index.js';
import {buildChapterFiles} from './chapters.js';

const root=process.cwd(),lab=resolve('labs/cm-html');
const fixture=resolve('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md');
const mainDoc=resolve('.v6/workspace/buffetts-alpha.minerujson.md');
const mainRelease=resolve('.v6/release/index.html');
const protectedFiles=[fixture,mainDoc,mainRelease];
const hash=p=>existsSync(p)?createHash('sha256').update(readFileSync(p)).digest('hex'):null;
const beforeHashes=protectedFiles.map(hash);
const original=readFileSync(fixture,'utf8');
const evidence=join(lab,'.runtime/evidence');mkdirSync(evidence,{recursive:true});
const engines=[
  ['Chrome',chromium,{headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}],
  ['WebKit',webkit,{headless:true,executablePath:homedir()+'/Library/Caches/ms-playwright/webkit-2359/pw_run.sh'}],
];
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let passes=0;
for(let index=0;index<engines.length;index++){
  const [name,engine,launch]=engines[index];
  if(process.env.V6_ONLY_CHROME&&name!=='Chrome')continue;
  if(process.env.V6_ONLY_WEBKIT&&name!=='WebKit')continue;
  const port=4450+index,base=`http://127.0.0.1:${port}/labs/cm-html/`;
  const workFile=`chapter-browser-${name.toLowerCase()}-${process.pid}.md`;
  const chapterDir=join(lab,'.runtime',workFile.slice(0,-3)+'-chapters');
  const mother=join(lab,'.runtime',workFile);
  assert(!existsSync(mother));assert(!existsSync(chapterDir));
  const server=spawn('python3',['labs/cm-html/server.py'],{
    cwd:root,env:{...process.env,CMHTML_PORT:String(port),CMHTML_WORKFILE:workFile},
    stdio:'ignore',
  });
  let browser;
  try{
    let ready=false;
    for(let t=0;t<150;t++){
      try{if((await fetch(base+'healthz')).ok){ready=true;break;}}catch{}
      await wait(120);
    }
    assert(ready,name+' server failed to initialize');
    browser=await engine.launch(launch);
    const page=await browser.newPage({...devices['iPad Pro 11 landscape'],
      viewport:{width:1032,height:642}});
    const errors=[],rootAPI=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('request',req=>{const path=new URL(req.url()).pathname;
      if(path.startsWith('/api/'))rootAPI.push(path);
    });
    await page.route('**/*',route=>route.request().url().startsWith(`http://127.0.0.1:${port}`)
      ?route.continue():route.abort());
    await page.goto(base,{waitUntil:'domcontentloaded'});
    const loaded=()=>page.waitForFunction(()=>window.__cmHtmlLab?.outline?.rows?.length===21,
      null,{timeout:40000});
    await loaded();
    const planned=await page.evaluate(()=>window.__cmHtmlLab.outline.rows.map(r=>({
      name:r.chapterFile,independent:r.independent,level:r.level,id:r.id,
    })));
    assert.equal(new Set(planned.map(r=>r.name)).size,21);
    assert(planned[0].name.startsWith('001-'));
    assert(planned.at(-1).name.startsWith('021-'));
    assert.equal(await page.locator('.ag-row[row-index="0"] .cm-html-chapter-pending').count(),1);
    console.log('CHAPTER_AG_PLAN_PASS',name,JSON.stringify({first:planned[0].name,last:planned.at(-1).name}));

    // Checkbox writes only the CM6 annotation and recomputes path assignment.
    await page.locator('.ag-row[row-index="1"] input.ocr-outline-checkbox').uncheck();
    await page.waitForFunction(()=>{
      const rows=window.__cmHtmlLab.outline.rows;
      return rows[1].independent===false && rows[1].chapterFile===rows[0].chapterFile &&
        rows[2].chapterFile.startsWith('002-');
    },null,{timeout:18000});
    const afterToggle=await page.evaluate(()=>{
      const l=window.__cmHtmlLab;return {
        row0:l.outline.rows[0].chapterFile,row1:l.outline.rows[1].chapterFile,
        row2:l.outline.rows[2].chapterFile,level:l.outline.rows[1].level,
        status:document.querySelector('#status').textContent,
      };
    });
    assert.equal(afterToggle.level,2);
    assert.equal(afterToggle.row1,afterToggle.row0);
    assert(!existsSync(chapterDir),'AG planning must never create disk files');
    const noAuth=await page.evaluate(()=>fetch('/labs/cm-html/api/export-chapters',{
      method:'POST',headers:{'Content-Type':'application/json'},body:'{}',
    }).then(r=>r.status));
    assert.equal(noAuth,403,'Unauthenticated export must be forbidden');
    await page.locator('#export-chapters').click();
    await page.locator('#unlock-dialog').waitFor({state:'visible'});
    const token=readFileSync(join(lab,'.runtime/private/save-token'),'utf8').trim();
    await page.locator('#unlock-code').fill(token.slice(0,12));
    await page.locator('#unlock-form button[type="submit"]').click();
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('✓ 已导出 20 个章节'),
      null,{timeout:30000});
    assert(existsSync(mother),'export must first save edited CM6 mother document');
    assert(existsSync(chapterDir),'lab-specific chapter directory missing');
    assert.equal(readdirSync(chapterDir).length,21,'20 generated files and manifest expected');
    const source=readFileSync(mother,'utf8');
    const expect=buildChapterFiles(source,buildOutline(source).map((r,i)=>({
      ...r,independent:i!==1,
    })));
    assert.equal(expect.length,20);
    const manifest=JSON.parse(readFileSync(join(chapterDir,'manifest.json'),'utf8'));
    assert.equal(manifest.files.length,20);
    assert.equal(manifest.sourceSha256,hash(mother));
    for(let i=0;i<expect.length;i++){
      const entry=manifest.files[i],file=expect[i];
      assert.equal(entry.name,file.name);
      const written=readFileSync(join(chapterDir,entry.name),'utf8');
      assert.equal(written,file.content,'exported chapter differs from CM6 projection');
      assert.equal(entry.sha256,hash(join(chapterDir,entry.name)));
      assert(!written.includes('minerujson:source:v1:'));
    }
    // Whole readable part is reconstructed exactly; only control markers
    // and the giant raw JSON footer are excluded.
    const cleanPart=source.slice(0,source.indexOf('<!-- minerujson:source:v1:'))
      .split('\n').filter(line=>!line.includes('ocr2md:chapter:v1')).join('\n');
    assert.equal(expect.map(x=>x.content).join(''),cleanPart);
    const activeLinks=await page.locator('.cm-html-chapter-link').count();
    assert(activeLinks>0,'exported files not linked in AG');
    const firstLink=page.locator('.ag-row[row-index="0"] .cm-html-chapter-link');
    const url=await firstLink.getAttribute('href');
    assert(url.startsWith('/labs/cm-html/api/chapters/'));
    const fileResponse=await page.evaluate(path=>fetch(path).then(async r=>({status:r.status,text:await r.text()})),url);
    assert.equal(fileResponse.status,200);
    assert.equal(fileResponse.text,expect[0].content);
    const forbidden=await page.evaluate(async()=>{
      const base='/labs/cm-html/api/export-chapters';
      return Promise.all([
        {sourceSha256:'f'.repeat(64),files:[{name:'001-../bad.md',content:'<!-- minerujson:block:v1:0:0 -->'}]},
        {sourceSha256:'f'.repeat(64),files:[{name:'001-one.md',content:'no evidence'}]},
      ].map(body=>fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify(body)}).then(r=>r.status)));
    });
    assert.deepEqual(forbidden,[400,400]);
    console.log('CHAPTER_EXPORT_FILES_PASS',name,JSON.stringify({count:expect.length,size:manifest.files.reduce((sum,f)=>sum+f.bytes,0),forbidden}));

    // Reload: the manifest fingerprint still matches, so AG links reappear.
    await page.reload({waitUntil:'domcontentloaded'});await loaded();
    await page.waitForFunction(()=>document.querySelectorAll('.cm-html-chapter-link').length>0,
      null,{timeout:15000});
    // A subsequent different checkbox grouping invalidates old links and
    // replaces the generated directory, removing stale numbered outputs.
    await page.locator('.ag-row[row-index="2"] input.ocr-outline-checkbox').uncheck();
    await page.waitForFunction(()=>{
      const r=window.__cmHtmlLab.outline.rows;
      return r[2].independent===false && r[2].chapterFile===r[0].chapterFile;
    },null,{timeout:18000});
    await page.waitForFunction(()=>document.querySelectorAll('.cm-html-chapter-link').length===0,
      null,{timeout:10000});
    assert.equal(await page.locator('.cm-html-chapter-link').count(),0,'links did not become stale');
    await page.locator('#export-chapters').click();
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('✓ 已导出 19 个章节'),
      null,{timeout:30000});
    assert.equal(JSON.parse(readFileSync(join(chapterDir,'manifest.json'),'utf8')).files.length,19);
    assert.equal(readdirSync(chapterDir).length,20);
    assert.equal(await page.locator('.ag-row[row-index="0"] .cm-html-chapter-link').count(),1);
    assert.deepEqual(errors,[],'Browser page error');
    assert.deepEqual(rootAPI,[],name+' accessed mainline API');
    await page.screenshot({path:join(evidence,`cm-html-chapters-${name.toLowerCase()}.png`)});
    console.log('CHAPTER_EXPORT_REOPEN_AND_REEXPORT_PASS',name,'OK');
    passes++;
  }finally{
    if(browser)await browser.close();
    server.kill('SIGTERM');
  }
}
assert(passes>0);
assert.deepEqual(protectedFiles.map(hash),beforeHashes,'V6 protected files changed');
console.log('CHAPTER_EXPORT_ISOLATION_PASS',JSON.stringify({engines:passes}));
