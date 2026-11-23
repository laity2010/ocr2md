/** Real WP03 SQL/Markdown data consumed by WP04's exact UTF-16 composer. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {composeBlockSource,composeLogicalSource,BLOCK_END,logicalTextRows} from '../ui/v2-block-source.js';
const py=String.raw`
import json,tempfile,shutil,sys
from pathlib import Path
sys.path.insert(0,'scripts')
import v2_mineru_base as v
fix=Path('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json')
with tempfile.TemporaryDirectory(prefix='wp04-fixture-') as root:
 folder=Path(root);(folder/'minerujson').mkdir()
 shutil.copyfile(fix,folder/'minerujson'/fix.name)
 v.new_book(folder)
 print(json.dumps(v.existing_markdown(folder),ensure_ascii=False))
`;
const full=JSON.parse(execFileSync('python3',['-c',py],{encoding:'utf8'}));
const before=full.markdown;
assert.equal(full.rowCount,267);
const {source,blocks}=composeBlockSource(full);
assert.equal(blocks.length,267);
assert(source.endsWith(BLOCK_END));
const edits=logicalTextRows(source,blocks);
assert.equal(edits.length,267);
for(let i=0;i<blocks.length;i++){
 const block=blocks[i];
 assert.equal(block.logicalId,full.segments[i].logicalId);
 assert.equal(block.blockType,full.segments[i].blockType);
 const raw=full.markdown.slice(full.segments[i].startUtf16,full.segments[i].endUtf16);
 const next=blocks[i+1];
 const groupEnd=!next||block.p!==next.p||block.b!==next.b;
 const expected=groupEnd?(raw.endsWith('\n\n')?0:raw.endsWith('\n')?1:2):
   (raw.endsWith('\n')?0:1);
 assert.equal(block.groupEndPad,expected,
   'in-group requires one visible LF; group end has one blank line');
 if(groupEnd)assert.equal(source.slice(block.to-BLOCK_END.length,block.to),BLOCK_END);
 if(i<blocks.length-1)assert.equal(block.to,blocks[i+1].from,
   'block boundaries use offsets, NOT injected separators');
 assert.equal(edits[i].markdownText,full.markdown.slice(
   full.segments[i].startUtf16,full.segments[i].endUtf16));
}
assert.equal(full.markdown,before,'no backend mutation');
const originalEmpty=edits.filter(block=>block.markdownText==='');
assert(originalEmpty.length>0,'real fixture contains OCR empty SQL text');
assert(blocks.every((block,i)=>block.to-block.from>=
  (edits[i].markdownText?.length||0)),
  'empty SQL blocks still own their CM6 group-end display blanks');
// Real blocks p0b0/s0 and p0b1/s0 can be reparented in memory. Their SQL
// content remains byte-for-byte equal, but the old virtual end blank goes
// away and only the last child owns the new empty line.
const joined=edits.map((row,i)=>i===1
  ?{...row,p:edits[0].p,b:edits[0].b,s:1,parentId:edits[0].logicalId}:row);
const next=composeLogicalSource(joined);
const firstChildPad=edits[0].markdownText.endsWith('\n')?0:1;
assert.equal(next.blocks[0].groupEndPad,firstChildPad);
assert.equal(next.blocks[1].groupEndPad,2);
assert.equal(next.source.length,source.length-2+firstChildPad);
assert.deepEqual(logicalTextRows(next.source,next.blocks).map(r=>r.markdownText),
  edits.map(r=>r.markdownText),'no PDF/SQL text altered by child regrouping');
assert(edits.some(row=>row.blockType==='table_caption'));
assert(edits.some(row=>row.blockType==='table_footnote'));
console.log('WP09_REAL_MINERU_267_BLOCK_SOURCE_PASS',blocks.length,source.length,'UTF16 characters',
 originalEmpty.length,'empty SQL logical blocks');
