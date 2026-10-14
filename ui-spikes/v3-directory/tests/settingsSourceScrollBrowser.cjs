/** UIC: Settings source scrolls independently of its AG grid and preview. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {chromium,webkit}=require('../../v2/node_modules/@playwright/test');
const root=path.resolve(__dirname,'..');
const network=path.resolve(root,'../../../agent-link-monitor/web');
const port=30000+Math.floor(Math.random()*26000);
const engine=process.env.OCR2MD_TEST_WEBKIT==='1'?'webkit':'chromium';
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1','--directory',root],{stdio:'ignore'});
(async()=>{let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/index.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,110));}
 browser=await (engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{headless:true}:{channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1080,height:820}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://agent-link.laity.bid/**',async route=>{
   const name=new URL(route.request().url()).pathname;
   const file=path.resolve(network,'.'+name);
   if(!file.startsWith(network+'/')||!fs.existsSync(file))return route.continue();
   const mime=name.endsWith('.json')?'application/json':name.endsWith('.css')?'text/css':name.endsWith('.woff2')?'font/woff2':'text/javascript';
   await route.fulfill({status:200,contentType:mime,headers:{'access-control-allow-origin':'*'},body:fs.readFileSync(file)});
 });
 await page.goto(`http://127.0.0.1:${port}/index.html`,{waitUntil:'domcontentloaded'});
 await page.getByTestId('tab-settings').click();
 await page.waitForFunction(()=>document.querySelector('#settings-shared')?.dataset.ready==='true'
 && document.querySelector('#settings-shared')?.dataset.sourceReady==='true',null,{timeout:20000});
 const source=page.locator('#settings-shared laity-source-surface');
 const geometry=()=>source.evaluate(e=>{
   const nodes={host:e,mount:e.shadowRoot.querySelector('[part="editor"]'),editor:e.shadowRoot.querySelector('.cm-editor'),scroller:e.shadowRoot.querySelector('.cm-scroller'),content:e.shadowRoot.querySelector('.cm-content'),wrapper:e.closest('.las-code-host'),preview:e.closest('.las-source-col').querySelector('.las-preview')};
   const measurement={};
   for(const [key,node] of Object.entries(nodes)){
     const r=node.getBoundingClientRect(),style=getComputedStyle(node);
     measurement[key]={top:r.top,bottom:r.bottom,height:r.height,clientHeight:node.clientHeight,scrollHeight:node.scrollHeight,scrollTop:node.scrollTop,overflowY:style.overflowY};
   }
   return measurement;
 });
 const before=await geometry();
 console.log('SCROLL_LAYOUT_BEFORE',JSON.stringify({engine,geo:before}));
 const rect=await source.boundingBox();assert.ok(rect&&rect.height>100);
 await page.mouse.move(rect.x+rect.width*.5,rect.y+Math.min(rect.height-24,rect.height*.5));
 await page.mouse.wheel(0,540);
 await page.waitForTimeout(450);
 const after=await geometry();
 console.log('SCROLL_AFTER_WHEEL',JSON.stringify({engine,scroller:after.scroller,editor:after.editor,host:after.host}));
 assert.ok(before.scroller.scrollHeight>before.scroller.clientHeight+250,'editor has an independently scrollable text area');
 assert.ok(Math.abs(before.scroller.height-before.host.height)<4,'CodeMirror scrollbox fits visible source region');
 assert.ok(after.scroller.scrollTop>=before.scroller.scrollTop+55, 'CodeMirror source should move on wheel without moving AG/preview');
 assert.equal(after.wrapper.scrollTop,before.wrapper.scrollTop,'outer settings column never scrolls');
 assert.equal(after.preview.scrollTop,before.preview.scrollTop,'parameter preview scroll is independent');
 // Ordinary upward wheel scrolling is independent of active selection.
 await page.mouse.wheel(0,-300);
 await page.waitForTimeout(250);
 const returned=await geometry();
 assert.ok(returned.scroller.scrollTop<after.scroller.scrollTop-55,
   'user must be able to scroll back toward the top');
 // AG → source selection is an intentional reveal, not a scroll lock.
 await page.locator('#settings-shared').evaluate(e=>e.selectSetting('gridFontSize'));
 await page.waitForFunction(()=>{
   const e=document.querySelector('#settings-shared laity-source-surface');
   return e?.shadowRoot.querySelector('.cm-scroller')?.scrollTop<100;
 },null,{timeout:4500});
 const jump=await geometry();
 assert.ok(jump.scroller.scrollTop<100,'AG selection reveals the first source key');
 assert.equal(await page.locator('#settings-shared').getAttribute('data-linked-key'),'gridFontSize');
 // Narrow/mobile layout: the same native CodeMirror scroller must remain usable.
 await page.setViewportSize({width:390,height:844});
 await page.locator('#settings-shared').evaluate(e=>e.refresh());
 await page.waitForTimeout(170);
 const narrow=await geometry();
 assert.ok(narrow.scroller.clientHeight>65&&narrow.scroller.scrollHeight>narrow.scroller.clientHeight+200,
   'narrow source has a constrained scrollable viewport: '+JSON.stringify(narrow.scroller));
 const mobileRect=await source.boundingBox();
 if(mobileRect && mobileRect.y>=0 && mobileRect.y+mobileRect.height<=844){
   await page.mouse.move(mobileRect.x+mobileRect.width*.5,mobileRect.y+mobileRect.height*.5);
   await page.mouse.wheel(0,345);
   await page.waitForTimeout(180);
   const mobileAfter=await geometry();
   assert.ok(mobileAfter.scroller.scrollTop>narrow.scroller.scrollTop+55,'narrow source supports wheel gesture');
 }
 assert.deepEqual(errors,[]);
 console.log('SHARED_SETTINGS_SOURCE_SCROLL_PASS',JSON.stringify({engine,wheelScroll:after.scroller.scrollTop-before.scroller.scrollTop,narrowHeight:narrow.scroller.height}));
}catch(e){console.error('SHARED_SETTINGS_SOURCE_SCROLL_FAIL',e);process.exitCode=1;}
finally{await browser?.close();server.kill('SIGTERM');}
})();
