import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scanNotePairs,planMarkNotePair,validateNoteTemplate} from '../ui/note-pair-scan.js';
const actual=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8');
const book=scanNotePairs(actual);
assert.equal(book.length,10);
assert(book.every(row=>row.status==='已配对'&&/^\d+$/.test(row.number)));
assert.deepEqual(book.map(row=>row.number),Array.from({length:10},(_,i)=>String(i+1)));
assert.deepEqual(book.map(row=>row.referenceLine),[107,111,115,147,215,277,285,443,569,569]);
assert.deepEqual(book.map(row=>row.bodyLine),[665,669,673,677,681,685,689,709,713,717]);
assert(book.every(row=>/^\\<sup>\d+\\<\/sup>$/.test(row.reference)));
assert.equal(book.some(row=>row.number==='uch'||row.number==='has'),false,
  'OCR artifacts M\\<sup>uch\\</sup> must not be treated as footnote refs');
const escaped=scanNotePairs('Citation \\<sup>1\\</sup> next.<sup>2</sup> and [^3].\n'+
  '1\\. First note\n2. Second note\n3\\. Third note\n');
assert.deepEqual(escaped.map(x=>[x.number,x.status]),
  [['1','已配对'],['2','已配对'],['3','已配对']]);
const source='A cited[^1] and repeated[^1] with <sup>2</sup>.\n\n## Notes\n1\\. First note\n2\\. Second note\n3\\. Orphan body\n';
const rows=scanNotePairs(source);
assert.equal(rows.filter(row=>row.status==='已配对').length,3);
assert.equal(rows.filter(row=>row.status==='缺引用').length,1);
assert.equal(rows.find(row=>row.number==='1').bodyLine,4);
const operations=planMarkNotePair(source,rows[0]);
assert.equal(operations.length,2);
assert.equal(operations[0].tag,'ocr2md:note-ref');
assert.equal(operations[1].tag,'ocr2md:note-body');
const incomplete=scanNotePairs('Only [^2]\n');
assert.equal(incomplete[0].status,'缺正文');
const conflicts=scanNotePairs('Claim[^1]\n1\\. First\n1\\. Another\n');
assert(conflicts.some(row=>row.status==='编号冲突'));
assert.throws(()=>validateNoteTemplate({reference:'(.*)',body:'(?<id>\\d+)'}));
console.log('NOTE_PAIR_READONLY_PASS',{realBodies:book.length,realPairs:10,
  escapedSup:true,htmlSup:true,markdownFootnote:true,ocrFalsePositiveExcluded:true,
  paired:3,orphan:1,conflict:true,annotationPlanning:true});
