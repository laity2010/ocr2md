import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planPDFBlockTextReplacement} from '../ui/cmd-pdf-text-replace.js';
import {extractPDFBlockText} from '../ui/pdf-block-text-extract.js';
const source=readFileSync('.v6/workspace/buffetts-alpha.minerujson.md','utf8');
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
assert.throws(()=>planPDFBlockTextReplacement(source,1,9,'New text'),/复杂结构/);
assert.throws(()=>planPDFBlockTextReplacement(source,16,9,'No body'),/没有可替换正文/);
assert.throws(()=>planPDFBlockTextReplacement(source,16,100,'Invalid'),/找不到/);
const fakeViewport={width:594,height:783,convertToViewportPoint:(x,y)=>[x,783-y]};
const items=[
  {str:'right column',transform:[1,0,0,8,310,650],width:80,height:8},
  {str:'First sentence',transform:[1,0,0,8,60,680],width:100,height:8},
  {str:'Second sentence',transform:[1,0,0,8,60,661],width:100,height:8}
];
assert.equal(extractPDFBlockText(items,fakeViewport,[594,783],[50,95,280,127]),'First sentence Second sentence');
console.log('PDF_TEXT_REPLACE_PLANNER_PASS',{sourceLength:source.length,originalCount:3,heading:true,escapedList:true,guard:true});
