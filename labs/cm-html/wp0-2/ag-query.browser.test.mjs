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
    await page.addInitScript(()=>{
      document.addEventListener('ocr2md:wp3-ag-ready',event=>{
        window.__wp3AGViews=event.detail.views;
        window.__wp3ReadSource=event.detail.getMarkdown;
      });
    });
    await page.goto(base,{waitUntil:'domcontentloaded',timeout:40000});
    const element=page.locator('.ocr-lab-element-select');
    const checkbox=page.locator('input[aria-label="章节所有"]');
    const chapter=page.locator('.ocr-wp3-chapter-select');
    const status=page.locator('.ocr-all-chapters-status');
    const indexToggle=page.locator('input[aria-label="CMD 虚拟索引"]');
    await indexToggle.waitFor({state:'visible',timeout:29000});
    assert.equal(await indexToggle.isChecked(),false,'Legacy mother must remain default');
    assert.equal(await page.locator('.ocr-lab-ag-toolbar #export-chapters').isVisible(),true,
      'Mother chapter-boundary actions must remain available');
    await indexToggle.check();
    await status.waitFor({state:'visible',timeout:29000});
    await page.waitForFunction(()=>document.querySelector('.ocr-all-chapters-status')?.textContent.includes('CMD ·')&&
      Boolean(window.__wp3AGViews?.latex?.api),null,{timeout:28000});
    const wholeText=await page.evaluate(()=>window.__wp3ReadSource());
    const count=(type)=>page.evaluate(name=>window.__wp3AGViews[name].api.getDisplayedRowCount(),type);
    const check=async(module,type,total,label)=>{
      await choose(element,module);
      await page.waitForFunction(expected=>document.querySelector('.ocr-all-chapters-status')?.textContent.includes(' · '+expected+' 项'),total,{timeout:9000});
      await page.waitForFunction(({kind,total})=>window.__wp3AGViews[kind].api.getDisplayedRowCount()===total,{kind:type,total},{timeout:15000});
      assert.equal(await count(type),total,label);
      const col=await page.evaluate(kind=>window.__wp3AGViews[kind].api.getColumn('virtualChapter')!==null,type);
      assert.equal(col,true,'Original AG missing CMD virtual-chapter column');
      if(total>0){
        const chapterValue=await page.evaluate(kind=>{
          const api=window.__wp3AGViews[kind].api;
          const first=api.getDisplayedRowAtIndex(0);
          return api.getColumn('virtualChapter').getColDef().valueGetter({data:first.data,api});
        },type);
        assert.match(chapterValue,/^00[0-5] · /,'AG could not resolve row chapter via CMD index');
      }
    };
    assert.equal(await checkbox.isChecked(),true);
    assert.equal(await page.locator('.ocr-all-chapters-grid').count(),0,'A fourth aggregate AG was mounted');
    assert.equal(await page.evaluate(()=>Object.keys(window.__wp3AGViews).length),3);
    await check('chapter-boundary','outline',19,'All headings');
    await check('media','media',11,'All media');
    await check('latex','latex',42,'All LaTeX');
    await checkbox.uncheck();
    await chapter.waitFor({state:'attached'});
    await page.locator('.ocr-navigation-virtual-chapters').waitFor({state:'visible'});
    const first=await chapter.locator('option').first().getAttribute('value');
    const second=await chapter.locator('option').nth(1).getAttribute('value');
    await check('latex','latex',0,'First chapter contains no LaTeX');
    await check('media','media',6,'First chapter media');
    await check('chapter-boundary','outline',1,'First chapter heading');
    await choose(chapter,second);
    await check('chapter-boundary','outline',10,'Second chapter headings');
    await check('media','media',5,'Second chapter media');
    await check('latex','latex',25,'Second chapter LaTeX');
    await checkbox.check();
    await check('latex','latex',42,'All-chapters restore without reading physical files');
    assert.equal(await page.locator('.ocr-all-chapters-grid').count(),0);
    assert.equal(await page.evaluate(()=>window.__wp3ReadSource()),wholeText,'Virtual filter changed CM6 source');
    assert.deepEqual(errors,[],'Browser error');
    assert.deepEqual(bad,[],'File-boundary or write request occurred');
    console.log('WP3_SHARED_AG_QUERY_PASS',name,JSON.stringify({all:{heading:19,media:11,latex:42},
      chapters:[first,second],second:{heading:10,media:5,latex:25},gridInstances:3,physicalLoads:0,sourceUnchanged:true}));
  }finally{await browser.close();}
}
