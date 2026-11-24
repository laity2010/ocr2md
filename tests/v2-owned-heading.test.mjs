import assert from 'node:assert/strict';
import {collectOwnedHeadings,ownedBlockType} from '../ui/v2-live-block-type.js';
import {titleClickLine,viewColumns,viewFilter} from '../ui/v2-ag-views.js';
const blocks=[
  '正文😀\n\n## Alpha\n# Beta\n\n',
  '普通正文\n\n```js\n# not title\n',
  '### still code\n```\n\n#### Gamma\n\n',
  '####### Invalid\n#NoSpace\n\n~~~\n# tilde code\n~~~\n\n',
  '# Last\n\n',
];
let offset=0;
const intervals=blocks.map((text,i)=>{
 const from=offset;offset+=text.length;
 return {logicalId:101+i,from,to:offset};
});
const doc=blocks.join('');
const headings=collectOwnedHeadings(doc,intervals);
assert.deepEqual([...headings],[
 [101,[{line:3,text:'## Alpha'},{line:4,text:'# Beta'}]],
 [102,[]],
 [103,[{line:13,text:'#### Gamma'}]],
 [104,[]],
 [105,[{line:22,text:'# Last'}]],
]);
assert.equal(ownedBlockType('text',headings.get(101)),'title');
assert.equal(ownedBlockType('title',[]),'text');
assert.equal(ownedBlockType('table_body',[]),'table_body');
assert.equal(ownedBlockType('table_body',headings.get(103)),'title');
// WP23H classifier stays a read-only helper for the common WP25A index;
// the retired stacked row renderer is no longer the runtime contract.
assert.equal(titleClickLine({source_line:13}),13);
assert.equal(titleClickLine({}),null);
assert.deepEqual(viewFilter('title',true),{line_type:{values:['title']}});
assert.equal(viewColumns('title',[{field:'md_block'}])[0].autoHeight,undefined);
console.log('WP25F_OWNED_HEADINGS_PASS');
