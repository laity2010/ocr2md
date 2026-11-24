import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {projectTitleRows,titleColumns} from '../ui/v2-title-view.js';
import {EnumCheckboxFilter} from '../ui/enum-checkbox-filter.js';
for(const name of ['title-view.js','md-ag-projection.js'])
  assert.deepEqual(readFileSync('ui/lab-ocr/'+name),readFileSync('../lab-ocr/ui/lab-ocr/'+name));
const blocks=['# One','## Two','### Three','#### Four','##### Five','###### Six',
  '####### No','#No','Normal',''].map((markdownText,i)=>({
    logicalId:i+1,baseBlockId:i+20,parentId:null,logicalOrder:i+1,
    p:i,b:2,s:0,blockType:i===8?'title':'text',markdownText,
  }));
const intervals=blocks.map((b,i)=>({logicalId:b.logicalId,from:i*100}));
const project=()=>projectTitleRows(blocks,intervals,pos=>pos/100+1);
assert.deepEqual(project().map(r=>r.level),['#','##','###','####','#####','######']);
assert.equal(project()[1].md_block,'## Two');
assert.equal(project()[1].raw_type,'text');
assert.equal(project()[1].block_type,'title');
assert.equal(project()[1].pbs,'p1b2s0');
assert.equal(project()[1].source_line,2);
blocks[0].markdownText='Ordinary';
blocks[8].markdownText='### Newly promoted';
assert.deepEqual(project().map(r=>r.logical_id),[2,3,4,5,6,9]);
assert.deepEqual(titleColumns().slice(0,3).map(c=>c.headerName),['MD Block','Level','Type']);
assert.equal(titleColumns()[2].filter,EnumCheckboxFilter);
assert.equal(titleColumns()[2].sortable,false);
console.log('WP23_TITLE_PROJECTION_PASS');
