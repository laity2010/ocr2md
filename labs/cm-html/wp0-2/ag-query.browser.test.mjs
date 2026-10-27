/** WP3 acceptance: the three business AGs filter the ONE current CM6 mother
 * via the read-only CMD index; no fourth AG, no chapter-file loads/writes.
 */
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
const base=process.env.OCR_LAB_TEST_URL||'http://127.0.0.1:4412/labs/cm-html/';
const choose=async(locator,value)=>locator.evaluate((element,next)=>{
  element.value=next;element.dispatchEvent(new Event('change',{bubbles:true}));
},value);
for(const [name,engine,options] of [
  ['Chrome',chromium,{viewport:{width:1270,height:820}}],
  ['iPad WebKit',webkit,{viewport:{width:1024,height:768},hasTouch:true,isMobile:true,deviceScaleFactor:2}],
]){
  const browser=await engine.launch({headless:true});
  try{
    const page=await browser.newPage(options),bad=[],errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('request',r=>{
      const u=new URL(r.url());
      if(u.searchParams.has('chapter')&&u.pathname.endsWith('/api/document'))bad.push('physical-load:'+u.pathname);
      if(!['GET','HEAD'].includes(r.method())&&u.pathname.includes('/api/'))bad.push('write:'+u.pathname);
    });
    await page.goto(base,{waitUntil:'domcontentloaded',timeout:40000});
    const element=page.locator('.ocr-lab-element-select');
    const checkbox=page.locator('input[aria-label="章节所有"]');
    const navigation=page.locator('.ocr-source-pane .ocr-lab-file-select');
    const status=page.locator('.ocr-all-chapters-status');
    await page.waitForFunction(()=>document.querySelectorAll(
      '.ocr-source-pane .ocr-lab-file-select optgroup:nth-child(2) option').length===6,
      null,{timeout:29000});
    assert.equal(await page.locator('.ocr-lab-ag-toolbar #export-chapters').isVisible(),false,
      'Virtual chapter mode must not export separate editable files');
    const ids=await navigation.locator('optgroup:nth-child(2) option')
      .evaluateAll(nodes=>nodes.map(x=>x.value));
    await choose(navigation,ids[1]);
    await checkbox.check();
    await status.waitFor({state:'visible',timeout:29000});
    await page.waitForFunction(()=>document.querySelector('.ocr-all-chapters-status')?.textContent.includes('CMD ·'),null,{timeout:28000});
    const readMother=()=>page.evaluate(async()=>{
      const r=await fetch('/labs/cm-html/api/document',{cache:'no-store'});
      if(!r.ok)throw Error('Mother fixture GET failed');
      return r.text();
    });
    const wholeText=await readMother();
    const gridRoot=type=>type==='outline'?'.ocr-outline-grid':type==='media'?'.ocr-media-grid':'.ocr-latex-grid';
    const count=async type=>Number(await page.locator(gridRoot(type)+' [role="grid"]').getAttribute('aria-rowcount'))-1;
    const check=async(module,type,total,label)=>{
      await choose(element,module);
      await page.waitForFunction(expected=>document.querySelector('.ocr-all-chapters-status')?.textContent.includes(' · '+expected+' 项'),total,{timeout:9000});
      await page.waitForFunction(({selector,total})=>Number(document.querySelector(selector+' [role="grid"]')?.getAttribute('aria-rowcount'))===total+1,
        {selector:gridRoot(type),total},{timeout:15000});
      assert.equal(await count(type),total,label);
      await page.locator(gridRoot(type)+' .ag-body-horizontal-scroll-viewport').evaluate(el=>{
        el.scrollLeft=el.scrollWidth;el.dispatchEvent(new Event('scroll',{bubbles:true}));
      });
      await page.locator(gridRoot(type)+' [col-id="virtualChapter"]').first().waitFor({state:'attached',timeout:10000});
      if(total>0){
        const chapterValue=await page.locator(gridRoot(type)+' .ag-row [col-id="virtualChapter"]').first().textContent();
        assert.match(chapterValue||'',/^00[0-5] · /,'AG could not resolve row chapter via CMD index');
      }
    };
    assert.equal(await checkbox.isChecked(),true);
    assert.equal(await page.locator('.ocr-all-chapters-grid').count(),0,'A fourth aggregate AG was mounted');
    assert.equal(await page.locator('.ocr-outline-grid [role="grid"]').count(),1);
    assert.equal(await page.locator('.ocr-media-grid [role="grid"]').count(),1);
    assert.equal(await page.locator('.ocr-latex-grid [role="grid"]').count(),1);
    await check('chapter-boundary','outline',19,'All headings');
    await check('media','media',11,'All media');
    await check('latex','latex',42,'All LaTeX');
    await checkbox.uncheck();
    const first=ids[0].slice('virtual:'.length);
    const second=ids[1].slice('virtual:'.length);
    await choose(navigation,ids[0]);
    await check('latex','latex',0,'First chapter contains no LaTeX');
    await check('media','media',6,'First chapter media');
    await check('chapter-boundary','outline',1,'First chapter heading');
    await choose(navigation,ids[1]);
    await check('chapter-boundary','outline',10,'Second chapter headings');
    await check('media','media',5,'Second chapter media');
    await check('latex','latex',25,'Second chapter LaTeX');
    await checkbox.check();
    await check('latex','latex',42,'All-chapters restore without reading physical files');
    assert.equal(await page.locator('.ocr-all-chapters-grid').count(),0);
    assert.equal(await readMother(),wholeText,'Virtual filter changed CM6 source');
    assert.deepEqual(errors,[],'Browser error');
    assert.deepEqual(bad,[],'File-boundary or write request occurred');
    console.log('WP3_SHARED_AG_QUERY_PASS',name,JSON.stringify({all:{heading:19,media:11,latex:42},
      chapters:[first,second],second:{heading:10,media:5,latex:25},gridInstances:3,physicalLoads:0,sourceUnchanged:true}));
  }finally{await browser.close();}
}
