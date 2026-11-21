/** Direct API: no grouping; every PBS retains its Y and moves X to a free rail. */
import assert from 'node:assert/strict';
import {layoutPbsLabels} from '../ui/lab-ocr/pbs-label-layout.js';
const item=(i,x=24,y=i*19)=>({pbs:'p1b'+i,blockId:String(i+1),bbox:[x,y,x+48,y+11]});
const normal=layoutPbsLabels([item(0),item(1),item(2),item(3,270,5),item(4,270,8)],320,340);
assert.equal(normal.length,5);
assert(normal.some(tag=>tag.side==='left')&&normal.some(tag=>tag.side==='right'));
const surge=layoutPbsLabels([item(0,24,40),item(1,24,45),item(2,24,90)],320,340);
assert.deepEqual(surge.map(tag=>tag.lane),[0,1,0],'After congestion, restore inner rail');
assert.deepEqual(surge.map(tag=>tag.anchorY),[45.5,50.5,95.5], 'Original vertical anchors unchanged');
const both=layoutPbsLabels([item(0,24,40),item(1,24,42),item(2,270,40),item(3,270,42)],320,340);
assert.deepEqual(both.filter(tag=>tag.side==='left').map(tag=>tag.lane),[0,1]);
assert.deepEqual(both.filter(tag=>tag.side==='right').map(tag=>tag.lane),[0,1]);
const dense=layoutPbsLabels(Array.from({length:94},(_,i)=>item(i,23,i*5)),300,220);
assert.equal(dense.length,94,'Never collapse any PBS even on a tiny crowded page');
assert(dense.every(tag=>tag.items===undefined),'No disclosure stacks');
assert.deepEqual(dense.map(tag=>tag.blockId).sort((a,b)=>Number(a)-Number(b)),Array.from({length:94},(_,i)=>String(i+1)));
for(const tags of [normal,dense,both]){
 for(const side of ['left','right']){
  const rails=new Map();
  for(const tag of tags.filter(x=>x.side===side)){
   assert(tag.top>=4&&tag.top+23<=340,'Position valid for normal page height');
   const previous=rails.get(tag.lane);
   if(previous!==undefined)assert(tag.top>=previous+26,`Same rail overlap at ${side}/${tag.lane}`);
   rails.set(tag.lane,tag.top);
  }
 }
}
assert.deepEqual(layoutPbsLabels([],300,300),[]);
console.log('LAB_OCR_PBS_LAYOUT_PASS',JSON.stringify({normal:normal.length,dense:dense.length,deepestLane:Math.max(...dense.map(t=>t.lane))}));
