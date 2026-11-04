/** A before B is INSERTION, not swapping. B's ID shifts to B+1. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {toMarkdown} from '../packages/minerujson-md/dist/index.js';
import {readCMDBlockChains,planCMDInsertPBSParentBefore,planCMDAbsorbReviewedParent,
  projectCMDBlockTable} from '../ui/cmd-block-chains.js';
import {readCMDPBSLocations} from '../ui/cmd-pbs-locations.js';
import {inspectCMDTextBlocks,queryCMDLayout} from '../ui/cmd-text-blocks.js';
const original=toMarkdown(readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8'));
const archive=s=>s.slice(s.indexOf('<!-- minerujson:source:v1:'));
function apply(source,plan){return [...plan.edits].sort((a,b)=>b.from-a.from).reduce((s,e)=>{
  assert.equal(s.slice(e.from,e.to),e.expected,'stale edit');
  return s.slice(0,e.from)+e.insert+s.slice(e.to);
},source);}
function check(source,A,B){
  const old=readCMDBlockChains(source),plan=planCMDInsertPBSParentBefore(source,A,B);
  if(!plan.changed)return {text:source,plan,model:old};
  const text=apply(source,plan),m=readCMDBlockChains(text);
  assert.deepEqual(m.invalid,[]);assert.equal(m.atoms.length,old.atoms.length);
  assert.equal(archive(text),archive(source));
  const origA=old.atoms.find(x=>x.id===A),origB=old.atoms.find(x=>x.id===B);
  const expectedA=B,shiftedB=B.replace(/b(\d+)$/,(_,n)=>'b'+(Number(n)+1));
  assert.equal(plan.newId,expectedA);
  assert.equal(m.atoms.find(x=>x.id===expectedA)?.origin,origA.origin);
  assert.equal(m.atoms.find(x=>x.id===shiftedB)?.origin,origB.origin);
  assert.deepEqual(m.atoms.map(x=>`${x.origin}|${x.role||''}`).sort(),
    old.atoms.map(x=>`${x.origin}|${x.role||''}`).sort());
  const roots=m.atoms.filter(x=>x.kind==='parent').map(x=>x.id);
  assert.equal(roots.indexOf(expectedA)+1,roots.indexOf(shiftedB),'A must precede shifted B');
  assert(m.atoms.filter(a=>a.id===B).length===1);
  console.log('PBS_INSERT_BEFORE_PASS',A,'before',B,'=>',expectedA,'target shifts',shiftedB);
  return {text,plan,model:m};
}
for(const [a,b] of [['p1b9','p1b3'],['p1b2','p1b4'],['p1b3','p1b0'],
 ['p0b16','p1b0'],['p1b4','p0b3'],['p21b20','p20b0'],['p1b5','p21b20']])check(original,a,b);
const caseA=check(original,'p1b9','p1b3');
assert.equal(caseA.model.atoms.find(x=>x.id==='p1b4')?.origin,'p1b3');
assert.equal(caseA.model.atoms.find(x=>x.id==='p1b5')?.origin,'p1b4');
const native=check(original,'p1b3','p1b0');
assert(native.model.atoms.some(x=>x.id==='p1b0s0'&&x.origin==='p1b3s0'));
const cross=check(original,'p1b5','p2b0');
assert.equal(readCMDPBSLocations(cross.text).bindings.p2b0,'p1b5');
const inventory=await inspectCMDTextBlocks(cross.text),layout=await queryCMDLayout(cross.text);
const ag=projectCMDBlockTable(cross.text,inventory.rows,layout,cross.model,inventory.children);
const moved=ag.rows.find(x=>x.id==='p2b0');
assert.equal(moved?.pageIndex,1,'A is physically on old page, despite logical p2 number');
assert.deepEqual(moved.bbox,layout.pages[1].regions.find(x=>x.blockIndex===5).bbox);
const joined=apply(original,planCMDAbsorbReviewedParent(original,'p1b3','p1b4'));
const afterJoin=check(joined,'p1b4','p1b0');
assert(afterJoin.model.atoms.some(x=>x.id==='p1b0s0'&&x.role==='body'));
assert(afterJoin.model.atoms.some(x=>x.id==='p1b0s1'&&x.origin==='p1b3s0'));
assert(readCMDPBSLocations(afterJoin.text).removed.includes('p1b3'));
const noOp=check(original,'p1b5','p1b6');
assert.equal(noOp.plan.changed,0,'A already directly before B => no-op');
console.log('PBS_INSERT_BEFORE_ALL_PASS');
