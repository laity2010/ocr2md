/** V1 ACTUAL EnumCheckboxFilter: checkbox model and transient row data contract.
 * Uses the real source in a DOM, not a mocked implementation or static grep.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium,webkit} from 'playwright';
const source=readFileSync(new URL('../../labs/lab-ocr/ui/enum-checkbox-filter.js',import.meta.url),'utf8');
for(const [name,engine] of [['Chromium',chromium],['iPad-WebKit',webkit]]){
  const browser=await engine.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1032,height:642},hasTouch:true});
    await page.goto('about:blank');
    const init=await page.evaluate(async script=>{
      const uri=URL.createObjectURL(new Blob([script],{type:'text/javascript'}));
      const {EnumCheckboxFilter}=await import(uri);
      URL.revokeObjectURL(uri);
      let rows=[{type:'text'},{type:'title'},{type:'table'}],changes=0;
      const component=new EnumCheckboxFilter();
      component.init({
        colDef:{headerName:'Type'},
        api:{forEachLeafNode:visitor=>rows.forEach(data=>visitor({data}))},
        getValue:node=>node.data.type,
        filterChangedCallback:()=>{changes++},
      });
      document.body.append(component.getGui());
      window.contract={component,
        get changes(){return changes},get rows(){return rows},set rows(next){rows=next}};
      return {values:component.values,all:component.getModel(),
        hasNativeGUI:document.querySelector('.ocr-enum-filter[aria-label="Type 筛选"]')!==null};
    },source);
    assert.deepEqual(init.values,['table','text','title']);
    assert.equal(init.all,null);
    assert.equal(init.hasNativeGUI,true);
    const select=value=>page.locator(`.ocr-enum-filter [data-filter-value="${value}"] input`);
    assert.equal(await select('all').isChecked(),true);
    await select('text').uncheck();
    await select('title').uncheck();
    let state=await page.evaluate(()=>({model:window.contract.component.getModel(),
      visible:window.contract.rows.filter(row=>window.contract.component.doesFilterPass({node:{data:row}})).map(x=>x.type),
      changes:window.contract.changes}));
    assert.deepEqual(state.model.values,['table']);
    assert.deepEqual(state.visible,['table']);
    assert.equal(state.changes,2);
    await select('text').check();
    state=await page.evaluate(()=>window.contract.component.getModel());
    assert.deepEqual([...state.values].sort(),['table','text'],'multi checkbox filter must support 2 values');
    // A temporary empty client row-model update is NOT permission to reset a filter.
    await page.evaluate(()=>{const c=window.contract;c.rows=[];c.component.onNewRowsLoaded()});
    assert.deepEqual((await page.evaluate(()=>window.contract.component.getModel())).values.sort(),['table','text']);
    await page.evaluate(()=>{
      const c=window.contract;c.rows=[{type:'title'},{type:'table'},{type:'text'}];
      c.component.onNewRowsLoaded();
    });
    assert.equal(await select('text').isChecked(),true);
    await page.evaluate(()=>window.contract.component.setModel({values:['title']}));
    assert.deepEqual((await page.evaluate(()=>window.contract.component.getModel())).values,['title']);
    assert.equal(await select('all').isChecked(),false);
    await select('all').check();
    assert.equal(await page.evaluate(()=>window.contract.component.getModel()),null);
    assert.equal(await select('all').isChecked(),true);
    assert.equal(await page.evaluate(()=>window.contract.changes),4);
    console.log('V1_ENUM_CHECKBOX_FILTER_BROWSER_PASS',name,'all/multi/clear/transient/restore');
  }finally{await browser.close()}
}
