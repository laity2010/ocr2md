import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCleanReviewedMD,restoreReviewedMD} from '../ui/translation-review-clean-md.js';
import {buildTranslationReadingProjection,mainMediaURL} from '../ui/translation-review-reading.js';

test('Main rendering adapter uses transient paragraphs/math but does not modify clean MD',()=>{
  const source='<!-- cmd:block:v1 id="p0b0" -->\n\nFirst. Second.\n\n'+
    '<!--ocr2md:latex id="1234567890abcdef" review="latex" delimited="auto-inline"-->$x+y$';
  const from=source.indexOf('First.');
  const rows=[
    {id:'p0b0-s001',blockId:'p0b0',type:'sentence',from,to:from+6,
      sourceRanges:[{from,to:from+6}]},
    {id:'p0b0-s002',blockId:'p0b0',type:'sentence',from:from+6,to:from+14,
      sourceRanges:[{from:from+6,to:from+14}]}
  ];
  const clean=buildCleanReviewedMD(source,rows);
  const snapshot=clean.doc;
  const reading=buildTranslationReadingProjection(clean);
  assert(reading.doc.includes('First.\n\nSecond.'));
  assert(reading.doc.includes('review="latex"'));
  assert.equal(reading.stats.sentenceParagraphs,1);
  assert.equal(reading.stats.reviewedInlineMath,1);
  assert.equal(reading.anchors.length,2);
  assert(reading.anchors[1].line>reading.anchors[0].line);
  assert.equal(clean.doc,snapshot);
  assert.equal(restoreReviewedMD(clean),source);
});

test('media paths use Main same-origin read-only route, never local copies or arbitrary traversal',()=>{
  assert.equal(mainMediaURL('media/c325de69ed79d580bf472bbf.png'),'/media/c325de69ed79d580bf472bbf.png');
  assert.equal(mainMediaURL('media/a.jpg'),'/media/a.jpg');
  for(const bad of ['../media/x.jpg','media/../../file.jpg','media/a.svg',
    'https://external.test/a.jpg','media/%2e%2e/x.png'])assert.equal(mainMediaURL(bad),null);
});
