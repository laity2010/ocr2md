import assert from 'node:assert/strict';
import {EditorState} from '@codemirror/state';
import {composeOwnedSource} from '../ui/v2-block-source.js';
import {createMdLineIndex} from '../ui/v2-md-line-index.js';
import {projectV2Latex,resolveV2Formula} from '../ui/v2-latex.js';
const source=composeOwnedSource([
 {logicalId:1,baseBlockId:1,logicalOrder:1,parentId:null,p:0,b:0,s:0,blockType:'text',markdownText:'Value $x^2$ end.\n\n'},
 {logicalId:2,baseBlockId:2,logicalOrder:2,parentId:null,p:1,b:0,s:0,blockType:'interline_equation',markdownText:'$$y^2$$\n\n'},
 {logicalId:3,baseBlockId:3,logicalOrder:3,parentId:null,p:1,b:1,s:0,blockType:'text',markdownText:'New $z$\n\n'}
]);
const doc=EditorState.create({doc:source.source}).doc,index=createMdLineIndex(doc,source.blocks);
const original=[{block_id:1,base_blockid:1,global_page:0,page_size_json:[100,100],block_type:'text',block_json:{lines:[{spans:[{type:'text',content:'Value '},{type:'inline_equation',content:'x^2',bbox:[10,10,20,20]},{type:'text',content:' end.'}]}]}},
 {block_id:2,base_blockid:2,global_page:1,page_size_json:[100,100],block_type:'interline_equation',block_json:{lines:[{spans:[{type:'interline_equation',content:'q',bbox:[10,10,25,25]}]}]}}];
const rows=projectV2Latex(index,original);
assert.equal(rows.length,3);
assert.deepEqual(rows.map(r=>r.match_status),['已匹配','已修订','仅 MD']);
assert.deepEqual(rows.map(r=>r.formula),['x^2','y^2','z']);
assert.deepEqual(rows[0].pdf_bbox,[10,10,20,20]);
assert.equal(rows[2].pdf_bbox,null);
for(const row of rows){assert(resolveV2Formula(index,row));assert.equal(doc.sliceString(row.source_from,row.source_from+row.formula.length),row.formula);}
assert.equal(resolveV2Formula(createMdLineIndex(doc,source.blocks),rows[0]),null);
console.log('WP27_FORMULA_PROJECTION_PASS');
