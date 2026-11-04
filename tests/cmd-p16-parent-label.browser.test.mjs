/** Only enabled PDF structural gesture: p16b11 onto p16b10 child landing.
 * Actual Chrome/WebKit UI, disposable document, exact saved Markdown,
 * original PDF position, disappearance from PDF/AG and group highlighting.
 */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {chromium,webkit,devices} from 'playwright';
import {chromeExecutable} from './platform.test-helper.mjs';
import {selectPreview} from './navigation-ui.test-helper.mjs';
import {toMarkdown} from '../packages/minerujson-md/dist/index.js';
import {planCMDAbsorbReviewedParent,readCMDBlockChains} from '../ui/cmd-block-chains.js';

const raw=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8');
const original=toMarkdown(raw),plan=planCMDAbsorbReviewedParent(original,'p16b11','p16b10');
const expected=[...plan.edits].sort((a,b)=>b.from-a.from).reduce((s,e)=>{
  assert.equal(s.slice(e.from,e.to),e.expected);return s.slice(0,e.from)+e.insert+s.slice(e.to);
},original);
for(const id of ['p16b10','p16b10s0','p16b10s1']){
  assert.equal(readCMDBlockChains(expected).atoms.find(a=>a.id===id)?.rawLine,
    `<!-- cmd:block:v1 id="${id}" -->`);
}
assert(!expected.includes('<!-- cmd:block:v1 id="p16b11"'));
assert(!expected.includes('<!-- cmd:absorbed-parent:v1 origin="p16b11"'));
const dir=mkdtempSync(join(tmpdir(),'ocr2md-p16-label-check-'));
const doc=join(dir,'document.md'), token=join(dir,'token');
const port=await new Promise((ok,fail)=>{
  const s=createServer();s.once('error',fail);
  s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(e=>e?fail(e):ok(p));});
});
const base='http://127.0.0.1:'+port+'/';
const server=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),env:{...process.env,
  V6_PORT:String(port),V6_BIND:'127.0.0.1',V6_LAB_ID:'',V6_LAN_TLS_HOST:'',
  V6_DOCUMENT_PATH:doc,V6_PDF_PATH:resolve('.v6/workspace/buffetts-alpha.original.pdf'),
  V6_STATIC_ROOT:resolve('dist'),V6_SETTINGS_PATH:join(dir,'settings.json'),
  V6_TOKEN_PATH:token},stdio:'ignore'});
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
const center=r=>({clientX:r.x+r.width/2,clientY:r.y+r.height/2});
try{
  let ready=false;
  for(let i=0;i<185;i++){try{if((await fetch(base+'healthz')).ok){ready=true;break;}}catch{}await sleep(180);}
  assert(ready,'isolated OCR2MD server not ready');
  for(const [name,engine,binary] of [['Chrome',chromium,chromeExecutable()],['iPad-WebKit',webkit,webkit.executablePath()]]){
    if(process.env.ONE_BROWSER&&process.env.ONE_BROWSER!==name)continue;
    writeFileSync(doc,original);
    const browser=await engine.launch({headless:true,...(binary?{executablePath:binary}:{})});
    try{
      const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:900}});
      page.setDefaultTimeout(28000);
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      try{
        assert.equal((await page.goto(base,{waitUntil:'domcontentloaded',timeout:75000})).status(),200);
        await page.waitForFunction(()=>document.querySelector('.ocr-pdf-status')?.textContent==='就绪',null,{timeout:95000});
        await page.locator('#module-select').evaluate(el=>{el.value='text-block';el.dispatchEvent(new Event('change',{bubbles:true}));});
        await page.waitForFunction(n=>document.querySelector('#status')?.textContent?.includes('PBS '+n),
          readCMDBlockChains(original).atoms.length,{timeout:65000});
        await selectPreview(page,'pdf');
        console.log('GENERIC_B5_B6_READY',name);
        const from=page.locator('.ocr-pdf-block-cover[data-block-id="p16b11"] > .ocr-pdf-block-ctrl');
        const to=page.locator('.ocr-pdf-block-cover[data-block-id="p16b10"] > .ocr-pdf-block-ctrl');
        await from.waitFor({state:'attached',timeout:50000});
        await to.scrollIntoViewIfNeeded({timeout:35000});
        const fr=await from.boundingBox(),tr=await to.boundingBox();assert(fr&&tr);
        const oldCover=page.locator('.ocr-pdf-block-cover[data-block-id="p16b11"]');
        const old=await oldCover.boundingBox();
        const originalGeometry=await oldCover.evaluate(el=>({left:el.style.left,top:el.style.top,
          width:el.style.width,height:el.style.height,pdfPage:el.dataset.pdfPage}));
        const touch={bubbles:true,pointerId:345,pointerType:'touch',button:0,isPrimary:true};
        await from.dispatchEvent('pointerdown',{...touch,...center(fr)});
        await page.locator('.ocr-pdf-block-drag-source').waitFor({state:'attached',timeout:7500});
        const targetCover=page.locator('.ocr-pdf-block-cover[data-block-id="p16b10"]');
        const targetRect=await targetCover.boundingBox();assert(targetRect);
        await page.locator('body').dispatchEvent('pointermove',{...touch,...center(targetRect)});
        assert.equal(await targetCover.evaluate(el=>el.classList.contains('ocr-pdf-block-drop-target')),true);
        assert.equal(await targetCover.evaluate(el=>getComputedStyle(el).outlineWidth),'3px');
        const rail=page.locator('.ocr-pdf-block-drop-guide');
        await rail.waitFor({state:'attached',timeout:7500});
        assert((await page.locator('.ocr-pdf-status').textContent()).includes('p16b10'));
        const zr=await rail.locator('[data-placement="child"]').boundingBox();assert(zr);
        await page.locator('body').dispatchEvent('pointermove',{...touch,...center(zr)});
        await page.locator('body').dispatchEvent('pointerup',{...touch,...center(zr)});
        await page.waitForFunction(()=>
          !document.querySelector('.ocr-pdf-block-cover[data-block-id="p16b11"]')&&
          document.querySelector('.ocr-pdf-block-cover[data-block-id="p16b10s1"][data-origin-id="p16b11"]')&&
          document.querySelector('.ocr-pdf-block-fragment[data-subblock-id="p16b10s0"]'),
          null,{timeout:75000});
        const diagnostics=await page.evaluate(()=>{
          const result=[];
          for(const id of ['p16b10','p16b10s0','p16b10s1']){
            const parent=document.querySelector(`.ocr-pdf-block-cover[data-block-id="${id}"]`);
            const fragment=document.querySelector(`.ocr-pdf-block-fragment[data-subblock-id="${id}"]`);
            const node=parent||fragment;
            const chip=node?.querySelector(parent?':scope > .ocr-pdf-block-ctrl':':scope > .ocr-pdf-subblock-chip');
            if(!chip){result.push({id,missing:true});continue;}
            const r=chip.getBoundingClientRect(),point={x:(r.left+r.right)/2,y:(r.top+r.bottom)/2};
            const inside=document.elementsFromPoint(point.x,point.y).slice(0,10).map(el=>[el.className,el.textContent?.trim().slice(0,26)]);
            result.push({id,chip:chip.textContent,rect:{x:r.x,y:r.y,w:r.width,h:r.height},box:node.getBoundingClientRect().toJSON(),
              z:getComputedStyle(chip).zIndex,visible:chip.checkVisibility(),hit:inside});
          }
          return result;
        });
        console.log('P16_LABELS_GEOMETRY',name,JSON.stringify(diagnostics));
        const parentChip=diagnostics.find(x=>x.id==='p16b10');
        const bodyChipInfo=diagnostics.find(x=>x.id==='p16b10s0');
        assert(parentChip&&bodyChipInfo&&!parentChip.missing&&!bodyChipInfo.missing);
        assert(Math.abs(parentChip.rect.y-bodyChipInfo.rect.y)>=15,
          'parent p16b10 must have its own visible label row');
        assert(Math.abs(parentChip.rect.y-parentChip.box.y)<25,
          'parent label must stay near original Editor Note PDF bbox');
        assert(parentChip.hit[0]?.[1]==='p16b10',
          'parent chip must be the frontmost hit target');
        const overlaps=(a,b)=>a.rect.x<b.rect.x+b.rect.w&&b.rect.x<a.rect.x+a.rect.w&&
          a.rect.y<b.rect.y+b.rect.h&&b.rect.y<a.rect.y+a.rect.h;
        for(const other of diagnostics.filter(x=>x.id!=='p16b10'))
          assert(!overlaps(parentChip,other),'parent label physically overlaps '+other.id);
        assert.equal(parentChip.visible,true,'parent chip must be visible and actionable');
        await page.locator('.ocr-pdf-block-cover[data-block-id="p16b10"]').scrollIntoViewIfNeeded();
        await page.screenshot({path:'.v6/tests/visual-pbs/p16-editor-note-'+name+'.png',animations:'disabled'});
        const moved=await page.locator('.ocr-pdf-block-cover[data-block-id="p16b10s1"]').boundingBox();
        for(const key of ['x','y','width','height'])
          assert(Math.abs(old[key]-moved[key])<2,name+' PDF original bbox changed '+key+': '+old[key]+' → '+moved[key]);
        assert.equal(readFileSync(doc,'utf8'),original,'gesture must not autosave');
        const parent=page.locator('.ocr-pdf-block-cover[data-block-id="p16b10"]');
        await parent.locator(':scope > .ocr-pdf-block-ctrl').evaluate(el=>el.click());
        await page.waitForFunction(()=>{
          const a=document.querySelector('.ocr-pdf-block-cover[data-block-id="p16b10"]');
          const b=document.querySelector('.ocr-pdf-block-cover[data-block-id="p16b10s1"]');
          const body=document.querySelector('.ocr-pdf-block-fragment[data-subblock-id="p16b10s0"]');
          return a?.classList.contains('ocr-pdf-block-group-active')&&
            b?.classList.contains('ocr-pdf-block-group-active')&&
            body?.classList.contains('ocr-pdf-block-group-child');
        },null,{timeout:25000});
        // A DOM node with the right data-block-id is NOT a visual pass:
        // the user reads the chip text, which must show the exact same id.
        for(const id of ['p16b10','p16b10s1']){
          const chip=page.locator(`.ocr-pdf-block-cover[data-block-id="${id}"] > .ocr-pdf-block-ctrl span`);
          assert.equal(await chip.textContent(),id,`Visible PDF label must be ${id}`);
          assert(await chip.isVisible(),`PDF label ${id} must actually be visible`);
        }
        const bodyChip=page.locator('.ocr-pdf-block-fragment[data-subblock-id="p16b10s0"] .ocr-pdf-subblock-chip');
        assert.equal(await bodyChip.textContent(),'p16b10s0');
        const former=await page.locator('.ocr-pdf-block-ctrl span').allTextContents();
        assert(!former.includes('p16b11'),'Old parent p16b11 must not survive as visible chip text');
        console.log('GENERIC_B5_B6_VISIBLE_LABELS',name,{parent:'p16b10',body:'p16b10s0',child:'p16b10s1',oldGone:true});
        console.log('GENERIC_B5_B6_HIGHLIGHT',name);
        if(process.env.OCR_PBS_VISUAL_CAPTURE){
          const locator=page.locator('.ocr-pdf-block-cover[data-block-id="p16b10s1"]');
          await locator.scrollIntoViewIfNeeded();
          const visible=await page.evaluate(()=>[...document.querySelectorAll(
            '.ocr-pdf-block-cover[data-block-id^="p16b"]')].filter(el=>
              /p16b[34]/.test(el.dataset.blockId)).map(el=>{
              const rect=el.getBoundingClientRect();const chip=el.querySelector(':scope > .ocr-pdf-block-ctrl');
              const cr=chip?.getBoundingClientRect();const style=chip?getComputedStyle(chip):null;
              return {id:el.dataset.blockId,origin:el.dataset.originId,
                label:chip?.textContent,cover:{x:rect.x,y:rect.y,w:rect.width,h:rect.height},
                chip:{x:cr?.x,y:cr?.y,w:cr?.width,h:cr?.height},
                display:style?.display,visibility:style?.visibility,opacity:style?.opacity};
            }));
          console.log('GENERIC_B5_B6_VISUAL_LAYOUT',name,JSON.stringify(visible));
          await page.screenshot({path:process.env.OCR_PBS_VISUAL_CAPTURE,animations:'disabled'});
        }
        await page.locator('#undo').evaluate(el=>el.click());
        await page.waitForFunction(()=>document.querySelector('.ocr-pdf-block-cover[data-block-id="p16b11"]')&&
          !document.querySelector('.ocr-pdf-block-cover[data-block-id="p16b10s1"]'),null,{timeout:60000});
        await page.locator('#redo').evaluate(el=>el.click());
        await page.waitForFunction(()=>!document.querySelector('.ocr-pdf-block-cover[data-block-id="p16b11"]')&&
          document.querySelector('.ocr-pdf-block-cover[data-block-id="p16b10s1"]'),null,{timeout:60000});
        await page.locator('#save').evaluate(el=>el.click());
        await page.waitForFunction(()=>document.querySelector('#unlock-dialog')?.open,null,{timeout:18000});
        await page.locator('#unlock-code').fill(readFileSync(token,'utf8').trim().slice(0,12));
        await page.locator('#unlock-form button[type=submit]').click();
        await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('已保存'),null,{timeout:35000});
        assert.equal(readFileSync(doc,'utf8'),expected,'browser saved source must equal expected exact bytes');
        // Reload from the saved id-only CMD: physical PDF aliases must be
        // reconstructed, not kept in a transient browser memory table.
        await page.reload({waitUntil:'domcontentloaded',timeout:75000});
        await page.waitForFunction(()=>document.querySelector('.ocr-pdf-status')?.textContent==='就绪',null,{timeout:95000});
        await page.locator('#module-select').evaluate(el=>{
          el.value='text-block';el.dispatchEvent(new Event('change',{bubbles:true}));
        });
        await selectPreview(page,'pdf');
        const surviving=page.locator('.ocr-pdf-block-cover[data-block-id="p16b10s1"][data-origin-id="p16b11"]');
        await surviving.waitFor({state:'attached',timeout:60000});
        assert.equal(await page.locator('.ocr-pdf-block-cover[data-block-id="p16b11"]').count(),0);
        const reloadedGeometry=await surviving.evaluate(el=>({left:el.style.left,top:el.style.top,
          width:el.style.width,height:el.style.height,pdfPage:el.dataset.pdfPage}));
        // Scrolling and zoom may differ after reload: compare coordinates
        // relative to the PDF page, not global browser-screen y offsets.
        assert.deepEqual(reloadedGeometry,originalGeometry,name+' reload changed original PDF bbox');
        await page.locator('.ocr-pdf-block-cover[data-block-id="p16b10"] > .ocr-pdf-block-ctrl')
          .evaluate(el=>el.click());
        assert.equal(await surviving.evaluate(el=>el.classList.contains('ocr-pdf-block-group-active')),true);
        assert.equal(await surviving.locator(':scope > .ocr-pdf-block-ctrl span').textContent(),'p16b10s1');
        assert.equal(await page.locator('.ocr-pdf-block-cover[data-block-id="p16b10"] > .ocr-pdf-block-ctrl span').textContent(),'p16b10');
        assert.equal(await page.locator('.ocr-pdf-block-fragment[data-subblock-id="p16b10s0"] .ocr-pdf-subblock-chip').textContent(),'p16b10s0');
        assert.equal(errors.length,0,'JavaScript errors: '+errors.join(';'));
        console.log('P1B5_INTO_P1B6_BROWSER_PASS',name,{oldParentGone:true,b4Parent:true,
          body:'p16b10s0',child:'p16b10s1',bboxUnchanged:true,groupHighlight:true,
          undo:true,redo:true,savedByteExact:true,noAutoSave:true,noAbsorbedMarker:true});
      }finally{await page.close();}
    }finally{await browser.close();}
  }
}finally{server.kill('SIGTERM');rmSync(dir,{recursive:true,force:true});}
