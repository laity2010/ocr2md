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
  assert.equal(reading.anchors[0].blockId,'p0b0');
  assert.equal(reading.anchors[0].blockStart,true);
  assert.equal(reading.anchors[1].blockStart,false,
    'second sentence of same source text block has no paragraph blank line');
  assert.equal(clean.doc,snapshot);
  assert.equal(restoreReviewedMD(clean),source);
});

test('reading projection preserves blank lines BETWEEN distinct source text blocks',()=>{
  const source='<!-- cmd:block:v1 id="p0b0" -->\n\nFirst. Second.\n\n'+
    '<!-- cmd:block:v1 id="p0b1" -->\n\nThird.\n';
  const from=source.indexOf('First.'),third=source.indexOf('Third.');
  const rows=[
    {id:'p0b0-s001',blockId:'p0b0',type:'sentence',from,to:from+6,sourceRanges:[{from,to:from+6}]},
    {id:'p0b0-s002',blockId:'p0b0',type:'sentence',from:from+6,to:from+14,sourceRanges:[{from:from+6,to:from+14}]},
    {id:'p0b1-s001',blockId:'p0b1',type:'sentence',from:third,to:third+6,sourceRanges:[{from:third,to:third+6}]},
  ];
  const clean=buildCleanReviewedMD(source,rows),reading=buildTranslationReadingProjection(clean);
  assert.deepEqual(reading.anchors.map(a=>a.blockStart),[true,false,true]);
  assert.deepEqual(reading.anchors.map(a=>a.blockId),['p0b0','p0b0','p0b1']);
  assert.match(reading.doc,/First\.\n\nSecond\.\n\nThird\./);
  assert.equal(restoreReviewedMD(clean),source);
});

test('media paths use Main same-origin read-only route, never local copies or arbitrary traversal',()=>{
  assert.equal(mainMediaURL('media/c325de69ed79d580bf472bbf.png'),'/media/c325de69ed79d580bf472bbf.png');
  assert.equal(mainMediaURL('media/a.jpg'),'/media/a.jpg');
  for(const bad of ['../media/x.jpg','media/../../file.jpg','media/a.svg',
    'https://external.test/a.jpg','media/%2e%2e/x.png'])assert.equal(mainMediaURL(bad),null);
});

test('reviewed CMD lb=m is one reversible paragraph and keeps following sentence positioning',()=>{
  const source=[
    '<!-- cmd:block:v1 id="p1b0s0" -->','',
    'The rate was about','',
    '<!-- cmd:block:v1 id="p1b0s1" lb="m" -->','',
    '3 points below. Next sentence.'
  ].join('\n');
  const a=source.indexOf('The rate was about');
  const b=source.indexOf('3 points below.');
  const c=source.indexOf(' Next sentence.',b);
  const rows=[
    {id:'p1b0s0-s001',blockId:'p1b0s0',blockIds:['p1b0s0','p1b0s1'],
      type:'sentence',from:a,to:c,
      sourceRanges:[{from:a,to:a+'The rate was about'.length},{from:b,to:c}]},
    {id:'p1b0s1-s002',blockId:'p1b0s1',type:'sentence',from:c,to:source.length,
      sourceRanges:[{from:c,to:source.length}]},
  ];
  const clean=buildCleanReviewedMD(source,rows);
  assert.equal(clean.stats.reviewedJoins,1);
  assert.equal(clean.stats.sentenceBreaks,1);
  assert(clean.doc.includes('The rate was about 3 points below.\nNext sentence.'));
  assert(!clean.doc.includes('cmd:block'), 'CMD provenance stays out of the reader');
  assert.equal(restoreReviewedMD(clean),source,'original CMD must be byte-identical');
  const reading=buildTranslationReadingProjection(clean);
  assert(reading.doc.includes('The rate was about 3 points below.\n\nNext sentence.'));
  assert.deepEqual(reading.anchors.map(a=>a.id),['p1b0s0-s001','p1b0s1-s002']);
  assert.deepEqual(reading.anchors.map(a=>a.blockStart),[true,false]);
  const invalid=structuredClone(rows);
  invalid[0].sourceRanges[1].from+=3;
  assert.throws(()=>buildCleanReviewedMD(source,invalid),/缺失已审核|包含其他正文/);
});
