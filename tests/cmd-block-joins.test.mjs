import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inspectCMDTextBlocks} from '../ui/cmd-text-blocks.js';
import {planCMDBlockJoin,planCMDBlockMove,readCMDBlockJoins,projectCMDLogicalTextBlocks} from '../ui/cmd-block-joins.js';
import {ensureTextBlockSample} from './fixtures/text-block-sample.mjs';
const original=readFileSync(ensureTextBlockSample(),'utf8');
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
const missingPrevious=original.replace('<!-- cmd:block:v1 id="p8b8" -->','<!-- missing:8:8 -->');
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
const broken=original.replace('<!-- cmd:block:v1 id="p6b7" -->',
  '<!-- ocr2md:block-join:v1 prev="p0b0" target="p6b7" -->\n<!-- cmd:block:v1 id="p6b7" -->');
const brokenRows=(await inspectCMDTextBlocks(broken)).rows;
assert.throws(()=>planCMDBlockJoin(broken,brokenRows,'p6b7',true),/无效|损坏|错误/);
// Quoted nested blocks retain quote level for the invisible CMD marker.
const quoted=original.replace('<!-- cmd:block:v1 id="p6b7" -->',
  '> <!-- cmd:block:v1 id="p6b7" -->');
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
// Drag p6b7 after p6b9. The CMD document itself changes reading order;
// original OCR Block IDs, PDF geometry, sealed page/evidence comments survive.
const move=planCMDBlockMove(original,initial,'p6b7','p6b9');
assert.equal(move.changed,1);
const shifted=original.slice(0,move.edits[0].from)+move.edits[0].insert+
  original.slice(move.edits[0].to);
const shiftedRows=(await inspectCMDTextBlocks(shifted)).rows;
assert.deepEqual(shiftedRows.filter(x=>x.pageIndex===6)
  .sort((a,b)=>a.from-b.from).slice(6,11).map(x=>x.id),
  ['p6b6','p6b8','p6b9','p6b7','p6b10']);
assert.equal(planCMDBlockJoin(shifted,shiftedRows,'p6b7',true).previous,'p6b9');
const shiftedLogical=projectCMDLogicalTextBlocks(shifted,shiftedRows);
assert.equal(shiftedLogical.assignments.get('p6b7'),'p6b9');
assert.equal(shiftedLogical.assignments.get('p6b9'),'p6b8');
assert.equal(shiftedLogical.assignments.get('p5b1'),'p5b1');
assert.equal(planCMDBlockMove(shifted,shiftedRows,'p6b7','p6b9').changed,0);
const moveBack=planCMDBlockMove(shifted,shiftedRows,'p6b7','p6b6');
assert.equal(shifted.slice(0,moveBack.edits[0].from)+moveBack.edits[0].insert+
  shifted.slice(moveBack.edits[0].to),original,'reverse movement must restore byte-for-byte');
assert.throws(()=>planCMDBlockMove(original,initial,'p6b7','p7b0'),/同一 PDF 页/);
const joinedMoveSource=original.slice(0,plan.edits[0].from)+plan.edits[0].insert+
  original.slice(plan.edits[0].to);
const joinedForMove=(await inspectCMDTextBlocks(joinedMoveSource)).rows;
const joinedReorder=planCMDBlockMove(joinedMoveSource,joinedForMove,'p6b8','p6b9');
assert.equal(joinedReorder.changed,1,'a joined page must no longer forbid all moves');
const movedJoined=joinedMoveSource.slice(0,joinedReorder.edits[0].from)+
  joinedReorder.edits[0].insert+joinedMoveSource.slice(joinedReorder.edits[0].to);
const movedJoinedRows=(await inspectCMDTextBlocks(movedJoined)).rows;
assert.equal(readCMDBlockJoins(movedJoined,movedJoinedRows).invalid.length,0);
assert.equal(readCMDBlockJoins(movedJoined,movedJoinedRows).joined.get('p6b7'),'p6b6');
// Exact reported case on PDF page 17: p16b11 dragged after p16b8,
// while OTHER blocks have already been joined. Preserve every checkbox state
// and rewrite affected parent IDs to the new immediate CMD predecessor.
const applyEdits=(text,edits)=>[...edits].sort((a,b)=>b.from-a.from)
  .reduce((s,e)=>s.slice(0,e.from)+e.insert+s.slice(e.to),text);
// Page 17: b0 inserted after b8 is an interval rotation, NOT a swap.
// Original b1..b8 retain their relative order, and only these labels -1.
const p17=planCMDBlockMove(original,initial,'p16b0','p16b8');
assert.deepEqual(p17.shift,{movedFrom:0,movedTo:8,
  crossedIds:Array.from({length:8},(_,i)=>`p16b${i+1}`),
  delta:-1,allIndependent:true});
const p17Moved=applyEdits(original,p17.edits);
const p17MovedRows=(await inspectCMDTextBlocks(p17Moved)).rows;
const p17Labels=projectCMDLogicalTextBlocks(p17Moved,p17MovedRows).assignments;
assert.equal(p17Labels.get('p16b0'),'p16b8');
for(let i=1;i<=8;i++)assert.equal(p17Labels.get(`p16b${i}`),`p16b${i-1}`);
for(let i=9;i<=15;i++)assert.equal(p17Labels.get(`p16b${i}`),`p16b${i}`);
assert.equal(p17Labels.get('p15b11'),'p15b11','other page labels must remain untouched');
// Reverse-direction case: b8 moved after b0, b1..b7 all +1.
const backwards17=planCMDBlockMove(original,initial,'p16b8','p16b0');
assert.deepEqual(backwards17.shift,{movedFrom:8,movedTo:1,
  crossedIds:Array.from({length:7},(_,i)=>`p16b${i+1}`),
  delta:1,allIndependent:true});
const backwardsRows=(await inspectCMDTextBlocks(applyEdits(original,backwards17.edits))).rows;
const backwardsLabels=projectCMDLogicalTextBlocks(
  applyEdits(original,backwards17.edits),backwardsRows).assignments;
assert.equal(backwardsLabels.get('p16b8'),'p16b1');
for(let i=1;i<=7;i++)assert.equal(backwardsLabels.get(`p16b${i}`),`p16b${i+1}`);
for(let i=9;i<=15;i++)assert.equal(backwardsLabels.get(`p16b${i}`),`p16b${i}`);
// Move Before, not swap: b8 -> b0; old b0..b7 become b1..b8.
const before17=planCMDBlockMove(original,initial,'p16b8','p16b0','before');
assert.deepEqual(before17.shift,{movedFrom:8,movedTo:0,
  crossedIds:Array.from({length:8},(_,i)=>`p16b${i}`),delta:1,allIndependent:true});
const before17Source=applyEdits(original,before17.edits);
const before17Rows=(await inspectCMDTextBlocks(before17Source)).rows;
const before17Labels=projectCMDLogicalTextBlocks(before17Source,before17Rows).assignments;
assert.equal(before17Labels.get('p16b8'),'p16b0');
for(let i=0;i<8;i++)assert.equal(before17Labels.get(`p16b${i}`),`p16b${i+1}`);
for(let i=9;i<=15;i++)assert.equal(before17Labels.get(`p16b${i}`),`p16b${i}`);
assert.equal(before17Labels.get('p15b11'),'p15b11');
assert.equal(planCMDBlockMove(before17Source,before17Rows,'p16b8','p16b0','before').changed,0);
assert.equal(planCMDBlockMove(before17Source,before17Rows,'p16b0','p16b1','before').changed,0);
const restoreBefore=planCMDBlockMove(before17Source,before17Rows,'p16b8','p16b7','after');
assert.equal(applyEdits(before17Source,restoreBefore.edits),original,
  'moving b8 back after b7 must restore original source byte-for-byte');
assert.throws(()=>planCMDBlockMove(original,initial,'p16b8','p16b0','unknown'),/无效/);
assert.throws(()=>planCMDBlockMove(original,initial,'p16b8','p15b0','before'),/同一 PDF 页/);
let page17=original;
for(const id of ['p16b0','p16b9','p16b11','p16b14']){
  const items=(await inspectCMDTextBlocks(page17)).rows;
  page17=applyEdits(page17,planCMDBlockJoin(page17,items,id,true).edits);
}
const joinedBefore=readCMDBlockJoins(page17,(await inspectCMDTextBlocks(page17)).rows);
assert.deepEqual([...joinedBefore.joined.keys()],['p16b0','p16b9','p16b11','p16b14']);
const move17=planCMDBlockMove(page17,(await inspectCMDTextBlocks(page17)).rows,'p16b11','p16b8');
assert.equal(move17.shift.allIndependent,false,'joined intervals must not be described as uniform logical +/-1');
const after17=applyEdits(page17,move17.edits);
const after17Rows=(await inspectCMDTextBlocks(after17)).rows;
const after17Joins=readCMDBlockJoins(after17,after17Rows);
assert.deepEqual(after17Joins.invalid,[]);
assert.equal(after17Joins.joined.get('p16b0'),'p15b11');
assert.equal(after17Joins.joined.get('p16b11'),'p16b9');
assert.equal(after17Joins.joined.get('p16b9'),'p16b8');
assert.equal(after17Joins.joined.get('p16b14'),'p16b13');
assert.equal(after17Joins.joined.size,4);
assert.deepEqual(after17Rows.filter(r=>r.pageIndex===16).sort((a,b)=>a.from-b.from)
  .slice(8,12).map(r=>r.id),['p16b8','p16b9','p16b11','p16b10']);
const undo17=planCMDBlockMove(after17,after17Rows,'p16b11','p16b10');
assert.equal(applyEdits(after17,undo17.edits),page17,
  'reverse movement with existing joins must restore the exact CMD bytes');
// Screenshot regression: visible logical b8 (physical p16b10 with p16b11
// already joined) moved BEFORE visible b0. Both physical members travel as
// one logical block. Old logical b0..b7 follow in their original order.
let joinedPage=original;
for(const id of ['p16b3','p16b5','p16b11']){
  const inventory=(await inspectCMDTextBlocks(joinedPage)).rows;
  joinedPage=applyEdits(joinedPage,planCMDBlockJoin(joinedPage,inventory,id,true).edits);
}
const joinedRows=(await inspectCMDTextBlocks(joinedPage)).rows;
const joinedLabels=projectCMDLogicalTextBlocks(joinedPage,joinedRows).assignments;
assert.equal(joinedLabels.get('p16b10'),'p16b8');
assert.equal(joinedLabels.get('p16b11'),'p16b8');
const moveLogical=planCMDBlockMove(joinedPage,joinedRows,'p16b10','p16b0','before');
assert.deepEqual(moveLogical.shift.crossedIds,Array.from({length:10},(_,i)=>`p16b${i}`));
assert.equal(moveLogical.shift.allIndependent,false);
const logicalSource=applyEdits(joinedPage,moveLogical.edits);
const logicalRows=(await inspectCMDTextBlocks(logicalSource)).rows;
const afterLogical=projectCMDLogicalTextBlocks(logicalSource,logicalRows);
assert.deepEqual(afterLogical.invalid,[]);
assert.equal(afterLogical.assignments.get('p16b10'),'p16b0');
assert.equal(afterLogical.assignments.get('p16b11'),'p16b0');
for(let i=0;i<10;i++)assert.equal(afterLogical.assignments.get(`p16b${i}`),
  `p16b${Number(joinedLabels.get(`p16b${i}`).split('b').at(-1))+1}`);
for(let i=12;i<=15;i++)assert.equal(afterLogical.assignments.get(`p16b${i}`),
  joinedLabels.get(`p16b${i}`),'unaffected logical labels retain their numbers');
const oldJoins=readCMDBlockJoins(joinedPage,joinedRows).joined;
const newJoins=readCMDBlockJoins(logicalSource,logicalRows).joined;
assert.deepEqual([...newJoins].sort(),[...oldJoins].sort(),
  'all joined children must keep the SAME predecessor and original checkbox state');
assert.deepEqual(logicalRows.filter(r=>r.pageIndex===16).sort((a,b)=>a.from-b.from)
  .slice(0,4).map(r=>r.id),['p16b10','p16b11','p16b0','p16b1']);
const undoLogical=planCMDBlockMove(logicalSource,logicalRows,'p16b10','p16b9','after');
assert.equal(applyEdits(logicalSource,undoLogical.edits),joinedPage,
  'reverse move must restore exact CMD bytes including all join markers');
// Also preserve next-page cross-page join if the page tail moves.
const nextPageJoinSource=applyEdits(original,planCMDBlockJoin(original,initial,'p17b0',true).edits);
const crossMove=planCMDBlockMove(nextPageJoinSource,(await inspectCMDTextBlocks(nextPageJoinSource)).rows,
  'p16b15','p16b8');
assert.equal(crossMove.edits.length,2,'next-page join marker must change atomically');
const crossMoved=applyEdits(nextPageJoinSource,crossMove.edits);
const crossMovedRows=(await inspectCMDTextBlocks(crossMoved)).rows;
const crossMovedJoins=readCMDBlockJoins(crossMoved,crossMovedRows);
assert.deepEqual(crossMovedJoins.invalid,[]);
assert.equal(crossMovedJoins.joined.get('p17b0'),'p16b14');
const undoCross=planCMDBlockMove(crossMoved,crossMovedRows,'p16b15','p16b14');
assert.equal(applyEdits(crossMoved,undoCross.edits),nextPageJoinSource,
  'last Block and next-page join can both be restored byte-for-byte');
const movedLast=planCMDBlockMove(original,initial,'p6b11','p6b6');
assert.equal(movedLast.changed,1,'last page block can move without copying next page evidence');
assert(!movedLast.edits[0].expected.includes('<!-- minerujson:page:v1:7'),
  'next page provenance cannot be in a movable segment');
console.log('CMD_BLOCK_JOIN_PASS',{blocks:224,logicalBlocks:223,originalRestored:true,
  pageLocalLabels:true,crossPage:'p8b8→p9b0',allTypes:true,crossColumn:'p6b6→p6b7'});
