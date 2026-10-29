/** HTML module: source syntax is authoritative, not rendered DOM or regex over code. */
import assert from 'node:assert/strict';
import {scanHtmlElements} from '../ui/cmd-html-elements.js';
const source=[
  '# One','','ordinary <sup title="a > b">1</sup> and `literal <em>no</em>`','',
  '<!--ocr2md:note-ref id="1"-->','','<!-- general prose -->','',
  '<table>','<tr><td>first</td><td>second</td></tr>','</table>','',
  '```html','<div>code not HTML</div>','```','',
  '<!-- minerujson:source:v1','<img> not an actual element here','-->',''
].join('\n');
const rows=scanHtmlElements(source);
assert.deepEqual(rows.map(x=>[x.tag,x.kind]),[
  ['sup','开始标签'],['sup','结束标签'],
  ['<!-- -->','注释'],['<!-- -->','注释'],
  ['table','开始标签'],['tr','开始标签'],['td','开始标签'],
  ['td','结束标签'],['td','开始标签'],['td','结束标签'],
  ['tr','结束标签'],['table','结束标签'],['<!-- -->','注释']
]);
assert(rows.every(row=>source.slice(row.from,row.to).startsWith('<')));
assert(!rows.some(row=>row.tag==='em'||row.tag==='div'||row.tag==='img'));
assert(rows.find(row=>row.tag==='sup').raw.includes('a > b'));
assert.deepEqual(scanHtmlElements(source),rows,'read only deterministic');
console.log('HTML_SCAN_PASS',rows.length);
