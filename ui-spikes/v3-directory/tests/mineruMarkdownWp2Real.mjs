/** WP2 real-data readonly evidence comparison against MinerU's original Markdown.
 * Usage: npm --prefix ui-spikes/v3-directory run test:markdown:real -- "<book root>"
 * Only stdout aggregates are produced. No sidecar, no source write.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import extractor from "../../../.tmp/wp2/mineruElementExtractor.js";
import comparison from "../../../.tmp/wp2/mineruMarkdownReconstruction.js";
const { extractMineruElements }=extractor;
const { compareMineruIndexWithOriginalMd }=comparison;
const folder=process.argv[2]||process.env.OCR2MD_PDF_MD_CASE_ROOT;
if(!folder)throw Error('Usage: node tests/mineruMarkdownWp2Real.mjs "<book directory>"');
const expected=JSON.parse(await readFile(resolve(dirname(fileURLToPath(import.meta.url)),
  "fixtures/buffett-alpha-wp0.json"),"utf8"));
const names=["pdf","json","md"];
const files=Object.fromEntries(await Promise.all(names.map(async name=>{
  const bytes=await readFile(resolve(folder,expected.inputs[name].relativePath));
  const sha256=createHash("sha256").update(bytes).digest("hex");
  assert.equal(sha256,expected.inputs[name].sha256,`${name} source revision changed`);
  return [name,{bytes,sha256}];
})));
const index=extractMineruElements(new Uint8Array(files.json.bytes));
const md=new TextDecoder("utf-8",{fatal:true}).decode(files.md.bytes);
assert.equal(index.bodyElements.length,224);
assert.equal(index.discardedElements.length,91);
const results=compareMineruIndexWithOriginalMd(index,md);
assert.equal(results.length,index.bodyElements.length);
const statuses={unique:0,ambiguous:0,"partial-evidence":0,"not-found":0,unavailable:0};
const byType={};
for(const result of results){
  statuses[result.state]++;
  const type=result.candidate.type;
  byType[type]??={unique:0,ambiguous:0,"partial-evidence":0,"not-found":0,unavailable:0};
  byType[type][result.state]++;
  for(const entry of result.matches){
    for(const [start,end] of entry.rangesUtf16){
      assert.ok(Number.isSafeInteger(start) && start>=0 && end<=md.length && end>start);
      if(entry.part.kind==="image")assert.ok(md.slice(start,end).startsWith("!["));
      else assert.ok(md.slice(start,end).length>0);
    }
    if(entry.state==="partial-evidence"){
      assert.equal(entry.rangesUtf16.length,0,"fragments must not be treated as confirmed exact anchors");
      assert.equal(entry.fragmentEvidenceUtf16.length,2);
    }
  }
}
const invalidTable=results.filter(r=>r.candidate.pageIndex===4 && r.candidate.type==="table");
assert.equal(invalidTable.length,1);
assert.equal(invalidTable[0].state,"unavailable");
assert.equal(invalidTable[0].candidate.proposal,null,"empty table must not be hallucinated");
assert.equal(results.filter(r=>r.candidate.type==="text" && r.state==="unavailable").length,8);
assert.equal(results.filter(r=>r.candidate.type==="interline_equation" && r.state==="unique").length,20);
assert.equal(results.filter(r=>r.candidate.type==="image" && r.state==="unique").length,7);
for(const rotated of [8,11])assert.ok(results.some(r=>r.candidate.pageIndex===rotated-1));
assert.equal(Object.values(statuses).reduce((a,b)=>a+b),224);
const mdSourceHash=createHash("sha256").update(files.md.bytes).digest("hex");
const report={
  status:"WP2_ORIGINAL_MD_COMPARISON_PASS",readOnly:true,
  pageCount:index.pageCount,
  originalMdSha256:mdSourceHash,
  sourceElements:results.length,excludedFromMdComparison:index.discardedElements.length,
  statuses,byType,
  knownIncomplete:{
    page5Table:"unavailable-no-json-body",
    emptyTextElements:8,
  },
  /** Structural evidence, NOT manually-verified PDF↔MD relations. */
  verifiedRelations:0,
};
const hashesAfter=await Promise.all(names.map(async name=>{
  const bytes=await readFile(resolve(folder,expected.inputs[name].relativePath));
  return createHash("sha256").update(bytes).digest("hex");
}));
assert.deepEqual(hashesAfter,names.map(name=>files[name].sha256),
  "PDF/JSON/MD must remain byte-for-byte unchanged");
console.log(JSON.stringify(report,null,2));
