/** Compact lab status and source action placement; no data writes. */
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
const base=process.env.OCR_LAB_TEST_URL||'https://192.168.1.10:4443/labs/cm-html/';
for(const [name,engine,options] of [
  ['Chrome',chromium,{viewport:{width:1300,height:820}}],
  ['iPad WebKit',webkit,{viewport:{width:1024,height:768},isMobile:true,hasTouch:true,deviceScaleFactor:2}],
]){
  const browser=await engine.launch({headless:true});
  try{
    const page=await browser.newPage({ignoreHTTPSErrors:base.startsWith('https:'),...options});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base,{waitUntil:'domcontentloaded'});
    await page.locator('.ocr-source-pane .ocr-navigation-files').waitFor({timeout:26000});
    const ui=await page.evaluate(()=>{
      const rect=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
      const status=document.querySelector('#status');
      const badge=document.querySelector('#build-version');
      const source=document.querySelector('.ocr-source-pane');
      const bar=source.querySelector('.ocr-source-file-toolbar');
      const nav=bar.querySelector('.ocr-lab-file-select');
      const quote=bar.querySelector('.quote-indent-tools');
      return {badge:badge.textContent,title:badge.title,status:rect(status),
        buttons:[...document.querySelectorAll('header.toolbar > .source-actions button')].map(b=>({id:b.id,label:b.textContent.trim(),...rect(b)})),
        toolbar:rect(document.querySelector('header.toolbar')),
        nav:rect(nav),quote:rect(quote),quoteButtons:[...quote.querySelectorAll('button')].map(b=>b.id),
        navRows:document.querySelectorAll('.ocr-source-pane > .ocr-source-file-toolbar').length,
        redundantStrip:rect(document.querySelector('.module-controls')).height,
        pane:rect(source)};
    });
    assert.match(ui.badge,/^lab-\d{6}-\d{4}$/);
    assert(ui.title.includes('v6-lab-cm-html-'),'Full build ID must be preserved in title');
    assert.equal(ui.buttons.map(b=>b.id).join(','),'undo,redo,save');
    assert.deepEqual(ui.buttons.slice(0,2).map(b=>b.label),['↶','↷']);
    assert(ui.buttons[0].width<=36&&ui.buttons[1].width<=36);
    assert(Math.abs(ui.buttons.at(-1).right-ui.toolbar.right)<=12,'Save not at top-right');
    assert(ui.buttons[0].left>=ui.status.right-2,'Global buttons must follow status');
    assert.deepEqual(ui.quoteButtons,['quote-outdent','quote-indent']);
    assert(ui.quote.left>=ui.nav.right-1,'Quote controls must follow source navigator');
    assert.equal(ui.navRows,1,'Duplicate file nav');
    assert.equal(ui.redundantStrip,0,'Lab should reclaim blank second command strip');
    assert(ui.pane.height>300);
    assert.deepEqual(errors,[]);
    console.log('COMPACT_HEADER_PASS',name,JSON.stringify({badge:ui.badge,undoWidth:ui.buttons[0].width,redoWidth:ui.buttons[1].width,navRows:ui.navRows,statusRow:ui.toolbar.height}));
  }finally{await browser.close();}
}
