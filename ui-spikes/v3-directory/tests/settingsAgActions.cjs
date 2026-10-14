/** Shared Agent Link settings v0.1.10 test adapter. No app-specific AG editor.
 * Locate keys by the shared panel's PUBLIC selectSetting/values API. */
const draftByPage=new WeakMap();
async function ready(page){
  await page.waitForFunction(()=>{
    const p=document.querySelector('#settings-shared');
    return p?.dataset.ready==='true'&&p?.dataset.sourceReady==='true';
  },null,{timeout:22000});
}
async function settingValue(page,key){
  await ready(page);
  await page.evaluate(name=>document.querySelector('#settings-shared').selectSetting(name),key);
  await page.waitForFunction(name=>document.querySelector('#settings-shared')?.dataset.linkedKey===name,key);
  return page.locator('#settings-shared .las-linked-row').first();
}
async function setSetting(page,key,value){
  await ready(page);
  const next=draftByPage.get(page)??await page.evaluate(()=>
    structuredClone(document.querySelector('#settings-shared').values));
  const parts=key.split('.');
  if(parts.length===1)next[key]=value;
  else next[parts[0]][Array.isArray(next[parts[0]])?Number(parts[1]):parts[1]]=value;
  draftByPage.set(page,next);
  await page.evaluate(({name,values})=>{
    const panel=document.querySelector('#settings-shared');
    panel.selectSetting(name);
    panel.querySelector('laity-source-surface').value=JSON.stringify(values,null,2);
  },{name:parts[0],values:next});
  await page.waitForFunction(({key,value})=>{
    const p=document.querySelector('#settings-shared');
    const got=p?.values?.[key];
    return JSON.stringify(got)===JSON.stringify(value);
  },{key:parts[0],value:next[parts[0]]},{timeout:7000});
}
module.exports={ready,settingValue,setSetting};
