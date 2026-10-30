import {chromeExecutable,webkitExecutable} from './platform.test-helper.mjs';
import {selectModule} from './navigation-ui.test-helper.mjs';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {homedir} from 'node:os';
import {chromium,webkit,devices} from 'playwright';
import {findLatex} from '../ui/latex-scan.js';

const fixture=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8');
const columnSource=readFileSync('ui/latex-module.js','utf8')
  .split('const columns=[')[1]?.split('].map(c=>')[0];
assert(columnSource,'LaTeX column definitions missing');
assert.deepEqual([...columnSource.matchAll(/(?:field|colId):'([^']+)',headerName:'([^']+)'/g)]
  .map(m=>[m[1],m[2]]),[
    ['line','源码行'],['status','审阅'],['renderStatus','渲染'],
    ['preview','预览'],['content','源码'],['syntax','类型'],['error','错误信息'],
  ],'LaTeX AG column order must match user specification');
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
  '\\(unfinished',
].join('\n');
const baseline=findLatex(fixture);
assert.equal(baseline.filter(row=>row.kind==='独立').length,20,'baseline has twenty math fences');
assert.equal(baseline.filter(row=>row.detection==='inferred').length,22,
  'baseline has MinerU undelimited inline candidates');
assert(baseline.some(row=>row.kind==='行内' && row.content.includes('\\mathsf')),
  'MinerU inline math should not be missed');
const marked=findLatex(cases);
assert.equal(marked.length,7,'seven valid/invalid delimited tokens should be scanned');
assert.deepEqual(marked.map(v=>v.kind),['行内','行内','行内','独立','独立','独立','']);
assert(!marked.some(v=>v.content.includes('ignored')||v.content.includes('not_math')));
const badSyntax=findLatex('\\(a + b\n')[0];
assert(badSyntax.issue,'unterminated explicit LaTeX delimiter should be flagged');
const badDisplay=findLatex('$$\nx+y\n\ntext continues\n');
assert.equal(badDisplay.length,1,'unclosed standalone $$ must not vanish from review');
assert.equal(badDisplay[0].syntax,'$$');
assert.equal(badDisplay[0].issue,'缺少公式结束定界符');
assert.equal(badDisplay[0].content,'x+y\n\ntext continues');
assert.equal(findLatex('$$\nx+y\n$$')[0].issue,'','valid display math must not be flagged');
const line855=baseline.find(item=>item.content.includes('\\kern - delimiterspace'));
assert(line855?.detection==='inferred','the row 855 extracted fragment must be detected');

const content=fixture+'\n\n'+cases+'\n';
const engines=[['Chrome',chromium,{executablePath:chromeExecutable()}],
 ['WebKit',webkit,{executablePath:webkitExecutable()}]]
 .filter(([name])=>!process.env.OCR_WEBKIT_ONLY||name==='WebKit');
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
  await selectModule(page,'latex');
  await page.waitForFunction(()=>document.querySelectorAll('.ocr-latex-grid .ag-row').length>0,
    null,{timeout:25000});
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('LaTeX 49 项'),
    null,{timeout:25000});
  // The status counts identified formulas before KaTeX's visible AG cells
  // finish rendering. Await the real success condition before the existing
  // >=10 rendered-formulas assertion, without changing the expected count.
  await page.waitForFunction(()=>[...document.querySelectorAll('.ocr-latex-grid .ag-row')]
    .filter(row=>row.querySelectorAll('.katex').length>0).length>=10,
    null,{timeout:25000});
  // The seven user-defined columns, in order. The old independent/inline
  // "kind" column is not presented; "类型" reuses former recognition syntax.
  const leftHeaders=await page.locator('.ocr-latex-grid .ag-header-cell')
    .evaluateAll(nodes=>nodes.map(node=>({
      id:node.getAttribute('col-id'),
      label:node.querySelector('.ag-header-cell-text')?.textContent?.trim(),
    })));
  assert.equal(leftHeaders.find(h=>h.id==='line')?.label,'源码行');
  assert.equal(leftHeaders.find(h=>h.id==='status')?.label,'审阅');
  assert.equal(leftHeaders.find(h=>h.id==='renderStatus')?.label,'渲染');
  assert.equal(leftHeaders.find(h=>h.id==='preview')?.label,'预览');
  assert(!leftHeaders.some(h=>h.id==='kind'),'obsolete independent/inline column remains');
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
  assert((await page.locator('#status').textContent()).includes('LaTeX 49 项'),
    '20 display + 22 inferred inline + 7 synthetic formulas expected');
  assert((await page.locator('#status').textContent()).includes('待复核 49 / latex 0 / 忽略 0'),
    'all formulas start pending human review until annotated');
  assert((await page.locator('#status').textContent()).includes('渲染成功'),
    'KaTeX render counts must be independent from human review counts');
  assert.equal(snapshot.groups,3);
  assert.equal(snapshot.toolbar,false);
  assert(snapshot.data.filter(r=>r.katex>0).length>=10,'visible formulas should render with KaTeX');
  const statusHeader=page.locator('.ocr-latex-grid .ag-header-cell[col-id="status"]');
  await statusHeader.locator('.ag-header-cell-filter-button').click();
  const filter=page.locator('.ocr-enum-filter');
  assert.equal(await filter.locator('[data-filter-value="待复核"]').count(),1);
  await filter.locator('[data-filter-value="待复核"] input').uncheck();
  await page.waitForFunction(()=>document.querySelectorAll('.ocr-latex-grid .ag-row').length===0,
    null,{timeout:8000});
  await filter.locator('[data-filter-value="all"] input').check();
  await page.waitForFunction(()=>document.querySelectorAll('.ocr-latex-grid .ag-row').length>=10,
    null,{timeout:8000});
  await statusHeader.locator('.ag-header-cell-filter-button').click();
  // Filter actual KaTeX results independently of human audit. In particular,
  // line 855 has an inferred boundary AND a failing \kern expression.
  const renderHeader=page.locator('.ocr-latex-grid .ag-header-cell[col-id="renderStatus"]');
  await renderHeader.locator('.ag-header-cell-filter-button').click();
  const renders=page.locator('.ocr-enum-filter');
  for(const value of ['成功','未检测','失败'])
    assert.equal(await renders.locator(`[data-filter-value="${value}"]`).count(),1,
      'missing KaTeX render filter value '+value);
  await renders.locator('[data-filter-value="成功"] input').uncheck();
  await renders.locator('[data-filter-value="未检测"] input').uncheck();
  await page.waitForFunction(()=>document.querySelector('.ocr-latex-grid .ag-row')?.textContent.includes('失败'),
    null,{timeout:8000});
  const failures=await page.locator('.ocr-latex-grid .ag-row').allTextContents();
  assert(failures.some(text=>text.includes('\\kern - delimiterspace')),
    'row 855 must have a distinct KaTeX failure even while awaiting manual review');
  const row855=page.locator('.ocr-latex-grid .ag-row').filter({hasText:'\\kern - delimiterspace'}).first();
  assert.equal(await row855.locator('.ocr-latex-render-status').textContent(),'失败');
  await page.waitForFunction(()=>[...document.querySelectorAll('.ocr-latex-review-select')].some(el=>!el.disabled),
    null,{timeout:12000});
  assert.equal(await row855.locator('.ocr-latex-review-select').inputValue(),'待复核');
  assert.deepEqual(await row855.locator('.ocr-latex-review-select option').allTextContents(),
    ['待复核','latex','忽略']);
  await page.screenshot({path:`.v6/evidence/latex-render-fail-${name.toLowerCase()}.png`});
  await renders.locator('[data-filter-value="all"] input').check();
  await page.waitForFunction(()=>document.querySelectorAll('.ocr-latex-grid .ag-row').length>=10,
    null,{timeout:8000});
  await renderHeader.locator('.ag-header-cell-filter-button').click();
  // "类型" (formerly "识别方式") is now near the far right.
  await page.locator('.ocr-latex-grid .ag-body-horizontal-scroll-viewport')
    .evaluate(element=>{element.scrollLeft=element.scrollWidth;});
  const methodHeader=page.locator('.ocr-latex-grid .ag-header-cell[col-id="syntax"]');
  await methodHeader.waitFor();
  const rightHeaders=await page.locator('.ocr-latex-grid .ag-header-cell')
    .evaluateAll(nodes=>nodes.map(node=>({
      id:node.getAttribute('col-id'),
      label:node.querySelector('.ag-header-cell-text')?.textContent?.trim(),
    })));
  for(const [id,label] of [['content','源码'],['syntax','类型']])
    assert.equal(rightHeaders.find(h=>h.id===id)?.label,label,'unexpected LaTeX column '+id);
  assert(!rightHeaders.some(h=>h.id==='kind'));
  await methodHeader.locator('.ag-header-cell-filter-button').click();
  assert.equal(await page.locator('.ocr-enum-filter [data-filter-value="未定界"]').count(),1,
    'inferred inline candidates must have a dedicated categorical filter');
  await methodHeader.locator('.ag-header-cell-filter-button').click();
  await page.locator('.ocr-latex-grid .ag-row[row-index="0"]').click();
  await page.waitForFunction(()=>document.querySelector('.ocr-markdown .ocr-outline-focused-element')!==null,
    null,{timeout:12000});
  await selectModule(page,'media');
  assert((await page.locator('.ocr-media-grid .ag-row').count())>0);
  await selectModule(page,'chapter-boundary');
  // The new source pane / AG toolbar can narrow the iPad grid. AG Grid
  // virtualizes off-screen independent-column checkboxes; scroll the real
  // horizontal user viewport to prove the chapter-boundary control exists.
  await page.locator('.ocr-outline-grid .ag-body-horizontal-scroll-viewport').evaluate(el=>{
    el.scrollLeft=el.scrollWidth;
    el.dispatchEvent(new Event('scroll',{bubbles:true}));
  });
  await page.locator('.ocr-outline-grid .ag-header-cell[col-id="independent"]')
    .waitFor({state:'attached',timeout:18000});
  await page.locator('.ocr-outline-grid .ocr-outline-checkbox').first()
    .waitFor({state:'attached',timeout:18000});
  assert((await page.locator('.ocr-outline-grid .ag-row').count())>0,
    'Chapter boundary AG lost the independently marked heading rows');
  await selectModule(page,'latex');
  await page.screenshot({path:`.v6/evidence/latex-${name.toLowerCase()}.png`});
  assert.equal(readFileSync(path,'utf8'),content,'LaTeX review must never write CMD Markdown');
  assert.deepEqual(errors,[],name+' client errors');
  console.log('LATEX_BROWSER_PASS',name,JSON.stringify({math:49,display:20,inferred:22,
    row855:{render:'失败',review:'待复核'},renderFilter:true,
    katex:true,statusFilter:true,focus:true,moduleIsolation:true}));
 }finally{await browser?.close();server.kill('SIGTERM');}
}
