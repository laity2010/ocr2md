import assert from 'node:assert/strict';
import nspell from 'nspell';
import {readFileSync} from 'node:fs';
import {spellcheckIssues,spellcheckTokens} from '../ui/spellcheck-scan.js';
const spell=nspell(readFileSync('node_modules/dictionary-en/index.aff'),
  readFileSync('node_modules/dictionary-en/index.dic'));
const raw=[
  '# Chapter One',
  'This is a beautifull book. I recieve many letters.',
  '`mistakke` $wrrng$ <sup>1</sup>',
  '```python',
  'badspeling inside fenced code',
  '```',
  '<!-- minerujson:source:v1',
  '{"badspeling":"on"}',
  '-->',
  '![media](https://cdn.example.org/wrrng.png)',
  '# Chapter Two',
  'Another paragraf contains errors.',
].join('\n');
const result=spellcheckIssues(raw,spell);
assert.deepEqual(result.issues.map(x=>x.word),['beautifull','recieve','paragraf']);
for(const row of result.issues){
  assert.equal(raw.slice(row.from,row.to),row.word,'offset should remain exact');
  assert.equal(raw.slice(0,row.from).split('\n').length,row.word==='paragraf'?12:2);
}
assert(result.issues[0].suggestions.includes('beautiful'));
assert(result.issues[1].suggestions.includes('receive'));
assert.equal(result.truncated,false);
assert.equal(spellcheckIssues(raw,spell,{maxIssues:2}).truncated,true);
assert.equal(spellcheckTokens('```\nzzwrong\n```').length,0);
console.log('SPELLCHECK_PURE_PASS dictionary/ranges/Markdown masking/truncation');
