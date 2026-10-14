/** WP0: a confirmed server write must not require a second Save tap.
 * No filesystem writes or Vault access; all readbacks are synthetic. */
import assert from 'node:assert/strict';
import {confirmMarkingsReadback,sameMarkings} from '../plugins/chapter-boundary/markingsReadback.ts';

const desired={segments:[
  {startBlockId:'blk_start',endBlockId:'blk_end',fileName:'02 Appendix C.md'}]};
const old={segments:[{startBlockId:'blk_start',endBlockId:'blk_end',fileName:'00 Previous.md'}]};
const result=(markings,revision='rev-2',generation='generation-1')=>({
  exists:true,generation,revision,markings
});
async function check(name,returned,{success,revision,reads,waits}){
  let count=0;const delays=[];
  const get=async()=>returned[Math.min(count++,returned.length-1)];
  try{
    const saved=await confirmMarkingsReadback(get,'generation-1',desired,
      async ms=>{delays.push(ms)});
    assert.equal(success,true,name+' unexpectedly succeeded');
    assert.equal(saved.revision,revision);
  }catch(error){
    assert.equal(success,false,name+' unexpectedly failed: '+error);
    assert.match(String(error),/读回仍不一致/);
  }
  assert.equal(count,reads,name+' unnecessary extra reads');
  assert.equal(delays.length,waits,name+' retry wait count');
  console.log('MARKINGS_READBACK_CASE_PASS',name,JSON.stringify({reads:count,waits:delays}));
}
assert.ok(sameMarkings(desired,{segments:[{
  fileName:'02 Appendix C.md',endBlockId:'blk_end',startBlockId:'blk_start'}]}));
await check('same-content-changed-revision',
  [result(desired,'new-icloud-revision')],{success:true,revision:'new-icloud-revision',reads:1,waits:0});
await check('stale-legacy-on-first-read',
  [result(old,'legacy-rev'),result(desired,'current-rev')],
  {success:true,revision:'current-rev',reads:2,waits:1});
await check('delayed-sidecar-visibility',
  [{exists:false,generation:'generation-1',revision:'',markings:null},result(old),
   result(desired,'final-rev')],
  {success:true,revision:'final-rev',reads:3,waits:2});
await check('concurrent-different-content-rejected',
  [result(old,'someone-elses-rev')],{success:false,reads:4,waits:3});
await check('wrong-ir-generation-rejected',
  [result(desired,'rev-x','different-generation')],{success:false,reads:4,waits:3});
await check('missing-file-revision-rejected',
  [result(desired,'')],{success:false,reads:4,waits:3});
console.log('WP0_MARKINGS_READBACK_UNIT_PASS');
