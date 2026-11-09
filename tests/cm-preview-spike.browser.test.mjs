/** Independent proof (not production) of CM6 Markdown widgets, folds, source.
 * Run against the exact Lab experiment page. Nothing here changes CMD bytes.
 */
import assert from 'node:assert/strict';
import {chromium,webkit,devices} from 'playwright';
import {chromeExecutable} from './platform.test-helper.mjs';

const url=process.env.OCR2MD_CM_SPIKE_URL||
  'https://ocr2md.laity.bid/labs/sentence-benchmark/cm-preview-spike.html';

for(const [name,engine,binary] of [
  ['Chrome',chromium,chromeExecutable()],
  ['iPad-WebKit',webkit,webkit.executablePath()],
]){
  const browser=await engine.launch({headless:true,executablePath:binary});
  try{
    const page=await browser.newPage({...devices['iPad Pro 11 landscape'],
      viewport:{width:1150,height:800}});
    const errors=[],badMedia=[];page.on('pageerror',e=>errors.push(e.message));
    page.on('response',response=>{
      if(response.url().includes('/media/')&&response.status()!==200)
        badMedia.push({status:response.status(),url:response.url()});
    });
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:110000});
    await page.waitForFunction(()=>Boolean(window.__cmPreviewSpike),null,{timeout:150000});
    const projection=await page.evaluate(()=>{
      const {view,metrics,reading,clean}=window.__cmPreviewSpike;
      return {metrics,exact:view.state.doc.toString()===reading.doc,
        originalRestored:clean.stats.restored,
        visible:document.querySelectorAll('.ocr-cm-preview-rendered').length};
    });
    assert.equal(projection.exact,true);
    assert.equal(projection.originalRestored,true);
    assert.equal(projection.metrics.unitCount,402);
    assert.equal(projection.metrics.headingRanges,19);
    assert(projection.metrics.renderedBlocks>=420);
    assert.equal(projection.metrics.mainRenderer.images,18);
    assert(projection.metrics.mainRenderer.katex>=40);
    assert(projection.metrics.mainRenderer.tables>=9);
    assert(projection.metrics.mainRenderer.callouts>=7);
    assert(projection.visible>0,'CM6 widget DOM must render inside editor');
    assert(projection.metrics.inlineBlocks>250,
      'most sentence paragraphs must keep their source lines, not use multiline block widgets');
    assert.equal(projection.metrics.styledHeadings,19,
      'all 19 Markdown headings must keep native CM6 lines and typography');
    const mediaChecks=[];
    for(const [kind,query,selector] of [
      ['image','media/','.ocr-cm-preview-rendered img,.ocr-cm-preview-inline img'],
      ['formula','$$','.ocr-cm-preview-rendered .katex,.ocr-cm-preview-inline .katex'],
      ['table','<table','.ocr-cm-preview-rendered table,.ocr-cm-preview-inline table'],
      ['callout','[!','.ocr-cm-preview-rendered .ocr-callout,.ocr-cm-preview-inline .ocr-callout'],
    ]){
      const offset=await page.evaluate(q=>window.__cmPreviewSpike.reading.doc.indexOf(q),query);
      if(offset<0)continue;
      await page.evaluate(pos=>window.__cmPreviewSpike.cm.reveal(
        window.__cmPreviewSpike.view,pos),offset);
      await page.waitForTimeout(180);
      const count=await page.locator(selector).count();
      assert(count>0,`CM6 block widgets must visibly render ${kind} at source offset ${offset}`);
      mediaChecks.push({kind,count});
    }

    await page.getByRole('checkbox',{name:'句子编号栏'}).check();
    await page.evaluate(()=>{
      const {view,cm,source}=window.__cmPreviewSpike;
      cm.reveal(view,source.anchors[200].from);
    });
    await page.waitForTimeout(180);
    const previewIDCount=await page.locator('.ocr-cm-preview-unit-id').count();
    assert(previewIDCount>0,
      'sentence IDs must remain in native CM6 gutter in fully rendered sentence view');
    const renderedLineNumbers=await page.locator('.cm-lineNumbers .cm-gutterElement').count();
    assert(renderedLineNumbers>0,'rendered mode must preserve native CM6 line numbers');
    // Headings remain actual CM6 lines, with the Main Obsidian H1/H2 style.
    const headingPresentation=await page.evaluate(()=>{
      const {view,cm}=window.__cmPreviewSpike;
      const headings=[...view.state.doc.toString().matchAll(/^#{1,2} .+$/gm)];
      let h1=null,h2=null;
      for(const h of headings){
        if(!h1&&h[0].startsWith('# '))h1=h.index;
        if(!h2&&h[0].startsWith('## '))h2=h.index;
      }
      return {h1,h2};
    });
    assert(headingPresentation.h1!=null&&headingPresentation.h2!=null,
      'real document must contain H1 and H2 source headings');
    const titleMetrics=[];
    for(const [level,pos] of [['h1',headingPresentation.h1],['h2',headingPresentation.h2]]){
      await page.evaluate(p=>window.__cmPreviewSpike.cm.reveal(window.__cmPreviewSpike.view,p),pos);
      await page.waitForTimeout(160);
      titleMetrics.push(await page.evaluate(level=>{
        const node=document.querySelector(`.cm-ob-heading-line-${level==='h1'?1:2}`);
        return {level,visible:!!node&&node.getClientRects().length>0,
          font:node?parseFloat(getComputedStyle(node).fontSize):0,
          source:node?.textContent?.trim().slice(0,65)};
      },level));
    }
    assert(titleMetrics.every(x=>x.visible),
      'H1 and H2 must remain visible CM6 source lines, not HTML block replacements');
    assert(titleMetrics[0].font>titleMetrics[1].font,
      'Obsidian heading typography must preserve H1 > H2 size');
    await page.getByRole('checkbox',{name:'CM6 块级渲染'}).uncheck();
    const sourceIDCount=await page.locator('.ocr-cm-preview-unit-id').count();
    assert(sourceIDCount>0,'native CM6 gutter shows sentence IDs in source mode');
    await page.getByRole('checkbox',{name:'CM6 块级渲染'}).check();

    await page.getByRole('checkbox',{name:'CM6 标题折叠'}).check();
    const folded=await page.evaluate(()=>{
      const {view,cm}=window.__cmPreviewSpike;
      return {doc:view.state.doc.length,
        folded:cm.foldedCount(view),
        mountedPlaceholders:document.querySelectorAll('.cm-foldPlaceholder').length,
        lines:document.querySelectorAll('.cm-line').length};
    });
    assert.equal(folded.folded,19,'CM6 fold state must cover all 19 headings');
    const remote=await page.locator('#cm-spike-record option').nth(390).getAttribute('value');
    await page.locator('#cm-spike-record').selectOption(remote);
    await page.waitForTimeout(200);
    const navigated=await page.evaluate(()=>{
      const {view,source}=window.__cmPreviewSpike;
      const row=source.anchors.find(x=>x.id===document.querySelector('#cm-spike-record').value);
      return {samePosition:view.state.selection.main.head===row.from,
        sourceUnchanged:view.state.doc.toString()===source.doc};
    });
    assert.equal(navigated.samePosition,true);
    assert.equal(navigated.sourceUnchanged,true);
    await page.getByRole('checkbox',{name:'CM6 标题折叠'}).uncheck();

    await page.getByRole('combobox',{name:'文档来源'}).selectOption('cmd');
    await page.waitForFunction(()=>window.__cmPreviewSpike?.metrics.mode==='完整 CMD 原文',
      null,{timeout:120000});
    const raw=await page.evaluate(()=>{
      const {view,model,metrics}=window.__cmPreviewSpike;
      return {exact:view.state.doc.toString()===model.source,metrics};
    });
    assert.equal(raw.exact,true,'CM6 can hold COMPLETE unmodified CMD source');
    assert.equal(raw.metrics.cmdExact,true);
    assert.equal(raw.metrics.unitCount,402);
    assert(raw.metrics.renderedBlocks>50,'Main renderer must map some CMD blocks');
    assert.deepEqual(errors,[]);
    assert.deepEqual(badMedia,[],'template must not trigger incorrect Lab-relative media URLs');
    console.log(name,'CM6_MARKDOWN_SPIKE_PASS',JSON.stringify({
      cleanBlocks:projection.metrics.renderedBlocks,
      cleanMissing:projection.metrics.skippedBlocks,
      sourceIDCount,previewIDCount,renderedLineNumbers,titleMetrics,
      folded:folded.folded,
      cmPositionCorrect:navigated.samePosition,
      rawCMDBytes:raw.metrics.sourceBytes,
      rawBlocks:raw.metrics.renderedBlocks,
      rawUnmapped:raw.metrics.skippedBlocks,
      rawExact:raw.exact,mediaChecks}));
  }finally{await browser.close();}
}
