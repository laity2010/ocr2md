import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {split,rebuild} from '../ui/sentence-benchmark-core.js';
import {
 reviewInventory,blockAt,freshReview,synchronizeReview,
 reviewChanged,acceptedBoundaries
} from '../ui/sentence-benchmark-review.js';
const md=readFileSync('labs/sentence-benchmark/.runtime/document.md','utf8');
const engines=['intl','sentence-splitter','wink-nlp'];
const runs=new Map(engines.map(engine=>{
 const value=split(md,engine);
 assert.equal(rebuild(value),md);
 return [engine,{value,lossless:true}];
}));
test('agreed PBS sentence boundaries are independently ready to persist',()=>{
 const inventory=reviewInventory(md,runs);
 const all=[...inventory.values()];
 const agreeing=all.filter(row=>row.agreed);
 const disputed=all.filter(row=>row.disagreed);
 const zero=all.filter(row=>!row.covered);
 assert(agreeing.length>75&&disputed.length>20);
 assert(zero.length>=1);
 assert(all.some(row=>row.id==='p7b0s2'&&row.disagreed));
 const sha='a'.repeat(64);
 const review=synchronizeReview(freshReview(sha),inventory);
 assert.equal(Object.keys(review.blocks).length,agreeing.length);
 assert(Object.values(review.blocks).every(x=>x.status==='auto'&&!x.engine));
 assert(!review.blocks[zero[0].id]);
 assert(!review.blocks[disputed[0].id]);
 assert(acceptedBoundaries(review,inventory).length>100);
});
test('one chosen engine arbitrates exactly one disputed PBS block; Gold stays authoritative',()=>{
 const inventory=reviewInventory(md,runs),row=inventory.get('p7b0s2');
 assert(row?.disagreed);
 const initial=synchronizeReview(freshReview('b'.repeat(64)),inventory);
 const selected=row.engines.find(x=>x.engine==='intl');
 initial.blocks[row.id]={status:'arbitrated',engine:'intl',
   boundaries:[...selected.boundaries]};
 initial.manualGold[String(selected.boundaries[0])]={break:false,manual:true};
 const roundtrip=synchronizeReview(initial,inventory);
 assert.deepEqual(roundtrip.blocks[row.id],initial.blocks[row.id]);
 assert.equal(roundtrip.blocks[row.id].engine,'intl');
 assert(reviewChanged(synchronizeReview(freshReview('b'.repeat(64)),inventory),roundtrip));
 assert(!acceptedBoundaries(roundtrip,inventory).includes(selected.boundaries[0]),
   'human explicit negative Gold overrides engine adoption');
 const chosen=blockAt(inventory,row.textFrom+5);
 assert.equal(chosen?.id,row.id);
});
test('model refuses to mark missing sentences as automatic acceptance',()=>{
 const sample=[
  '<!-- cmd:block:v1 id="p0b0" -->',
  'One correct sentence. Two complete sentences.',
  '<!-- cmd:block:v1 id="p0b1" -->',
  'This line ends with a Markdown hard break.  ',
  '<!-- cmd:block:v1 id="p0b2" -->',
  'Last sentence.'
 ].join('\n');
 const scoped=new Map(engines.map(engine=>{
  const value=split(sample,engine);
  return [engine,{lossless:true,value}];
 }));
 const inventory=reviewInventory(sample,scoped);
 const result=synchronizeReview(freshReview('c'.repeat(64)),inventory);
 assert(!result.blocks.p0b1,'no valid sentences must not be auto-approved');
 assert(result.blocks.p0b0);
 assert(result.blocks.p0b2);
});
