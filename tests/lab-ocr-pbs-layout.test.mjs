/** Direct test: page-side labels, disjoint layouts, dense disclosure ownership. */
import assert from 'node:assert/strict';
import {layoutPbsLabels} from '../ui/lab-ocr/pbs-label-layout.js';
const item=(i,x=24,y=i*19)=>({pbs:'p1b'+i,blockId:String(i+1),bbox:[x,y,x+48,y+11]});
const normal=layoutPbsLabels([item(0),item(1),item(2),item(3,270,5),item(4,270,8)],320,340);
assert.equal(normal.length,5);
for(const side of ['left','right']){
 const tags=normal.filter(x=>x.side===side);
 for(let i=1;i<tags.length;i++)assert(tags[i].top>=tags[i-1].top+26);
 assert(tags.every(x=>x.top>=4&&x.top+23<=336));
}
const dense=layoutPbsLabels(Array.from({length:94},(_,i)=>item(i,23,i*5)),300,220);
assert(dense.length<=8);
assert.deepEqual(dense.flatMap(x=>x.items.map(y=>y.blockId)),Array.from({length:94},(_,i)=>String(i+1)));
assert(dense.some(x=>x.items.length>1));
for(let i=1;i<dense.length;i++)assert(dense[i].top>=dense[i-1].top+26);
assert(dense.at(-1).top+23<=216);
assert.deepEqual(layoutPbsLabels([],300,300),[]);
console.log('LAB_OCR_PBS_LAYOUT_PASS',JSON.stringify({normal:normal.length,dense:dense.length,covered:94}));
