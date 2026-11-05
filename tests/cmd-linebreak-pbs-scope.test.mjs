import assert from 'node:assert/strict';
import nspell from 'nspell';
import {readFileSync} from 'node:fs';
import {detectIllegalBreaks,planIllegalBreakMarks} from '../ui/cmd-linebreak.js';
import {formatAnnotation,scanAnnotations} from '../ui/cmd-annotations.js';
import {readIllegalBreaks} from '../ui/cmd-linebreak.js';
const spell=nspell(readFileSync('node_modules/dictionary-en/index.aff'),
  readFileSync('node_modules/dictionary-en/index.dic'));
const tag=id=>`<!-- cmd:block:v1 id="${id}" -->`;
const document=[tag('p0b0'),'',tag('p0b0s0'),'',
  'The govern','ment announced a policy.','',
  tag('p0b0s1'),'','We discussed the latest','',
  tag('p0b0s2'),'','13F report last week.','',
  tag('p0b0s3'),'','The govern','',
  tag('p0b0s4'),'','ment signed the document.','',
  tag('p0b0s5'),'','The report ends.','',
  tag('p0b0s6'),'','Another sentence begins.','',
  tag('p0b1'),'',tag('p0b1s0'),'','The inter','',
  tag('p0b1s1'),'','national trade rules changed.','',
  '<!-- minerujson:source:v1:sealed-test -->'].join('\n');
const bodyEnd=document.indexOf('<!-- minerujson:source:v1:');
const detected=detectIllegalBreaks(document,spell,{bodyEnd});
const within=detected.issues.filter(r=>!r.reviewOnly);
const review=detected.issues.filter(r=>r.reviewOnly);
assert.deepEqual(within.map(r=>r.joined),['government']);
assert.equal(within[0].blockId,'p0b0s0');
assert.equal(within[0].scopeLabel,'子块内');
assert.deepEqual(review.map(r=>r.joined),['latest 13F','government','international']);
assert.deepEqual(review.map(r=>[r.blockId,r.nextBlockId]),[
  ['p0b0s1','p0b0s2'],['p0b0s3','p0b0s4'],['p0b1s0','p0b1s1']]);
assert(review.every(r=>r.parentId&&r.scopeLabel==='子块交界'));
const operations=planIllegalBreakMarks(document,detected.issues,[]);
assert.equal(operations.length,1,'interchild candidate must remain read-only');
const marked=operations.reduce((text,op)=>text.slice(0,op.at)+
  formatAnnotation(op.tag,op.attributes)+text.slice(op.at),document);
const saved=readIllegalBreaks(marked,scanAnnotations(marked));
assert.equal(saved.rows.length,1);
assert.equal(saved.rows[0].blockId,'p0b0s0');
assert.equal(saved.rows[0].scopeLabel,'子块内');
// Current PBS identity wins over the original OCR physical parent source.
const moved=document.replace(tag('p0b0s3'),
  '<!-- cmd:block:v1 id="p0b0s3" origin="p0b8" -->');
// Source provenance can differ from the logical parent, as in p13b1s3.
assert(detectIllegalBreaks(moved,spell,{bodyEnd:moved.indexOf('<!-- minerujson:source:v1:')})
  .issues.some(r=>r.blockId==='p0b0s3'&&r.nextBlockId==='p0b0s4'));
const invalid=document.replace(tag('p0b0s3'),
  '<!-- cmd:block:v1 id="p0b0s3" origin="p1b8" -->');
assert.throws(()=>detectIllegalBreaks(invalid,spell,{bodyEnd:invalid.indexOf('<!-- minerujson:source:v1:')}),
  /文本块标签无效/);
const safe=document.replace('The govern\n\n'+tag('p0b0s4'),
  'The government.\n\n'+tag('p0b0s4'));
assert(!detectIllegalBreaks(safe,spell,{bodyEnd:safe.indexOf('<!-- minerujson:source:v1:')})
  .issues.some(r=>r.blockId==='p0b0s3'));
const paragraph=document.replace('The report ends.',
  'We have discussed the evidence\n\nthe conclusions are consistent.');
const paragraphIssues=detectIllegalBreaks(paragraph,spell,
  {bodyEnd:paragraph.indexOf('<!-- minerujson:source:v1:')}).issues;
assert(paragraphIssues.some(r=>r.blockId==='p0b0s5'&&r.reviewOnly&&
  r.reason==='子块内疑似硬段落断行'&&r.joined==='evidence the'));
assert.equal(planIllegalBreakMarks(paragraph,paragraphIssues,[]).length,1,
  'paragraph gaps and sibling boundaries are review only');
const table=document.replace('The govern\n\n'+tag('p0b0s4'),
  '| govern |\n\n'+tag('p0b0s4'));
assert(!detectIllegalBreaks(table,spell,{bodyEnd:table.indexOf('<!-- minerujson:source:v1:')})
  .issues.some(r=>r.blockId==='p0b0s3'));
console.log('CMD_PBS_LINEBREAK_SCOPE_PASS intra-child mark, adjacent siblings review-only, no cross-parent, provenance');
