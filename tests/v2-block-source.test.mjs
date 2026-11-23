import assert from 'node:assert/strict';
import {EditorState} from '@codemirror/state';
import {composeBlockSource,composeLogicalSource,groupEndPadding,childLinePadding,
  canEditBlocks,mapEditedBlocks,logicalTextRows,BLOCK_END} from '../ui/v2-block-source.js';
import {logicalAtOffset} from '../ui/v2-focus-map.js';

function snapshot(texts,groups){
  let markdown='';const segments=[];
  texts.forEach((text,index)=>{
    if(index)markdown+='\n\n'; // backend transport only, NOT CM6 text
    const startUtf16=markdown.length;markdown+=text;
    const [b,s,parentId]=groups[index];
    segments.push({logicalId:11+index*3,baseBlockId:100+index,
      parentId,logicalOrder:index+1,blockType:index===0?'title':'text',
      p:0,b,s,startUtf16,endUtf16:markdown.length});
  });
  return {schema:'v2-logical-md/v2',markdown,rowCount:texts.length,segments};
}
const originals=['# 章节🧪','','第二段\n第三行','A\n\nB','末尾🙂\n'];
const groups=[[0,0,null],[0,1,11],[1,0,null],[1,1,17],[2,0,null]];
const result=composeBlockSource(snapshot(originals,groups));
assert.equal(BLOCK_END,'\n\n');
assert.equal(groupEndPadding('Text'),'\n\n');
assert.equal(groupEndPadding('Text\n'),'\n');
assert.equal(groupEndPadding('Text\n\n'),'');
assert.equal(groupEndPadding('Text\n\n\n'),'');
assert.equal(childLinePadding('Text'),'\n');
assert.equal(childLinePadding('Text\n'),'');
assert.equal(childLinePadding('Text\n\n'),'');
assert.equal(result.blocks.length,5);
assert.equal(result.source,'# 章节🧪\n\n\n第二段\n第三行\nA\n\nB\n\n末尾🙂\n\n');
assert(result.source.endsWith('\n'),'legacy original last block has its own ending LF');
assert.deepEqual(logicalTextRows(result.source,result.blocks).map(r=>r.markdownText),originals,
  'all user/OCR newlines are owned by their original block, never trimmed');
assert.deepEqual(result.blocks.map(r=>r.groupEndPad),[1,2,1,2,1]);
assert.equal(result.blocks[0].to,'# 章节🧪\n'.length,'UTF16 emoji content plus virtual child-line LF');
assert.equal(result.blocks[0].to,result.blocks[1].from,'child starts on its own CM6 line');
assert.equal(result.blocks[1].to,result.blocks[2].from,'empty s1 still owns one CM6 physical source line');
assert.equal(result.blocks[2].to,result.blocks[3].from,'adjacent siblings have one visible line break');
assert.equal(logicalAtOffset(result.blocks,result.blocks[1].from).logicalId,14,
  'at an immediate child boundary, the child owns its first position');
assert.equal(logicalAtOffset(result.blocks,result.blocks[1].to-1).logicalId,14,
  'empty child owns its virtual line ending');
assert.equal(logicalAtOffset(result.blocks,result.blocks[3].from).logicalId,20);
assert.equal(logicalAtOffset(result.blocks,result.blocks.at(-1).to).logicalId,23);

// Existing raw line endings remain unchanged: an explicit blank line is
// not silently removed or rewritten in SQLite to satisfy the display rule.
const oneLine=composeLogicalSource([
  {...result.blocks[0],p:0,b:9,s:0,markdownText:'父块'},
  {...result.blocks[1],p:0,b:9,s:1,markdownText:'子块'},
]);
assert.equal(oneLine.source,'父块\n子块\n\n');
assert.equal(oneLine.source.split('\n')[1],'子块','both blocks have one text line');
assert.deepEqual(logicalTextRows(oneLine.source,oneLine.blocks).map(r=>r.markdownText),['父块','子块']);
const rawLine=composeLogicalSource([
  {...result.blocks[0],p:0,b:9,s:0,markdownText:'父块\n'},
  {...result.blocks[1],p:0,b:9,s:1,markdownText:'子块'},
]);
assert.equal(rawLine.source,'父块\n子块\n\n');
assert.equal(rawLine.blocks[0].groupEndPad,0,'no extra LF when raw parent already ends in LF');
const rawBlank=composeLogicalSource([
  {...result.blocks[0],p:0,b:9,s:0,markdownText:'父块\n\n'},
  {...result.blocks[1],p:0,b:9,s:1,markdownText:'子块'},
]);
assert.equal(rawBlank.source,'父块\n\n子块\n\n','do not silently modify legacy edited MD Block');

// A blank line entered into any child (even a non-last child) is RAW content,
// and is never trimmed or reclassified as a structural separator.
const amended=logicalTextRows(result.source,result.blocks).map(row=>({
  ...row,markdownText:row.logicalId===11?row.markdownText+'\n\n':row.markdownText,
}));
const edited=composeLogicalSource(amended);
assert.equal(edited.blocks[0].groupEndPad,0);
assert.equal(edited.source.slice(0,edited.blocks[0].to),'# 章节🧪\n\n');
assert.equal(logicalTextRows(edited.source,edited.blocks)[0].markdownText,'# 章节🧪\n\n');

// Test position-only helpers on a simulated CM transaction. UI remains
// read-only in WP08; this is NOT an authorization to edit in production.
const cm=EditorState.create({doc:result.source});
const row=result.blocks[2],point=row.from+3;
const local=cm.update({changes:{from:point,to:point,insert:' NEW'}});
assert.equal(canEditBlocks(result.blocks,local.changes),true);
const mapped=mapEditedBlocks(result.blocks,local.changes);
assert.equal(logicalTextRows(local.state.doc.toString(),mapped)[2].markdownText,'第二段 NEW\n第三行');
const emptyTail=result.blocks[1];
const typingAtBlank=cm.update({changes:{
  from:emptyTail.to-1,to:emptyTail.to-1,insert:'手工加行'}});
assert.equal(canEditBlocks(result.blocks,typingAtBlank.changes),true);
const promoted=mapEditedBlocks(result.blocks,typingAtBlank.changes);
assert.equal(promoted[1].groupEndPad,0,'typing in the blank promotes its display LF into owned text');
assert.equal(logicalTextRows(typingAtBlank.state.doc.toString(),promoted)[1].markdownText,
  '\n手工加行\n','a programmatic edit of the LF must be owned by the same block');
const cross=cm.update({changes:{
  from:result.blocks[2].to-1,to:result.blocks[3].to,insert:'X'}});
assert.equal(canEditBlocks(result.blocks,cross.changes),false,'cannot replace across block IDs');
const all=cm.update({changes:{from:0,to:cm.doc.length,insert:'X'}});
assert.equal(canEditBlocks(result.blocks,all.changes),false);

// WP03 backend positions are separately validated; no Markdown delimiter
// is allowed to be confused with a CM6 logical block boundary.
assert.throws(()=>composeBlockSource({...snapshot(originals,groups),rowCount:10}),/invalid/);
assert.throws(()=>composeBlockSource({...snapshot(originals,groups),
  segments:snapshot(originals,groups).segments.map((x,i)=>
    i===1?{...x,startUtf16:x.startUtf16+1}:x)}),/invalid|inconsistent/);
assert.throws(()=>composeBlockSource(snapshot(originals,groups).segments.map(()=>{})),/invalid/);
console.log('WP14_ONE_LINE_PER_LOGICAL_BLOCK_PASS');
