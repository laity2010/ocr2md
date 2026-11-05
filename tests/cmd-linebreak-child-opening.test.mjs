import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import nspell from 'nspell';
import {detectIllegalBreaks,planIllegalBreakMarks} from '../ui/cmd-linebreak.js';
const spell=nspell(readFileSync('node_modules/dictionary-en/index.aff'),
  readFileSync('node_modules/dictionary-en/index.dic'));
const tag=id=>`<!-- cmd:block:v1 id="${id}" -->`;
const source=[
  tag('p0b0'),'',tag('p0b0s0'),'','The first paragraph ends.','',
  tag('p0b0s1'),'','initially, this continuation was lost.','',
  tag('p0b0s2'),'','3 percentage points were missing.','',
  tag('p0b0s3'),'','“The capital letter begins a sentence.”','',
  tag('p0b0s4'),'','![chart](media/chart.png)','',
  tag('p0b0s5'),'','<table><tr><td>normal table data</td></tr></table>','',
  tag('p0b0s6'),'','$$','x+y','$$','',
  tag('p0b0s7'),'','(continued)','',
  tag('p0b1'),'',tag('p0b1s0'),'','A separate parent block.','',
  tag('p1b0'),'',tag('p1b0s0'),'','portfolio returns were calculated.','',
  tag('p1b0s1'),'','The new section starts here.','',
  tag('p1b0s2'),'','underwriting profits rose.','',
  '<!-- minerujson:source:v1:sealed-test -->',
].join('\n');
const bodyEnd=source.indexOf('<!-- minerujson:source:v1:');
const {issues,truncated}=detectIllegalBreaks(source,spell,{bodyEnd});
assert.equal(truncated,false);
const starts=issues.filter(x=>x.reviewKind==='child-start');
assert.deepEqual(starts.map(x=>x.blockId),[
  'p0b0s1','p0b0s2','p1b0s0','p1b0s2',
]);
assert.deepEqual(starts.map(x=>x.joined),[
  'initially, this continuation was lost.','3 percentage points were missing.',
  'portfolio returns were calculated.','underwriting profits rose.',
].map(x=>x.slice(0,75)));
assert(starts.every(x=>x.reviewOnly&&x.scopeLabel==='子块起始'));
assert.equal(starts[0].previousBlockId,'p0b0s0');
assert.equal(starts[0].pdfPage,1);
assert.equal(starts[2].previousBlockId,'p0b1s0','cross-parent candidate included');
assert.deepEqual([starts[2].previousPdfPage,starts[2].pdfPage],[1,2]);
assert.match(starts[2].reason,/跨页/);
assert.match(starts[3].reason,/跨栏/);
assert(starts.every(x=>source.slice(x.from,x.to).match(/^\S/)),
  'source positions must address the actual child opening, not preceding block newline');
assert.equal(new Set(starts.map(x=>x.from)).size,starts.length);
assert.deepEqual(issues.filter(x=>x.reviewKind==='latex-boundary')
  .map(x=>[x.blockId,x.nextBlockId]),[['p0b0s6','p0b0s7']],
  'LaTeX-to-text relationship replaces generic prose-only child-start');
assert.equal(planIllegalBreakMarks(source,issues,[]).length,0,
  'high recall child-start review must never write CMD');
console.log('CMD_CHILD_OPENING_REVIEW_PASS 4 prose child starts + one latex/text edge, cross-parent/page included; structured and capital starts excluded, no auto-edits');
