/** CM6's source ID gutter reflects the SAME CMD label/state as the PDF pane. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium,webkit} from 'playwright';
import {planCMDSubblockAnnotations} from '../ui/cmd-text-blocks.js';

const original=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8');
const plan=await planCMDSubblockAnnotations(original);
const annotated=[...plan.edits].sort((a,b)=>b.from-a.from)
  .reduce((s,e)=>s.slice(0,e.from)+e.insert+s.slice(e.to),original);
const work=mkdtempSync(join(tmpdir(),'ocr2md-cmd-labels-'));
const fixture=join(work,'document.md');writeFileSync(fixture,original);
const port=5964,url=`http://127.0.0.1:${port}/`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1',
  '--port',String(port),'--strictPort'],{cwd:process.cwd(),stdio:['ignore','pipe','pipe'],
  env:{...process.env,V6_DOCUMENT_PATH:fixture,V6_SETTINGS_PATH:join(work,'settings.json')}});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const jump=async(page,id)=>{
  const line=await page.evaluate(id=>{
    const v=window.__v6cm6.view;
    const pattern=id.includes('s')?new RegExp('id="'+id+'"'):
      new RegExp('<!-- minerujson:block:v1:'+id.slice(1).replace('b',':')+' -->');
    const lines=v.state.doc.toString().split('\n');
    const index=lines.findIndex(line=>pattern.test(line));
    if(index<0)throw Error('Missing CMD anchor '+id);
    v.dispatch({selection:{anchor:v.state.doc.line(index+1).from},scrollIntoView:true});
    return index+1;
  },id);
  await page.locator(`.ocr-cmd-block-id[data-source-id="${id}"]`).waitFor({state:'visible',timeout:24000});
  return line;
};
try{
  let ready=false;
  for(let i=0;i<240;i++){
    try{if((await fetch(url)).ok){ready=true;break;}}catch{}
    await delay(140);
  }
  assert(ready,'Isolated CMD source label server unavailable');
  for(const [name,engine,mobile] of [['Chrome',chromium,false],['iPad-WebKit',webkit,true]]){
    if(process.env.ONE_BROWSER&&process.env.ONE_BROWSER!==name)continue;
    const browser=await engine.launch({headless:true});
    try{
      const page=await browser.newPage({viewport:{width:1220,height:840},isMobile:mobile,hasTouch:mobile});
      const errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.goto(url,{waitUntil:'domcontentloaded',timeout:50000});
      await page.waitForFunction(()=>Boolean(window.__v6cm6?.view),null,{timeout:40000});
      await page.waitForFunction(()=>document.querySelectorAll('.ocr-pdf-block-cover').length===224,
        null,{timeout:35000});
      assert.equal(await page.locator('.ocr-cm-source .ocr-cmd-block-id-gutter').count(),1);
      let line=await jump(page,'p4b0');
      const tag=page.locator('.ocr-cmd-block-id[data-source-id="p4b0"]');
      assert.equal(await tag.innerText(),'p4b0');
      assert.deepEqual(await tag.evaluate(el=>({kind:el.dataset.sourceKind,border:getComputedStyle(el).borderTopStyle})),
        {kind:'structure',border:'dashed'});
      const pdfTag=page.locator('.ocr-pdf-block-cover[data-block-id="p4b0"] > .ocr-pdf-block-ctrl');
      assert.deepEqual(await pdfTag.evaluate(el=>({kind:el.dataset.sourceKind,border:getComputedStyle(el).borderTopStyle})),
        {kind:'structure',border:'dashed'});
      await tag.evaluate(el=>el.click());
      await page.waitForFunction(async expected=>{
        const {viewStore}=await import('/view-store.js');
        const focus=viewStore.getState().focusTarget;
        return focus?.origin==='cm6'&&focus?.intent==='click'&&
          focus?.elementId==='mineru:4:0:parent'&&focus?.sourceLine===expected;
      },line,{timeout:9000});
      assert.equal(await page.evaluate(()=>window.__v6cm6.view.state.doc.toString()),original,
        'view-only source label click must not modify original CMD');
      // A CMD change immediately reprojects source and PDF labels; no stale
      // duplicate tag model is allowed in either direction.
      await page.evaluate(src=>{
        const view=window.__v6cm6.view,doc=view.state.doc;
        view.dispatch({changes:{from:0,to:doc.length,insert:src}});
      },annotated);
      line=await jump(page,'p4b0s0');
      const child=page.locator('.ocr-cmd-block-id[data-source-id="p4b0s0"]');
      assert.equal(await child.innerText(),'p4b0s0');
      assert.deepEqual(await child.evaluate(el=>({kind:el.dataset.sourceKind,border:getComputedStyle(el).borderTopStyle})),
        {kind:'structure',border:'dashed'});
      const pdfChild=page.locator('.ocr-pdf-subblock-chip').filter({hasText:'p4b0s0'}).first();
      assert.equal(await pdfChild.getAttribute('data-source-kind'),'structure');
      await child.evaluate(el=>el.click());
      await page.waitForFunction(async expected=>{
        const {viewStore}=await import('/view-store.js');const focus=viewStore.getState().focusTarget;
        return focus?.elementId==='mineru:4:0:0'&&focus?.sourceLine===expected;
      },line,{timeout:10000});
      await page.evaluate(src=>{
        const view=window.__v6cm6.view,doc=view.state.doc;
        view.dispatch({changes:{from:0,to:doc.length,insert:src}});
      },original);
      await jump(page,'p2b9');
      // Use the actual PDF→CMD join command (not a raw source mutation),
      // so AG's async CMD inventory and the PDF chips receive the SAME update.
      await page.locator('.ocr-pdf-block-cover[data-block-id="p2b8"] .ocr-pdf-block-ctrl')
        .evaluate(el=>{for(let n=0;n<3;n++)el.click();});
      await page.waitForFunction(()=>document.querySelector(
        '.ocr-pdf-block-cover[data-block-id="p2b8"] input')?.checked===false,
        null,{timeout:25000});
      await page.waitForFunction(()=>document.querySelector(
        '.ocr-pdf-block-cover[data-block-id="p2b9"] > .ocr-pdf-block-ctrl span')
        ?.textContent==='p2b8',null,{timeout:25000});
      await jump(page,'p2b9');
      assert.equal(await page.locator('.ocr-cmd-block-id[data-source-id="p2b9"]').innerText(),'p2b8');
      assert.equal(await page.locator('.ocr-pdf-block-cover[data-block-id="p2b9"] > .ocr-pdf-block-ctrl span').textContent(),'p2b8');
      assert.equal(errors.length,0,JSON.stringify(errors));
      console.log('CMD_SOURCE_BLOCK_GUTTER_PASS',name,{parents:224,children:43,dashed:'p4b0s0',logical:'p2b9→p2b8'});
    }finally{await browser.close();}
  }
}finally{
  server.kill('SIGTERM');rmSync(work,{recursive:true,force:true});
}
