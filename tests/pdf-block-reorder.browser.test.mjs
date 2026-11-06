/** PDF block reorder gate: real original 22-page parent before/after drop.
 * Verify fixed preview picker width during arrow updates, CMD single Undo,
 * original physical bbox/provenance, AG/PDF sync and zero disk autosaves.
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
import {toMarkdown,toMineruJSON} from '../packages/minerujson-md/dist/index.js';
import {readCMDBlockChains,planCMDReparentPBS,planCMDPromotePBSChild,
  planCMDInsertPBSParentAt} from '../ui/cmd-block-chains.js';
const json=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8');
const initial=toMarkdown(json);
const apply=(s,plan)=>[...plan.edits].sort((a,b)=>b.from-a.from).reduce((text,e)=>{
  assert.equal(text.slice(e.from,e.to),e.expected);
  return text.slice(0,e.from)+e.insert+text.slice(e.to);
},s);
const absorbed=apply(initial,planCMDReparentPBS(initial,'p1b3','p1b5'));
const promoted=apply(absorbed,planCMDPromotePBSChild(absorbed,'p1b5s1'));
const scenarios=[
  {name:'page-2-parent-after',src:initial,from:'p1b3',to:'p1b5',placement:'after'},
  {name:'page-2-parent-before',src:initial,from:'p1b5',to:'p1b3',placement:'before'}
];
const dir=mkdtempSync(join(tmpdir(),'ocr2md-pdf-block-reorder-modern-'));
const doc=join(dir,'document.md');writeFileSync(doc,initial);
const port=await new Promise((ok,fail)=>{const s=createServer();s.once('error',fail);
  s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(e=>e?fail(e):ok(p));});
});
const base='http://127.0.0.1:'+port+'/';
const server=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),
  env:{...process.env,V6_PORT:String(port),V6_BIND:'127.0.0.1',V6_LAB_ID:'',V6_LAN_TLS_HOST:'',
    V6_DOCUMENT_PATH:doc,V6_PDF_PATH:resolve('.v6/workspace/buffetts-alpha.original.pdf'),
    V6_STATIC_ROOT:resolve('dist'),V6_SETTINGS_PATH:join(dir,'settings.json'),
    V6_TOKEN_PATH:join(dir,'token')},stdio:'ignore'});
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
const center=r=>({clientX:r.x+r.width/2,clientY:r.y+r.height/2});
try{
  let ready=false;
  for(let i=0;i<210;i++){try{if((await fetch(base+'healthz')).ok){ready=true;break;}}catch{}
    await sleep(150);
  }
  assert(ready,'disposable PDF test server unavailable');
  for(const [name,engine,binary] of [['Chrome',chromium,chromeExecutable()],
    ['iPad-WebKit',webkit,webkit.executablePath()]]){
    if(process.env.ONE_BROWSER&&process.env.ONE_BROWSER!==name)continue;
    const browser=await engine.launch({headless:true,...(binary?{executablePath:binary}:{})});
    try{
      for(const c of scenarios){
        writeFileSync(doc,c.src);
        const plan=planCMDInsertPBSParentAt(c.src,c.from,c.to,c.placement);
        const next=apply(c.src,plan);
        assert.equal(toMineruJSON(next),json,c.name+' sealed source inverse');
        const fromAtom=readCMDBlockChains(c.src).atoms.find(x=>x.id===c.from);
        const expectedId=plan.newId||c.from;
        const page=await browser.newPage({...devices['iPad Pro 11 landscape'],
          viewport:{width:1032,height:900}});
        try{
          page.setDefaultTimeout(28000);
          const errors=[];page.on('pageerror',e=>errors.push(e.message));
          assert.equal((await page.goto(base,{waitUntil:'domcontentloaded',timeout:65000})).status(),200);
          await page.waitForFunction(()=>document.querySelector('.ocr-pdf-status')?.textContent==='就绪',
            null,{timeout:85000});
          await page.locator('#module-select').evaluate(el=>{
            el.value='text-block';el.dispatchEvent(new Event('change',{bubbles:true}));
          });
          await page.waitForFunction(n=>document.querySelector('#status')?.textContent?.includes('PBS '+n),
            readCMDBlockChains(c.src).atoms.length,{timeout:65000});
          await selectPreview(page,'pdf');
          const picker=page.locator('.ocr-preview-switchbar .ocr-navigation-preview');
          await picker.waitFor({state:'visible',timeout:15000});
          const width=async()=>Math.round((await picker.boundingBox())?.width*100)/100;
          const widths=[await width()];
          assert(Math.abs(widths[0]-155)<1,name+' picker must start 155px: '+widths[0]);
          const from=page.locator('.ocr-pdf-block-cover[data-block-id="'+c.from+'"] > .ocr-pdf-block-ctrl');
          const to=page.locator('.ocr-pdf-block-cover[data-block-id="'+c.to+'"] > .ocr-pdf-block-ctrl');
          const toCover=page.locator('.ocr-pdf-block-cover[data-block-id="'+c.to+'"]');
          await from.waitFor({state:'attached',timeout:45000});
          await to.scrollIntoViewIfNeeded({timeout:25000});
          const fr=await from.boundingBox(),tr=await toCover.boundingBox();assert(fr&&tr);
          const rootSelector='.ocr-pdf-block-cover[data-origin-id="'+fromAtom.origin+'"]';
          const oldStyle=await page.locator(rootSelector).getAttribute('style');
          const touch={bubbles:true,pointerId:1201,pointerType:'touch',button:0,isPrimary:true};
          await from.dispatchEvent('pointerdown',{...touch,...center(fr)});
          await page.locator('.ocr-pdf-block-drag-arrow').waitFor({state:'attached',timeout:7000});
          widths.push(await width());
          // Target acquisition must hit the original OCR cover, NEVER the
          // separate outboard ID chip; choose parent-only uncovered geometry.
          let hit=null;
          for(const fy of [.12,.28,.5,.72,.88]){
            for(const fx of [.12,.28,.5,.72,.88]){
              const point={clientX:tr.x+tr.width*fx,clientY:tr.y+tr.height*fy};
              await page.locator('body').dispatchEvent('pointermove',{...touch,...point});
              if(await toCover.evaluate(el=>el.classList.contains('ocr-pdf-block-drop-target'))){
                hit=point;break;
              }
            }
            if(hit)break;
          }
          assert(hit,name+' '+c.name+' no unambiguous original OCR parent bbox hit');
          await page.waitForFunction(id=>document.querySelector(
            '.ocr-pdf-block-cover[data-block-id="'+id+'"]')?.classList.contains('ocr-pdf-block-drop-target'),
            c.to,{timeout:7500});
          const rail=page.locator('.ocr-pdf-block-drop-guide');
          await rail.waitFor({state:'attached',timeout:7500});
          widths.push(await width());
          const opposite=rail.locator('[data-placement="'+(c.placement==='after'?'before':'after')+'"]');
          let zone=await opposite.boundingBox();assert(zone);
          await page.locator('body').dispatchEvent('pointermove',{...touch,...center(zone)});
          widths.push(await width());
          const targetZone=rail.locator('[data-placement="'+c.placement+'"]');
          zone=await targetZone.boundingBox();assert(zone);
          await page.locator('body').dispatchEvent('pointermove',{...touch,...center(zone)});
          widths.push(await width());
          assert(widths.every(v=>Math.abs(v-widths[0])<.75),
            name+' '+c.name+' preview dropdown width oscillated: '+widths);
          await page.locator('body').dispatchEvent('pointerup',{...touch,...center(zone)});
          await page.waitForFunction(([origin,id])=>
            document.querySelector('.ocr-pdf-block-cover[data-origin-id="'+origin+'"]')
              ?.dataset.blockId===id,[fromAtom.origin,expectedId],{timeout:65000});
          await page.waitForFunction(()=>document.querySelector('#status')?.textContent
            .includes('未保存，可 Undo'),null,{timeout:25000});
          assert.equal(await page.locator(rootSelector).getAttribute('style'),oldStyle,
            name+' '+c.name+' physical PDF bbox style must not move');
          assert.equal(await page.locator('.ocr-pdf-block-drag-arrow').count(),0);
          assert.equal(await page.locator('.ocr-pdf-block-drop-guide').count(),0);
          const rows=await page.evaluate(()=>({
            status:document.querySelector('#status')?.textContent,
            groups:[...document.querySelectorAll('.ocr-pdf-block-cover')]
              .filter(n=>n.dataset.originId==='p1b5'||n.dataset.originId==='p1b3s0')
              .map(n=>[n.dataset.blockId,n.dataset.originId])
          }));
          assert(rows.status.includes('未保存，可 Undo'),name+' '+c.name+' missing unsaved info');
          assert.equal(readFileSync(doc,'utf8'),c.src,name+' '+c.name+' autosaved source');
          await page.locator('#undo').evaluate(el=>el.click());
          await page.waitForFunction(([origin,id])=>
            document.querySelector('.ocr-pdf-block-cover[data-origin-id="'+origin+'"]')
              ?.dataset.blockId===id,[fromAtom.origin,c.from],{timeout:60000});
          assert.deepEqual(errors,[],name+' '+c.name+' browser errors');
          console.log('PDF_BLOCK_REORDER_BROWSER_PASS',name,c.name,
            {from:c.from,to:c.to,landing:c.placement,newId:expectedId,
              pickerWidths:widths,childrenPreserved:true,undo:true,noAutosave:true});
        }finally{await page.close();}
      }
    }finally{await browser.close();}
  }
}finally{server.kill('SIGTERM');rmSync(dir,{recursive:true,force:true});}
