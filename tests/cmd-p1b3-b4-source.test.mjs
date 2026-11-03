/** Exact, deliberate one-operation parent absorption acceptance. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {toMarkdown} from '../packages/minerujson-md/dist/index.js';
import {readCMDBlockChains,planCMDJoinP1B3IntoP1B4,projectCMDBlockTable}
  from '../ui/cmd-block-chains.js';
import {inspectCMDTextBlocks,queryCMDLayout} from '../ui/cmd-text-blocks.js';
import {projectPDFParentGroup} from '../ui/pdf-pbs-group-highlight.js';
const source=toMarkdown(readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8'));
const before=readCMDBlockChains(source);
const originalAChild=before.atoms.find(x=>x.id==='p1b3s0');
const nextParent=before.atoms.find(x=>x.id==='p1b4');
const originalBody=source.slice(originalAChild.from+originalAChild.rawLine.length,nextParent.from);
const plan=planCMDJoinP1B3IntoP1B4(source);
const next=[...plan.edits].sort((a,b)=>b.from-a.from).reduce((s,e)=>{
  assert.equal(s.slice(e.from,e.to),e.expected);return s.slice(0,e.from)+e.insert+s.slice(e.to);
},source);
const after=readCMDBlockChains(next);
assert.deepEqual(after.invalid,[]);
assert.equal(after.atoms.length,before.atoms.length);
assert.deepEqual(after.atoms.filter(a=>a.id.startsWith('p1b4')).map(a=>a.id),
  ['p1b4','p1b4s0','p1b4s1']);
assert(!after.atoms.some(a=>a.id==='p1b3'||a.id.startsWith('p1b3s')));
for(const id of ['p1b4','p1b4s0','p1b4s1']){
  const entry=after.atoms.find(a=>a.id===id);
  assert.equal(entry?.rawLine,`<!-- cmd:block:v1 id="${id}" -->`,id+' must have id ONLY');
  assert(!/\borigin=|\brole=/.test(entry.rawLine),id+' leaked internal PDF mapping into Markdown');
}
assert.equal((next.match(/<!-- cmd:block:v1 id="p1b4s[01]" -->/g)||[]).length,2);
assert(!next.includes('<!-- cmd:block:v1 id="p1b3"'));
assert(!next.includes('<!-- cmd:absorbed-parent:v1 origin="p1b3"'));
const b4=after.atoms.find(x=>x.id==='p1b4');
const s0=after.atoms.find(x=>x.id==='p1b4s0');
const s1=after.atoms.find(x=>x.id==='p1b4s1');
assert(b4.from<s0.from&&s0.from<s1.from);
assert.equal(s0.origin,'p1b4');assert.equal(s0.role,'body');
assert.equal(s1.origin,'p1b3s0');
const ending=after.atoms.find(x=>x.id==='p1b5');
assert.equal(next.slice(s1.from+s1.rawLine.length,ending.from),originalBody);
assert.equal(source.slice(source.indexOf('<!-- minerujson:source:v1:')),
  next.slice(next.indexOf('<!-- minerujson:source:v1:')));
const inventory=await inspectCMDTextBlocks(next),layout=await queryCMDLayout(next);
const ag=projectCMDBlockTable(next,inventory.rows,layout,after,inventory.children);
assert(!ag.rows.some(row=>row.id==='p1b3'||row.format==='missing'&&row.id==='p1b3'));
assert(ag.rows.some(row=>row.id==='p1b4s1'&&row.parentId==='p1b4'));
const originalA=layout.pages[1].regions.find(x=>x.blockIndex===3);
const originalB=layout.pages[1].regions.find(x=>x.blockIndex===4);
assert.deepEqual(ag.rows.find(row=>row.id==='p1b4s1').bbox,originalA.subRegions[0].bbox);
assert.deepEqual(ag.rows.find(row=>row.id==='p1b4').bbox,originalB.bbox);
const projected=[{id:'p1b4',origin:'p1b4'},
  {id:'p1b4s1',origin:'p1b3s0',logicalId:'p1b4'}];
const group=projectPDFParentGroup(projected,'p1b4');
assert(group.cover('p1b4')&&group.cover('p1b4s1')&&group.child('p1b4s0'));
assert.throws(()=>planCMDJoinP1B3IntoP1B4(next),/Unknown PBS source or target|Source must/);
console.log('P1B3_INTO_P1B4_SOURCE_PASS',JSON.stringify({sourceOldRootRemoved:true,
  body:'p1b4s0',incoming:'p1b4s1',sourceBodyBytes:originalBody.length,
  originalGeometryUnchanged:true,AGRootRemoved:true,groupHighlight:true,
  noAbsorbedMarker:true,sealedPDFUnchanged:true}));
