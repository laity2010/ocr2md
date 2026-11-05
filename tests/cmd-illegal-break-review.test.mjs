/** Review choices must be durable in the ONE CMD source without joining text;
 * ordinary scan must keep every A/B candidate even after inserted comments.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import nspell from 'nspell';
import {toMarkdown} from '../packages/minerujson-md/dist/index.js';
import {planCMDReparentPBS,readCMDBlockChains} from '../ui/cmd-block-chains.js';
import {buildIllegalBreakLatexSequence} from './fixtures/illegal-break-latex-sequence.mjs';
import {formatAnnotation,scanAnnotations} from '../ui/cmd-annotations.js';
import {detectIllegalBreaks,planIllegalBreakMarks} from '../ui/cmd-linebreak.js';
import {ILLEGAL_BREAK_REVIEW_TAG,keyIllegalBreakReviewRows,
  readIllegalBreakReviewDecisions,planIllegalBreakReviewDecision} from '../ui/cmd-illegal-break-review.js';
const spell=nspell(readFileSync('node_modules/dictionary-en/index.aff'),
  readFileSync('node_modules/dictionary-en/index.dic'));
const original=toMarkdown(readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8'));
const reparent=planCMDReparentPBS(original,'p6b7','p6b6');
let source=[...reparent.edits].sort((a,b)=>b.from-a.from).reduce((s,e)=>s.slice(0,e.from)+e.insert+s.slice(e.to),original);
const immutable=s=>s.slice(s.indexOf('<!-- minerujson:source:v1:'));
const evidence=immutable(source);
const reviewRows=s=>keyIllegalBreakReviewRows(detectIllegalBreaks(s,spell,
  {bodyEnd:s.indexOf('<!-- minerujson:source:v1:')}).issues);
const find=(s,joined)=>reviewRows(s).find(r=>r.joined===joined&&r.blockId.startsWith('p6b6'));
const saved=s=>readIllegalBreakReviewDecisions(s,scanAnnotations(s).filter(x=>x.tag===ILLEGAL_BREAK_REVIEW_TAG));
function apply(s,ops){return [...ops].sort((a,b)=>(b.at??b.target.from)-(a.at??a.target.from)).reduce((text,op)=>{
  if(op.action==='insert')return text.slice(0,op.at)+formatAnnotation(op.tag,op.attributes)+op.suffix+text.slice(op.at);
  if(op.action==='update')return text.slice(0,op.target.from)+formatAnnotation(op.tag,op.attributes)+text.slice(op.target.to);
  if(op.action==='remove')return text.slice(0,op.target.from)+text.slice(op.target.to+(op.removeAfter?1:0));
  throw Error('Unexpected operation');
},s);}
const beginning=source;
for(const [choice,expected] of [['断行合并','断行合并'],['忽略','忽略'],['待定',undefined]]){
  const row=find(source,'about 3');
  assert(row,'about / 3 seam must be visible');
  const ops=planIllegalBreakReviewDecision(source,row,choice,
    scanAnnotations(source).filter(x=>x.tag===ILLEGAL_BREAK_REVIEW_TAG));
  assert.equal(ops.length,1);
  source=apply(source,ops);
  assert.equal(saved(source).decisions.get(row.reviewKey)?.decision,expected);
  assert.equal(immutable(source),evidence,'sealed OCR evidence untouched');
  assert.deepEqual(readCMDBlockChains(source).invalid,[]);
  assert.deepEqual(reviewRows(source).filter(x=>x.blockId==='p6b6s0')
    .map(x=>[x.beforeBlockId,x.afterBlockId,x.joined]),
    [['p6b6s0','p6b6s1','about 3']],'review annotations must not suppress the original seam');
  assert.equal(planIllegalBreakReviewDecision(source,find(source,'about 3'),
    expected||'待定',scanAnnotations(source)).length,0,'setting same value is no-op');
}
assert.equal(source,beginning,'pending restores the exact original CMD text');
// Distinct same-child OCR scars must be independent even though they share
// one PBS source block and physical PDF bbox.
const lever=find(source,'leverage'),insurance=find(source,'insurance');
assert(lever&&insurance&&lever.reviewKey!==insurance.reviewKey);
source=apply(source,planIllegalBreakReviewDecision(source,lever,'断行合并',scanAnnotations(source)));
source=apply(source,planIllegalBreakReviewDecision(source,find(source,'insurance'),'忽略',scanAnnotations(source)));
assert.equal(saved(source).decisions.size,2);
assert.equal(saved(source).decisions.get(lever.reviewKey)?.decision,'断行合并');
assert.equal(saved(source).decisions.get(insurance.reviewKey)?.decision,'忽略');
assert.equal(planIllegalBreakMarks(source,reviewRows(source).filter(x=>x.reviewOnly),[]).length,0);
// The same standalone LaTeX B participates independently in A→B and B→C.
let mathSource=buildIllegalBreakLatexSequence();
const mathRows=()=>keyIllegalBreakReviewRows(detectIllegalBreaks(mathSource,spell,
  {bodyEnd:mathSource.indexOf('<!-- minerujson:source:v1:')}).issues)
  .filter(x=>x.reviewKind==='latex-boundary'&&x.blockId?.startsWith('p4b0s'));
assert.deepEqual(mathRows().map(x=>[x.beforeBlockId,x.afterBlockId]),[
  ['p4b0s0','p4b0s1'],['p4b0s1','p4b0s2']]);
mathSource=apply(mathSource,planIllegalBreakReviewDecision(mathSource,mathRows()[0],
  '断行合并',scanAnnotations(mathSource)));
mathSource=apply(mathSource,planIllegalBreakReviewDecision(mathSource,mathRows()[1],
  '忽略',scanAnnotations(mathSource)));
assert.deepEqual(mathRows().map(x=>saved(mathSource).decisions.get(x.reviewKey)?.decision),
  ['断行合并','忽略'],'Formula edges must remain independent after source annotations');
console.log('CMD_LATEX_TWO_REVIEW_CHOICES_PASS A→formula merge, formula→C ignore independently');
console.log('CMD_ILLEGAL_BREAK_REVIEW_PASS merge/ignore/pending, independent scars, no join, no change sealed OCR');
