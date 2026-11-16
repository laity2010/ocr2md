import assert from 'node:assert/strict';
import {Text} from '@codemirror/state';
import {physicalLineDeleteRange,focusedLineHasAction} from '../ui/frame/md-line-gutter.js';
import {reconcileMdText,mdSplice} from '../ui/lab-ocr/md-runtime.js';

// A single active gutter button follows the highlighted source focus line;
// all nonfocused physical line numbers are inert text.
assert.deepEqual([1,2,3,4].filter(n=>focusedLineHasAction(n,3,true,`id-${n}`)),[3]);
assert.deepEqual([1,2,3].filter(n=>focusedLineHasAction(n,null,true,`id-${n}`)),[]);
assert.equal(focusedLineHasAction(3,3,false,'id-3'),false);
assert.equal(focusedLineHasAction(3,3,true,null),false);
const original=['Title','','Paragraph','','Tail'];
const md=original.map((text,i)=>({line_id:'line-'+(i+1),line_no:i+1,
 block_id:i<2?11:i<4?12:13,text}));
let count=0;
const makeId=()=>`added-${++count}`;
for(const lineNo of [1,2,3,4,5]){
 const text=original.join('\n');
 const doc=Text.of(original);
 const range=physicalLineDeleteRange(doc,lineNo);
 const nextText=text.slice(0,range.from)+text.slice(range.to);
 const expected=original.filter((_,i)=>i!==lineNo-1);
 assert.equal(nextText,expected.join('\n'),`Physical delete ${lineNo}`);
 const next=reconcileMdText(md,nextText,makeId);
 assert.deepEqual(next.map(row=>row.line_id),md.filter((_,i)=>i!==lineNo-1)
   .map(row=>row.line_id),`Surviving MD LineIDs stable after delete ${lineNo}`);
 assert.deepEqual(next.map(row=>row.block_id),md.filter((_,i)=>i!==lineNo-1)
   .map(row=>row.block_id),`Surviving logical BlockIDs stable after delete ${lineNo}`);
 assert.equal(mdSplice(md,next).deleteCount,1);
 assert.equal(mdSplice(md,next).insert.length,0);
}
// Last remaining physical line can't be removed from a text document. CM6
// must preserve one empty line and its original stable identity.
for(const originalText of ['sole source','']){
 const doc=Text.of([originalText]);
 const range=physicalLineDeleteRange(doc,1);
 const next=originalText.slice(0,range.from)+originalText.slice(range.to);
 assert.equal(next,'');
 const source=[{line_id:'sole',line_no:1,block_id:8,text:originalText}];
 assert.deepEqual(reconcileMdText(source,next,makeId),
   [{...source[0],text:''}]);
}
assert.equal(physicalLineDeleteRange(Text.of(original),0),null);
assert.equal(physicalLineDeleteRange(Text.of(original),6),null);
assert.equal(physicalLineDeleteRange(Text.of(original),2.4),null);
console.log('LAB_OCR_SOURCE_LINE_MENU_CONTRACT_PASS');
