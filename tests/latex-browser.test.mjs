import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {homedir} from 'node:os';
import {chromium,webkit,devices} from 'playwright';
import {findLatex} from '../ui/latex-scan.js';

const fixture=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8');
const cases=[
  'Price $3,685 is not a formula.',
  'Inline $x^2+y^2=z^2$ is valid.',
  'Broken $\\frac{x}{$ and valid \\(a+b\\).',
  '$$E=mc^2$$',
  '\\[\\frac{1}{2}\\]',
  '`$ignored$`',
  '<!-- $ignored$ \\(ignored\\) -->',
  '```js', '$not_math$', '```',
  '```latex', 'x_1 + y_1', '```',
].join('\n');
const baseline=findLatex(fixture);
assert.equal(baseline.filter(row=>row.kind==='独立').length,20,'baseline has twenty math fences');
assert.equal(baseline.filter(row=>row.detection==='inferred').length,22,
  'baseline has MinerU undelimited inline candidates');
assert(baseline.some(row=>row.kind==='行内' && row.content.includes('\\mathsf')),
  'MinerU inline math should not be missed');
const marked=findLatex(cases);
assert.equal(marked.length,6,'six valid/invalid delimited tokens should be scanned');
assert.deepEqual(marked.map(v=>v.kind),['行内','行内','行内','独立','独立','独立']);
assert(!marked.some(v=>v.content.includes('ignored')||v.content.includes('not_math')));
const badSyntax=findLatex('\\(a + b\n')[0];
assert(badSyntax.issue,'unterminated explicit LaTeX delimiter should be flagged');

const content=fixture+'\n\n'+cases+'\n';
const engines=[['Chrome',chromium,{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}],
 ['WebKit',webkit,{executablePath:homedir()+'/Library/Caches/ms-playwright/webkit-2359/pw_run.sh'}]];
const pause=t=>new Promise(r=>setTimeout(r,t));
mkdirSync('.v6/evidence',{recursive:true});
for(let i=0;i<engines.length;i++){
 const [name,engine,options]=engines[i];
 const path=resolve(`.v6/tests/latex-${process.pid}-${i}.md`);
 writeFileSync(path,content);
 const port=5620+i,url=`http://127.0.0.1:${port}/`;
 const server=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),stdio:'ignore',
  env:{...process.env,V6_PORT:String(port),V6_DOCUMENT_PATH:path,V6_STATIC_ROOT:resolve('dist')}});
 let browser;
 try{
  let healthy=false;
  for(let n=0;n<110;n++){
   try{if((await fetch(url+'healthz')).ok){healthy=true;break;}}catch{}await pause(100);
  }
  assert(healthy,'test server unavailable');
  browser=await engine.launch({headless:true,...options});
  const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:642}});
  const errors=[];page.on('pageerror',err=>errors.push(err.message));
  await page.route('**/*',route=>route.request().url().startsWith(url)?route.continue():route.abort());
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
  await page.locator('#module-select').selectOption('latex');
  await page.waitForFunction(()=>document.querySelectorAll('.ocr-latex-grid .ag-row').length>0,
    null,{timeout:25000});
  const snapshot=await page.evaluate(()=>({
    count:document.querySelectorAll('.ocr-latex-grid .ag-row').length,
    data:[...document.querySelectorAll('.ocr-latex-grid .ag-row')].map(r=>({
      text:r.textContent.slice(0,220),status:r.querySelector('.ocr-latex-status')?.dataset.status,
      katex:r.querySelectorAll('.katex').length,
    })),
    toolbar:document.querySelector('.module-actions[data-module="latex"]')?.hidden,
    groups:document.querySelectorAll('.dv-groupview').length,
  }));
  assert(snapshot.count>=10,'AG Grid must render formulas in its virtual viewport');
  assert((await page.locator('#status').textContent()).includes('LaTeX 48 项'),
    '20 display + 22 inferred inline + 6 synthetic formulas expected');
  assert((await page.locator('#status').textContent()).includes('待复核 22'),
    'undelimited candidates should be explicitly marked for review');
  assert.equal(snapshot.groups,3);
  assert.equal(snapshot.toolbar,false);
  assert(snapshot.data.filter(r=>r.katex>0).length>=10,'visible formulas should render with KaTeX');
  const statusHeader=page.locator('.ocr-latex-grid .ag-header-cell[col-id="status"]');
  await statusHeader.locator('.ag-header-cell-filter-button').click();
  const filter=page.locator('.ocr-enum-filter');
  await filter.locator('[data-filter-value="通过"] input').uncheck();
  await filter.locator('[data-filter-value="待复核"] input').uncheck();
  await page.waitForFunction(()=>document.querySelectorAll('.ocr-latex-grid .ag-row').length===1,
    null,{timeout:8000});
  assert((await page.locator('.ocr-latex-grid .ag-row').textContent()).includes('错误'));
  await filter.locator('[data-filter-value="all"] input').check();
  await page.waitForFunction(()=>document.querySelectorAll('.ocr-latex-grid .ag-row').length>=10,
    null,{timeout:8000});
  await statusHeader.locator('.ag-header-cell-filter-button').click();
  const methodHeader=page.locator('.ocr-latex-grid .ag-header-cell[col-id="syntax"]');
  await methodHeader.locator('.ag-header-cell-filter-button').click();
  assert.equal(await page.locator('.ocr-enum-filter [data-filter-value="未定界"]').count(),1,
    'inferred inline candidates must have a dedicated categorical filter');
  await methodHeader.locator('.ag-header-cell-filter-button').click();
  await page.locator('.ocr-latex-grid .ag-row[row-index="0"]').click();
  await page.waitForFunction(()=>document.querySelector('.ocr-markdown .ocr-outline-focused-element')!==null,
    null,{timeout:12000});
  await page.locator('#module-select').selectOption('media');
  assert((await page.locator('.ocr-media-grid .ag-row').count())>0);
  await page.locator('#module-select').selectOption('chapter-boundary');
  assert((await page.locator('.ocr-outline-checkbox').count())>0);
  await page.locator('#module-select').selectOption('latex');
  await page.screenshot({path:`.v6/evidence/latex-${name.toLowerCase()}.png`});
  assert.equal(readFileSync(path,'utf8'),content,'LaTeX review must never write CMD Markdown');
  assert.deepEqual(errors,[],name+' client errors');
  console.log('LATEX_BROWSER_PASS',name,JSON.stringify({math:48,display:20,inferred:22,errors:1,
    katex:true,statusFilter:true,focus:true,moduleIsolation:true}));
 }finally{await browser?.close();server.kill('SIGTERM');}
}
