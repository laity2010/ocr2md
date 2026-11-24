import assert from 'node:assert/strict';
import {EditorState} from '@codemirror/state';
import {composeOwnedSource,composeLogicalSource} from '../ui/v2-block-source.js';
import {createMdLineIndex} from '../ui/v2-md-line-index.js';
import {moveLogicalBlocks} from '../ui/v2-structure-move.js';

const blocks=[
  [11,0,0,0,null,'text','正文😀\n\n## B\n\n'],
  [12,0,1,0,null,'table','\n'],
  [13,0,1,1,12,'table_body','```js\n# code\n'],
  [14,0,1,2,12,'table_footnote','### still code\n```\n# title\n\n'],
  [21,1,0,0,null,'title','Former title\n  \n\n'],
].map(([logicalId,p,b,s,parentId,blockType,markdownText],i)=>({
  logicalId,baseBlockId:logicalId,logicalOrder:i+1,p,b,s,parentId,blockType,markdownText
}));
const assembled=composeOwnedSource(blocks);
const doc=EditorState.create({doc:assembled.source}).doc;
const index=createMdLineIndex(doc,assembled.blocks);
const project=r=>[r.source_line,r.pbs,r.line_offset,r.block_type,r.line_type,r.md_line];
assert.deepEqual(index.rows.map(project),[
  [1,'p0b0s0',0,'text','text','正文😀'],
  [2,'p0b0s0',1,'text','blank',''],
  [3,'p0b0s0',2,'text','title','## B'],
  [4,'p0b0s0',3,'text','blank',''],
  [5,'p0b1s0',0,'table','blank',''],
  [6,'p0b1s1',0,'table_body','text','```js'],
  [7,'p0b1s1',1,'table_body','text','# code'],
  [8,'p0b1s2',0,'table_footnote','text','### still code'],
  [9,'p0b1s2',1,'table_footnote','text','```'],
  [10,'p0b1s2',2,'table_footnote','title','# title'],
  [11,'p0b1s2',3,'table_footnote','blank',''],
  [12,'p1b0s0',0,'title','text','Former title'],
  [13,'p1b0s0',1,'title','blank','  '],
  [14,'p1b0s0',2,'title','blank',''],
]);
assert.equal(index.atSourceLine(3).title_level,2);
assert.equal(index.atSourceLine(7).title_level,null);
assert.equal(index.atSourceLine(1).textTo,4,'UTF-16 surrogate pair counts twice');
assert.equal(index.atSourceLine(1).to,5);
assert.equal(index.atOffset(3),index.rows[0],'low surrogate');
assert.equal(index.atOffset(4),index.rows[0],'real LF belongs to preceding line');
assert.equal(index.atOffset(5),index.rows[1]);
assert.equal(index.atOffset(assembled.blocks[1].from),index.rows[4]);
assert.equal(index.eofOwner,21);
assert.equal(index.atOffset(doc.length),null);
assert.equal(index.atSourceLine(doc.lines),null);
assert.equal(index.rows.length,doc.lines-1);
assert.equal(index.atSourceLine(0),null);
assert.equal(index.atOffset(-1),null);
assert.equal(index.atOffset(1.5),null);
assert.equal(index.atBlockLine(11,-1),null);
assert.equal(index.atBlockLine(11,4),null);
assert.deepEqual(index.forBlock(999),[]);
assert.equal(index.makeRef(doc.lines),null);
for(const r of index.rows){
  assert.equal(index.atBlockLine(r.logical_id,r.line_offset),r);
  assert.equal(index.atSourceLine(r.source_line),r);
  assert.equal(index.atOffset(r.from),r);
  assert.equal(index.atOffset(r.to-1),r);
  assert.equal(index.resolve(index.makeRef(r.source_line)),r);
  assert.equal(doc.sliceString(r.from,r.to),r.md_line+'\n');
}
assert.equal(index.rows.map(r=>r.md_line+'\n').join(''),doc.toString());
for(const b of blocks)
  assert.equal(index.forBlock(b.logicalId).map(r=>r.md_line+'\n').join(''),b.markdownText);
const ref=index.makeRef(3);
assert.equal(createMdLineIndex(doc,assembled.blocks).resolve(ref),null,'stale even if identical text');
assert.equal(index.resolve({revision:{},logical_id:11,line_offset:2}),null);
assert(Object.isFrozen(index)&&Object.isFrozen(index.rows)&&Object.isFrozen(index.rows[0])&&
  Object.isFrozen(index.forBlock(11))&&Object.isFrozen(ref));
const moved=moveLogicalBlocks(blocks,{sourceBlockId:21,targetBlockId:11,placement:'before'},{ownedLF:true});
const movedIndex=createMdLineIndex(EditorState.create({doc:moved.source}).doc,moved.blocks);
assert.equal(movedIndex.resolve(ref),null);
assert.equal(movedIndex.atBlockLine(11,2).md_line,'## B');
assert.notEqual(movedIndex.atBlockLine(11,2).source_line,3);
const empty=createMdLineIndex(EditorState.create({doc:''}).doc,[]);
assert.deepEqual(empty.rows,[]);assert.equal(empty.eofOwner,null);
assert.equal(empty.atSourceLine(1),null);assert.equal(empty.atOffset(0),null);
const invalid=(map,pattern)=>assert.throws(()=>createMdLineIndex(doc,map(assembled.blocks.map(r=>({...r})))),pattern);
invalid(r=>{r[1].from++;return r},/interval/);
invalid(r=>{r[0].to--;r[1].from--;return r},/LF/);
invalid(r=>{r[1].logicalId=r[0].logicalId;return r},/interval/);
invalid(r=>{r[1].p=r[0].p;r[1].b=r[0].b;r[1].s=r[0].s;return r},/interval/);
invalid(r=>{r[0].groupEndPad=0;return r},/interval/);
invalid(r=>r.slice(0,-1),/tail/);
const legacy=composeLogicalSource(blocks);
assert.throws(()=>createMdLineIndex(EditorState.create({doc:legacy.source}).doc,legacy.blocks),/interval/);
console.log('WP25A_MD_LINE_INDEX_PASS',index.rows.length,'real lines, inherited types, UTF16, exact EOF, stale refs');
