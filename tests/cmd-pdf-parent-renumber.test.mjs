/** WCP29: logical b numbers follow page source order, while original OCR origin
 * and PDF bboxes remain attached to the same physical atoms, including children. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {toMarkdown,toMineruJSON} from '../packages/minerujson-md/dist/index.js';
import {readCMDBlockChains,planCMDReorderPBSParents,planCMDReparentPBS,
  projectCMDBlockTable} from '../ui/cmd-block-chains.js';
import {projectCMDSourceBlockLabels} from '../ui/cmd-block-labels.js';
import {inspectCMDTextBlocks,queryCMDLayout} from '../ui/cmd-text-blocks.js';

const originalJSON=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8');
const source=toMarkdown(originalJSON);
const apply=(s,plan)=>[...plan.edits].sort((a,b)=>b.from-a.from).reduce((text,edit)=>{
  assert.equal(text.slice(edit.from,edit.to),edit.expected);
  return text.slice(0,edit.from)+edit.insert+text.slice(edit.to);
},s);
const plan=planCMDReorderPBSParents(source,'p1b3','p1b4','after');
assert.equal(plan.changed,1);
assert.deepEqual(Object.fromEntries(['p1b3','p1b3s0','p1b4'].map(id=>[id,plan.renamed[id]])),{
  p1b3:'p1b4',p1b3s0:'p1b4s0',p1b4:'p1b3'});
const changed=apply(source,plan);
const model=readCMDBlockChains(changed);
assert.deepEqual(model.invalid,[]);
assert.equal(model.atoms.length,267);
const byId=new Map(model.atoms.map(a=>[a.id,a]));
assert.equal(byId.get('p1b3').origin,'p1b4');
assert.equal(byId.get('p1b4').origin,'p1b3');
assert.equal(byId.get('p1b4s0').origin,'p1b3s0');
assert(byId.get('p1b4s0').from>byId.get('p1b4').from);
assert.equal(toMineruJSON(changed),originalJSON);
const layout=await queryCMDLayout(changed);
const inventory=await inspectCMDTextBlocks(changed);
const ag=projectCMDBlockTable(changed,inventory.rows,layout,model,inventory.children);
const child=ag.rows.find(a=>a.id==='p1b4s0');
assert(child);
assert.equal(child.parentId,'p1b4');
assert.equal(child.blockIndex,3);
assert.equal(child.origin,'p1b3s0');
assert.deepEqual(child.bbox,layout.pages[1].regions.find(r=>r.blockIndex===3)
  .subRegions.find(r=>r.path.join('.')==='0').bbox);
assert.equal(ag.rows.find(a=>a.id==='p1b4').blockIndex,3);
assert.equal(ag.rows.find(a=>a.id==='p1b3').blockIndex,4);
const labels=projectCMDSourceBlockLabels(changed);
assert.equal(labels.find(a=>a.id==='p1b3s0')?.label,'p1b4s0');
assert.equal(labels.find(a=>a.id==='p1b3'&&a.kind==='parent')?.label,'p1b4');
// CMD physical parent remains a valid reparent target after its logical rename.
const nested=planCMDReparentPBS(changed,'p1b5','p1b4');
assert.equal(nested.newId,'p1b4s1');
assert.equal(toMineruJSON(apply(changed,nested)),originalJSON);
const restored=apply(changed,planCMDReorderPBSParents(changed,'p1b4','p1b3','before'));
assert.equal(restored,source,'reversing the movement should restore the source byte-for-byte');
console.log('PBS_PARENT_CHILD_RENUMBER_PASS',{from:'p1b3',to:'p1b4',
 child:'p1b3s0 -> p1b4s0',sibling:'p1b4 -> p1b3',count:267,
 originalJSONByteExact:true,agAndPDFPhysicalBBox:true,roundtrip:true});
