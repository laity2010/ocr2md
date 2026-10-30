/** Regression guard: AG spelling review must never own CMD syntax or CM6 text. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=file=>readFileSync(new URL('../ui/'+file,import.meta.url),'utf8');
const ag=read('spellcheck-module.js');
const layout=read('workspace.js');
const cmd=read('wcp-cmd-element-transactions.js');
const syntax=read('cmd-spellcheck.js');
assert(!/getMarkdown|getCMD\(|readAnnotations|editAnnotations|replaceRanges|planSpellcheckMarks|\.state\.doc|\.dispatch\(/.test(ag),
  'AG spelling module accessed source, CMD internals, or CM6 directly');
assert(!/spellcheck-marks\.js|spellcheckCMD/.test(layout),'Layout kept parallel spelling CMD adapter');
assert(/markSpellingCandidates/.test(cmd)&&/querySpellingElements/.test(cmd),
  'CMD must expose spelling read/write semantics');
assert(/planSpellcheckMarks/.test(syntax)&&/readSpellcheckMarks/.test(syntax),
  'business-owned spell annotation planner reappeared');
assert(!/window\.|document\.|localStorage|fetch\(/.test(syntax),'CMD syntax is not pure');
assert(/const readElementSource=\(\)=>getCMD\(\)\?\.readSource\?\.\(\)/.test(layout),
  'Layout has no single CMD source port for AG elements');
for(const [factory,host] of [
  ['createOutlineGrid','this.element'],['createMediaModule','this.mediaHost'],
  ['createLatexModule','this.latexHost'],['createNotePairModule','this.noteHost'],
  ['createHtmlElementsModule','this.htmlHost'],
]){
  assert(layout.includes(`${factory}(${host},readElementSource`),
    `${factory} did not receive the unified CMD source`);
}
console.log('SPELLCHECK_BOUNDARY_PASS AG projection only, CMD source/transaction owner, CM6 state');
