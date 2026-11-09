import test from 'node:test';
import assert from 'node:assert/strict';
import {createReviewedSourcePackage,prepareReviewedSourcePackage} from '../ui/sentence-benchmark-reviewed-package.js';
import {createHash} from 'node:crypto';

const revision='a'.repeat(64);
const doc=['<!-- cmd:block:v1 id="p1b0s0" -->','','The cost is about','',
  '<!-- cmd:block:v1 id="p1b0s1" lb="m" -->','','3 percent lower. Next sentence.'].join('\n');
const left=doc.indexOf('The cost is about');
const right=doc.indexOf('3 percent lower.');
const next=doc.indexOf(' Next sentence.');
const record=(id,blockId,from,to,ranges,blockIds)=>({id,blockId,from,to,
  type:'sentence',elementType:'paragraph',decision:'auto',
  sourceRanges:ranges,original:'placeholder',corrected:null,translation:null,
  ...(blockIds?{blockIds}:{})});
const table={schema:'ocr2md-translation-units/v1',sourceSha256:createHash('sha256').update(doc).digest('hex'),
  coordinate:'UTF-16 source offsets in unchanged CMD',rows:[
    record('p1b0s0-s001','p1b0s0',left,next,[
      {from:left,to:left+'The cost is about'.length},{from:right,to:next}],['p1b0s0','p1b0s1']),
    record('p1b0s1-s002','p1b0s1',next,doc.length,[{from:next,to:doc.length}])
  ]};

test('Sentence Lab produces one versioned reviewed MD with real joined source and 2 mapped IDs',()=>{
  const packet=createReviewedSourcePackage(doc,table,revision);
  const ready=prepareReviewedSourcePackage(packet);
  assert.equal(packet.clean.stats.reviewedJoins,1);
  assert.equal(packet.clean.source,doc);
  assert(packet.clean.doc.includes('The cost is about 3 percent lower.\nNext sentence.'));
  assert(packet.reading.doc.includes('The cost is about 3 percent lower.\n\nNext sentence.'));
  assert.deepEqual(ready.reading.anchors.map(x=>x.id),table.rows.map(x=>x.id));
  assert.equal(ready.rows.length,2);
  assert.deepEqual(ready.names,[],'AI does not inherit old stale results');
  assert.equal(ready.reviewRevision,revision);
  const bad=structuredClone(packet);bad.reading.anchors[0].id='wrong';
  assert.throws(()=>prepareReviewedSourcePackage(bad),/句块 ID/);
  const stale=structuredClone(packet);stale.reading.doc+='corrupted';
  assert.throws(()=>prepareReviewedSourcePackage(stale),/不一致/);
});

test('review package refuses invalid revision before handing off',()=>{
  assert.throws(()=>createReviewedSourcePackage(doc,table,'invalid'),/版本/);
});
