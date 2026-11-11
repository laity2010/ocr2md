import assert from 'node:assert/strict';
import test from 'node:test';
import {createFrameSettingsIO} from '../ui/frame/settings-io.js';
const KEY='ocr2md.lab-frame.settings.json.v1';
const memory=(initial=[])=>{
  const entries=new Map(initial);
  return {entries,getItem:k=>entries.get(k)??null,setItem:(k,v)=>entries.set(k,v)};
};
const registered=text=>{
  const obj=JSON.parse(text);
  obj.settings['globalUi.font.family']={key:'family',category1:'全局 UI',category2:'字体',
    comment:'Sarasa Fixed SC，只读',value:'Sarasa',range:{kind:'readonly'}};
  return obj;
};

test('F06 frame settings IO defaults and saves only on explicit Main Settings Save',async()=>{
  const store=memory();const io=createFrameSettingsIO(store);
  assert.equal(io.getInitialSize(),16);
  const initial=await io.readSnapshot();
  assert.equal(store.entries.size,0,'no implicit write on read');
  const next=registered(initial.text);
  next.settings['globalUi.font.size'].value=23;
  await io.saveSnapshot({text:JSON.stringify(next,null,2),etag:initial.etag});
  assert.equal(store.entries.size,1);
  assert.equal(store.entries.get(KEY).includes('23'),true);
  assert.equal(createFrameSettingsIO(store).getInitialSize(),23);
  await assert.rejects(io.saveSnapshot({text:JSON.stringify(next),etag:initial.etag}),/版本已更新/);
});

test('F06 refuses unauthorized family and out-of-bound font size, preserves prior settings',async()=>{
  const store=memory();const io=createFrameSettingsIO(store);
  const first=await io.readSnapshot();
  const bad=registered(first.text);
  bad.settings['globalUi.font.family'].value='Arial';
  await assert.rejects(io.saveSnapshot({text:JSON.stringify(bad),etag:first.etag}),/设置值无效/);
  bad.settings['globalUi.font.family'].value='Sarasa';
  bad.settings['globalUi.font.size'].value=33;
  await assert.rejects(io.saveSnapshot({text:JSON.stringify(bad),etag:first.etag}),/设置值无效/);
  assert.equal(store.entries.size,0);
});

test('F06 preserves legacy lab-frame font preference, never touches Main or Media',async()=>{
  const store=memory([['ocr2md.lab-frame.font-size.v1','19']]);
  const io=createFrameSettingsIO(store);
  assert.equal(io.getInitialSize(),19);
  assert.equal((await io.readSnapshot()).text.includes('19'),true);
  assert.deepEqual([...store.entries.keys()],['ocr2md.lab-frame.font-size.v1']);
});
