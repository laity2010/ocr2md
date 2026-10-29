import assert from 'node:assert/strict';
import {scanHtmlElements} from '../ui/cmd-html-elements.js';
import {groupHtmlElements} from '../ui/html-element-groups.js';
const source=[
  '# Chapter','','A <sup title="a > b">1</sup> and <br> text.','',
  '<!--ocr2md:note-ref id="1"-->','','<img src="x"/>','',
  '<div class="outer">','<div class="inner">','<span>content</span>','</div>','</div>','',
  '<custom a="b">open','text','</custom>','',
  '<missing>unclosed','</orphan>','',
  '`<em>not html</em>`','','```html','<a>not html</a>','```','',
].join('\n');
const actual=groupHtmlElements(scanHtmlElements(source).map(token=>({
  ...token,line:source.slice(0,token.from).split('\n').length,
})));
assert.deepEqual(actual.map(row=>[row.tag,row.kind,row.openLine,row.closeLine,row.status]),[
  ['sup','开合',3,3,'完整'],['br','单行',3,null,'完整'],
  ['<!-- -->','单行',5,null,'完整'],['img','单行',7,null,'完整'],
  ['div','开合',9,13,'完整'],['div','开合',10,12,'完整'],
  ['span','开合',11,11,'完整'],['custom','开合',15,17,'完整'],
  ['missing','开合',19,null,'缺结束标签'],
  ['orphan','开合',null,20,'缺开始标签'],
]);
assert.equal(actual.length,10,'one row per HTML group, not per separate tag');
assert(actual[4].from<actual[5].from&&actual[4].to>actual[5].to,
  'nested identical tags must match inside-out without crossing');
assert(actual.every(row=>Object.isFrozen(row)),'AG source rows must be immutable');
console.log('HTML_GROUP_PASS',actual.length);
