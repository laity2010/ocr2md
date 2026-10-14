import * as assert from 'node:assert/strict';
import {normalizeMineruChapter} from './normalizeMineruChapter';
const source=[
  '# Human-cleaned heading',
  'Custom prose **kept verbatim** and $x^2$ inline.',
  '<!-- ocr2md-ir:block=blk_111111111111111111111111 -->',
  '```math',
  String.raw`L=\frac{A}{B}`,
  '```',
  '',
  '```html',
  '<table><tr><td rowspan="2">Cell</td><td><eq>\\frac{C}{D}</eq></td></tr></table>',
  '```',
  '~~~html',
  '<table><tr><td><img src="https://evil.test/track.png"></td></tr></table>',
  '~~~',
  '```js',
  'const html = `<table><tr><td>code</td></tr></table>`;',
  '```',
  '![photo](imgs/photo.png)',
  'User annotation: keep this passage and [source](https://example.org).',
].join('\n');
const changed=normalizeMineruChapter(source);
assert.equal(changed.math,1);
assert.equal(changed.tables,1);
assert.equal(changed.pendingEquations,1);
assert.equal(changed.unresolvedTables,1);
assert.equal(changed.changed,true);
assert.equal(changed.text.split('\n').length,source.split('\n').length);
assert.ok(changed.text.includes('$$\nL=\\frac{A}{B}\n$$'));
assert.ok(changed.text.includes('<table><tr><td rowspan="2">Cell</td>'));
assert.ok(changed.text.includes('ocr2md-latex-pending'));
assert.ok(changed.text.includes('```js\nconst html'));
assert.ok(changed.text.includes('~~~html\n<table><tr><td><img'));
assert.ok(changed.text.includes('![photo](imgs/photo.png)'));
assert.ok(changed.text.includes('Human-cleaned heading'));
assert.ok(changed.text.includes('User annotation: keep this passage'));
assert.equal(normalizeMineruChapter(changed.text).changed,false);
assert.deepEqual(normalizeMineruChapter(changed.text).text,changed.text);
assert.deepEqual(normalizeMineruChapter('Nothing to convert.'),{
  text:'Nothing to convert.',math:0,tables:0,unresolvedTables:0,pendingEquations:0,changed:false,
});
console.log('OBSIDIAN_EXISTING_CHAPTER_CONVERSION_PURE_PASS',JSON.stringify({
  math:changed.math,tables:changed.tables,unresolved:changed.unresolvedTables,
  eqKept:changed.pendingEquations,preservesLines:true,idempotent:true,
}));
