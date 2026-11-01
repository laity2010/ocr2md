import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planPDFTextInsertion} from '../ui/cmd-pdf-text-insert.js';
import {extractPDFBlockText} from '../ui/pdf-block-text-extract.js';
const source=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8');
const caret=source.indexOf('Published online: 12 Dec 2018.')+10;
const insert=planPDFTextInsertion(source,caret,'  PDF original text, review manually.  ');
assert.deepEqual(insert,{from:caret,to:caret,expected:'',
  insert:'PDF original text, review manually.',cursorAfter:caret+'PDF original text, review manually.'.length});
const changed=source.slice(0,insert.from)+insert.insert+source.slice(insert.to);
assert.equal(changed.slice(0,caret),source.slice(0,caret));
assert.equal(changed.slice(caret+insert.insert.length),source.slice(caret),
  'insertion must keep all original OCR blocks and evidence unchanged');
const selectedElsewhere=planPDFTextInsertion(source,caret,'<table>OCR uncertain</table>');
assert.equal(selectedElsewhere.to,selectedElsewhere.from,
  'complex content in the PDF destination block is NOT a restriction');
assert.throws(()=>planPDFTextInsertion(source,-1,'text'),/光标/);
assert.throws(()=>planPDFTextInsertion(source,source.length+1,'text'),/光标/);
assert.throws(()=>planPDFTextInsertion(source,caret,'   '),/无可插入/);
assert.throws(()=>planPDFTextInsertion(source,caret,'hello\0'),/无可插入/);
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
console.log('PDF_TEXT_INSERT_PLANNER_PASS',{sourceLength:source.length,caret,nonDestructive:true,dropCap:true});
