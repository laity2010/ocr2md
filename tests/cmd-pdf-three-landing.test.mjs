/** WCP PDF three landing actions must modify only CMD ordering and relationships,
 * never original PDF geometry, sealed MinerU evidence or OCR provenance. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {toMarkdown,toMineruJSON} from '../packages/minerujson-md/dist/index.js';
import {readCMDBlockChains,planCMDReorderPBSParents,
  planCMDReparentPBS,planCMDPromotePBSChild} from '../ui/cmd-block-chains.js';

const raw=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8');
const original=toMarkdown(raw);
const apply=(source,plan)=>[...plan.edits].sort((a,b)=>b.from-a.from).reduce((text,e)=>{
  assert.equal(text.slice(e.from,e.to),e.expected);
  return text.slice(0,e.from)+e.insert+text.slice(e.to);
},source);
const check=(source,reason)=>{
  const result=readCMDBlockChains(source);
  assert.deepEqual(result.invalid,[],reason);
  assert.equal(result.atoms.length,267,reason);
  assert.equal(toMineruJSON(source),raw,reason);
  assert.equal(source.slice(source.indexOf('<!-- minerujson:source:v1:')),
    original.slice(original.indexOf('<!-- minerujson:source:v1:')),reason);
  return result;
};
const roots=source=>check(source,'intact').atoms.filter(a=>/^p1b\d+$/.test(a.id))
  .map(a=>a.id);
let current=original;
const before=roots(current);
const start=before.indexOf('p1b5'),target=before.indexOf('p1b3');
assert(start>target);
const first=planCMDReorderPBSParents(current,'p1b5','p1b3','before');
assert.equal(first.changed,1);
current=apply(current,first);
assert.deepEqual(roots(current),[...before.filter(x=>x!=='p1b5')].toSpliced(target,0,'p1b5'));
assert(current.indexOf('<!-- cmd:block:v1 id="p1b5"')<
  current.indexOf('<!-- cmd:block:v1 id="p1b3"'));
assert.equal(planCMDReorderPBSParents(current,'p1b5','p1b3','before').changed,0);
const back=planCMDReorderPBSParents(current,'p1b5','p1b4','after');
current=apply(current,back);
assert.deepEqual(roots(current),before,'after landing restores original source order');
const adjacent=planCMDReparentPBS(current,'p1b5','p1b4');
assert.equal(adjacent.changed,1,'neighboring parent should need tag-only edit');
assert.equal(adjacent.newId,'p1b4s0');
check(apply(current,adjacent),'parent without native children');
// Three-way center landing directly on a PARENT label (no special child target).
const nested=planCMDReparentPBS(current,'p1b5','p1b3');
assert.equal(nested.newId,'p1b3s1');
assert.equal(nested.origin,'p1b5');
current=apply(current,nested);
assert.equal(check(current,'nested').atoms.find(a=>a.id==='p1b3s1')?.origin,'p1b5');
assert(current.indexOf('id="p1b3s0"')<current.indexOf('id="p1b3s1"'));
assert(current.indexOf('id="p1b3s1"')<current.indexOf('id="p1b4"'));
// The source can be promoted then nested again without losing provenance.
const promoted=planCMDPromotePBSChild(current,'p1b3s1');
assert.equal(promoted.newId,'p1b14');
current=apply(current,promoted);
check(current,'promoted');
current=apply(current,planCMDReparentPBS(current,'p1b14','p1b3'));
assert.equal(check(current,'repeat').atoms.find(a=>a.id==='p1b3s1')?.origin,'p1b5');
// A reviewed child promoted to an independent p1b14 remains sortable
// BEFORE another original parent without altering its original PDF bbox.
let promotedForSort=apply(original,planCMDReparentPBS(original,'p1b5','p1b3s0'));
promotedForSort=apply(promotedForSort,planCMDPromotePBSChild(promotedForSort,'p1b3s1'));
const sortedPromoted=apply(promotedForSort,
  planCMDReorderPBSParents(promotedForSort,'p1b14','p1b3','before'));
assert.equal(check(sortedPromoted,'promoted reorder').atoms.find(a=>a.id==='p1b14')?.origin,'p1b5');
assert.throws(()=>planCMDReorderPBSParents(original,'p1b5','p2b0'),/same-page/);
assert.throws(()=>planCMDReorderPBSParents(original,'p1b5','p1b3','inside'),/landing/);
console.log('PDF_THREE_LANDING_CMD_PASS',{before:'p1b5 before p1b3',
 after:'p1b5 after p1b4',into:'p1b3s1',repeat:true,atoms:267,
 originalJSONByteExact:true});
