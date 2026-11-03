/** Merge a real, native-child OCR parent into a text parent on the same
 * physical PDF page. The disappearing logical root is retained only in a
 * reversible source provenance comment. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {toMarkdown,toMineruJSON} from '../packages/minerujson-md/dist/index.js';
import {readCMDBlockChains,planCMDReparentPBS,projectCMDBlockTable,
  readCMDAbsorbedParents} from '../ui/cmd-block-chains.js';
import {inspectCMDTextBlocks,queryCMDLayout} from '../ui/cmd-text-blocks.js';
import {projectCMDSourceBlockLabels} from '../ui/cmd-block-labels.js';
import {sourceBlocks} from '../ui/pdf-source-locations.js';
const raw=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8');
const source=toMarkdown(raw);
const apply=(s,plan)=>[...plan.edits].sort((a,b)=>b.from-a.from).reduce((text,e)=>{
  assert.equal(text.slice(e.from,e.to),e.expected);
  return text.slice(0,e.from)+e.insert+text.slice(e.to);
},s);
const plan=planCMDReparentPBS(source,'p1b3','p1b5');
assert.equal(plan.createdBodyId,'p1b5s0');
assert.equal(plan.newId,'p1b5s1');
assert.equal(plan.absorbedOrigin,'p1b3');
assert.deepEqual(plan.renamed,{'p1b3s0':'p1b5s1'});
const next=apply(source,plan),model=readCMDBlockChains(next);
assert.deepEqual(model.invalid,[]);
assert.equal(model.atoms.length,267); // one parent removed, one body alias added
assert.deepEqual(readCMDAbsorbedParents(next).map(a=>[a.origin,a.target]),
  [['p1b3','p1b5']]);
const byId=new Map(model.atoms.map(a=>[a.id,a]));
assert(!byId.has('p1b3'),'original logical parent disappears');
assert(!byId.has('p1b3s0'),'native child inherits destination parent number');
assert.equal(byId.get('p1b5').origin,'p1b5');
assert.equal(byId.get('p1b5s0').origin,'p1b5');
assert.equal(byId.get('p1b5s0').role,'body');
assert.equal(byId.get('p1b5s1').origin,'p1b3s0');
assert(next.indexOf('id="p1b5s0"')<next.indexOf('id="p1b5s1"'));
assert(!next.includes('<!-- cmd:block:v1 id="p1b3" -->'));
assert.equal(sourceBlocks(next).some(x=>x.pageIndex===1&&x.blockIndex===3),false);
assert.equal(toMineruJSON(next),raw,'original sealed OCR must be byte-exact');
const inventory=await inspectCMDTextBlocks(next),layout=await queryCMDLayout(next);
const ag=projectCMDBlockTable(next,inventory.rows,layout,model,inventory.children);
assert.deepEqual(ag.absorbedParents.map(a=>a.origin),['p1b3']);
assert(!ag.rows.some(r=>r.kind==='parent'&&r.origin==='p1b3'),
  'AG must not re-create a missing parent after absorption');
const native=ag.rows.find(r=>r.id==='p1b5s1');
assert.equal(native.parentId,'p1b5');
assert.equal(native.origin,'p1b3s0');
assert.deepEqual(native.bbox,layout.pages[1].regions.find(x=>x.blockIndex===3)
  .subRegions.find(x=>x.path.join('.')==='0').bbox);
const labels=projectCMDSourceBlockLabels(next);
assert.equal(labels.find(r=>r.id==='p1b3s0')?.label,'p1b5s1');
assert(!labels.some(r=>r.kind==='parent'&&r.id==='p1b3'));
assert.throws(()=>toMineruJSON(next.replace(
 'cmd:absorbed-parent:v1 origin="p1b3" target="p1b5"',
 'cmd:absorbed-parent:v1 origin="p1b4" target="p1b5"')),/invalid|anchor|parent|OCR/i);
// All three original native table children must be absorbed, in original
// reading order, after the destination's existing three native children.
const multi=planCMDReparentPBS(source,'p4b0','p4b1');
assert.deepEqual(multi.memberIds,['p4b1s3','p4b1s4','p4b1s5']);
assert.equal(multi.createdBodyId,null);
const multiSource=apply(source,multi);
assert.equal(toMineruJSON(multiSource),raw);
const multiModel=readCMDBlockChains(multiSource);
assert.deepEqual(multiModel.invalid,[]);
assert(!multiModel.atoms.some(a=>a.id==='p4b0'));
assert.deepEqual(['p4b0s0','p4b0s1','p4b0s2'].map(id=>
  multiModel.atoms.find(a=>a.origin===id)?.id),multi.memberIds);
console.log('PDF_PARENT_ABSORPTION_PASS',{from:'p1b3',
 into:'p1b5',body:'p1b5s0',nativeChild:'p1b5s1',oldParentMissing:true,
 sourceAtoms:267,originalJSONByteExact:true,physicalBBoxUnchanged:true,
 threeNativeChildrenAbsorbed:true});
