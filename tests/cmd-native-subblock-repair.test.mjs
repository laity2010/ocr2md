/** Scoped legacy-initialization repair: preserve all newer user group edits. */
import assert from 'node:assert/strict';
import {readFileSync}from'node:fs';
import{createHash}from'node:crypto';
import{gzipSync}from'node:zlib';
import{toMarkdown,toMineruJSON}from'../packages/minerujson-md/dist/index.js';
import{readCMDBlockChains,planCMDMigrateLegacyBlockChains,
  planCMDAbsorbReviewedParent}from'../ui/cmd-block-chains.js';
import{planCMDRecoverNativeSubblocks}from'../ui/cmd-native-subblock-repair.js';
import{sourceBlockScopes}from'../ui/cmd-block-labels.js';
const old=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8');
const original=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8');
const native=toMarkdown(original);
const migration=planCMDMigrateLegacyBlockChains(old);
const initial=[...migration.edits].sort((a,b)=>b.from-a.from).reduce((src,e)=>
  src.slice(0,e.from)+e.insert+src.slice(e.to),old);
const baseline=await planCMDRecoverNativeSubblocks(initial,old,native);
assert.equal(baseline.edits.length,20);
assert.equal(baseline.addedChildren,43);
assert.equal(baseline.finalAtoms,267);
assert.equal(baseline.skipped.length,0);
assert.equal(toMineruJSON(baseline.result),original,
  'Restoring native child anchors must recover the complete original MinerU JSON');

// Real case: one original image parent is already absorbed. Skip it rather
// than inventing a physical parent, or undoing the user's structure changes.
const absorb=planCMDAbsorbReviewedParent(initial,'p1b3','p1b5');
const edited=[...absorb.edits].sort((a,b)=>b.from-a.from).reduce((src,e)=>{
  assert.equal(src.slice(e.from,e.to),e.expected);
  return src.slice(0,e.from)+e.insert+src.slice(e.to);
},initial);
const model=readCMDBlockChains(edited);
assert(!model.invalid.length);
const repair=await planCMDRecoverNativeSubblocks(edited,old,native);
assert.equal(repair.edits.length,19);
assert.equal(repair.addedChildren,42);
assert.deepEqual(repair.skipped,[{parent:'p1b3',reason:'parent-removed'}]);
const restored=readCMDBlockChains(repair.result);
assert.equal(restored.invalid.length,0);
assert.equal(restored.atoms.length,model.atoms.length+42);
assert.equal(restored.absorbedParents.length,model.absorbedParents.length);
assert(!restored.atoms.some(a=>a.id==='p1b3'));
assert(repair.result.includes('<!-- cmd:block:v1 id="p0b5s0" -->'));
assert(repair.result.includes('<!-- cmd:block:v1 id="p3b1s0" -->'));
assert(repair.result.includes('<!-- cmd:block:v1 id="p4b0s1" -->'));
const sub=sourceBlockScopes(repair.result);
const lookup=id=>sub.find(s=>`p${s.pageIndex}b${s.blockIndex}${s.path?`s${s.path.join('.')}`:''}`===id);
for(const id of ['p0b5s0','p0b7s0','p3b1s0','p4b0s1'])
  assert(lookup(id)?.contentLine,`${id} must have a real source body not a dashed PDF chip`);
const sha=src=>createHash('sha256').update(src).digest('hex');
assert.equal(sha(repair.result.slice(repair.result.indexOf('<!-- minerujson:source:v1:'))),
  sha(edited.slice(edited.indexOf('<!-- minerujson:source:v1:'))));
assert.equal(repair.edits.length,19);
assert.equal((await planCMDRecoverNativeSubblocks(repair.result,old,native)).edits.length,0,
  'One-time patch must be idempotent');
// The cross-page HTML table is a PAIR: if either side's source is edited,
// the whole repair must refuse rather than silently duplicate/erase rows.
const t=edited.indexOf('<!-- cmd:block:v1 id="p3b1" -->');
assert(t>0);
const word=edited.indexOf('Stock/Fund Measure',t);
assert(word>t);
const tampered=edited.slice(0,word)+edited.slice(word).replace('Stock/Fund Measure','Stock/Fund MeasurE');
await assert.rejects(planCMDRecoverNativeSubblocks(tampered,old,native),
  /Cannot restore a split HTML table/);
const differentArchive=JSON.stringify({...JSON.parse(original),_cmd_test:'different sealed archive'});
const differentFooter='<!-- minerujson:source:v1:'+createHash('sha256').update(differentArchive).digest('hex')+'\n'+gzipSync(differentArchive).toString('base64url')+'\n-->';
const differentNative=native.replace(/<!-- minerujson:source:v1:[\s\S]*$/,differentFooter);
await assert.rejects(planCMDRecoverNativeSubblocks(edited,old,differentNative),
  /identical original MinerU JSON/,'different decoded archives cannot be used as repair witnesses');
console.log('NATIVE_CHILD_REPAIR_PASS pure idempotent, 19 preserved parent scopes / 42 restored native subblocks, split HTML table pair guarded, image/table PDF badges matched, user absorption preserved, sealed JSON unchanged');
