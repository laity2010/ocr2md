/** Text -> display LaTeX -> text: two independent AG A/B rows. Both PDF
 * native-child bboxes and Markdown source scopes remain focused. Isolated
 * disposable CMD file and the committed Buffett PDF fixture only. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {chromium,webkit,devices} from 'playwright';
import {chromeExecutable} from './platform.test-helper.mjs';
import {selectPreview} from './navigation-ui.test-helper.mjs';
import {buildIllegalBreakLatexSequence} from './fixtures/illegal-break-latex-sequence.mjs';
const seeded=buildIllegalBreakLatexSequence();
const dir=mkdtempSync(join(tmpdir(),'ocr2md-latex-boundary-'));
const doc=join(dir,'document.md'),tokenPath=join(dir,'token');
writeFileSync(doc,seeded);writeFileSync(tokenPath,'latex-review-test-token');
const port=await new Promise((ok,bad)=>{const server=createServer();server.once('error',bad);
  server.listen(0,'127.0.0.1',()=>{const n=server.address().port;server.close(e=>e?bad(e):ok(n));});});
const base=`http://127.0.0.1:${port}/`;
const server=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),env:{...process.env,
  V6_PORT:String(port),V6_BIND:'127.0.0.1',V6_LAN_TLS_HOST:'',V6_LAB_ID:'',
  V6_DOCUMENT_PATH:doc,V6_PDF_PATH:resolve('.v6/workspace/buffetts-alpha.original.pdf'),
  V6_STATIC_ROOT:resolve('dist'),V6_SETTINGS_PATH:join(dir,'settings.json'),
  V6_TOKEN_PATH:tokenPath},stdio:'ignore'});
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
const inspectAG=page=>page.locator('.ocr-illegal-break-grid .ag-row').evaluateAll(nodes=>nodes.map(node=>{
  const cell=id=>node.querySelector(`.ag-cell[col-id="${id}"]`)?.textContent.trim()||'';
  return {a:cell('beforeBlockId'),b:cell('afterBlockId'),type:cell('joined'),
    reason:cell('reason'),status:node.querySelector('.ocr-illegal-break-review-select')?.value||'',scope:cell('scopeLabel')};
}));
async function filterCurrentP4(page){
  await page.locator('.ocr-illegal-break-grid .ag-header-cell[col-id="blockId"] .ag-header-cell-filter-button').click();
  const filter=page.locator('.ocr-enum-filter[aria-label="当前块 筛选"]:visible');
  await filter.waitFor();
  await filter.locator('[data-filter-value="all"] input').uncheck();
  await filter.locator('[data-filter-value="p4b0s0"] input').check();
  await filter.locator('[data-filter-value="p4b0s1"] input').check();
  await page.waitForFunction(()=>document.querySelectorAll('.ocr-illegal-break-grid .ag-row').length===2,
    null,{timeout:20000});
  await page.locator('.ocr-illegal-break-grid .ag-header-cell[col-id="line"]').click();
}
const rowFor=(page,value)=>page.locator('.ocr-illegal-break-grid .ag-row').filter({
  has:page.locator(`.ag-cell[col-id="joined"]:text-is("${value}")`)});
try{
  let listening=false;for(let i=0;i<220;i++){
    try{if((await fetch(base+'healthz')).ok){listening=true;break;}}catch{}
    await sleep(150);
  }
  assert(listening,'isolated OCR2MD server failed to start');
  for(const [name,engine,binary] of [['Chrome',chromium,chromeExecutable()],
    ['iPad-WebKit',webkit,webkit.executablePath()]]){
    if(process.env.ONE_BROWSER&&name!==process.env.ONE_BROWSER)continue;
    writeFileSync(doc,seeded);
    const browser=await engine.launch({headless:true,...(binary?{executablePath:binary}:{})});
    try{
      const page=await browser.newPage({...devices['iPad Pro 11 landscape'],
        viewport:{width:1280,height:950}});
      page.setDefaultTimeout(30000);
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      try{
        await page.context().addCookies([{name:'v6edit',value:'latex-review-test-token',domain:'127.0.0.1',path:'/'}]);
        assert.equal((await page.goto(base,{waitUntil:'domcontentloaded',timeout:85000})).status(),200);
        await page.locator('#editor .cm-content').waitFor({state:'visible',timeout:85000});
        const activate=()=>page.locator('#module-select').evaluate(el=>{
          el.value='illegal-break';el.dispatchEvent(new Event('change',{bubbles:true}));
        });
        await activate();
        await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('待复核'),
          null,{timeout:80000});
        await filterCurrentP4(page);
        assert.deepEqual(await inspectAG(page),[
          {a:'p4b0s0',b:'p4b0s1',type:'文本 → LaTeX',
            reason:'公式交界疑似断行：文本 → LaTeX',status:'待定',scope:'LaTeX交界'},
          {a:'p4b0s1',b:'p4b0s2',type:'LaTeX → 文本',
            reason:'公式交界疑似断行：LaTeX → 文本',status:'待定',scope:'LaTeX交界'},
        ]);
        await page.waitForFunction(()=>!document.querySelector('.ocr-preview-mode option[value="pdf"]')?.disabled,
          null,{timeout:55000});
        const cases=[
          {value:'文本 → LaTeX',a:'p4b0s0',b:'p4b0s1',mdA:'portfolio changes',mdB:'L'},
          {value:'LaTeX → 文本',a:'p4b0s1',b:'p4b0s2',mdA:'L',mdB:'where the leverage'},
        ];
        await selectPreview(page,'pdf');
        for(const c of cases){
          await rowFor(page,c.value).locator('.ocr-illegal-break-jump').click();
          try{await page.waitForFunction(([a,b])=>{
            const overlays=[...document.querySelectorAll('.ocr-pdf-pair-overlay')];
            return overlays.length===2&&overlays[0].dataset.pbsId===a&&
              overlays[1].dataset.pbsId===b;
          },[c.a,c.b],{timeout:24000});}
          catch(error){console.error('LATEX_PDF_PAIR_DIAG',name,c,
            await page.locator('#status').textContent());throw error;}
          const boxes=await page.locator('.ocr-pdf-pair-overlay').evaluateAll(els=>els.map(e=>({
            id:e.dataset.pbsId,part:[e.style.left,e.style.top,e.style.width,e.style.height].join('|')
          })));
          assert.notEqual(boxes[0].part,boxes[1].part,
            'A/B must follow distinct physical native child rectangles');
          console.log('LATEX_PDF_AB_PASS',name,c.value,c.a,c.b);
        }
        await selectPreview(page,'md');
        for(const c of cases){
          await rowFor(page,c.value).locator('.ocr-illegal-break-jump').click();
          await page.waitForFunction(()=>
            document.querySelectorAll('.ocr-markdown .ocr-illegal-break-md-before').length>0&&
            document.querySelectorAll('.ocr-markdown .ocr-illegal-break-md-after').length>0,
            null,{timeout:26000});
          const parts=await page.evaluate(()=>({
            before:[...document.querySelectorAll('.ocr-markdown .ocr-illegal-break-md-before')]
              .map(el=>el.textContent).join(' '),
            after:[...document.querySelectorAll('.ocr-markdown .ocr-illegal-break-md-after')]
              .map(el=>el.textContent).join(' '),
          }));
          assert(parts.before.includes(c.mdA),`${c.value} Markdown A: ${parts.before.slice(0,230)}`);
          assert(parts.after.includes(c.mdB),`${c.value} Markdown B: ${parts.after.slice(0,230)}`);
          console.log('LATEX_MD_AB_PASS',name,c.value);
          if(process.env.OCR_LATEX_BOUNDARY_SCREENSHOTS){
            mkdirSync(process.env.OCR_LATEX_BOUNDARY_SCREENSHOTS,{recursive:true});
            await page.screenshot({path:resolve(process.env.OCR_LATEX_BOUNDARY_SCREENSHOTS,
              `latex-${name}-${c.value==='文本 → LaTeX'?'text-math':'math-text'}.png`),animations:'disabled'});
          }
        }
        assert.equal((await inspectAG(page)).length,2);
        assert.equal(readFileSync(doc,'utf8'),seeded,'AG selection must not save or edit sole CMD source');
        // Independent manual decisions on two edges of the SAME formula B.
        // The additional comments must not become part of its LaTeX evidence
        // or change the stable review identity after Worker re-scanning.
        const choose=async(value,decision)=>{
          await rowFor(page,value).locator('.ocr-illegal-break-review-select')
            .selectOption({label:decision});
          await page.waitForFunction(([value,decision])=>[...document.querySelectorAll('.ocr-illegal-break-grid .ag-row')]
            .some(r=>r.querySelector('.ag-cell[col-id="joined"]')?.textContent.trim()===value&&
              r.querySelector('.ocr-illegal-break-review-select')?.value===decision),
            [value,decision],{timeout:75000});
        };
        await choose('文本 → LaTeX','断行合并');
        await choose('LaTeX → 文本','忽略');
        await page.locator('#save').click();
        for(let k=0;k<90&&readFileSync(doc,'utf8').split('<!--ocr2md:illegal-break-review').length-1!==2;k++)
          await sleep(120);
        const saved=readFileSync(doc,'utf8');
        assert.equal(saved.split('<!--ocr2md:illegal-break-review').length-1,2);
        assert.equal(saved.replace(/<!--ocr2md:illegal-break-review[^\n]*-->\n/g,''),seeded,
          'two review decisions must not edit text or formula');
        await page.reload({waitUntil:'domcontentloaded'});
        await page.locator('#editor .cm-content').waitFor({state:'visible',timeout:80000});
        await activate();
        await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('待复核'),
          null,{timeout:85000});
        await filterCurrentP4(page);
        assert.deepEqual((await inspectAG(page)).map(row=>[row.a,row.b]),[
          ['p4b0s0','p4b0s1'],['p4b0s1','p4b0s2']]);
        assert.equal(await rowFor(page,'文本 → LaTeX').locator('.ocr-illegal-break-review-select').inputValue(),'断行合并');
        assert.equal(await rowFor(page,'LaTeX → 文本').locator('.ocr-illegal-break-review-select').inputValue(),'忽略');
        assert.deepEqual(errors,[]);
        console.log('LATEX_TWO_BOUNDARIES_BROWSER_PASS',name,'two distinct A/B rows, PDF and MD, reload, read-only');
      }finally{await page.close();}
    }finally{await browser.close();}
  }
}finally{server.kill('SIGTERM');rmSync(dir,{recursive:true,force:true});}
