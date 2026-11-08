import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTranslationPairs,correctedChangeRanges} from '../ui/translation-review-bilingual.js';

function marked(corrected,ranges){return ranges.map(({from,to})=>corrected.slice(from,to));}

test('only changed corrected-English characters are marked, no whole-line highlighting',()=>{
  assert.deepEqual(marked('Buffett’s Alpha',correctedChangeRanges('Bufett’s Alpha','Buffett’s Alpha')),['f']);
  assert.deepEqual(marked('Apples are red.',correctedChangeRanges('Apples is red.','Apples are red.')),['are']);
  assert.deepEqual(correctedChangeRanges('Apples are red.','Apples are red.'),[]);
  assert.deepEqual(marked('foo bar',correctedChangeRanges('x foo bar','foo bar')),['f']);
  assert.deepEqual(marked('foo car 2',correctedChangeRanges('foo bar 1','foo car 2')),['c','2']);
  assert.deepEqual(marked('Hello 🌍!',correctedChangeRanges('Hello 🌎!','Hello 🌍!')),['🌍']);
});

test('English/Chinese output is pair by pair with a blank line and independent ID anchors',()=>{
  const rows=[{id:'p0b1-s001',original:'Bufett is smart.'},
    {id:'p0b1-s002',original:'Apples are red.'}];
  const translated=[
    {id:'p0b1-s001',corrected:'Buffett is smart.',translation:'巴菲特很聪明。'},
    {id:'p0b1-s002',corrected:'Apples are red.',translation:'苹果是红色的。'},
  ];
  const result=buildTranslationPairs(rows,translated);
  assert.equal(result.doc,'Buffett is smart.\n巴菲特很聪明。\n\nApples are red.\n苹果是红色的。\n\n');
  assert.equal(result.doc.includes('校正英文'),false);
  assert.equal(result.doc.includes('中文译文'),false);
  assert.equal(result.doc.includes('###'),false);
  assert.deepEqual(result.anchors,[{id:rows[0].id,from:0},
    {id:rows[1].id,from:'Buffett is smart.\n巴菲特很聪明。\n\n'.length}]);
  assert.deepEqual(result.lines,[
    {id:'p0b1-s001',part:'en',from:0},
    {id:'p0b1-s001',part:'zh',from:'Buffett is smart.\n'.length},
    {id:'p0b1-s002',part:'en',from:'Buffett is smart.\n巴菲特很聪明。\n\n'.length},
    {id:'p0b1-s002',part:'zh',from:'Buffett is smart.\n巴菲特很聪明。\n\nApples are red.\n'.length},
  ]);
  assert.deepEqual(marked(result.doc,result.edits),['f']);
  assert.throws(()=>buildTranslationPairs(rows,translated.slice(1)),/缺少译文/);
});

test('multiline AI projection is a single English line and Chinese line without mutating input',()=>{
  const row={id:'p0b1-b001',original:'Hello world.'};
  const ai={id:row.id,corrected:'Hello\nworld.',translation:'你好，\n世界。'};
  const result=buildTranslationPairs([row],[ai]);
  assert.equal(result.doc,'Hello world.\n你好， 世界。\n\n');
  assert.equal(ai.corrected,'Hello\nworld.');
});

test('both English and Chinese lines carry the same canonical ID even for filtered rows',()=>{
  const a={id:'p5b2-s001',original:'A.'},b={id:'p17b10-s004',original:'B.'};
  const out=buildTranslationPairs([b],[{id:b.id,corrected:'Better.',translation:'更好。'}]);
  assert.deepEqual(out.lines.map(x=>[x.id,x.part]),[[b.id,'en'],[b.id,'zh']]);
  assert(!out.doc.includes(a.id));
  assert.equal(out.lines[1].from,out.doc.indexOf('更好。'));
});
