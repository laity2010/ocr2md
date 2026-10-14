/** Chromium+WebKit: normal V4 path, rendered AG/source and persistence.
 * No browser test touches the Mac Vault or V3 storage.
 */
import {chromium,webkit} from '../../../../web-component-platform/node_modules/playwright/index.mjs';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {setTimeout as sleep} from 'node:timers/promises';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const staged=process.env.WCP_STAGE==='1';
const sharedStaged=process.env.SHARED_STAGE==='1';
const expectedSharedVersion=process.env.V4_EXPECTED_SHARED_VERSION??JSON.parse(await readFile(resolve('../agent-link-monitor/web/shared-settings/v1/manifest.json'),'utf8')).stable;
const expectedWcp=process.env.V4_EXPECTED_WCP_VERSION??JSON.parse(await readFile(resolve('../web-component-platform/package.json'),'utf8')).version;
const stageRoot=resolve('../web-component-platform');
const candidate=staged?await readFile(resolve(stageRoot,'.release-stage/wcp-workbench.js')):null;
const stageHash=candidate?createHash('sha256').update(candidate).digest('hex'):null;
const port=await new Promise((resolve,reject)=>{
  const s=createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{
    const p=s.address().port;s.close(()=>resolve(p));
  });
});
const base=process.env.V4_TEST_ORIGIN??'http://127.0.0.1:'+port;
const server=process.env.V4_TEST_ORIGIN?null:spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1','--directory',process.env.V4_TEST_STATIC_ROOT??'ui-spikes/v2'],
  {cwd:process.cwd(),stdio:'ignore'});
let healthy=false;
for(let i=0;i<90;i++){
  try{const r=await fetch(base+'/v4-directory/');if(r.ok){healthy=true;break;}}catch{}
  await sleep(220);
}
if(!healthy)throw Error('V4_TEST_SERVER_UNAVAILABLE');
try{
for(const [engine,browserType] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await browserType.launch(engine==='chromium'?{channel:'chrome',headless:true}:{headless:true});
 try{
  const page=await browser.newPage({viewport:engine==='webkit'?{width:820,height:1180}:{width:1260,height:850}});
  if(staged){
    const url='https://wcp.laity.bid/components/v1/';
    const loader=await readFile(resolve(stageRoot,'src/loader.js'),'utf8');
    await page.route(url+'**',async route=>{
      const path=new URL(route.request().url()).pathname;
      const headers={'access-control-allow-origin':'*','content-type':'text/javascript'};
      if(path.endsWith('/loader.js'))await route.fulfill({status:200,headers,body:loader});
      else if(path.endsWith('/manifest.json'))await route.fulfill({status:200,headers:{...headers,'content-type':'application/json'},
        body:JSON.stringify({schemaVersion:1,stable:expectedWcp,previous:'0.1.5',
          releases:[{version:expectedWcp,tag:'laity-wcp-workbench-v'+expectedWcp.replaceAll('.','-'),
            entry:'releases/'+expectedWcp+'/wcp-workbench.js',sha256:stageHash,size:candidate.length}]})});
      else if(path.endsWith('/releases/'+expectedWcp+'/wcp-workbench.js'))
        await route.fulfill({status:200,headers,body:candidate});
      else await route.abort('blockedbyclient');
    });
  }
  if(sharedStaged){
    const root=resolve('../agent-link-monitor/shared-settings/.release-stage');
    const [settings,grid]=await Promise.all([
      readFile(resolve(root,'settings-panel.js')),
      readFile(resolve(root,'settings-grid.js')),
    ]);
    await page.route('https://agent-link.laity.bid/shared-settings/v1/**',async route=>{
      const url=new URL(route.request().url());
      const headers={'access-control-allow-origin':'*','content-type':'text/javascript'};
      if(url.pathname.endsWith('/manifest.json'))await route.fulfill({
        status:200,headers:{...headers,'content-type':'application/json'},
        body:JSON.stringify({name:'Laity Shared App Settings',version:expectedSharedVersion}),
      });
      else if(url.pathname.endsWith('/settings-panel.js'))await route.fulfill({status:200,headers,body:settings});
      else if(url.pathname.endsWith('/settings-grid.js'))await route.fulfill({status:200,headers,body:grid});
      else await route.continue();
    });
  }
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.addInitScript(()=>{
    if(!location.pathname.startsWith('/v4-directory/'))return;
    // Existing user data from both earlier generations must remain untouched.
    const legacy={
      'ocr2md-v3-directory-settings-v1':JSON.stringify({gridFontSize:18,workbenchGridFontSize:16}),
      'ocr2md-v4-settings-v1':JSON.stringify({gridFontSize:17,workbenchGridFontSize:15})
    };
    for(const [key,value] of Object.entries(legacy)){
      if(localStorage.getItem(key)===null)localStorage.setItem(key,value);
    }
  });
  await page.goto(base+'/v4-directory/',{waitUntil:'domcontentloaded',timeout:30000});
  assert.equal(await page.locator('#tab-settings').getAttribute('aria-selected'),'true');
  assert.equal(await page.locator('.v3-top-row [role="tab"]').count(),2,'only installed visible modules have tabs');
  assert.equal(await page.locator('#tab-workbench,#panel-workspace,#panel-workbench,#workbench-path-nav').count(),0);
  assert.equal(await page.locator('[data-module-status="workbench"]').count(),0);
  await page.waitForFunction(()=>window.__ocr2mdV4?.phase==='ready',null,{timeout:60000});
  const app=await page.evaluate(()=>({modules:window.__ocr2mdV4.modules,version:window.__ocr2mdV4.version}));
  assert.deepEqual(app.modules,['ocr2md:settings','ocr2md:filesystem','ocr2md:workspace']);
  assert.equal(app.version,expectedWcp,'WCP version '+app.version);
  const panel=page.locator('#settings-shared');
  await panel.waitFor({timeout:45000});
  await page.waitForFunction(()=>{
    const n=document.querySelector('laity-wcp-workbench-v'+window.__ocr2mdV4.version.replaceAll('.','-'))?.shadowRoot?.querySelector('#settings-shared');
    return n?.dataset.ready==='true'&&n?.dataset.sourceReady==='true';
  },null,{timeout:60000});
  assert.equal(await panel.getAttribute('app-id'),'ocr2md-v4');
  assert.equal(await panel.getAttribute('chrome'),'external');
  const expectedShared=await panel.evaluate(e=>e.version);
  assert.equal(expectedShared,expectedSharedVersion,'shared settings must load the requested published version');
  const inventory=page.locator('#v4-component-dialog');
  assert.equal(await inventory.isVisible(),false,'version dialog initially closed');
  await page.locator('#v4-version-trigger').click();
  await inventory.waitFor({state:'visible'});
  const entries=await page.locator('#v4-component-list .v4-component-item').evaluateAll(elements=>
    elements.map(el=>({id:el.dataset.componentId,
      name:el.querySelector('.v4-component-name')?.firstChild?.textContent,
      version:el.querySelector('.v4-component-version')?.textContent})));
  assert.deepEqual(entries.map(e=>e.id),['app:ocr2md','platform:wcp','ocr2md:workspace','ocr2md:filesystem','shared:settings']);
  assert.deepEqual(entries.map(e=>e.version),['4.1.3',expectedWcp,'1.0.0','1.0.0',expectedShared]);
  assert.deepEqual(entries.map(e=>e.name),['OCR2MD 工作台','WCP Web 组件平台','工作目录','只读文件服务','通用设置 UI']);
  assert.equal(await page.locator('#v4-component-list [data-component-id="ocr2md:settings"]').count(),0,
    'data/configuration adapter is not a standalone component');
  assert.equal(await page.locator('#v4-component-list').getByText('媒体',{exact:true}).count(),0);
  assert.equal(await page.locator('#v4-component-list').getByText('工作目录',{exact:true}).count(),0);
  const popup=await inventory.boundingBox();
  assert.ok(popup&&popup.x>=0&&popup.x+popup.width<=await page.evaluate(()=>innerWidth),
    'dialog must fit viewport');
  await page.locator('#v4-component-close').click();
  assert.equal(await inventory.isVisible(),false);
  await page.locator('#v4-version-trigger').focus();
  await page.keyboard.press('Enter');
  await inventory.waitFor({state:'visible'});
  await page.keyboard.press('Escape');
  assert.equal(await inventory.isVisible(),false,'Escape closes dialog');
  await page.locator('#v4-version-trigger').click();
  await inventory.waitFor({state:'visible'});
  await page.mouse.click(2,2);
  assert.equal(await inventory.isVisible(),false,'backdrop click closes dialog');
  const pluginChrome=await page.evaluate(()=>{
    const el=document.querySelector('laity-wcp-workbench-v'+window.__ocr2mdV4.version.replaceAll('.','-'));
    const root=el?.shadowRoot;
    return {menus:root?.querySelector('plugin-menu')?.plugins?.length,
      chromeHidden:root?.querySelector('.app-header')&&getComputedStyle(root.querySelector('.app-header')).display==='none',
      owner:root?.querySelector('[data-module-owner]')?.dataset.moduleOwner};
  });
  assert.equal(pluginChrome.chromeHidden,true,'no duplicate WCP app header');
  assert.equal(pluginChrome.menus,2,'registered two view modules');
  assert.equal(pluginChrome.owner,'ocr2md:settings');
  const schema=await page.evaluate(()=>document.querySelector('laity-wcp-workbench-v'+window.__ocr2mdV4.version.replaceAll('.','-'))?.shadowRoot?.querySelector('#settings-shared')?.settingsSchema);
  const count=schema.length;
  assert.equal(count,5,'only installed Settings UI owns editable configuration');
  assert.deepEqual(schema.map(s=>s.id),['sourceFontSize','sourceLineHeight','sourceComments','previewHeight','accentColor']);
  assert.ok(schema.every(s=>s.group==='设置界面'),'no workspace/workbench groups before installation');
  assert.ok(schema.every(s=>s.component==='通用设置 UI'&&s.featureGroup),'explicit module/group semantics');
  assert.equal(await panel.getAttribute('table-layout'),'components');
  const columns=await panel.evaluate(e=>e._gridApi.getAllDisplayedColumns().map(column=>({field:column.getColId(),header:column.getColDef().headerName})));
  assert.deepEqual(columns,[
    {field:'componentModule',header:'组件模块'},
    {field:'featureGroup',header:'功能组'},
    {field:'enabled',header:'启用'},
    {field:'parameterName',header:'参数名'},
  ]);
  const displayed=await panel.evaluate(e=>e._rows().map(row=>[row.componentModule,row.featureGroup,row.parameterName]));
  assert.deepEqual(displayed,[
    ['通用设置 UI','源码外观','源码字号'],
    ['通用设置 UI','源码外观','源码行距'],
    ['通用设置 UI','源码外观','源码注释'],
    ['通用设置 UI','面板布局','预览窗高度'],
    ['通用设置 UI','色彩','强调色'],
  ]);
  await panel.evaluate(e=>e.selectSetting('sourceFontSize'));
  const preview=panel.locator('[data-role="preview"]');
  assert.equal(await preview.getAttribute('aria-label'),'值预览');
  assert.equal(await preview.getAttribute('data-preview-key'),'sourceFontSize');
  const fact=key=>preview.locator('[data-preview-field="'+key+'"]');
  assert.equal(await fact('component').innerText(),'通用设置 UI');
  assert.equal(await fact('feature-group').innerText(),'源码外观');
  assert.equal(await fact('parameter-name').innerText(),'源码字号');
  assert.equal(await fact('parameter-id').innerText(),'sourceFontSize');
  assert.equal(await fact('type').innerText(),'integer');
  assert.equal(await fact('current-value').innerText(),'13');
  assert.equal(await fact('default-value').innerText(),'13');
  assert.equal(await fact('permission').innerText(),'可编辑');
  assert.equal(await preview.locator('.las-preview-note').getByText('通用设置 UI 源码窗口字号（11–24 px）').count(),1);
  await preview.locator('.las-preview-definition summary').click();
  assert.match(await fact('definition').innerText(),/"component": "通用设置 UI"/);
  assert.match(await fact('definition').innerText(),/"featureGroup": "源码外观"/);
  await panel.evaluate(e=>e.selectSetting('sourceComments'));
  assert.equal(await fact('current-value').innerText(),'true');
  assert.equal(await preview.locator('[data-preview-boolean="true"]').count(),1);
  const longValue=await panel.evaluate(()=>{
    const isolated=document.createElement('laity-settings-panel');
    isolated.setAttribute('table-layout','components');
    const output=document.createElement('section');
    isolated._els={preview:output};
    isolated._schema=[{id:'complex',label:'长内容',component:'示例组件',
      featureGroup:'正文',description:'完整内容必须保留',type:'object',
      defaultValue:{text:'D'.repeat(700)},readOnly:false}];
    isolated._activeKey='complex';
    isolated._values={complex:{text:'X'.repeat(900)}};
    isolated._renderPreview();
    return {
      current:output.querySelector('[data-preview-field="current-value"]')?.textContent,
      defaults:output.querySelector('[data-preview-field="default-value"]')?.textContent,
      full:output.querySelector('[data-preview-field="definition"]')?.textContent,
    };
  });
  assert.equal(JSON.parse(longValue.current).text,'X'.repeat(900),'preview current value must never truncate');
  assert.equal(JSON.parse(longValue.defaults).text,'D'.repeat(700),'preview default value must never truncate');
  assert.match(longValue.full,/"description": "完整内容必须保留"/);
  await panel.evaluate(e=>e.selectSetting('sourceFontSize'));
  assert.equal(await panel.evaluate(e=>e.style.getPropertyValue('--las-source-font-size')),'13px');
  const old=await page.evaluate(()=>({
    v3:localStorage.getItem('ocr2md-v3-directory-settings-v1'),
    v4legacy:localStorage.getItem('ocr2md-v4-settings-v1'),
  }));
  await panel.evaluate(e=>e._commitGridValue(e._schema.find(s=>s.id==='sourceFontSize'),15));
  await page.waitForFunction(()=>document.querySelector('laity-wcp-workbench-v'+window.__ocr2mdV4.version.replaceAll('.','-'))?.shadowRoot?.querySelector('#settings-shared')?.style.getPropertyValue('--las-source-font-size')==='15px');
  await page.locator('#settings-save').click();
  await page.waitForFunction(()=>{const item=localStorage.getItem('ocr2md-v4-ui-settings-v1');return item&&JSON.parse(item).sourceFontSize===15},null,{timeout:15000});
  assert.deepEqual(await page.evaluate(()=>({
    v3:localStorage.getItem('ocr2md-v3-directory-settings-v1'),
    v4legacy:localStorage.getItem('ocr2md-v4-settings-v1'),
  })),old);
  await page.reload();
  await page.waitForFunction(()=>window.__ocr2mdV4?.phase==='ready',null,{timeout:60000});
  await page.waitForFunction(()=>document.querySelector('laity-wcp-workbench-v'+window.__ocr2mdV4.version.replaceAll('.','-'))?.shadowRoot?.querySelector('#settings-shared')?.dataset.ready==='true',null,{timeout:60000});
  assert.equal(await page.evaluate(()=>document.querySelector('laity-wcp-workbench-v'+window.__ocr2mdV4.version.replaceAll('.','-'))?.shadowRoot?.querySelector('#settings-shared')?.values.sourceFontSize),15);
  assert.equal(await panel.evaluate(e=>e.style.getPropertyValue('--las-source-font-size')),'15px');
  await panel.evaluate(e=>e._commitGridValue(e._schema.find(s=>s.id==='sourceFontSize'),13));
  await page.locator('#settings-save').click();
  await page.waitForFunction(()=>{const x=localStorage.getItem('ocr2md-v4-ui-settings-v1');return x&&JSON.parse(x).sourceFontSize===13});
  assert.deepEqual(errors,[]);
  console.log('V4_SETTINGS_BROWSER_PASS',engine,'WCP',app.version,'schema',count,'chrome',pluginChrome.chromeHidden);
 }finally{await browser.close()}
}
}finally{server?.kill('SIGTERM')}
