import test from 'node:test';
import assert from 'node:assert/strict';
import {createMDLineSnapshot} from '../ui/sentence/snapshot.js';
import {splitSnapshot} from '../ui/sentence/split.js';
import {initializationPlans} from '../ui/sentence/initialize.js';
const ids=['intl','sentence-splitter','wink-nlp'];
const versions=Object.fromEntries(ids.map(id=>[id,'test:'+id]));
test('real engines: agreement, raw protection, terminal cut removed, empty lines and EOF',async()=>{
 const md='Hello world. Next sentence.  \n\n$$a.b$$\n~~~\nCode. Text.\n~~~\nLast line.  ';
 const snapshot=await createMDLineSnapshot(md),result=splitSnapshot(snapshot);
 const plans=initializationPlans(snapshot,result,versions);
 assert.equal(plans.length,7);
 assert.deepEqual(plans[0].boundaries,[12]);assert.equal(plans[0].review_state,'agreed');
 for(const p of plans.slice(1)){assert.equal(p.review_state,'no_split');assert.deepEqual(p.boundaries,[]);}
 for(const p of plans.slice(2,6))for(const c of Object.values(p.candidates))assert(c.protected_ranges.length);
 assert(plans.every(p=>p.adopted_engine===null));
 assert.deepEqual(initializationPlans(await createMDLineSnapshot(''),{documentVersion:(await createMDLineSnapshot('')).documentVersion,lines:[]},versions),[]);
});
test('disagreement and engine failure retain whole line, source mismatch is rejected',async()=>{
 const snapshot=await createMDLineSnapshot('Hello world. Next sentence.  ');
 const result=splitSnapshot(snapshot),row=result.lines[0];
 // Simulate one engine returning one joined sentence, retaining actual source pieces.
 const c=row.candidates[1];
 c.units=[{sourceRanges:c.units.flatMap(u=>u.sourceRanges)}];
 let p=initializationPlans(snapshot,result,versions)[0];
 assert.equal(p.review_state,'disputed');assert.deepEqual(p.boundaries,[]);
 assert.deepEqual(p.candidates.intl.boundaries,[12]);assert.deepEqual(p.candidates['sentence-splitter'].boundaries,[]);
 row.candidates[1]={engine:c.engine,sourceLine:c.sourceLine,sourceSha256:c.sourceSha256,protectedRanges:c.protectedRanges,error:'injected'};
 p=initializationPlans(snapshot,result,versions)[0];
 assert.equal(p.review_state,'engine_error');assert.deepEqual(p.boundaries,[]);
 assert.equal(p.candidates['sentence-splitter'].status,'error');
 row.sourceSha256='bad';assert.throws(()=>initializationPlans(snapshot,result,versions),/source mismatch/);
});
