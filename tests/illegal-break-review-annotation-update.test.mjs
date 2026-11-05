import assert from 'node:assert/strict';
import {EditorState} from '@codemirror/state';
import {isIllegalBreakReviewOnlyChange,rebaseIllegalBreakRowsInPlace}
  from '../ui/illegal-break-review-annotation-update.js';
const note='<!--ocr2md:illegal-break-review v="1" before="p4b0s0" after="p4b0s1" decision="merge"-->\n';
const source='A first line\n<!-- cmd:block:v1 id="p4b0s1" -->\nB second line\n';
function change(before,from,to,insert){
 const startState=EditorState.create({doc:before});
 const changes=startState.changes({from,to,insert});
 const state=startState.update({changes}).state;
 return {docChanged:true,startState,state,changes};
}
const at=source.indexOf('<!-- cmd:block');
let update=change(source,at,at,note);
assert.equal(isIllegalBreakReviewOnlyChange(update),true);
let rows=[{from:source.indexOf('B second'),to:source.indexOf('B second')+1,
  line:3,afterLine:3,witness:'B',reviewDecision:'待定'}];
const old=rows[0];
rebaseIllegalBreakRowsInPlace(rows,update.changes,update.startState.doc,update.state.doc);
assert.equal(rows[0],old);
assert.equal(rows[0].line,4);
assert.equal(rows[0].afterLine,4);
assert.equal(rows[0].witness,'B');
const updated=update.state.doc.toString();
update=change(updated,at,at+note.length,'');
assert.equal(isIllegalBreakReviewOnlyChange(update),true,'undo must be metadata-only');
rebaseIllegalBreakRowsInPlace(rows,update.changes,update.startState.doc,update.state.doc);
assert.equal(rows[0].line,3);
assert.equal(rows[0].from,source.indexOf('B second'));
const newChoice=note.replace('decision="merge"','decision="ignore"');
update=change(updated,at,at+note.length,newChoice);
assert.equal(isIllegalBreakReviewOnlyChange(update),true,'changing review value is metadata-only');
assert.equal(isIllegalBreakReviewOnlyChange(change(source,0,1,'Z')),false,'prose edit forces scan');
assert.equal(isIllegalBreakReviewOnlyChange(change(source,at,at,note+'oops')),false,
 'mixed review text edit forces scan');
console.log('ILLEGAL_BREAK_REVIEW_METADATA_ONLY_PASS classification and in-place source map, Undo/redo, mixed edit rejected');
