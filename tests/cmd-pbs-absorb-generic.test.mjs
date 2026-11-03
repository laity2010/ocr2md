/** Generic same-page parent absorption: id-only tags, PDF geometry, rerooting. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {toMarkdown} from '../packages/minerujson-md/dist/index.js';
import {readCMDBlockChains,planCMDAbsorbReviewedParent,projectCMDBlockTable}
  from '../ui/cmd-block-chains.js';
import {inspectCMDTextBlocks,queryCMDLayout} from '../ui/cmd-text-blocks.js';
import {readCMDPBSLocations} from '../ui/cmd-pbs-locations.js';
const fixture=toMarkdown(readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8'));
const archive=text=>text.slice(text.indexOf('<!-- minerujson:source:v1:'));
function edit(src,from,to){
  const plan=planCMDAbsorbReviewedParent(src,from,to);
  const next=[...plan.edits].sort((a,b)=>b.from-a.from).reduce((s,e)=>{
    assert.equal(s.slice(e.from,e.to),e.expected,'stale CMD edit');
    return s.slice(0,e.from)+e.insert+s.slice(e.to);
  },src);
  const before=readCMDBlockChains(src),after=readCMDBlockChains(next);
  assert.equal(archive(next),archive(src),'sealed PDF JSON changed');
  assert.deepEqual(after.invalid,[],'invalid PBS hierarchy');
  assert(!after.atoms.some(atom=>atom.id===from||atom.id.startsWith(from+'s')));
  assert(after.atoms.some(atom=>atom.id===to));
  assert(plan.newIds.length>0);
  assert(after.absorbedParents.some(a=>a.origin===before.atoms.find(a=>a.id===from).origin));
  for(const atom of after.atoms){
    if(!atom.id.startsWith(to+'s'))continue;
    assert.equal(atom.rawLine.trim(),`<!-- cmd:block:v1 id="${atom.id}" -->`,
      'no internal origin/role metadata in CMD block tags');
  }
  assert(!next.includes('cmd:absorbed-parent:v1'));
  return {source:next,plan,after};
}
for(const [a,b] of [['p1b3','p1b4'],['p1b2','p1b4'],['p1b5','p1b6'],
  ['p1b2','p1b3'],['p0b16','p0b15'],['p1b5','p1b13'],
  ['p21b20','p21b19']]){
  const {source,plan}=edit(fixture,a,b);
  const inventory=await inspectCMDTextBlocks(source),layout=await queryCMDLayout(source),
    model=readCMDBlockChains(source);
  const table=projectCMDBlockTable(source,inventory.rows,layout,model,inventory.children);
  assert(!table.rows.some(row=>row.id===a));
  for(const id of plan.newIds){
    const row=table.rows.find(row=>row.id===id);
    assert(row,'missing new AG child '+id);
    assert(row.geometry,'missing physical PDF bbox '+id);
    assert.equal(row.parentId,b,'wrong logical parent');
  }
  console.log('GENERIC_PARENT_TO_PARENT_PASS',a,b,plan.newIds.join(','));
}
let source=fixture;
for(const [a,b] of [['p1b3','p1b4'],['p1b2','p1b4'],['p1b4','p1b6']])
  source=edit(source,a,b).source;
const locations=readCMDPBSLocations(source);
assert.equal(locations.bindings.p1b6s1,'p1b4');
assert.equal(locations.bindings.p1b6s2,'p1b3s0');
assert.equal(locations.bindings.p1b6s3,'p1b2');
assert.equal(locations.bindings.p1b6s0,'p1b6');
assert.deepEqual(new Set(locations.removed),new Set(['p1b3','p1b2','p1b4']));
assert.throws(()=>planCMDAbsorbReviewedParent(source,'p1b3','p1b6'),/Unknown|dissolved/);
for(const [a,b,pdfPage] of [['p1b5','p2b0',2],['p2b0','p1b5',3],
  ['p0b16','p1b0',1],['p21b20','p20b0',22]]){
  const {source,plan}=edit(fixture,a,b);
  const inventory=await inspectCMDTextBlocks(source),layout=await queryCMDLayout(source),
    after=readCMDBlockChains(source);
  const table=projectCMDBlockTable(source,inventory.rows,layout,after,inventory.children);
  for(const id of plan.newIds){
    const row=table.rows.find(r=>r.id===id);
    assert(row&&row.geometry);
    assert.equal(row.pdfPage,pdfPage,'physical PDF page MUST NOT follow new CMD id');
    assert.equal(row.parentId,b,'logical B is destination even cross page');
    assert.notEqual(Number(id.slice(1,id.indexOf('b')))+1,pdfPage);
  }
  console.log('CROSS_PAGE_PARENT_ABSORPTION_PASS',a,b,plan.newIds,pdfPage);
}
assert.throws(()=>planCMDAbsorbReviewedParent(fixture,'p1b3','p1b3'),/different parent/);

console.log('GENERIC_REPEATED_PARENT_ABSORPTION_PASS',locations);
