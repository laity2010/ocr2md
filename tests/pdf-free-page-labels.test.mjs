/** Every PDF block keeps its original full-size label; true page whitespace
 * is used on both sides and below content, without touching OCR geometry. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {toMarkdown} from '../packages/minerujson-md/dist/index.js';
import {queryCMDLayout} from '../ui/cmd-text-blocks.js';
import {layoutPDFFreePageLabels} from '../ui/pdf-gutter-label-layout.js';
const intersects=(a,b)=>a.left<b.right-.4&&b.left<a.left+a.width-.4&&
  a.top<b.bottom-.4&&b.top<a.top+a.height-.4;
const validate=(items,covers,width,height,label)=>{
  const result=layoutPDFFreePageLabels(items,{pageWidth:width,pageHeight:height,covers});
  assert.equal(result.slots.length,items.length,`${label}: each native PBS ID must be visible`);
  assert.equal(result.leaders.length,items.length,`${label}: one-to-one leader`);
  assert.deepEqual(result.slots.map(s=>s.id).sort(),items.map(s=>s.id).sort());
  assert.deepEqual(layoutPDFFreePageLabels(items,{pageWidth:width,pageHeight:height,covers}),
    result,`${label}: pure deterministic output`);
  for(const slot of result.slots){
    assert(slot.left>=2&&slot.top>=2&&slot.left+slot.width<=width-2+
      .2&&slot.top+slot.height<=height-2+.2,`${label}: escaped page: ${slot.id}`);
    for(const cover of covers)
      assert(!intersects(slot,cover),`${label}: OCR cover collision: ${slot.id}`);
    for(const other of result.slots)if(slot!==other){
      const apart=slot.left+slot.width+8.5<=other.left||
        other.left+other.width+8.5<=slot.left||
        slot.top+slot.height+8.5<=other.top||
        other.top+other.height+8.5<=slot.top;
      assert(apart,`${label}: tags too tightly packed: ${slot.id} and ${other.id}`);
    }
  }
  return result;
};
// The left gutter can hold at most a handful of labels near y=100. Their
// targets all sit in a broad middle text column; both edges and the lower
// page are available. Packing never hides or collapses a PBS ID.
const cover={left:95,top:65,right:365,bottom:345};
const burst=Array.from({length:18},(_,i)=>({id:`p0b${i}`,side:'left',kind:'parent',
  width:54,height:24,anchorY:115+i*.6,target:cover}));
const synthetic=validate(burst,[cover],460,520,'synthetic 18 labels');
assert.equal(synthetic.scale,1,'must use other page space before shrinking labels');
assert(synthetic.slots.some(s=>s.left<95)&&synthetic.slots.some(s=>s.left>=365),
  'use both left and right gutters on one PDF paper');
const bottomCover={left:0,top:0,right:460,bottom:420};
const bottomRows=Array.from({length:7},(_,i)=>({id:`p1b${i}`,side:'left',kind:'parent',
  width:54,height:24,anchorY:100+i,target:bottomCover}));
const bottom=validate(bottomRows,[bottomCover],460,520,'bottom-only free area');
assert(bottom.slots.every(s=>s.top>=420),
  'page-bottom whitespace must be used if side gutters are blocked');
const source=toMarkdown(readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8'));
const physical=await queryCMDLayout(source);
let checked=0,shrunk=0;
for(const [index,page] of physical.pages.entries()){
  const covers=[],raw=[];
  const add=(id,bbox,kind)=>{
    const [left,top,right,bottom]=bbox;
    const target={left,top,right,bottom};covers.push(target);
    raw.push({id,side:(left+right)/2<=page.pageSize[0]/2?'left':'right',
      kind,target,anchorY:(top+bottom)/2,
      width:11+id.length*6.2,height:kind==='parent'?18:16});
  };
  for(const region of page.regions){
    add(`p${index}b${region.blockIndex}`,region.bbox,'parent');
    for(const sub of region.subRegions||[])
      add(`p${index}b${region.blockIndex}s${sub.path.join('.')}`,sub.bbox,'child');
  }
  for(const factor of [.5,1,1.5,2.5]){
    const rows=raw.map(r=>({...r,width:r.width*factor,height:r.height*factor}));
    const result=validate(rows,covers,...page.pageSize,`PDF ${index+1} scale ${factor}`);
    if(factor===1.5)assert.equal(result.scale,1,`page ${index+1}: 1.5x must not shrink`);
    if(result.scale<1)shrunk++;
    checked+=rows.length;
  }
}
console.log('PDF_FREE_PAGE_LAYOUT_PASS',JSON.stringify({pages:physical.pages.length,checked,shrunk}));
