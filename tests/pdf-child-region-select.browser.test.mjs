/** Original PDF multi-region regression: native p/b/s CMD anchors are sealed,
 * PDF child hits navigate bidirectionally without editing the source. This
 * replaces the deprecated click-to-insert legacy MinerU child-tag contract. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:net';
import {chromium,webkit} from 'playwright';
import {toMarkdown,toMineruJSON} from '../packages/minerujson-md/dist/index.js';

const raw=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8');
const source=toMarkdown(raw),lines=source.split('\n');
const parentCount=(source.match(/<!-- cmd:block:v1 id="p\d+b\d+"/g)||[]).length;
const childCount=(source.match(/<!-- cmd:block:v1 id="p\d+b\d+s\d+"/g)||[]).length;
assert.deepEqual([parentCount,childCount],[224,43]);
const nativeChildren=[...source.matchAll(/<!-- cmd:block:v1 id="(p\d+b\d+s\d+)"/g)]
  .map(match=>match[1]);
assert.equal(nativeChildren.includes('p3b1s1'),true);
// p3b1s1 is a genuine sealed table footnote with NO valid physical bbox.
// It must remain in CMD but cannot honestly be painted on the PDF page.
const validPhysicalChildren=nativeChildren.filter(id=>id!=='p3b1s1').sort();
assert.equal(validPhysicalChildren.length,42);
assert.equal(toMineruJSON(source),raw,'full sealed CMD must reverse exactly to original OCR');
const childContentLine=id=>{
  const index=lines.findIndex(line=>line.includes(`<!-- cmd:block:v1 id="${id}" -->`));
  assert(index>=0,`${id} native CMD anchor is missing`);
  const next=lines.findIndex((line,i)=>i>index&&/^<!-- cmd:block:v1 id="p\d+b\d+/.test(line));
  const body=lines.findIndex((line,i)=>i>index&&(next===-1||i<next)&&
    line.trim()&&!line.trim().startsWith('<!--'));
  assert(body>index,`${id} must own OCR prose or HTML body, not a synthetic missing tag`);
  return body+1;
};
const tmp=mkdtempSync(join(tmpdir(),'ocr2md-child-region-r9-'));
const doc=join(tmp,'document.md');writeFileSync(doc,source);
// Never reuse a fixed Vite port: independent audits may execute different
// disposable CMD fixtures concurrently, and a shared server silently couples
// the wrong source/document into the same browser assertions.
const port=await new Promise((resolve,reject)=>{
  const socket=createServer();socket.once('error',reject);
  socket.listen(0,'127.0.0.1',()=>{
    const address=socket.address();socket.close(error=>error?reject(error):resolve(address.port));
  });
});
const base=`http://127.0.0.1:${port}/`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1',
  '--port',String(port),'--strictPort'],{cwd:process.cwd(),stdio:'ignore',env:{
    ...process.env,V6_DOCUMENT_PATH:doc,V6_SETTINGS_PATH:join(tmp,'settings.json')}});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try{
  let ready=false;
  for(let i=0;i<250;i++){
    try{if((await fetch(base)).ok){ready=true;break;}}catch{}
    await sleep(130);
  }
  assert(ready,'isolated PDF editor unavailable');
  for(const [name,engine,mobile] of [['Chrome',chromium,false],['iPad-WebKit',webkit,true]]){
    if(process.env.ONE_BROWSER&&name!==process.env.ONE_BROWSER)continue;
    const browser=await engine.launch({headless:true});
    try{
      const page=await browser.newPage({viewport:{width:1220,height:840},
        isMobile:mobile,hasTouch:mobile});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      page.on('framenavigated',frame=>{if(frame===page.mainFrame())
        console.log('PDF_CHILD_NAVIGATED',name,frame.url());});
      await page.goto(base,{waitUntil:'domcontentloaded',timeout:55000});
      // A cold isolated worktree can take longer to initialize PDF.js;
      // entering via a disabled TomSelect option would bypass the real UI
      // readiness contract. Wait for the actual ready state first.
      await page.waitForFunction(()=>document.querySelector('.ocr-pdf-status')?.textContent==='就绪',
        null,{timeout:110000});
      await page.locator('.ocr-preview-switchbar .ocr-navigation-preview .ts-control').click();
      await page.locator('.ocr-navigation-popup-preview:visible [data-value="pdf"]').click();
      await page.waitForFunction(()=>document.querySelectorAll('.ocr-pdf-block-cover').length===224,
        null,{timeout:45000});
      assert.equal(await page.locator('.ocr-pdf-mark-subblocks').count(),0,
        'PDF evidence cannot expose the deprecated child-tag source writer');
      assert.equal(await page.locator('.ocr-pdf-block-cover').count(),224);
      const renderedIds=await page.locator('.ocr-pdf-subblock-chip')
        .evaluateAll(nodes=>nodes.map(node=>node.textContent.trim()).sort());
      assert.deepEqual(renderedIds,validPhysicalChildren,
        '42 original children with valid OCR bboxes must be painted once, and p3b1s1 must not get a fabricated rectangle');
      assert.equal(await page.locator('.ocr-pdf-block-fragment[data-subblock-id="p3b1s1"]').count(),0,
        'OCR child lacking a valid bbox must remain in CMD but not appear as an invented PDF hit');
      assert.equal(await page.locator('.ocr-pdf-children-menu').count(),0,
        'native subblock IDs must be permanently visible, not hidden in an old picker');
      assert.equal(await page.locator('.ocr-pdf-block-cover input').count(),224);
      assert.equal(await page.locator('.ocr-pdf-block-cover input:enabled').count(),0,
        'readonly native OCR evidence must not join any block via checkbox');
      // Two distinct tables on p3, plus p4's tri-part native PDF table.
      const regions=[
        {id:'p3b0',page:4,parts:[['p3b0s0','caption'],['p3b0s1','body']],
          bounds:[68,89,538,458]},
        {id:'p4b0',page:5,parts:[['p4b0s0','caption'],['p4b0s1','body'],['p4b0s2','note']],
          bounds:[50,89,521,339]},
      ];
      let checked=0;
      for(const region of regions){
        const root=page.locator(`.ocr-pdf-block-cover[data-block-id="${region.id}"]`);
        await root.scrollIntoViewIfNeeded({timeout:26000});
        await page.waitForFunction(id=>document.querySelector(
          `.ocr-pdf-block-cover[data-block-id="${id}"]`)?.closest('.page')
          ?.querySelector('canvas')?.width>0,region.id,{timeout:26000});
        const info=await root.evaluate(node=>{
          const physical=node.closest('.page').getBoundingClientRect();
          const b=node.getBoundingClientRect();
          return {page:Number(node.dataset.pdfPage),coords:[
            (b.left-physical.left)/physical.width*594,
            (b.top-physical.top)/physical.height*783,
            (b.right-physical.left)/physical.width*594,
            (b.bottom-physical.top)/physical.height*783],
            parts:[...node.querySelectorAll(':scope > .ocr-pdf-block-fragment')].map(f=>({
              id:f.dataset.subblockId,role:f.dataset.partRole,
              label:f.querySelector('.ocr-pdf-subblock-chip')?.textContent})),
            parentLabel:node.querySelector(':scope > .ocr-pdf-block-ctrl span')?.textContent};
        });
        assert.equal(info.page,region.page);
        assert.equal(info.parentLabel,region.id);
        info.coords.forEach((value,i)=>assert(Math.abs(value-region.bounds[i])<3,
          `${name}: ${region.id} original OCR parent bbox coordinate ${i} shifted ${value}`));
        assert.deepEqual(info.parts,region.parts.map(([id,role])=>({id,role,label:id})),
          `${region.id} must display every native independent child label`);
        const chips=await root.evaluate(node=>{
          const parts=[node.querySelector(':scope > .ocr-pdf-block-ctrl'),
            ...node.querySelectorAll('.ocr-pdf-subblock-chip')];
          return parts.map(el=>{
            const rect=el.getBoundingClientRect();
            const owner=el.classList.contains('ocr-pdf-block-ctrl')?node:
              el.closest('.ocr-pdf-block-fragment');
            const b=owner.getBoundingClientRect();
            return {id:el.textContent.trim(),top:rect.top,bottom:rect.bottom,
              width:rect.width,height:rect.height,inside:rect.top>=b.top-2&&rect.bottom<=b.bottom+2,
              kind:el.dataset.sourceKind,style:getComputedStyle(el).borderTopStyle};
          });
        });
        assert(chips.every(chip=>chip.width>2&&chip.height>3&&chip.inside),
          `${name}: ${region.id} parent/child gutter labels must be visible within their own PDF bbox`);
        for(let i=0;i<chips.length;i++)for(let j=i+1;j<chips.length;j++)
          assert(chips[i].bottom<=chips[j].top-1||chips[j].bottom<=chips[i].top-1,
            `${name}: native PDF labels overlap ${chips[i].id} vs ${chips[j].id}`);
        // The PDF parent badge represents its entire native visual group:
        // it stays solid if any genuine child owns OCR text, even if the
        // literal parent CMD tag has an empty own-scope before s0.
        assert.equal(chips[0].kind,'content',
          `${region.id}: parent union contains real child OCR text`);
        assert.equal(chips[0].style,'solid');
        assert(chips.slice(1).every(chip=>chip.kind==='content'&&chip.style==='solid'),
          `${region.id}: each actual native caption/table/note body has a solid content badge`);
        assert.equal(await root.locator(':scope > .ocr-pdf-block-ctrl input').count(),1,
          'one original MinerU parent has only one readonly checkbox');
        for(const [index,[id,role]] of region.parts.entries()){
          const expectedLine=childContentLine(id);
          console.log('PDF_CHILD_CHECK',name,id,role,expectedLine);
          const point=await root.evaluate((node,index)=>{
            const box=node.querySelectorAll(':scope > .ocr-pdf-block-fragment')[index]
              .getBoundingClientRect();
            return {x:(box.left+box.right)/2,y:(box.top+box.bottom)/2};
          },index);
          await root.evaluate((node,xy)=>node.closest('.page').querySelector('canvas')
            .dispatchEvent(new MouseEvent('click',{
              bubbles:true,clientX:xy.x,clientY:xy.y})),point);
          await page.waitForFunction(async({role,line,pageNumber,index})=>{
            const {viewStore}=await import('/view-store.js');
            const overlay=document.querySelector('.ocr-pdf-region-overlay');
            return overlay?.dataset.partRole===role&&
              overlay?.dataset.pdfPage===String(pageNumber)&&
              overlay?.dataset.partIndex===String(index)&&
              viewStore.getState().focusTarget?.sourceLine===line&&
              (document.querySelector('.ocr-pdf-status')?.textContent||'')
                .includes(`源码正文第 ${line} 行`);
          },{role,line:expectedLine,pageNumber:region.page,index},{timeout:19000});
          assert.match(await page.locator('.ocr-pdf-status').textContent(),
            new RegExp(`源码正文第 ${expectedLine} 行`),
            `PDF ${id} must identify the real source body line`);
          console.log('PDF_CHILD_FORWARD_PASS',name,id);
          // CM6-to-PDF reverse mapping must return to the very same child,
          // not the enclosing parent or another nearby native rectangle.
          await page.evaluate(async line=>{
            const {publishFocus}=await import('/view-store.js');
            publishFocus({sourceLine:line,origin:'source',intent:'click'});
          },expectedLine);
          await page.waitForFunction(async({role,index,pageNumber})=>{
            const overlay=document.querySelector('.ocr-pdf-region-overlay');
            return overlay?.dataset.partRole===role&&
              overlay?.dataset.partIndex===String(index)&&
              overlay?.dataset.pdfPage===String(pageNumber);
          },{role,index,pageNumber:region.page},{timeout:19000});
          console.log('PDF_CHILD_REVERSE_PASS',name,id);
          assert.equal(await page.evaluate(()=>window.__v6cm6.cm.readSource()),source,
            `${name} ${id} PDF ↔ CM6 navigation may not add or rewrite CMD tags`);
          checked++;
        }
      }
      assert.deepEqual(await page.locator('.ocr-pdf-block-cover[data-block-id="p3b1"] > .ocr-pdf-block-fragment')
        .evaluateAll(nodes=>nodes.map(node=>node.dataset.partType)),['table_body'],
        'second page-4 Notes table is independently represented, not invented as p3b0 child');
      const status=await page.evaluate(()=>Object.fromEntries(['p2b8','p13b0'].map(id=>{
        const el=document.querySelector(`.ocr-pdf-block-cover[data-block-id="${id}"] > .ocr-pdf-block-ctrl`);
        return [id,{kind:el?.dataset.sourceKind,style:el?getComputedStyle(el).borderTopStyle:null}];
      })));
      assert.deepEqual(status,{
        p2b8:{kind:'structure',style:'dashed'},p13b0:{kind:'content',style:'solid'}
      },'empty OCR placeholder must be visually distinct from a real Figure caption');
      assert.equal(toMineruJSON(await page.evaluate(()=>window.__v6cm6.cm.readSource())),raw);
      assert.equal(readFileSync(doc,'utf8'),source,'navigation must not auto-save disposable CMD');
      assert.deepEqual(errors,[]);
      console.log('PDF_CHILD_REGION_SELECT_PASS',name,{realChildClicks:checked,parents:224,
        nativeChildren:43,readonly:true,originalOCRReversible:true,sourceUnchanged:true});
    }finally{await browser.close();writeFileSync(doc,source);}
  }
}finally{server.kill('SIGTERM');rmSync(tmp,{recursive:true,force:true});}
