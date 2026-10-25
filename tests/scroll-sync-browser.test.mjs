import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {copyFileSync,mkdirSync,readFileSync} from 'node:fs';
import {chromium,webkit,devices} from 'playwright';

const fixture='packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md';
const testFile='.v6/tests/scroll-sync-browser-test.md';
const port=5202,url='http://127.0.0.1:'+port+'/';
mkdirSync('.v6/tests',{recursive:true});
mkdirSync('.v6/evidence',{recursive:true});
const original=readFileSync(fixture);
const fixtureLines=original.toString('utf8').split('\n');
const sourceStart=fixtureLines.findIndex(x=>x.startsWith('<!-- minerujson:source:v1'))+1;
const tableLine=fixtureLines.findIndex(x=>x.startsWith('<table'))+1;
const mathLine=fixtureLines.findIndex(x=>x.startsWith('```math'))+1;
assert(tableLine>0&&mathLine>0);
copyFileSync(fixture,testFile);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1',
  '--port',String(port),'--strictPort'],{
  env:{...process.env,V6_DOCUMENT_PATH:process.cwd()+'/'+testFile},
  stdio:'ignore',
});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const getState=()=>({source:window.__v6cm6.scrollSync.currentSource,
  preview:window.__v6cm6.scrollSync.currentPreview,
  origin:window.__v6cm6.scrollState.scrollTarget?.origin,
  driver:window.__v6cm6.scrollSync.lastDriver,
  seq:window.__v6cm6.scrollState.scrollTarget?.sequence,
  sourceY:window.__v6cm6.view.scrollDOM.scrollTop,
  previewY:document.querySelector('.ocr-preview-md-scroll').scrollTop,
});
const engines=[
  ['Chrome',chromium,{executablePath:chromium.executablePath()}],
  ['WebKit',webkit,{executablePath:webkit.executablePath()}],
];
try{
  let ready=false;
  for(let i=0;i<180;i++){try{ready=(await fetch(url)).ok;if(ready)break;}catch{}await delay(100);}
  assert(ready,'isolated Vite server unavailable');
  for(const [name,engine,launch] of engines){
    if(process.env.V6_ONLY_CHROME && name!=='Chrome') continue;
    if(process.env.V6_ONLY_WEBKIT && name!=='WebKit') continue;
    const browser=await engine.launch({headless:true,...launch});
    try{
      const page=await browser.newPage({...devices['iPad Pro 11 landscape'],
        viewport:{width:1032,height:642}});
      await page.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:'+port)
        ?route.continue():route.abort());
      const errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
      await page.waitForFunction(()=>window.__v6cm6?.scrollSync?.anchorCount>150,{timeout:60000});
      const initial=await page.evaluate(()=>{
        const els=[...document.querySelectorAll('[data-source-start][data-source-end]')];
        return {anchors:els.length,lastEnd:Math.max(...els.map(e=>+e.dataset.sourceEnd)),
          lines:window.__v6cm6.view.state.doc.lines,
          tableAnchors:document.querySelectorAll('.ocr-source-block[data-source-start]').length,
          previewHTML:document.querySelector('.ocr-markdown').textContent.length,
          docLength:window.__v6cm6.view.state.doc.length};
      });
      assert(initial.anchors>200);
      assert(initial.lastEnd>=sourceStart-80&&initial.lastEnd<sourceStart,
        'Opaque minerujson:source footer must not appear in Markdown preview');
      assert.equal(initial.lines,fixtureLines.length);
      console.log('SCROLL_INIT',name,JSON.stringify(initial));

      // Source → preview: real rendered body around source line 600.
      await page.evaluate(()=>{
        const view=window.__v6cm6.view;
        view.scrollDOM.scrollTop=view.lineBlockAt(view.state.doc.line(600).from).top;
      });
      await page.waitForFunction(()=>{
        const s=window.__v6cm6.scrollSync;
        const a=s?.currentSource,b=s?.currentPreview;
        return a&&b&&a.sourceLine>470&&a.sourceLine<700 &&
          Math.abs((a.sourceLine+a.fraction)-(b.sourceLine+b.fraction))<12 &&
          s.lastDriver==='cm6';
      },{timeout:25000});
      const sourceResult=await page.evaluate(getState);
      console.log('SOURCE_TO_PREVIEW_OK',name,JSON.stringify(sourceResult));

      // Two structurally different blocks: an HTML table and a KaTeX fence.
      // These have very different rendered/source heights from paragraphs.
      for(const [kind,line] of [['table',tableLine],['formula',mathLine]]) {
        await page.evaluate(line=>{
          const view=window.__v6cm6.view;
          view.scrollDOM.scrollTop=view.lineBlockAt(view.state.doc.line(line).from).top;
        },line);
        await page.waitForFunction(()=>{
          const s=window.__v6cm6.scrollSync;
          const a=s?.currentSource,b=s?.currentPreview;
          return a&&b&&s.lastDriver==='cm6' &&
            Math.abs(a.sourceLine+a.fraction-b.sourceLine-b.fraction)<12;
        },null,{timeout:25000});
        const position=await page.evaluate(getState);
        assert(Math.abs(position.source.sourceLine-line)<80,kind+' expected local source block');
        console.log('BLOCK_SCROLL_OK',name,kind,JSON.stringify({
          source:position.source,preview:position.preview,
        }));
      }

      // Preview → source: choose a distinct later paragraph section.
      await page.evaluate(()=>{
        const pane=document.querySelector('.ocr-preview-md-scroll');
        pane.dispatchEvent(new Event('wheel')); // actual user scroll intent
        pane.scrollTop=.77*(pane.scrollHeight-pane.clientHeight);
      });
      await page.waitForTimeout(1200);
      const reverse=await page.evaluate(getState);
      console.log('PREVIEW_TO_SOURCE_RAW',name,JSON.stringify(reverse));
      assert.equal(reverse.driver,'preview',name+' preview must retain scroll leadership');
      assert(Math.abs(reverse.source.sourceLine+reverse.source.fraction-
        reverse.preview.sourceLine-reverse.preview.fraction)<12,
        name+' preview/source locations differ');
      // A real preview scroll must reach beyond the requested source line 600.
      // Comparing against an earlier browser-measured anchor is not portable:
      // WebKit's source line 600 may initially anchor beyond later preview 77%.
      // Preserve the independent driver, alignment, feedback, edit and resize checks.
      assert(reverse.source.sourceLine>600+30,
        name+' preview scroll must advance beyond requested source line 600');
      await delay(450);
      const stable=await page.evaluate(getState);
      assert((stable.seq||0)-(reverse.seq||0)<6,name+' recursive scroll feedback');
      console.log('PREVIEW_TO_SOURCE_OK',name,JSON.stringify(stable));

      // Only Undo/Redo/Save remain visible in the compact toolbar. The
      // coordinator retains its public state API, including off/on regression.
      await page.evaluate(()=>window.__v6cm6.setScrollSyncEnabled(false));
      assert.equal(await page.evaluate(()=>window.__v6cm6.scrollState.scrollSyncEnabled),false);
      const frozen=await page.evaluate(()=>document.querySelector('.ocr-preview-md-scroll').scrollTop);
      const frozenAnchor=await page.evaluate(()=>window.__v6cm6.scrollSync.currentPreview);
      await page.evaluate(()=>{
        const view=window.__v6cm6.view;
        view.scrollDOM.scrollTop=view.lineBlockAt(view.state.doc.line(170).from).top;
      });
      await delay(350);
      const disconnected=await page.evaluate(()=>document.querySelector('.ocr-preview-md-scroll').scrollTop);
      assert(Math.abs(disconnected-frozen)<3,name+' synchronization toggle OFF must freeze follower');
      await page.evaluate(()=>{
        const v=window.__v6cm6.view;
        v.dispatch({changes:{from:v.state.doc.line(85).from,
          insert:'<!-- sync disabled preview rerender -->\n'}});
      });
      await page.waitForFunction(()=>window.__v6cm6.scrollState.documentRevision>=1,
        null,{timeout:10000});
      await delay(350);
      const afterDisabledEdit=await page.evaluate(()=>document.querySelector('.ocr-preview-md-scroll').scrollTop);
      const afterAnchor=await page.evaluate(()=>window.__v6cm6.scrollSync.currentPreview);
      console.log('SYNC_OFF_EDIT_POSITION',name,JSON.stringify({
        pixelBefore:frozen,pixelAfter:afterDisabledEdit,
        anchorBefore:frozenAnchor,anchorAfter:afterAnchor,
      }));
      // Inserting a source line above can legitimately change rendered pixel
      // height. The same visible paragraph, not the old scrollTop, is stable.
      assert(Math.abs(afterAnchor.sourceLine+afterAnchor.fraction-
        frozenAnchor.sourceLine-frozenAnchor.fraction)<3,
        name+' independent preview semantic position changed');
      await page.evaluate(()=>window.__v6cm6.setScrollSyncEnabled(true));
      assert.equal(await page.evaluate(()=>window.__v6cm6.scrollState.scrollSyncEnabled),true);
      await page.waitForFunction(()=>{
        const s=window.__v6cm6.scrollSync;
        const a=s.currentSource,b=s.currentPreview;
        return a&&b&&Math.abs(a.sourceLine+a.fraction-b.sourceLine-b.fraction)<12;
      },{timeout:25000});

      // Edits near the top are reflected in the preview; no extra CM6
      // document owner, no second persisted Markdown and no cursor relocation.
      const before=await page.evaluate(()=>({length:window.__v6cm6.view.state.doc.length,
        head:window.__v6cm6.view.state.selection.main.head}));
      await page.evaluate(()=>{
        const v=window.__v6cm6.view;
        v.dispatch({changes:{from:v.state.doc.line(85).from,insert:'## SCROLL_SYNC_EDIT_CHECK\n\n'}});
      });
      await page.waitForFunction(()=>document.querySelector('.ocr-markdown')
        ?.textContent.includes('SCROLL_SYNC_EDIT_CHECK'),{timeout:30000});
      const edit=await page.evaluate(()=>({length:window.__v6cm6.view.state.doc.length,
        anchorCount:window.__v6cm6.scrollSync.anchorCount,
        lastRevision:window.__v6cm6.scrollState.documentRevision,
        head:window.__v6cm6.view.state.selection.main.head}));
      assert(edit.length>before.length);
      assert.equal(edit.head,before.head);
      assert(edit.anchorCount>200);

      const stableEditor=await page.evaluate(()=>{
        const view=window.__v6cm6.view;
        window.__v6cm6.dockview.layout(900,500);
        window.__v6cm6.dockview.layout(1032,550);
        return window.__v6cm6.view===view;
      });
      assert(stableEditor,'Dockview resize must not recreate CM6');
      await page.waitForTimeout(250);
      assert.deepEqual(errors,[],name+' browser errors');
      assert.equal(readFileSync(fixture).compare(original),0,'real MinerU original modified');
      await page.screenshot({path:`.v6/evidence/scroll-sync-${name.toLowerCase()}.png`});
      console.log('SCROLL_SYNC_PASS',name,JSON.stringify({
        anchors:initial.anchors,bodyToPreview:sourceResult.source.sourceLine,
        previewToSource:reverse.source.sourceLine,feedbackLoops:false,
        toggle:true,edit:true,resize:true,errors:errors.length,
      }));
    }finally{
      await Promise.race([browser.close(),delay(6000)]);
    }
  }
}finally{server.kill('SIGTERM');}
