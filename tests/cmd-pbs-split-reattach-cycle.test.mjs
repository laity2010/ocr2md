/** CMD original p/b/s atomic cycle: attach -> split child -> reattach.
 * Source immutable OCR origin, bbox and sealed MinerU bytes must survive.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {toMarkdown,toMineruJSON} from '../packages/minerujson-md/dist/index.js';
import {planCMDReparentPBS,planCMDPromotePBSChild,readCMDBlockChains} from '../ui/cmd-block-chains.js';
import {inspectCMDTextBlocks,queryCMDLayout} from '../ui/cmd-text-blocks.js';
const json=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8');
const original=toMarkdown(json);
const apply=(source,plan)=>[...plan.edits].sort((a,b)=>b.from-a.from).reduce((s,e)=>{
  assert.equal(s.slice(e.from,e.to),e.expected);
  return s.slice(0,e.from)+e.insert+s.slice(e.to);
},source);
const states=[original];
const attach=planCMDReparentPBS(states.at(-1),'p1b3','p1b5');
states.push(apply(states.at(-1),attach));
assert.equal(attach.newId,'p1b5s1');
const split=planCMDPromotePBSChild(states.at(-1),'p1b5s1');
states.push(apply(states.at(-1),split));
assert.equal(split.newId,'p1b14');
assert.equal(split.origin,'p1b3s0');
const reattach=planCMDReparentPBS(states.at(-1),'p1b14','p1b5');
states.push(apply(states.at(-1),reattach));
assert.equal(reattach.newId,'p1b5s1');
const secondSplit=planCMDPromotePBSChild(states.at(-1),'p1b5s1');
states.push(apply(states.at(-1),secondSplit));
const reattachElsewhere=planCMDReparentPBS(states.at(-1),'p1b14','p1b7');
states.push(apply(states.at(-1),reattachElsewhere));
for(const [i,s] of states.entries()){
  const model=readCMDBlockChains(s);
  assert.equal(model.invalid.length,0,'invalid CMD after step '+i);
  assert.equal(toMineruJSON(s),json,'sealed OCR changed after step '+i);
  const preserved=model.atoms.find(a=>a.origin==='p1b3s0');
  assert(preserved,'lost native child after step '+i);
  assert.equal(model.atoms.filter(a=>a.origin==='p1b3s0').length,1);
}
const promotedModel=readCMDBlockChains(states[2]);
assert.equal(promotedModel.atoms.find(a=>a.id==='p1b14')?.origin,'p1b3s0');
const finalModel=readCMDBlockChains(states.at(-1));
assert.equal(finalModel.atoms.find(a=>a.id===reattachElsewhere.newId)?.origin,'p1b3s0');
const originalLayout=await queryCMDLayout(original);
for(const s of states.slice(1)){
  const layout=await queryCMDLayout(s);
  assert.deepEqual(layout.pages[1].regions[3].subRegions[0].bbox,
    originalLayout.pages[1].regions[3].subRegions[0].bbox);
}
console.log('CMD_PBS_SPLIT_REATTACH_CYCLE_PASS',{
  sequence:['p1b3->p1b5s1','p1b5s1->p1b14','p1b14->p1b5s1',
    'p1b5s1->p1b14', 'p1b14->'+reattachElsewhere.newId],
  originalJSONByteExact:true,originalBBox:true,origin:'p1b3s0',steps:states.length-1
});
