import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import MarkdownIt from 'markdown-it';
import {extractTextBlocks,reconstructSource,segmentSentences,planSentenceMarks,readSentenceMarks,SENTENCE_TAG} from '../ui/cmd-sentences.js';
import {formatAnnotation,scanAnnotations} from '../ui/cmd-annotations.js';
for(const source of [readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8'),
   readFileSync('.v6/workspace/buffetts-alpha.minerujson.md','utf8')]){
 const before=source.indexOf('<!-- minerujson:source:v1');const p=extractTextBlocks(source,{bodyEnd:before});
 assert.equal(reconstructSource(p),source,'byte-for-byte source reconstruction failed');
 const rows=segmentSentences(p);
 assert(rows.length>300,'unexpected sentence loss');
 for(const term of ['about 3 percentage points','latest 13F']){
   assert(rows.some(x=>x.text.includes(term)&&x.crossBlock),`Missing cross-block sentence: ${term}`);
 }
 const plans=planSentenceMarks(source,rows,[]);
 assert(plans.length>300,'sentence marker coverage unexpectedly low');
 const written=plans.sort((a,b)=>b.at-a.at).reduce((text,op)=>
   text.slice(0,op.at)+formatAnnotation(op.tag,op.attributes)+text.slice(op.at),source);
 const marks=scanAnnotations(written).filter(x=>x.tag===SENTENCE_TAG);
 const read=readSentenceMarks(written,marks);
 assert(read.rows.length>280,'marked sentences did not read back');
 assert(read.rows.some(x=>x.text.includes('about 3 percentage points')&&x.crossBlock));
 assert(read.rows.some(x=>x.text.includes('latest 13F')&&x.crossBlock));
 assert.equal(planSentenceMarks(written,segmentSentences(extractTextBlocks(written,{bodyEnd:written.indexOf('<!-- minerujson:source:v1')})),marks).length,0,
  'rescan inserted duplicate CMD sentence tags');
 const md=new MarkdownIt({html:true});
 const strip=html=>html.replace(/<!--ocr2md:sentence\b[^\n]*?-->/g,'');
 // The entire prose body, not just a handpicked sentence. The large immutable
 // MinerU JSON evidence tail is kept byte-identical and is not Markdown.
 const originalBody=source.slice(0,before);
 const taggedBody=written.slice(0,written.indexOf('<!-- minerujson:source:v1'));
 assert.equal(strip(md.render(taggedBody)),md.render(originalBody),
   'CMD sentence marks changed real Buffett Markdown preview structure');
 console.log('CMD_SENTENCE_PASS',{sentences:rows.length,inserted:plans.length,restored:read.rows.length,stale:read.stale});
}
const input='<!-- minerujson:block:v1:0:0 -->\n\nThe cost is about\n\n<!-- minerujson:block:v1:0:1 -->\n\n3 percentage points lower. It matters.\n';
const parsed=segmentSentences(extractTextBlocks(input));
assert.equal(parsed.length,2);assert.equal(parsed[0].fragments.length,2);
assert.equal(parsed[1].text,'It matters.');
assert.deepEqual(parsed[0].blocks,['p0b0','p0b1']);
assert.equal(reconstructSource(extractTextBlocks(input)),input);
console.log('CMD_SENTENCE_SMALL_PASS');
