/** CMD PBS child-aware illegal-break UI: mark only obvious intra-child split,
 * show sibling seam as review-only AG row. Disposable doc and server.
 */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {chromium,webkit,devices} from 'playwright';
import {chromeExecutable} from './platform.test-helper.mjs';
import {toMarkdown} from '../packages/minerujson-md/dist/index.js';
import {readCMDBlockChains} from '../ui/cmd-block-chains.js';
const original=toMarkdown(readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8'));
const atoms=readCMDBlockChains(original).atoms;
const edits=[
  ['p4b0s0','The govern\nment announced a new policy.'],
  ['p4b0s1','We examined the latest'],
  ['p4b0s2','13F filing in detail.'],
].map(([id,text])=>{
  const index=atoms.findIndex(atom=>atom.id===id);
  assert(index>=0);
  const atom=atoms[index];return {from:atom.from+atom.rawLine.length,
    to:atoms[index+1]?.from??original.length,text:'\n\n'+text+'\n\n'};
});
const seeded=[...edits].sort((a,b)=>b.from-a.from).reduce((s,e)=>
  s.slice(0,e.from)+e.text+s.slice(e.to),original);
const dir=mkdtempSync(join(tmpdir(),'ocr2md-pbs-illegal-break-'));
const doc=join(dir,'document.md');writeFileSync(doc,seeded);
const tokenPath=join(dir,'token'),authToken='pbs-illegal-break-test-token';
writeFileSync(tokenPath,authToken);
const port=await new Promise((ok,bad)=>{const socket=createServer();socket.once('error',bad);
  socket.listen(0,'127.0.0.1',()=>{const n=socket.address().port;socket.close(e=>e?bad(e):ok(n));});});
const base='http://127.0.0.1:'+port+'/';
const server=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),env:{...process.env,
  V6_PORT:String(port),V6_BIND:'127.0.0.1',V6_LAN_TLS_HOST:'',V6_LAB_ID:'',
  V6_DOCUMENT_PATH:doc,V6_PDF_PATH:resolve('.v6/workspace/buffetts-alpha.original.pdf'),
  V6_STATIC_ROOT:resolve('dist'),V6_SETTINGS_PATH:join(dir,'settings.json'),
  V6_TOKEN_PATH:tokenPath},stdio:'ignore'});
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
try{
  let ready=false;for(let i=0;i<200;i++){
    try{if((await fetch(base+'healthz')).ok){ready=true;break;}}catch{}
    await sleep(160);
  }
  assert(ready,'isolated OCR2MD service unavailable');
  for(const [name,engine,binary] of [['Chrome',chromium,chromeExecutable()],
    ['iPad-WebKit',webkit,webkit.executablePath()]]){
    if(process.env.ONE_BROWSER&&process.env.ONE_BROWSER!==name)continue;
    writeFileSync(doc,seeded);
    const browser=await engine.launch({headless:true,...(binary?{executablePath:binary}:{})});
    try{
      const page=await browser.newPage({...devices['iPad Pro 11 landscape'],
        viewport:{width:1280,height:950}});
      page.setDefaultTimeout(30000);
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      try{
        await page.context().addCookies([{name:'v6edit',value:authToken,domain:'127.0.0.1',path:'/'}]);
        assert.equal((await page.goto(base,{waitUntil:'domcontentloaded',timeout:90000})).status(),200);
        await page.locator('#editor .cm-content').waitFor({state:'visible',timeout:100000});
        await page.locator('#module-select').evaluate(el=>{
          el.value='illegal-break';el.dispatchEvent(new Event('change',{bubbles:true}));
        });
        const grid=page.locator('.ocr-illegal-break-grid');
        try{
          await page.waitForFunction(()=>document.querySelectorAll('.ocr-illegal-break-grid .ag-row').length===2,
            null,{timeout:95000});
        }catch(error){
          console.error('PBS_LINEBREAK_BROWSER_DIAG',name,await page.evaluate(()=>({
            status:document.querySelector('#status')?.textContent,
            table:document.querySelector('.ocr-illegal-break-state')?.textContent,
            rows:[...document.querySelectorAll('.ocr-illegal-break-grid .ag-row')].map(el=>el.textContent.slice(0,160)),
            markCount:(document.querySelector('#editor .cm-content')?.textContent.match(/ocr2md:illegal-break/g)||[]).length
          })));
          throw error;
        }
        const rows=await grid.locator('.ag-row').evaluateAll(nodes=>nodes.map(node=>{
          const cell=id=>node.querySelector(`.ag-cell[col-id="${id}"]`)?.textContent.trim();
          return {block:cell('blockId'),next:cell('nextBlockId'),joined:cell('joined'),
            status:cell('markState'),scope:cell('scopeLabel')};
        }));
        rows.sort((a,b)=>a.joined.localeCompare(b.joined));
        assert.deepEqual(rows,[
          {block:'p4b0s0',next:'',joined:'government',status:'已标定',scope:'子块内'},
          {block:'p4b0s1',next:'p4b0s2',joined:'latest 13F',status:'待复核',scope:'子块交界'}
        ]);
        const global=await page.locator('#status').textContent();
        assert(global.includes('待复核 1'),name+' global Shell review summary missing');
        // CM6 virtualizes distant source lines. An AG "已标定" row is
        // projected from real CMD annotations, then clicking its line must
        // bring the actual marked source into the rendered CM6 viewport.
        await grid.locator('.ag-row').filter({hasText:'已标定'})
          .locator('.ocr-illegal-break-jump').click();
        await page.waitForFunction(()=>document.querySelector('#editor .cm-content')?.textContent.includes('ocr2md:illegal-break'),null,{timeout:16000});
        assert.equal(readFileSync(doc,'utf8'),seeded,'review did not autosave document');
        if(process.env.OCR_PBS_BREAK_SCREENSHOTS){
          mkdirSync(process.env.OCR_PBS_BREAK_SCREENSHOTS,{recursive:true});
          await page.screenshot({path:resolve(process.env.OCR_PBS_BREAK_SCREENSHOTS,
            `illegal-break-pbs-${name}.png`),animations:'disabled'});
        }
        const candidate=grid.locator('.ag-row').filter({has:page.locator('.ag-cell[col-id="markState"]:text("待复核")')});
        await candidate.locator('.ocr-illegal-break-jump').click();
        assert.equal(await grid.locator('.ag-row').count(),2);
        // Only the confirmed intra-child tag persists. On reload, the current
        // PBS document recomputes the sibling seam as review-only, without a
        // shadow sidecar or an extra annotation in the saved Markdown.
        await page.locator('#save').click();
        for(let n=0;n<100&&readFileSync(doc,'utf8').split('<!--ocr2md:illegal-break').length-1!==1;n++)
          await sleep(100);
        assert.equal(readFileSync(doc,'utf8').split('<!--ocr2md:illegal-break').length-1,1);
        await page.reload({waitUntil:'domcontentloaded'});
        await page.locator('#editor .cm-content').waitFor({state:'visible',timeout:70000});
        await page.locator('#module-select').evaluate(el=>{
          el.value='illegal-break';el.dispatchEvent(new Event('change',{bubbles:true}));
        });
        await page.waitForFunction(()=>{
          const rows=[...document.querySelectorAll('.ocr-illegal-break-grid .ag-row')];
          return rows.length===2&&rows.some(row=>row.textContent.includes('latest 13F')&&
            row.textContent.includes('待复核'));
        },null,{timeout:90000});
        assert.equal(readFileSync(doc,'utf8').split('<!--ocr2md:illegal-break').length-1,1,
          'review-only sibling seam must not be auto-marked on reload');
        assert.deepEqual(errors,[]);
        console.log('PBS_ILLEGAL_BREAK_BROWSER_PASS',name,'auto=1 review=1, one persisted mark; seam restored after reload');
      }finally{await page.close();}
    }finally{await browser.close();}
  }
}finally{server.kill('SIGTERM');rmSync(dir,{recursive:true,force:true});}
