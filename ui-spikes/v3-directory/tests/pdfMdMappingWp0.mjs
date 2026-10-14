/** Read-only WP0 baseline for one real MinerU/PDF/MD set.
 * Usage: node ui-spikes/v3-directory/tests/pdfMdMappingWp0.mjs "/path/to/Bufett’s Alpha"
 * It opens no server, creates no sidecar, and writes no input files.
 */
import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { getDocument } from "../../v2/node_modules/pdfjs-dist/legacy/build/pdf.mjs";

const caseRoot=process.argv[2]||process.env.OCR2MD_PDF_MD_CASE_ROOT;
if(!caseRoot){
  console.error('Usage: node ui-spikes/v3-directory/tests/pdfMdMappingWp0.mjs "<book directory>"');
  process.exit(2);
}
const expected=JSON.parse(await readFile(resolve(dirname(fileURLToPath(import.meta.url)),
  "fixtures/buffett-alpha-wp0.json"),"utf8"));
const checks=[];
function check(name,fn){
  try{fn();checks.push({name,status:"PASS"});}
  catch(error){checks.push({name,status:"FAIL",details:String(error)});}
}
function sortedCounts(items){
  return Object.fromEntries([...new Set(items)].sort().map(key=>[key,items.filter(x=>x===key).length]));
}
function sha256(bytes){return createHash("sha256").update(bytes).digest("hex");}

const files={};
for(const [name,info] of Object.entries(expected.inputs)){
  const absolute=resolve(caseRoot,info.relativePath);
  const buffer=await readFile(absolute);
  files[name]={absolute,buffer,sha256:sha256(buffer)};
  check(`input/${name}/size-and-sha256`,()=>{
    assert.equal(buffer.byteLength,info.bytes);
    assert.equal(files[name].sha256,info.sha256);
  });
}
const mineru=JSON.parse(files.json.buffer.toString("utf8"));
check("metadata",()=>{
  assert.equal(mineru._backend,expected.metadata.backend);
  assert.equal(mineru._version_name,expected.metadata.mineruVersion);
  assert.equal(mineru._ocr_enable,expected.metadata.ocrEnabled);
});
const pages=mineru.pdf_info;
check("json/pages-and-indices",()=>{
  assert.equal(pages.length,expected.pages);
  assert.equal(pages[0].page_idx,expected.firstPageIdx);
  assert.equal(pages.at(-1).page_idx,expected.lastPageIdx);
  pages.forEach((p,i)=>assert.equal(p.page_idx,i));
});
const allBody=pages.flatMap(p=>p.para_blocks);
const allDiscarded=pages.flatMap(p=>p.discarded_blocks);
check("json/element-totals-and-types",()=>{
  assert.equal(allBody.length,expected.paragraphBlocks);
  assert.equal(allDiscarded.length,expected.discardedBlocks);
  assert.deepEqual(sortedCounts(allBody.map(b=>b.type)),sortedCounts(Object.entries(expected.bodyTypes).flatMap(([key,count])=>Array(count).fill(key))));
  assert.deepEqual(sortedCounts(allDiscarded.map(b=>b.type)),sortedCounts(Object.entries(expected.discardedTypes).flatMap(([key,count])=>Array(count).fill(key))));
});
check("json/line-and-span-counts",()=>{
  const lines=allBody.flatMap(b=>b.lines||[]);
  assert.equal(lines.length,expected.bodyLines);
  assert.equal(lines.reduce((sum,line)=>sum+(line.spans||[]).length,0),expected.bodySpans);
});
check("json/315-bbox-integrity",()=>{
  let scanned=0;
  for(const pg of pages){
    const [w,h]=pg.page_size;
    assert.ok(Number.isFinite(w)&&w>0&&Number.isFinite(h)&&h>0);
    for(const collection of ["para_blocks","discarded_blocks"]){
      for(const block of pg[collection]){
        const b=block.bbox;
        assert.ok(Array.isArray(b)&&b.length===4,`page${pg.page_idx} ${collection} missing bbox`);
        assert.ok(b.every(Number.isFinite),`page${pg.page_idx} bbox must be finite`);
        assert.ok(0<=b[0]&&b[0]<=b[2]&&b[2]<=w&&0<=b[1]&&b[1]<=b[3]&&b[3]<=h,
          `page${pg.page_idx} ${collection}: bbox out of page`);
        scanned++;
      }
    }
  }
  assert.equal(scanned,expected.paragraphBlocks+expected.discardedBlocks);
});
check("json/fixed-element-examples",()=>{
  for(const example of expected.elementExamples){
    const b=pages[example.page-1][example.collection][example.position];
    assert.equal(b.type,example.type);
    assert.deepEqual(b.bbox,example.bbox);
  }
});
for(const [page,size] of Object.entries(expected.pageSizeExamples)){
  check(`json/page-size/${page}`,()=>assert.deepEqual(pages[Number(page)-1].page_size,size));
}
const pdfTask=getDocument({
  data:new Uint8Array(files.pdf.buffer),
  useSystemFonts:true,
  disableFontFace:true,
});
try{
  const pdf=await pdfTask.promise;
  check("pdf/number-of-pages",()=>assert.equal(pdf.numPages,expected.pages));
  const rotated=[];
  for(let n=1;n<=pdf.numPages;n++){
    const page=await pdf.getPage(n);
    const {width,height}=page.getViewport({scale:1});
    const [w,h]=pages[n-1].page_size;
    check(`pdf-json/visible-page-size/${n}`,()=>{
      assert.ok(Math.abs(width-w)<=1 && Math.abs(height-h)<=1,
        `PDF.js viewport ${width}x${height} differs from JSON ${w}x${h}`);
    });
    if(page.rotate%360!==0)rotated.push(n);
  }
  check("pdf/rotated-pages",()=>assert.deepEqual(rotated,expected.rotatedPdfPages));
}finally{await pdfTask.destroy();}
const chapter=resolve(caseRoot,"chapters/01 Buffett’s Alpha/01 Buffett’s Alpha");
const chapterMd=await stat(chapter+".md");
const workingMd=await stat(chapter+".working.md");
const report={
  caseId:expected.caseId,
  readOnly:true,
  inputsVerified:["pdf","json","md"],
  pageCount:expected.pages,bodyElements:allBody.length,discardedElements:allDiscarded.length,
  chapterExample:{sourceBytes:chapterMd.size,workingBytes:workingMd.size,unchangedAssumptionAllowed:false},
  passed:checks.filter(x=>x.status==="PASS").length,
  failed:checks.filter(x=>x.status==="FAIL").length,
  failures:checks.filter(x=>x.status==="FAIL"),
};
console.log(JSON.stringify(report,null,2));
if(report.failed)process.exitCode=1;
