import assert from 'node:assert/strict';
import {EditorState,EditorSelection} from '@codemirror/state';
import {virtualChapterExtensions,virtualScopeEffect,currentVirtualChapter} from './cm-virtual-view.js';
const a='<!-- minerujson:block:v1:0:0 -->\n# First\nSome first content\n';
const b='<!-- minerujson:block:v1:1:0 -->\n# Second\nEditable second body\n';
const c='<!-- minerujson:block:v1:2:0 -->\n# Third\nLater content\n';
const evidence='<!-- minerujson:source:v1 -->\nRAW OCR EVIDENCE\n';
const full=a+b+c+evidence;
let state=EditorState.create({doc:full,extensions:virtualChapterExtensions});
const activate={id:'second',from:a.length,to:a.length+b.length};
state=state.update({effects:virtualScopeEffect.of(activate),selection:{anchor:a.length+b.indexOf('Editable')}}).state;
assert.deepEqual(currentVirtualChapter(state),activate);
let before=state;
const outside=state.update({changes:{from:4,to:4,insert:'BLOCKED'}});
assert.equal(outside.state.doc.toString(),full,'Source outside chapter changed!');
assert.equal(currentVirtualChapter(outside.state).id,'second');
// CM6 select-all maps to the visible chapter, not the hidden prefix/suffix.
const selection=state.update({selection:EditorSelection.single(0,full.length)});
const {from,to}=selection.state.selection.main;
assert.equal(from,a.length,'Select-all included hidden chapters before');
assert.equal(to,a.length+b.length,'Select-all included hidden chapters after');
const key='WORKING';
const at=a.length+b.indexOf('Editable')+3;
const inserted=state.update({changes:{from:at,to:at,insert:key}});
state=inserted.state;
assert.equal(state.doc.toString(),full.slice(0,at)+key+full.slice(at));
assert.equal(currentVirtualChapter(state).from,a.length);
assert.equal(currentVirtualChapter(state).to,a.length+b.length+key.length);
assert.equal(currentVirtualChapter(state).id,'second');
assert.equal(state.doc.sliceString(0,a.length),a);
assert.equal(state.doc.sliceString(currentVirtualChapter(state).to),c+evidence);
// Edits on a chapter boundary invalidate, rather than retaining stale offsets.
const heading=state.doc.toString().indexOf('# Second');
state=state.update({changes:{from:heading+2,to:heading+2,insert:'Changed '}}).state;
assert.equal(currentVirtualChapter(state),null,'Edited structural boundary kept a stale view');
// Historical operations may be dispatched unfiltered by existing toolbar;
// field fails open and reveals the whole text, never edits a hidden fragment.
const newState=before.update({changes:{from:3,to:3,insert:'HISTORY'},filter:false}).state;
assert.equal(currentVirtualChapter(newState),null);
console.log('WP4_VIRTUAL_STATE_PASS',JSON.stringify({
  hiddenWriteBlocked:true,selectAllClamped:true,boundsMapped:true,
  boundaryInvalidates:true,externalHistoryRevealsAll:true,
}));
