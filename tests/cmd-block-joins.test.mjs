import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inspectCMDTextBlocks} from '../ui/cmd-text-blocks.js';
import {planCMDBlockJoin,readCMDBlockJoins,projectCMDLogicalTextBlocks} from '../ui/cmd-block-joins.js';
const original=readFileSync('.v6/tests/text-blocks/buffett-reinitialized.minerujson.md','utf8');
const initial=(await inspectCMDTextBlocks(original)).rows;
const plan=planCMDBlockJoin(original,initial,'p6b7',true);
assert.equal(plan.previous,'p6b6');
assert.equal(plan.changed,1);
let merged=original.slice(0,plan.edits[0].from)+plan.edits[0].insert+original.slice(plan.edits[0].to);
let rows=(await inspectCMDTextBlocks(merged)).rows;
assert.equal(rows.length,224);
assert.equal(rows.filter(r=>r.anchorCount===1).length,224);
const logical=projectCMDLogicalTextBlocks(merged,rows);
assert.equal(logical.invalid.length,0);
assert.equal(logical.blocks.length,223);
const group=logical.blocks.find(b=>b.id==='p6b6');
assert.deepEqual(group.memberIds,['p6b6','p6b7']);
assert(group.text.includes('about')&&group.text.includes('3 percentage points'));
assert.equal(planCMDBlockJoin(merged,rows,'p6b7',true).changed,0);
const revert=planCMDBlockJoin(merged,rows,'p6b7',false);
merged=merged.slice(0,revert.edits[0].from)+revert.edits[0].insert+merged.slice(revert.edits[0].to);
assert.equal(merged,original,'reverse join must exactly restore original CMD bytes');
assert.equal(readCMDBlockJoins(merged,initial).joined.size,0);
assert.equal(projectCMDLogicalTextBlocks(merged,initial).blocks.length,224);
for(const id of ['p2b8','p11b6','p15b0','p0b0']){
  assert.throws(()=>planCMDBlockJoin(original,initial,id,true),/不能合并|找不到/);
}
const later=planCMDBlockJoin(original,initial,'p15b6',true);
assert.equal(later.previous,'p15b5');
// Stale or corrupted join markers may not silently change a previous ID.
const broken=original.replace('<!-- minerujson:block:v1:6:7 -->',
  '<!-- ocr2md:block-join:v1 prev="p0b0" target="p6b7" -->\n<!-- minerujson:block:v1:6:7 -->');
const brokenRows=(await inspectCMDTextBlocks(broken)).rows;
assert.throws(()=>planCMDBlockJoin(broken,brokenRows,'p6b7',true),/已经接续/);
// Quoted nested blocks retain quote level for the invisible CMD marker.
const quoted=original.replace('<!-- minerujson:block:v1:6:7 -->',
  '> <!-- minerujson:block:v1:6:7 -->');
const quotedRows=(await inspectCMDTextBlocks(quoted)).rows;
const quotedPlan=planCMDBlockJoin(quoted,quotedRows,'p6b7',true);
assert(quotedPlan.edits[0].insert.startsWith('> <!-- ocr2md:block-join:v1'));
const quotedJoined=quoted.slice(0,quotedPlan.edits[0].from)+quotedPlan.edits[0].insert+
  quoted.slice(quotedPlan.edits[0].to);
const quotedJoinedRows=(await inspectCMDTextBlocks(quotedJoined)).rows;
assert.equal(readCMDBlockJoins(quotedJoined,quotedJoinedRows).joined.get('p6b7'),'p6b6');
const quotedUndo=planCMDBlockJoin(quotedJoined,quotedJoinedRows,'p6b7',false);
assert.equal(quotedJoined.slice(0,quotedUndo.edits[0].from)+quotedUndo.edits[0].insert+
  quotedJoined.slice(quotedUndo.edits[0].to),quoted);
console.log('CMD_BLOCK_JOIN_PASS',{blocks:224,logicalBlocks:223,originalRestored:true,
  crossColumn:'p6b6→p6b7',other:'p15b5→p15b6'});
