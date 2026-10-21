import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,existsSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {homedir} from 'node:os';
import {chromium,webkit,devices} from 'playwright';

const root=process.cwd();
const lab=resolve('labs/cm-html');
const fixture=resolve('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md');
const productionDocument=resolve('.v6/workspace/buffetts-alpha.minerujson.md');
const releaseIndex=resolve('.v6/release/index.html');
const evidence=join(lab,'.runtime/evidence');
mkdirSync(evidence,{recursive:true});
const hash=file=>existsSync(file)
  ?createHash('sha256').update(readFileSync(file)).digest('hex'):null;
const baseline={
  fixture:hash(fixture),document:hash(productionDocument),release:hash(releaseIndex),
};
const engines=[
  ['Chrome',chromium,{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}],
  ['WebKit',webkit,{executablePath:homedir()+'/Library/Caches/ms-playwright/webkit-2359/pw_run.sh'}],
];
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let passed=0;
for(let index=0;index<engines.length;index++){
  const [name,engine,launch]=engines[index];
  if(process.env.V6_ONLY_CHROME&&name!=='Chrome')continue;
  if(process.env.V6_ONLY_WEBKIT&&name!=='WebKit')continue;
  const port=4412+index;
  const base=`http://127.0.0.1:${port}/labs/cm-html/`;
  const filename=`cm-html-browser-${name.toLowerCase()}-${process.pid}.md`;
  const path=join(lab,'.runtime',filename);
  const server=spawn('python3',['labs/cm-html/server.py'],{
    cwd:root,env:{...process.env,CMHTML_PORT:String(port),CMHTML_WORKFILE:filename},
    stdio:'ignore',
  });
  let browser;
  try {
    let ready=false;
    for(let t=0;t<130;t++){
      try{if((await fetch(base+'healthz')).ok){ready=true;break;}}catch{}
      await wait(120);
    }
    assert(ready,name+' isolated HTTP server not available');
    const rootWrite=await fetch(`http://127.0.0.1:${port}/api/document`,{
      method:'PUT',body:'MUST_NOT_WRITE',
      headers:{'Origin':`http://127.0.0.1:${port}`},
    });
    assert.equal(rootWrite.status,404,'Lab must not serve V6 root API');
    const forbiddenWrite=await fetch(base+'api/document',{
      method:'PUT',body:'MUST_NOT_WRITE',
      headers:{'Origin':`http://127.0.0.1:${port}`},
    });
    assert.equal(forbiddenWrite.status,403,'Lab must deny unauthenticated write');
    assert(!existsSync(path),'unauthorized write created a file');
    browser=await engine.launch({headless:true,...launch});
    const page=await browser.newPage({...devices['iPad Pro 11 landscape'],
      viewport:{width:1032,height:642}});
    const errors=[],rootApi=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('request',req=>{
      const pathname=new URL(req.url()).pathname;
      if(pathname.startsWith('/api/'))rootApi.push(pathname);
    });
    await page.route('**/*',route=>route.request().url().startsWith(`http://127.0.0.1:${port}`)
      ?route.continue():route.abort());
    await page.goto(base,{waitUntil:'domcontentloaded',timeout:35000});
    await page.waitForFunction(()=>window.__cmHtmlLab?.outline?.rows?.length===21 &&
      document.querySelector('#status')?.textContent?.includes('已加载'),
      null,{timeout:50000});
    const initial=await page.evaluate(()=>({
      rows:window.__cmHtmlLab.outline.rows.length,
      panels:document.querySelectorAll('.dv-groupview').length,
      buttons:[...document.querySelectorAll('header.toolbar button')].map(b=>b.id),
      length:window.__cmHtmlLab.view.state.doc.length,
      firstDisabled:document.querySelector('.ag-row[row-index="0"] .ocr-outline-checkbox')?.disabled,
      status:document.querySelector('#status').textContent,
      markers:window.__cmHtmlLab.view.state.doc.toString().includes('ocr2md:chapter'),
      fonts:document.fonts.check('16px "OCR2MD Sarasa"'),
    }));
    console.log('CM_HTML_INIT',name,JSON.stringify(initial));
    assert.equal(initial.rows,21);assert.equal(initial.panels,3);
    assert.deepEqual(initial.buttons,['undo','redo','save']);
    assert.equal(initial.firstDisabled,true);
    assert(initial.length>300000);
    assert.equal(initial.markers,false);
    assert.equal(initial.fonts,true);

    // A checkbox edit must select that heading and navigate both CM6 and AG,
    // even after its new metadata line shifts every subsequent source line.
    // Reproduce the reported 'jump back to row 0' on non-adjacent headings.
    for(const rowIndex of [9,13]){
      const target=await page.evaluate(index=>{
        const l=window.__cmHtmlLab,row=l.outline.rows[index];
        l.outline.api.ensureIndexVisible(l.outline.api.getRowNode(row.id).rowIndex,'middle');
        return {id:row.id,line:row.sourceLine};
      },rowIndex);
      const checkbox=page.locator(`.ag-row[row-id="${target.id}"] .ocr-outline-checkbox`);
      await checkbox.uncheck();
      await page.waitForFunction(({id})=>{
        const l=window.__cmHtmlLab;
        const focus=l.workspace.scrollSync?.currentSource;
        const selected=l.outline.api.getSelectedNodes()?.[0]?.id;
        const target=l.outline.rows.find(row=>row.id===id);
        const shared=l.workspace.scrollSync?.lastDriver;
        return target?.independent===false && selected===id &&
          Math.abs((focus?.sourceLine||0)-target.sourceLine)<=6 &&
          shared==='outline' &&
          l.view.state.doc.line(target.sourceLine-1).text.includes('ocr2md:chapter');
      },target,{timeout:20000});
      await wait(550); // document/preview asynchronous refresh must not steal the selection
      const after=await page.evaluate(id=>{
        const l=window.__cmHtmlLab,row=l.outline.rows.find(row=>row.id===id);
        return {selected:l.outline.api.getSelectedNodes()?.[0]?.id,
          source:l.workspace.scrollSync?.currentSource?.sourceLine,
          focus:l.workspace.scrollSync?.lastDriver,
          line:row.sourceLine,revision:l.revision,
          sharedFocus:document.querySelector('.cm-outline-focused-line')!==null};
      },target.id);
      console.log('CM_HTML_CHECKBOX_FOCUS',name,JSON.stringify(after));
      assert.equal(after.selected,target.id,'AG selection reverted after checkbox change');
      assert(Math.abs(after.source-after.line)<=6,'CM6 source jumped away from selected heading');
      assert(after.sharedFocus,'CM6 should highlight the focused heading');
      await page.screenshot({path:join(evidence,`cm-html-focus-${name.toLowerCase()}-${rowIndex}.png`)});
      await page.locator('#undo').click();
      await page.waitForFunction(id=>{
        const l=window.__cmHtmlLab,row=l.outline.rows.find(row=>row.id===id);
        return row?.independent===true &&
          !l.view.state.doc.toString().includes('ocr2md:chapter') &&
          l.outline.api.getSelectedNodes()?.[0]?.id===id;
      },target.id,{timeout:15000});
    }
    const second=page.locator('.ag-row[row-index="1"] .ocr-outline-checkbox');
    await second.uncheck();
    await page.waitForFunction(()=>{
      const l=window.__cmHtmlLab;
      return l.outline.rows[1]?.independent===false &&
        l.view.state.doc.line(l.outline.rows[1].sourceLine-1).text.includes('ocr2md:chapter:v1');
    },null,{timeout:30000});
    const comment=await page.evaluate(()=>{
      const l=window.__cmHtmlLab;const row=l.outline.rows[1];const d=l.view.state.doc;
      const marker=d.line(row.sourceLine-1);
      return {rowId:row.id,line:row.sourceLine,previous:marker.text,
        syntax:l.inspect(),previewText:document.querySelector('.ocr-markdown').textContent,
        editorSame:l.view===window.__cmHtmlLab.view};
    });
    console.log('CM_HTML_COMMENT',name,JSON.stringify({
      rowId:comment.rowId,line:comment.line,marker:comment.previous,syntax:comment.syntax}));
    assert.match(comment.previous,/^<!-- ocr2md:chapter:v1 /);
    assert.match(comment.previous,/independent="0"/);
    assert(comment.syntax?.syntax.some(node=>node==='CommentBlock'),
      name+' CM6 must recognize an HTML comment node');
    assert(!comment.syntax?.parts?.id,
      name+' comment contents should not become HTML attribute syntax nodes');
    assert(!comment.previewText.includes('ocr2md:chapter'));
    assert(comment.editorSame);

    await page.locator('#undo').click();
    await page.waitForFunction(()=>!window.__cmHtmlLab.view.state.doc.toString().includes('ocr2md:chapter') &&
      window.__cmHtmlLab.outline.rows[1]?.independent===true,
      null,{timeout:12000});
    await page.locator('#redo').click();
    await page.waitForFunction(()=>window.__cmHtmlLab.outline.rows[1]?.independent===false &&
      window.__cmHtmlLab.view.state.doc.toString().includes('ocr2md:chapter'),
      null,{timeout:12000});
    assert(!existsSync(path),'editing or history accidentally saved document');

    // Test the actual authorization dialog; no mainline login/cookie usage.
    await page.locator('#save').click();
    await page.waitForFunction(()=>document.querySelector('#unlock-dialog')?.open);
    const token=readFileSync(join(lab,'.runtime/private/save-token'),'utf8').trim();
    await page.locator('#unlock-code').fill(token.slice(0,12));
    await page.locator('#unlock-form button[type="submit"]').click();
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('实验已保存'),
      null,{timeout:15000});
    assert(existsSync(path),'isolated saved Markdown missing');
    assert.equal(readFileSync(path,'utf8'),await page.evaluate(()=>window.__cmHtmlLab.view.state.doc.toString()));
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.__cmHtmlLab?.outline?.rows?.[1]?.independent===false,
      null,{timeout:50000});
    assert.equal(await page.locator('.ag-row[row-index="1"] .ocr-outline-checkbox').isChecked(),false);
    console.log('CM_HTML_SAVE_REOPEN_COMMENT',name,'OK');

    // Convert the same marking into an HTML tag via a single CM6 change set.
    await page.locator('#marker-format').selectOption('tag');
    await page.waitForFunction(()=>{
      const l=window.__cmHtmlLab,row=l.outline.rows[1];
      return row?.independent===false &&
        l.view.state.doc.line(row.sourceLine-1).text.startsWith('<ocr2md-chapter');
    },
      null,{timeout:15000});
    const tagged=await page.evaluate(()=>{
      const l=window.__cmHtmlLab,row=l.outline.rows[1],doc=l.view.state.doc;
      return {
        marker:doc.line(row.sourceLine-1).text,
        syntax:l.inspect(),count:l.outline.rows.length,
        preview:document.querySelector('.ocr-markdown').textContent,
      };
    });
    console.log('CM_HTML_TAG',name,JSON.stringify({marker:tagged.marker,syntax:tagged.syntax}));
    assert.match(tagged.marker,/^<ocr2md-chapter data-id=/);
    assert(tagged.syntax?.syntax.some(node=>['HTMLTag','StartTag'].includes(node)),
      name+' CM6 must recognize an HTML tag');
    assert.equal(tagged.syntax?.parts?.element,'TagName',
      name+' CM6 HTML parser must recognize a tag name');
    assert.equal(tagged.syntax?.parts?.id,'AttributeName',
      name+' CM6 HTML parser must recognize the ID attribute');
    assert.equal(tagged.syntax?.parts?.independent,'AttributeName',
      name+' CM6 HTML parser must recognize the chapter attribute');
    assert.equal(tagged.count,21);
    assert(!tagged.preview.includes('ocr2md-chapter'),
      name+' rendered article must not display experiment tags');
    // A heading level edit must preserve its annotation and stable MinerU ID.
    await page.evaluate(()=>{
      const l=window.__cmHtmlLab,row=l.outline.rows[1],v=l.view;
      const line=v.state.doc.line(row.sourceLine);
      if(!line.text.startsWith('## '))throw Error('second heading unexpectedly changed');
      v.dispatch({changes:{from:line.from,to:line.from+2,insert:'###'},userEvent:'input'});
    });
    await page.waitForFunction(()=>window.__cmHtmlLab.outline.rows[1]?.level===3&&
      window.__cmHtmlLab.outline.rows[1]?.independent===false,
      null,{timeout:12000});
    await page.locator('#undo').click();
    await page.waitForFunction(()=>window.__cmHtmlLab.outline.rows[1]?.level===2&&
      window.__cmHtmlLab.outline.rows[1]?.independent===false,
      null,{timeout:12000});

    await page.locator('#save').click();
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('实验已保存'),
      null,{timeout:15000});
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.__cmHtmlLab?.outline?.rows?.[1]?.independent===false &&
      document.querySelector('#marker-format')?.value==='tag',null,{timeout:50000});
    assert.match(readFileSync(path,'utf8'),/<ocr2md-chapter /);
    assert.equal(await page.locator('.ag-row[row-index="1"] .ocr-outline-checkbox').isChecked(),false);
    assert.deepEqual(errors,[],name+' browser errors');
    assert.deepEqual(rootApi,[],name+' browser contacted production API');

    // Regression for real iPad report: quickly check several later headings
    // before a 160ms deferred AG refresh. A stale cell renderer must never
    // edit or navigate by an older sourceLine after a marker inserts a line.
    await page.locator('#marker-format').selectOption('comment');
    await page.evaluate(()=>{
      const l=window.__cmHtmlLab,api=l.outline.api;
      const target=l.outline.rows[5];
      api.ensureIndexVisible(api.getRowNode(target.id).rowIndex,'middle');
    });
    await page.waitForFunction(()=>[4,5,6,7].every(i=>{
      const row=window.__cmHtmlLab.outline.rows[i];
      return document.querySelector(`.ag-row[row-id="${row.id}"] .ocr-outline-checkbox`);
    }),null,{timeout:10000});
    const burst=await page.evaluate(()=>{
      const l=window.__cmHtmlLab,ids=l.outline.rows.slice(4,8).map(r=>r.id);
      const results=[];
      for(const id of ids){
        const input=document.querySelector(`.ag-row[row-id="${id}"] .ocr-outline-checkbox`);
        if(!input)throw Error('rapid checkbox disappeared for '+id);
        input.click();
        const row=l.outline.rows.find(r=>r.id===id),doc=l.view.state.doc;
        results.push({id,independent:row.independent,heading:doc.line(row.sourceLine).text,
          marker:doc.line(row.sourceLine-1).text,
          selected:l.outline.api.getSelectedNodes()?.[0]?.id,
          status:document.querySelector('#status').textContent});
      }
      return results;
    });
    for(const click of burst){
      assert.equal(click.independent,false,`rapid click failed on ${click.id}`);
      assert.equal(click.selected,click.id,`rapid click lost AG focus on ${click.id}`);
      assert.match(click.heading,/^#{1,6} /,`rapid click landed on a non-heading ${click.id}`);
      assert(click.marker.includes(`id="${click.id}"`) && click.marker.includes('independent="0"'),
        `rapid click wrote wrong marker for ${click.id}`);
      assert(!click.status.includes('Heading has moved'),`stale heading error on ${click.id}`);
    }
    await page.waitForTimeout(350);
    await page.waitForFunction(id=>{
      const l=window.__cmHtmlLab,row=l.outline.rows.find(x=>x.id===id);
      const pos=l.workspace.scrollSync?.currentSource?.sourceLine||0;
      return row?.independent===false &&
        l.outline.api.getSelectedNodes()?.[0]?.id===id &&
        Math.abs(pos-row.sourceLine)<=6;
    },burst.at(-1).id,{timeout:20000});
    assert.deepEqual(errors,[],name+' rapid check browser errors');
    console.log('CM_HTML_RAPID_CHECKBOX_PASS',name,JSON.stringify(burst.map(x=>({id:x.id,
      selected:x.selected,independent:x.independent}))));
    await page.screenshot({path:join(evidence,`cm-html-${name.toLowerCase()}.png`)});
    console.log('CM_HTML_LAB_PASS',name,JSON.stringify({
      originalHeadings:21,commentNode:comment.syntax.syntax,
      tagNode:tagged.syntax.syntax,saveAndReopen:'both',
      undoRedo:true,levelChange:true,sharedComponents:true,
      isolatedMainline:true,errors:errors.length,
    }));
    passed++;
  }finally{
    if(browser)await Promise.race([browser.close(),wait(10000)]);
    server.kill('SIGTERM');
    for(let n=0;n<40&&!server.killed;n++)await wait(50);
  }
}
assert(passed>0,'No browser engine tested');
assert.equal(hash(fixture),baseline.fixture,'Original MinerU Markdown fixture changed');
assert.equal(hash(productionDocument),baseline.document,'V6 main document changed');
assert.equal(hash(releaseIndex),baseline.release,'V6 main release changed');
console.log('CM_HTML_ISOLATION_PASS',JSON.stringify({fixture:baseline.fixture,
  mainDocument:baseline.document,mainRelease:baseline.release,engines:passed}));
