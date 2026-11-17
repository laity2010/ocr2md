import assert from 'node:assert/strict';
import {resolveReviewLocation,sourceBlockStartLine} from '../ui/lab-ocr/four-pane-location.js';
import {viewStore,publishLabFocus} from '../ui/view-store.js';
const md=[
  {line_id:'a',line_no:1,block_id:11,text:'Heading'},
  {line_id:'b',line_no:2,block_id:11,text:''},
  {line_id:'c',line_no:3,block_id:12,text:'Paragraph'},
  {line_id:'d',line_no:4,block_id:12,text:''},
  {line_id:'e',line_no:5,block_id:null,text:'Manual note'},
];
const blocks=[
  {block_id:11,global_page:0,pbs:'p1b0'},
  {block_id:12,global_page:2,pbs:'p3b0'},
  {block_id:13,global_page:3,pbs:'p4b0'},
];
assert.deepEqual(resolveReviewLocation({lineId:'c'},md,blocks),
  {lineId:'c',lineNo:3,blockId:12,page:3,pbs:'p3b0'});
assert.equal(resolveReviewLocation({blockId:11},md,blocks).lineId,'a');
assert.equal(resolveReviewLocation({blockId:12},md,blocks).lineId,'c');
assert.deepEqual(resolveReviewLocation({blockId:13},md,blocks),
  {lineId:null,lineNo:null,blockId:13,page:4,pbs:'p4b0'},
  'PDF-only block stays visible without inventing an MD line');
assert.equal(resolveReviewLocation({lineId:'e'},md,blocks).page,null,
  'Unowned markdown cannot be assigned to a made-up PDF page');
assert.equal(resolveReviewLocation({blockId:99},md,blocks),null);
assert.equal(resolveReviewLocation({lineNo:100},md,blocks),null);
assert.equal(sourceBlockStartLine(resolveReviewLocation({lineId:'d'},md,blocks),md),3,
  'AG selecting a later line in a Block always places source caret at first line');
assert.equal(sourceBlockStartLine(resolveReviewLocation({blockId:11},md,blocks),md),1);
assert.equal(sourceBlockStartLine(resolveReviewLocation({blockId:13},md,blocks),md),null,
  'A PDF-only Block without MD lines must not invent a cursor position');
assert.equal(sourceBlockStartLine(resolveReviewLocation({lineId:'e'},md,blocks),md),5,
  'Manually authored unowned physical source rows can locate their own start');
assert.equal(sourceBlockStartLine(null,md),null);
const before=viewStore.getState().labFocusTarget?.sequence??0;
const samples=[];
const unsubscribe=viewStore.subscribe((next,prior)=>{
  if(next.labFocusTarget!==prior.labFocusTarget)samples.push(next.labFocusTarget);
});
publishLabFocus({origin:'pdf',blockId:12,page:3,lineId:'c',lineNo:3,pbs:'p3b0'});
publishLabFocus({origin:'pdf',blockId:12,page:3,lineId:'c',lineNo:3,pbs:'p3b0'});
assert.equal(samples.length,2);
assert.equal(samples[0].sequence,before+1);
assert.equal(samples[1].sequence,before+2);
assert(Object.isFrozen(samples[1]));
for(const input of [{origin:'unknown'},{origin:'ag',blockId:0},
  {origin:'pdf',page:-1},{origin:'cm6',lineNo:0},{origin:'preview',intent:'scroll'}])
  assert.throws(()=>publishLabFocus(input));
unsubscribe();
console.log('LAB_OCR_FOUR_PANE_LOCATION_PASS');
// Formula-level navigation extends the same semantic focus bus without
// introducing DOM/SQL ownership or changing the prior Block-focus contract.
const formulaEvents=[];
const unFormula=viewStore.subscribe((next,prior)=>{
  if(next.labFocusTarget!==prior.labFocusTarget)formulaEvents.push(next.labFocusTarget);
});
publishLabFocus({origin:'ag',lineId:'c',lineNo:3,blockId:12,page:3,pbs:'p3b0',
  formulaColumn:8,formulaEndColumn:13,formulaBBox:[10,20,40,35],
  formulaKind:'inline'});
assert.equal(formulaEvents.at(-1).formulaColumn,8);
assert.equal(formulaEvents.at(-1).formulaEndColumn,13);
assert.equal(formulaEvents.at(-1).formulaKind,'inline');
assert.deepEqual(formulaEvents.at(-1).formulaBBox,[10,20,40,35]);
assert(Object.isFrozen(formulaEvents.at(-1).formulaBBox));
for(const payload of [
  {origin:'ag',blockId:12,page:3,formulaBBox:[2,3,1,4]},
  {origin:'pdf',blockId:12,page:3,formulaBBox:[1,2,3,4]},
  {origin:'ag',lineNo:3,formulaColumn:-1},
  {origin:'ag',formulaColumn:2},
  {origin:'ag',lineNo:3,formulaColumn:9,formulaEndColumn:8},
  {origin:'ag',lineNo:3,formulaEndColumn:10},
  {origin:'ag',lineNo:3,formulaColumn:2,formulaKind:'bogus'},
  {origin:'cm6',lineNo:3,formulaColumn:2,formulaKind:'inline'},
])assert.throws(()=>publishLabFocus(payload));
unFormula();
console.log('LAB_OCR_FORMULA_FOCUS_BUS_PASS');

// Pair events only carry stable IDs. No source bytes are stored on the bus.
const pairEvents=[];
const stopPair=viewStore.subscribe((next,prior)=>{
  if(next.labFocusTarget!==prior.labFocusTarget)pairEvents.push(next.labFocusTarget);
});
publishLabFocus({origin:'ag',lineId:'c',blockId:12,lineNo:3,page:3,
  blockBreakId:'block-break:11:12'});
assert.equal(pairEvents.at(-1).blockBreakId,'block-break:11:12');
assert(!Object.keys(pairEvents.at(-1)).includes('text'));
for(const item of [
  {origin:'pdf',lineId:'c',blockId:12,lineNo:3,blockBreakId:'block-break:11:12'},
  {origin:'ag',lineId:'c',blockId:12,lineNo:3,blockBreakId:'invalid'},
  {origin:'ag',blockId:12,lineNo:3,blockBreakId:'block-break:11:12'},
])assert.throws(()=>publishLabFocus(item));
stopPair();
console.log('LAB_OCR_PAIR_FOCUS_BUS_PASS');

// Note-match endpoints are precise within one physical source line, unlike
// formula-only highlights or the Block-start fallback. Only AG may publish.
const noteEvents=[];
const stopNote=viewStore.subscribe((next,prior)=>{
  if(next.labFocusTarget!==prior.labFocusTarget)noteEvents.push(next.labFocusTarget);
});
publishLabFocus({origin:'ag',lineId:'c',blockId:12,lineNo:3,page:3,
  noteFrom:4,noteTo:10});
assert.equal(noteEvents.at(-1).noteFrom,4);
assert.equal(noteEvents.at(-1).noteTo,10);
assert(!Object.keys(noteEvents.at(-1)).includes('text'));
for(const item of [
  {origin:'pdf',lineId:'c',blockId:12,lineNo:3,noteFrom:1,noteTo:3},
  {origin:'ag',lineId:'c',blockId:12,lineNo:3,noteFrom:-1,noteTo:2},
  {origin:'ag',lineId:'c',blockId:12,lineNo:3,noteFrom:2,noteTo:2},
  {origin:'ag',lineId:'c',blockId:12,lineNo:3,noteFrom:2},
  {origin:'ag',lineId:'c',blockId:12,noteFrom:0,noteTo:2},
  {origin:'ag',lineId:'c',blockId:12,lineNo:3,noteFrom:2,noteTo:5,formulaColumn:2},
])assert.throws(()=>publishLabFocus(item));
stopNote();
console.log('LAB_OCR_NOTE_RANGE_FOCUS_BUS_DIRECT_PASS');
