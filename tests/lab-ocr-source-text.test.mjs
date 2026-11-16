/** OCR base text is not equivalent to image_path, review text or edited MD. */
import assert from 'node:assert/strict';
import {originalBlockText} from '../ui/lab-ocr/source-text.js';
const row=block=>({block_json:JSON.stringify(block)});
assert.equal(originalBlockText(row({lines:[
  {spans:[{content:'One'},{content:' + two'}]},
  {spans:[{content:'Third'}]},
]})),'One + two\nThird');
assert.equal(originalBlockText(row({lines:[{spans:[{html:'<table><tr><td>x</td></tr></table>'}]}]})),
  '<table><tr><td>x</td></tr></table>');
assert.equal(originalBlockText(row({lines:[{spans:[{image_path:'orig.png'}]}]})),'');
assert.equal(originalBlockText(row({lines:[],lines_deleted:true})),'');
assert.equal(originalBlockText(row({blocks:[{lines:[{spans:[{content:'child'}]}]}]})),'',
  'Wrapper has no own text: no implicit recursive child extraction');
assert.equal(originalBlockText(row({lines:[{spans:[{content:' \t  '}]}]})),'');
assert.equal(originalBlockText({block_json:'{bad json'}),'');
assert.equal(originalBlockText(null),'');
assert.equal(originalBlockText(row({lines:[{spans:[{content:'\\frac{a}{b}'}]}]})),
  '\\frac{a}{b}', 'Native editable TeX remains raw');
assert.equal(originalBlockText(row({lines:[{spans:[{content:' A '}]},
  {spans:[{content:''}]},{spans:[{content:' B'}]}]})),' A \n\n B',
 'Whitespace / intentionally empty OCR line within text is preserved');
console.log('LAB_OCR_SOURCE_TEXT_CONTRACT_PASS');
