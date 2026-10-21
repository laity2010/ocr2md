import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildOutline} from '../ui/outline-index.js';
import {chapterAssignments,buildChapterFiles} from '../ui/chapter-files.js';
const source=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8');
const rows=buildOutline(source);rows.forEach(row=>row.independent=true);
const baseline=buildChapterFiles(source,rows,0);
assert.equal(baseline.length,21);
assert(baseline[0].name.startsWith('000-'));
assert(baseline.at(-1).name.startsWith('020-'));
const custom=buildChapterFiles(source,rows,25);
assert(custom[0].name.startsWith('025-'));
assert(custom.at(-1).name.startsWith('045-'));
assert.deepEqual(baseline.map(x=>x.content),custom.map(x=>x.content),
  'Numbering must only affect names, not Markdown content');
rows[1].independent=false;
const merged=chapterAssignments(rows,25);
assert.equal(merged.length,20);
assert.equal(rows[1].chapterFile,rows[0].chapterFile);
assert(rows[2].chapterFile.startsWith('026-'));
const files=buildChapterFiles(source,rows,25);
assert.equal(files.length,20);
assert(files.at(-1).name.startsWith('044-'));
for(const bad of [-1,0.5,100000,'5',NaN]){
  assert.throws(()=>chapterAssignments(rows,bad),/Invalid starting/);
}
const max=buildChapterFiles(source,rows,99999);
assert(max.at(-1).name.startsWith('100018-'));
console.log('V6_CHAPTER_NUMBERING_PASS',JSON.stringify({default:baseline[0].name,custom:custom[0].name,merged:files.length,last:max.at(-1).name}));
