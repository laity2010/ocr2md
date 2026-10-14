/** Fast-start & workspace directory single-radio UIC regression.
 * Exactly the candidate SOURCE bytes served from route fixture, synthetic
 * directory metadata only, no real Vault/secret/writes. WebKit + Chromium.
 */
import {webkit,chromium} from '../../../../web-component-platform/node_modules/playwright/index.mjs';
import {readFile} from 'node:fs/promises';
import {resolve,join,extname} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve(process.env.V4_FAST_START_ROOT??'ui-spikes/v4-directory');
const origin='https://ocr2md.laity.bid';
const base=origin+'/v4-wp3-candidate/';
const mime={'.js':'text/javascript','.json':'application/json','.css':'text/css','.html':'text/html','.woff2':'font/woff2'};
const items=[['2022','directory'],['Buffett’s Alpha','directory'],['The Corporate Life','directory'],['忏悔录','directory'],['v3-mac-real-vault.txt','file']].map(([name,kind],index)=>({
 workspaceId:'obsidian-ocr2md',path:'/ocr2md/'+name,nodeId:'test-'+index,kind,
 name,modifiedAt:'2026-10-14T00:00:00Z',revision:'r'+index,size:kind==='file'?24:0}));
for(const [name,driver] of [['webkit',webkit],['chromium',chromium]]){
 const browser=await driver.launch(name==='chromium'?{channel:'chrome',headless:true}:{headless:true});
 try{
  const page=await browser.newPage({viewport:{width:810,height:950},isMobile:true,hasTouch:true});
  const external=[],errors=[],writes=[];
  page.on('request',req=>{if(!req.url().startsWith(origin))external.push(req.url());});
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error' && m.text().includes('local dependency'))errors.push(m.text())});
  const json=(route,obj,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(obj)});
  await page.route(origin+'/__v3/**',route=>{
   const req=route.request();if(req.method()!=='GET'){writes.push(req.url());return json(route,{error:'readonly'},403)}
   const u=new URL(req.url()),op=u.searchParams.get('op');
   if(op==='status')return json(route,{authorized:true,canPairLocally:false,rootLabel:'Obsidian/ocr2md'});
   if(op==='bootstrap')return json(route,{mounts:[],root:{kind:'directory',path:'/',nodeId:'root',workspaceId:'obsidian-ocr2md',revision:'r1'},page:{entries:[],generation:'0'}});
   if(op==='list')return json(route,{entries:items,generation:'test',nextCursor:''});
   if(op==='stat')return json(route,{kind:'directory',path:u.searchParams.get('path'),nodeId:'root',workspaceId:'obsidian-ocr2md',revision:'r1'});
   return json(route,{error:'unsupported fixture query'},404);
  });
  await page.route(base+'**',async route=>{
   const url=new URL(route.request().url());const rel=decodeURIComponent(url.pathname.slice('/v4-wp3-candidate/'.length))||'index.html';
   if(rel.startsWith('/')||rel.split('/').includes('..'))return route.abort('blockedbyclient');
   try{return route.fulfill({status:200,contentType:mime[extname(rel)]??'application/octet-stream',body:await readFile(join(root,rel))})}
   catch{return route.fulfill({status:404,body:'not found'})}
  });
  const start=Date.now();
  const pageRes=await page.goto(base,{waitUntil:'domcontentloaded',timeout:25000});
  assert.equal(pageRes.status(),200);
  await page.waitForFunction(()=>document.querySelector('[data-testid="workspace-status"]')?.textContent?.includes('已加载 5 项'),null,{timeout:20000});
  const elapsed=Date.now()-start;
  const radios=page.locator('[data-testid="workspace-ag"] input.ws-directory-radio');
  assert.equal(await radios.count(),4);
  assert.equal(await page.locator('[data-testid="workspace-ag"] input.ws-directory-radio:checked').count(),0);
  await radios.nth(1).click();
  await page.waitForFunction(()=>document.querySelectorAll('[data-testid="workspace-ag"] input.ws-directory-radio:checked').length===1);
  assert.match(await page.locator('[data-testid="workspace-ag"] input.ws-directory-radio:checked').getAttribute('aria-label'),/Buffett/);
  await radios.nth(2).click();
  assert.match(await page.locator('[data-testid="workspace-ag"] input.ws-directory-radio:checked').getAttribute('aria-label'),/Corporate/);
  assert.equal(await page.locator('[data-testid="workspace-ag"] input.ws-directory-radio:checked').count(),1);
  const gridStyles=await page.evaluate(()=>{
   const host=document.querySelector('[data-testid="workspace-ag"]');const css=getComputedStyle(host.querySelector('.ag-root-wrapper'));
   const first=host.querySelector('.workspace-entry')?.getBoundingClientRect();const bounds=host.getBoundingClientRect();
   return {bg:css.backgroundColor,color:css.color,font:css.getPropertyValue('--ag-font-family').trim(),
    header:css.getPropertyValue('--ag-header-background-color').trim(),
    firstRowY:first?Math.round(first.top-bounds.top):null,
    radioInFirstColumn:!!host.querySelector('.ag-row input.ws-directory-radio'),
    visible:[...host.querySelectorAll('.workspace-entry')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom>bounds.top&&r.top<bounds.bottom}).length};
  });
  assert.equal(gridStyles.bg,'rgb(29, 39, 50)');
  assert.equal(gridStyles.header,'#253343');
  assert.match(gridStyles.font,/Sarasa/);
  assert.ok(gridStyles.visible>=4,JSON.stringify(gridStyles));
  assert.ok(gridStyles.radioInFirstColumn,JSON.stringify(gridStyles));
  assert.match(await readFile('ui-spikes/v4-directory/plugins/workspace/workspace-grid.ts','utf8'),/pinned:'left',lockPinned:true/);
  // The optional settings panel is prewarmed only AFTER workspace is ready,
  // and all three public dependencies are now served from this release.
  await page.waitForFunction(()=>document.querySelector('#tab-settings')?.disabled===false,
    null,{timeout:25000});
  await page.locator('#tab-settings').click();
  await page.waitForFunction(()=>document.querySelector('#settings-shared')?.dataset.wcpLayout==='tripane',
    null,{timeout:24000});
  const settingsBg=await page.evaluate(()=>getComputedStyle(document.querySelector('#settings-shared .ag-root-wrapper')).backgroundColor);
  assert.equal(settingsBg,gridStyles.bg,'workspace and settings must share the same dark table background');
  await page.locator('#tab-workspace').click();
  assert.match(await page.locator('[data-testid="workspace-ag"] input.ws-directory-radio:checked').getAttribute('aria-label'),/Corporate/);
  assert.equal(await page.locator('[data-testid="workspace-ag"] input.ws-directory-radio:checked').count(),1);
  assert.equal(writes.length,0);
  assert.equal(errors.length,0,JSON.stringify(errors));
  const network=external.filter(url=>/wcp\.laity\.bid|agent-link\.laity\.bid/.test(url));
  assert.deepEqual(network,[],'startup still fetched external WCP / Shared modules');
  console.log('WORKSPACE_LOCAL_FIRST_AND_DIRECTORY_SINGLE_CHOICE_PASS',JSON.stringify({name,elapsed,gridStyles,radioCount:4,selected:'Corporate',settingsBg,selectionSurvivedSwitch:true,externalRequests:network.length,errors}));
 }finally{await browser.close()}
}
