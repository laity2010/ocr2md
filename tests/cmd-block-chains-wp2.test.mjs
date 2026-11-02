/** WP2 block chain semantic actions, explicit legacy migration & provenance. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {toMarkdown,toMineruJSON} from '../packages/minerujson-md/dist/index.js';
import {planCMDSubblockAnnotations} from '../ui/cmd-text-blocks.js';
import {readCMDBlockChains,planCMDMigrateLegacyBlockChains,
  planCMDMergeBlockChains,planCMDSplitBlockChain,planCMDMoveBlockChainMember,
  planCMDBlockChainArrangement} from '../ui/cmd-block-chains.js';
const raw=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8');
const legacy=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8');
const source=toMarkdown(raw);
const apply=(old,plan)=>{
  assert(plan?.edits?.length===plan.changed);
  let result=old;
  for(const edit of [...plan.edits].sort((a,b)=>b.from-a.from)){
    assert.equal(result.slice(edit.from,edit.to),edit.expected,'guarded exact-source operation');
    result=result.slice(0,edit.from)+edit.insert+result.slice(edit.to);
  }
  assert.equal(toMineruJSON(result),raw,'no OCR evidence mutation (including BC edits)');
  assert.equal(readCMDBlockChains(result).invalid.length,0,'no bad chain partition');
  return result;
};
const chains=s=>readCMDBlockChains(s).chains;
const member=(s,id)=>chains(s).find(c=>c.members.includes(id));
assert.equal(chains(source).length,267);
const merged=apply(source,planCMDMergeBlockChains(source,'p4b0s0','p4b0s1'));
assert.deepEqual(member(merged,'p4b0s0').members,['p4b0s0','p4b0s1']);
assert.equal(member(merged,'p4b0s0').id,'bc-0001');
assert.equal(chains(merged).length,266);
assert.equal(planCMDMergeBlockChains(merged,'p4b0s0','p4b0s1').changed,0);
const withNote=apply(merged,planCMDMergeBlockChains(merged,'p4b0s0','p4b0s2'));
assert.deepEqual(member(withNote,'p4b0s0').members,['p4b0s0','p4b0s1','p4b0s2']);
assert.equal(member(withNote,'p4b0s0').id,'bc-0001','destination chain ID retained');
const separated=apply(withNote,planCMDSplitBlockChain(withNote,'p4b0s1'));
assert.deepEqual(member(separated,'p4b0s0').members,['p4b0s0']);
assert.deepEqual(member(separated,'p4b0s1').members,['p4b0s1','p4b0s2']);
assert.equal(member(separated,'p4b0s1').id,'bc-0002');
assert.equal(planCMDSplitBlockChain(separated,'p4b0s1').changed,0);
const regrouped=apply(separated,planCMDMoveBlockChainMember(separated,'p4b0s0','p4b0s2','before'));
assert.deepEqual(member(regrouped,'p4b0s1').members,['p4b0s1','p4b0s0','p4b0s2']);
assert.equal(chains(regrouped).length,265);
assert.equal(member(regrouped,'p4b0s1').id,'bc-0002');
const reordered=apply(regrouped,planCMDMoveBlockChainMember(regrouped,'p4b0s2','p4b0s1','before'));
assert.deepEqual(member(reordered,'p4b0s2').members,['p4b0s2','p4b0s1','p4b0s0']);
assert.equal(planCMDMoveBlockChainMember(reordered,'p4b0s2','p4b0s1','before').changed,0);
const acrossPage=apply(reordered,planCMDMoveBlockChainMember(reordered,'p6b7','p4b0s0','after'));
assert.deepEqual(member(acrossPage,'p6b7').members,['p4b0s2','p4b0s1','p4b0s0','p6b7']);
assert.equal(member(acrossPage,'p6b7').id,'bc-0002');
const cutCrossPage=apply(acrossPage,planCMDSplitBlockChain(acrossPage,'p6b7'));
assert.equal(member(cutCrossPage,'p6b7').members.length,1);
assert.equal(member(cutCrossPage,'p6b7').id,'implicit:p6b7');
assert.deepEqual(member(cutCrossPage,'p4b0s2').members,['p4b0s2','p4b0s1','p4b0s0']);
// Explicit annotated table keeps exact role and review information through
// moves. Merge refuses incompatible object types rather than overriding it.
const baseline=readCMDBlockChains(source);
const arranged=baseline.chains.map(c=>({members:[...c.members]}));
const take=id=>{const i=arranged.findIndex(c=>c.members[0]===id);assert(i>=0);arranged.splice(i,1);};
for(const id of ['p3b0s0','p3b0s1','p6b7','p6b8'])take(id);
arranged.push({id:'bc-table',type:'table',members:['p3b0s0','p3b0s1'],roles:{p3b0s0:'header',p3b0s1:'body'}});
arranged.push({id:'bc-column',type:'continuation',members:['p6b7','p6b8']});
const typed=apply(source,planCMDBlockChainArrangement(source,arranged));
assert.throws(()=>planCMDMergeBlockChains(typed,'p3b0s0','p6b7'),/Conflicting BC/);
const sorted=apply(typed,planCMDMoveBlockChainMember(typed,'p3b0s0','p3b0s1','after'));
assert.equal(member(sorted,'p3b0s1').type,'table');
assert.deepEqual(member(sorted,'p3b0s1').roles,{p3b0s0:'header',p3b0s1:'body'});
assert.throws(()=>planCMDMoveBlockChainMember(typed,'p6b7','p3b0s0'),/Conflicting BC/);
// Legacy predecessor A->B->C migrates into one explicit stable BC id, without
// rewriting the body, unannotated child nodes, audit comments or sealed JSON.
const mark=(prev,id)=>`<!-- ocr2md:block-join:v1 prev="${prev}" target="${id}" -->\n`;
const one=legacy.replace('<!-- minerujson:block:v1:6:7 -->',mark('p6b6','p6b7')+'<!-- minerujson:block:v1:6:7 -->');
const old=one.replace('<!-- minerujson:block:v1:6:8 -->',mark('p6b7','p6b8')+'<!-- minerujson:block:v1:6:8 -->');
assert.deepEqual(member(old,'p6b6').members,['p6b6','p6b7','p6b8']);
const migration=planCMDMigrateLegacyBlockChains(old);
assert.equal(migration.migrated,224);assert.equal(migration.joins,2);
const modern=apply(old,migration);
assert.equal(member(modern,'p6b6').explicit,true);
assert.deepEqual(member(modern,'p6b6').members,['p6b6','p6b7','p6b8']);
assert.equal(member(modern,'p6b7').id,member(modern,'p6b6').id);
assert.equal(planCMDMigrateLegacyBlockChains(modern).changed,0,'migration idempotent');
const children=await planCMDSubblockAnnotations(modern);
assert.equal(children.inserted,43);
const annotated=apply(modern,{changed:children.edits.length,edits:children.edits});
assert.equal(readCMDBlockChains(annotated).atoms.length,267);
assert(!annotated.includes('minerujson:subblock:v1:'),
  'explicit original child annotation after migration uses canonical PBS');
assert.equal((await planCMDSubblockAnnotations(annotated)).edits.length,0);
assert(!modern.includes('ocr2md:block-join:v1'));
assert(!modern.includes('minerujson:block:v1'));
const oldQuoted=legacy.replace('<!-- minerujson:block:v1:6:7 -->',
  '> <!-- minerujson:block:v1:6:7 -->');
const quoted=planCMDMigrateLegacyBlockChains(oldQuoted);
assert(quoted.edits.some(e=>e.insert==='> <!-- cmd:block:v1 p="6" b="7" -->'));
assert.equal(quoted.migrated,224);
const damaged=old.replace('target="p6b7"','target="p1b2"');
assert.throws(()=>planCMDMigrateLegacyBlockChains(damaged),/Invalid legacy/);
assert.throws(()=>planCMDMigrateLegacyBlockChains(old.replace('<!-- minerujson:block:v1:6:7 -->','<!-- minerujson:block:v1:6:9 -->')),/Invalid legacy|partition/);
assert.throws(()=>planCMDMigrateLegacyBlockChains(old+'\n<!-- ocr2md:block-join:v1 nonsense -->'),/Invalid legacy/);
assert.throws(()=>planCMDMoveBlockChainMember(legacy,'p6b6','p6b7'),/Legacy PBS/);
assert.equal(planCMDMergeBlockChains(source,'p4b0','p4b0').changed,0);
console.log('CMD_BLOCK_CHAINS_WP2_PASS',{newAtoms:267,legacyAtoms:224,
  migrated:224,legacyJoins:2,crossPage:'p4b0s0→p6b7'});
