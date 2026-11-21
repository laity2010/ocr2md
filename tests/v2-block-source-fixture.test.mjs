/** Real WP03 SQL/Markdown data consumed by WP04's exact UTF-16 composer. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {composeBlockSource,BLOCK_END,logicalTextRows} from '../ui/v2-block-source.js';
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
assert.equal(full.rowCount,224);
const {source,blocks}=composeBlockSource(full);
assert.equal(blocks.length,224);
assert(source.endsWith(BLOCK_END));
const edits=logicalTextRows(source,blocks);
assert.equal(edits.length,224);
for(let i=0;i<blocks.length;i++){
 const block=blocks[i];
 assert.equal(block.logicalId,full.segments[i].logicalId);
 assert.equal(block.blockType,full.segments[i].blockType);
 assert.equal(source.slice(block.to,block.to+BLOCK_END.length),BLOCK_END);
 assert.equal(edits[i].markdownText,full.markdown.slice(
   full.segments[i].startUtf16,full.segments[i].endUtf16));
}
assert.equal(full.markdown,before,'no backend mutation');
assert.equal(blocks.filter(block=>block.from===block.to).length>0,true,'real fixture contains OCR empty blocks');
console.log('WP04_REAL_MINERU_224_BLOCK_SOURCE_PASS',blocks.length,source.length,'UTF16 characters',
 blocks.filter(block=>block.from===block.to).length,'empty logical blocks');
