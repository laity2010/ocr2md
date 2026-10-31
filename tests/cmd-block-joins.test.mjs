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
// No type or content gate: blanks, images, titles, formulae and reference
// entries are all independent by default, and can join the preceding original
// Block (including the last Block of the preceding PDF page).
for(const [id,previous] of [['p2b8','p2b7'],['p11b6','p11b5'],
  ['p0b1','p0b0'],['p0b5','p0b4'],['p5b5','p5b4'],['p21b2','p21b1']]){
  const operation=planCMDBlockJoin(original,initial,id,true);
  assert.equal(operation.previous,previous,`wrong same-page predecessor ${id}`);
  const joined=original.slice(0,operation.edits[0].from)+operation.edits[0].insert+
    original.slice(operation.edits[0].to);
  const updated=(await inspectCMDTextBlocks(joined)).rows;
  const projected=projectCMDLogicalTextBlocks(joined,updated);
  assert.equal(projected.blocks.length,223);
  assert.equal(projected.joined.get(id),previous);
  const undo=planCMDBlockJoin(joined,updated,id,false);
  assert.equal(joined.slice(0,undo.edits[0].from)+undo.edits[0].insert+
    joined.slice(undo.edits[0].to),original);
}
// Only the first document Block is immutable. Page heads are NOT necessarily
// paragraph heads. p9b0 is a continuation of p8b8 in this actual OCR source.
assert.throws(()=>planCMDBlockJoin(original,initial,'p0b0',true),/前驱/);
for(const id of ['p1b0','p2b0','p6b0','p9b0','p21b0']){
  const index=initial.findIndex(row=>row.id===id);
  const previous=initial[index-1].id;
  const crossPage=planCMDBlockJoin(original,initial,id,true);
  assert.equal(crossPage.previous,previous);
  const joinedSource=original.slice(0,crossPage.edits[0].from)+crossPage.edits[0].insert+
    original.slice(crossPage.edits[0].to);
  const joinedRows=(await inspectCMDTextBlocks(joinedSource)).rows;
  const projected=projectCMDLogicalTextBlocks(joinedSource,joinedRows);
  assert.equal(projected.invalid.length,0);
  assert.equal(projected.joined.get(id),previous);
  assert.equal(projected.blocks.length,223);
  const undo=planCMDBlockJoin(joinedSource,joinedRows,id,false);
  assert.equal(joinedSource.slice(0,undo.edits[0].from)+undo.edits[0].insert+
    joinedSource.slice(undo.edits[0].to),original);
}
const crossPlan=planCMDBlockJoin(original,initial,'p9b0',true);
assert.equal(crossPlan.previous,'p8b8');
const crossSource=original.slice(0,crossPlan.edits[0].from)+crossPlan.edits[0].insert+
  original.slice(crossPlan.edits[0].to);
const crossRows=(await inspectCMDTextBlocks(crossSource)).rows;
const crossLogical=projectCMDLogicalTextBlocks(crossSource,crossRows);
assert.deepEqual(crossLogical.blocks.find(b=>b.id==='p8b8').memberIds,['p8b8','p9b0']);
assert.equal(crossLogical.assignments.get('p9b0'),'p8b8');
assert.equal(crossLogical.assignments.get('p9b1'),'p9b0');
assert.equal(crossLogical.assignments.get('p8b8'),'p8b8');
assert.equal(crossLogical.assignments.get('p10b0'),'p10b0');
// A page transition must not skip an absent previous CMD anchor.
const missingPrevious=original.replace('<!-- minerujson:block:v1:8:8 -->','<!-- missing:8:8 -->');
const missingRows=(await inspectCMDTextBlocks(missingPrevious)).rows;
assert.throws(()=>planCMDBlockJoin(missingPrevious,missingRows,'p9b0',true),/前驱/);
// Changing page 3 must renumber ONLY that page's logical groups; never
// rewrite an original identity, nor the numbering on pages 2 and 4.
const emptyPlan=planCMDBlockJoin(original,initial,'p2b8',true);
const emptyJoined=original.slice(0,emptyPlan.edits[0].from)+emptyPlan.edits[0].insert+
  original.slice(emptyPlan.edits[0].to);
const emptyLogical=projectCMDLogicalTextBlocks(emptyJoined,(await inspectCMDTextBlocks(emptyJoined)).rows);
assert.equal(emptyLogical.assignments.get('p2b8'),'p2b7');
assert.equal(emptyLogical.assignments.get('p2b9'),'p2b8');
assert.equal(emptyLogical.assignments.get('p2b10'),'p2b9');
assert.equal(emptyLogical.assignments.get('p1b10'),'p1b10');
assert.equal(emptyLogical.assignments.get('p3b0'),'p3b0');
assert.equal(emptyLogical.blocks.length,223);
const later=planCMDBlockJoin(original,initial,'p15b6',true);
assert.equal(later.previous,'p15b5');
// Stale or corrupted join markers may not silently change a previous ID.
const broken=original.replace('<!-- minerujson:block:v1:6:7 -->',
  '<!-- ocr2md:block-join:v1 prev="p0b0" target="p6b7" -->\n<!-- minerujson:block:v1:6:7 -->');
const brokenRows=(await inspectCMDTextBlocks(broken)).rows;
assert.throws(()=>planCMDBlockJoin(broken,brokenRows,'p6b7',true),/无效|损坏|错误/);
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
  pageLocalLabels:true,crossPage:'p8b8→p9b0',allTypes:true,crossColumn:'p6b6→p6b7'});
