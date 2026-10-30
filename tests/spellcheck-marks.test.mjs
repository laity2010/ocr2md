import assert from 'node:assert/strict';
import MarkdownIt from 'markdown-it';
import {formatAnnotation,scanAnnotations} from '../ui/cmd-annotations.js';
import {SPELL_TAG,planSpellcheckMarks,readSpellcheckMarks} from '../ui/spellcheck-marks.js';
const source=[
  '# The beautifull story','',
  'This is a **recieve** issue and a [paragraf](https://example.com).','',
  '```python','wrogn in code','```',
  '<!-- minerujson:source:v1','{"wrogn":"evidence"}','-->',
].join('\n');
const words=['beautifull','recieve','paragraf'];
const rows=words.map(word=>({word,from:source.indexOf(word),suggestions:['correct']}));
const operations=planSpellcheckMarks(source,rows,[]);
assert.equal(operations.length,3);
const marked=operations.sort((a,b)=>b.at-a.at).reduce((text,op)=>
  text.slice(0,op.at)+formatAnnotation(op.tag,op.attributes)+text.slice(op.at),source);
const comments=scanAnnotations(marked).filter(x=>x.tag===SPELL_TAG);
assert.equal(comments.length,3);
assert.deepEqual(readSpellcheckMarks(marked,comments).rows.map(x=>x.word),words);
assert.equal(planSpellcheckMarks(marked,readSpellcheckMarks(marked,comments).rows,comments).length,0);
const md=new MarkdownIt({html:true});
const removeComments=html=>html.replace(/<!--ocr2md:spellcheck[^\n]*?-->/g,'');
assert.equal(removeComments(md.render(marked)),md.render(source),'Markdown structure changed');
const stale=marked.replace('recieve','receive');
assert.equal(readSpellcheckMarks(stale,scanAnnotations(stale)).stale,1);
assert.equal(SPELL_TAG,'ocr2md:spellcheck');
console.log('SPELLCHECK_MARKS_PASS atomic planner/roundtrip/markdown/stale/duplicate');
