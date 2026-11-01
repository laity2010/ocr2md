import assert from 'node:assert/strict';
import {layoutPDFGutterLabels} from '../ui/pdf-gutter-label-layout.js';
const source=[
 {id:'p4b0',from:89,to:339,height:18},
 {id:'p4b0s0',from:89,to:119,height:15},
 {id:'p4b0s1',from:122,to:310,height:15},
 {id:'p4b0s2',from:317,to:339,height:15},
 {id:'p4b1',from:351,to:400,height:18},
 {id:'p4b1s0',from:351,to:377,height:15},
];
const layout=layoutPDFGutterLabels(source,783);
assert.equal(layout.length,source.length);
assert.deepEqual(layout.map(x=>x.id).sort(),source.map(x=>x.id).sort());
assert.deepEqual(layoutPDFGutterLabels(source,783),layout,'deterministic');
for(const item of layout){
  assert(item.top>=item.from-1&&item.top+item.height<=item.to+1,
    `${item.id} must stay within its own bbox vertical range when feasible`);
  for(const peer of layout){
    if(item.id===peer.id)continue;
    assert(item.top+item.height+1<=peer.top||peer.top+peer.height+1<=item.top,
      `parent and children overlap: ${item.id} ${peer.id}`);
  }
}
// Two narrow OCR caption bboxes near one another can compete for one row.
// Keep both visible and use an adjacent free row, never discard the child.
const crowded=layoutPDFGutterLabels([
 {id:'p0b1',from:100,to:120,height:18},
 {id:'p0b1s0',from:100,to:106,height:14},
 {id:'p0b1s1',from:104,to:110,height:14},
 {id:'p0b1s2',from:108,to:114,height:14},
],450);
assert.equal(crowded.length,4);
for(let i=0;i<crowded.length;i++)for(let j=i+1;j<crowded.length;j++){
  const a=crowded[i],b=crowded[j];
  assert(a.top+a.height+1<=b.top||b.top+b.height+1<=a.top);
}
assert.equal(layoutPDFGutterLabels([],500).length,0);
console.log('PDF_GUTTER_LABEL_LAYOUT_PASS',layout);
