/** Direct Settings IO contract: defaults, persistence, bounds, Lab isolation. */
import assert from 'node:assert/strict';
import {createFrameSettingsIO} from '../ui/frame/settings-io.js';
const storage=()=>{
  const items=new Map();
  return {getItem:key=>items.get(key)??null,setItem:(key,value)=>items.set(key,value),items};
};
const s=storage();
const io=createFrameSettingsIO(s,'lab-ocr',()=>'',async path=>({path}));
assert.deepEqual(io.getInitialOverlayStyle(),{borderWidth:0.75,transparency:65});
const original=await io.readSnapshot();
const data=JSON.parse(original.text);
for(const [key,value,min,max,step] of [
  ['pdf.overlay.borderWidth',0.5,0.25,3,0.25],
  ['pdf.overlay.transparency',80,0,95,5],
])data.settings[key]={key:key.split('.').at(-1),category1:'PDF 原文',category2:'覆盖框',
  comment:key,value,range:{min,max,step}};
await io.saveSnapshot({text:JSON.stringify(data,null,2)+'\n',etag:original.etag});
assert.deepEqual(io.getInitialOverlayStyle(),{borderWidth:0.5,transparency:80});
for(const [key,bad] of [['pdf.overlay.borderWidth',0.1],['pdf.overlay.borderWidth',3.25],
  ['pdf.overlay.transparency',97],['pdf.overlay.transparency',-5]]){
  const current=await io.readSnapshot();
  const altered=JSON.parse(current.text);
  altered.settings[key].value=bad;
  await assert.rejects(io.saveSnapshot({text:JSON.stringify(altered),etag:current.etag}),/设置值无效/);
  assert.deepEqual(io.getInitialOverlayStyle(),{borderWidth:0.5,transparency:80});
}
const frame=createFrameSettingsIO(storage(),'lab-frame');
assert.deepEqual(frame.getInitialOverlayStyle(),{borderWidth:0.75,transparency:65});
const frameSnapshot=await frame.readSnapshot();
await frame.saveSnapshot(frameSnapshot);
console.log('LAB_OCR_OVERLAY_SETTINGS_IO_PASS');
