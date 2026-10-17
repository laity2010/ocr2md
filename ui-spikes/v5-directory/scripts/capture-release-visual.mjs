/** Mandatory post-publication visual smoke test of V5's ONE live release.
 * Fresh browser context: no user cookies, no Vault key, no private file content.
 * Evidence is stored outside published assets and outside Git.
 * A screenshot is necessary evidence, not a replacement for agent visual review.
 */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile,readFile,chmod} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const repo=resolve(root,'../..');
const require=createRequire(import.meta.url);
const {webkit}=require(resolve(root,'../../../web-component-platform/node_modules/playwright'));
const origin=process.env.OCR2MD_VISUAL_ORIGIN||'https://192.168.1.10:4443';
const expected=process.argv[2]||'';
// This exact metadata belongs to the single published stage. The actual
// browser check below proves the live HTTPS page is using the same build.
// Do not bypass TLS verification in Node to read LAN release-info.json.
const info=JSON.parse(await readFile(resolve(repo,'.runtime/ocr2md-public/release-info.json'),'utf8'));
assert(/^v5-\d{6}-\d{6}$/.test(info.buildId),'Bad V5 build ID');
if(expected)assert.equal(info.buildId,expected,'Visual screenshot must use JUST deployed build');
const dir=resolve(repo,'.runtime/ocr2md-build-evidence',info.buildId);
await mkdir(dir,{recursive:true,mode:0o700});
await chmod(dir,0o700);
const proof={buildId:info.buildId,origin,engine:'webkit',viewport:{width:1032,height:642},
 screenshots:[],checks:{},status:'pending'};
let browser;
const save=async(page,label)=>{
 const path=resolve(dir,label+'.png');
 const buf=await page.screenshot({path,animations:'disabled',timeout:10000});
 await chmod(path,0o600);
 const rec={file:label+'.png',bytes:buf.length,sha256:createHash('sha256').update(buf).digest('hex')};
 assert(buf.length>20000,'Screenshot empty or blank: '+label);
 proof.screenshots.push(rec);
};
try{
 browser=await webkit.launch();
 const context=await browser.newContext({viewport:proof.viewport,deviceScaleFactor:2,
   ignoreHTTPSErrors:origin.startsWith('https://192.168.')});
 const page=await context.newPage(),pageErrors=[];
 page.on('pageerror',e=>pageErrors.push(String(e.message).slice(0,400)));
 await page.goto(origin+'/?build='+info.buildId,{waitUntil:'domcontentloaded',timeout:30000});
 await page.waitForFunction(()=>window.__ocr2mdV5?.phase==='ready',null,{timeout:45000});
 await page.waitForFunction(()=>document.querySelector('laity-settings-panel')?.dataset.wcpLayout==='tripane',
   null,{timeout:55000});
 const build=await page.locator('.wcp-app-build').innerText();
 assert.equal(build.trim(),info.buildId,'Visible build badge mismatch');
 const inventory=await page.evaluate(()=>window.__ocr2mdV5.instance.getComponents().map(x=>x.id));
 assert(inventory.includes('ocr2md:workspace')&&inventory.includes('shared:settings'),
   'Registered components missing');
 const parameterIds=await page.evaluate(()=>
   document.querySelector('laity-settings-panel')?.getVisibleSettingIds());
 assert(parameterIds?.includes('workspaceRemember30Days'),'Workspace remember setting absent');
 const rows=await page.evaluate(()=>
   document.querySelector('laity-settings-panel')?.getComponentRows());
 assert(rows.some(x=>x.componentModule==='工作目录'&&x.parameterName==='记住此设备 30 天'),
   'Workspace settings AG row absent');
 const settingsColumns=await page.evaluate(()=>
   document.querySelector('laity-settings-panel')._gridApi.getColumnDefs().map(x=>x.headerName));
 assert(settingsColumns.includes('参数值'),'Settings is missing user-editable value column');
 await page.evaluate(()=>{
   const grid=document.querySelector('laity-settings-panel')._gridApi;
   const row=grid.getRowNode('workspaceRemember30Days');
   if(!row)throw Error('WORKSPACE_SETTING_ROW_MISSING_FROM_AG');
   grid.ensureNodeVisible(row,'middle');
 });
 await page.getByRole('tab',{name:'设置'}).click();
 await page.locator('laity-settings-panel').waitFor({state:'visible'});
 await page.locator('[row-id="workspaceRemember30Days"] [col-id="value"]').waitFor({state:'visible'});
 await save(page,'settings');
 await page.getByRole('tab',{name:'工作目录'}).click();
 const workspace=page.locator('[data-testid="workspace-component"]');
 await workspace.waitFor({state:'visible',timeout:20000});
 await page.locator('[data-testid="workspace-ag"]').waitFor({state:'attached'});
 const workspaceHandle=await workspace.elementHandle();
 await page.waitForFunction(root=>root?.querySelector('.ws-layout')?.getBoundingClientRect().height>300
   &&document.querySelector('.wcp-app-toolbar-title')?.hidden===true,
   workspaceHandle,{timeout:18000});
 const layout=await workspace.evaluate(root=>{
   const rect=selector=>{
     const element=selector.startsWith('.wcp-app-')?document.querySelector(selector):root.querySelector(selector);
     if(!element)return null;
     const r=element.getBoundingClientRect();
     return {top:r.top,bottom:r.bottom,height:r.height,width:r.width};
   };
   return {toolbar:rect('.wcp-app-toolbar'),
    actions:rect('.wcp-app-module-actions'),
    toolbarTitleHidden:document.querySelector('.wcp-app-toolbar-title')?.hidden,
    toolbarPath:document.querySelector('.wcp-app-toolbar-context')?.textContent,
    workspace:(()=>{const r=root.getBoundingClientRect();return{top:r.top,bottom:r.bottom,height:r.height,width:r.width}})(),
    agRegion:rect('.ws-layout'),
    buttons:[...document.querySelectorAll('.wcp-app-module-actions [data-action]')].map(x=>({
      id:x.dataset.action,rect:(()=>{const r=x.getBoundingClientRect();
       return{left:r.left,right:r.right,top:r.top,bottom:r.bottom}})()})),
    duplicateToolbar:document.querySelectorAll('[data-testid="workspace-module-tools"]').length};
 });
 const expectedActions=['workspace-parent','workspace-refresh','workspace-set-root','workspace-layout-mode'];
 assert.deepEqual(layout.buttons.map(x=>x.id),expectedActions,
   'Workspace controls must be registered in the WCP module action bar');
 assert.equal(layout.duplicateToolbar,0,'Workspace must not add an inner toolbar');
 assert(layout.toolbar.height<60 && layout.toolbarTitleHidden===true && !layout.toolbarPath,
   'Workspace toolbar must show actions only, without redundant title/path');
 assert(layout.agRegion.top>=layout.toolbar.bottom && layout.agRegion.height>=300,
   'AG content is obstructed by the workspace controls');
 assert(layout.buttons.every(x=>x.rect.left>=layout.toolbar.width*(-0.02)
   &&x.rect.right<=layout.toolbar.width+8),'Workspace toolbar buttons exceed viewport');
 const loginVisible=await page.locator('[data-testid="workspace-connect"]').isVisible();
 const status=await page.locator('[data-testid="workspace-status"]').innerText();
 assert(loginVisible,'Fresh browser context unexpectedly bypassed Vault login');
 assert(!/加载失败|TypeError|ReferenceError/.test(status),'Workspace load error');
 await save(page,'workspace');
 // A narrow WebKit layout is also captured to expose horizontal overflow.
 await page.setViewportSize({width:390,height:844});
 await page.waitForTimeout(450);
 const narrow=await workspace.evaluate(root=>({viewport:innerWidth,
   scrollWidth:document.documentElement.scrollWidth,
   agHeight:root.querySelector('.ws-layout')?.getBoundingClientRect().height,
   toolbarHeight:document.querySelector('.wcp-app-toolbar')?.getBoundingClientRect().height,
   buttons:[...document.querySelectorAll('.wcp-app-module-actions button')].map(x=>{
    const r=x.getBoundingClientRect();return {id:x.dataset.action,width:r.width,height:r.height};
   })}));
 assert(narrow.scrollWidth<=narrow.viewport+4,
   'Workspace layout causes horizontal overflow in narrow Safari');
 assert(narrow.toolbarHeight<60 && narrow.buttons.every(b=>b.height<42),
   'Narrow module buttons wrap or exceed the toolbar height');
 await save(page,'workspace-narrow');
 assert.deepEqual(pageErrors,[],'Browser JS errors');
 proof.checks={visibleBuild:build.trim(),registered:inventory,
  settingPresent:true,workspaceVisible:true,loginRequired:loginVisible,layout,narrow,pageErrors:[]};
 proof.status='pass';
 console.log('V5_POST_BUILD_VISUAL_PASS',JSON.stringify({buildId:info.buildId,dir,
   screenshots:proof.screenshots.map(x=>x.file),checks:proof.checks}));
}catch(e){
 proof.status='failed';proof.error=String(e?.stack||e).slice(0,1400);
 console.error('V5_POST_BUILD_VISUAL_FAILED',proof.error);
 throw e;
}finally{
 if(browser)await browser.close();
 const path=resolve(dir,'report.json');
 await writeFile(path,JSON.stringify(proof,null,2)+'\n',{mode:0o600});
 await chmod(path,0o600);
}
