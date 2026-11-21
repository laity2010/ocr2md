import assert from 'node:assert/strict';
import {EditorState} from '@codemirror/state';
import {composeBlockSource,canEditBlocks,mapEditedBlocks,logicalTextRows,BLOCK_END} from '../ui/v2-block-source.js';
function snapshot(texts){
 let markdown='',segments=[];
 texts.forEach((text,index)=>{
   if(index)markdown+='\n\n';
   const from=markdown.length;
   markdown+=text;
   segments.push({logicalId:11+index*3,baseBlockId:100+index,
     parentId:null,logicalOrder:index+1,blockType:index===0?'title':'text',
     startUtf16:from,endUtf16:markdown.length});
 });
 return {schema:'v2-logical-md/v2',markdown,rowCount:texts.length,segments};
}
const originals=['# 章节🧪','','第二段\n第三行','A\n\nB','末尾🙂\n'];
const result=composeBlockSource(snapshot(originals));
assert.equal(BLOCK_END,'\n\n\n');
assert.equal(result.blocks.length,originals.length);
assert.equal(result.source,originals.map(text=>text+BLOCK_END).join(''));
assert(result.source.endsWith('\n\n\n'));
assert.deepEqual(logicalTextRows(result.source,result.blocks).map(r=>r.markdownText),originals);
assert.equal(result.blocks[1].from,result.blocks[1].to,'empty block retains identity');
assert.equal(result.blocks[0].to,'# 章节🧪'.length,'offsets are UTF-16');
assert.equal(result.blocks[2].from,result.blocks[1].to+BLOCK_END.length);
let blocks=result.blocks,state=EditorState.create({doc:result.source});
const first=state.update({changes:{from:blocks[0].to,to:blocks[0].to,insert:' NEW'}});
assert.equal(canEditBlocks(blocks,first.changes),true);
blocks=mapEditedBlocks(blocks,first.changes);state=first.state;
assert.equal(logicalTextRows(state.doc.toString(),blocks)[0].markdownText,'# 章节🧪 NEW');
assert.equal(logicalTextRows(state.doc.toString(),blocks)[1].markdownText,'');
const insertEmpty=state.update({changes:{from:blocks[1].from,to:blocks[1].from,insert:'EMPTY NOW'}});
assert.equal(canEditBlocks(blocks,insertEmpty.changes),true);
blocks=mapEditedBlocks(blocks,insertEmpty.changes);state=insertEmpty.state;
assert.equal(logicalTextRows(state.doc.toString(),blocks)[1].markdownText,'EMPTY NOW');
const violating=state.update({changes:{from:blocks[0].to,to:blocks[1].from,insert:''}});
assert.equal(canEditBlocks(blocks,violating.changes),false,'separator deletion is denied');
const all=state.update({changes:{from:0,to:state.doc.length,insert:'X'}});
assert.equal(canEditBlocks(blocks,all.changes),false,'cross-block replace denied');
const last=blocks.at(-1);
const deleteSuffix=state.update({changes:{from:last.to,to:last.to+3,insert:''}});
assert.equal(canEditBlocks(blocks,deleteSuffix.changes),false,'last block still ends with two blank lines');
assert.throws(()=>composeBlockSource({...snapshot(originals),rowCount:10}),/invalid/);
assert.throws(()=>composeBlockSource({...snapshot(originals),segments:snapshot(originals).segments.map((x,i)=>i===1?{...x,startUtf16:x.startUtf16+1}:x)}),/invalid|inconsistent/);
assert.throws(()=>composeBlockSource(snapshot(originals).segments.map(()=>{})),/invalid/);
console.log('WP04_BLOCK_SOURCE_PURE_PASS','5 blocks; empty; emoji UTF16; 2 blanks after every block; protected separators; edit remapping');
