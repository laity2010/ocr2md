/** Real two-way PDF ↔ CM6 native child-region contract on the sealed MinerU fixture.
 * No PDF click is allowed to insert a legacy child marker or write the disk.
 * Every original PDF rectangle and every CMD source position is checked.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:net';
import {chromium,webkit} from 'playwright';
import {toMarkdown,toMineruJSON} from '../packages/minerujson-md/dist/index.js';

const raw=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8');
const original=toMarkdown(raw);
const sourceLines=original.split('\n');
const anchorLine=id=>sourceLines.findIndex(line=>line.includes(`<!-- cmd:block:v1 id="${id}" -->`))+1;
const bodyLine=id=>{
  const anchor=anchorLine(id);
  assert(anchor>0,`original native CMD marker missing for ${id}`);
  const next=sourceLines.findIndex((line,index)=>index>=anchor&&/^<!-- cmd:block:v1 id="p\d+b\d+/.test(line));
  const first=sourceLines.findIndex((line,index)=>index>=anchor&&(next<0||index<next)&&
    line.trim()&&!line.trim().startsWith('<!--'));
  assert(first>=anchor,`native child must have its own readable text: ${id}`);
  return first+1;
};
const expected=[
  {parent:'p3b0',physicalPage:4,rect:[68,89,538,458],
    ids:['p3b0s0','p3b0s1'],roles:['caption','body']},
  {parent:'p4b0',physicalPage:5,rect:[50,89,521,339],
    ids:['p4b0s0','p4b0s1','p4b0s2'],roles:['caption','body','note']},
];
const temp=mkdtempSync(join(tmpdir(),'ocr2md-pdf-native-parts-'));
const doc=join(temp,'document.md');writeFileSync(doc,original);
// Independent audits may run other PDF regressions at the same time. A
// fixed Vite port can silently connect to another test's document instead
// of this sealed fixture, making PDF preheat and source evidence dishonest.
const port=await new Promise((resolve,reject)=>{
  const socket=createServer();socket.once('error',reject);
  socket.listen(0,'127.0.0.1',()=>{
    const value=socket.address().port;
    socket.close(error=>error?reject(error):resolve(value));
  });
});
const url=`http://127.0.0.1:${port}/`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1',
  '--port',String(port),'--strictPort'],{cwd:process.cwd(),stdio:'ignore',
  env:{...process.env,V6_DOCUMENT_PATH:doc,V6_SETTINGS_PATH:join(temp,'settings.json')}});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try{
  let ready=false;
  for(let i=0;i<250;i++){
    try{if((await fetch(url)).ok){ready=true;break;}}catch{}
    await sleep(130);
  }
  assert(ready,'isolated Vite server unavailable');
  for(const [name,engine,mobile] of [['Chrome',chromium,false],['iPad-WebKit',webkit,true]]){
    if(process.env.ONE_BROWSER&&process.env.ONE_BROWSER!==name)continue;
    const browser=await engine.launch({headless:true});
    try{
      const page=await browser.newPage({viewport:{width:1220,height:840},
        isMobile:mobile,hasTouch:mobile});
      const errors=[],forbidden=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.route('**/api/pdf-map',route=>{
        forbidden.push(route.request().url());return route.abort();
      });
      await page.goto(url,{waitUntil:'domcontentloaded',timeout:50000});
      await page.waitForFunction(()=>document.querySelector('.ocr-pdf-status')
        ?.textContent==='就绪',null,{timeout:105000});
      await page.locator('.ocr-preview-switchbar .ocr-navigation-preview .ts-control').click();
      await page.locator('.ocr-navigation-popup-preview:visible [data-value="pdf"]').click();
      await page.waitForFunction(()=>document.querySelectorAll('.ocr-pdf-block-cover').length===224,
        null,{timeout:42000});
      assert.equal(await page.locator('.ocr-pdf-mark-subblocks').count(),0,
        'PDF evidence must not expose the retired automatic child writer');
      assert.equal((original.match(/<!-- cmd:block:v1 id="p\d+b\d+"/g)||[]).length,224);
      assert.equal((original.match(/<!-- cmd:block:v1 id="p\d+b\d+s\d+"/g)||[]).length,43);
      assert.equal(toMineruJSON(original),raw,'sealed MinerU archive must roundtrip byte-for-byte');
      assert.equal(await page.evaluate(()=>window.__v6cm6.cm.readSource()),original,
        'PDF bootstrap must not insert automatic old child tags');
      // Parent provenance is a CMD scope classification, not inferred from
      // whether native child labels happen to exist. In the canonical sealed
      // source both p3b0 and p4b0 include valid native-child text: their
      // union parent is solid. The truly metadata-only p2b8 stays dashed.
      // No OCR failure reason is inferred from a dashed PDF outline.
      for(const [id,kind,stroke] of [
        ['p3b0','content','solid'],['p4b0','content','solid'],
        ['p2b8','structure','dashed'],['p13b0','content','solid']]){
        const info=await page.locator(
          `.ocr-pdf-block-cover[data-block-id="${id}"] > .ocr-pdf-block-ctrl`)
          .evaluate(node=>({kind:node.dataset.sourceKind,
            stroke:getComputedStyle(node).borderTopStyle}));
        assert.deepEqual(info,{kind,stroke},`${name} parent ${id} provenance mismatch`);
      }
      const observations=[];
      for(const group of expected){
        const parent=page.locator(`.ocr-pdf-block-cover[data-block-id="${group.parent}"]`);
        await parent.scrollIntoViewIfNeeded({timeout:24000});
        await page.waitForFunction(id=>document.querySelector(
          `.ocr-pdf-block-cover[data-block-id="${id}"]`)?.closest('.page')?.querySelector('canvas')?.width>0,
        group.parent,{timeout:29000});
        assert.equal(await parent.getAttribute('data-pdf-page'),String(group.physicalPage));
        assert.equal(await parent.locator(':scope > .ocr-pdf-block-ctrl input').count(),1,
          'native children must NOT mint independent original parent checkboxes');
        const rect=await parent.evaluate(node=>{
          const b=node.getBoundingClientRect(),p=node.closest('.page').getBoundingClientRect();
          return [(b.left-p.left)/p.width*594,(b.top-p.top)/p.height*783,
            (b.right-p.left)/p.width*594,(b.bottom-p.top)/p.height*783];
        });
        rect.forEach((actual,index)=>assert(Math.abs(actual-group.rect[index])<3,
          `${name} ${group.parent} physical PDF bbox coordinate ${index}: ${actual}`));
        const children=await parent.locator(':scope > .ocr-pdf-block-fragment').evaluateAll(nodes=>
          nodes.map(node=>({id:node.dataset.subblockId,role:node.dataset.partRole,
            label:node.querySelector('.ocr-pdf-subblock-chip')?.textContent,
            kind:node.querySelector('.ocr-pdf-subblock-chip')?.dataset.sourceKind})));
        assert.deepEqual(children.map(row=>row.id),group.ids,
          'all native child IDs must stay bound to their original PDF parent');
        assert.deepEqual(children.map(row=>row.role),group.roles);
        assert.deepEqual(children.map(row=>row.label),group.ids,
          'all native child chips must be simultaneously visible');
        assert.deepEqual(children.map(row=>row.kind),group.ids.map(()=>'content'),
          'native OCR children have their own exact CMD content scope');
        // The complete parent/child chip set must be legible simultaneously.
        // The original PDF bbox owns the labels' vertical ranges; child
        // labels may be staggered down a tall body, but never overlap.
        const chips=await parent.evaluate(node=>{
          const nodes=[node.querySelector(':scope > .ocr-pdf-block-ctrl'),
            ...node.querySelectorAll('.ocr-pdf-subblock-chip')];
          return nodes.map(el=>{
            const rect=el.getBoundingClientRect();
            const owner=el.classList.contains('ocr-pdf-block-ctrl')?node:
              el.closest('.ocr-pdf-block-fragment');
            const box=owner.getBoundingClientRect();
            return {id:el.textContent,top:rect.top,bottom:rect.bottom,
              min:box.top,max:box.bottom,width:rect.width,height:rect.height};
          });
        });
        assert.equal(chips.length,group.ids.length+1,
          `${name} one original parent chip and all native child chips`);
        assert(chips.every(row=>row.width>2&&row.height>3&&
          row.top>=row.min-2&&row.bottom<=row.max+2),
          `${name} labels must stay visible inside their own physical OCR Y extents`);
        for(let i=0;i<chips.length;i++)for(let j=i+1;j<chips.length;j++){
          const a=chips[i],b=chips[j];
          assert(a.bottom<=b.top-1||b.bottom<=a.top-1,
            `${name} ${group.parent} parent/child label collision ${a.id} vs ${b.id}`);
        }
        // PDF child label and independent PDF canvas clicks must both locate
        // the same actual content line, not a parent or historical tag line.
        for(const [index,id] of group.ids.entries()){
          const chip=parent.locator('.ocr-pdf-subblock-chip').nth(index);
          await chip.evaluate(node=>node.click());
          const line=bodyLine(id);
          await page.waitForFunction(async expected=>{
            const {viewStore}=await import('/view-store.js');
            return viewStore.getState().focusTarget?.sourceLine===expected;
          },line,{timeout:19000});
          const center=await parent.evaluate((node,index)=>{
            const fragment=node.querySelectorAll(':scope > .ocr-pdf-block-fragment')[index];
            const b=fragment.getBoundingClientRect();
            return {x:(b.left+b.right)/2,y:(b.top+b.bottom)/2};
          },index);
          await parent.evaluate((node,point)=>{
            node.closest('.page').querySelector('canvas').dispatchEvent(
              new MouseEvent('click',{bubbles:true,clientX:point.x,clientY:point.y}));
          },center);
          await page.waitForFunction(({role,index,line,physicalPage})=>{
            const overlay=document.querySelector('.ocr-pdf-region-overlay');
            return overlay?.dataset.partRole===role&&overlay.dataset.partIndex===String(index)&&
              overlay.dataset.pdfPage===String(physicalPage)&&
              document.querySelector('.ocr-pdf-status')?.textContent?.includes(`源码正文第 ${line} 行`);
          },{role:group.roles[index],index,line,physicalPage:group.physicalPage},{timeout:17000});
          // Reverse source→PDF: route through the real shared Focus store.
          await page.evaluate(async sourceLine=>{
            const {publishFocus}=await import('/view-store.js');
            publishFocus({sourceLine,origin:'source',intent:'click'});
          },line);
          await page.waitForFunction(({index,physicalPage})=>{
            const overlay=document.querySelector('.ocr-pdf-region-overlay');
            return overlay?.dataset.partIndex===String(index)&&
              overlay.dataset.pdfPage===String(physicalPage);
          },{index,physicalPage:group.physicalPage},{timeout:18000});
          observations.push({id,line,role:group.roles[index],pdfPage:group.physicalPage});
        }
        // A parent tag remains an independent click target, not an alias for
        // the first OCR child or a synthesized child-writing transaction.
        await page.evaluate(async line=>{
          const {publishFocus}=await import('/view-store.js');
          publishFocus({sourceLine:line,origin:'source',intent:'click'});
        },anchorLine(group.parent));
        await page.waitForFunction(pageNumber=>document.querySelector('.ocr-pdf-region-overlay')
          ?.dataset.partIndex==='-1'&&document.querySelector('.ocr-pdf-region-overlay')
          ?.dataset.pdfPage===String(pageNumber),group.physicalPage,{timeout:18000});
      }
      assert.equal(observations.length,5,'all five physically independent native children must be tested');
      assert.equal(await page.evaluate(()=>window.__v6cm6.cm.readSource()),original,
        'PDF child and reverse CM6 navigation must never write CMD');
      assert.equal(readFileSync(doc,'utf8'),original,'source disk must remain byte-identical');
      assert.deepEqual(errors,[]);assert.deepEqual(forbidden,[]);
      console.log('PDF_CHILD_REGION_SELECT_PASS',name,{childrenChecked:observations,
        sealedChildren:43,parents:224,reverse:true,sourceUnchanged:true});
    }finally{await browser.close();writeFileSync(doc,original);}
  }
}finally{server.kill('SIGTERM');rmSync(temp,{recursive:true,force:true});}
