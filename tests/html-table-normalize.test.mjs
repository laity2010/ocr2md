/** Pure deterministic planner; never connects to the real saved user document. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scanHtmlElements} from '../ui/cmd-html-elements.js';
import {groupHtmlElements} from '../ui/html-element-groups.js';
import {planNormalizeTables,TABLE_TITLE_PLACEHOLDER,TABLE_NOTES_PLACEHOLDER} from '../ui/html-table-normalize.js';
const group=source=>{
  const lines=[0];for(let i=0;i<source.length;i++)if(source[i]==='\n')lines.push(i+1);
  const line=pos=>{let lo=0,hi=lines.length;while(lo<hi){const mid=(lo+hi)>>1;
    if(lines[mid]<=pos)lo=mid+1;else hi=mid;}return lo;};
  return groupHtmlElements(scanHtmlElements(source).map(row=>({...row,line:line(row.from)})));
};
const apply=(source,plan)=>{
  let result=source;
  for(const op of [...plan.operations].sort((a,b)=>b.from-a.from)){
    assert.equal(op.action,'text');assert.equal(op.expected,'');
    result=result.slice(0,op.from)+op.insert+result.slice(op.to);
  }
  return result;
};
const original=[
  '<!-- minerujson:block:v1:0:0 -->','# Chapter','','Table 1. Disconnected title','',
  '<table><tr><td>data &amp; source</td></tr></table>','',
  'Notes: disconnected original annotation.','',
  '<table>','<tr><td>multiline data</td></tr>','</table>','',
  '<figure class="table-block">','<figcaption>Existing verified title</figcaption>',
  '<table><tr><td>already wrapped</td></tr></table>',
  '<div class="table-notes">Original notes</div>','</figure>','',
  '> <table><tr><td>quoted content</td></tr></table>','',
  '<!-- minerujson:source:v1','<table><tr><td>immutable evidence</td></tr></table>','-->',''
].join('\n');
const evidence=original.indexOf('<!-- minerujson:source:v1');
const plan=planNormalizeTables(original,group(original),{bodyEnd:evidence});
assert.equal(plan.converted,2);assert.equal(plan.skipped,2);
const after=apply(original,plan);
assert.equal((after.match(/<figure class="table-block">/g)||[]).length,3);
assert.equal((after.match(/<figcaption>/g)||[]).length,3);
assert.equal((after.match(/<div class="table-notes">/g)||[]).length,3);
assert.equal((after.match(/【待填写：表格标题】/g)||[]).length,2);
assert.equal((after.match(/【待填写：表格注释及来源】/g)||[]).length,2);
assert(after.includes('Table 1. Disconnected title'));
assert(after.includes('Notes: disconnected original annotation.'));
assert.equal(after.slice(after.indexOf('<!-- minerujson:source:v1')),original.slice(evidence));
for(const row of group(original).filter(x=>x.tag==='table'&&x.status==='完整'))
  assert(after.includes(original.slice(row.from,row.to)),'table bytes changed');
const second=planNormalizeTables(after,group(after),{bodyEnd:after.indexOf('<!-- minerujson:source:v1')});
assert.equal(second.converted,0,'repeat conversion should be a no-op');
assert.equal(second.operations.length,0);
const fixture=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8');
const realRows=group(fixture),realPlan=planNormalizeTables(fixture,realRows,{bodyEnd:fixture.indexOf('<!-- minerujson:source:v1')});
assert.equal(realRows.filter(x=>x.tag==='table').length,8);
assert.equal(realPlan.converted,8);
assert.equal(realPlan.skipped,0);
const converted=apply(fixture,realPlan);
assert.equal((converted.match(/<figure class="table-block">/g)||[]).length,8);
assert.equal(planNormalizeTables(converted,group(converted),{bodyEnd:converted.indexOf('<!-- minerujson:source:v1')}).converted,0);
assert.equal(converted.slice(converted.indexOf('<!-- minerujson:source:v1')),fixture.slice(fixture.indexOf('<!-- minerujson:source:v1')));
const cs=group(fixture).filter(x=>x.tag==='table');
const chapter={from:cs[0].from-100,to:cs[0].to+2};
const scoped=planNormalizeTables(fixture,realRows,{scope:{mode:'chapter'},chapter,bodyEnd:fixture.length});
assert.equal(scoped.converted,1);
assert.throws(()=>planNormalizeTables(fixture,realRows,{scope:{mode:'chapter'}}),/Missing CMD chapter scope/);
console.log('HTML_TABLE_NORMALIZE_PASS',JSON.stringify({fixtureTables:realPlan.converted,fixtureBytesPreserved:true,idempotent:true,scoped:true,immutableEvidence:true}));
