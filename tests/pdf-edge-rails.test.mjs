import assert from 'node:assert/strict';
import {layoutPDFEdgeRails} from '../ui/pdf-gutter-label-layout.js';
const covers=[{left:90,top:90,right:435,bottom:400},
 {left:515,top:650,right:895,bottom:760},
 {left:610,top:650,right:765,bottom:695},
 {left:610,top:680,right:840,bottom:743}];
const items=[
 {id:'p16b10',side:'right',kind:'parent',width:70,height:18,anchorY:658,target:covers[1]},
 {id:'p16b10s0',side:'right',kind:'child',width:85,height:16,anchorY:658,target:covers[1]},
 {id:'p16b10s1',side:'right',kind:'child',width:85,height:16,anchorY:711,target:covers[2]},
 {id:'p16b9',side:'right',kind:'parent',width:60,height:18,anchorY:550,target:{left:515,right:880,top:510,bottom:560}},
 {id:'p16b8',side:'left',kind:'parent',width:60,height:18,anchorY:600,target:covers[0]},
 {id:'p16b11',side:'left',kind:'parent',width:60,height:18,anchorY:720,target:covers[0]}
];
const output=layoutPDFEdgeRails(items,{pageWidth:1000,pageHeight:850,covers});
assert.equal(output.slots.length,items.length);
assert.equal(output.leaders.length,items.length);
const intersect=(a,b)=>a.left<b.left+b.width&&b.left<a.left+a.width&&
 a.top<b.top+b.height&&b.top<a.top+a.height;
const a=output.slots;
for(const label of a){
  assert(label.left>=0&&label.top>=0&&label.top+label.height<=850);
  const l={left:label.left,top:label.top,width:label.width,height:label.height};
  for(const c of covers){
    assert(!intersect(l,{left:c.left,top:c.top,width:c.right-c.left,height:c.bottom-c.top}),
      'label overlaps a PDF bbox: '+label.id);
  }
  for(const other of a.filter(x=>x!==label))
    assert(!intersect(l,other),'labels overlap: '+label.id+' with '+other.id);
  assert(output.leaders.some(x=>x.id===label.id&&x.path.includes(' V ')));
}
assert(a.find(x=>x.id==='p16b10s0').left>=895,
  'right-side label should remain outside the rightmost PDF bbox');
console.log('PDF_EDGE_RAILS_NO_OVERLAP_PASS',a.map(x=>({id:x.id,left:x.left,top:x.top,scale:x.scale})));
