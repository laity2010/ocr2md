import assert from 'node:assert/strict';
import {projectV2TableRows,resolveV2TableLine} from '../ui/v2-table-view.js';
import {projectTableBlockRows} from '../ui/lab-ocr/table-view.js';
const rows=[
 {logical_id:1,parent_id:null,block_type:'table'},
 {logical_id:2,parent_id:1,block_type:'text'},
 {logical_id:3,parent_id:null,block_type:'text'},
 {logical_id:4,parent_id:1,block_type:'table_body'},
 {logical_id:5,parent_id:1,block_type:'text'},
];
const map=new Map(rows.map((r,i)=>[r.logical_id,[{pbs:'p0b'+(i===2?1:0)+'s'+i,p:0,md_line:i===0||i===4?'':'line '+i,source_line:i+1}]]));
const index={forBlock:id=>map.get(id)||[]};
const covers=[{logicalId:2,physicalPageIndex:7,bbox:[1,2,3,4]}];
const actual=projectV2TableRows(index,rows,covers);
assert.deepEqual(actual.map(r=>r.logical_id),[1,2,4,5]);
assert.equal(actual[1].block_type,'text');
assert.equal(actual[1].parent_block_id,1);
assert.equal(actual[1].line_no,2);
assert.equal(actual[1].text,'line 1');
assert.equal(actual[1].global_page,7);
assert.equal(actual[1].block_bbox_json,'[1,2,3,4]');
assert.equal(resolveV2TableLine(index,actual[1]).source_line,2);
assert.equal(actual[3].line_no,null);
assert.equal(actual[3].text,null);
assert.equal(resolveV2TableLine(index,actual[3]),null);
assert.deepEqual(projectV2TableRows(index,rows.map(r=>r.logical_id===2?{...r,parent_id:3}:r),covers).map(r=>r.logical_id),[1,4,5]);
assert.deepEqual(projectTableBlockRows([],rows).map(r=>r.logical_id),[1,4],'V1 default unchanged');
console.log('WP30B_TABLE_CHILD_DIRECT_PASS');
