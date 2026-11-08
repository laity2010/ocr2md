import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {EditorState} from '@codemirror/state';
import {nonSentenceFolds} from '../ui/sentence-benchmark-source-folding.js';
import {split,rebuild} from '../ui/sentence-benchmark-core.js';

function foldedRanges(md){
  const state=EditorState.create({doc:md});
  const projection={ranges:[{sourceFrom:0,sourceTo:md.length,
    viewFrom:0,viewTo:md.length}]};
  return {doc:state.doc,ranges:nonSentenceFolds({state},md,projection)};
}
function visible(doc,ranges,lineNumber){
  const line=doc.line(lineNumber);
  return !ranges.some(r=>r.from<=line.from&&r.to>=line.to);
}
test('all 19 genuine headings of the reviewed CMD remain visible in source mode',()=>{
  const md=readFileSync('labs/sentence-benchmark/.runtime/document.md','utf8');
  const {doc,ranges}=foldedRanges(md);
  const titles=[];
  for(let n=1;n<=doc.lines;n++){
    const row=doc.line(n);
    if(/^#{1,6}(?:[ \t]|$)/u.test(row.text)){
      titles.push({n,title:row.text});
      assert(visible(doc,ranges,n),
        'title must be visible instead of folded: '+n+' '+row.text);
    }
  }
  assert.equal(titles.length,19,'regression covers all current reviewed CMD titles');
  assert(ranges.length>0,'non-sentence structures should still be folded');
  assert(titles.some(x=>x.title==='# References'));
  for(const engine of ['intl','sentence-splitter','wink-nlp']){
    const result=split(md,engine);
    assert.equal(rebuild(result),md,'source remains 100% lossless');
    assert(!result.sentences.some(s=>s.text==='# References'),
      'titles remain excluded from NLP sentences');
  }
});
test('ATX h1-h6 and Setext titles stay visible while media and code stay folded',()=>{
  const md=[
    '<!-- cmd:block:v1 id="p0b0" -->',
    '# Main Title',
    '',
    '<!-- cmd:block:v1 id="p0b1" -->',
    'Regular sentence. Another sentence.',
    '<!-- cmd:block:v1 id="p0b2" -->',
    '## Section Title',
    '',
    '<!-- cmd:block:v1 id="p0b3" -->',
    'Appendix title',
    '==============',
    '',
    '<!-- cmd:block:v1 id="p0b4" -->',
    '### Closing Heading',
    '',
    '<!-- cmd:block:v1 id="p0b5" -->',
    '![image](media/figure.png)',
    '',
    '<!-- cmd:block:v1 id="p0b6" -->',
    '<table><tr><td>Excluded structural table</td></tr></table>'
  ].join('\n');
  const {doc,ranges}=foldedRanges(md);
  for(let n=1;n<=doc.lines;n++){
    const line=doc.line(n).text;
    if(/^(?:#{1,6}[ \t]|Appendix title$|=+$)/.test(line))
      assert(visible(doc,ranges,n),'heading should not be folded: '+line);
  }
  const imageLine=md.split('\n').findIndex(x=>x.startsWith('![image]'))+1;
  assert(!visible(doc,ranges,imageLine),'structural media still folds');
});
