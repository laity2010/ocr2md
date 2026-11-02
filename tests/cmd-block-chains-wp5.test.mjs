/** WP5 semantic move: one PBS changes membership/order, never global swapping. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {toMarkdown,toMineruJSON} from '../packages/minerujson-md/dist/index.js';
import {readCMDBlockChains,planCMDMergeBlockChains,planCMDMoveBlockChainMember,
  planCMDExtractBlockChainMember,planCMDBlockChainArrangement} from '../ui/cmd-block-chains.js';
const raw=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8');
const source=toMarkdown(raw);
const bodyWithoutTags=s=>s.replace(/(?:^|\n)(?:\s*>\s*)?<!-- cmd:block:v1[^\n]* -->/g,'');
const apply=(s,plan)=>{
  let out=s;for(const edit of [...plan.edits].sort((a,b)=>b.from-a.from)){
    assert.equal(out.slice(edit.from,edit.to),edit.expected);
    out=out.slice(0,edit.from)+edit.insert+out.slice(edit.to);
  }
  assert.equal(toMineruJSON(out),raw);
  assert.equal(bodyWithoutTags(out),bodyWithoutTags(s),'Markdown prose and evidence unchanged');
  assert.equal(readCMDBlockChains(out).invalid.length,0);
  return out;
};
const get=(s,id)=>readCMDBlockChains(s).chains.find(c=>c.members.includes(id));
const names=['p0b0','p0b1','p0b2','p0b3','p0b4'];
let s=source;
for(const id of names.slice(1))s=apply(s,planCMDMergeBlockChains(s,'p0b0',id));
assert.deepEqual(get(s,'p0b0').members,names);
const currentId=get(s,'p0b0').id;
// A moved after B (p0b1 -> p0b3), not a swap. Other four retain order.
s=apply(s,planCMDMoveBlockChainMember(s,'p0b1','p0b3','after'));
assert.deepEqual(get(s,'p0b0').members,['p0b0','p0b2','p0b3','p0b1','p0b4']);
assert.equal(get(s,'p0b0').id,currentId);
// "Move to first" is a single before(first) insertion, not global renumber.
s=apply(s,planCMDMoveBlockChainMember(s,'p0b4','p0b0','before'));
assert.deepEqual(get(s,'p0b4').members,['p0b4','p0b0','p0b2','p0b3','p0b1']);
assert.equal(planCMDMoveBlockChainMember(s,'p0b4','p0b0','before').changed,0);
// Cross-page: move one member only, leaving both other partitions ordered.
let sourceChain=apply(s,planCMDMergeBlockChains(s,'p4b0s0','p4b0s1'));
sourceChain=apply(sourceChain,planCMDMergeBlockChains(sourceChain,'p4b0s0','p4b0s2'));
sourceChain=apply(sourceChain,planCMDMoveBlockChainMember(sourceChain,'p4b0s1','p0b2','after'));
assert.deepEqual(get(sourceChain,'p4b0s0').members,['p4b0s0','p4b0s2']);
assert.deepEqual(get(sourceChain,'p4b0s1').members,['p0b4','p0b0','p0b2','p4b0s1','p0b3','p0b1']);
assert.equal(get(sourceChain,'p4b0s1').id,currentId);
// Detach one middle member, not the entire suffix.
const detached=apply(sourceChain,planCMDExtractBlockChainMember(sourceChain,'p0b2'));
assert.deepEqual(get(detached,'p0b2').members,['p0b2']);
assert.deepEqual(get(detached,'p0b0').members,['p0b4','p0b0','p4b0s1','p0b3','p0b1']);
assert.equal(get(detached,'p0b0').id,currentId);
assert.equal(planCMDExtractBlockChainMember(detached,'p0b2').changed,0);
// Reject typed incompatible targets and legacy input; do not partially edit.
const data=readCMDBlockChains(source);
const partition=data.chains.filter(c=>!['p0b0','p0b1','p4b0s0','p4b0s1'].includes(c.members[0]))
  .map(c=>({members:[...c.members]}));
partition.push({id:'bc-table',type:'table',members:['p0b0','p0b1'],roles:{p0b0:'header',p0b1:'body'}});
partition.push({id:'bc-note',type:'continuation',members:['p4b0s0','p4b0s1']});
const typed=apply(source,planCMDBlockChainArrangement(source,partition));
assert.throws(()=>planCMDMoveBlockChainMember(typed,'p0b0','p4b0s0','after'),/Conflicting BC/);
const typedDetach=apply(typed,planCMDExtractBlockChainMember(typed,'p0b1'));
assert.deepEqual(get(typedDetach,'p0b0').members,['p0b0']);
assert.equal(get(typedDetach,'p0b0').type,'table');
assert.equal(readCMDBlockChains(typedDetach).atoms.find(a=>a.id==='p0b1').role,'body');
assert.throws(()=>planCMDExtractBlockChainMember(source.replace('cmd:block:v1 id="p0b0"', 'cmd:block:v1 id="p0b0" bc="bc-wrong" seq="8"'),'p0b1'),/invalid/);
assert.equal(planCMDMoveBlockChainMember(source,'p0b1','p0b1').changed,0);
console.log('CMD_PBS_BC_WP5_PURE_PASS',{atoms:267,sourceChain:get(sourceChain,'p4b0s0').members,
  dest:get(sourceChain,'p0b0').members,extracted:'p0b2',evidenceUntouched:true});
