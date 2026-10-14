import * as assert from 'node:assert/strict';
import {scanChapterElements} from './chapterElementCatalog';
const text=[
 '<!-- ocr2md-ir:block=blk_111111111111111111111111 -->',
 '# Heading',
 '<!-- ocr2md-ir:block=blk_222222222222222222222222 -->',
 '```math','L=\\frac{a}{b}','```',
 'Some $x^2+1$ inline math and \\(a+b\\) delimiters.',
 '```js', 'const latex = "$do not count$";', '```',
 '<!-- ocr2md-ir:block=blk_333333333333333333333333 -->',
 '```html','<table><tr><td><eq>\\frac{c}{d}</eq></td></tr></table>','```',
 '[图片来源 1（仅链接，不自动载入）](https://cdn.example.org/image.png)',
 '![photo](imgs/a.jpg)',
 ].join('\n');
const media=scanChapterElements(text,'/ocr2md/Test/chapters/01.md','媒体');
const tables=scanChapterElements(text,'/ocr2md/Test/chapters/01.md','表格');
const math=scanChapterElements(text,'/ocr2md/Test/chapters/01.md','LaTeX');
assert.equal(media.length,2,JSON.stringify(media.map(x=>x.lineType)));
assert.deepEqual(media.map(x=>x.lineType),['图片来源','图片']);
assert.deepEqual(tables.map(x=>x.lineType),['HTML 表格']);
assert.equal(tables[0].parentBlockId,'blk_333333333333333333333333');
assert.ok(media.find(x=>x.lineType==='图片来源')?.mediaSourceUrl?.startsWith('https://'));
assert.equal(media.find(x=>x.lineType==='图片')?.localPath,'imgs/a.jpg');
assert.equal(math.length,4,JSON.stringify(math.map(x=>x.lineType)));
assert.deepEqual(math.map(x=>x.lineType),['独立公式','行内公式','行内公式','表格内公式']);
assert.equal(math[0].range.line,3);
assert.equal(math[0].parentBlockId,'blk_222222222222222222222222');
assert.equal(math[3].parentBlockId,'blk_333333333333333333333333');
assert.ok(!math.some(x=>x.raw.includes('do not count')));
assert.deepEqual(scanChapterElements(text,'/ocr2md/Test/chapters/01.md','媒体'),media);
assert.deepEqual(scanChapterElements(text,'/ocr2md/Test/chapters/01.md','表格'),tables);
console.log('CHAPTER_MEDIA_TABLE_LATEX_CATALOG_PASS',JSON.stringify({media:media.length,tables:tables.length,math:math.length,sourceAnchors:true}));
