import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildDocumentIndex,createIndexProjector} from './document-index.js';
const hash=x=>createHash('sha256').update(x).digest('hex');
const A='mineru:0:0:0', B='mineru:0:1:0';
const start='<!-- minerujson:block:v1:0:0 -->\n\n# Introduction\n\n![Figure](https://example.test/a.png)\n\n';
const next=`<!-- minerujson:block:v1:0:1 -->\n<!-- ocr2md:chapter:v1 id="${B}" independent="1" -->\n## Appendix\n\n<!--ocr2md:latex id="0123456789abcdef" review="latex"-->\n$x^2$\n\n![Photo](https://example.test/b.png)\n\n`;
const evidence='<!-- minerujson:source:v1:raw -->\nUNMODIFIED_EVIDENCE\n';
const original=start+next+evidence;
const first=buildDocumentIndex(original);
assert.deepEqual(first.chapters.map(x=>x.id),[A,B]);
assert.deepEqual(first.chapters.map(x=>x.number),['000','001']);
assert.equal(first.chapterText(A),start);
assert.equal(first.chapterText(B),next);
assert.equal(first.chapters.map(x=>first.chapterText(x.id)).join('')+original.slice(first.bodyEnd),original);
assert.deepEqual(Object.fromEntries(['heading','media','latex'].map(type=>[type,first.queryElements({type}).length])),
  {heading:2,media:2,latex:1});
assert.equal(first.queryElements({chapter:B}).length,3);
const formula=first.queryElements({type:'latex'})[0];
assert.equal(formula.identity,'persisted');
assert.equal(formula.status,'latex');
assert.equal(original.slice(formula.from,formula.to),'$x^2$');
assert.equal(first.getElement(formula.id),formula);
assert.equal(first.chapterAt(first.bodyEnd),null);
assert.equal(first.warnings.length,0);
assert.throws(()=>first.queryElements({chapter:'unknown'}),/Unknown chapter/);
const merged=buildDocumentIndex(original.replace('independent="1"','independent="0"'));
assert.equal(merged.chapters.length,1);
assert.equal(merged.queryElements({chapter:A}).length,5);
assert.equal(merged.queryElements({type:'latex'})[0].id,formula.id);
const shifted=buildDocumentIndex(original.replace('# Introduction','# Introduction\nExtra text'));
assert.equal(shifted.chapters.length,2);
assert(shifted.queryElements({type:'latex'})[0].from>formula.from);
assert.equal(shifted.queryElements({type:'latex'})[0].id,formula.id);
assert.equal(shifted.queryElements({chapter:B,type:'media'})[0].id,
  first.queryElements({chapter:B,type:'media'})[0].id);
let active=original;const projector=createIndexProjector(()=>active);
assert.equal(projector.get(),projector.get());
active=original.replace('independent="1"','independent="0"');
assert.equal(projector.get().chapters.length,1);
assert.equal(projector.get(),projector.get());
projector.clear();assert.equal(projector.get().chapters.length,1);
assert.equal(hash(original),hash(start+next+evidence));
console.log('WP1_WP2_SYNTHETIC_PASS',JSON.stringify({chapterViewsLossless:true,ownershipReclassified:true,persistedIdStable:true}));
const path=process.env.WP02_MOTHER_DOCUMENT;
if(path){
 const text=readFileSync(path,'utf8'),snapshot=hash(text),idx=buildDocumentIndex(text);
 assert.equal(idx.chapters.length,6);
 const counts=Object.fromEntries(['heading','media','latex'].map(type=>[type,idx.queryElements({type}).length]));
 assert.deepEqual(counts,{heading:19,media:11,latex:42});
 assert.equal(idx.queryElements().length,72);
 assert.equal(idx.warnings.length,0);
 assert.equal(idx.chapters.map(c=>idx.chapterText(c.id)).join('')+text.slice(idx.bodyEnd),text);
 assert.equal(idx.chapters.reduce((total,c)=>total+idx.queryElements({chapter:c.id}).length,0),72);
 assert.equal(hash(text),snapshot);
 console.log('WP1_WP2_REAL_MOTHER_PASS',JSON.stringify({chapters:6,...counts,sourceSHA256:snapshot,
   perChapter:idx.chapters.map(c=>[c.number,c.id,idx.queryElements({chapter:c.id}).length]),fullCover:true}));
}
