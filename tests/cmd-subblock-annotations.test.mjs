import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planCMDSubblockAnnotations} from '../ui/cmd-text-blocks.js';
import {subblockAnchor} from '../ui/mineru-anchors.js';
import {toMarkdown,toMineruJSON} from '../packages/minerujson-md/dist/index.js';
const raw=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8');
const old=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8');
const plan=await planCMDSubblockAnnotations(old);
assert.equal(plan.inserted,43,'real Buffett MinerU fixture has 43 native nested blocks');
assert.equal(plan.edits.length,20,'real Buffett MinerU fixture has 20 parents with children');
const migrated=[...plan.edits].sort((a,b)=>b.from-a.from).reduce((src,e)=>
  src.slice(0,e.from)+e.insert+src.slice(e.to),old);
assert(migrated.includes('<!-- minerujson:subblock:v1:4:0:0 -->'));
assert(migrated.includes('<!-- minerujson:subblock:v1:4:0:1 -->'));
assert(migrated.includes('<!-- minerujson:subblock:v1:4:0:2 -->'));
// Insertions are the ONLY difference from the user-edited source.
const stripped=migrated.replace(/^>*(?: )?<!-- minerujson:subblock:v1:[^\n]+ -->\n/gm,'');
assert.equal(stripped,old,'marker insertion is byte-lossless for existing edits');
assert.equal(toMineruJSON(migrated),raw,'existing legacy fixture restores original JSON');
const rerun=await planCMDSubblockAnnotations(migrated);
assert.equal(rerun.edits.length,0,'annotation is idempotent');
assert.equal(rerun.existing,plan.inserted);
const wrong=migrated.replace('subblock:v1:4:0:2','subblock:v1:4:0:99');
await assert.rejects(planCMDSubblockAnnotations(wrong),/次序不符/);
assert.throws(()=>toMineruJSON(wrong),/INVALID/);
const generated=toMarkdown(raw);
const premarked=await planCMDSubblockAnnotations(generated);
assert.equal(premarked.edits.length,0,'new converter emits native child tree directly');
const parentHeader='<!-- minerujson:block:v1:4:0 -->';
assert(generated.indexOf('subblock:v1:4:0:0')>generated.indexOf(parentHeader));
assert.deepEqual(subblockAnchor('> <!-- minerujson:subblock:v1:4:0:2.1 -->'),
  {pageIndex:4,blockIndex:0,path:[2,1]});
console.log('CMD_SUBBLOCK_ANNOTATION_PASS',{parents:plan.edits.length,children:plan.inserted,
  originalBytes:old.length,migratedBytes:migrated.length,redo:0});
