/** Repeatable structural correction: an independent reviewed parent stays
 * eligible for later reparenting, with immutable original OCR provenance. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {toMarkdown,toMineruJSON} from '../packages/minerujson-md/dist/index.js';
import {readCMDBlockChains,planCMDReparentPBS,planCMDPromotePBSChild} from '../ui/cmd-block-chains.js';
const raw=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8');
const source=toMarkdown(raw);
const apply=(s,p)=>[...p.edits].sort((a,b)=>b.from-a.from).reduce((t,e)=>{
 assert.equal(s.slice(e.from,e.to),e.expected);return t.slice(0,e.from)+e.insert+t.slice(e.to);
},s);
let current=source;
const steps=[['child','p1b5','p1b3s0','p1b3s1'],
 ['independent','p1b3s1',null,'p1b14'],
 ['child-again','p1b14','p1b3s0','p1b3s1']];
for(const [action,sourceId,targetId,wanted] of steps){
 const plan=targetId?planCMDReparentPBS(current,sourceId,targetId):planCMDPromotePBSChild(current,sourceId);
 assert.equal(plan.newId,wanted,action);assert.equal(plan.origin,'p1b5');
 current=apply(current,plan);
 const model=readCMDBlockChains(current);
 assert.deepEqual(model.invalid,[],action);assert.equal(model.atoms.length,267,action);
 const atom=model.atoms.find(a=>a.id===wanted);
 assert.equal(atom.origin,'p1b5',action);
 assert.equal(atom.kind,targetId?'child':'parent',action);
 assert.equal(model.atoms.some(a=>a.id===sourceId),false,action);
 assert.equal(current.match(/Top Award/g)?.length,1,action);
 assert.equal(current.slice(current.indexOf('<!-- minerujson:source:v1:')),
  source.slice(source.indexOf('<!-- minerujson:source:v1:')),action);
}
const model=readCMDBlockChains(current);
assert.equal(toMineruJSON(current),raw,'one complete cycle must restore original OCR JSON exactly');
assert(!model.atoms.some(a=>a.id==='p1b14'||a.id==='p1b5'));
assert.equal(model.atoms.find(a=>a.id==='p1b3s1')?.origin,'p1b5');
assert(current.indexOf('id="p1b3s0"')<current.indexOf('id="p1b3s1"'));
assert(current.indexOf('id="p1b3s1"')<current.indexOf('Top Award'));
assert(current.indexOf('Top Award')<current.indexOf('id="p1b4"'));
assert.throws(()=>planCMDReparentPBS(source,'p1b3','p1b3s0'),/original parent OCR provenance|leaf/i);
console.log('PBS_REPEATABLE_REPARENT_PASS',{steps:steps.length,origin:'p1b5',finalId:'p1b3s1',atoms:267,sourceJSONByteExact:true});
