import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {blockAnchor,subblockAnchor} from '../ui/mineru-anchors.js';
import {sourceBlockScopes} from '../ui/cmd-block-labels.js';
import {parseCMDPBSId,parseCMDBlockTag,serializeCMDBlockTag,
  readCMDBlockChains,planCMDBlockChainArrangement} from '../ui/cmd-block-chains.js';
import {readCMDPBSLocations,planCMDPBSLocationsEdit} from '../ui/cmd-pbs-locations.js';
const legacy=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8');
const legacyBlocks=readCMDBlockChains(legacy);
assert.equal(legacyBlocks.invalid.length,0);
assert.deepEqual(legacyBlocks.summary,{atoms:224,chains:224,singleton:224,multiple:0});
const joinToken='<!-- minerujson:block:v1:6:7 -->';
const oldJoined=legacy.replace(joinToken,'<!-- ocr2md:block-join:v1 prev="p6b6" target="p6b7" -->\n'+joinToken);
const old=readCMDBlockChains(oldJoined);
assert.deepEqual(old.chains.find(c=>c.members.includes('p6b6'))?.members,['p6b6','p6b7']);
assert.equal(old.summary.chains,223);
assert.equal(parseCMDPBSId('p4b2s1.0').s.join('.'),'1.0');
assert.equal(parseCMDPBSId('p4b02'),null,'noncanonical PBS rejected');
const atomIds=['p3b0','p3b0s0','p4b0','p9b0','p12b1'];
const body=atomIds.map((id,i)=>`${serializeCMDBlockTag({id})}\n${i===0?'Table title':i===1?'Table body':i===2?'Note':i===3?'Across page':''}`).join('\n\n');
const first=readCMDBlockChains(body);
assert.deepEqual(readCMDPBSLocations(body),{bindings:{},bodies:[],removed:[],range:null},
  'unsealed synthetic CMD may be projected read-only with no PDF provenance');
assert.throws(()=>planCMDPBSLocationsEdit(body,{bindings:{},bodies:[],removed:[]}),
  /without sealed MinerU source/,
  'unsealed synthetic CMD must never persist physical PDF mappings');
assert.throws(()=>readCMDPBSLocations(body+'\n<!-- cmd:pbs-locations:v1 {"schema":1} -->\n'),
  /require sealed MinerU source/,
  'an unsealed input with a forged location footer must fail closed');
assert.deepEqual(first.summary,{atoms:5,chains:5,singleton:5,multiple:0});
assert.equal(first.invalid.length,0);
assert.deepEqual(first.atoms.map(x=>x.id),atomIds);
assert.deepEqual(sourceBlockScopes(body).map(x=>x.kind),['parent','child','parent','parent','parent']);
assert.deepEqual(blockAnchor(serializeCMDBlockTag({id:'p3b0'})),{pageIndex:3,blockIndex:0});
assert.deepEqual(subblockAnchor(serializeCMDBlockTag({id:'p3b0s0'})).path,[0]);
const arrangement=[
  {id:'bc-0001',type:'table',members:['p3b0','p4b0','p12b1'],roles:{p3b0:'header',p4b0:'body',p12b1:'note'}},
  {id:'bc-0002',type:'continuation',members:['p9b0','p3b0s0']},
];
const plan=planCMDBlockChainArrangement(body,arrangement);
assert.equal(plan.changed,5);
const apply=(source,edits)=>[...edits].sort((a,b)=>b.from-a.from)
  .reduce((s,e)=>{
    assert.equal(s.slice(e.from,e.to),e.expected);
    return s.slice(0,e.from)+e.insert+s.slice(e.to);
  },source);
const linked=apply(body,plan.edits);
const parsed=readCMDBlockChains(linked);
assert.equal(parsed.invalid.length,0);
assert.equal(parsed.summary.chains,2);
assert.deepEqual(parsed.chains.find(c=>c.id==='bc-0001').members,['p3b0','p4b0','p12b1']);
assert.equal(parsed.chains.find(c=>c.id==='bc-0001').type,'table');
assert.equal(parsed.chains.find(c=>c.id==='bc-0001').roles.p12b1,'note');
assert.deepEqual(parsed.chains.find(c=>c.id==='bc-0002').members,['p9b0','p3b0s0']);
assert.equal(planCMDBlockChainArrangement(linked,arrangement).changed,0);
// Split BC001 at p4b0 into p3b0 singleton + new p4b0/p12b1 chain.
const split=[{members:['p3b0']},
  {id:'bc-0003',type:'table',members:['p4b0','p12b1'],roles:{p4b0:'body',p12b1:'note'}},
  {id:'bc-0002',type:'continuation',members:['p9b0','p3b0s0']}];
const afterSplit=apply(linked,planCMDBlockChainArrangement(linked,split).edits);
const splitModel=readCMDBlockChains(afterSplit);
assert.equal(splitModel.summary.chains,3);
assert.deepEqual(splitModel.chains.find(c=>c.id==='bc-0003').members,['p4b0','p12b1']);
assert.equal(splitModel.chains.find(c=>c.members[0]==='p3b0').size,1);
assert.throws(()=>planCMDBlockChainArrangement(linked,[arrangement[0]]),/Incomplete PBS partition/);
assert.throws(()=>planCMDBlockChainArrangement(linked,[arrangement[0],arrangement[0]]),/duplicate/);
assert.throws(()=>planCMDBlockChainArrangement(legacy,[]),/Legacy anchors/);
const bad=linked.replace('seq="1"','seq="0"');
assert(readCMDBlockChains(bad).invalid.some(x=>/sequence/.test(x.reason)));
const duplicate=body+'\n'+serializeCMDBlockTag({id:'p3b0'});
assert(readCMDBlockChains(duplicate).invalid.some(x=>/Duplicate PBS/.test(x.reason)));
const testNote=serializeCMDBlockTag({id:'p1b1',review:'confirmed',note:'a & <b> "c"'});
assert.equal(parseCMDBlockTag(testNote).note,'a & <b> "c"');
assert.equal(body.includes('minerujson:source:v1'),false);
console.log('CMD_BLOCK_CHAINS_PASS',{legacyAtoms:224,legacyJoinChains:223,
  explicitChains:parsed.summary.chains,splitChains:splitModel.summary.chains});
