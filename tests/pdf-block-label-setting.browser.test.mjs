/** Real global Settings slider -> PDF rail magnification, collision-free,
 * source unaffected, persisted JSON and reload. Disposable data only.
 */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {chromium,webkit,devices} from 'playwright';
import {chromeExecutable} from './platform.test-helper.mjs';
import {selectModule,selectPreview} from './navigation-ui.test-helper.mjs';
import {toMarkdown} from '../packages/minerujson-md/dist/index.js';
import {planCMDAbsorbReviewedParent} from '../ui/cmd-block-chains.js';
import {PDF_BLOCK_LABEL_SCALE_KEY as KEY} from '../ui/pdf-block-label-setting.js';
// Reviewed case from the reported iPad screenshot: a real p6b6s1 child
// shares the same page as independent p6b8. Keep all other pages unchanged.
const original=toMarkdown(readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8'));
const merge=planCMDAbsorbReviewedParent(original,'p6b7','p6b6');
const source=[...merge.edits].sort((a,b)=>b.from-a.from).reduce((text,edit)=>{
  assert.equal(text.slice(edit.from,edit.to),edit.expected);
  return text.slice(0,edit.from)+edit.insert+text.slice(edit.to);
},original);
const dir=mkdtempSync(join(tmpdir(),'ocr2md-pdf-label-scale-'));
const doc=join(dir,'document.md'),settingsFile=join(dir,'settings.json'),token=join(dir,'token');
writeFileSync(doc,source);
const port=await new Promise((ok,fail)=>{const socket=createServer();socket.once('error',fail);
  socket.listen(0,'127.0.0.1',()=>{const p=socket.address().port;socket.close(e=>e?fail(e):ok(p));});});
const base='http://127.0.0.1:'+port;
const server=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),env:{...process.env,
  V6_PORT:String(port),V6_BIND:'127.0.0.1',V6_LAB_ID:'',V6_LAN_TLS_HOST:'',
  V6_DOCUMENT_PATH:doc,V6_PDF_PATH:resolve('.v6/workspace/buffetts-alpha.original.pdf'),
  V6_STATIC_ROOT:resolve('dist'),V6_SETTINGS_PATH:settingsFile,V6_TOKEN_PATH:token},stdio:'ignore'});
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
const tag=(page,id)=>page.locator(`.ocr-pdf-block-cover[data-block-id="${id}"] > .ocr-pdf-block-ctrl`);
const activateTextBlocks=async page=>{
  if(await page.locator('#module-select').inputValue()==='settings')
    await selectModule(page,'chapter-boundary');
  await page.locator('#module-select').evaluate(el=>{
    el.value='text-block';el.dispatchEvent(new Event('change',{bubbles:true}));
  });
  await page.waitForFunction(()=>document.querySelector('#module-select')?.value==='text-block');
};
const readWidth=async page=>{
  await page.locator('.ocr-pdf-block-cover[data-block-id="p1b3"]')
    .scrollIntoViewIfNeeded({timeout:35000});
  await tag(page,'p1b3').waitFor({state:'attached',timeout:35000});
  // A dense rail can represent this label via a group button. The DOM-owned
  // original keeps its proper physical size even when temporarily hidden.
  return tag(page,'p1b3').evaluate(el=>el.getBoundingClientRect().width);
};
const cleanRails=page=>page.evaluate(()=>{
  const root=document.querySelector('.ocr-pdf-block-cover[data-block-id="p1b3"]')?.closest('.page');
  if(!root)return {error:'PDF page 2 not found'};
  const labels=[...root.querySelectorAll('.ocr-pdf-rail-label')];
  const chips=[...root.querySelectorAll('.ocr-pdf-rail-label,button.ocr-pdf-rail-group')]
    .filter(n=>n.checkVisibility()&&getComputedStyle(n).visibility!=='hidden');
  const groups=[...root.querySelectorAll('button.ocr-pdf-rail-group:not([hidden])')];
  const boxes=[...root.querySelectorAll('.ocr-pdf-block-cover,.ocr-pdf-block-fragment:not([hidden])')]
    .filter(n=>n.checkVisibility()&&getComputedStyle(n).visibility!=='hidden');
  const r=n=>n.getBoundingClientRect();
  const overlap=(a,b)=>a.left<b.right-.5&&b.left<a.right-.5&&a.top<b.bottom-.5&&b.top<a.bottom-.5;
  const colliding=[];
  for(const chip of chips){
    for(const item of boxes)if(overlap(r(chip),r(item)))
      colliding.push(`${chip.textContent} overlaps PDF ${item.dataset.blockId||item.dataset.subblockId}`);
    for(const other of chips)if(other!==chip&&overlap(r(chip),r(other)))
      colliding.push(`${chip.textContent} overlaps ${other.textContent}`);
  }
  const leaders=[...root.querySelectorAll('svg.ocr-pdf-label-leaders path')]
    .filter(path=>getComputedStyle(path).visibility!=='hidden').length;
  return {labels:chips.length,groups:groups.length,
    represented:chips.length-groups.length+groups.reduce((n,g)=>n+Number(g.dataset.memberCount),0),
    original:labels.length,colliding,leaders};
});
// Page-relative acceptance is distinct from collision testing: a label can
// avoid every OCR box yet be hundreds of pixels OUTSIDE the paper, as the
// iPad screenshot at PDF page 7 / 100% demonstrated.
const inspectPageLabels=async(page,id)=>{
  const target=page.locator(`.ocr-pdf-block-cover[data-block-id="${id}"],`+
    `.ocr-pdf-block-fragment[data-subblock-id="${id}"]`);
  await target.waitFor({state:'attached',timeout:40000});
  await target.scrollIntoViewIfNeeded({timeout:30000});
  return page.evaluate(blockId=>{
    const node=document.querySelector(`.ocr-pdf-block-cover[data-block-id="${blockId}"]`)||
      document.querySelector(`.ocr-pdf-block-fragment[data-subblock-id="${blockId}"]`);
    const paper=node?.closest('.page');if(!paper)return {error:'PDF paper absent for '+blockId};
    const bounds=paper.getBoundingClientRect();
    const original=[...paper.querySelectorAll('.ocr-pdf-rail-label')];
    const groups=[...paper.querySelectorAll('button.ocr-pdf-rail-group:not([hidden])')];
    const chips=[...original,...groups]
      .filter(el=>el.getBoundingClientRect().width>0&&el.checkVisibility()&&
        getComputedStyle(el).visibility!=='hidden');
    const covers=[...paper.querySelectorAll('.ocr-pdf-block-cover,.ocr-pdf-block-fragment:not([hidden])')];
    const cross=(a,b)=>a.left<b.right-.5&&b.left<a.right-.5&&a.top<b.bottom-.5&&b.top<a.bottom-.5;
    const outside=[],collisions=[];
    for(const chip of chips){
      const r=chip.getBoundingClientRect();
      if(r.left<bounds.left-.7||r.right>bounds.right+.7||
        r.top<bounds.top-.7||r.bottom>bounds.bottom+.7)
        outside.push({id:chip.textContent.trim(),left:Math.round(r.left-bounds.left),
          right:Math.round(r.right-bounds.right),pageWidth:Math.round(bounds.width)});
      for(const c of covers)if(cross(r,c.getBoundingClientRect()))
        collisions.push(chip.textContent.trim()+' intersects a PDF cover');
      for(const c of chips)if(c!==chip&&cross(r,c.getBoundingClientRect()))
        collisions.push(chip.textContent.trim()+' intersects '+c.textContent.trim());
    }
    return {page:paper.dataset.pageNumber,paperWidth:bounds.width,
      ids:original.map(chip=>chip.textContent.trim()),
      visibleIds:chips.map(chip=>chip.textContent.trim()),
      labels:chips.length,groups:groups.length,
      represented:chips.length-groups.length+groups.reduce((n,g)=>n+Number(g.dataset.memberCount),0),
      original:original.length,
      leaders:[...paper.querySelectorAll('svg.ocr-pdf-label-leaders path')]
        .filter(el=>getComputedStyle(el).visibility!=='hidden').length,
      outside,collisions};
  },id);
};
try{
  let ready=false;
  for(let i=0;i<190;i++){try{if((await fetch(base+'/healthz')).ok){ready=true;break;}}catch{}await sleep(160);}
  assert(ready,'disposable PDF settings server not ready');
  for(const [name,engine,binary] of [['Chrome',chromium,chromeExecutable()],
    ['iPad-WebKit',webkit,webkit.executablePath()]]){
    if(process.env.ONE_BROWSER&&name!==process.env.ONE_BROWSER)continue;
    // One isolated settings file per browser, no cross-engine leakage.
    writeFileSync(settingsFile,JSON.stringify({settings:{}},null,2)+'\n');
    const browser=await engine.launch({headless:true,...(binary?{executablePath:binary}:{})});
    try{
      const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:900}});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      try{
        await page.goto(base,{waitUntil:'domcontentloaded',timeout:75000});
        await page.waitForFunction(()=>document.querySelector('.ocr-pdf-status')?.textContent==='就绪',
          null,{timeout:95000});
        await activateTextBlocks(page);await selectPreview(page,'pdf');
        const normal=await readWidth(page);
        await selectModule(page,'settings');
        const settingRow=page.locator('#settings-workspace .ag-row').filter({hasText:'labelScale'}).first();
        await settingRow.waitFor({state:'visible',timeout:50000});await settingRow.click();
        await page.waitForFunction(()=>document.querySelector('.ocr-settings-control label')?.textContent==='labelScale',
          null,{timeout:30000});
        const slider=page.locator('#settings-font-slider');
        assert.equal(await slider.inputValue(),'1');
        assert.equal(await page.locator('.ocr-settings-breadcrumb').textContent(),
          'PDF / 文本块 / labelScale');
        assert.equal(await slider.getAttribute('min'),'0.5');
        assert.equal(await slider.getAttribute('max'),'2.5');
        const set=async value=>slider.evaluate((el,next)=>{el.value=String(next);
          el.dispatchEvent(new Event('input',{bubbles:true}));},value);
        await set(0.6);
        await page.waitForFunction(()=>document.querySelector('#settings-font-slider')?.value==='0.6');
        await activateTextBlocks(page);await selectPreview(page,'pdf');
        const small=await readWidth(page);
        assert(small<normal*.85,`0.6x must shrink PDF chip (${normal} -> ${small})`);
        await selectModule(page,'settings');
        await settingRow.click();await slider.waitFor({state:'visible'});
        assert.equal(await slider.inputValue(),'0.6');
        await set(1.5);
        await page.waitForFunction(()=>document.querySelector('#settings-font-slider')?.value==='1.5');
        await activateTextBlocks(page);await selectPreview(page,'pdf');
        const enlarged=await readWidth(page);
        assert(enlarged>small*1.3,`1.5x must enlarge PDF chip visibly (${small} -> ${enlarged})`);
        const rail=await cleanRails(page);assert(!rail.error);
        assert(rail.represented>=10);assert.equal(rail.represented,rail.original);
        assert.equal(rail.leaders,rail.labels-rail.groups);
        assert.deepEqual(rail.colliding,[],`${name} scaled PDF labels must avoid source boxes`);
        // The screenshot's front page contains dense parent+child chips at
        // the comfortable 1.5x size. Every leader must be an independent
        // one-to-one segment, with an obvious iPad tap spotlight.
        const firstPageLabel=tag(page,'p0b7');
        await page.locator('.ocr-pdf-block-cover[data-block-id="p0b7"]')
          .scrollIntoViewIfNeeded({timeout:35000});
        const firstPage=page.locator('.page[data-page-number="1"]');
        const directPath=firstPage.locator('svg.ocr-pdf-label-leaders path[data-pbs-id="p0b7"]');
        await directPath.waitFor({state:'attached',timeout:30000});
        const pathD=await directPath.getAttribute('d');
        assert(pathD?.includes(' L ')&&!pathD.includes(' V '),
          'each PDF label must have an independent direct leader, no shared vertical bus');
        assert.equal(await firstPage.evaluate(el=>el.classList.contains('ocr-pdf-rail-dense')),true,
          'front page dense labels must default to quieter guides');
        const faint=Number(await directPath.evaluate(el=>getComputedStyle(el).opacity));
        assert(faint<0.2,'non-focused dense guides must be quiet');
        const grouped=firstPage.locator('button.ocr-pdf-rail-group:not([hidden])');
        const groupCount=await grouped.count();
        assert(groupCount>=2,'dense page must have collapsible groups, not a wall of tiny IDs');
        const p0Group=firstPage.locator('button.ocr-pdf-rail-group:not([hidden])[data-member-ids~="p0b7"]');
        assert.equal(await p0Group.count(),1,'the reviewed p0b7 must be recoverable via one group');
        const groupOriginals=(await p0Group.getAttribute('data-member-ids')).split(' ');
        assert(groupOriginals.length>=4);
        assert.equal(await firstPageLabel.evaluate(el=>getComputedStyle(el).visibility),'hidden');
        if(process.env.OCR_PBS_VISUAL_CAPTURE)
          await page.screenshot({path:process.env.OCR_PBS_VISUAL_CAPTURE.replace(/\.png$/,
            `-${name}-page1-dense.png`),animations:'disabled'});
        await p0Group.click({timeout:35000});
        assert.equal(await firstPageLabel.evaluate(el=>getComputedStyle(el).visibility),'visible');
        assert.equal(await p0Group.isVisible(),false,'expanded cluster summary gives way to original IDs');
        assert.equal(await firstPage.locator('button.ocr-pdf-rail-group:not([hidden])').count(),
          groupCount-1);
        await firstPageLabel.click({timeout:35000});
        assert.equal(await directPath.evaluate(el=>el.classList.contains('ocr-pdf-rail-focused-line')),
          true,'tapping label highlights only its own leader');
        assert.equal(await firstPageLabel.evaluate(el=>el.classList.contains('ocr-pdf-rail-focused-label')),
          true);
        assert.equal(await page.locator('.ocr-pdf-block-cover[data-block-id="p0b7"]')
          .evaluate(el=>el.classList.contains('ocr-pdf-block-group-active')),true,
          'parent group highlighting must remain intact');
        assert(Number(await directPath.evaluate(el=>getComputedStyle(el).opacity))>0.95,
          'tapped leader must be bright');
        const others=await firstPage.locator('svg.ocr-pdf-label-leaders path.ocr-pdf-rail-focused-line').count();
        assert.equal(others,1,'only the chosen PBS id has a strong leader');
        if(process.env.OCR_PBS_VISUAL_CAPTURE)
          await page.screenshot({path:process.env.OCR_PBS_VISUAL_CAPTURE.replace(/\.png$/,
            `-${name}-page1-focused.png`),animations:'disabled'});
        // Child tap switches precise one-to-one focus while retaining its
        // existing PDF-to-source mapping. Its parent cover must not be moved.
        const child=page.locator('.ocr-pdf-block-fragment[data-subblock-id="p0b7s0"] > .ocr-pdf-subblock-chip');
        if(await child.evaluate(el=>getComputedStyle(el).visibility)==='hidden'){
          const childGroup=firstPage.locator('button.ocr-pdf-rail-group[data-member-ids~="p0b7s0"]');
          await childGroup.click({timeout:35000});
        }
        await child.click({timeout:35000});
        assert.equal(await firstPage.locator('svg.ocr-pdf-label-leaders path.ocr-pdf-rail-focused-line')
          .getAttribute('data-pbs-id'),'p0b7s0');
        const p1=await inspectPageLabels(page,'p0b7');
        assert.deepEqual(p1.outside,[],'page1 label spotlight must remain on PDF paper');
        assert.deepEqual(p1.collisions,[],'page1 focus must not overlap any PDF bbox or label');
        // Recreate reported iPad page-7 / 100% situation with abundant empty
        // Dockview space beside the paper; both left and right rails must
        // remain on the paper, NOT near the scroller's far right edge.
        for(let step=0;step<9;step++){
          const zoom=Number.parseFloat((await page.locator('.ocr-pdf-zoom').textContent())||'0');
          if(zoom>=99.5)break;
          await page.locator('.ocr-pdf-plus').click();
        }
        await page.locator('.ocr-pdf-page').fill('7');
        await page.locator('.ocr-pdf-page').dispatchEvent('change');
        const p7=await inspectPageLabels(page,'p6b8');
        assert(!p7.error);assert(p7.represented>=8);
        assert.equal(p7.represented,p7.original);
        assert.equal(p7.leaders,p7.labels-p7.groups);
        console.log('PDF_PAGE7_PAPER_RAILS',name,JSON.stringify(p7));
        assert.deepEqual(p7.outside,[],'page 7: every label must stay INSIDE PDF paper');
        assert.deepEqual(p7.collisions,[],'page 7: labels must not overlap OCR covers');
        assert(p7.ids.includes('p6b8')&&p7.ids.includes('p6b6s1'),
          'the exact reported independent and reviewed-child labels must exist');
        if(process.env.OCR_PBS_VISUAL_CAPTURE)
          await page.screenshot({path:process.env.OCR_PBS_VISUAL_CAPTURE.replace(/\.png$/,
            `-${name}-page7-100pct.png`),animations:'disabled'});
        await page.locator('.ocr-pdf-page').fill('17');
        await page.locator('.ocr-pdf-page').dispatchEvent('change');
        const p17=await inspectPageLabels(page,'p16b10');
        assert(!p17.error);assert.equal(p17.leaders,p17.labels-p17.groups);
        assert.equal(p17.represented,p17.original);
        assert.deepEqual(p17.outside,[],'page 17 parent/child labels must stay on PDF paper');
        assert.deepEqual(p17.collisions,[],'page 17 parent/child rail collision');
        // A cold-start fixture verifies that the registered JSON setting is
        // read and applied after a complete reload. The existing Settings
        // integration tests own the actual write/authorization workflow.
        const record={key:'labelScale',category1:'PDF',category2:'文本块',
          comment:'PDF block label scale',value:1.5,
          range:{min:0.5,max:2.5,step:0.1}};
        writeFileSync(settingsFile,JSON.stringify({settings:{[KEY]:record}},null,2)+'\n');
        assert.deepEqual(JSON.parse(readFileSync(settingsFile,'utf8')).settings[KEY],record);
        assert.equal(readFileSync(doc,'utf8'),source,'PDF settings cannot edit the Markdown document');
        await page.reload({waitUntil:'domcontentloaded',timeout:75000});
        await page.waitForFunction(()=>document.querySelector('.ocr-pdf-status')?.textContent==='就绪',
          null,{timeout:95000});
        await activateTextBlocks(page);await selectPreview(page,'pdf');
        const restored=await readWidth(page);
        assert(Math.abs(restored-enlarged)<3,`persisted label multiplier must survive reload (${enlarged} vs ${restored})`);
        assert.deepEqual((await cleanRails(page)).colliding,[]);
        assert.deepEqual(errors,[]);
        console.log('PDF_GLOBAL_LABEL_SCALE_BROWSER_PASS',name,{normal,small,enlarged,restored,
          labels:rail.labels,leaders:rail.leaders,persisted:1.5});
      }finally{await page.close();}
    }finally{await browser.close();}
  }
}finally{server.kill('SIGTERM');rmSync(dir,{recursive:true,force:true});}
