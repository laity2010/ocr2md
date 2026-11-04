/** Exact A-after-B insertion: fixed B ID, numeric shift (not swap), bbox. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {toMarkdown} from '../packages/minerujson-md/dist/index.js';
import {planCMDInsertPBSParentAfter,planCMDAbsorbReviewedParent,readCMDBlockChains,
  projectCMDBlockTable} from '../ui/cmd-block-chains.js';
import {readCMDPBSLocations} from '../ui/cmd-pbs-locations.js';
import {inspectCMDTextBlocks,queryCMDLayout} from '../ui/cmd-text-blocks.js';
const original=toMarkdown(readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8'));
const archived=s=>s.slice(s.indexOf('<!-- minerujson:source:v1:'));
function apply(source,plan){
  return [...plan.edits].sort((a,b)=>b.from-a.from).reduce((s,e)=>{
    assert.equal(s.slice(e.from,e.to),e.expected,'planned edit must match live source');
    return s.slice(0,e.from)+e.insert+s.slice(e.to);
  },source);
}
function checked(source,A,B){
  const before=readCMDBlockChains(source);
  const plan=planCMDInsertPBSParentAfter(source,A,B);
  if(!plan.changed)return {text:source,plan};
  const text=apply(source,plan),after=readCMDBlockChains(text);
  assert.deepEqual(after.invalid,[]);
  assert.equal(after.atoms.length,before.atoms.length);
  assert.equal(archived(text),archived(source));
  const originalTarget=before.atoms.find(x=>x.id===B);
  const originalSource=before.atoms.find(x=>x.id===A);
  assert(after.atoms.some(x=>x.id===B&&x.origin===originalTarget.origin),'B ID/geometry must stay');
  assert(after.atoms.some(x=>x.id===plan.newId&&x.origin===originalSource.origin),'A destination ID/geometry');
  assert.equal(plan.newId,`p${/^p(\d+)/.exec(B)[1]}b${Number(/b(\d+)/.exec(B)[1])+1}`);
  const oldOrigins=before.atoms.map(x=>`${x.origin}|${x.role||''}`).sort();
  const newOrigins=after.atoms.map(x=>`${x.origin}|${x.role||''}`).sort();
  assert.deepEqual(newOrigins,oldOrigins,'Every physical OCR block stays intact');
  for(const atom of after.atoms){
    if(Object.hasOwn(plan.renamed,atom.id))continue;
    if(Object.values(plan.renamed).includes(atom.id))
      assert.equal(atom.rawLine,`<!-- cmd:block:v1 id="${atom.id}" -->`);
  }
  const order=after.atoms.filter(x=>x.kind==='parent').map(x=>x.id);
  assert.equal(order.indexOf(plan.newId),order.indexOf(B)+1,'source A must follow B whole group');
  assert(!text.includes('<!-- cmd:absorbed-parent:v1'));
  console.log('PBS_INSERT_AFTER_PASS',A,'after',B,'=>',plan.newId,'shifted',plan.shifted.length);
  return {text,plan,after};
}
const cases=[['p1b9','p1b0'],['p1b2','p1b4'],['p1b3','p1b4'],
  ['p1b5','p1b6'],['p0b16','p1b0'],['p1b4','p0b3'],
  ['p21b20','p20b0'],['p1b5','p21b20']];
for(const [a,b] of cases)checked(original,a,b);
let data=checked(original,'p1b9','p1b0');
assert.equal(data.after.atoms.find(x=>x.id==='p1b0').origin,'p1b0');
assert.equal(data.after.atoms.find(x=>x.id==='p1b1').origin,'p1b9');
assert.equal(data.after.atoms.find(x=>x.id==='p1b2').origin,'p1b1');
assert.equal(data.after.atoms.find(x=>x.id==='p1b9').origin,'p1b8');
// Native subblocks follow the moving parent and take the new parent's id.
const native=checked(original,'p1b3','p1b0');
assert(native.after.atoms.some(x=>x.id==='p1b1s0'&&x.origin==='p1b3s0'));
// B's old ID remains fixed when A was earlier; its suffix shifts right.
const earlier=checked(original,'p1b2','p1b4');
assert.equal(earlier.after.atoms.find(x=>x.id==='p1b4').origin,'p1b4');
assert.equal(earlier.after.atoms.find(x=>x.id==='p1b5').origin,'p1b2');
assert.equal(earlier.after.atoms.find(x=>x.id==='p1b6').origin,'p1b5');
const cross=checked(original,'p1b5','p2b0');
assert.equal(cross.after.atoms.find(x=>x.id==='p2b1').origin,'p1b5');
assert.equal(cross.after.atoms.find(x=>x.id==='p2b2').origin,'p2b1');
assert.equal(readCMDPBSLocations(cross.text).bindings.p2b1,'p1b5');
const inventory=await inspectCMDTextBlocks(cross.text),layout=await queryCMDLayout(cross.text);
const ag=projectCMDBlockTable(cross.text,inventory.rows,layout,cross.after,inventory.children);
const moved=ag.rows.find(x=>x.id==='p2b1'),pre=layout.pages[1].regions.find(x=>x.blockIndex===5);
assert.equal(moved.pageIndex,1,'logical page 3 ID should still have physical PDF page 2');
assert.deepEqual(moved.bbox,pre.bbox);
assert(!ag.rows.some(x=>x.id==='p1b5'));
const joined=apply(original,planCMDAbsorbReviewedParent(original,'p1b3','p1b4'));
const afterJoin=checked(joined,'p1b4','p1b0');
assert(afterJoin.after.atoms.some(x=>x.id==='p1b1s0'&&x.role==='body'));
assert(afterJoin.after.atoms.some(x=>x.id==='p1b1s1'&&x.origin==='p1b3s0'));
assert.equal(readCMDPBSLocations(afterJoin.text).removed.includes('p1b3'),true);
const noOp=checked(original,'p1b1','p1b0');
assert.equal(noOp.plan.changed,0,'already after B is inert');
console.log('PBS_INSERT_AFTER_ALL_PASS');
