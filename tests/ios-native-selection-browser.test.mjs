import {chromeExecutable,webkitExecutable} from './platform.test-helper.mjs';
/** iOS CM6 source must use browser-native caret and selection, not CM layers.
 * Non-iOS Mac retains its existing custom CM6 selection drawing.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {homedir} from 'node:os';
import {chromium,webkit,devices} from 'playwright';
const fixture=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md');
const sha=x=>createHash('sha256').update(x).digest('hex');
const testFile=resolve(`.v6/tests/ios-native-selection-${process.pid}.md`);
mkdirSync('.v6/tests',{recursive:true});mkdirSync('.v6/evidence',{recursive:true});
writeFileSync(testFile,fixture);
const port=5239,url=`http://127.0.0.1:${port}/`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{
 cwd:process.cwd(),env:{...process.env,V6_DOCUMENT_PATH:testFile},stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const cases=[
 ['Mac Chrome',chromium,{executablePath:chromeExecutable()},
  {viewport:{width:1440,height:900}},false],
 ['iPad Chrome',chromium,{executablePath:chromeExecutable()},
  {...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:642}},true],
 ['iPad WebKit',webkit,{executablePath:webkitExecutable()},
  {...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:642}},true],
];
try{
 let started=false;for(let k=0;k<150;k++){
  try{if((await fetch(url)).ok){started=true;break;}}catch{}await sleep(140);
 }assert(started,'isolated Vite server did not start');
 for(const [label,engine,launch,contextOptions,ios] of cases){
  const browser=await engine.launch({headless:true,...launch});
  try{
   const page=await browser.newPage(contextOptions),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',route=>route.request().url().startsWith(url)?route.continue():route.abort());
   await page.goto(url,{waitUntil:'domcontentloaded',timeout:55000});
   await page.waitForFunction(()=>window.__v6cm6?.view?.state?.doc?.lines>3000&&
     document.querySelector('.cm-content[contenteditable="true"]'),null,{timeout:70000});
   const first=await page.evaluate(()=>{
    const content=document.querySelector('#editor .cm-content');
    return {ua:navigator.userAgent,platform:navigator.platform,maxTouchPoints:navigator.maxTouchPoints,
     iosClass:document.querySelector('#editor').classList.contains('ocr-ios-native-selection'),
     caret:getComputedStyle(content).caretColor,userSelect:getComputedStyle(content).userSelect,
     touchCallout:getComputedStyle(content).webkitTouchCallout,
     nativeSelectionCSS:[...document.styleSheets].filter(s=>!s.href).flatMap(s=>{
      try{return [...s.cssRules].filter(r=>r.selectorText?.includes('.cm-content ::selection')).map(r=>r.cssText);}catch{return []}
     }),
     cursorLayers:document.querySelectorAll('.cm-cursorLayer').length,
     selectionLayers:document.querySelectorAll('.cm-selectionLayer').length,
     size:window.__v6cm6.view.state.doc.length,rows:window.__v6cm6.view.state.doc.lines};
   });
   assert.equal(first.iosClass,ios,`${label} wrong iOS detection`);
   const styleCheck=await page.evaluate(()=>({
     bodySize:getComputedStyle(document.querySelector('#editor .cm-editor')).fontSize,
     fontFamily:getComputedStyle(document.querySelector('#editor .cm-scroller')).fontFamily,
     hardReturnDOM:document.querySelector('.cm-ob-hard-return')?.textContent,
     hardReturnVisual:document.querySelector('.cm-ob-hard-return')
       ?getComputedStyle(document.querySelector('.cm-ob-hard-return'),'::before').content
       :getComputedStyle(document.querySelector('.cm-ob-hard-return-native'),'::after').content,
     nativeHardReturnLines:document.querySelectorAll('.cm-ob-hard-return-native').length,
     nonEditableEndMarkers:document.querySelectorAll('.cm-ob-hard-return[contenteditable="false"]').length,
     nativeAfterPointerEvents:document.querySelector('.cm-ob-hard-return-native')
       ?getComputedStyle(document.querySelector('.cm-ob-hard-return-native'),'::after').pointerEvents:null,
     headingSize:getComputedStyle(document.querySelector('.cm-ob-heading-line-2')).fontSize,
   }));
   assert.equal(styleCheck.bodySize,'16px');
   assert.match(styleCheck.fontFamily,/OCR2MD Sarasa/);
   if(ios){
     assert(styleCheck.nativeHardReturnLines>0,`${label} native newline decorations missing`);
     assert.equal(styleCheck.nonEditableEndMarkers,0,`${label} noneditable end widgets block selection`);
     assert.equal(styleCheck.nativeAfterPointerEvents,'none',`${label} newline marker intercepts taps`);
   }else{
     assert.equal(styleCheck.hardReturnDOM,'');
     assert(styleCheck.nonEditableEndMarkers>0,`${label} Mac newline widgets removed`);
   }
   assert.equal(styleCheck.hardReturnVisual,'"↵"');
   assert.equal(styleCheck.headingSize,'26px');
   if(ios){
    assert.equal(first.cursorLayers,0,`${label} still draws custom caret`);
    assert.equal(first.selectionLayers,0,`${label} still draws fake selection/handles`);
    assert.notEqual(first.caret,'transparent',`${label} native caret hidden`);
    assert.equal(first.userSelect,'text',`${label} iOS selection is not enabled`);
   }else{
    assert(first.cursorLayers>=1&&first.selectionLayers>=1,'Mac custom selection lost');
   }
   // Actual editor keyboard selection must remain in both CM6 and native DOM.
   await page.evaluate(()=>{
    const view=window.__v6cm6.view;
    const anchor=view.state.doc.line(212).from;
    view.dispatch({selection:{anchor},scrollIntoView:true});view.focus();
   });
   await page.keyboard.down('Shift');
   for(let n=0;n<9;n++)await page.keyboard.press('ArrowRight');
   await page.keyboard.up('Shift');
   const selected=await page.evaluate(()=>{
    const view=window.__v6cm6.view,range=view.state.selection.main;
    const dom=window.getSelection();
    return {from:range.from,to:range.to,selectedText:view.state.doc.sliceString(range.from,range.to),
      domSelected:dom?.toString(),docRows:view.state.doc.lines,sourceLength:view.state.doc.length,
      cursorLayers:document.querySelectorAll('.cm-cursorLayer').length,
      selectionLayers:document.querySelectorAll('.cm-selectionLayer').length};
   });
   assert(selected.to>selected.from,`${label} keyboard selection lost`);
   assert(selected.selectedText.length>=5,`${label} editor did not select characters`);
   if(ios){
    assert.equal(selected.domSelected,selected.selectedText,`${label} native DOM selection not in sync`);
    assert.equal(selected.selectionLayers,0,`${label} custom selection reappeared after selecting`);
   }
   await page.screenshot({path:`.v6/evidence/ios-native-selection-${label.toLowerCase().replace(/ /g,'-')}.png`,timeout:16000});
   // Replace a selected range and undo it: the iOS-native DOM projection may
   // change, but CM6 must remain the only editable text/history source.
   const oldText=await page.evaluate(()=>window.__v6cm6.view.state.doc.toString());
   await page.keyboard.insertText('iOS');
   await page.waitForFunction(old=>window.__v6cm6.view.state.doc.toString()!==old,
     oldText,{timeout:12000});
   await page.locator('#undo').click();
   await page.waitForFunction(old=>window.__v6cm6.view.state.doc.toString()===old,
     oldText,{timeout:15000});
   assert.deepEqual(errors,[]);
   console.log('IOS_NATIVE_SELECTION_PASS',label,JSON.stringify({ios,caret:first.caret,
    nativeLayerCount:selected.selectionLayers,selected:selected.selectedText,domSelected:selected.domSelected,
    sourceUnmodified:sha(readFileSync(testFile))===sha(fixture)}));
  }finally{await browser.close()}
 }
 assert.equal(sha(readFileSync(testFile)),sha(fixture),'test document changed');
 console.log('IOS_NATIVE_SELECTION_READONLY_PASS');
}finally{server.kill('SIGTERM')}
