/** Same-parent child insertion: full scopes and physical provenance preserved. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {toMarkdown} from '../packages/minerujson-md/dist/index.js';
import {planCMDReorderPBSChildren,readCMDBlockChains,
  projectCMDBlockTable,planCMDAbsorbReviewedParent} from '../ui/cmd-block-chains.js';
import {readCMDPBSLocations} from '../ui/cmd-pbs-locations.js';
import {resolvePDFFragmentId} from '../ui/pdf-pbs-fragment-id.js';
import {inspectCMDTextBlocks,queryCMDLayout} from '../ui/cmd-text-blocks.js';
const original=toMarkdown(readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8'));
const tail=x=>x.slice(x.indexOf('<!-- minerujson:source:v1:'));
function apply(source,plan){return [...plan.edits].sort((a,b)=>b.from-a.from).reduce((s,e)=>{
  assert.equal(s.slice(e.from,e.to),e.expected,'edit range must be the original source snapshot');
  return s.slice(0,e.from)+e.insert+s.slice(e.to);
},source);}
function assertMove(source,from,target,placement,expectedOrigins){
  const before=readCMDBlockChains(source);
  const plan=planCMDReorderPBSChildren(source,from,target,placement);
  assert.equal(plan.changed,2,'single CM6 transaction with scope + physical footer');
  const next=apply(source,plan),after=readCMDBlockChains(next);
  assert.deepEqual(after.invalid,[]);
  assert.equal(after.atoms.length,before.atoms.length);
  assert.equal(tail(next),tail(source),'sealed MinerU JSON untouched');
  assert.deepEqual(before.atoms.map(x=>x.origin).sort(),after.atoms.map(x=>x.origin).sort());
  const ids=after.atoms.filter(x=>x.id.startsWith('p4b0s')&&!x.id.includes('.'));
  assert.deepEqual(ids.map(x=>x.id),['p4b0s0','p4b0s1','p4b0s2']);
  assert.deepEqual(ids.map(x=>x.origin),expectedOrigins);
  const locations=readCMDPBSLocations(next);
  assert.deepEqual(ids.map(x=>locations.bindings[x.id]||x.id),expectedOrigins);
  // Source content is attached to the exact same physical subblock after the move.
  const physicalText=new Map(before.atoms.filter(x=>x.id.startsWith('p4b0s')).map((atom,i,arr)=>[
    atom.origin,source.slice(atom.from,before.atoms[before.atoms.indexOf(atom)+1]?.from||source.length)
      .replace(atom.rawLine,'').trim().split('\n').filter(x=>x&&!x.startsWith('<!--')).join('\n').slice(0,45)]));
  for(const atom of ids){
    const index=after.atoms.indexOf(atom),text=next.slice(atom.from,after.atoms[index+1]?.from??next.length);
    const signature=physicalText.get(atom.origin);
    if(signature)assert(text.includes(signature.slice(0,25)),`${atom.id} must retain original ${atom.origin} content`);
  }
  return {next,plan,model:after};
}
const before=assertMove(original,'p4b0s2','p4b0s0','before',
  ['p4b0s2','p4b0s0','p4b0s1']);
assert.equal(before.plan.newId,'p4b0s0');
const after=assertMove(original,'p4b0s0','p4b0s2','after',
  ['p4b0s1','p4b0s2','p4b0s0']);
assert.equal(after.plan.newId,'p4b0s2');
assert.equal(planCMDReorderPBSChildren(original,'p4b0s0','p4b0s1','before').changed,0);
assert.equal(planCMDReorderPBSChildren(original,'p4b0s1','p4b0s0','after').changed,0);
assert.equal(planCMDReorderPBSChildren(original,'p4b0s0','p4b0s0','after').changed,0);
assert.throws(()=>planCMDReorderPBSChildren(original,'p4b0s2','p4b1s0','before'),/same parent/);
assert.throws(()=>planCMDReorderPBSChildren(original,'p4b0','p4b0s0','after'),/direct children/);
const layout=await queryCMDLayout(before.next),inventory=await inspectCMDTextBlocks(before.next);
const rows=projectCMDBlockTable(before.next,inventory.rows,layout,before.model,inventory.children).rows;
for(let i=0;i<3;i++){
  const id=`p4b0s${i}`,row=rows.find(x=>x.id===id);
  assert.equal(row?.origin,['p4b0s2','p4b0s0','p4b0s1'][i]);
  const physical=layout.pages[4].regions.find(x=>x.blockIndex===0)?.subRegions
    .find(x=>x.path[0]===Number(row.origin.split('s')[1]));
  assert.deepEqual(row.bbox,physical.bbox,'PDF bbox must follow immutable original s index');
}
const nativeChildren=Object.fromEntries(rows.filter(x=>x.kind==='child'&&x.parentId==='p4b0')
  .map(x=>[x.origin,x.id]));
assert.equal(resolvePDFFragmentId({nativeChildren},{path:[2],role:'note'},'p4b0s2'),'p4b0s0');
assert.equal(resolvePDFFragmentId({nativeChildren},{path:[0],role:'caption'},'p4b0s0'),'p4b0s1');
console.log('CMD_SAME_PARENT_CHILD_INSERT_BEFORE_AFTER_PASS');

// p13b1s3 has physical origin p13b0, a formerly independent OCR parent.
// It has its own PDF cover, not a native .ocr-pdf-block-fragment chip.
const absorbed=apply(original,planCMDAbsorbReviewedParent(original,'p13b0','p13b1'));
for(const [a,b,position,nextId] of [
  ['p13b1s3','p13b1s0','before','p13b1s0'],
  ['p13b1s0','p13b1s3','after','p13b1s3']]){
  const plan=planCMDReorderPBSChildren(absorbed,a,b,position);
  const result=apply(absorbed,plan),model=readCMDBlockChains(result);
  assert.deepEqual(model.invalid,[]);
  assert.equal(tail(result),tail(absorbed));
  assert.equal(plan.newId,nextId);
  assert.equal(model.atoms.find(x=>x.origin==='p13b0')?.id,
    position==='before'?'p13b1s0':'p13b1s2');
}
console.log('CMD_ABSORBED_PARENT_CHILD_INSERT_PASS');
