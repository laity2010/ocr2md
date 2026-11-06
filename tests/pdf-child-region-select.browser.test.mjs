/** Real PDF native child-region forward/reverse navigation with sealed CMD.
 * Original MinerU OCR and all original PDF bboxes remain immutable. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:net';
import {chromium,webkit} from 'playwright';
import {toMarkdown,toMineruJSON} from '../packages/minerujson-md/dist/index.js';

const raw=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8');
const original=toMarkdown(raw),lines=original.split('\n');
assert.equal(toMineruJSON(original),raw,'immutable original MinerU JSON must roundtrip byte-exact');
assert.equal((original.match(/<!-- cmd:block:v1 id="p\d+b\d+"/g)||[]).length,224);
assert.equal((original.match(/<!-- cmd:block:v1 id="p\d+b\d+s\d+"/g)||[]).length,43);
const scope=id=>{
  const anchor=lines.findIndex(line=>line.includes(`<!-- cmd:block:v1 id="${id}" -->`));
  assert(anchor>=0,`${id} original CMD child tag must already exist`);
  const next=lines.findIndex((line,i)=>i>anchor&&/^<!-- cmd:block:v1 id="p\d+b\d+/.test(line));
  const content=lines.findIndex((line,i)=>i>anchor&&(next<0||i<next)&&
    line.trim()&&!line.trim().startsWith('<!--'));
  assert(content>anchor,`${id} must own its own real OCR text or HTML`);
  return {anchor:anchor+1,content:content+1};
};
const tables=[
  {id:'p3b0',page:4,bbox:[68,89,538,458],parts:[
    {id:'p3b0s0',role:'caption',type:'table_caption'},
    {id:'p3b0s1',role:'body',type:'table_body'}]},
  {id:'p4b0',page:5,bbox:[50,89,521,339],parts:[
    {id:'p4b0s0',role:'caption',type:'table_caption'},
    {id:'p4b0s1',role:'body',type:'table_body'},
    {id:'p4b0s2',role:'note',type:'table_footnote'}]},
];
const folder=mkdtempSync(join(tmpdir(),'ocr2md-native-child-region-'));
const doc=join(folder,'document.md');writeFileSync(doc,original);
const port=await new Promise((ok,fail)=>{
  const socket=createServer();socket.once('error',fail);
  socket.listen(0,'127.0.0.1',()=>{const p=socket.address().port;
    socket.close(error=>error?fail(error):ok(p));});
});
const url=`http://127.0.0.1:${port}/`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1',
  '--port',String(port),'--strictPort'],{cwd:process.cwd(),stdio:'ignore',
  env:{...process.env,V6_DOCUMENT_PATH:doc,V6_SETTINGS_PATH:join(folder,'settings.json')}});
try{
  let ready=false;for(let i=0;i<300;i++){
    try{if((await fetch(url)).ok){ready=true;break;}}catch{}
    await new Promise(done=>setTimeout(done,120));
  }assert(ready,'isolated browser preview unavailable');
  for(const [name,engine,mobile] of [['Chrome',chromium,false],['iPad-WebKit',webkit,true]]){
    if(process.env.ONE_BROWSER&&process.env.ONE_BROWSER!==name)continue;
    const browser=await engine.launch({headless:true});
    try{
      const page=await browser.newPage({viewport:{width:1220,height:840},
        isMobile:mobile,hasTouch:mobile});
      const errors=[],forbidden=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.route('**/api/pdf-map',route=>{forbidden.push(route.request().url());
        return route.fulfill({status:503,body:'legacy map forbidden'});});
      await page.goto(url,{waitUntil:'domcontentloaded',timeout:50000});
      // PDF.js warms in parallel with the MD view. The TomSelect option is
      // correctly disabled during preheat; do not attempt a user click until
      // the actual PDF.js viewer reports readiness.
      await page.waitForFunction(()=>document.querySelector('.ocr-pdf-status')
        ?.textContent==='就绪',null,{timeout:95000});
      await page.locator('.ocr-preview-switchbar .ocr-navigation-preview .ts-control').click();
      await page.locator('.ocr-navigation-popup-preview:visible [data-value="pdf"]').click();
      await page.waitForFunction(()=>document.querySelectorAll('.ocr-pdf-block-cover').length===224,
        null,{timeout:50000});
      assert.equal(await page.locator('.ocr-pdf-mark-subblocks').count(),0,
        'a native PDF child click must NOT expose legacy automatic CMD structure writer');
      assert.equal(await page.locator('.ocr-pdf-block-cover > .ocr-pdf-block-ctrl input').count(),224,
        'one independent visual control per original MinerU parent, never per child');
      const observations=[];
      for(const table of tables){
        const cover=page.locator(`.ocr-pdf-block-cover[data-block-id="${table.id}"]`);
        await cover.scrollIntoViewIfNeeded({timeout:22000});
        await page.waitForFunction(id=>document.querySelector(`.ocr-pdf-block-cover[data-block-id="${id}"]`)
          ?.closest('.page')?.querySelector('canvas')?.width>0,table.id,{timeout:32000});
        const visual=await cover.evaluate(node=>{
          const paper=node.closest('.page').getBoundingClientRect();
          const parent=node.getBoundingClientRect();
          const scaled=b=>[(b.left-paper.left)/paper.width*594,(b.top-paper.top)/paper.height*783,
            (b.right-paper.left)/paper.width*594,(b.bottom-paper.top)/paper.height*783];
          const fragments=[...node.querySelectorAll(':scope > .ocr-pdf-block-fragment')];
          const chips=[node.querySelector(':scope > .ocr-pdf-block-ctrl'),
            ...node.querySelectorAll('.ocr-pdf-subblock-chip')].map(el=>{
              const r=el.getBoundingClientRect();return {id:el.textContent.trim(),
                top:r.top,bottom:r.bottom,visible:r.width>3&&r.height>3};
            });
          return {bbox:scaled(parent),parts:fragments.map(f=>({type:f.dataset.partType,
            role:f.dataset.partRole,id:f.dataset.subblockId,kind:f.querySelector('.ocr-pdf-subblock-chip')?.dataset.sourceKind,
            bbox:scaled(f.getBoundingClientRect())})),chips,
            parentKind:node.querySelector(':scope > .ocr-pdf-block-ctrl')?.dataset.sourceKind,
            parentCount:node.querySelectorAll(':scope > .ocr-pdf-block-ctrl input').length};
        });
        visual.bbox.forEach((v,i)=>assert(Math.abs(v-table.bbox[i])<3,
          `${name} ${table.id} original physical OCR bbox changed: ${visual.bbox}`));
        assert.equal(visual.parentCount,1);
        assert.deepEqual(visual.parts.map(x=>[x.id,x.type,x.role]),
          table.parts.map(x=>[x.id,x.type,x.role]),
          `${name} original PDF subregions differ from sealed OCR`);
        assert(visual.chips.every(c=>c.visible),`${name} all parent and native child labels visible`);
        for(let i=0;i<visual.chips.length;i++)for(let j=i+1;j<visual.chips.length;j++){
          const a=visual.chips[i],b=visual.chips[j];
          assert(a.bottom<=b.top-1||b.bottom<=a.top-1,
            `${name} ${table.id} labels overlap: ${a.id} vs ${b.id}`);
        }
        assert.deepEqual(visual.parts.map(x=>x.kind),table.parts.map(()=>'content'),
          `${name} real OCR text/HTML must never appear as a dashed empty child`);
        for(const [partIndex,part] of table.parts.entries()){
          const region=cover.locator(':scope > .ocr-pdf-block-fragment').nth(partIndex);
          const expected=scope(part.id);
          // A genuine native child chip must locate the same CMD atom as
          // clicking its original PDF.js canvas geometry.
          await region.locator('.ocr-pdf-subblock-chip').evaluate(el=>el.click());
          await page.waitForFunction(async line=>{
            const {viewStore}=await import('/view-store.js');
            return viewStore.getState().focusTarget?.sourceLine===line;
          },expected.content,{timeout:17000});
          const xy=await region.evaluate(el=>{const r=el.getBoundingClientRect();
            return {x:r.left+r.width/2,y:r.top+r.height/2};});
          await cover.evaluate((node,pt)=>node.closest('.page').querySelector('canvas')
            .dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:pt.x,clientY:pt.y})),xy);
          await page.waitForFunction(role=>document.querySelector('.ocr-pdf-region-overlay')
            ?.dataset.partRole===role,part.role,{timeout:18000});
          const focus=await page.evaluate(async()=>{
            const {viewStore}=await import('/view-store.js');return viewStore.getState().focusTarget;
          });
          assert.equal(focus?.sourceLine,expected.content,
            `${name} PDF ${part.id} canvas click did not focus its own CMD body`);
          const overlay=page.locator('.ocr-pdf-region-overlay');
          assert.equal(await overlay.getAttribute('data-part-index'),String(partIndex));
          assert.equal(await overlay.getAttribute('data-pdf-page'),String(table.page));
          const highlight=await overlay.boundingBox(),bbox=await region.boundingBox();
          assert(highlight&&bbox);
          assert(Math.abs(highlight.width-bbox.width)<3&&Math.abs(highlight.height-bbox.height)<3,
            `${name} PDF ${part.id} highlight differs from immutable OCR subregion`);
          // Reverse focus must retain the exact child identity, not silently
          // redirect its source to the enclosing parent frame. First navigate
          // AWAY to a different native child, so an old overlay cannot pass
          // the return assertion without a real source→PDF focus change.
          const other=table.parts[(partIndex+1)%table.parts.length];
          const otherLine=scope(other.id).content;
          await page.evaluate(async line=>{
            const {publishFocus}=await import('/view-store.js');
            publishFocus({sourceLine:line,origin:'source',intent:'click'});
          },otherLine);
          await page.waitForFunction(([role,index])=>{
            const selected=document.querySelector('.ocr-pdf-region-overlay');
            return selected?.dataset.partRole===role&&selected?.dataset.partIndex===String(index);
          },[other.role,(partIndex+1)%table.parts.length],{timeout:17000});
          await page.evaluate(async line=>{
            const {publishFocus}=await import('/view-store.js');
            publishFocus({sourceLine:line,origin:'source',intent:'click'});
          },expected.content);
          await page.waitForFunction(([role,index])=>{
            const selected=document.querySelector('.ocr-pdf-region-overlay');
            return selected?.dataset.partRole===role&&selected?.dataset.partIndex===String(index);
          },[part.role,partIndex],{timeout:17000});
          observations.push({id:part.id,content:expected.content,role:part.role,pdfPage:table.page});
        }
      }
      assert.equal(await page.evaluate(()=>window.__v6cm6.cm.readSource()),original,
        'PDF→CMD and CMD→PDF child navigation must never mutate the sealed source');
      assert.equal(readFileSync(doc,'utf8'),original,'real PDF child navigation cannot auto-save');
      assert.deepEqual(errors,[]);assert.deepEqual(forbidden,[]);
      console.log('PDF_CHILD_REGION_SELECT_PASS',name,{parents:224,children:43,
        tested:observations,sourceUnchanged:true,reverseChildExact:true});
    }finally{await browser.close();writeFileSync(doc,original);}
  }
}finally{server.kill('SIGTERM');rmSync(folder,{recursive:true,force:true});}
