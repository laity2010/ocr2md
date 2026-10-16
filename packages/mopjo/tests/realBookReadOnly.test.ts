/** Optional real book probe: invoke only with a read-only extracted document-ir.v1.json and PDF.
 * Never writes the book; only in-memory semantic edits and deterministic replay.
 */
import * as assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {emptyDelta,open,applyMarkdownEdit,exportMarkdown,encodeDelta,locatePdf,sha256} from '../src/core';
import {validateDocumentIrV1} from '../src/ir/documentIrV1';
const [dirPath,pdfPath]=process.argv.slice(2);
if(!dirPath||!pdfPath)throw Error('usage: realBookReadOnly.test.mjs <extracted-original-dir.json> <source.pdf>');
const bytes=readFileSync(dirPath),pdf=readFileSync(pdfPath);
const before=sha256(bytes),pdfBefore=sha256(pdf);
const original=JSON.parse(bytes.toString());validateDocumentIrV1(original);
const initial=open(original,emptyDelta(original),pdf);
const range=initial.markdown.ranges.find(r=>r.mode==='text'&&
  initial.markdown.content.slice(r.contentFrom,r.contentTo).trim().length>20&&
  initial.markdown.content.slice(r.contentFrom,r.contentTo).length<800);
assert.ok(range,'need original text block for real book probe');
const old=initial.markdown.content.slice(range.contentFrom,range.contentTo);
const changed=initial.markdown.content.slice(0,range.contentTo)+' [MOPJO_WP1_TEST]'+
  initial.markdown.content.slice(range.contentTo);
const updated=applyMarkdownEdit(initial,changed);
const replay=open(original,JSON.parse(Buffer.from(encodeDelta(updated.delta)).toString('utf8')),pdf);
assert.equal(exportMarkdown(replay),exportMarkdown(updated),'replay of real OCR block edits');
assert.equal(replay.current.blocks.find(b=>b.blockId===range.blockId)?.text,
  original.blocks.find(b=>b.blockId===range.blockId)?.text+' [MOPJO_WP1_TEST]');
assert.deepEqual(locatePdf(replay,range.blockId),locatePdf(initial,range.blockId),
  'PDF page and physical bbox must remain the same');
assert.equal(sha256(readFileSync(dirPath)),before,'IR source snapshot untouched');
assert.equal(sha256(readFileSync(pdfPath)),pdfBefore,'original PDF untouched');
assert.equal(sha256(bytes),before);
assert.equal(old.length>20,true);
console.log('MOPJO_REAL_BOOK_READONLY_PASS',JSON.stringify({blocks:original.blocks.length,
  pages:original.pages.length,operations:replay.delta.operations.length,
  inspectedBlockId:range.blockId,pdfPages:locatePdf(replay,range.blockId).pages,
  baselineUnchanged:true,pdfUnchanged:true,markdownDeterministic:true}));
