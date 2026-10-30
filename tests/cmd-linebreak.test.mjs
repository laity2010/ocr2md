import assert from 'node:assert/strict';
import nspell from 'nspell';import {readFileSync} from 'node:fs';
import MarkdownIt from 'markdown-it';
import {detectIllegalBreaks,planIllegalBreakMarks,readIllegalBreaks,LINEBREAK_TAG} from '../ui/cmd-linebreak.js';
import {formatAnnotation,scanAnnotations} from '../ui/cmd-annotations.js';
const spell=nspell(readFileSync('node_modules/dictionary-en/index.aff'),readFileSync('node_modules/dictionary-en/index.dic'));
const source=['# Chapter One','','The govern','ment announced a policy.','','We met this','morning in town.','','The inter-','national organization said.','','- A govern','ment list item.','','| govern | ment |','| --- | --- |','','```python','govern','ment','```','','<!-- minerujson:block:v1:0:0 -->','', '<!-- minerujson:source:v1','{ "govern": "ment" }','-->'].join('\n');
const result=detectIllegalBreaks(source,spell,{bodyEnd:source.indexOf('<!-- minerujson:source')});
assert.deepEqual(result.issues.map(r=>r.joined),['government','international']);
const ops=planIllegalBreakMarks(source,result.issues,[]);
assert.equal(ops.length,2);
const marked=ops.sort((a,b)=>b.at-a.at).reduce((doc,op)=>
  doc.slice(0,op.at)+formatAnnotation(op.tag,op.attributes)+doc.slice(op.at),source);
const ann=scanAnnotations(marked).filter(a=>a.tag===LINEBREAK_TAG);
assert.equal(ann.length,2);assert.equal(readIllegalBreaks(marked,ann).recordCount,2);
assert.equal(planIllegalBreakMarks(marked,readIllegalBreaks(marked,ann).rows,ann).length,0);
const render=new MarkdownIt({html:true});
assert.equal(render.render(marked).replace(/<!--ocr2md:illegal-break[^\n]*?-->/g,''),render.render(source));
assert.equal(readIllegalBreaks(marked.replace('govern<!--','governed<!--'),scanAnnotations(marked.replace('govern<!--','governed<!--'))).stale,1);
assert.equal(detectIllegalBreaks('The government announced\na new policy.',spell).issues.length,0);
assert.equal(detectIllegalBreaks('The govern\n\nment',spell).issues.length,0);
assert.equal(detectIllegalBreaks('> The govern\n> ment',spell).issues.length,0);
// Regression from the actual Buffett's Alpha PDF screenshot: same-page
// adjacent OCR blocks split a *sentence*, not the spelling of one word.
const realFixture=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8');
const realBodyEnd=realFixture.indexOf('<!-- minerujson:source:v1');
const realResults=detectIllegalBreaks(realFixture,spell,{bodyEnd:realBodyEnd});
const about=realResults.issues.filter(row=>row.joined==='about 3');
assert.equal(about.length,1,'must find screenshot about / 3 cross-block continuation');
const filing=realResults.issues.filter(row=>row.joined==='latest 13F');
assert.equal(filing.length,1,'must flag real 8:3 → 8:4 latest / 13F');
assert.match(filing[0].context,/basis of the latest.*MinerU 8:4.*13F, and/s);
assert.equal(filing[0].reason,'相邻 MinerU 文本块疑似句子断行');

assert.match(about[0].context,/1\.72%, about.*MinerU 6:7.*3 percentage points/s);
assert.equal(about[0].reason,'相邻 MinerU 文本块疑似句子断行');
const realOperations=planIllegalBreakMarks(realFixture,about,[]);
assert.equal(realOperations.length,1);
const realMarked=realFixture.slice(0,realOperations[0].at)+
 formatAnnotation(realOperations[0].tag,realOperations[0].attributes)+
 realFixture.slice(realOperations[0].at);
const realTags=scanAnnotations(realMarked).filter(tag=>tag.tag===LINEBREAK_TAG);
assert.equal(realTags.length,1);
const realRead=readIllegalBreaks(realMarked,realTags);
assert.equal(realRead.rows[0].joined,'about 3');
assert.equal(realRead.rows[0].reason,'相邻 MinerU 文本块疑似句子断行');
assert.equal(planIllegalBreakMarks(realMarked,realRead.rows,realTags).length,0);
// Existing about/3 has already been CMD-marked by an earlier version. A
// manual rescan must add only the newly supported latest/13F candidate.
const fresh=detectIllegalBreaks(realMarked,spell,{bodyEnd:realMarked.indexOf('<!-- minerujson:source:v1')});
assert.deepEqual(fresh.issues.map(x=>x.joined),['about 3','latest 13F']);
const newMarks=planIllegalBreakMarks(realMarked,fresh.issues,realTags);
assert.equal(newMarks.length,1,'old CMD annotation must not duplicate');
assert.equal(newMarks[0].attributes.left,'latest');
assert.equal(newMarks[0].attributes.right,'13F');
const bothMarked=realMarked.slice(0,newMarks[0].at)+
 formatAnnotation(newMarks[0].tag,newMarks[0].attributes)+realMarked.slice(newMarks[0].at);
const allAnnotations=scanAnnotations(bothMarked).filter(tag=>tag.tag===LINEBREAK_TAG);
assert.equal(allAnnotations.length,2);
assert.deepEqual(readIllegalBreaks(bothMarked,allAnnotations).rows.map(x=>x.joined),['about 3','latest 13F']);
assert.equal(planIllegalBreakMarks(bothMarked,
 readIllegalBreaks(bothMarked,allAnnotations).rows,allAnnotations).length,0);
assert.equal(render.render(bothMarked).replace(/<!--ocr2md:illegal-break[^\n]*?-->/g,''),
 render.render(realFixture),'CMD comments changed preview or source readability');
const changedFiling=bothMarked.replace('13F, and the portfolio','14F, and the portfolio');
assert.equal(readIllegalBreaks(changedFiling,scanAnnotations(changedFiling)).stale,1,
 'old latest/13F marker must be stale when identifier is edited');

assert.equal(render.render(realMarked).replace(/<!--ocr2md:illegal-break[^\n]*?-->/g,''),render.render(realFixture));
const changed=realMarked.replace('3 percentage points','4 percentage points');
assert.equal(readIllegalBreaks(changed,scanAnnotations(changed)).stale,1);
const noMarker='The final result is about\n\n3 percentage points below.';
assert.equal(detectIllegalBreaks(noMarker,spell).issues.length,0,'plain paragraph separator is not evidence');
const fullStop='A full sentence ends.\n\n<!-- minerujson:block:v1:6:7 -->\n\n3 percentage points below.';
assert.equal(detectIllegalBreaks(fullStop,spell).issues.length,0,'finished sentence is not suspicious');
const differentPage='<!-- minerujson:block:v1:6:6 -->\n\nWe speak about\n\n<!-- minerujson:block:v1:7:7 -->\n\n3 percent.';
assert.equal(detectIllegalBreaks(differentPage,spell).issues.length,0,'cross-page anchor is not same-page evidence');
const nonconsecutive='<!-- minerujson:block:v1:6:6 -->\n\nWe speak about\n\n<!-- minerujson:block:v1:6:9 -->\n\n3 percent.';
assert.equal(detectIllegalBreaks(nonconsecutive,spell).issues.length,0,'non-adjacent OCR blocks excluded');
const structured='<!-- minerujson:block:v1:8:3 -->\n\nThe last `code`\n\n<!-- minerujson:block:v1:8:4 -->\n\n13F file.';
assert.equal(detectIllegalBreaks(structured,spell).issues.length,0,'inline code at boundary is not prose');
const sameWord='<!-- minerujson:block:v1:8:3 -->\n\nThe latest.\n\n<!-- minerujson:block:v1:8:4 -->\n\n13F report.';
assert.equal(detectIllegalBreaks(sameWord,spell).issues.length,0,'complete sentence should not be marked');
const differentPageFiling='<!-- minerujson:block:v1:8:3 -->\n\nThe latest\n\n<!-- minerujson:block:v1:9:4 -->\n\n13F report.';
assert.equal(detectIllegalBreaks(differentPageFiling,spell).issues.length,0,'different-page filing blocks remain excluded');
const skippedBlockFiling='<!-- minerujson:block:v1:8:3 -->\n\nThe latest\n\n<!-- minerujson:block:v1:8:5 -->\n\n13F report.';
assert.equal(detectIllegalBreaks(skippedBlockFiling,spell).issues.length,0,'nonadjacent filing blocks remain excluded');
console.log('CMD_LINEBREAK_PASS split words + Buffett real 6:6→6:7 and 8:3→8:4; old marker compatibility / renderer / negatives');
