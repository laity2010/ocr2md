import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareTranslationReview,filterTranslationRows} from '../ui/translation-review-core.js';

const row=(id,original)=>({id,blockId:'p0b0',type:'sentence',elementType:'paragraph',
  decision:'auto',from:0,to:original.length,sourceRanges:[{from:0,to:original.length}],
  original,corrected:null,translation:null});
const baseline={schema:'ocr2md-translation-units/v1',sourceSha256:'fixed-source',
  coordinate:'UTF-16',rows:[row('p0b0-s001','Apples is red.'),row('p0b0-s002','They are ripe.')]};
function data(){
  return {schema:'ocr2md-translation-review-dataset/v1',source:'original CMD',
    baseline:structuredClone(baseline),translations:{
      gpt:{...structuredClone(baseline),rows:[
        {...row('p0b0-s001','Apples is red.'),corrected:'Apples are red.',translation:'苹果是红色的。'},
        {...row('p0b0-s002','They are ripe.'),corrected:'They are ripe.',translation:'它们成熟了。'}]},
      grok:{...structuredClone(baseline),rows:[
        {...row('p0b0-s001','Apples is red.'),corrected:'Apples are red.',translation:'苹果呈红色。'},
        {...row('p0b0-s002','They are ripe.'),corrected:'They are fully ripe.',translation:'它们已完全成熟。'}]}
    }};
}
test('independent translation lab joins AI rows by their unchanged ID and computes differences',()=>{
  const model=prepareTranslationReview(data());
  assert.deepEqual(model.names,['gpt','grok']);
  assert.equal(model.rows.length,2);
  assert.deepEqual(model.rows.map(x=>x.englishDiff),[false,true]);
  assert.deepEqual(model.rows.map(x=>x.translationDiff),[true,true]);
  assert.deepEqual(filterTranslationRows(model.rows,'english-diff').map(x=>x.id),['p0b0-s002']);
  assert.equal(filterTranslationRows(model.rows,'translation-diff').length,2);
  assert.equal(filterTranslationRows(model.rows,'corrected').length,2);
});
test('rejects reordered, incomplete or source-modified AI input rather than silently displaying it',()=>{
  const reordered=data();reordered.translations.gpt.rows.reverse();
  assert.throws(()=>prepareTranslationReview(reordered),/错位/);
  const truncated=data();truncated.translations.grok.rows[0].translation='';
  assert.throws(()=>prepareTranslationReview(truncated),/未翻译/);
  const modified=data();modified.translations.gpt.rows[0].sourceRanges[0].to=18;
  assert.throws(()=>prepareTranslationReview(modified),/错位/);
});
