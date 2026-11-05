/** Text A + display LaTeX B + prose C => TWO distinct review entries. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import nspell from 'nspell';
import {buildIllegalBreakLatexSequence} from './fixtures/illegal-break-latex-sequence.mjs';
import {detectIllegalBreaks,planIllegalBreakMarks} from '../ui/cmd-linebreak.js';
import {projectIllegalBreakPair} from '../ui/illegal-break-pair.js';
const source=buildIllegalBreakLatexSequence();
const spell=nspell(readFileSync('node_modules/dictionary-en/index.aff'),
  readFileSync('node_modules/dictionary-en/index.dic'));
const {issues,truncated}=detectIllegalBreaks(source,spell,
  {bodyEnd:source.indexOf('<!-- minerujson:source:v1:')});
assert.equal(truncated,false);
const current=issues.filter(row=>row.blockId?.startsWith('p4b0s'));
assert.deepEqual(current.map(row=>[row.blockId,row.nextBlockId,row.joined,row.reviewKind]),[
  ['p4b0s0','p4b0s1','文本 → LaTeX','latex-boundary'],
  ['p4b0s1','p4b0s2','LaTeX → 文本','latex-boundary'],
]);
assert.deepEqual(current.map(row=>[row.pdfPage,row.nextPdfPage]),[[5,5],[5,5]]);
for(const row of current){
  assert.equal(row.reviewOnly,true);
  assert.equal(row.scopeLabel,'LaTeX交界');
  assert.equal(row.afterLine,row.line);
  assert.equal(source.slice(0,row.from).split('\n').length,row.line,
    'formula/right text source offset must be the actual right child opening');
  assert.deepEqual(projectIllegalBreakPair(row),{
    beforeBlockId:row.blockId,afterBlockId:row.nextBlockId,pairKind:'跨块'
  });
}
assert(!issues.some(row=>row.blockId==='p4b0s0'&&row.nextBlockId==='p4b0s2'),
  'must not bridge over a LaTeX block to join text A to C');
assert(!issues.some(row=>row.blockId==='p4b0s2'&&row.reviewKind==='child-start'),
  'strong formula edge replaces generic lower-case child-start');
assert.equal(planIllegalBreakMarks(source,current,[]).length,0,
  'formula boundaries are human review only, never written to CMD');
console.log('CMD_LATEX_TWO_BOUNDARIES_PASS p4b0s0→s1 and s1→s2, no skip, source offsets, no write');
