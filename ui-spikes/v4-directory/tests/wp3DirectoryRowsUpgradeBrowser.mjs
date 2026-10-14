/** WP3 critical regression: upgrade a real 5-row directory, not merely an
 * initialized AG Grid. Browser routes serve preserved 0916 and current 0948
 * resources; Vault API returns synthetic metadata only and disallows writes.
 */
import {webkit,chromium} from '../../../../web-component-platform/node_modules/playwright/index.mjs';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {resolve,join,extname} from 'node:path';
const old=resolve(process.env.WP3_OLD_ROOT??'ui-spikes/v2/.v4-wp3-previous-v4-261014-0916-e4accd5c-f07f-4516-a0bf-631c672f417f');
const newer=resolve(process.env.WP3_NEW_ROOT??'ui-spikes/v2/v4-wp3-candidate');
const oldId=JSON.parse(await readFile(join(old,'build-info.json'),'utf8')).id;
const newId=JSON.parse(await readFile(join(newer,'build-info.json'),'utf8')).id;
const origin='https://ocr2md.laity.bid';
const entries=[['2022','directory'],["Buffett’s Alpha",'directory'],['The Corporate Life','directory'],['忏悔录','directory'],['v3-mac-real-vault.txt','file']].map(([name,kind],n)=>({
 workspaceId:'obsidian-ocr2md',path:'/ocr2md/'+name,nodeId:'node-'+(n+1),kind,size:kind==='file'?103:0,
 revision:'revision-'+(n+1),modifiedAt:'2026-10-14T00:00:00Z'}));
const respond=(r,value,status=200)=>r.fulfill({status,contentType:'application/json',body:JSON.stringify(value)});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2','.png':'image/png'};
for(const [engine,type] of (process.env.WP3_WEBKIT_ONLY==='1'?[['webkit',webkit]]:[['webkit',webkit],['chromium',chromium]])){
 const browser=await type.launch(engine==='chromium'?{channel:'chrome',headless:true}:{headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  let release='old',reads=0;
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.route(origin+'/__v3/**',route=>{
   if(route.request().method()!=='GET')throw Error('fixture rejects mutations');
   reads++;
   const u=new URL(route.request().url());const op=u.searchParams.get('op');
   if(op==='status')return respond(route,{authorized:true,canPairLocally:false,rootLabel:'Obsidian/ocr2md'});
   if(op==='bootstrap')return respond(route,{mounts:[],root:{kind:'directory',path:'/',nodeId:'root',workspaceId:'obsidian-ocr2md',revision:'r1'},page:{entries:[],generation:'0'}});
   if(op==='stat')return respond(route,{kind:'directory',path:u.searchParams.get('path'),nodeId:'root',workspaceId:'obsidian-ocr2md',revision:'r1'});
   if(op==='list')return respond(route,{entries,generation:'test-root-1',nextCursor:''});
   return respond(route,{error:'unsupported fixture operation'},404);
  });
  await page.route(origin+'/v4-wp3-candidate/**',async route=>{
   const url=new URL(route.request().url());const file=decodeURIComponent(url.pathname.slice('/v4-wp3-candidate/'.length))||'index.html';
   if(file.includes('..')||file.startsWith('/'))return route.abort('blockedbyclient');
   try{const bytes=await readFile(join(release==='old'?old:newer,file));return route.fulfill({status:200,contentType:mime[extname(file)]??'application/octet-stream',body:bytes})}
   catch{return route.fulfill({status:404,body:'not found'})}
  });
  const facts=async stage=>page.evaluate(stage=>({stage,version:document.querySelector('#v4-build-label')?.textContent,
   phase:window.__ocr2mdV4?.phase,
   source:document.querySelector('[data-testid="workspace-status"]')?.textContent,
   entryRows:[...document.querySelectorAll('[data-testid="workspace-ag"] .workspace-entry')].map(x=>x.textContent),
   viewportGrid:document.querySelector('[data-testid="workspace-ag"]')?.getBoundingClientRect()?.toJSON(),
   parked:document.querySelector('[data-workspace-resident]')?.getAttribute('aria-hidden')??null,
   visibleGridCount:document.querySelectorAll('[role=grid],[role=treegrid]').length
  }),stage);
  try{
   await page.goto(origin+'/v4-wp3-candidate/',{waitUntil:'domcontentloaded',timeout:35000});
   await page.waitForFunction(()=>document.querySelector('[data-testid="workspace-status"]')?.textContent?.includes('已加载 5 项'),null,{timeout:45000});
   await page.waitForTimeout(900);
   const initial=await facts(oldId+' initial');
   release='new';
   await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
   await page.waitForURL(u=>u.searchParams.get('build')===newId,{timeout:22000});
   await page.waitForFunction(()=>document.querySelector('[data-testid="workspace-status"]')?.textContent?.includes('已加载 5 项'),null,{timeout:45000});
   await page.waitForTimeout(800);
   const after=await facts(newId+' after upgrade');
   if(process.env.WP3_DEBUG_DOM_CHAIN==='1'){
    const chain=await page.evaluate(()=>{
     const g=document.querySelector('[data-testid="workspace-ag"]');
     let e=g?.querySelector('.workspace-entry');
     if(!e||!g)return [];
     const base=g.getBoundingClientRect();const list=[];
     for(let n=0;e&&n<15;n++,e=e.parentElement){
      const r=e.getBoundingClientRect(),css=getComputedStyle(e);
      list.push({tag:e.tagName,cls:String(e.className).slice(0,110),y:Math.round(r.top-base.top),h:Math.round(r.height),
        top:css.top,position:css.position,transform:css.transform,overflow:css.overflow,display:css.display,flex:css.flex,
        scrollTop:e.scrollTop});if(e===g)break;
     }return list;
    });
    console.log('WP3_ROW_PARENT_CHAIN',JSON.stringify({engine,chain}));
   }
   console.log('WP3_REAL_5_ROWS',JSON.stringify({engine,initial,after,reads,errors:errors.slice(0,3)}));
   assert.equal(initial.entryRows.length,5,'old candidate must display 5 rows');
   assert.equal(after.entryRows.length,5,'upgraded candidate must display same 5 rows');
   assert.equal(after.version,newId);
   if(process.env.WP3_EXPECT_GRID_HEALTH==='1'){
    await page.waitForFunction(()=>document.querySelector('[data-testid=workspace-grid-health]')?.dataset.visible==='5',null,{timeout:7500});
    const h=await page.locator('[data-testid=workspace-grid-health]').getAttribute('data-total');
    const shown=await page.locator('[data-testid=workspace-grid-health]').getAttribute('data-visible');
    const label=await page.locator('[data-testid=workspace-grid-health-message]').textContent();
    console.log('WP3_DIAGNOSTIC_BEFORE_ASSERT',JSON.stringify({engine,h,shown,label,coords:await page.locator('[data-testid=workspace-grid-geometry]').textContent()}));
    assert.equal(h,'5');assert.equal(shown,'5');assert.ok(label.includes('AG 模型 5 / 筛后 5 / 渲染 5'),label);
    if(process.env.WP3_REQUIRE_VISIBLE_MOUNT==='1'){
     const m=/初建宽 (\d+) \/ 容器 (\d+)×/.exec(label);
     assert.ok(m,'mount geometry metadata missing: '+label);
     const initial=Number(m[1]),actual=Number(m[2]);
     assert.ok(initial>100&&Math.abs(initial-actual)<20,
       'AG grid was constructed in parked, not visible, host: '+label);
     console.log('WP3_VISIBLE_BEFORE_GRID_CONSTRUCTION_PASS',JSON.stringify({engine,initial,actual}));
    }
    const coords=await page.locator('[data-testid=workspace-grid-geometry]').textContent();
    assert.ok(coords.includes('行按钮')&&coords.includes('滚动视口')&&coords.includes('样式'),coords);
    assert.ok(!coords.includes('Buffett')&&!coords.includes('/ocr2md/'),'diagnostic must not expose user filenames or paths');
    if(process.env.WP3_REQUIRE_CSS_TOP==='1'){
     const positioning=await page.evaluate(()=>{
      const row=document.querySelector('[data-testid="workspace-ag"] .ag-row');
      if(!row)return null;
      const style=getComputedStyle(row);
      return {top:style.top,transform:style.transform,inline:row.getAttribute('style')};
     });
     assert.ok(positioning,'AG first row must exist');
     assert.ok(positioning.top!=='auto' && positioning.transform==='none',JSON.stringify(positioning));
     console.log('WP3_CSS_TOP_POSITIONING_PASS',JSON.stringify({engine,positioning}));
    }
    if(process.env.WP3_REQUIRE_VISIBLE_MOUNT==='1'){
     // Query the ACTUAL final DOM coordinates, not just the earlier timer label.
     await page.waitForTimeout(9000);
     const final=await page.evaluate(()=>{
      const grid=document.querySelector('[data-testid="workspace-ag"]');
      const button=grid?.querySelector('.workspace-entry');
      if(!grid||!button)return null;
      const host=grid.getBoundingClientRect(),row=button.getBoundingClientRect();
      return {relativeRowY:Math.round(row.top-host.top),height:Math.round(host.height),
       visibleRowCount:[...grid.querySelectorAll('.workspace-entry')].filter(e=>{
        const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom>host.top&&r.top<host.bottom;
       }).length};
     });
     if(final&&final.relativeRowY>100){
      const layout=await page.evaluate(()=>{
       const g=document.querySelector('[data-testid="workspace-ag"]');if(!g)return null;
       const box=g.getBoundingClientRect();
       const area=g.querySelector('.ag-grid-scrollable-area');
       const siblings=area?[...area.children].map(el=>{const r=el.getBoundingClientRect(),cs=getComputedStyle(el);
        return {tag:el.tagName,classes:String(el.className).slice(0,200),y:Math.round(r.top-box.top),height:Math.round(r.height),
          display:cs.display,flex:cs.flex,position:cs.position,top:cs.top,transform:cs.transform,margin:cs.margin,padding:cs.padding};}):[];
       const names=['.ag-grid-viewport','.ag-grid-scrollable-area','.ag-grid-scrolling-header','.ag-header','.ag-grid-scrolling-rows','.ag-grid-scrolling-container','.ag-row'];
       return names.map(q=>{const n=g.querySelector(q);if(!n)return {q,missing:true};const r=n.getBoundingClientRect(),cs=getComputedStyle(n);
        return {q,y:Math.round(r.y-box.y),height:Math.round(r.height),display:cs.display,position:cs.position,
        flex:cs.flex,transform:cs.transform,top:cs.top,overflow:cs.overflow,children:n.children.length};}).concat([{q:'direct-children',siblings}]);
      });
      console.log('WP3_BAD_ROW_ANCESTORS',JSON.stringify({engine,layout}));
     }
     assert.ok(final&&final.visibleRowCount===5&&final.relativeRowY>=35&&final.relativeRowY<=100,
      'row coordinates stayed displaced after stable render: '+JSON.stringify(final));
     console.log('WP3_ROWS_STABLE_POSITION_PASS',JSON.stringify({engine,final}));
    }
    if(process.env.WP3_REQUIRE_DARK_GRID==='1'){
     const palette=await page.evaluate(()=>{
      const grid=document.querySelector('[data-testid="workspace-ag"]');
      const row=grid?.querySelector('.ag-row'),root=grid?.querySelector('.ag-root-wrapper');
      const header=grid?.querySelector('.ag-header');
      return {gridBackground:getComputedStyle(grid).backgroundColor,
        rootBackground:root&&getComputedStyle(root).backgroundColor,
        headerBackground:header&&getComputedStyle(header).backgroundColor,
        textColor:root&&getComputedStyle(root).color,
        rowBackground:row&&getComputedStyle(row).backgroundColor,
        variable:grid&&getComputedStyle(grid).getPropertyValue('--ag-background-color').trim(),
        diagnosticHidden:document.querySelector('[data-testid="workspace-grid-health"]')?.hidden};
     });
     const dark=color=>color&&/^rgba?\(/.test(color)&&
        (color.match(/[\d.]+/g)?.slice(0,3)??[]).every(v=>Number(v)<100);
     assert.ok(dark(palette.rootBackground),JSON.stringify(palette));
     const headerH=await page.evaluate(()=>{
      const header=document.querySelector('[data-testid="workspace-ag"] .ag-header');
      return header?Math.round(header.getBoundingClientRect().height):-1;
     });
     assert.equal(headerH,40,'AG header must remain 40px on mobile WebKit');
     assert.ok(palette.diagnosticHidden,'successful grid should not show diagnostic panel');
     console.log('WP3_DARK_AG_GRID_PASS',JSON.stringify({engine,palette}));
     if(process.env.WP3_REQUIRE_PINNED_SPACER_GUARD==='1'){
      // Reproduce the 218px pinned-top spacer from the failed production
      // 0816->1400 WebKit test. The fix must override even inline dimensions.
      const guard=await page.evaluate(()=>{
       const grid=document.querySelector('[data-testid="workspace-ag"]');
       const pinned=grid?.querySelector('.ag-grid-pinned-top-rows');
       const row=grid?.querySelector('.workspace-entry');
       if(!grid||!pinned||!row)return null;
       pinned.style.setProperty('height','218px');
       pinned.style.setProperty('flex-basis','218px');
       pinned.style.setProperty('min-height','218px');
       const base=grid.getBoundingClientRect();
       return {pinnedHeight:Math.round(pinned.getBoundingClientRect().height),
        firstRowY:Math.round(row.getBoundingClientRect().top-base.top),
        empty:!pinned.querySelector('.ag-row')};
      });
      assert.ok(guard?.empty&&guard.pinnedHeight===40&&guard.firstRowY>=35&&guard.firstRowY<=100,
       'empty pinned top row spacer displaces rows: '+JSON.stringify(guard));
      console.log('WP3_PINNED_SPACER_GUARD_PASS',JSON.stringify({engine,guard}));
     }

    }
    console.log('WP3_GRID_HEALTH_NORMAL',JSON.stringify({engine,h,shown,label,coords}));
   }
  }catch(error){console.log('WP3_REAL_5_ROWS_FAILED',engine,String(error).slice(0,300));process.exitCode=1}
  finally{await page.close()}
 }finally{await browser.close()}
}
