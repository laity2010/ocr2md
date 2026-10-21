import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildOutline} from '../../ui/outline-index.js';
import {chapterAssignments,buildChapterFiles} from './chapters.js';
import {encodeMarker} from './metadata.js';

const fixture=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8');
const source=fixture.indexOf('<!-- minerujson:source:v1:');
assert(source>0);
const body=fixture.slice(0,source);
const rows=buildOutline(fixture);
assert.equal(rows.length,21);
const base=buildChapterFiles(fixture,rows);
assert.equal(base.length,21);
assert.equal(base[0].firstId,rows[0].id);
assert.match(base[0].content,/## Bufett’s Alpha/);
assert(!base.some(x=>x.content.includes('minerujson:source:v1:')));
assert.deepEqual(base.map(x=>x.name),chapterAssignments(rows).map(x=>x.file));
const reconstructed=base.map(x=>x.content).join('');
assert.equal(reconstructed,body,'Chapter parts must preserve every source byte except raw JSON tail');
const initialNames=new Set(base.map(x=>x.name));assert.equal(initialNames.size,21);

// Merge adjacent headings without altering heading level or element anchors.
rows[1].independent=false;
rows[2].independent=false;
rows[5].independent=false;
const merged=buildChapterFiles(fixture,rows);
assert.equal(merged.length,18);
assert.equal(rows[0].chapterFile,rows[1].chapterFile);
assert.equal(rows[1].chapterFile,rows[2].chapterFile);
assert.notEqual(rows[3].chapterFile,rows[2].chapterFile);
assert.equal(merged.map(x=>x.content).join(''),body);
for(const x of merged){
  assert(x.content.startsWith('<!-- minerujson:block:v1:'));
  assert(/<!--[\s\S]*minerujson:end:v1:/.test(x.content));
}

// A real CM6 marker added immediately before its title must be omitted only
// from the export projection. Its block anchor and Markdown heading survive.
const marker=encodeMarker(rows[5].id,false,'comment');
const lines=fixture.split('\n');
lines.splice(rows[5].sourceLine-1,0,marker);
const annotated=lines.join('\n');
const markedRows=buildOutline(annotated);
markedRows[1].independent=false;
markedRows[2].independent=false;
markedRows[5].independent=false;
const markedParts=buildChapterFiles(annotated,markedRows);
assert(!markedParts.some(x=>x.content.includes(marker)));
assert.equal(markedParts.map(x=>x.content).join(''),body);

// Two independent headings in a single MinerU block cannot be safely split.
const badText=fixture.replace('## Bufett’s Alpha\n','## Bufett’s Alpha\n\n### Invented Heading\n');
const badRows=buildOutline(badText);
const synthetic=badRows.find(x=>x.id.startsWith('mineru:0:0:1'));
assert(synthetic);
assert.throws(()=>buildChapterFiles(badText,badRows),/证据块|无损切分|块锚点/);
console.log('CM_HTML_CHAPTER_PROJECTION_PASS',JSON.stringify({headings:rows.length,normal:base.length,merged:merged.length,sourceBytes:body.length,renderedBytes:reconstructed.length}));
