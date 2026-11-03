import assert from 'node:assert/strict';
import {projectPDFParentGroup} from '../ui/pdf-pbs-group-highlight.js';
const original=[
 {id:'p1b4',origin:'p1b4'},
 {id:'p1b4s1',origin:'p1b5'},
 {id:'p1b6',origin:'p1b6'},
];
const selected=projectPDFParentGroup(original,'p1b4');
assert.equal(selected.parentId,'p1b4');
assert.equal(selected.cover('p1b4'),true,'fixed parent bbox');
assert.equal(selected.cover('p1b4s1'),true,'reviewed child at another original bbox');
assert.equal(selected.child('p1b4s0'),true,'virtual original-body overlay');
assert.equal(selected.child('p1b4s1'),true,'reviewed child overlay');
assert.equal(selected.cover('p1b6'),false,'unrelated physical block');
assert.equal(selected.child('p1b6s0'),false);
const afterReorder=projectPDFParentGroup([
 {id:'p1b3',origin:'p1b4'},
 {id:'p1b3s1',origin:'p1b5'},
 {id:'p1b4',origin:'p1b6'},
], 'p1b4');
assert.equal(afterReorder.parentId,'p1b3');
assert.equal(afterReorder.child('p1b3s0'),true);
assert.equal(afterReorder.cover('p1b3s1'),true);
assert.equal(afterReorder.cover('p1b4'),false);
assert.equal(projectPDFParentGroup(original,null).cover('p1b4'),false);
console.log('PDF_PBS_PARENT_GROUP_HIGHLIGHT_PASS');
