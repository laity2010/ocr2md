/** UIC BND-AG-CSS-01. Reproduce white-background regression in the real
 * minified V4 chapter AG control, without opening books or calling Vault.
 * Test both AG structural CSS load orders in mobile WebKit and Chromium.
 */
import {chromium,webkit} from '../../../../web-component-platform/node_modules/playwright/index.mjs';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {setTimeout as sleep} from 'node:timers/promises';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
const root=resolve('ui-spikes');
const port=await new Promise((ok,reject)=>{
 const server=createServer();server.once('error',reject);
 server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>ok(port));});
});
const origin=`http://127.0.0.1:${port}/v4-directory/`;
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1','--directory',root],{stdio:'ignore'});
try{
 let up=false;
 for(let i=0;i<35;i++){
  try{if((await fetch(origin+'plugins/chapter-boundary/legacy-theme.css')).ok){up=true;break}}catch{}
  await sleep(170);
 }
 assert.ok(up,'fixture server did not start');
 for(const [engine,driver] of [['webkit',webkit],['chromium',chromium]]){
  const browser=await driver.launch(engine==='chromium'?{channel:'chrome',headless:true}:{headless:true});
  try{
   for(const agFirst of [true,false]){
    const page=await browser.newPage({viewport:{width:820,height:1050},isMobile:true,hasTouch:true});
    try{
     // Navigate to a harmless static file to establish same-origin imports;
     // no WCP, book, credentials, or network endpoint beyond static files.
     await page.goto(origin+'plugins/chapter-boundary/legacy-theme.css',{waitUntil:'load'});
     await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width"></head><body><div id="v4-top-actions"></div></body></html>');
     const data=await page.evaluate(async({origin,agFirst})=>{
      const addCss=async name=>{
       const link=document.createElement('link');link.rel='stylesheet';link.href=origin+name;
       document.head.append(link);
       await new Promise((ok,no)=>{link.addEventListener('load',ok,{once:true});link.addEventListener('error',no,{once:true});});
      };
      const workCss='plugins/workspace/ag-grid-base.min.css';
      const chapterCss='plugins/chapter-boundary/legacy-theme.css';
      if(agFirst)await addCss(workCss);
      await addCss(chapterCss);
      if(!agFirst)await addCss(workCss);
      for(const id of ['ir-save','ir-publish-chapters','ir-undo','ir-redo']){
       const node=document.createElement('button');node.id=id;document.body.append(node);
      }
      const [{createBoundaryView},legacy]=await Promise.all([
       import(origin+'plugins/chapter-boundary/template.js'),
       import(origin+'plugins/chapter-boundary/legacy.js')]);
      const root=document.createElement('div');root.style.cssText='height:100vh;width:100vw';document.body.append(root);
      createBoundaryView(root);
      const panel=new legacy.IrWorkbenchPanel(document.querySelector('#workbench-ir-grid'),
       document.querySelector('#workbench-ir-source'),async()=>{},legacy.DEFAULT_DIRECTORY_SETTINGS);
      const grid=document.querySelector('#workbench-ir-grid');
      const colorOf=selector=>{
       const el=grid.querySelector(selector);if(!el)throw Error('GRID_NODE_NOT_FOUND '+selector);
       const css=getComputedStyle(el);
       return {background:css.backgroundColor,text:css.color,
        bgToken:css.getPropertyValue('--ag-background-color').trim(),
        headerToken:css.getPropertyValue('--ag-header-background-color').trim(),
        font:css.getPropertyValue('--ag-font-family').trim(),
        fontSize:css.getPropertyValue('--ag-font-size').trim()};
      };
      const result={grid:colorOf('.ag-root-wrapper'),header:colorOf('.ag-header'),
       styledRoot:colorOf('.ag-styled-root'),
       noSecondGrid:document.querySelectorAll('#workbench-ir-grid .ag-root-wrapper').length===1};
      return result;
     },{origin,agFirst});
     const json=JSON.stringify({engine,agFirst,...data});
     assert.equal(data.grid.bgToken,'#2f383e',json);
     assert.equal(data.grid.background,'rgb(47, 56, 62)',json);
     assert.equal(data.grid.headerToken,'#272f34',json);
     assert.match(data.grid.font,/Sarasa/,json);
     assert.equal(data.grid.fontSize,'14px',json);
     assert.ok(data.noSecondGrid,json);
     console.log('CHAPTER_AG_THEME_ISOLATION_PASS',json);
    }finally{await page.close()}
   }
  }finally{await browser.close()}
 }
}finally{server.kill('SIGTERM')}
