/** Canonical Shared Settings v0.1.14: fixed AG rows + JSONC source + previews. */
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const path=require('node:path');
const fs=require('node:fs');
const {chromium,webkit}=require('../../v2/node_modules/@playwright/test');
const root=path.resolve(__dirname,'..');
const port=31000+Math.floor(Math.random()*24500),url=`http://127.0.0.1:${port}/index.html`;
const engine=process.env.OCR2MD_TEST_WEBKIT==='1'?'webkit':'chromium';
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1','--directory',root],{stdio:'ignore'});
(async()=>{let browser;
try{
  for(let i=0;i<90;i++){try{if((await fetch(url)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await (engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{headless:true}:{channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1100,height:850}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  // Deterministic local fixture of the *actual published network-owned assets*;
  // CDN variability is verified separately, not allowed to flake UI regressions.
  const network=path.resolve(root,'../../../agent-link-monitor/web');
  await page.route('https://agent-link.laity.bid/**',async route=>{
    const name=new URL(route.request().url()).pathname;
    const target=path.resolve(network,'.'+name);
    if(!target.startsWith(network+'/')||!fs.existsSync(target))return route.continue();
    await route.fulfill({status:200,
      contentType:name.endsWith('.json')?'application/json':name.endsWith('.css')?'text/css':name.endsWith('.woff2')?'font/woff2':'text/javascript',
      headers:{'access-control-allow-origin':'*','cache-control':'no-store'},
      body:fs.readFileSync(target)});
  });
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.getByTestId('tab-settings').click();
  await page.waitForFunction(()=>document.querySelector('#settings-shared')?.dataset.ready==='true'
    && document.querySelector('#settings-shared')?.dataset.sourceReady==='true',null,{timeout:25000});
  const panel=page.locator('#settings-shared');
  assert.equal(await panel.evaluate(element=>element.version),'0.1.14');
  const noDescription=await panel.locator('.ag-header-cell-text').allTextContents();
  assert.ok(!noDescription.includes('说明'),'no AG description column; description lives only in preview');
  await page.waitForFunction(()=>document.querySelectorAll('#settings-shared .ag-row').length>=3,null,{timeout:7000});
  const rows=await panel.locator('.ag-row').evaluateAll(elements=>elements.map(e=>e.getBoundingClientRect().height));
  assert.ok(rows.length>=3&&rows.every(height=>Math.abs(height-40)<2),JSON.stringify(rows));
  // Slim AG Grid must retain editable cells, text filters and sorting.
  const agFeatures=await panel.evaluate(e=>{
    const api=e._gridApi;
    const total=api.getDisplayedRowCount();
    const allColumns=api.getColumns();
    const value=api.getColumn('value');
    const row=api.getRowNode('gridFontSize');
    api.ensureIndexVisible(row.rowIndex,'middle');
    api.startEditingCell({rowIndex:row.rowIndex,colKey:'value'});
    const editingCells=api.getEditingCells?.();
    const editing=Array.isArray(editingCells)&&editingCells.some(x=>x.column.getColId()==='value');
    api.stopEditing(true);
    api.setFilterModel({value:{type:'contains',filter:'compact'}});
    const filtered=api.getDisplayedRowCount();
    api.setFilterModel(null);
    api.applyColumnState({state:[{colId:'parameterName',sort:'asc'}]});
    const sorted=api.getColumnState().some(x=>x.colId==='parameterName'&&x.sort==='asc');
    api.applyColumnState({state:[{colId:'parameterName',sort:null}]});
    return {total,filtered,editing,sorted,hasValue:!!value,colCount:allColumns.length};
  });
  assert.ok(agFeatures.total>10&&agFeatures.hasValue&&agFeatures.colCount>=5,JSON.stringify(agFeatures));
  assert.ok(agFeatures.editing&&agFeatures.sorted,JSON.stringify(agFeatures));
  assert.ok(agFeatures.filtered<agFeatures.total,JSON.stringify(agFeatures));
  const source=panel.locator('laity-source-surface');
  const sourceText=await source.evaluate(e=>e.value);
  assert.ok(sourceText.includes('// gridFontSize — 目录表格字体字号'));
  assert.ok(sourceText.includes('// mdHardReturnColor — 所有源码窗'));
  assert.ok(sourceText.includes('"gridFontSize":'));
  // Syntax classification is implemented by the central Shared Source
  // CodeMirror component (shadow DOM), NOT by a local OCR2MD editor.
  const syntax=await source.evaluate(element=>{
    const shadow=element.shadowRoot;
    return {mode:element.getAttribute('syntax'),
      roles:['key','string','number','boolean','comment','operator','bracket'].map(role=>({
        role,count:shadow.querySelectorAll(`[data-syntax-role="${role}"]`).length,
        color:shadow.querySelector(`[data-syntax-role="${role}"]`)?
          getComputedStyle(shadow.querySelector(`[data-syntax-role="${role}"]`)).color:null,
      }))};
  });
  assert.equal(syntax.mode,'jsonc');
  assert.ok(syntax.roles.every(x=>x.count>0),JSON.stringify(syntax.roles));
  assert.equal(new Set(syntax.roles.map(x=>x.color)).size,7,
    'keys, strings, numbers, booleans, comments, operators and brackets must have distinct computed colors');
  // Color swatch + three actionable candidates in lower panel.
  await panel.evaluate(e=>e.selectSetting('mdHardReturnColor'));
  const preview=panel.locator('.las-preview');
  await page.waitForFunction(()=>document.querySelector('#settings-shared .las-preview')?.dataset.previewKey==='mdHardReturnColor');
  assert.ok((await preview.locator('.las-preview-note').first().textContent()).includes('硬回车标记颜色'));
  assert.equal(await preview.locator('.las-preview-swatch').count(),1);
  const slots=preview.locator('[data-preview-color-slot]');
  assert.equal(await slots.count(),3);
  assert.equal(await slots.filter({has:page.locator('i')}).count(),3);
  const chosen=await slots.nth(0).getAttribute('aria-label');
  const color=chosen.match(/#[0-9a-f]{6}/i)?.[0];
  assert.ok(color,chosen);
  await slots.nth(0).click();
  await page.waitForFunction(next=>document.querySelector('#settings-shared')?.values.mdHardReturnColor===next,color);
  assert.equal(await page.evaluate(()=>localStorage.getItem('ocr2md-v3-directory-settings-v1')),null,
    'preview actions modify draft, not persisted settings');
  assert.ok((await source.evaluate(e=>e.value)).includes('// mdHardReturnColor'));
  assert.ok((await source.evaluate(e=>e.value)).includes(`"mdHardReturnColor": "${color}"`));
  await page.getByTestId('settings-save').click();
  await page.waitForFunction(next=>JSON.parse(localStorage.getItem('ocr2md-v3-directory-settings-v1')||'{}').mdHardReturnColor===next,color);
  const saved=await page.evaluate(()=>localStorage.getItem('ocr2md-v3-directory-settings-v1'));
  assert.ok(!saved.includes('//'),'persisted JSON must remain comment-free');
  assert.ok(JSON.parse(saved).mdHardReturnColor===color);
  // Boolean radio-like two-choice control.
  await panel.evaluate(e=>e.selectSetting('mdShowHardReturns'));
  await page.waitForFunction(()=>document.querySelector('#settings-shared .las-preview')?.dataset.previewKey==='mdShowHardReturns');
  const booleans=preview.locator('[data-preview-boolean]');
  assert.equal(await booleans.count(),2);
  await preview.locator('[data-preview-boolean="false"]').click();
  await page.waitForFunction(()=>document.querySelector('#settings-shared').values.mdShowHardReturns===false);
  assert.equal(await preview.locator('[data-preview-boolean="false"]').getAttribute('aria-pressed'),'true');
  assert.equal(await preview.locator('[data-preview-boolean="true"]').getAttribute('aria-pressed'),'false');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('ocr2md-v3-directory-settings-v1')).mdShowHardReturns),true);
  await page.getByTestId('settings-save').click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('ocr2md-v3-directory-settings-v1')).mdShowHardReturns===false);
  // Source editing while comments remain (including nested JSON + selected descriptions).
  await source.evaluate(e=>{
    const annotated=e.value;
    e.value=annotated.replace('"gridFontSize": 14','"gridFontSize": 16');
  });
  await page.waitForFunction(()=>document.querySelector('#settings-shared').values.gridFontSize===16);
  await page.getByTestId('settings-save').click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('ocr2md-v3-directory-settings-v1')).gridFontSize===16);
  await source.evaluate(e=>e.value='// broken draft\n{"gridFontSize":99}');
  await page.getByTestId('settings-save').click();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('ocr2md-v3-directory-settings-v1')).gridFontSize),16);
  // Vault authorization is still an independent sibling, never part of preview.
  assert.equal(await panel.locator('#vault-key').count(),0);
  assert.equal(await page.locator('#panel-settings > #settings-connection-details').count(),1);
  // Narrow Safari/iPhone layout: preview stays UNDER the source, not over it.
  await page.setViewportSize({width:390,height:844});
  await panel.evaluate(e=>e.refresh());
  await page.waitForTimeout(180);
  const mobile=await panel.evaluate(e=>{
    const box=selector=>e.querySelector(selector).getBoundingClientRect();
    return {ag:box('.las-grid').height,source:box('.las-code-host').height,
      preview:box('.las-preview').height,
      sourceBottom:box('.las-code-host').bottom,
      previewTop:box('.las-preview').top};
  });
  assert.ok(mobile.ag>80&&mobile.source>75&&mobile.preview>85,JSON.stringify(mobile));
  assert.ok(mobile.previewTop>=mobile.sourceBottom-3,JSON.stringify(mobile));
  assert.ok((await source.evaluate(e=>e.shadowRoot.querySelectorAll('[data-syntax-role="comment"]').length))>0);
  assert.deepEqual(errors,[]);
  console.log('V3_SETTINGS_PARAMETER_PREVIEW_PASS',JSON.stringify({engine,version:'0.1.14',equalRows:true,descriptionOutsideGrid:true,jsonComments:true,colorSlots:3,booleanChoices:2,draftSave:true,syntaxRoles:syntax.roles.map(x=>x.role)}));
}catch(error){console.error('V3_SETTINGS_PARAMETER_PREVIEW_FAIL',error);process.exitCode=1;}
finally{await browser?.close();server.kill('SIGTERM');}
})();
