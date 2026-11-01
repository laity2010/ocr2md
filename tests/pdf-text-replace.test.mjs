import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planPDFBlockTextReplacement} from '../ui/cmd-pdf-text-replace.js';
import {extractPDFBlockText} from '../ui/pdf-block-text-extract.js';
const source=readFileSync('.v6/workspace/buffetts-alpha.minerujson.md','utf8');
const corruptedOCR=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8');
const edit=planPDFBlockTextReplacement(source,16,0,'PDF original Buffett’s performance.');
assert.match(edit.expected,/might do well/);
assert(edit.insert.includes('PDF original Buffett’s performance.'));
const changed=source.slice(0,edit.from)+edit.insert+source.slice(edit.to);
assert.equal(changed.slice(0,edit.from),source.slice(0,edit.from));
assert.equal(changed.slice(edit.from+edit.insert.length),source.slice(edit.to));
assert(changed.includes('<!-- minerujson:block:v1:16:0 -->'));
const heading=planPDFBlockTextReplacement(source,16,1,'Notes from original PDF');
assert.match(heading.insert,/## Notes from original PDF/);
const numeral=planPDFBlockTextReplacement(source,16,8,'7. The PDF has correct punctuation');
assert.match(numeral.insert,/7\\\. The PDF/);
// Real screenshot p1b9 contains malformed OCR: M\<sup>uch\</sup> etc.
// These *inline* OCR marks are intended to be replaced, not protected.
const repaired=planPDFBlockTextReplacement(corruptedOCR,1,9,
  'Much has been said and written about Warren Buffett and his investment style.');
assert(repaired.expected.includes('\\<sup>uch\\</sup>'));
assert(repaired.insert.includes('Much has been said and written'));
assert(!repaired.insert.includes('<sup>'));
const brokenHTML=corruptedOCR.replace('M\\<sup>uch\\</sup>', '<table>uch</table>');
assert.throws(()=>planPDFBlockTextReplacement(brokenHTML,1,9,'New text'),/复杂结构/);
assert.throws(()=>planPDFBlockTextReplacement(source,16,9,'No body'),/没有可替换正文/);
assert.throws(()=>planPDFBlockTextReplacement(source,16,100,'Invalid'),/找不到/);
const fakeViewport={width:594,height:783,convertToViewportPoint:(x,y)=>[x,783-y]};
const items=[
  {str:'right column',transform:[1,0,0,8,310,650],width:80,height:8},
  {str:'First sentence',transform:[1,0,0,8,60,680],width:100,height:8},
  {str:'Second sentence',transform:[1,0,0,8,60,661],width:100,height:8}
];
assert.equal(extractPDFBlockText(items,fakeViewport,[594,783],[50,95,280,127]),'First sentence Second sentence');
const dropCap=[
  {str:'M',transform:[1,0,0,42,236.6,783-278.4],width:40.3,height:42.7},
  {str:'uch has been said',transform:[1,0,0,9,277.3,783-254.4],width:75,height:9.5},
  {str:'and written',transform:[1,0,0,9,277.3,783-266.4],width:50,height:9.5}
];
assert.equal(extractPDFBlockText(dropCap,fakeViewport,[594,783],[236,245,535,330]),
  'Much has been said and written','drop cap must stay attached to rest of word');
console.log('PDF_TEXT_REPLACE_PLANNER_PASS',{sourceLength:source.length,originalCount:3,heading:true,escapedList:true,guard:true});
