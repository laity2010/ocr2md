import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {composeBlockSource,composeOwnedSource,logicalTextRows} from '../ui/v2-block-source.js';
import {EditorState} from '@codemirror/state';
const py=String.raw`
import json,tempfile,sys
from pathlib import Path
sys.path.insert(0,'tests')
from test_v2_owned_lf import make_book,load,preview_owned_migration,to_markdown
with tempfile.TemporaryDirectory(prefix='wp23d-js-') as root:
 folder=Path(root);make_book(folder);rows=load(folder)
 print(json.dumps(dict(old=to_markdown(rows),plan=preview_owned_migration(rows)),ensure_ascii=False))
`;
export const fixture=JSON.parse(execFileSync('python3',['-c',py],{encoding:'utf8'}));
const old=composeBlockSource(fixture.old);
const snapshot=fixture.plan.snapshot;
const real=composeBlockSource(snapshot);
assert.equal(real.source,old.source,'migration must preserve exact legacy visible source');
assert.equal(real.source,snapshot.markdown);
assert.equal(real.blocks.length,267);
assert.deepEqual(logicalTextRows(real.source,real.blocks),real.blocks.map(({from,to,...r})=>r));
let end=0;
const state=EditorState.create({doc:real.source});
assert.equal(state.doc.toString(),real.source,'CM6 must not normalize or drop any LF');
for(const row of real.blocks){
 assert.equal(row.from,end);
 assert(row.to>row.from,'even empty OCR blocks own LF');
 assert.equal(row.markdownText,state.doc.sliceString(row.from,row.to));
 assert(!Object.hasOwn(row,'groupEndPad'));
 end=row.to;
}
assert.equal(end,state.doc.length);
assert.deepEqual(composeOwnedSource(logicalTextRows(real.source,real.blocks)),real);
const damaged=structuredClone(snapshot);damaged.segments[1].startUtf16++;
assert.throws(()=>composeBlockSource(damaged));
const invalid=logicalTextRows(real.source,real.blocks);invalid.at(-1).markdownText='missing LF';
assert.throws(()=>composeOwnedSource(invalid));
console.log('WP23D_OWNED_LF_CM6_PASS',real.blocks.length,end,state.doc.lines,'lines');
