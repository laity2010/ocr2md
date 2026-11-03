/** First drop onto a leaf parent converts its original body to s0 and
 * places the incoming physical OCR block at s1; parent is a container. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {toMarkdown,toMineruJSON} from '../packages/minerujson-md/dist/index.js';
import {readCMDBlockChains,planCMDReparentPBS,projectCMDBlockTable,
 planCMDReorderPBSParents} from '../ui/cmd-block-chains.js';
import {inspectCMDTextBlocks,queryCMDLayout} from '../ui/cmd-text-blocks.js';
import {sourceBlocks,sourceSubblocks} from '../ui/pdf-source-locations.js';
import {projectCMDSourceBlockLabels} from '../ui/cmd-block-labels.js';

const raw=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8');
const source=toMarkdown(raw);
const apply=(s,plan)=>[...plan.edits].sort((a,b)=>b.from-a.from).reduce((text,e)=>{
  assert.equal(text.slice(e.from,e.to),e.expected);
  return text.slice(0,e.from)+e.insert+text.slice(e.to);
},s);
const plan=planCMDReparentPBS(source,'p1b5','p1b4');
assert.equal(plan.createdBodyId,'p1b4s0');
assert.equal(plan.newId,'p1b4s1');
assert.equal(plan.changed,2);
const edited=apply(source,plan);
assert.equal(toMineruJSON(edited),raw);
const model=readCMDBlockChains(edited);
assert.deepEqual(model.invalid,[]);
assert.equal(model.atoms.length,268,'body-s0 is a virtual row, not a second OCR text');
const get=id=>model.atoms.find(a=>a.id===id);
assert.deepEqual([get('p1b4').origin,get('p1b4s0').origin,get('p1b4s1').origin],
 ['p1b4','p1b4','p1b5']);
assert.equal(get('p1b4s0').role,'body');
assert(get('p1b4').from<get('p1b4s0').from);
assert(get('p1b4s0').from<get('p1b4s1').from);
assert(edited.indexOf('id="p1b4s0"')<edited.indexOf('id="p1b4s1"'));
assert.equal(sourceBlocks(edited).length,224);
assert.equal(sourceSubblocks(edited).length,44);
const labels=projectCMDSourceBlockLabels(edited);
assert.equal(labels.find(a=>a.kind==='parent'&&a.id==='p1b4')?.label,'p1b4');
assert.equal(labels.find(a=>a.bodyAlias&&a.id==='p1b4s0')?.label,'p1b4s0');
const inventory=await inspectCMDTextBlocks(edited),layout=await queryCMDLayout(edited);
const ag=projectCMDBlockTable(edited,inventory.rows,layout,model,inventory.children);
assert.equal(ag.rows.find(a=>a.id==='p1b4s0').parentId,'p1b4');
assert.equal(ag.rows.find(a=>a.id==='p1b4s1').parentId,'p1b4');
assert.deepEqual(ag.rows.find(a=>a.id==='p1b4s0').bbox,
  layout.pages[1].regions.find(a=>a.blockIndex===4).bbox);
assert.deepEqual(ag.rows.find(a=>a.id==='p1b4s1').bbox,
  layout.pages[1].regions.find(a=>a.blockIndex===5).bbox);
const p2=planCMDReparentPBS(edited,'p1b6','p1b4');
assert.equal(p2.newId,'p1b4s2');
const twice=apply(edited,p2);
assert.equal(toMineruJSON(twice),raw);
const renamed=planCMDReorderPBSParents(edited,'p1b4','p1b3','before');
const reordered=apply(edited,renamed);
assert.equal(toMineruJSON(reordered),raw);
assert.equal(readCMDBlockChains(reordered).atoms.find(a=>a.origin==='p1b4'&&a.role==='body')?.id,'p1b3s0');
assert.throws(()=>toMineruJSON(edited.replace('role="body"','role="note"')),/invalid|correction|child/i);
console.log('PDF_FIRST_PARENT_BODY_S0_PASS',{container:'p1b4',
 body:'p1b4s0',incoming:'p1b4s1',physicalAtoms:267,visibleRows:268,
 originalJSONByteExact:true,secondChild:'p1b4s2',renumberedBody:'p1b3s0'});
