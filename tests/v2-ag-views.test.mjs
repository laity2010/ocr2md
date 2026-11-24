import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {viewColumns,viewFilter,usesMdLines,mdLineColumns} from '../ui/v2-ag-views.js';
const original=['pbs','block_type','md_block','logical_id','source_line','raw_block'].map(field=>({field,pinned:field==='pbs'?'left':undefined}));
assert.deepEqual(viewColumns('title',original).map(c=>c.field),
  ['md_block','pbs','source_line','block_type','logical_id','raw_block']);
assert.equal(viewColumns('title',original)[1].pinned,null);
assert.equal(viewColumns('frame',original),original);
assert.deepEqual(viewFilter('title'),{block_type:{values:['title']}});
assert.equal(viewFilter('frame'),null);
assert.deepEqual(viewFilter('title',true),{line_type:{values:['title']}});
assert(usesMdLines('title',true));assert(!usesMdLines('title',false));
assert.equal(mdLineColumns('title')[0].field,'md_line');
assert.equal(typeof mdLineColumns('title')[0].cellRenderer,'function');
for(const name of ['title-view.js','md-ag-projection.js'])
  assert.deepEqual(readFileSync('ui/lab-ocr/'+name),readFileSync('../lab-ocr/ui/lab-ocr/'+name));
console.log('WP23B_AG_VIEW_PRESET_PASS');
