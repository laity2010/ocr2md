import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCleanReviewedMD,restoreReviewedMD} from '../ui/translation-review-clean-md.js';

function row(id,blockId,from,to,type='sentence'){
  return {id,blockId,from,to,type,sourceRanges:[{from,to}],original:'source text'};
}

test('WP1: preserves headings/media/formulas/HTML/note links and separates only consecutive sentences',()=>{
  const source=[
    '<!-- minerujson:document-meta:v1\n{"discarded": "private OCR provenance"}\n-->',
    '<!-- cmd:block:v1 id="p0b0" -->','',
    '# Research title','',
    '<!-- cmd:block:v1 id="p0b1" -->','',
    'First sentence. Second sentence.<!--ocr2md:note-ref id="2"-->[^2] Third sentence.',
    '',
    '<!-- cmd:block:v1 id="p0b2" -->','',
    '![image](media/a.jpg)','',
    '<!--ocr2md:latex id="x"-->$x + y$','',
    '<table><tr><td>Keep</td></tr></table>','',
    '<!-- ordinary author comment -->','',
    '<!--ocr2md:note-body id="2"-->[^2]: Retain this footnote.','',
    '<!-- cmd:pbs-locations:v1 {"private":"metadata"} -->'
  ].join('\n');
  const first='First sentence.',second=' Second sentence.',third='<!--ocr2md:note-ref id="2"-->[^2] Third sentence.';
  const firstAt=source.indexOf(first);
  const secondAt=source.indexOf(second,firstAt+first.length);
  const thirdAt=source.indexOf(third,secondAt+second.length);
  const rows=[
    row('p0b1-s001','p0b1',firstAt,firstAt+first.length),
    row('p0b1-s002','p0b1',secondAt,secondAt+second.length),
    row('p0b1-s003','p0b1',thirdAt,thirdAt+third.length)
  ];
  const clean=buildCleanReviewedMD(source,rows);
  assert.equal(restoreReviewedMD(clean),source,'inverse must exactly restore original Markdown');
  assert.equal(clean.stats.sentenceBreaks,2);
  assert(clean.doc.startsWith('# Research title\n\nFirst sentence.\nSecond sentence.[^2]\nThird sentence.'));
  for(const token of ['![image](media/a.jpg)','$x + y$',
     '<table><tr><td>Keep</td></tr></table>',
     '<!-- ordinary author comment -->','[^2]: Retain this footnote.'])
    assert(clean.doc.includes(token),'Missing structural content: '+token);
  assert(!/<!--\s*(?:minerujson|cmd|ocr2md):/.test(clean.doc),'work markers must be gone');
  assert.equal(clean.anchors.length,3);
  assert(clean.doc.slice(clean.anchors[2].from).startsWith('Third sentence.'));
  assert.equal(clean.patches.filter(p=>p.kind==='sentence').length,2);
  const broken={...clean,doc:clean.doc.replace('Third sentence.','Third statement.')};
  assert.throws(()=>restoreReviewedMD(broken),/输出已被修改|不能还原原文/);
});

test('WP1 rejects overlapping or reordered sentence units and unsplittable adjacent boundaries',()=>{
  const source='First.Second.';
  assert.throws(()=>buildCleanReviewedMD(source,[row('a','p0b0',0,6),row('b','p0b0',5,13)]),/无效/);
  assert.throws(()=>buildCleanReviewedMD(source,[row('a','p0b0',0,6),row('b','p0b0',6,13)]),/无法安全换行/);
});
