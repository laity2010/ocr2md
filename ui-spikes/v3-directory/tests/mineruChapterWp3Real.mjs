/** WP3 real book regression. Pure read-only, only prints aggregate evidence.
 * Usage: node tests/mineruChapterWp3Real.mjs "<book dir>" after test:chapters compiles TS.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import extractor from "../../../.tmp/wp3/mineruElementExtractor.js";
import chapterMapper from "../../../.tmp/wp3/mineruChapterMapping.js";

const { extractMineruElements }=extractor;
const { mapMineruToChapterDrafts }=chapterMapper;
const workdir=process.argv[2]||process.env.OCR2MD_PDF_MD_CASE_ROOT;
if(!workdir)throw Error('Usage: node tests/mineruChapterWp3Real.mjs "<book directory>"');
const here=dirname(fileURLToPath(import.meta.url));
const fixture=JSON.parse(await readFile(resolve(here,"fixtures/buffett-alpha-wp3.json"),"utf8"));
const base=JSON.parse(await readFile(resolve(here,"fixtures/buffett-alpha-wp0.json"),"utf8"));
const vaultRelativeRoot="/ocr2md/Bufett’s Alpha";
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const inputPaths=[...Object.values(base.inputs).map(x=>x.relativePath),
  ".ocr2md-merged.working.md"];
async function allChapterMarkdown(){
  const folders=(await readdir(resolve(workdir,"chapters"),{withFileTypes:true}))
    .filter(f=>f.isDirectory());
  const files=[];
  for(const folder of folders){
    const names=await readdir(resolve(workdir,"chapters",folder.name),{withFileTypes:true});
    for(const f of names){
      if(f.isFile()&&f.name.endsWith(".md"))
        files.push(join("chapters",folder.name,f.name));
    }
  }
  return files.sort();
}
const tracked=[...new Set([...inputPaths,...await allChapterMarkdown()])].sort();
const snapshot=async()=>Object.fromEntries(await Promise.all(tracked.map(async p=>[
  p,sha(await readFile(resolve(workdir,p))),
])));
const before=await snapshot();
for(const file of Object.values(base.inputs))
  assert.equal(before[file.relativePath],file.sha256,`WP0 source changed: ${file.relativePath}`);
const expectedPaths=new Set();
const pairs=[];
for(const p of fixture.chapters){
  const documents=[];
  for(const d of [p.source,p.working]){
    assert.ok(!d.path.startsWith("/")&&!d.path.split(/[\\/]/u).includes(".."),"fixture path escape");
    assert.ok(!expectedPaths.has(d.path),"duplicate mapped chapter path");
    expectedPaths.add(d.path);
    const buf=await readFile(resolve(workdir,d.path));
    assert.equal(sha(buf),d.sha256,`Chapter revised; refresh audited WP3 fixture: ${d.path}`);
    const text=new TextDecoder("utf-8",{fatal:true}).decode(buf);
    documents.push({path:vaultRelativeRoot+"/"+d.path.replaceAll(sep,"/"),text,sha256:d.sha256});
  }
  pairs.push({chapterId:p.chapterId,source:documents[0],working:documents[1]});
}
assert.equal(pairs.length,fixture.expectedChapters);
for(const excluded of fixture.excludedChapterDirectoryNames){
  assert.ok(tracked.some(p=>p.startsWith("chapters"+sep+excluded+sep)),
    `expected excluded duplicate chapter missing: ${excluded}`);
  assert.ok(!pairs.some(p=>p.chapterId===excluded),
    "unpaired/duplicated chapter must not participate in canonical map");
}
const originalText=new TextDecoder("utf-8",{fatal:true}).decode(
  await readFile(resolve(workdir,base.inputs.md.relativePath)));
const original={path:vaultRelativeRoot+"/"+base.inputs.md.relativePath,
  text:originalText,sha256:base.inputs.md.sha256};
const originalJson=new Uint8Array(await readFile(resolve(workdir,base.inputs.json.relativePath)));
const index=extractMineruElements(originalJson);
const results=mapMineruToChapterDrafts(index,original,pairs);
assert.equal(results.elements.length,base.paragraphBlocks);
assert.equal(results.ignoredDiscardedCount,base.discardedBlocks);
assert.equal(results.chapterVersions.length,pairs.length);
assert.equal(results.sourceJsonSha256,base.inputs.json.sha256);
const counts={};
const byType={};
const documents=new Map(pairs.flatMap(p=>[[p.source.path,p.source],[p.working.path,p.working]]));
const ids=new Set();
let exactAnchorCount=0,partialAnchorCount=0;
for(const row of results.elements){
  assert.ok(!ids.has(row.elementId),"duplicate MinerU identity");ids.add(row.elementId);
  assert.equal(row.manuallyVerified,false);
  assert.equal(row.pdfPageNumber,row.pageIndex+1);
  assert.equal(row.chapters.length,new Set(row.chapters).size);
  counts[row.status]=(counts[row.status]||0)+1;
  byType[row.type]??={};
  byType[row.type][row.status]=(byType[row.type][row.status]||0)+1;
  for(const part of row.parts){
    for(const [from,to] of part.originalMdRangesUtf16)
      assert.ok(from>=0&&to>from&&to<=originalText.length);
    for(const anchor of [...part.chapterAnchors,...part.workingAnchors]){
      const doc=documents.get(anchor.path);
      assert.ok(doc,"anchor must belong to one canonical chapter");
      assert.equal(anchor.sha256,doc.sha256,"source revisions must be explicit");
      assert.ok(["unique","ambiguous","partial-evidence"].includes(anchor.state));
      for(const [from,to] of [...anchor.rangesUtf16,...anchor.fragmentEvidenceUtf16])
        assert.ok(from>=0&&to>from&&to<=doc.text.length,"UTF-16 range outside document");
      if(anchor.state==="unique"){
        assert.equal(anchor.rangesUtf16.length,1);
        assert.equal(anchor.matchedTextSha256,sha(Buffer.from(doc.text.slice(...anchor.rangesUtf16[0]))));
        assert.equal(anchor.previousContextSha256?.length,64);
        assert.equal(anchor.nextContextSha256?.length,64);
        exactAnchorCount++;
      }
      if(anchor.state==="partial-evidence"){
        assert.equal(anchor.rangesUtf16.length,0,"partial evidence must not masquerade as exact anchor");
        assert.equal(anchor.fragmentEvidenceUtf16.length,2);
        partialAnchorCount++;
      }
    }
  }
}
assert.deepEqual(counts,fixture.statusCounts,"Unexpected regression: WP3 status counts changed");
assert.equal(counts["candidate-complete"],123);
assert.equal(results.elements.filter(e=>e.type==="image"&&e.status==="candidate-complete").length,6,
  "changed MinerU CDN batch should still match 6 stable resource IDs");
assert.equal(results.elements.filter(e=>e.pageIndex===4&&e.type==="table"&&e.status==="unavailable").length,1);
assert.ok(results.elements.filter(e=>e.type==="title"&&e.status==="ambiguous").length>=6);
for(const pdfPageNumber of [8,11])
  assert.ok(results.elements.some(e=>e.pdfPageNumber===pdfPageNumber),"rotated PDF pages must retain anchors");
const after=await snapshot();
assert.deepEqual(after,before,"No PDF/JSON/MD/working/copy may be modified by the mapper");
const report={
  status:"WP3_CANONICAL_CHAPTER_MAPPING_PASS",
  readOnly:true,chapters:pairs.length,excludedDuplicateDirs:fixture.excludedChapterDirectoryNames,
  bodyElements:results.elements.length,discardedElementsExcluded:results.ignoredDiscardedCount,
  statusCounts:counts,byType,
  exactDocumentAnchors:exactAnchorCount,partialDocumentAnchors:partialAnchorCount,
  approvedPdfMdMatches:0,workingDraftsChanged:false,
  allTrackedFileHashesUnchanged:true,trackedFiles:tracked.length,
};
console.log(JSON.stringify(report,null,2));
