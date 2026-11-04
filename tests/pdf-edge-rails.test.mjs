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

// Exercise every one of the 22 original PDF pages, not just the screenshot.
// The physical frame never moves; labels are separate page-rail geometry.
import {readFileSync} from 'node:fs';
import {toMarkdown} from '../packages/minerujson-md/dist/index.js';
import {queryCMDLayout} from '../ui/cmd-text-blocks.js';
const src=toMarkdown(readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8'));
const physical=await queryCMDLayout(src);
let total=0;
for(const [index,page] of physical.pages.entries()){
  const rectangles=[];const rows=[];
  const P=`p${index}`;
  const add=(id,bbox,kind)=>{
    const [left,top,right,bottom]=bbox;
    rectangles.push({left,top,right,bottom});
    rows.push({id,side:(left+right)/2<=page.pageSize[0]/2?'left':'right',
      kind,target:{left,top,right,bottom},anchorY:(top+bottom)/2,
      width:11+id.length*6.2,height:kind==='parent'?18:16});
  };
  for(const block of page.regions){
    add(`${P}b${block.blockIndex}`,block.bbox,'parent');
    for(const sub of block.subRegions||[])add(`${P}b${block.blockIndex}s${sub.path.join('.')}`,
      sub.bbox,'child');
  }
  const out=layoutPDFEdgeRails(rows,{pageWidth:page.pageSize[0],
    pageHeight:page.pageSize[1],covers:rectangles});
  assert.equal(out.slots.length,rows.length,`page ${index+1} drops labels`);
  assert.equal(out.leaders.length,rows.length,`page ${index+1} drops leaders`);
  for(const slot of out.slots){
    assert(slot.width>0&&slot.height>0,`page ${index+1} nonvisible label`);
    for(const box of rectangles)
      assert(!intersect(slot,{left:box.left,top:box.top,
        width:box.right-box.left,height:box.bottom-box.top}),
        `page ${index+1} label ${slot.id} overlaps coverage`);
    for(const other of out.slots.filter(x=>x!==slot))
      assert(!intersect(slot,other),
        `page ${index+1} labels ${slot.id} & ${other.id} overlap`);
  }
  total+=rows.length;
}
console.log('PDF_22_PAGE_GLOBAL_RAILS_NO_COLLISION_PASS',{pages:physical.pages.length,labels:total});
