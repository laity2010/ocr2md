/** WP1 real-corpus read-only acceptance (requires targeted TS build).
 * Usage: node tests/mineruElementWp1Real.mjs "<Bufett’s Alpha folder>"
 * Input never saved or modified. Only aggregate statistics printed.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import extractor from "../../../.tmp/wp1/mineruElementExtractor.js";
const { extractMineruElements } = extractor;
const here=dirname(fileURLToPath(import.meta.url));
const root=process.argv[2]||process.env.OCR2MD_PDF_MD_CASE_ROOT;
if(!root)throw Error('Usage: node tests/mineruElementWp1Real.mjs "<book directory>"');
const expected=JSON.parse(await readFile(resolve(here,"fixtures/buffett-alpha-wp0.json"),"utf8"));
const pdfPath=resolve(root,expected.inputs.pdf.relativePath);
const mdPath=resolve(root,expected.inputs.md.relativePath);
const jsonPath=resolve(root,expected.inputs.json.relativePath);
const [pdfBefore,mdBefore,jsonBefore]=await Promise.all(
  [pdfPath,mdPath,jsonPath].map(async f=>createHash("sha256").update(await readFile(f)).digest("hex")));
const bytes=new Uint8Array(await readFile(jsonPath));
const data=JSON.parse(new TextDecoder().decode(bytes));
const first=extractMineruElements(bytes);
const again=extractMineruElements(bytes);
assert.equal(first.schemaVersion,1);
assert.equal(first.sourceSha256,expected.inputs.json.sha256);
assert.equal(first.pageCount,expected.pages);
assert.equal(first.bodyElements.length,expected.paragraphBlocks);
assert.equal(first.discardedElements.length,expected.discardedBlocks);
assert.deepEqual([pdfBefore,mdBefore,jsonBefore],[
  expected.inputs.pdf.sha256, expected.inputs.md.sha256, expected.inputs.json.sha256]);
const all=[...first.bodyElements,...first.discardedElements];
const idSet=new Set(all.map(e=>e.id));
assert.equal(idSet.size,all.length,"all source IDs must be unique");
assert.deepEqual(again.bodyElements.map(e=>e.id),first.bodyElements.map(e=>e.id));
assert.deepEqual(again.discardedElements.map(e=>e.id),first.discardedElements.map(e=>e.id));
const counts=(elements)=>Object.fromEntries([...new Set(elements.map(e=>e.type))].sort()
  .map(type=>[type,elements.filter(e=>e.type===type).length]));
assert.deepEqual(counts(first.bodyElements),Object.fromEntries(Object.entries(expected.bodyTypes).sort()));
assert.deepEqual(counts(first.discardedElements),Object.fromEntries(Object.entries(expected.discardedTypes).sort()));
const byCollection={para_blocks:first.bodyElements,discarded_blocks:first.discardedElements};
const typeExamples={};
let countLines=0,countSpans=0,segmentCount=0,rawSubblocks=0,tableHtml=0,formula=0,images=0;
for(const e of all){
  const raw=data.pdf_info[e.pageIndex][e.collection][e.collectionPosition];
  assert.deepEqual(e.rawBlock,raw,`${e.jsonPointer}: entire raw JSON tree must survive`);
  assert.equal(e.jsonPointer,`/pdf_info/${e.pageIndex}/${e.collection}/${e.collectionPosition}`);
  assert.equal(e.id,`mineru:${first.sourceSha256}:p${e.pageIndex}:${e.collection}:${e.collectionPosition}`);
  assert.equal(e.pdfPageNumber,e.pageIndex+1);
  assert.deepEqual(e.bbox,raw.bbox);
  assert.deepEqual(e.pageSize,data.pdf_info[e.pageIndex].page_size);
  assert.ok(e.normalizedBBox.every(n=>n>=0&&n<=1));
  assert.equal(e.normalizedContentSha256.length,64);
  assert.ok(byCollection[e.collection].includes(e));
  segmentCount+=e.segments.length;
  if(e.collection==="para_blocks"){
    const lines=raw.lines||[];countLines+=lines.length;
    countSpans+=lines.reduce((s,l)=>s+(l.spans||[]).length,0);
  }
  rawSubblocks+=(raw.blocks||[]).length;
  tableHtml+=e.segments.filter(s=>typeof s.html==="string"&&s.html.includes("<table")).length;
  formula+=e.segments.filter(s=>s.type==="interline_equation" && typeof s.content==="string").length;
  images+=e.segments.filter(s=>typeof s.imagePath==="string").length;
  typeExamples[e.type]??=e.id;
}
assert.equal(countLines,expected.bodyLines);
assert.equal(countSpans,expected.bodySpans);
for(const example of expected.elementExamples){
  const e=byCollection[example.collection].find(x=>x.pageIndex===example.page-1&&
    x.collectionPosition===example.position);
  assert.ok(e,"known source element must exist");
  assert.equal(e.type,example.type);
  assert.deepEqual(e.bbox,example.bbox);
}
for(const n of expected.rotatedPdfPages){
  assert.deepEqual(data.pdf_info[n-1].page_size,expected.pageSizeExamples[String(n)]);
  assert.ok(first.bodyElements.some(e=>e.pdfPageNumber===n),"rotated page must have source elements");
}
assert.ok(tableHtml>=1,"table HTML must remain available in segments");
assert.ok(formula>=1,"formula content must remain available in segments");
assert.ok(images>=1,"image paths must remain available in segments");
assert.ok(rawSubblocks>=1,"nested table/chart blocks must remain available");
const [pdfAfter,mdAfter,jsonAfter]=await Promise.all(
  [pdfPath,mdPath,jsonPath].map(async f=>createHash("sha256").update(await readFile(f)).digest("hex")));
assert.deepEqual([pdfBefore,mdBefore,jsonBefore],[pdfAfter,mdAfter,jsonAfter],
  "extractor must not modify original documents");
const report={
  status:"WP1_REAL_EXTRACTION_PASS",readOnly:true,pageCount:first.pageCount,
  body:first.bodyElements.length,discarded:first.discardedElements.length,
  uniqueIds:idSet.size,segments:segmentCount,nestedSubblocks:rawSubblocks,
  tableHtmlSegments:tableHtml,formulaSegments:formula,imagePathSegments:images,
  bodyLines:countLines,bodySpans:countSpans,
  rotatingPageExamples:expected.rotatedPdfPages,
  originalDocumentHashesUnchanged:true,
};
console.log(JSON.stringify(report,null,2));
