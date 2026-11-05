import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {toMarkdown} from '../packages/minerujson-md/dist/index.js';
import {planCMDReparentPBS,projectCMDAtomLocations} from '../ui/cmd-block-chains.js';
import {projectIllegalBreakPair} from '../ui/illegal-break-pair.js';
const cases=[
  [{blockId:'p6b6s0',nextBlockId:'p6b6s1'},['p6b6s0','p6b6s1','跨块']],
  [{blockId:'p12b7s1',previousBlockId:'p12b7s0',reviewKind:'child-start'},['p12b7s0','p12b7s1','跨块']],
  [{blockId:'p6b6s1',reviewKind:'hyphen-space'},['p6b6s1','p6b6s1','块内']],
  [{blockId:null},[null,null,'未映射']],
];
for(const [row,expected] of cases){const p=projectIllegalBreakPair(row);
  assert.deepEqual([p.beforeBlockId,p.afterBlockId,p.pairKind],expected);}
const o=toMarkdown(readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8'));
const move=planCMDReparentPBS(o,'p6b7','p6b6');
const src=[...move.edits].sort((a,b)=>b.from-a.from).reduce((s,e)=>s.slice(0,e.from)+e.insert+s.slice(e.to),o);
const mapped=new Map(projectCMDAtomLocations(src).map(r=>[r.id,r]));
assert.equal(mapped.get('p6b6s0').origin,'p6b6');
assert.equal(mapped.get('p6b6s1').origin,'p6b7');
assert.equal(mapped.get('p6b6s0').pageIndex,6);
assert.equal(mapped.get('p6b6s1').pageIndex,6);
assert.notEqual(mapped.get('p6b6s0').blockIndex,mapped.get('p6b6s1').blockIndex);
console.log('ILLEGAL_BREAK_PAIR_MODEL_PASS stable p/b/s pair + original PDF OCR geometry');
