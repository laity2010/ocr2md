/** Fenced Markdown insertion is one pure, guarded CMD edit plan. */
import assert from 'node:assert/strict';
import {planFencedBlock} from '../ui/source-fence-plan.js';
function check(original,from,to,expected,expectedCursorText=''){
  const plan=planFencedBlock(original,from,to);
  const actual=original.slice(0,plan.from)+plan.insert+original.slice(plan.to);
  assert.equal(actual,expected);
  assert.equal(plan.expected,original.slice(plan.from,plan.to));
  assert.equal(actual.slice(0,plan.from),original.slice(0,plan.from));
  assert.equal(actual.slice(plan.from+plan.insert.length),original.slice(plan.to));
  assert(plan.cursorAfter>=plan.from&&plan.cursorAfter<=plan.from+plan.insert.length);
  assert(actual.slice(plan.cursorAfter).startsWith(expectedCursorText));
  return plan;
}
check('',0,0,'```\n\n```\n','\n```');
check('alpha',2,2,'al\n\n```\n\n```\n\npha','\n```');
check('alpha\n\n',7,7,'alpha\n\n```\n\n```\n','\n```');
check('one\ntwo\nthree',4,7,'one\n\n```\ntwo\n```\n\nthree','two');
check('one\ntwo\nthree',4,8,'one\n\n```\ntwo\n```\n\nthree','two');
check('aa\nalpha\nbeta\nomega',4,11,'aa\n\n```\nalpha\nbeta\n```\n\nomega','alpha');
check('\nalpha\n',1,6,'\n\n```\nalpha\n```\n\n','alpha');
const protectedFence='before\n```js\nconsole.log(2)\n```\nafter';
check(protectedFence,7,31,'before\n\n````\n```js\nconsole.log(2)\n```\n````\n\nafter','```js');
const more='```\n``````\n```';
const escaped=check(more,0,more.length,'```````\n'+more+'\n```````\n',more);
assert(escaped.insert.startsWith('```````'));
assert.equal(planFencedBlock('',0,0,'python').insert,'```python\n\n```\n');
assert.equal(planFencedBlock('x\nprint(1)\ny',2,10,'  PYTHON ').insert,
  '\n```python\nprint(1)\n```\n');
assert.equal(planFencedBlock('x',1,1,'JSON').insert,'\n\n```json\n\n```\n');
for(const invalid of ['bad lang','<svg>','py`','x'.repeat(33),'py\ncode'])
  assert.throws(()=>planFencedBlock('hello',0,0,invalid),/语言/);

for(const args of [['hi',-1,0],['hi',0,3],['hi',1,0],['hi',1.5,2],['hi',1,'2']])
  assert.throws(()=>planFencedBlock(...args),/选区/);
console.log('SOURCE_FENCE_PLAN_PASS 12 and language validation');
