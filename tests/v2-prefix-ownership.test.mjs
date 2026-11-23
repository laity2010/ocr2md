/** WP18 regression: original 267 logical rows are never sliced two chars late. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {EditorState} from '@codemirror/state';
import {composeBlockSource,composeLogicalSource,logicalTextRows,planOwnedTextEdit} from '../ui/v2-block-source.js';
const python=String.raw`
import json,shutil,tempfile,sys
from pathlib import Path
sys.path.insert(0,'scripts')
import v2_mineru_base as v
fix=Path('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json')
with tempfile.TemporaryDirectory() as name:
 folder=Path(name);(folder/'minerujson').mkdir()
 shutil.copyfile(fix,folder/'minerujson'/'book.json')
 v.new_book(folder)
 print(json.dumps(v.existing_markdown(folder),ensure_ascii=False))
`;
const snap=JSON.parse(execFileSync('python3',['-c',python],{encoding:'utf8'}));
assert.equal(snap.rowCount,267);
const clean=composeBlockSource(snap);
const originals=logicalTextRows(clean.source,clean.blocks);
// Reproduce the real reader ordering: the page-2 left-column CE Credits
// block is directly followed by the right-column drop-cap M<sup>uch...</sup>.
const credits=originals.find(r=>r.markdownText==='CE Credits: 1');
const dropCap=originals.find(r=>r.markdownText.startsWith('M<sup>uch</sup>'));
const following=originals.filter(r=>r.p===1&&['Bufet’s success','In our study'].some(t=>r.markdownText.startsWith(t)));
assert(credits&&dropCap&&following.length===2);
const chosen=[dropCap,...following];
const reordered=originals.filter(r=>!chosen.includes(r));
const pos=reordered.indexOf(credits)+1;
reordered.splice(pos,0,...chosen);
const prepared=composeLogicalSource(reordered.map((r,i)=>({...r,logicalOrder:i+1})));
const rows=logicalTextRows(prepared.source,prepared.blocks);
assert.equal(rows.length,267);
const ci=rows.findIndex(r=>r.logicalId===credits.logicalId);
assert.equal(rows[ci+1].logicalId,dropCap.logicalId);
const state=EditorState.create({doc:prepared.source});
function assertSafeEdit(id,offset,deleteCount,insert){
 const i=prepared.blocks.findIndex(r=>r.logicalId===id),block=prepared.blocks[i];
 const before=rows[i].markdownText;
 const from=block.from+offset,to=from+deleteCount;
 const tr=state.update({changes:{from,to,insert}});
 const plan=planOwnedTextEdit(prepared.source,prepared.blocks,tr.changes);
 assert(plan,`valid typed edit must be planned at logical ${id}`);
 assert.equal(plan.source,tr.newDoc.toString(),`text edit must not change synthetic LF at ${id}`);
 const after=logicalTextRows(plan.source,plan.blocks);
 assert.equal(after.length,267);
 for(let j=0;j<rows.length;j++)assert.equal(after[j].markdownText,j===i?
   before.slice(0,offset)+insert+before.slice(offset+deleteCount):rows[j].markdownText,
   `a single character edit of ${id} cannot change block ${after[j].logicalId}`);
}
// Content-end insertion was the earliest way to accidentally persist display
// LF via mapEditedBlocks groupEndPad=0. It now stays a SINGLE SQL text row.
assertSafeEdit(credits.logicalId,credits.markdownText.length,0,'!');
assertSafeEdit(dropCap.logicalId,0,0,'X');
assertSafeEdit(dropCap.logicalId,0,2,'Y');
assertSafeEdit(following[0].logicalId,following[0].markdownText.length,0,'!');
for(const row of rows){
 assertSafeEdit(row.logicalId,0,0,'Z');
 if(row.markdownText)assertSafeEdit(row.logicalId,row.markdownText.length,0,'Z');
}
const ce=prepared.blocks[ci],padFrom=ce.to-ce.groupEndPad;
for(const change of [
 {from:padFrom,to:padFrom+1,insert:''},
 {from:ce.to-1,to:ce.to,insert:''},
 {from:ce.to-1,to:ce.to+1,insert:''},
 {from:ce.to-1,to:ce.to-1,insert:'X'},
 {from:prepared.blocks[ci+1].from,to:prepared.blocks[ci+1].from,insert:'X\n'},
]){
 const tr=state.update({changes:change});
 assert.equal(planOwnedTextEdit(prepared.source,prepared.blocks,tr.changes),null,
   'CM6 must reject edits of virtual separators and multi-line input');
}
console.log('WP18_REAL_267_PREFIX_OWNERSHIP_PASS',rows.length,'blocks',
  'p1 CE→M boundary, all starts/ends, forbidden blank LF');
