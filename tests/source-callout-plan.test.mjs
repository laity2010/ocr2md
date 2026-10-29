import assert from 'node:assert/strict';
import {planCalloutAtCursor} from '../ui/source-callout-plan.js';
function test(doc,at,mode,expected){
 const plan=planCalloutAtCursor(doc,at,mode),result=doc.slice(0,at)+plan.insert+doc.slice(at);
 assert.equal(result,expected,'planned markdown differs');
 assert.equal(plan.from,at);assert.equal(plan.to,at);assert.equal(plan.expected,'');
 assert.equal(result.slice(plan.cursorAfter,plan.cursorAfter+2),'内容','caret not moved inside inserted block');
 // old document content is an exact prefix/suffix, including text after caret.
 assert.equal(result.slice(0,at),doc.slice(0,at));
 assert.equal(result.slice(at+plan.insert.length),doc.slice(at));
 return plan;
}
const rows=[
 ['','', 'collapsed','> [!note]- 标题\n> 内容\n'],
 ['hello',5,'collapsed','hello\n\n> [!note]- 标题\n> 内容\n'],
 ['hello world',5,'expanded','hello\n\n> [!note]+ 标题\n> 内容\n\n world'],
 ['one\ntwo',4,'fixed','one\n\n> [!note] 标题\n> 内容\n\ntwo'],
 ['line\n\n',6,'collapsed','line\n\n> [!note]- 标题\n> 内容\n'],
 ['line\nnext',5,'collapsed','line\n\n> [!note]- 标题\n> 内容\n\nnext'],
 ['line\n\nnext',5,'collapsed','line\n\n> [!note]- 标题\n> 内容\n\nnext'],
];
for(const [doc,at,mode,expected] of rows)test(doc,at===''?0:at,mode,expected);
assert.throws(()=>planCalloutAtCursor('hi',-1),/光标/);
assert.throws(()=>planCalloutAtCursor('hi',3),/光标/);
assert.throws(()=>planCalloutAtCursor('hi',1,'unknown'),/类型/);
assert.equal(planCalloutAtCursor('hello',5).insert.includes('[!note]-'),true);
console.log('SOURCE_CALLOUT_PLAN_PASS',rows.length);
