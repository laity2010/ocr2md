import assert from 'node:assert/strict';
import {EditorState,ChangeSet} from '@codemirror/state';
import {composeOwnedSource} from '../ui/v2-block-source.js';
import {planMdLineEdit} from '../ui/v2-md-line-edit.js';
import {createMdLineIndex} from '../ui/v2-md-line-index.js';
const make=()=>composeOwnedSource([
 [1,'A\n\n',0],[2,'B😀\n\n',1],[3,'C\n\n',2]
].map(([logicalId,markdownText,b],i)=>({logicalId,baseBlockId:logicalId,logicalOrder:i+1,p:0,b,s:0,parentId:null,blockType:'text',markdownText})));
const original=make(),doc=EditorState.create({doc:original.source}).doc;
const run=(spec,expected)=>{
 const changes=ChangeSet.of(spec,doc.length);
 const plan=planMdLineEdit(doc,original.blocks,changes);
 assert(plan);assert.equal(plan.requested,changes.apply(doc).toString());
 assert.deepEqual(plan.blocks.map(r=>r.markdownText),expected);
 assert.equal(ChangeSet.of(plan.repairs,changes.newLength).apply(changes.apply(doc)).toString(),plan.source);
 const idx=createMdLineIndex(EditorState.create({doc:plan.source}).doc,plan.blocks);
 assert.equal(idx.rows.map(r=>r.md_line+'\n').join(''),plan.source);
 assert.deepEqual(plan.blocks.map(r=>r.logicalId),[1,2,3]);
};
const a=original.blocks[1].from,b=original.blocks[2].from;
run({from:a,insert:'\n'},['A\n\n\n','B😀\n\n','C\n\n']);
run({from:a,insert:'XX\nYY\nZZ'},['A\n\nXX\nYY\n\n','ZZB😀\n\n','C\n\n']);
// A newly terminated nonblank line requires a real group-ending blank,
// not a virtual separator; original next-block prefix remains untouched.
run({from:a,insert:'text'},['A\n\n','textB😀\n\n','C\n\n']);
run({from:0,insert:'first\n'},['first\nA\n\n','B😀\n\n','C\n\n']);
run({from:doc.length,insert:'EOF'},['A\n\n','B😀\n\n','C\n\nEOF\n\n']);
run({from:a,to:b,insert:''},['A\n\n','\n\n','C\n\n']);
run({from:0,to:b,insert:''},['\n\n','\n\n','C\n\n']);
run({from:1,insert:'😀\nQ'},['A😀\nQ\n\n','B😀\n\n','C\n\n']);
assert.equal(planMdLineEdit(doc,original.blocks,ChangeSet.of({from:a-1,to:a+1,insert:''},doc.length)),null);
assert.equal(planMdLineEdit(doc,original.blocks,ChangeSet.of({from:0,to:b,insert:'merge'},doc.length)),null);
console.log('WP25C_LINE_EDIT_DIRECT_PASS');
