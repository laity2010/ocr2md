import assert from 'node:assert/strict';
import {EditorState} from '@codemirror/state';
import {singleLineMD} from '../ui/v2-single-line.js';
import {composeLogicalSource,logicalTextRows} from '../ui/v2-block-source.js';
import {previewLineProjection} from '../ui/v2-preview-line-projection.js';
import {moveLogicalBlocks} from '../ui/v2-structure-move.js';

assert.equal(singleLineMD('  Warren\n  Buffet\r\nreturns \n\n rise  '),'Warren Buffet returns rise');
assert.equal(singleLineMD('$$\n x^2 + 1 \n$$'),'$$ x^2 + 1 $$');
assert.equal(singleLineMD('<table>\n<tr><td>A</td></tr>\n</table>'),'<table> <tr><td>A</td></tr> </table>');
assert.equal(singleLineMD('单行🙂'),'单行🙂');
const rows=['标题','段落🙂','', '$x^2$'].map((markdownText,i)=>({
  logicalId:11+i,baseBlockId:11+i,logicalOrder:i+1,p:0,b:i,s:0,
  parentId:null,blockType:'text',markdownText,
}));
const one=composeLogicalSource(rows);
assert.equal(one.source,'标题\n段落🙂\n\n$x^2$');
assert.equal(EditorState.create({doc:one.source}).doc.lines,rows.length);
assert.deepEqual(one.blocks.map(x=>x.groupEndPad),[1,1,1,0]);
assert.deepEqual(logicalTextRows(one.source,one.blocks).map(r=>r.markdownText),
  rows.map(r=>r.markdownText));
const projection=previewLineProjection(rows,id=>rows.findIndex(r=>r.logicalId===id)+1);
assert.equal(projection.source,'标题\n\n段落🙂\n\n\n\n$x^2$');
assert.deepEqual(projection.map(3,4),{start:2,end:3});
assert.deepEqual(projection.map(7,8),{start:4,end:5});
const drag=moveLogicalBlocks(rows,{sourceBlockId:13,targetBlockId:12,placement:'child'});
assert.equal(drag.source,one.source,'reparenting does not insert blank lines');
assert.equal(EditorState.create({doc:drag.source}).doc.lines,rows.length);
assert.deepEqual(logicalTextRows(drag.source,drag.blocks).map(r=>r.markdownText),
  rows.map(r=>r.markdownText));
console.log('WP14_ONE_LOGICAL_BLOCK_PER_SOURCE_LINE_PASS');
